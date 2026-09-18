REVOKE EXECUTE ON FUNCTION public.review_stock_adjustment(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_stock_adjustment(uuid, boolean, text) TO authenticated;