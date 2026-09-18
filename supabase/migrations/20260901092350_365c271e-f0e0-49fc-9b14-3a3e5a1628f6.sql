DROP POLICY IF EXISTS "staff read cstock" ON public.csa_stock;

CREATE POLICY "scoped read cstock" ON public.csa_stock
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.is_manager_role(auth.uid())
  OR public.manager_sees_csa(csa_id)
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.csa_id = csa_stock.csa_id)
  OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.distributors d ON d.id = p.distributor_id WHERE p.id = auth.uid() AND d.csa_id = csa_stock.csa_id)
  OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.csas c ON c.id = csa_stock.csa_id WHERE p.id = auth.uid() AND p.depot_id IS NOT NULL AND c.depot_id = p.depot_id)
);