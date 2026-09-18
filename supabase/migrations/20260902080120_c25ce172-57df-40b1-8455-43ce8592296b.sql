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