CREATE TABLE public.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid REFERENCES public.retailers(id),
  distributor_id uuid REFERENCES public.distributors(id),
  extra_margin numeric NOT NULL DEFAULT 0,
  display_amount numeric NOT NULL DEFAULT 0,
  claim_amount numeric GENERATED ALWAYS AS (extra_margin + display_amount) STORED,
  invoice_path text,
  invoice_no text,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  approved_amount numeric,
  review_note text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.claims TO authenticated;
GRANT ALL ON public.claims TO service_role;

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "claims select own or admin" ON public.claims FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "claims insert own" ON public.claims FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "claims update admin" ON public.claims FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER claims_set_updated_at BEFORE UPDATE ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "claim invoices select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'claim-invoices' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'super_admin')));
CREATE POLICY "claim invoices insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'claim-invoices' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.review_claim(_id uuid, _approve boolean, _amount numeric, _note text)
RETURNS public.claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.claims;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only admin can review claims';
  END IF;

  SELECT * INTO rec FROM public.claims WHERE id = _id FOR UPDATE;
  IF rec IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;
  IF rec.status <> 'pending' THEN RAISE EXCEPTION 'Claim already reviewed'; END IF;

  UPDATE public.claims
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         approved_amount = CASE WHEN _approve THEN COALESCE(_amount, rec.claim_amount) ELSE 0 END,
         review_note = NULLIF(btrim(coalesce(_note, '')), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   WHERE id = _id
   RETURNING * INTO rec;

  RETURN rec;
END;
$$;