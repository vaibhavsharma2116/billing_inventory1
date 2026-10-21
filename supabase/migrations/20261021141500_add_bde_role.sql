-- Add 'bde' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'bde';

-- Update is_manager_role to include 'bde'
CREATE OR REPLACE FUNCTION public.is_manager_role(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _uid
      AND r.role IN ('manager','ase','asm','business_manager','bde')
  )
$$;
