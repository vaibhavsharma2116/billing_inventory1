REVOKE EXECUTE ON FUNCTION public.can_see_retailer(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_see_retailer(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_see_retailer(uuid) TO authenticated;