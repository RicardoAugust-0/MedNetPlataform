-- Agendamento real das automacoes configurado pelo MedNet.
-- O backend reivindica execucoes vencidas por RPC; a trava no banco evita
-- disparos duplicados quando houver mais de uma instancia do servidor.

alter table public.automations
  add column if not exists schedule_type text,
  add column if not exists schedule_interval_minutes integer,
  add column if not exists schedule_time time without time zone,
  add column if not exists schedule_days smallint[],
  add column if not exists schedule_timezone text not null default 'America/Sao_Paulo',
  add column if not exists next_run_at timestamptz,
  add column if not exists last_run_at timestamptz,
  add column if not exists last_schedule_status text,
  add column if not exists last_schedule_error text,
  add column if not exists schedule_claim_id uuid,
  add column if not exists schedule_locked_until timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'automations_schedule_type_check'
      and conrelid = 'public.automations'::regclass
  ) then
    alter table public.automations
      add constraint automations_schedule_type_check
      check (schedule_type is null or schedule_type in ('interval', 'daily', 'weekly'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'automations_schedule_interval_check'
      and conrelid = 'public.automations'::regclass
  ) then
    alter table public.automations
      add constraint automations_schedule_interval_check
      check (schedule_interval_minutes is null or schedule_interval_minutes between 5 and 10080);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'automations_schedule_days_check'
      and conrelid = 'public.automations'::regclass
  ) then
    alter table public.automations
      add constraint automations_schedule_days_check
      check (
        schedule_days is null
        or schedule_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
      );
  end if;
end $$;

