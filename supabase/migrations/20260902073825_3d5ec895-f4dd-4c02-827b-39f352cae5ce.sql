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