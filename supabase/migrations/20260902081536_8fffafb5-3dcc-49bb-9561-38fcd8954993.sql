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