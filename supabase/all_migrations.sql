CREATE TYPE public.app_role AS ENUM ('super_admin','csa','distributor','salesman');
CREATE TYPE public.order_status AS ENUM ('pending','accepted','invoiced','dispatched','delivered','rejected');
CREATE TYPE public.order_kind AS ENUM ('secondary','primary');

CREATE TABLE public.csas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, city text, state text, gstin text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.distributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, city text, state text, gstin text,
  csa_id uuid REFERENCES public.csas(id) ON DELETE SET NULL,
  outstanding numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text, employee_code text, designation text,
  distributor_id uuid REFERENCES public.distributors(id) ON DELETE SET NULL,
  csa_id uuid REFERENCES public.csas(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE, name text NOT NULL, category text,
  hsn text, mrp numeric NOT NULL DEFAULT 0, ptr numeric NOT NULL DEFAULT 0,
  pts numeric NOT NULL DEFAULT 0, gst_rate numeric NOT NULL DEFAULT 18,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.retailers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, owner_name text, phone text, address text, city text,
  lat numeric, lng numeric, gstin text,
  distributor_id uuid REFERENCES public.distributors(id) ON DELETE SET NULL,
  credit_limit numeric NOT NULL DEFAULT 0,
  outstanding numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.distributor_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  physical_qty integer NOT NULL DEFAULT 0,
  reserved_qty integer NOT NULL DEFAULT 0,
  batch_no text, expiry_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (distributor_id, product_id)
);
CREATE TABLE public.csa_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  csa_id uuid NOT NULL REFERENCES public.csas(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  physical_qty integer NOT NULL DEFAULT 0,
  reserved_qty integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (csa_id, product_id)
);
CREATE TABLE public.schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, description text, product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  min_qty integer, free_qty integer, min_value numeric, discount_pct numeric,
  active boolean NOT NULL DEFAULT true,
  valid_till date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE public.order_no_seq START 1001;
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL DEFAULT ('SO-' || nextval('public.order_no_seq')),
  kind public.order_kind NOT NULL DEFAULT 'secondary',
  status public.order_status NOT NULL DEFAULT 'pending',
  retailer_id uuid REFERENCES public.retailers(id) ON DELETE SET NULL,
  distributor_id uuid REFERENCES public.distributors(id) ON DELETE SET NULL,
  csa_id uuid REFERENCES public.csas(id) ON DELETE SET NULL,
  salesman_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty integer NOT NULL DEFAULT 1,
  free_qty integer NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0
);
CREATE SEQUENCE public.invoice_no_seq START 5001;
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL DEFAULT ('INV-' || nextval('public.invoice_no_seq')),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  taxable_value numeric NOT NULL DEFAULT 0,
  cgst numeric NOT NULL DEFAULT 0,
  sgst numeric NOT NULL DEFAULT 0,
  igst numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  punch_in timestamptz, punch_out timestamptz,
  lat numeric, lng numeric, location_label text,
  UNIQUE (user_id, work_date)
);
CREATE TABLE public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesman_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  retailer_id uuid NOT NULL REFERENCES public.retailers(id) ON DELETE CASCADE,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  productive boolean NOT NULL DEFAULT false,
  notes text
);
CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid REFERENCES public.retailers(id) ON DELETE SET NULL,
  salesman_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  mode text NOT NULL DEFAULT 'cash',
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  target_amount numeric NOT NULL DEFAULT 0,
  visits_target integer NOT NULL DEFAULT 0,
  UNIQUE (user_id, period_month)
);
CREATE TABLE public.leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_type text NOT NULL DEFAULT 'casual',
  from_date date NOT NULL, to_date date NOT NULL,
  reason text, status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.csas, public.distributors, public.profiles, public.products, public.retailers, public.distributor_stock, public.csa_stock, public.schemes, public.orders, public.order_items, public.invoices, public.attendance, public.visits, public.collections, public.targets, public.leaves TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.csas, public.distributors, public.profiles, public.user_roles, public.products, public.retailers, public.distributor_stock, public.csa_stock, public.schemes, public.orders, public.order_items, public.invoices, public.attendance, public.visits, public.collections, public.targets, public.leaves TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.order_no_seq, public.invoice_no_seq TO authenticated, service_role;

ALTER TABLE public.csas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributor_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csa_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, designation)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.raw_user_meta_data->>'phone', NEW.raw_user_meta_data->>'designation');
  BEGIN
    _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'salesman');
  EXCEPTION WHEN others THEN _role := 'salesman';
  END;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Shared read for signed-in staff
CREATE POLICY "staff read csas" ON public.csas FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read distributors" ON public.distributors FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read retailers" ON public.retailers FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read dstock" ON public.distributor_stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read cstock" ON public.csa_stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read schemes" ON public.schemes FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read orders" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read order items" ON public.order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read visits" ON public.visits FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read collections" ON public.collections FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read attendance" ON public.attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read targets" ON public.targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read leaves" ON public.leaves FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

