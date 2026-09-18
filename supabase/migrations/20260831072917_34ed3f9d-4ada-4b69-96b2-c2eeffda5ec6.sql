CREATE OR REPLACE FUNCTION public.can_see_retailer(_rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _rid IS NOT NULL AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr')
    OR EXISTS (SELECT 1 FROM public.retailers r WHERE r.id = _rid AND r.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.retailer_id = _rid)
    OR EXISTS (
      SELECT 1 FROM public.retailers r
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE r.id = _rid AND r.distributor_id IS NOT NULL AND p.distributor_id = r.distributor_id
    )
    OR EXISTS (
      SELECT 1 FROM public.retailers r
      JOIN public.distributors d ON d.id = r.distributor_id
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE r.id = _rid AND d.csa_id IS NOT NULL AND p.csa_id = d.csa_id
    )
    OR EXISTS (
      SELECT 1 FROM public.retailers r
      WHERE r.id = _rid
        AND (public.manager_sees_distributor(r.distributor_id) OR public.manager_sees_user(r.created_by))
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.retailer_id = _rid AND public.manager_sees_user(p.id)
    )
  )
$$;

DROP POLICY IF EXISTS "staff read retailers" ON public.retailers;
DROP POLICY IF EXISTS "managers read retailers" ON public.retailers;
DROP POLICY IF EXISTS "staff update retailers" ON public.retailers;

CREATE POLICY "scoped read retailers" ON public.retailers
FOR SELECT TO authenticated
USING (public.can_see_retailer(id));

CREATE POLICY "scoped update retailers" ON public.retailers
FOR UPDATE TO authenticated
USING (public.can_see_retailer(id))
WITH CHECK (public.can_see_retailer(id));