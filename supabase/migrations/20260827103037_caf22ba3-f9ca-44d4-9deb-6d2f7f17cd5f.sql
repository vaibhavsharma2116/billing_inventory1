CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  distributor_id uuid NOT NULL REFERENCES public.distributors(id),
  csa_id uuid REFERENCES public.csas(id),
  transporter_name text NOT NULL,
  lr_no text NOT NULL,
  transporter_mobile text,
  vehicle_no text,
  dispatch_date date NOT NULL DEFAULT current_date,
  remarks text,
  status text NOT NULL DEFAULT 'in_transit',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  received_by uuid,
  received_at timestamptz,
  receive_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view deliveries"
ON public.deliveries FOR SELECT TO authenticated USING (true);

CREATE POLICY "CSA or admin can create deliveries"
ON public.deliveries FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'csa') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "CSA or admin can edit in-transit deliveries"
ON public.deliveries FOR UPDATE TO authenticated
USING ((public.has_role(auth.uid(), 'csa') OR public.has_role(auth.uid(), 'super_admin')) AND status = 'in_transit')
WITH CHECK (public.has_role(auth.uid(), 'csa') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_deliveries_updated_at
BEFORE UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
    END LOOP;
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