-- Profile self edit
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'super_admin')) WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

-- Operational writes by staff
CREATE POLICY "staff create retailers" ON public.retailers FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "staff update retailers" ON public.retailers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "staff create orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (salesman_id = auth.uid() OR salesman_id IS NULL);
CREATE POLICY "staff update orders" ON public.orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "staff create order items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "staff create invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "staff update dstock" ON public.distributor_stock FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "staff insert dstock" ON public.distributor_stock FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "staff update cstock" ON public.csa_stock FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "staff insert cstock" ON public.csa_stock FOR INSERT TO authenticated WITH CHECK (true);

-- Personal records
CREATE POLICY "own visits" ON public.visits FOR INSERT TO authenticated WITH CHECK (salesman_id = auth.uid());
CREATE POLICY "own collections" ON public.collections FOR INSERT TO authenticated WITH CHECK (salesman_id = auth.uid());
CREATE POLICY "own attendance insert" ON public.attendance FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own attendance update" ON public.attendance FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own leaves insert" ON public.leaves FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "leaves update" ON public.leaves FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin')) WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

-- Admin manage masters
CREATE POLICY "admin csas" ON public.csas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin distributors" ON public.distributors FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin schemes" ON public.schemes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin targets" ON public.targets FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Demo data
INSERT INTO public.csas (id, name, city, state, gstin) VALUES
 ('11111111-1111-1111-1111-111111111111','POPPiK North CSA','Delhi','Delhi','07AABCP1234A1Z5'),
 ('11111111-1111-1111-1111-111111111112','POPPiK West CSA','Mumbai','Maharashtra','27AABCP1234A1Z9');

INSERT INTO public.distributors (id, name, city, state, gstin, csa_id, outstanding) VALUES
 ('22222222-2222-2222-2222-222222222221','ABC Cosmetics Delhi','Delhi','Delhi','07AAACA1111B1Z1','11111111-1111-1111-1111-111111111111',780000),
 ('22222222-2222-2222-2222-222222222222','Glow Traders Gurgaon','Gurgaon','Haryana','06AAACG2222C1Z2','11111111-1111-1111-1111-111111111111',345000),
 ('22222222-2222-2222-2222-222222222223','Shine Agencies Mumbai','Mumbai','Maharashtra','27AAACS3333D1Z3','11111111-1111-1111-1111-111111111112',512000);

INSERT INTO public.products (id, sku, name, category, hsn, mrp, ptr, pts) VALUES
 ('33333333-3333-3333-3333-333333333331','PPK-LIP-01','Matte Lipstick Ruby','Lips','3304',499,375,340),
 ('33333333-3333-3333-3333-333333333332','PPK-FND-02','HD Foundation Ivory','Face','3304',899,670,610),
 ('33333333-3333-3333-3333-333333333333','PPK-PRM-03','Blur Primer','Face','3304',699,520,475),
 ('33333333-3333-3333-3333-333333333334','PPK-PLM-04','Lip Plumper Gloss','Lips','3304',399,300,272),
 ('33333333-3333-3333-3333-333333333335','PPK-KAJ-05','Intense Kajal','Eyes','3304',199,148,134),
 ('33333333-3333-3333-3333-333333333336','PPK-MAS-06','Volume Mascara','Eyes','3304',549,410,372);

INSERT INTO public.retailers (id, name, owner_name, phone, address, city, lat, lng, gstin, distributor_id, credit_limit, outstanding) VALUES
 ('44444444-4444-4444-4444-444444444441','Beauty Palace','Ritu Sharma','9810011111','12 Karol Bagh Main Rd','Delhi',28.6519,77.1909,'07AAAAB1111A1Z1','22222222-2222-2222-2222-222222222221',100000,42500),
 ('44444444-4444-4444-4444-444444444442','Glamour Store','Amit Verma','9810022222','5 Rajouri Garden','Delhi',28.6469,77.1200,'07AAAAG2222A1Z2','22222222-2222-2222-2222-222222222221',75000,18300),
 ('44444444-4444-4444-4444-444444444443','Style Hub','Neha Gupta','9810033333','Sector 14 Market','Gurgaon',28.4700,77.0300,'06AAAAS3333A1Z3','22222222-2222-2222-2222-222222222222',60000,9400),
 ('44444444-4444-4444-4444-444444444444','Cosmo Corner','Sunil Rao','9820044444','Andheri West','Mumbai',19.1360,72.8260,'27AAAAC4444A1Z4','22222222-2222-2222-2222-222222222223',120000,66200);

INSERT INTO public.distributor_stock (distributor_id, product_id, physical_qty, reserved_qty, batch_no, expiry_date)
SELECT d.id, p.id,
  (ARRAY[124,52,38,0,210,74])[row_number() OVER (PARTITION BY d.id ORDER BY p.sku)],
  (ARRAY[20,20,30,0,10,4])[row_number() OVER (PARTITION BY d.id ORDER BY p.sku)],
  'B-2026-' || substr(p.sku,5,3), DATE '2027-06-30'
