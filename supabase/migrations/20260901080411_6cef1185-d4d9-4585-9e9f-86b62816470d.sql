GRANT SELECT, INSERT, UPDATE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
GRANT SELECT, INSERT ON public.location_pings TO authenticated;
GRANT ALL ON public.location_pings TO service_role;