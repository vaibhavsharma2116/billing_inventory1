ALTER TYPE public.order_kind ADD VALUE IF NOT EXISTS 'company';

CREATE TABLE IF NOT EXISTS public.company_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  physical_qty integer NOT NULL DEFAULT 0,
  reserved_qty integer NOT NULL DEFAULT 0,
  batch_no text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);

GRANT SELECT, INSERT, UPDATE ON public.company_stock TO authenticated;
GRANT ALL ON public.company_stock TO service_role;

ALTER TABLE public.company_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view company stock"
  ON public.company_stock FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage company stock insert"
  ON public.company_stock FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins manage company stock update"
  ON public.company_stock FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER company_stock_set_updated_at
  BEFORE UPDATE ON public.company_stock
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();