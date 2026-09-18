CREATE TABLE public.location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  accuracy numeric,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX location_pings_user_date_idx ON public.location_pings (user_id, work_date, recorded_at DESC);
GRANT SELECT, INSERT ON public.location_pings TO authenticated;
GRANT ALL ON public.location_pings TO service_role;
ALTER TABLE public.location_pings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own location pings insert" ON public.location_pings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff read location pings" ON public.location_pings FOR SELECT TO authenticated USING (true);