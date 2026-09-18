ALTER TABLE public.retailers
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS pincode text;