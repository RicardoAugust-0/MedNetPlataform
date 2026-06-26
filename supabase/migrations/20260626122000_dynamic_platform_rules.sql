-- Migration: 20260626122000_dynamic_platform_rules.sql
-- Create public.platform_rules and public.custom_rules, and adapt public.get_open_alerts to use them.

-- 1. Create public.platform_rules table
CREATE TABLE IF NOT EXISTS public.platform_rules (
  platform_id           text PRIMARY KEY,
  sla_limit_min         integer NOT NULL DEFAULT 30,
  min_moving_speed_kmh  integer NOT NULL DEFAULT 10,
  critical_alerts_count integer NOT NULL DEFAULT 5,
  updated_at            timestamptz DEFAULT now(),
  updated_by            uuid REFERENCES auth.users(id) on delete set null
);

-- RLS policies
ALTER TABLE public.platform_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read platform_rules" ON public.platform_rules;
CREATE POLICY "authenticated read platform_rules" 
  ON public.platform_rules FOR SELECT 
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admin write platform_rules" ON public.platform_rules;
CREATE POLICY "admin write platform_rules" 
  ON public.platform_rules FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 2. Create public.custom_rules table
CREATE TABLE IF NOT EXISTS public.custom_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id    text NOT NULL,
  transportadora text NOT NULL,
  nome_evento    text NOT NULL,
  acao           text NOT NULL CHECK (acao IN ('descarte', 'alerta', 'report')),
  ativa          boolean NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now()
);

-- RLS policies
ALTER TABLE public.custom_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read custom_rules" ON public.custom_rules;
CREATE POLICY "authenticated read custom_rules" 
  ON public.custom_rules FOR SELECT 
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admin write custom_rules" ON public.custom_rules;
CREATE POLICY "admin write custom_rules" 
  ON public.custom_rules FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 3. Populate default values
INSERT INTO public.platform_rules (platform_id, sla_limit_min, min_moving_speed_kmh, critical_alerts_count)
VALUES
  ('sascar', 30, 10, 5),
  ('maxtrack', 30, 10, 8),
  ('omnilink', 30, 10, 5)
ON CONFLICT (platform_id) DO NOTHING;

-- 4. Re-create public.get_open_alerts RPC
CREATE OR REPLACE FUNCTION public.get_open_alerts(p_platform_id text)
RETURNS TABLE (
  nome                    text,
  placa                   text,
  transportadora          text,
  frota                   text,
  turno                   text,
  alertas                 integer,
  tipos                   text[],
  ultimo_evento           timestamptz,
  reportaveis             integer,
  tipos_reportar          text[],
  ultimo_evento_reportar  timestamptz,
  tecnicos                integer,
  tipos_tecnico           jsonb,
  eventos_detalhados      jsonb,
  severidade              text,
  sla_age_min             numeric,
  sla_breached            boolean,
  loaded_at               text,
  platform_id             text
) AS $$
DECLARE
  v_sla_limit_min int := 30;
  v_min_speed int := 10;
