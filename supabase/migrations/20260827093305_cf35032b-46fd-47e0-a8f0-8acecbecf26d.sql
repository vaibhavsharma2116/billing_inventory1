ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS email text, ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS email text, ADD COLUMN IF NOT EXISTS phone text, ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.csas ADD COLUMN IF NOT EXISTS email text, ADD COLUMN IF NOT EXISTS phone text, ADD COLUMN IF NOT EXISTS address text;