FROM public.distributors d CROSS JOIN public.products p;

INSERT INTO public.csa_stock (csa_id, product_id, physical_qty, reserved_qty)
SELECT c.id, p.id, 1200, 150 FROM public.csas c CROSS JOIN public.products p;

INSERT INTO public.schemes (title, description, product_id, min_qty, free_qty, min_value, discount_pct, valid_till) VALUES
 ('Lipstick 12+2','Buy 12 Matte Lipsticks get 2 free','33333333-3333-3333-3333-333333333331',12,2,NULL,NULL,DATE '2026-12-31'),
 ('Buy 10 Get 1 Kajal','Buy 10 Intense Kajal get 1 free','33333333-3333-3333-3333-333333333335',10,1,NULL,NULL,DATE '2026-12-31'),
 ('Value Scheme 5%','Order above Rs 25,000 get 5% discount',NULL,NULL,NULL,25000,5,DATE '2026-12-31');

INSERT INTO public.orders (id, order_no, kind, status, retailer_id, distributor_id, total_amount) VALUES
 ('55555555-5555-5555-5555-555555555551','SO-1001','secondary','pending','44444444-4444-4444-4444-444444444441','22222222-2222-2222-2222-222222222221',28450),
 ('55555555-5555-5555-5555-555555555552','SO-1002','secondary','accepted','44444444-4444-4444-4444-444444444442','22222222-2222-2222-2222-222222222221',15600),
 ('55555555-5555-5555-5555-555555555553','SO-1003','secondary','delivered','44444444-4444-4444-4444-444444444443','22222222-2222-2222-2222-222222222222',9200);

INSERT INTO public.order_items (order_id, product_id, qty, free_qty, rate, amount) VALUES
 ('55555555-5555-5555-5555-555555555551','33333333-3333-3333-3333-333333333331',60,10,375,22500),
 ('55555555-5555-5555-5555-555555555551','33333333-3333-3333-3333-333333333335',40,4,148,5920),
 ('55555555-5555-5555-5555-555555555552','33333333-3333-3333-3333-333333333332',20,0,670,13400),
 ('55555555-5555-5555-5555-555555555553','33333333-3333-3333-3333-333333333333',18,0,520,9360);
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  kind text NOT NULL DEFAULT 'ta_da',
  distance_km numeric NOT NULL DEFAULT 0,
  ta_amount numeric NOT NULL DEFAULT 0,
  da_amount numeric NOT NULL DEFAULT 0,
  bill_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric GENERATED ALWAYS AS (ta_amount + da_amount + bill_amount) STORED,
  route text,
  vendor text,
  notes text,
  receipt_path text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own expenses insert" ON public.expenses FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff read expenses" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "own pending expenses update" ON public.expenses FOR UPDATE TO authenticated
  USING ((user_id = auth.uid() AND status = 'pending') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "own pending expenses delete" ON public.expenses FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');

CREATE INDEX expenses_user_date_idx ON public.expenses (user_id, expense_date DESC);

CREATE POLICY "own receipts read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'super_admin')));
CREATE POLICY "own receipts insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own receipts update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own receipts delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS retailer_type text NOT NULL DEFAULT 'no_ba';
CREATE TABLE public.location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  accuracy numeric,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX location_pings_user_date_idx ON public.location_pings (user_id, work_date, recorded_at DESC);
GRANT SELECT, INSERT ON public.location_pings TO authenticated;
GRANT ALL ON public.location_pings TO service_role;
ALTER TABLE public.location_pings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own location pings insert" ON public.location_pings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff read location pings" ON public.location_pings FOR SELECT TO authenticated USING (true);
CREATE TABLE public.salary_structures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  basic numeric NOT NULL DEFAULT 0,
  hra numeric NOT NULL DEFAULT 0,
  conveyance numeric NOT NULL DEFAULT 0,
  other_allowance numeric NOT NULL DEFAULT 0,
  deductions numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT date_trunc('month', now())::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, effective_from)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_structures TO authenticated;
GRANT ALL ON public.salary_structures TO service_role;

ALTER TABLE public.salary_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read salary structures" ON public.salary_structures
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins insert salary structures" ON public.salary_structures
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "admins update salary structures" ON public.salary_structures
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_salary_structures_updated_at
  BEFORE UPDATE ON public.salary_structures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.salary_structures (user_id, basic, hra, conveyance, other_allowance, deductions)
SELECT ur.user_id, 18000, 7200, 2500, 2000, 1800
FROM public.user_roles ur
WHERE ur.role = 'salesman'
ON CONFLICT DO NOTHING;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM authenticated, anon, public;
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
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role public.app_role;
  _shop text;
  _retailer_id uuid;
