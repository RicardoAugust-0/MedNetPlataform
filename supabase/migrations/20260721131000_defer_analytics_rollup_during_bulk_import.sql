-- Cargas historicas grandes (em especial MaxTrack) chegam em lotes de 5 mil.
-- O trigger anterior reconstruia analytics_daily para cada lote, mesmo quando
-- todos pertenciam ao mesmo arquivo. Esta sobrecarga adia a manutencao e deixa
-- o backend executar um unico  refresh consistente antes de responder.

create or replace function public.trg_analytics_daily_ins()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if current_setting('mednet.defer_analytics_daily_refresh', true) = 'on' then
    return null;
  end if;

  for r in
    select platform_id, array_agg(distinct dia) dias
    from (
      select platform_id, (ocorrido_em at time zone 'America/Sao_Paulo')::date dia from new_rows
    ) s
    group by platform_id
  loop
    perform public.refresh_analytics_daily(r.platform_id, r.dias);
  end loop;
  return null;
end;
$$;

create or replace function public.trg_analytics_daily_upd()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if current_setting('mednet.defer_analytics_daily_refresh', true) = 'on' then
    return null;
  end if;

  for r in
    select platform_id, array_agg(distinct dia) dias
    from (
      select platform_id, (ocorrido_em at time zone 'America/Sao_Paulo')::date dia from new_rows
      union
      select platform_id, (ocorrido_em at time zone 'America/Sao_Paulo')::date dia from old_rows
    ) s
    group by platform_id
  loop
    perform public.refresh_analytics_daily(r.platform_id, r.dias);
  end loop;
  return null;
end;
$$;

-- Mantem a assinatura existente para bots legados. Apenas o backend de import
-- usa esta sobrecarga e chama refresh_analytics_daily apos o ultimo lote.
create or replace function public.upsert_driver_events_preserve(
  p_rows jsonb,
  p_authoritative_operator boolean,
  p_authoritative_treatment_end boolean,
  p_defer_analytics_refresh boolean
)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if p_defer_analytics_refresh then
    perform set_config('mednet.defer_analytics_daily_refresh', 'on', true);
  end if;

  return public.upsert_driver_events_preserve(
    p_rows,
    p_authoritative_operator,
    p_authoritative_treatment_end
  );
end;
$$;

revoke all on function public.upsert_driver_events_preserve(jsonb, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.upsert_driver_events_preserve(jsonb, boolean, boolean, boolean)
  to service_role;

comment on function public.upsert_driver_events_preserve(jsonb, boolean, boolean, boolean) is
  'Sobrecarga para importacao em lotes: quando defer=true, o service_role deve reconstruir analytics_daily apos o ultimo lote.';
