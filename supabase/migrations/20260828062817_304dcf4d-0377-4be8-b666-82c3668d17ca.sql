ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ase';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'asm';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'business_manager';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS profiles_reports_to_idx ON public.profiles(reports_to);