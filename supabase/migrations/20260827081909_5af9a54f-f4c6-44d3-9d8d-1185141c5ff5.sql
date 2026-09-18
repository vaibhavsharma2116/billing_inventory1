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