CREATE TABLE public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('distributor','csa','ba')),
  stock_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id),
  distributor_id uuid REFERENCES public.distributors(id),
  csa_id uuid REFERENCES public.csas(id),
  ba_id uuid,
  batch_no text,
  current_qty integer NOT NULL,
  new_qty integer NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by uuid NOT NULL DEFAULT auth.uid(),
  reviewed_by uuid,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.stock_adjustments TO authenticated;
GRANT ALL ON public.stock_adjustments TO service_role;

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own adjustment requests"
ON public.stock_adjustments FOR INSERT TO authenticated
WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Users can view their own adjustment requests"
ON public.stock_adjustments FOR SELECT TO authenticated
USING (requested_by = auth.uid());

CREATE POLICY "Admins can view all adjustment requests"
ON public.stock_adjustments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_stock_adjustments_updated_at
BEFORE UPDATE ON public.stock_adjustments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.review_stock_adjustment(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS public.stock_adjustments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.stock_adjustments;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only admins can review stock adjustments';
  END IF;

  SELECT * INTO _row FROM public.stock_adjustments WHERE id = _id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Adjustment request not found'; END IF;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'Request already reviewed'; END IF;

  IF _approve THEN
    IF _row.scope = 'distributor' THEN
      UPDATE public.distributor_stock SET physical_qty = _row.new_qty, updated_at = now() WHERE id = _row.stock_id;
    ELSIF _row.scope = 'csa' THEN
      UPDATE public.csa_stock SET physical_qty = _row.new_qty, updated_at = now() WHERE id = _row.stock_id;
    ELSE
      UPDATE public.ba_stock SET qty = _row.new_qty, updated_at = now() WHERE id = _row.stock_id;
    END IF;
  END IF;

  UPDATE public.stock_adjustments
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = auth.uid(),
      review_note = _note,
      reviewed_at = now()
  WHERE id = _id
  RETURNING * INTO _row;

  RETURN _row;
END; $$;

GRANT EXECUTE ON FUNCTION public.review_stock_adjustment(uuid, boolean, text) TO authenticated;