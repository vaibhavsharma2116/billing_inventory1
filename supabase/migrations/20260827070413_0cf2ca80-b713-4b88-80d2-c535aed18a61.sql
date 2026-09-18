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