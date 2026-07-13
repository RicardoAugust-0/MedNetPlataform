-- Evita que o Auto Cross-Check remova ou reatribua uma pendencia enquanto o
-- Bot_HorizonTratamento ainda trabalha nela. O claim e atomico e possui lease
-- para que uma execucao interrompida nao bloqueie a fila indefinidamente.

alter table public.horizon_treatment_queue
  add column if not exists claimed_at timestamptz,
  add column if not exists lease_expires_at timestamptz;

alter table public.horizon_treatment_queue
  drop constraint if exists horizon_treatment_queue_status_check;

alter table public.horizon_treatment_queue
  add constraint horizon_treatment_queue_status_check
  check (status in (
    'pending',
    'processing',
    'already_synced',
    'no_horizon_match',
    'done',
    'error'
  ));

alter table public.horizon_treatment_queue
  drop constraint if exists horizon_treatment_queue_claim_lease_check;

alter table public.horizon_treatment_queue
  add constraint horizon_treatment_queue_claim_lease_check
  check (
    (
      status = 'processing'
      and claimed_at is not null
      and lease_expires_at is not null
    )
    or (
      status <> 'processing'
      and claimed_at is null
      and lease_expires_at is null
    )
  );

create index if not exists horizon_treatment_queue_processing_lease_idx
  on public.horizon_treatment_queue (lease_expires_at)
  where status = 'processing';

create or replace function public.claim_horizon_treatment_queue(
  p_limit integer default 500,
  p_lease_seconds integer default 1800
)
returns table(queue_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 500);
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 1800), 60), 7200);
begin
  -- Uma execucao que morreu libera seus itens no proximo consumo da fila.
  update public.horizon_treatment_queue
  set status = 'pending',
      claimed_at = null,
      lease_expires_at = null,
      updated_at = now()
  where status = 'processing'
    and (lease_expires_at is null or lease_expires_at <= now());

  return query
  with candidates as (
    select q.id
    from public.horizon_treatment_queue q
    where q.status = 'pending'
    order by q.ocorrido_em, q.id
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.horizon_treatment_queue q
    set status = 'processing',
        claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => v_lease_seconds),
        updated_at = now()
    from candidates c
    where q.id = c.id
    returning q.id
  )
  select claimed.id
  from claimed;
end;
$$;

revoke all on function public.claim_horizon_treatment_queue(integer, integer) from public;
revoke all on function public.claim_horizon_treatment_queue(integer, integer) from anon;
revoke all on function public.claim_horizon_treatment_queue(integer, integer) from authenticated;
grant execute on function public.claim_horizon_treatment_queue(integer, integer) to service_role;

comment on function public.claim_horizon_treatment_queue(integer, integer) is
  'Reivindica pendencias Horizon com FOR UPDATE SKIP LOCKED e lease renovavel por nova execucao.';

-- Historico imutavel das respostas do robo. Mantem placa/empresa/horario como
-- snapshot mesmo se o pareamento da fila mudar depois da tentativa.
create table if not exists public.horizon_treatment_attempts (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.horizon_treatment_queue(id) on delete set null,
  requested_status text not null,
  persisted_status text not null,
  tentativa integer not null default 0,
  erro text,
  empresa text,
  placa text,
  ocorrido_em timestamptz,
  created_at timestamptz not null default now(),
  constraint horizon_treatment_attempts_requested_status_check
    check (requested_status in ('done', 'already_synced', 'no_horizon_match', 'error')),
  constraint horizon_treatment_attempts_persisted_status_check
    check (persisted_status in ('pending', 'already_synced', 'no_horizon_match', 'done', 'error'))
);

create index if not exists horizon_treatment_attempts_queue_created_idx
  on public.horizon_treatment_attempts (queue_id, created_at desc);

create index if not exists horizon_treatment_attempts_errors_created_idx
  on public.horizon_treatment_attempts (created_at desc)
  where requested_status = 'error';

alter table public.horizon_treatment_attempts enable row level security;

drop policy if exists "authenticated_read_horizon_treatment_attempts"
  on public.horizon_treatment_attempts;

create policy "authenticated_read_horizon_treatment_attempts"
  on public.horizon_treatment_attempts
  for select
  using ((select auth.uid()) is not null);

-- Persiste a resolucao e o historico na mesma transacao. Isso elimina a
-- janela em que o item voltava para pending antes de sua tentativa ser
-- auditada e torna retries HTTP idempotentes para estados terminais.
create or replace function public.resolve_horizon_treatment_queue(
  p_queue_id uuid,
  p_requested_status text,
  p_erro text default null
)
returns table(
  resolved_queue_id uuid,
  persisted_status text,
  persisted_tentativas integer,
  attempt_id uuid,
  already_resolved boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.horizon_treatment_queue%rowtype;
  v_status text;
  v_tentativas integer;
  v_erro text := left(nullif(trim(p_erro), ''), 1000);
  v_attempt_id uuid;
begin
  if p_requested_status is null
    or p_requested_status not in ('done', 'already_synced', 'no_horizon_match', 'error') then
    raise exception 'status de resolucao Horizon invalido: %', p_requested_status
      using errcode = '22023';
  end if;

  select q.*
  into v_row
  from public.horizon_treatment_queue q
  where q.id = p_queue_id
  for update;

  if not found then
    raise exception 'pendencia Horizon nao encontrada: %', p_queue_id
      using errcode = 'P0002';
  end if;

  if v_row.status in ('done', 'already_synced', 'no_horizon_match', 'error') then
    return query
    select v_row.id, v_row.status, v_row.tentativas, null::uuid, true;
    return;
  end if;

  if p_requested_status in ('done', 'already_synced') then
    v_status := p_requested_status;
    v_tentativas := 0;
    v_erro := null;
  else
    v_tentativas := coalesce(v_row.tentativas, 0) + 1;
    v_status := case
      when p_requested_status = 'error' and v_tentativas < 3 then 'pending'
      else p_requested_status
    end;
  end if;

  update public.horizon_treatment_queue q
  set status = v_status,
      tentativas = v_tentativas,
      erro = v_erro,
      claimed_at = null,
      lease_expires_at = null,
      updated_at = now()
  where q.id = v_row.id;

  insert into public.horizon_treatment_attempts (
    queue_id,
    requested_status,
    persisted_status,
    tentativa,
    erro,
    empresa,
    placa,
    ocorrido_em
  ) values (
    v_row.id,
    p_requested_status,
    v_status,
    v_tentativas,
    v_erro,
    v_row.empresa,
    v_row.placa,
    v_row.ocorrido_em
  )
  returning id into v_attempt_id;

  return query
  select v_row.id, v_status, v_tentativas, v_attempt_id, false;
end;
$$;

revoke all on function public.resolve_horizon_treatment_queue(uuid, text, text) from public;
revoke all on function public.resolve_horizon_treatment_queue(uuid, text, text) from anon;
revoke all on function public.resolve_horizon_treatment_queue(uuid, text, text) from authenticated;
grant execute on function public.resolve_horizon_treatment_queue(uuid, text, text) to service_role;

comment on function public.resolve_horizon_treatment_queue(uuid, text, text) is
  'Resolve uma pendencia Horizon e grava a tentativa atomicamente, com retry idempotente.';
