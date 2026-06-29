-- Migration: 20260629000000_medbot_aggregation_rpc.sql
-- Cria RPC de agregação de eventos de motoristas para o MedBot (rankings/top-N).

CREATE OR REPLACE FUNCTION public.aggregate_driver_events(
  p_platform_id text DEFAULT NULL,
  p_since_hours int DEFAULT 24,
  p_limit int DEFAULT 10,
  p_category text DEFAULT NULL
)
RETURNS TABLE (
  nome            text,
  placa           text,
  transportadora  text,
  platform_id     text,
  total_eventos   bigint,
  intervencao     bigint,
  reportar        bigint,
  tecnico         bigint,
  ultimo_evento   timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(NULLIF(MAX(e.nome), '-'), e.placa)  AS nome,
    e.placa,
    COALESCE(MAX(e.transportadora), '—')          AS transportadora,
    e.platform_id,
    COUNT(*)                                       AS total_eventos,
    COUNT(*) FILTER (WHERE e.categoria_bucket = 'intervencao') AS intervencao,
    COUNT(*) FILTER (WHERE e.categoria_bucket = 'reportar')    AS reportar,
    COUNT(*) FILTER (WHERE e.categoria_bucket = 'tecnico')     AS tecnico,
    MAX(e.ocorrido_em)                             AS ultimo_evento
  FROM public.driver_events e
  WHERE e.ocorrido_em >= now() - (p_since_hours || ' hours')::interval
    AND (p_platform_id IS NULL OR e.platform_id = p_platform_id)
    AND (p_category    IS NULL OR e.categoria_bucket = p_category)
  GROUP BY e.placa, e.platform_id
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
