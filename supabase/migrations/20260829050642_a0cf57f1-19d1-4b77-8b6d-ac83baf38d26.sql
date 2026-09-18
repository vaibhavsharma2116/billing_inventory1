ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS packing_size text,
  ADD COLUMN IF NOT EXISTS csa_rate numeric NOT NULL DEFAULT 0;

UPDATE public.products SET csa_rate = pts WHERE csa_rate = 0;

ALTER TABLE public.retailers
  ADD COLUMN IF NOT EXISTS margin_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS display_amount numeric NOT NULL DEFAULT 0;