BEGIN
  BEGIN
    _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'salesman');
  EXCEPTION WHEN others THEN _role := 'salesman';
  END;

  _shop := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'shop_name','')), '');

  IF _shop IS NOT NULL THEN
    SELECT id INTO _retailer_id FROM public.retailers WHERE lower(name) = lower(_shop) LIMIT 1;
    IF _retailer_id IS NULL THEN
      INSERT INTO public.retailers (name, retailer_type, created_by)
      VALUES (_shop, CASE WHEN _role = 'ba' THEN 'ba' ELSE 'no_ba' END, NEW.id)
      RETURNING id INTO _retailer_id;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, designation, retailer_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.raw_user_meta_data->>'phone', NEW.raw_user_meta_data->>'designation', _retailer_id);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon, public;
ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS email text, ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS email text, ADD COLUMN IF NOT EXISTS phone text, ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.csas ADD COLUMN IF NOT EXISTS email text, ADD COLUMN IF NOT EXISTS phone text, ADD COLUMN IF NOT EXISTS address text;
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
REVOKE EXECUTE ON FUNCTION public.review_stock_adjustment(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_stock_adjustment(uuid, boolean, text) TO authenticated;
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
REVOKE EXECUTE ON FUNCTION public.receive_delivery(uuid, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.receive_delivery(uuid, boolean, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.review_csa_payment(uuid, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.review_csa_payment(uuid, boolean, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.review_stock_adjustment(uuid, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.review_stock_adjustment(uuid, boolean, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
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
CREATE POLICY "staff create depots" ON public.depots FOR INSERT TO authenticated WITH CHECK (true);
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
CREATE TABLE public.manager_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  distributor_id uuid REFERENCES public.distributors(id) ON DELETE CASCADE,
  csa_id uuid REFERENCES public.csas(id) ON DELETE CASCADE,
  member_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_assignments TO authenticated;
GRANT ALL ON public.manager_assignments TO service_role;
ALTER TABLE public.manager_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage manager assignments" ON public.manager_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "managers read own assignments" ON public.manager_assignments
  FOR SELECT TO authenticated
  USING (manager_id = auth.uid());

CREATE TRIGGER manager_assignments_set_updated_at BEFORE UPDATE ON public.manager_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.manager_sees_distributor(_dist uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'manager') AND EXISTS (
    SELECT 1 FROM public.manager_assignments m
    WHERE m.manager_id = auth.uid() AND m.distributor_id = _dist
  )
$$;

CREATE OR REPLACE FUNCTION public.manager_sees_csa(_csa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'manager') AND EXISTS (
    SELECT 1 FROM public.manager_assignments m
    WHERE m.manager_id = auth.uid() AND m.csa_id = _csa
  )
$$;

CREATE OR REPLACE FUNCTION public.manager_sees_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'manager') AND EXISTS (
    SELECT 1 FROM public.manager_assignments m
    LEFT JOIN public.profiles p ON p.id = _uid
    WHERE m.manager_id = auth.uid()
      AND (m.member_id = _uid
        OR (m.distributor_id IS NOT NULL AND m.distributor_id = p.distributor_id)
        OR (m.csa_id IS NOT NULL AND m.csa_id = p.csa_id))
  )
$$;

CREATE POLICY "managers read distributors" ON public.distributors FOR SELECT TO authenticated
  USING (public.manager_sees_distributor(id));
CREATE POLICY "managers read csas" ON public.csas FOR SELECT TO authenticated
  USING (public.manager_sees_csa(id));
CREATE POLICY "managers read retailers" ON public.retailers FOR SELECT TO authenticated
  USING (public.manager_sees_distributor(distributor_id) OR public.manager_sees_user(created_by));
CREATE POLICY "managers read orders" ON public.orders FOR SELECT TO authenticated
  USING (public.manager_sees_distributor(distributor_id) OR public.manager_sees_csa(csa_id) OR public.manager_sees_user(salesman_id));
CREATE POLICY "managers read order items" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
    AND (public.manager_sees_distributor(o.distributor_id) OR public.manager_sees_csa(o.csa_id) OR public.manager_sees_user(o.salesman_id))));
CREATE POLICY "managers read invoices" ON public.invoices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
    AND (public.manager_sees_distributor(o.distributor_id) OR public.manager_sees_csa(o.csa_id) OR public.manager_sees_user(o.salesman_id))));
CREATE POLICY "managers read visits" ON public.visits FOR SELECT TO authenticated
  USING (public.manager_sees_user(salesman_id));
CREATE POLICY "managers read collections" ON public.collections FOR SELECT TO authenticated
  USING (public.manager_sees_user(salesman_id));
CREATE POLICY "managers read ba sales" ON public.ba_sales FOR SELECT TO authenticated
  USING (public.manager_sees_user(ba_id));
CREATE POLICY "managers read attendance" ON public.attendance FOR SELECT TO authenticated
  USING (public.manager_sees_user(user_id));
CREATE POLICY "managers read expenses" ON public.expenses FOR SELECT TO authenticated
  USING (public.manager_sees_user(user_id));
CREATE POLICY "managers read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.manager_sees_user(id));
CREATE POLICY "managers read distributor stock" ON public.distributor_stock FOR SELECT TO authenticated
  USING (public.manager_sees_distributor(distributor_id));
CREATE POLICY "managers read csa stock" ON public.csa_stock FOR SELECT TO authenticated
  USING (public.manager_sees_csa(csa_id));
REVOKE EXECUTE ON FUNCTION public.manager_sees_distributor(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.manager_sees_csa(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.manager_sees_user(uuid) FROM anon, authenticated;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role FROM auth.users WHERE email = 'jay@poppik.in'
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id AND u.email = 'jay@poppik.in' AND ur.role = 'salesman';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ase';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'asm';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'business_manager';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS profiles_reports_to_idx ON public.profiles(reports_to);
CREATE OR REPLACE FUNCTION public.is_manager_role(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _uid
      AND r.role IN ('manager','ase','asm','business_manager')
  )
$$;

CREATE OR REPLACE FUNCTION public.manager_scope_users(_manager uuid)
RETURNS TABLE (user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE tree AS (
    SELECT _manager AS id
    UNION
    SELECT p.id FROM public.profiles p JOIN tree t ON p.reports_to = t.id
  )
  SELECT id FROM tree
$$;

CREATE OR REPLACE FUNCTION public.manager_sees_distributor(_dist uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _dist IS NOT NULL AND public.is_manager_role(auth.uid()) AND (
    EXISTS (
      SELECT 1 FROM public.manager_assignments m
      WHERE m.distributor_id = _dist
        AND m.manager_id IN (SELECT user_id FROM public.manager_scope_users(auth.uid()))
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.distributor_id = _dist
        AND p.id IN (SELECT user_id FROM public.manager_scope_users(auth.uid()))
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.manager_sees_csa(_csa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _csa IS NOT NULL AND public.is_manager_role(auth.uid()) AND (
    EXISTS (
      SELECT 1 FROM public.manager_assignments m
      WHERE m.csa_id = _csa
        AND m.manager_id IN (SELECT user_id FROM public.manager_scope_users(auth.uid()))
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.csa_id = _csa
        AND p.id IN (SELECT user_id FROM public.manager_scope_users(auth.uid()))
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.manager_sees_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND public.is_manager_role(auth.uid()) AND (
    _uid IN (SELECT user_id FROM public.manager_scope_users(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.manager_assignments m
      LEFT JOIN public.profiles p ON p.id = _uid
      WHERE m.manager_id IN (SELECT user_id FROM public.manager_scope_users(auth.uid()))
        AND (m.member_id = _uid
          OR (m.distributor_id IS NOT NULL AND m.distributor_id = p.distributor_id)
          OR (m.csa_id IS NOT NULL AND m.csa_id = p.csa_id))
    )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_manager_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.manager_scope_users(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_manager_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_scope_users(uuid) TO authenticated;

CREATE POLICY "managers read ba stock" ON public.ba_stock FOR SELECT TO authenticated
  USING (public.manager_sees_user(ba_id));
CREATE POLICY "managers read leaves" ON public.leaves FOR SELECT TO authenticated
  USING (public.manager_sees_user(user_id));
CREATE POLICY "managers read targets" ON public.targets FOR SELECT TO authenticated
  USING (public.manager_sees_user(user_id));
CREATE POLICY "managers read location pings" ON public.location_pings FOR SELECT TO authenticated
  USING (public.manager_sees_user(user_id));
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS packing_size text,
  ADD COLUMN IF NOT EXISTS csa_rate numeric NOT NULL DEFAULT 0;

UPDATE public.products SET csa_rate = pts WHERE csa_rate = 0;

ALTER TABLE public.retailers
  ADD COLUMN IF NOT EXISTS margin_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS display_amount numeric NOT NULL DEFAULT 0;
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
ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS review_note text;

CREATE OR REPLACE FUNCTION public.review_collection(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS public.collections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _row public.collections;
  _allowed boolean;
BEGIN
  SELECT * INTO _row FROM public.collections WHERE id = _id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Collection not found'; END IF;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'Collection already reviewed'; END IF;

  SELECT public.has_role(auth.uid(), 'super_admin')
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.retailers r ON r.id = _row.retailer_id
        WHERE p.id = auth.uid() AND p.distributor_id IS NOT NULL AND p.distributor_id = r.distributor_id
      )
  INTO _allowed;
  IF NOT _allowed THEN RAISE EXCEPTION 'Only the mapped distributor or admin can review this collection'; END IF;

  IF _approve AND _row.retailer_id IS NOT NULL THEN
    UPDATE public.retailers
    SET outstanding = GREATEST(outstanding - _row.amount, 0)
    WHERE id = _row.retailer_id;
  END IF;

  UPDATE public.collections
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      approved_by = auth.uid(),
      approved_at = now(),
      review_note = NULLIF(_note, '')
  WHERE id = _id
  RETURNING * INTO _row;

  RETURN _row;
END;
$fn$;
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr';
CREATE OR REPLACE FUNCTION public.is_hr_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'hr') OR public.has_role(_uid, 'super_admin')
$$;

CREATE TABLE public.employee_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  date_of_birth date,
  date_of_joining date,
  gender text,
  marital_status text,
  blood_group text,
  father_name text,
  personal_email text,
  emergency_contact_name text,
  emergency_contact_phone text,
  address text,
  city text,
  state text,
  pincode text,
  department text,
  designation text,
  employment_type text NOT NULL DEFAULT 'full_time',
  work_location text,
  reporting_manager text,
  pan_no text,
  aadhaar_no text,
  uan_no text,
  pf_no text,
  esic_no text,
  bank_name text,
  bank_account_no text,
  ifsc_code text,
  account_holder text,
  ctc_annual numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  exit_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_details TO authenticated;
GRANT ALL ON public.employee_details TO service_role;

ALTER TABLE public.employee_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr manage employee details" ON public.employee_details
  FOR ALL TO authenticated
  USING (public.is_hr_admin(auth.uid()))
  WITH CHECK (public.is_hr_admin(auth.uid()));

CREATE POLICY "own employee details read" ON public.employee_details
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER employee_details_set_updated_at
  BEFORE UPDATE ON public.employee_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "leaves update" ON public.leaves;
CREATE POLICY "leaves update" ON public.leaves
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_hr_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_hr_admin(auth.uid()));

DROP POLICY IF EXISTS "own pending expenses update" ON public.expenses;
CREATE POLICY "own pending expenses update" ON public.expenses
  FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) AND (status = 'pending')) OR public.is_hr_admin(auth.uid()))
  WITH CHECK ((user_id = auth.uid()) OR public.is_hr_admin(auth.uid()));

DROP POLICY IF EXISTS "admins insert salary structures" ON public.salary_structures;
CREATE POLICY "admins insert salary structures" ON public.salary_structures
  FOR INSERT TO authenticated
  WITH CHECK (public.is_hr_admin(auth.uid()));

DROP POLICY IF EXISTS "admins update salary structures" ON public.salary_structures;
CREATE POLICY "admins update salary structures" ON public.salary_structures
  FOR UPDATE TO authenticated
  USING (public.is_hr_admin(auth.uid()))
  WITH CHECK (public.is_hr_admin(auth.uid()));

DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((id = auth.uid()) OR public.is_hr_admin(auth.uid()))
  WITH CHECK ((id = auth.uid()) OR public.is_hr_admin(auth.uid()));
ALTER TABLE public.salary_structures
  ADD COLUMN IF NOT EXISTS medical_allowance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_allowance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pf_employee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pf_employer numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS esic_employee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS esic_employer numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mediclaim numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS professional_tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labour_welfare_fund numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gratuity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loan_recovery numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uan_no text,
  ADD COLUMN IF NOT EXISTS esic_no text,
  ADD COLUMN IF NOT EXISTS pan_no text;
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS daily_target_amount numeric NOT NULL DEFAULT 0;

DELETE FROM public.targets a USING public.targets b
WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.period_month = b.period_month;

CREATE UNIQUE INDEX IF NOT EXISTS targets_user_month_uidx ON public.targets (user_id, period_month);

DROP POLICY IF EXISTS "managers manage team targets" ON public.targets;
CREATE POLICY "managers manage team targets" ON public.targets
FOR ALL TO authenticated
USING (public.manager_sees_user(user_id))
WITH CHECK (public.manager_sees_user(user_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.targets TO authenticated;
GRANT ALL ON public.targets TO service_role;
CREATE OR REPLACE FUNCTION public.can_see_retailer(_rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _rid IS NOT NULL AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr')
    OR EXISTS (SELECT 1 FROM public.retailers r WHERE r.id = _rid AND r.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.retailer_id = _rid)
    OR EXISTS (
      SELECT 1 FROM public.retailers r
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE r.id = _rid AND r.distributor_id IS NOT NULL AND p.distributor_id = r.distributor_id
    )
    OR EXISTS (
      SELECT 1 FROM public.retailers r
      JOIN public.distributors d ON d.id = r.distributor_id
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE r.id = _rid AND d.csa_id IS NOT NULL AND p.csa_id = d.csa_id
    )
    OR EXISTS (
      SELECT 1 FROM public.retailers r
      WHERE r.id = _rid
        AND (public.manager_sees_distributor(r.distributor_id) OR public.manager_sees_user(r.created_by))
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.retailer_id = _rid AND public.manager_sees_user(p.id)
    )
  )
$$;

DROP POLICY IF EXISTS "staff read retailers" ON public.retailers;
DROP POLICY IF EXISTS "managers read retailers" ON public.retailers;
DROP POLICY IF EXISTS "staff update retailers" ON public.retailers;

CREATE POLICY "scoped read retailers" ON public.retailers
FOR SELECT TO authenticated
USING (public.can_see_retailer(id));

CREATE POLICY "scoped update retailers" ON public.retailers
FOR UPDATE TO authenticated
USING (public.can_see_retailer(id))
WITH CHECK (public.can_see_retailer(id));
REVOKE EXECUTE ON FUNCTION public.can_see_retailer(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_see_retailer(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_see_retailer(uuid) TO authenticated;
DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'hr'));
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'office';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'office_manager';
CREATE TABLE public.office_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  description text,
  task_date date NOT NULL DEFAULT CURRENT_DATE,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'pending',
  completion_note text,
  completed_at timestamptz,
  rating integer,
  rating_note text,
  rated_by uuid REFERENCES auth.users(id),
  rated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.office_day_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  stars integer NOT NULL,
  note text,
  rated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, work_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_tasks TO authenticated;
GRANT ALL ON public.office_tasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_day_reviews TO authenticated;
GRANT ALL ON public.office_day_reviews TO service_role;

CREATE OR REPLACE FUNCTION public.can_manage_office_user(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'office_manager')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _uid AND p.reports_to = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_office_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_office_user(uuid) TO authenticated;

ALTER TABLE public.office_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_day_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office tasks readable by owner or manager"
  ON public.office_tasks FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR assigned_by = auth.uid() OR public.can_manage_office_user(assigned_to));

CREATE POLICY "managers create office tasks"
  ON public.office_tasks FOR INSERT TO authenticated
  WITH CHECK (assigned_by = auth.uid() AND public.can_manage_office_user(assigned_to));

CREATE POLICY "owner or manager updates office tasks"
  ON public.office_tasks FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR public.can_manage_office_user(assigned_to))
  WITH CHECK (assigned_to = auth.uid() OR public.can_manage_office_user(assigned_to));

CREATE POLICY "managers delete office tasks"
  ON public.office_tasks FOR DELETE TO authenticated
  USING (public.can_manage_office_user(assigned_to));

CREATE POLICY "day reviews readable by owner or manager"
  ON public.office_day_reviews FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_office_user(user_id));

CREATE POLICY "managers insert day reviews"
  ON public.office_day_reviews FOR INSERT TO authenticated
  WITH CHECK (rated_by = auth.uid() AND public.can_manage_office_user(user_id));

CREATE POLICY "managers update day reviews"
  ON public.office_day_reviews FOR UPDATE TO authenticated
  USING (public.can_manage_office_user(user_id))
  WITH CHECK (public.can_manage_office_user(user_id));

CREATE TRIGGER office_tasks_updated_at BEFORE UPDATE ON public.office_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER office_day_reviews_updated_at BEFORE UPDATE ON public.office_day_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'hr')
  OR public.has_role(auth.uid(), 'office_manager')
);
GRANT SELECT, INSERT, UPDATE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
GRANT SELECT, INSERT ON public.location_pings TO authenticated;
GRANT ALL ON public.location_pings TO service_role;
DROP POLICY IF EXISTS "staff read cstock" ON public.csa_stock;

CREATE POLICY "scoped read cstock" ON public.csa_stock
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.is_manager_role(auth.uid())
  OR public.manager_sees_csa(csa_id)
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.csa_id = csa_stock.csa_id)
  OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.distributors d ON d.id = p.distributor_id WHERE p.id = auth.uid() AND d.csa_id = csa_stock.csa_id)
  OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.csas c ON c.id = csa_stock.csa_id WHERE p.id = auth.uid() AND p.depot_id IS NOT NULL AND c.depot_id = p.depot_id)
);

CREATE TABLE public.influencer_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  insta_link text,
  mobile text,
  address text,
  pincode text,
  agreement_sign text NOT NULL DEFAULT 'no',
  agreement_accept text NOT NULL DEFAULT 'no',
  product_chosen text,
  dispatch_details text,
  content_received text NOT NULL DEFAULT 'no',
  content_approved text NOT NULL DEFAULT 'no',
  approved_by_name text,
  posted_platforms text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.influencer_appointments TO authenticated;
GRANT ALL ON public.influencer_appointments TO service_role;

ALTER TABLE public.influencer_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or manager read influencer appts"
ON public.influencer_appointments FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'office_manager')
  OR public.has_role(auth.uid(), 'hr')
  OR public.manager_sees_user(created_by)
);

