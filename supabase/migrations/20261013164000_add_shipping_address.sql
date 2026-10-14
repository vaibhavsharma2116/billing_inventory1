-- Add shipping_address to csas, distributors, and retailers
ALTER TABLE public.csas ADD COLUMN IF NOT EXISTS shipping_address text;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS shipping_address text;
ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS shipping_address text;
