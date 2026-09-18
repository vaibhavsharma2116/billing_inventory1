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