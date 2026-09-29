ALTER TABLE public.collections ADD COLUMN distributor_id uuid REFERENCES public.distributors(id) ON DELETE SET NULL;
ALTER TABLE public.collections ADD COLUMN csa_id uuid REFERENCES public.csas(id) ON DELETE SET NULL;
ALTER TABLE public.collections ALTER COLUMN retailer_id DROP NOT NULL;
ALTER TABLE public.collections ADD CONSTRAINT collection_target_check CHECK (num_nonnulls(retailer_id, distributor_id, csa_id) = 1);
DROP POLICY IF EXISTS "managers view collections" ON public.collections;
CREATE POLICY "managers view collections" ON public.collections FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "salesman create collections" ON public.collections;
CREATE POLICY "create collections" ON public.collections FOR INSERT TO authenticated WITH CHECK (true);