BEGIN
  -- Load dynamic rules from the platform_rules table
  SELECT sla_limit_min, min_moving_speed_kmh
  INTO v_sla_limit_min, v_min_speed
  FROM public.platform_rules
  WHERE platform_rules.platform_id = p_platform_id;

  -- Fallbacks
  IF v_sla_limit_min IS NULL THEN
    v_sla_limit_min := 30;
  END IF;
  IF v_min_speed IS NULL THEN
    v_min_speed := 10;
  END IF;

  RETURN QUERY
  WITH recent_atendimentos AS (
    SELECT
      a.placa,
      MAX(CASE WHEN a.tipo = 'intervencao' OR a.tipo = 'descarte' AND (a.bucket IS NULL OR a.bucket = 'intervencao') THEN a.created_at END) as last_intervencao,
      MAX(CASE WHEN a.tipo = 'reportar' OR a.tipo = 'descarte' AND a.bucket = 'reportar' THEN a.created_at END) as last_reportar,
      MAX(CASE WHEN a.tipo = 'descarte' AND a.bucket = 'tecnico' THEN a.created_at END) as last_tecnico
    FROM public.atendimentos a
    WHERE a.created_at >= now() - interval '3 days'
    GROUP BY a.placa
  ),
  valid_events AS (
    SELECT
      e.placa,
      e.nome,
      e.transportadora,
      e.frota,
      e.turno,
      e.nome_evento,
      e.categoria_bucket,
      e.severidade,
      e.ocorrido_em,
      e.importado_em
    FROM public.driver_events e
    LEFT JOIN recent_atendimentos r ON e.placa = r.placa
    WHERE e.platform_id = p_platform_id
      AND e.ocorrido_em >= now() - interval '24 hours'
      -- Speed limit filter
      AND (e.velocidade_kmh IS NULL OR e.velocidade_kmh >= v_min_speed)
      -- False positive check
      AND public.norm_clf(e.analise_ia_plataforma) <> 'Falso positivo'
      -- Regra Dinon (Sascar fumo)
      AND NOT (
        p_platform_id = 'sascar'
        AND lower(e.transportadora) LIKE '%dinon%'
        AND e.nome_evento ~* '\yfum(o|ando|ante|ar)\y'
      )
      -- Check cleared events
      AND (
        (e.categoria_bucket = 'intervencao' AND (r.last_intervencao IS NULL OR e.ocorrido_em > r.last_intervencao)) OR
        (e.categoria_bucket = 'reportar'    AND (r.last_reportar IS NULL    OR e.ocorrido_em > r.last_reportar)) OR
        (e.categoria_bucket = 'tecnico'     AND (r.last_tecnico IS NULL     OR e.ocorrido_em > r.last_tecnico))
      )
  ),
  grouped_by_placa AS (
    SELECT
      v.placa as driver_placa,
      COALESCE(NULLIF(MAX(v.nome), '-'), v.placa) as driver_nome,
      COALESCE(MAX(v.transportadora), '—') as driver_transp,
      COALESCE(MAX(v.frota), '') as driver_frota,
      COALESCE(MAX(v.turno), 'diurno') as driver_turno,
      
      -- Buckets counts
      COUNT(*) FILTER (WHERE v.categoria_bucket = 'intervencao')::integer as cnt_intervencao,
      COUNT(*) FILTER (WHERE v.categoria_bucket = 'reportar')::integer as cnt_reportar,
      COUNT(*) FILTER (WHERE v.categoria_bucket = 'tecnico')::integer as cnt_tecnico,

      -- Arrays of unique types
      array_agg(DISTINCT v.nome_evento) FILTER (WHERE v.categoria_bucket = 'intervencao') as list_intervencao,
      array_agg(DISTINCT v.nome_evento) FILTER (WHERE v.categoria_bucket = 'reportar') as list_reportar,

      -- Timestamps
      MAX(v.ocorrido_em) FILTER (WHERE v.categoria_bucket = 'intervencao') as max_intervencao,
      MAX(v.ocorrido_em) FILTER (WHERE v.categoria_bucket = 'reportar') as max_reportar,
      
      -- Severidade maxima
      COALESCE(
        MAX(CASE v.severidade 
          WHEN 'Gravíssimo' THEN 3 
          WHEN 'Grave' THEN 2 
          WHEN 'Normal' THEN 1 
          ELSE 0 
        END), 
        0
      ) as max_sev_level,

      -- JSON map of technical alerts count
      (
        SELECT jsonb_object_agg(sub.nome_evento, sub.cnt)
        FROM (
          SELECT ve.nome_evento, COUNT(*)::integer as cnt
          FROM valid_events ve
          WHERE ve.placa = v.placa AND ve.categoria_bucket = 'tecnico'
          GROUP BY ve.nome_evento
        ) sub
      ) as map_tecnico,

      -- Details jsonb array
      jsonb_agg(
        jsonb_build_object(
          'tipo', v.nome_evento,
          'bucket', v.categoria_bucket,
          'severidade', COALESCE(v.severidade, ''),
          'ts', to_char(v.ocorrido_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
      ) as details,

      MAX(to_char(v.importado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) as max_importado
      
    FROM valid_events v
    GROUP BY v.placa
  )
  SELECT
    g.driver_nome,
    g.driver_placa,
    g.driver_transp,
    g.driver_frota,
    g.driver_turno,
    g.cnt_intervencao,
    COALESCE(g.list_intervencao, ARRAY[]::text[]),
    g.max_intervencao,
    g.cnt_reportar,
    COALESCE(g.list_reportar, ARRAY[]::text[]),
    g.max_reportar,
    g.cnt_tecnico,
    COALESCE(g.map_tecnico, '{}'::jsonb),
    COALESCE(g.details, '[]'::jsonb),
    CASE g.max_sev_level
      WHEN 3 THEN 'Gravíssimo'
      WHEN 2 THEN 'Grave'
      WHEN 1 THEN 'Normal'
      ELSE 'Normal'
    END,
    -- sla_age_min
    CASE WHEN g.cnt_intervencao > 0 THEN
      EXTRACT(EPOCH FROM (now() - (
        SELECT MIN(ve.ocorrido_em) FROM valid_events ve WHERE ve.placa = g.driver_placa AND ve.categoria_bucket = 'intervencao'
      ))) / 60
    ELSE
      0.0
    END::numeric,
    -- sla_breached
    CASE WHEN g.cnt_intervencao > 0 THEN
      (EXTRACT(EPOCH FROM (now() - (
        SELECT MIN(ve.ocorrido_em) FROM valid_events ve WHERE ve.placa = g.driver_placa AND ve.categoria_bucket = 'intervencao'
      ))) / 60) > v_sla_limit_min
    ELSE
      FALSE
    END,
    g.max_importado,
    p_platform_id
  FROM grouped_by_placa g;
END;
$$ LANGUAGE plpgsql;
