REVOKE EXECUTE ON FUNCTION public.receive_delivery(uuid, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.receive_delivery(uuid, boolean, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.review_csa_payment(uuid, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.review_csa_payment(uuid, boolean, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.review_stock_adjustment(uuid, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.review_stock_adjustment(uuid, boolean, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;