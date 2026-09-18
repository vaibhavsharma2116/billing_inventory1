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