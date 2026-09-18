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