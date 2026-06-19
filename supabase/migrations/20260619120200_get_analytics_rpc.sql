-- Fase 4 do plano: RPC get_analytics — agrega TUDO no Postgres e devolve o objeto
-- `d` no MESMO shape que aggregate() do fatigueParser.js (contrato consumido pelos
-- gráficos). Fuso padronizado em America/Sao_Paulo (p_tz).
--
-- Pontos de paridade com aggregate() (ver fatigueParser.js):
--  • Exclusão de "Leve": o JS remove severidade='Leve' (excludeLeve) E pula
--    normCrit(severidade)='Leve' dentro de aggregate. Replicamos com AMBOS os
--    filtros — "is distinct from 'Leve'" (casa o índice parcial) e
--    analytics_norm_crit(severidade)<>'Leve" (pega 'baixo'/'leve' minúsculo etc.).
--  • Severidade/Classificação/Tipo NOS FILTROS usam o valor CRU exato (igual a
--    filterRows), mas nas SÉRIES (crit/clf) usam o valor NORMALIZADO (igual a
--    aggregate). Por isso os dois caminhos coexistem.
--  • frota: devolvemos frota_raw (valor cru -> contagem). O servidor resolve os
--    aliases (resolveMonitorName) e monta d.frota (top 8) — '' vira 'Não informado'.
--  • meta.months: no JS vem de `filtered` (sem filtro de mês), EXCETO no modo
--    custom, onde filterRows já aplicou o range. p_window_months=true => base
--    (janela); senão => base_all (sem data).
--  • vel_mediana: cast p/ numeric antes de round() para arredondar "half up"
--    (igual a Math.round) em vez do round-half-to-even do double.
--  • pcts/variação como float8 para soltar zeros à direita (igual a +x.toFixed(1)).

