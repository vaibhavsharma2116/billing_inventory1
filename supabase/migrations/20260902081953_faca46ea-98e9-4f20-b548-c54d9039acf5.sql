CREATE TABLE public.barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  barcode_no text NOT NULL,
  product_allotted text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.barcodes TO authenticated;
GRANT ALL ON public.barcodes TO service_role;

ALTER TABLE public.barcodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own or managed barcodes readable"
ON public.barcodes FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.can_manage_office_user(created_by)
  OR public.is_hr_admin(auth.uid())
);

CREATE POLICY "Employees insert own barcodes"
ON public.barcodes FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Own or managed barcodes editable"
ON public.barcodes FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.can_manage_office_user(created_by))
WITH CHECK (created_by = auth.uid() OR public.can_manage_office_user(created_by));

CREATE TRIGGER barcodes_set_updated_at
BEFORE UPDATE ON public.barcodes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();