CREATE POLICY "insert own influencer appts"
ON public.influencer_appointments FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "own or manager update influencer appts"
ON public.influencer_appointments FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'office_manager')
);

CREATE TRIGGER influencer_appointments_updated_at
BEFORE UPDATE ON public.influencer_appointments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TABLE public.ba_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  outlet_name text NOT NULL,
  outlet_owner_name text,
  address text,
  mobile text,
  ba_name text,
  ba_mobile text,
  ba_alloted text NOT NULL DEFAULT 'no',
  agreement_path text,
  branding_place_paths text[] NOT NULL DEFAULT '{}',
  coordinated_with_vendor text NOT NULL DEFAULT 'no',
  quotation_received text NOT NULL DEFAULT 'no',
  quotation_path text,
  approved text NOT NULL DEFAULT 'no',
  approved_by_name text,
  design_finalization text NOT NULL DEFAULT 'no',
  fitting text NOT NULL DEFAULT 'no',
  branding_done text NOT NULL DEFAULT 'no',
  branding_done_paths text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ba_appointments TO authenticated;
GRANT ALL ON public.ba_appointments TO service_role;

ALTER TABLE public.ba_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own BA appointments" ON public.ba_appointments
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Managers view team BA appointments" ON public.ba_appointments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'office_manager')
    OR public.can_manage_office_user(created_by)
  );

