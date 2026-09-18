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