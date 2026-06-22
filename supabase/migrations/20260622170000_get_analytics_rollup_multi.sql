-- Aceleração do Analytics — Fase 9: get_analytics_rollup_multi (comparação).
--
-- Igual a get_analytics_rollup, mas o conjunto base é a UNIÃO de várias "fontes"
-- (par plataforma + frotas). Usado para o painel COMBINADO do modo comparação
-- (plataformas entre si OU empresas da mesma plataforma entre si).
--
-- p_sources = jsonb array, cada item {"platform_id": "...", "frotas": [...]|null}.
--   frotas null  => todas as empresas daquela plataforma.
-- Uma linha do rollup entra UMA vez se casar com QUALQUER fonte (semântica de
-- união, sem dupla contagem mesmo se as fontes se sobrepuserem).
--
-- O shape de saída é idêntico a get_analytics_rollup. As fontes individuais
-- (colunas da comparação) continuam usando get_analytics_rollup (uma plataforma).

create or replace function get_analytics_rollup_multi(
  p_sources        jsonb,
  p_date_from      timestamptz default null,
  p_date_to        timestamptz default null,
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
set work_mem = '64MB'
as $$
declare
  result jsonb;
  v_from date := case when p_date_from is not null then (p_date_from at time zone p_tz)::date end;
  v_to   date := case when p_date_to   is not null then (p_date_to   at time zone p_tz)::date end;
begin
  with base_all as materialized (
    select d.dia, d.fleet_raw, d.sev_norm, d.clf_norm, d.nome_evento, d.cnt,
           d.uf_counts, d.hora_counts, d.vel_counts, d.desc_counts, d.driver_counts, d.plate_counts
    from analytics_daily d
    where exists (
        select 1 from jsonb_array_elements(p_sources) s
        where d.platform_id = (s->>'platform_id')
          and (s->'frotas' is null or jsonb_typeof(s->'frotas') = 'null'
               or d.fleet_raw in (select jsonb_array_elements_text(s->'frotas')))
      )
      and (p_classification is null or p_classification = '' or p_classification = 'all'
           or d.clf_norm = p_classification)
      and (p_event_type is null or p_event_type = '' or d.nome_evento = p_event_type)
      and (p_severity is null or p_severity = '' or p_severity = 'all'
           or (p_severity = 'high'   and d.sev_norm in ('Grave', 'Gravíssimo'))
           or (p_severity = 'medium' and d.sev_norm = 'Médio')
           or (p_severity not in ('high', 'medium', 'all', '') and d.sev_norm = p_severity))
  ),
  base as materialized (
    select * from base_all
    where (v_from is null or dia >= v_from) and (v_to is null or dia <= v_to)
  ),
  bkt as materialized (
    select *, case when p_daily then to_char(dia, 'YYYY-MM-DD') else to_char(dia, 'YYYY-MM') end as tk from base
  ),
  tk_list as (
    select to_char(g, 'YYYY-MM-DD') tk from generate_series(v_from, v_to, interval '1 day') g
    where p_daily and v_from is not null and v_to is not null
    union select distinct to_char(dia, 'YYYY-MM') tk from base
    where not (p_daily and v_from is not null and v_to is not null)
  ),
  tk_ord as (select tk, row_number() over (order by tk) ord from tk_list),
  per_tk as (
    select tk, sum(cnt) total,
      sum(cnt) filter (where sev_norm = 'Gravíssimo') cg, sum(cnt) filter (where sev_norm = 'Grave') cgr,
      sum(cnt) filter (where sev_norm = 'Médio') cm, sum(cnt) filter (where clf_norm = 'Falso positivo') cf
    from bkt group by tk
  ),
  ts as (select o.ord, o.tk, coalesce(p.total,0) total, coalesce(p.cg,0) cg, coalesce(p.cgr,0) cgr, coalesce(p.cm,0) cm, coalesce(p.cf,0) cf from tk_ord o left join per_tk p on p.tk = o.tk),
  ts_var as (
    select ord, tk, total, cg, cgr, cm, cf,
      case when p_daily then substring(tk from 9 for 2) || '/' || substring(tk from 6 for 2)
           else (array['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'])[substring(tk from 6 for 2)::int] || '/' || substring(tk from 3 for 2) end lbl,
      case when ord = 1 then null when lag(total) over (order by ord) is null or lag(total) over (order by ord) = 0 then null
           else round(100.0 * (total - lag(total) over (order by ord)) / lag(total) over (order by ord), 1)::float8 end variacao
    from ts
  ),
  type_totals as (select coalesce(nullif(trim(nome_evento), ''), 'Não informado') typ, sum(cnt) c from base group by 1),
  top_types as (select typ, c, row_number() over (order by c desc, typ asc) rk from type_totals order by c desc, typ asc limit 5),
  type_per_tk as (select tk, coalesce(nullif(trim(nome_evento), ''), 'Não informado') typ, sum(cnt) c from bkt group by 1, 2),
  uf_x   as (select k uf, sum(v::int) c from base, jsonb_each_text(uf_counts) e(k,v) group by 1),
  drv_x  as (select k nm, sum(v::int) c from base, jsonb_each_text(driver_counts) e(k,v) group by 1),
  plt_x  as (select k pl, sum(v::int) c from base, jsonb_each_text(plate_counts) e(k,v) group by 1),
  desc_x as (select k d,  sum(v::int) c from base, jsonb_each_text(desc_counts) e(k,v) group by 1),
  hora_x as (select k::int hh, sum(v::int) c from base, jsonb_each_text(hora_counts) e(k,v) group by 1),
  hora_pos_x as (select k::int hh, sum(v::int) c from base, jsonb_each_text(hora_counts) e(k,v) where clf_norm = 'Positivo' group by 1),
  vel_x as (select k::int sp, sum(v::int) c from base, jsonb_each_text(vel_counts) e(k,v) group by 1),
  vel_stats as (select coalesce(sum(c),0) vcnt, coalesce(sum(sp*c),0) vsum, coalesce(sum(c) filter (where sp > 60),0) vgt60, (select jsonb_object_agg(sp::text, c) from vel_x) vjson from vel_x),
  dow_x as (select extract(dow from dia)::int dw, sum(cnt) c from base group by 1)
  select jsonb_build_object(
    'meta', jsonb_build_object(
      'total', (select coalesce(sum(cnt),0) from base),
      'periodo', (select case when coalesce(sum(cnt),0) = 0 then null else jsonb_build_array(to_char(min(dia),'DD/MM/YYYY'), to_char(max(dia),'DD/MM/YYYY')) end from base),
      'motoristas', (select count(distinct upper(nm)) from drv_x),
      'veiculos', (select count(distinct upper(pl)) from plt_x),
      'months', (select coalesce(jsonb_agg(m order by m), '[]'::jsonb) from (select distinct to_char(dia,'YYYY-MM') m from (select dia from base where p_window_months union all select dia from base_all where not p_window_months) src) s)),
    'kpis', (with tot as (select coalesce(sum(cnt),0)::numeric c from base)
      select jsonb_build_object('total', (select coalesce(sum(cnt),0) from base),
        'pct_positivo', round(100.0 * (select coalesce(sum(cnt),0) from base where clf_norm='Positivo') / greatest((select c from tot),1), 1)::float8,
        'pct_falso', round(100.0 * (select coalesce(sum(cnt),0) from base where clf_norm='Falso positivo') / greatest((select c from tot),1), 1)::float8,
        'pct_naoclass', round(100.0 * (select coalesce(sum(cnt),0) from base where clf_norm='Não classificado') / greatest((select c from tot),1), 1)::float8,
        'pct_evidencia', null,
        'vel_mediana', (select analytics_median_from_counts(vjson) from vel_stats),
        'vel_media', (select case when vcnt = 0 then null else round(vsum::numeric / vcnt, 1)::float8 end from vel_stats),
        'pct_vel_alta', (select case when vcnt = 0 then null else round(100.0 * vgt60 / vcnt, 1)::float8 end from vel_stats),
        't_ini_mediana', null, 't_fin_mediana', null)),
    'mensal', jsonb_build_object('meses',(select coalesce(jsonb_agg(tk order by ord),'[]'::jsonb) from ts_var),'labels',(select coalesce(jsonb_agg(lbl order by ord),'[]'::jsonb) from ts_var),'valores',(select coalesce(jsonb_agg(total order by ord),'[]'::jsonb) from ts_var),'variacao',(select coalesce(jsonb_agg(variacao order by ord),'[]'::jsonb) from ts_var)),
    'mensal_crit', jsonb_build_object('meses',(select coalesce(jsonb_agg(tk order by ord),'[]'::jsonb) from ts_var),'labels',(select coalesce(jsonb_agg(lbl order by ord),'[]'::jsonb) from ts_var),
      'series', jsonb_build_object('Gravíssimo',(select coalesce(jsonb_agg(cg order by ord),'[]'::jsonb) from ts_var),'Grave',(select coalesce(jsonb_agg(cgr order by ord),'[]'::jsonb) from ts_var),'Médio',(select coalesce(jsonb_agg(cm order by ord),'[]'::jsonb) from ts_var))),
    'mensal_tipo', jsonb_build_object('meses',(select coalesce(jsonb_agg(tk order by ord),'[]'::jsonb) from ts_var),'labels',(select coalesce(jsonb_agg(lbl order by ord),'[]'::jsonb) from ts_var),
      'series',(select coalesce(jsonb_object_agg(typ,arr order by rk),'{}'::jsonb) from (select tt.typ,tt.rk,(select coalesce(jsonb_agg(coalesce(tp.c,0) order by o.ord),'[]'::jsonb) from tk_ord o left join type_per_tk tp on tp.tk=o.tk and tp.typ=tt.typ) arr from top_types tt) z)),
    'clf_total', (select jsonb_build_object('Positivo',coalesce(sum(cnt) filter (where clf_norm='Positivo'),0),'Falso positivo',coalesce(sum(cnt) filter (where clf_norm='Falso positivo'),0),'Não classificado',coalesce(sum(cnt) filter (where clf_norm='Não classificado'),0)) from base),
    'falso_mensal', jsonb_build_object('labels',(select coalesce(jsonb_agg(lbl order by ord),'[]'::jsonb) from ts_var),'pct',(select coalesce(jsonb_agg(case when total=0 then 0 else round(100.0*cf/total,1)::float8 end order by ord),'[]'::jsonb) from ts_var)),
    'top_motoristas', (select jsonb_build_object('labels',coalesce(jsonb_agg(nm order by c desc, nm asc),'[]'::jsonb),'valores',coalesce(jsonb_agg(c order by c desc, nm asc),'[]'::jsonb)) from (select nm,c from drv_x order by c desc, nm asc limit 15) d),
    'top_placas', (select jsonb_build_object('labels',coalesce(jsonb_agg(pl order by c desc, pl asc),'[]'::jsonb),'valores',coalesce(jsonb_agg(c order by c desc, pl asc),'[]'::jsonb)) from (select pl,c from plt_x order by c desc, pl asc limit 15) d),
    'frota_raw', (select coalesce(jsonb_object_agg(fleet_raw,c),'{}'::jsonb) from (select fleet_raw, sum(cnt) c from base group by 1) f),
    'uf', (select jsonb_build_object('labels',coalesce(jsonb_agg(uf order by c desc, uf asc),'[]'::jsonb),'valores',coalesce(jsonb_agg(c order by c desc, uf asc),'[]'::jsonb)) from uf_x),
    'hora', jsonb_build_object('horas',(select jsonb_agg(g order by g) from generate_series(0,23) g),
      'valores',(select coalesce(jsonb_agg(coalesce(h.c,0) order by g),'[]'::jsonb) from generate_series(0,23) g left join hora_x h on h.hh=g),
      'valores_pos',(select coalesce(jsonb_agg(coalesce(h.c,0) order by g),'[]'::jsonb) from generate_series(0,23) g left join hora_pos_x h on h.hh=g)),
    'dow', jsonb_build_object('labels',jsonb_build_array('Seg','Ter','Qua','Qui','Sex','Sáb','Dom'),'valores',(select jsonb_agg(coalesce(d.c,0) order by m.ord) from (values (1,1),(2,2),(3,3),(4,4),(5,5),(6,6),(0,7)) m(dw,ord) left join dow_x d on d.dw=m.dw)),
    'vel', jsonb_build_object('labels',jsonb_build_array('0-20','20-40','40-60','60-70','70-80','80+'),
      'valores',(select jsonb_build_array(coalesce(sum(c) filter (where sp>=0 and sp<20),0),coalesce(sum(c) filter (where sp>=20 and sp<40),0),coalesce(sum(c) filter (where sp>=40 and sp<60),0),coalesce(sum(c) filter (where sp>=60 and sp<70),0),coalesce(sum(c) filter (where sp>=70 and sp<80),0),coalesce(sum(c) filter (where sp>=80 and sp<200),0)) from vel_x)),
    'evidencia', null, 'hasEvidence', false,
    'categorias', (select coalesce(jsonb_object_agg(d,c),'{}'::jsonb) from desc_x)
  ) into result;
  return result;
end;
$$;

revoke execute on function get_analytics_rollup_multi(jsonb, timestamptz, timestamptz, text, text, text, boolean, boolean, text) from anon;
grant execute on function get_analytics_rollup_multi(jsonb, timestamptz, timestamptz, text, text, text, boolean, boolean, text) to authenticated;
