ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'depot';
ALTER TYPE public.order_kind ADD VALUE IF NOT EXISTS 'depot';

CREATE TABLE IF NOT EXISTS public.depots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  state text,
  gstin text,
  email text,
  phone text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.depots TO authenticated;
GRANT ALL ON public.depots TO service_role;
ALTER TABLE public.depots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read depots" ON public.depots FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin depots" ON public.depots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER depots_set_updated_at BEFORE UPDATE ON public.depots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.depot_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  depot_id uuid NOT NULL REFERENCES public.depots(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  physical_qty integer NOT NULL DEFAULT 0,
  reserved_qty integer NOT NULL DEFAULT 0,
  batch_no text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (depot_id, product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.depot_stock TO authenticated;
GRANT ALL ON public.depot_stock TO service_role;
ALTER TABLE public.depot_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read dstock" ON public.depot_stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff insert dstock" ON public.depot_stock FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "staff update dstock" ON public.depot_stock FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER depot_stock_set_updated_at BEFORE UPDATE ON public.depot_stock
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.csas ADD COLUMN IF NOT EXISTS depot_id uuid REFERENCES public.depots(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS depot_id uuid REFERENCES public.depots(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS depot_id uuid REFERENCES public.depots(id) ON DELETE SET NULL;