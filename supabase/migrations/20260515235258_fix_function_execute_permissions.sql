REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
