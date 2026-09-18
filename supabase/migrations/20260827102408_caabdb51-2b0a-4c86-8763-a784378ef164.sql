CREATE TABLE public.csa_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id uuid NOT NULL REFERENCES public.distributors(id),
  csa_id uuid NOT NULL REFERENCES public.csas(id),
  amount numeric NOT NULL CHECK (amount > 0),
  mode text NOT NULL DEFAULT 'Cash',
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_role text NOT NULL DEFAULT 'distributor',
  approved_by uuid,
  approval_note text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.csa_payments TO authenticated;
GRANT ALL ON public.csa_payments TO service_role;

ALTER TABLE public.csa_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view payments"
ON public.csa_payments FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Distributors and CSAs can create payments"
ON public.csa_payments FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'distributor')
    OR public.has_role(auth.uid(), 'csa')
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

CREATE TRIGGER update_csa_payments_updated_at
BEFORE UPDATE ON public.csa_payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.review_csa_payment(_id uuid, _approve boolean, _note text DEFAULT '')
RETURNS public.csa_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.csa_payments;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'csa') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Only CSA or admin can review payments';
  END IF;

  SELECT * INTO _row FROM public.csa_payments WHERE id = _id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'Payment already reviewed'; END IF;

  IF _approve THEN
    UPDATE public.distributors
    SET outstanding = GREATEST(outstanding - _row.amount, 0)
    WHERE id = _row.distributor_id;
  END IF;

  UPDATE public.csa_payments
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      approved_by = auth.uid(),
      approval_note = NULLIF(_note, ''),
      approved_at = now()
  WHERE id = _id
  RETURNING * INTO _row;

  RETURN _row;
END; $$;

REVOKE EXECUTE ON FUNCTION public.review_csa_payment(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_csa_payment(uuid, boolean, text) TO authenticated;