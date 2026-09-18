ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ba';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS retailer_id uuid REFERENCES public.retailers(id);

CREATE TABLE public.ba_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ba_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  retailer_id uuid REFERENCES public.retailers(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ba_id, product_id)
);
GRANT SELECT, INSERT, UPDATE ON public.ba_stock TO authenticated;
GRANT ALL ON public.ba_stock TO service_role;
ALTER TABLE public.ba_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ba_stock own read" ON public.ba_stock FOR SELECT TO authenticated
  USING (auth.uid() = ba_id OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ba_stock own insert" ON public.ba_stock FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = ba_id OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ba_stock own update" ON public.ba_stock FOR UPDATE TO authenticated
  USING (auth.uid() = ba_id OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (auth.uid() = ba_id OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER update_ba_stock_updated_at BEFORE UPDATE ON public.ba_stock
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ba_stock_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ba_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  retailer_id uuid REFERENCES public.retailers(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  kind text NOT NULL DEFAULT 'purchase',
  qty integer NOT NULL,
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ba_stock_moves TO authenticated;
GRANT ALL ON public.ba_stock_moves TO service_role;
ALTER TABLE public.ba_stock_moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ba_moves own read" ON public.ba_stock_moves FOR SELECT TO authenticated
  USING (auth.uid() = ba_id OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ba_moves own insert" ON public.ba_stock_moves FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = ba_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.ba_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ba_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  retailer_id uuid REFERENCES public.retailers(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  qty integer NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ba_sales TO authenticated;
GRANT ALL ON public.ba_sales TO service_role;
ALTER TABLE public.ba_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ba_sales own read" ON public.ba_sales FOR SELECT TO authenticated
  USING (auth.uid() = ba_id OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ba_sales own insert" ON public.ba_sales FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = ba_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX ba_sales_ba_date_idx ON public.ba_sales (ba_id, sale_date);
CREATE INDEX ba_moves_ba_idx ON public.ba_stock_moves (ba_id, created_at);