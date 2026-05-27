-- Cria a funcao RPC para recuperar transportadoras distintas sem estourar limites de linhas
CREATE OR REPLACE FUNCTION public.get_distinct_transportadoras()
RETURNS TABLE (transportadora text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT transportadora 
  FROM public.driver_events 
  WHERE transportadora IS NOT NULL;
$$;

-- Permissoes de execucao seguras
REVOKE EXECUTE ON FUNCTION public.get_distinct_transportadoras() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_distinct_transportadoras() TO authenticated;
