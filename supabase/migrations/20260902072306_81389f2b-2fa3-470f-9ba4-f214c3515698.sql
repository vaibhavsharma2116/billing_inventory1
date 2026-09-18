
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