create or replace function public.automation_calculate_next_run(
  p_schedule_type text,
  p_interval_minutes integer,
  p_schedule_time time without time zone,
  p_schedule_days smallint[],
  p_timezone text,
  p_from timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_timezone text := coalesce(nullif(p_timezone, ''), 'America/Sao_Paulo');
  v_local_now timestamp without time zone;
  v_candidate timestamp without time zone;
  v_date date;
  v_offset integer;
begin
  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    raise exception 'Fuso horario invalido: %', v_timezone;
  end if;

  if p_schedule_type = 'interval' then
    if p_interval_minutes is null or p_interval_minutes < 5 then
      raise exception 'Intervalo de agendamento invalido';
    end if;
    return p_from + make_interval(mins => p_interval_minutes);
  end if;

  v_local_now := p_from at time zone v_timezone;

  if p_schedule_type = 'daily' then
    if p_schedule_time is null then
      raise exception 'Horario diario nao informado';
    end if;
    v_candidate := v_local_now::date + p_schedule_time;
    if v_candidate <= v_local_now then
      v_candidate := v_candidate + interval '1 day';
    end if;
    return v_candidate at time zone v_timezone;
  end if;

  if p_schedule_type = 'weekly' then
    if p_schedule_time is null or coalesce(cardinality(p_schedule_days), 0) = 0 then
      raise exception 'Dias ou horario semanal nao informados';
    end if;

    for v_offset in 0..7 loop
      v_date := v_local_now::date + v_offset;
      if extract(dow from v_date)::smallint = any(p_schedule_days) then
        v_candidate := v_date + p_schedule_time;
        if v_candidate > v_local_now then
          return v_candidate at time zone v_timezone;
        end if;
      end if;
    end loop;
  end if;

  return null;
end;
$$;

revoke execute on function public.automation_calculate_next_run(text, integer, time without time zone, smallint[], text, timestamptz) from public;
grant execute on function public.automation_calculate_next_run(text, integer, time without time zone, smallint[], text, timestamptz) to service_role;

-- Converte os agendamentos legados conhecidos sem alterar o texto exibido.
update public.automations
set schedule_type = 'interval',
    schedule_interval_minutes = 15
where trigger = 'agendado'
  and schedule_type is null
  and schedule ~* '15[[:space:]]*(min|minuto)';

update public.automations
set schedule_type = 'interval',
    schedule_interval_minutes = 60
where trigger = 'agendado'
  and schedule_type is null
  and schedule ~* '(1[[:space:]]*hora|hora em hora)';

update public.automations
set schedule_type = 'daily',
    schedule_time = '06:00'::time
where trigger = 'agendado'
  and schedule_type is null
  and schedule ~* '06:00';

-- Os robos Playwright podem levar varios minutos. O n8n ja os acionava em
-- background; ao transferir o relogio para o MedNet, preserva esse contrato
-- para que o webhook responda com o job aceito antes do timeout HTTP.
update public.automations
set endpoint = endpoint
  || case when position('?' in endpoint) > 0 then '&' else '?' end
  || 'background=true'
where trigger = 'agendado'
  and endpoint like 'https://botsplaywright.duckdns.org/automacoes/%'
  and endpoint !~* '(^|[?&])background=';

create or replace function public.automations_refresh_next_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule_changed boolean;
begin
  v_schedule_changed := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    v_schedule_changed :=
      new.active is distinct from old.active
      or new.trigger is distinct from old.trigger
      or new.schedule_type is distinct from old.schedule_type
      or new.schedule_interval_minutes is distinct from old.schedule_interval_minutes
      or new.schedule_time is distinct from old.schedule_time
      or new.schedule_days is distinct from old.schedule_days
      or new.schedule_timezone is distinct from old.schedule_timezone;
  end if;

  if not new.active or new.trigger <> 'agendado' or new.schedule_type is null then
    new.next_run_at := null;
    new.schedule_claim_id := null;
    new.schedule_locked_until := null;
  elsif v_schedule_changed or new.next_run_at is null then
    new.next_run_at := public.automation_calculate_next_run(
      new.schedule_type,
      new.schedule_interval_minutes,
      new.schedule_time,
      new.schedule_days,
      new.schedule_timezone,
      now()
    );
    new.schedule_claim_id := null;
    new.schedule_locked_until := null;
  end if;

  return new;
end;
$$;

revoke execute on function public.automations_refresh_next_run() from public;

drop trigger if exists automations_refresh_next_run_trigger on public.automations;
create trigger automations_refresh_next_run_trigger
before insert or update on public.automations
for each row execute function public.automations_refresh_next_run();

update public.automations
set next_run_at = public.automation_calculate_next_run(
  schedule_type,
  schedule_interval_minutes,
  schedule_time,
  schedule_days,
  schedule_timezone,
  now()
)
where active
  and trigger = 'agendado'
  and schedule_type is not null
  and next_run_at is null;

create index if not exists automations_due_schedule_idx
  on public.automations (next_run_at)
  where active and trigger = 'agendado' and next_run_at is not null;

create or replace function public.claim_due_automations(p_limit integer default 10)
returns table (
  automation_id uuid,
  automation_name text,
  automation_endpoint text,
  automation_token text,
  scheduled_for timestamptz,
  claim_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select a.id
    from public.automations a
    where a.active
      and a.trigger = 'agendado'
      and a.schedule_type is not null
      and a.next_run_at <= now()
      and (a.schedule_locked_until is null or a.schedule_locked_until < now())
    order by a.next_run_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed as (
    update public.automations a
    set schedule_claim_id = gen_random_uuid(),
        schedule_locked_until = now() + interval '10 minutes'
    from due
    where a.id = due.id
    returning a.id, a.name, a.endpoint, a.token, a.next_run_at, a.schedule_claim_id
  )
  select c.id, c.name, c.endpoint, c.token, c.next_run_at, c.schedule_claim_id
  from claimed c;
end;
$$;

revoke execute on function public.claim_due_automations(integer) from public;
grant execute on function public.claim_due_automations(integer) to service_role;

create or replace function public.finish_automation_schedule(
  p_automation_id uuid,
  p_claim_id uuid,
  p_success boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.automations a
  set next_run_at = case
        when a.active and a.trigger = 'agendado' and a.schedule_type is not null
          then public.automation_calculate_next_run(
            a.schedule_type,
            a.schedule_interval_minutes,
            a.schedule_time,
            a.schedule_days,
            a.schedule_timezone,
            now()
          )
        else null
      end,
      last_run_at = now(),
      last_schedule_status = case when p_success then 'success' else 'failure' end,
      last_schedule_error = case when p_success then null else left(p_error, 1000) end,
      schedule_claim_id = null,
      schedule_locked_until = null
  where a.id = p_automation_id
    and a.schedule_claim_id = p_claim_id;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.finish_automation_schedule(uuid, uuid, boolean, text) from public;
grant execute on function public.finish_automation_schedule(uuid, uuid, boolean, text) to service_role;

-- A aba e as rotas de automacao exigem nivel lider. Impede operadores de
-- ler endpoints/tokens diretamente pela API do banco.
drop policy if exists "authenticated_all_automations" on public.automations;
drop policy if exists "leaders_manage_automations" on public.automations;
create policy "leaders_manage_automations" on public.automations
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role in ('lider', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role in ('lider', 'admin')
    )
  );

drop policy if exists "authenticated_all_automation_logs" on public.automation_logs;
drop policy if exists "leaders_manage_automation_logs" on public.automation_logs;
create policy "leaders_manage_automation_logs" on public.automation_logs
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role in ('lider', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role in ('lider', 'admin')
    )
  );
