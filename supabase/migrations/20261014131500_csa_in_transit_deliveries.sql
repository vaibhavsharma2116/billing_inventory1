-- Support CSA deliveries from Master Depot
-- Allow distributor_id to be NULL when goods are dispatched from Master Depot to CSA
ALTER TABLE public.deliveries ALTER COLUMN distributor_id DROP NOT NULL;

-- Allow depot staff and managers to create and update deliveries
DROP POLICY IF EXISTS "CSA or admin can create deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "CSA or depot or admin can create deliveries" ON public.deliveries;
CREATE POLICY "CSA or depot or admin can create deliveries"
ON public.deliveries FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'csa') 
  OR public.has_role(auth.uid(), 'depot') 
  OR public.has_role(auth.uid(), 'super_admin') 
  OR public.is_manager_role(auth.uid())
);

DROP POLICY IF EXISTS "CSA or admin can edit in-transit deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Staff can edit in-transit deliveries" ON public.deliveries;
CREATE POLICY "Staff can edit in-transit deliveries"
ON public.deliveries FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(), 'csa') 
   OR public.has_role(auth.uid(), 'depot') 
   OR public.has_role(auth.uid(), 'super_admin') 
   OR public.is_manager_role(auth.uid())) 
  AND status = 'in_transit'
)
WITH CHECK (
  public.has_role(auth.uid(), 'csa') 
  OR public.has_role(auth.uid(), 'depot') 
  OR public.has_role(auth.uid(), 'super_admin') 
  OR public.is_manager_role(auth.uid())
);

-- Update receive_delivery function to support both Distributor and CSA recipients
CREATE OR REPLACE FUNCTION public.receive_delivery(_id uuid, _accept boolean, _note text DEFAULT NULL)
RETURNS public.deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.deliveries;
  _allowed boolean;
  _item record;
BEGIN
  SELECT * INTO _row FROM public.deliveries WHERE id = _id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Delivery not found'; END IF;
  IF _row.status <> 'in_transit' THEN RAISE EXCEPTION 'Delivery already processed'; END IF;

  IF _row.distributor_id IS NOT NULL THEN
    -- Distributor receiving stock from CSA
    SELECT public.has_role(auth.uid(), 'super_admin')
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.distributor_id = _row.distributor_id
        )
    INTO _allowed;
    IF NOT _allowed THEN RAISE EXCEPTION 'Only the receiving distributor can confirm this delivery'; END IF;

    IF _accept THEN
      FOR _item IN
        SELECT product_id, SUM(qty + COALESCE(free_qty, 0)) AS qty
        FROM public.order_items WHERE order_id = _row.order_id GROUP BY product_id
      LOOP
        UPDATE public.distributor_stock
        SET reserved_qty = GREATEST(reserved_qty - _item.qty, 0), updated_at = now()
        WHERE distributor_id = _row.distributor_id AND product_id = _item.product_id;
      END LOOP;
      UPDATE public.orders SET status = 'delivered' WHERE id = _row.order_id;
    ELSE
      FOR _item IN
        SELECT product_id, SUM(qty + COALESCE(free_qty, 0)) AS qty
        FROM public.order_items WHERE order_id = _row.order_id GROUP BY product_id
      LOOP
        UPDATE public.distributor_stock
        SET physical_qty = GREATEST(physical_qty - _item.qty, 0),
            reserved_qty = GREATEST(reserved_qty - _item.qty, 0),
            updated_at = now()
        WHERE distributor_id = _row.distributor_id AND product_id = _item.product_id;

        -- Return stock back to CSA if order was from CSA
        IF _row.csa_id IS NOT NULL THEN
          UPDATE public.csa_stock
          SET physical_qty = physical_qty + _item.qty,
              updated_at = now()
          WHERE csa_id = _row.csa_id AND product_id = _item.product_id;
        END IF;
      END LOOP;
      UPDATE public.orders SET status = 'rejected' WHERE id = _row.order_id;
    END IF;

  ELSIF _row.csa_id IS NOT NULL THEN
    -- CSA receiving stock from Master Depot
    SELECT public.has_role(auth.uid(), 'super_admin')
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.csa_id = _row.csa_id
        )
    INTO _allowed;
    IF NOT _allowed THEN RAISE EXCEPTION 'Only the receiving CSA can confirm this delivery'; END IF;

    IF _accept THEN
      FOR _item IN
        SELECT product_id, SUM(qty + COALESCE(free_qty, 0)) AS qty
        FROM public.order_items WHERE order_id = _row.order_id GROUP BY product_id
      LOOP
        UPDATE public.csa_stock
        SET reserved_qty = GREATEST(reserved_qty - _item.qty, 0), updated_at = now()
        WHERE csa_id = _row.csa_id AND product_id = _item.product_id;
      END LOOP;
      UPDATE public.orders SET status = 'delivered' WHERE id = _row.order_id;
    ELSE
      FOR _item IN
        SELECT product_id, SUM(qty + COALESCE(free_qty, 0)) AS qty
        FROM public.order_items WHERE order_id = _row.order_id GROUP BY product_id
      LOOP
        UPDATE public.csa_stock
        SET physical_qty = GREATEST(physical_qty - _item.qty, 0),
            reserved_qty = GREATEST(reserved_qty - _item.qty, 0),
            updated_at = now()
        WHERE csa_id = _row.csa_id AND product_id = _item.product_id;
      END LOOP;
      UPDATE public.orders SET status = 'rejected' WHERE id = _row.order_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid delivery recipient';
  END IF;

  UPDATE public.deliveries
  SET status = CASE WHEN _accept THEN 'received' ELSE 'rejected' END,
      received_by = auth.uid(),
      received_at = now(),
      receive_note = NULLIF(_note, '')
  WHERE id = _id
  RETURNING * INTO _row;

  RETURN _row;
END; $$;
