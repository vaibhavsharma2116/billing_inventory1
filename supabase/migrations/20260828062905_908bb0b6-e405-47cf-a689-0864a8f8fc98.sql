CREATE OR REPLACE FUNCTION public.is_manager_role(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _uid
      AND r.role IN ('manager','ase','asm','business_manager')
  )
$$;

CREATE OR REPLACE FUNCTION public.manager_scope_users(_manager uuid)
RETURNS TABLE (user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE tree AS (
    SELECT _manager AS id
    UNION
    SELECT p.id FROM public.profiles p JOIN tree t ON p.reports_to = t.id
  )
  SELECT id FROM tree
$$;

CREATE OR REPLACE FUNCTION public.manager_sees_distributor(_dist uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _dist IS NOT NULL AND public.is_manager_role(auth.uid()) AND (
    EXISTS (
      SELECT 1 FROM public.manager_assignments m
      WHERE m.distributor_id = _dist
        AND m.manager_id IN (SELECT user_id FROM public.manager_scope_users(auth.uid()))
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.distributor_id = _dist
        AND p.id IN (SELECT user_id FROM public.manager_scope_users(auth.uid()))
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.manager_sees_csa(_csa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _csa IS NOT NULL AND public.is_manager_role(auth.uid()) AND (
    EXISTS (
      SELECT 1 FROM public.manager_assignments m
      WHERE m.csa_id = _csa
        AND m.manager_id IN (SELECT user_id FROM public.manager_scope_users(auth.uid()))
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.csa_id = _csa
        AND p.id IN (SELECT user_id FROM public.manager_scope_users(auth.uid()))
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.manager_sees_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND public.is_manager_role(auth.uid()) AND (
    _uid IN (SELECT user_id FROM public.manager_scope_users(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.manager_assignments m
      LEFT JOIN public.profiles p ON p.id = _uid
      WHERE m.manager_id IN (SELECT user_id FROM public.manager_scope_users(auth.uid()))
        AND (m.member_id = _uid
          OR (m.distributor_id IS NOT NULL AND m.distributor_id = p.distributor_id)
          OR (m.csa_id IS NOT NULL AND m.csa_id = p.csa_id))
    )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_manager_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.manager_scope_users(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_manager_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_scope_users(uuid) TO authenticated;

CREATE POLICY "managers read ba stock" ON public.ba_stock FOR SELECT TO authenticated
  USING (public.manager_sees_user(ba_id));
CREATE POLICY "managers read leaves" ON public.leaves FOR SELECT TO authenticated
  USING (public.manager_sees_user(user_id));
CREATE POLICY "managers read targets" ON public.targets FOR SELECT TO authenticated
  USING (public.manager_sees_user(user_id));
CREATE POLICY "managers read location pings" ON public.location_pings FOR SELECT TO authenticated
  USING (public.manager_sees_user(user_id));