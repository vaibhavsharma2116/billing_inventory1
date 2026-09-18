REVOKE EXECUTE ON FUNCTION public.manager_sees_distributor(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.manager_sees_csa(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.manager_sees_user(uuid) FROM anon, authenticated;