CREATE POLICY "Managers update team BA appointments" ON public.ba_appointments
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'office_manager')
    OR public.can_manage_office_user(created_by)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'office_manager')
    OR public.can_manage_office_user(created_by)
  );

CREATE TRIGGER ba_appointments_set_updated_at
  BEFORE UPDATE ON public.ba_appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "BA appointment files upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ba-appointments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "BA appointment files read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ba-appointments' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'hr')
      OR public.has_role(auth.uid(), 'office_manager')
      OR public.can_manage_office_user(((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "BA appointment files update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'ba-appointments' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'ba-appointments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE TABLE public.social_media_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date,
  day_label text,
  platforms text[] NOT NULL DEFAULT '{}',
  content_pillar text,
  content_type text NOT NULL DEFAULT 'post',
  handover_to_designer text NOT NULL DEFAULT 'no',
  design_path text,
  design_mime text,
  approved text NOT NULL DEFAULT 'no',
  approved_by_name text,
  posting text NOT NULL DEFAULT 'no',
  in_data_bank boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_media_calendar TO authenticated;
GRANT ALL ON public.social_media_calendar TO service_role;

ALTER TABLE public.social_media_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own social calendar entries"
ON public.social_media_calendar FOR ALL TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Managers manage team social calendar"
ON public.social_media_calendar FOR ALL TO authenticated
USING (public.can_manage_office_user(created_by) OR public.is_hr_admin(auth.uid()) OR public.manager_sees_user(created_by))
WITH CHECK (public.can_manage_office_user(created_by) OR public.is_hr_admin(auth.uid()) OR public.manager_sees_user(created_by));

CREATE TRIGGER social_media_calendar_set_updated_at
BEFORE UPDATE ON public.social_media_calendar
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Own social design files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'social-designs' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'social-designs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Managers read team social design files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'social-designs'
  AND (
    public.is_hr_admin(auth.uid())
    OR public.can_manage_office_user(((storage.foldername(name))[1])::uuid)
    OR public.manager_sees_user(((storage.foldername(name))[1])::uuid)
  )
);
CREATE TABLE public.account_compliance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  pf text NOT NULL DEFAULT 'no',
  tds text NOT NULL DEFAULT 'no',
  esic text NOT NULL DEFAULT 'no',
  ptrc text NOT NULL DEFAULT 'no',
  gst text NOT NULL DEFAULT 'no',
  mwf text NOT NULL DEFAULT 'no',
  ptec text NOT NULL DEFAULT 'no',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_compliance TO authenticated;
GRANT ALL ON public.account_compliance TO service_role;

ALTER TABLE public.account_compliance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own or managed compliance readable"
ON public.account_compliance FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.can_manage_office_user(created_by)
  OR public.is_hr_admin(auth.uid())
);

CREATE POLICY "Employees insert own compliance"
ON public.account_compliance FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Own or managed compliance editable"
ON public.account_compliance FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.can_manage_office_user(created_by))
WITH CHECK (created_by = auth.uid() OR public.can_manage_office_user(created_by));