create or replace function get_analytics(
  p_platform_ids   text[],
  p_date_from      timestamptz default null,
  p_date_to        timestamptz default null,
  p_frotas         text[]      default null,
  p_severity       text        default null,
  p_classification text        default null,
  p_event_type     text        default null,
  p_daily          boolean     default false,
  p_window_months  boolean     default false,
  p_tz             text        default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  with base_all as (
    select
      e.placa, e.nome, e.severidade, e.nome_evento, e.analise_ia_plataforma,
      e.velocidade_kmh, e.localidade, e.descricao, e.ocorrido_em,
      coalesce(nullif(e.frota, ''), nullif(e.transportadora, ''), '') as fleet_raw,
      (e.ocorrido_em at time zone p_tz) as tl
    from driver_events e
    where e.platform_id = any (p_platform_ids)
      and e.severidade is distinct from 'Leve'
      and analytics_norm_crit(e.severidade) <> 'Leve'
      and (p_frotas is null
           or coalesce(nullif(e.frota, ''), nullif(e.transportadora, ''), '') = any (p_frotas))
      and (p_classification is null or p_classification = '' or p_classification = 'all'
           or analytics_norm_clf(e.analise_ia_plataforma) = p_classification)
      and (p_event_type is null or p_event_type = ''
           or e.nome_evento = p_event_type)
      and (p_severity is null or p_severity = '' or p_severity = 'all'
           or (p_severity = 'high'   and e.severidade in ('Grave', 'Gravíssimo'))
           or (p_severity = 'medium' and e.severidade = 'Médio')
           or (p_severity not in ('high', 'medium', 'all', '') and e.severidade = p_severity))
  ),
  base as (
    select * from base_all
    where (p_date_from is null or ocorrido_em >= p_date_from)
      and (p_date_to   is null or ocorrido_em <= p_date_to)
  ),
  bkt as (
    select *,
      case when p_daily then to_char(tl, 'YYYY-MM-DD') else to_char(tl, 'YYYY-MM') end as tk
    from base
  ),
  tk_list as (
    select to_char(g, 'YYYY-MM-DD') as tk
    from generate_series(
           (p_date_from at time zone p_tz)::date,
           (p_date_to   at time zone p_tz)::date,
           interval '1 day') g
    where p_daily and p_date_from is not null and p_date_to is not null
    union
    select distinct to_char(tl, 'YYYY-MM') as tk
    from base
    where not (p_daily and p_date_from is not null and p_date_to is not null)
  ),
  tk_ord as (
    select tk, row_number() over (order by tk) as ord from tk_list
  ),
  per_tk as (
    select tk,
      count(*) as total,
      count(*) filter (where analytics_norm_crit(severidade) = 'Gravíssimo') as cg,
      count(*) filter (where analytics_norm_crit(severidade) = 'Grave')      as cgr,
      count(*) filter (where analytics_norm_crit(severidade) = 'Médio')      as cm,
      count(*) filter (where analytics_norm_clf(analise_ia_plataforma) = 'Falso positivo') as cf
    from bkt
    group by tk
  ),
  ts as (
    select o.ord, o.tk,
      coalesce(p.total, 0) as total,
      coalesce(p.cg, 0)  as cg,
      coalesce(p.cgr, 0) as cgr,
      coalesce(p.cm, 0)  as cm,
      coalesce(p.cf, 0)  as cf
    from tk_ord o
    left join per_tk p on p.tk = o.tk
  ),
  ts_var as (
    select ord, tk, total, cg, cgr, cm, cf,
      case when p_daily
           then substring(tk from 9 for 2) || '/' || substring(tk from 6 for 2)
           else (array['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'])[substring(tk from 6 for 2)::int]
                || '/' || substring(tk from 3 for 2)
      end as lbl,
      case when ord = 1 then null
           when lag(total) over (order by ord) is null
                or lag(total) over (order by ord) = 0 then null
           else round(100.0 * (total - lag(total) over (order by ord))
                      / lag(total) over (order by ord), 1)::float8
      end as variacao
    from ts
  ),
  type_totals as (
    select coalesce(nullif(trim(nome_evento), ''), 'Não informado') as typ, count(*) as c
    from base
    group by 1
  ),
  top_types as (
    select typ, c, row_number() over (order by c desc, typ asc) as rk
    from type_totals
    order by c desc, typ asc
    limit 5
  ),
  type_per_tk as (
    select tk, coalesce(nullif(trim(nome_evento), ''), 'Não informado') as typ, count(*) as c
    from bkt
    group by 1, 2
  )
  select jsonb_build_object(
    'meta', jsonb_build_object(
      'total', (select count(*) from base),
      'periodo', (select case when count(*) = 0 then null
                    else jsonb_build_array(
                      to_char(min(ocorrido_em) at time zone p_tz, 'DD/MM/YYYY'),
                      to_char(max(ocorrido_em) at time zone p_tz, 'DD/MM/YYYY'))
                    end from base),
      'motoristas', (select count(distinct upper(trim(nome))) from base where trim(coalesce(nome, '')) <> ''),
      'veiculos',   (select count(distinct upper(trim(placa))) from base where trim(coalesce(placa, '')) <> ''),
      'months', (select coalesce(jsonb_agg(m order by m), '[]'::jsonb)
                 from (select distinct to_char(tl, 'YYYY-MM') m
                       from (select tl from base where p_window_months
                             union all
                             select tl from base_all where not p_window_months) src) s)
    ),
    'kpis', (
      with v as (select velocidade_kmh from base
                 where velocidade_kmh is not null and velocidade_kmh >= 0 and velocidade_kmh < 200),
           cl as (select analytics_norm_clf(analise_ia_plataforma) k from base),
           tot as (select count(*)::numeric c from base)
      select jsonb_build_object(
        'total', (select count(*) from base),
        'pct_positivo', round(100.0 * (select count(*) from cl where k = 'Positivo')         / greatest((select c from tot), 1), 1)::float8,
        'pct_falso',    round(100.0 * (select count(*) from cl where k = 'Falso positivo')    / greatest((select c from tot), 1), 1)::float8,
        'pct_naoclass', round(100.0 * (select count(*) from cl where k = 'Não classificado')  / greatest((select c from tot), 1), 1)::float8,
        'pct_evidencia', null,
        'vel_mediana', (select round((percentile_cont(0.5) within group (order by velocidade_kmh))::numeric)::int from v),
        'vel_media',   (select round(avg(velocidade_kmh), 1)::float8 from v),
        'pct_vel_alta',(select case when count(*) = 0 then null
                         else round(100.0 * count(*) filter (where velocidade_kmh > 60) / count(*), 1)::float8 end from v),
        't_ini_mediana', null,
        't_fin_mediana', null
      )
    ),
    'mensal', jsonb_build_object(
      'meses',   (select coalesce(jsonb_agg(tk order by ord), '[]'::jsonb) from ts_var),
      'labels',  (select coalesce(jsonb_agg(lbl order by ord), '[]'::jsonb) from ts_var),
      'valores', (select coalesce(jsonb_agg(total order by ord), '[]'::jsonb) from ts_var),
      'variacao',(select coalesce(jsonb_agg(variacao order by ord), '[]'::jsonb) from ts_var)
    ),
    'mensal_crit', jsonb_build_object(
      'meses',  (select coalesce(jsonb_agg(tk order by ord), '[]'::jsonb) from ts_var),
      'labels', (select coalesce(jsonb_agg(lbl order by ord), '[]'::jsonb) from ts_var),
      'series', jsonb_build_object(
        'Gravíssimo', (select coalesce(jsonb_agg(cg order by ord), '[]'::jsonb) from ts_var),
        'Grave',      (select coalesce(jsonb_agg(cgr order by ord), '[]'::jsonb) from ts_var),
        'Médio',      (select coalesce(jsonb_agg(cm order by ord), '[]'::jsonb) from ts_var)
      )
    ),
    'mensal_tipo', jsonb_build_object(
      'meses',  (select coalesce(jsonb_agg(tk order by ord), '[]'::jsonb) from ts_var),
      'labels', (select coalesce(jsonb_agg(lbl order by ord), '[]'::jsonb) from ts_var),
      'series', (select coalesce(jsonb_object_agg(typ, arr order by rk), '{}'::jsonb)
                 from (
                   select tt.typ, tt.rk,
                     (select coalesce(jsonb_agg(coalesce(tp.c, 0) order by o.ord), '[]'::jsonb)
                      from tk_ord o
                      left join type_per_tk tp on tp.tk = o.tk and tp.typ = tt.typ) as arr
                   from top_types tt
                 ) z)
    ),
    'clf_total', (select jsonb_build_object(
        'Positivo',         count(*) filter (where analytics_norm_clf(analise_ia_plataforma) = 'Positivo'),
        'Falso positivo',   count(*) filter (where analytics_norm_clf(analise_ia_plataforma) = 'Falso positivo'),
        'Não classificado', count(*) filter (where analytics_norm_clf(analise_ia_plataforma) = 'Não classificado')
      ) from base),
    'falso_mensal', jsonb_build_object(
      'labels', (select coalesce(jsonb_agg(lbl order by ord), '[]'::jsonb) from ts_var),
      'pct',    (select coalesce(jsonb_agg(
                   case when total = 0 then 0 else round(100.0 * cf / total, 1)::float8 end
                   order by ord), '[]'::jsonb) from ts_var)
    ),
    'top_motoristas', (
      select jsonb_build_object(
        'labels',  coalesce(jsonb_agg(nm order by c desc, nm asc), '[]'::jsonb),
        'valores', coalesce(jsonb_agg(c  order by c desc, nm asc), '[]'::jsonb))
      from (select trim(nome) nm, count(*) c from base
            where trim(coalesce(nome, '')) <> '' group by 1 order by c desc, nm asc limit 15) d
    ),
    'top_placas', (
      select jsonb_build_object(
        'labels',  coalesce(jsonb_agg(pl order by c desc, pl asc), '[]'::jsonb),
        'valores', coalesce(jsonb_agg(c  order by c desc, pl asc), '[]'::jsonb))
      from (select trim(placa) pl, count(*) c from base
            where trim(coalesce(placa, '')) <> '' group by 1 order by c desc, pl asc limit 15) d
    ),
    'frota_raw', (select coalesce(jsonb_object_agg(fleet_raw, c), '{}'::jsonb)
                  from (select fleet_raw, count(*) c from base group by 1) f),
    'uf', (
      select jsonb_build_object(
        'labels',  coalesce(jsonb_agg(uf order by c desc, uf asc), '[]'::jsonb),
        'valores', coalesce(jsonb_agg(c  order by c desc, uf asc), '[]'::jsonb))
      from (select analytics_to_uf(localidade) uf, count(*) c from base
            where analytics_to_uf(localidade) is not null group by 1) u
    ),
    'hora', jsonb_build_object(
      'horas', (select jsonb_agg(g order by g) from generate_series(0, 23) g),
      'valores', (select coalesce(jsonb_agg(coalesce(h.c, 0) order by g), '[]'::jsonb)
                  from generate_series(0, 23) g
                  left join (select extract(hour from tl)::int hh, count(*) c from base group by 1) h on h.hh = g),
      'valores_pos', (select coalesce(jsonb_agg(coalesce(h.c, 0) order by g), '[]'::jsonb)
                  from generate_series(0, 23) g
                  left join (select extract(hour from tl)::int hh, count(*) c from base
                             where analytics_norm_clf(analise_ia_plataforma) = 'Positivo' group by 1) h on h.hh = g)
    ),
    'dow', jsonb_build_object(
      'labels', jsonb_build_array('Seg','Ter','Qua','Qui','Sex','Sáb','Dom'),
      'valores', (select jsonb_agg(coalesce(d.c, 0) order by m.ord)
                  from (values (1,1),(2,2),(3,3),(4,4),(5,5),(6,6),(0,7)) m(dw, ord)
                  left join (select extract(dow from tl)::int dwv, count(*) c from base group by 1) d on d.dwv = m.dw)
    ),
    'vel', jsonb_build_object(
      'labels', jsonb_build_array('0-20','20-40','40-60','60-70','70-80','80+'),
      'valores', (select jsonb_build_array(
          count(*) filter (where velocidade_kmh >= 0  and velocidade_kmh < 20),
          count(*) filter (where velocidade_kmh >= 20 and velocidade_kmh < 40),
          count(*) filter (where velocidade_kmh >= 40 and velocidade_kmh < 60),
          count(*) filter (where velocidade_kmh >= 60 and velocidade_kmh < 70),
          count(*) filter (where velocidade_kmh >= 70 and velocidade_kmh < 80),
          count(*) filter (where velocidade_kmh >= 80 and velocidade_kmh < 200)
        ) from base)
    ),
    'evidencia', null,
    'hasEvidence', false,
    'categorias', (select coalesce(jsonb_object_agg(d, c), '{}'::jsonb)
        from (select trim(descricao) d, count(*) c from base
              where trim(coalesce(descricao, '')) <> '' group by 1) s)
  ) into result;

  return result;
end;
$$;

revoke execute on function get_analytics(text[], timestamptz, timestamptz, text[], text, text, text, boolean, boolean, text) from anon;
grant execute on function get_analytics(text[], timestamptz, timestamptz, text[], text, text, text, boolean, boolean, text) to authenticated;