CREATE TRIGGER account_compliance_set_updated_at
BEFORE UPDATE ON public.account_compliance
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
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
ALTER TABLE public.retailers
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS pincode text;
CREATE TABLE public.distributor_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesman_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  distributor_id uuid REFERENCES public.distributors(id) ON DELETE SET NULL,
  distributor_name text NOT NULL,
  phone text,
  address text,
  notes text,
  visited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.distributor_visits TO authenticated;
GRANT ALL ON public.distributor_visits TO service_role;

ALTER TABLE public.distributor_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own distributor visits are readable"
ON public.distributor_visits FOR SELECT TO authenticated
USING (
  salesman_id = auth.uid()
  OR public.is_manager_role(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'hr')
  OR public.manager_sees_user(salesman_id)
);

CREATE POLICY "Salesmen log their own distributor visits"
ON public.distributor_visits FOR INSERT TO authenticated
WITH CHECK (salesman_id = auth.uid());

CREATE POLICY "Salesmen edit their own distributor visits"
ON public.distributor_visits FOR UPDATE TO authenticated
USING (salesman_id = auth.uid())
WITH CHECK (salesman_id = auth.uid());

CREATE TRIGGER set_distributor_visits_updated_at
BEFORE UPDATE ON public.distributor_visits
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX distributor_visits_salesman_idx ON public.distributor_visits (salesman_id, visited_at DESC);
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS checkout_note text;
