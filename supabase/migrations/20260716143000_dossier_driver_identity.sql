-- Identidade segura e consultas enxutas para Dossies.
--
-- Quando existe um prontuario, seu UUID e a identidade principal. Fontes que
-- ainda nao possuem esse UUID (telemetria e atendimentos) sao relacionadas
-- somente pela composicao exata nome normalizado + placa normalizada. Isso
-- evita que homonimos ou veiculos diferentes sejam unidos por consultas OR.

create or replace function public.normalize_dossier_driver_name(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select lower(regexp_replace(btrim(coalesce(p_value, '')), '[[:space:]]+', ' ', 'g'));
$$;

create or replace function public.normalize_dossier_plate(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select upper(regexp_replace(coalesce(p_value, ''), '[^[:alnum:]]+', '', 'g'));
$$;

create or replace function public.is_dossier_driver_name(p_name text, p_plate text)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $$
  select public.normalize_dossier_driver_name(p_name) <> ''
    and public.normalize_dossier_plate(p_name) <> public.normalize_dossier_plate(p_plate)
    and public.normalize_dossier_plate(p_name) !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'
    and public.normalize_dossier_plate(p_name) !~ '^[A-Z]{3}[0-9]{4}$';
$$;

revoke all on function public.normalize_dossier_driver_name(text) from public, anon;
revoke all on function public.normalize_dossier_plate(text) from public, anon;
revoke all on function public.is_dossier_driver_name(text, text) from public, anon;
grant execute on function public.normalize_dossier_driver_name(text) to authenticated, service_role;
grant execute on function public.normalize_dossier_plate(text) to authenticated, service_role;
grant execute on function public.is_dossier_driver_name(text, text) to authenticated, service_role;

-- A chave antiga impedia dois homonimos com placas diferentes de terem ficha.
-- As colunas geradas permitem que o PostgREST use a identidade composta em
-- INSERT ... ON CONFLICT sem confiar em caixa, espacos ou formatacao da placa.
alter table public.driver_health
  add column if not exists motorista_nome_normalizado text
    generated always as (public.normalize_dossier_driver_name(motorista_nome)) stored,
  add column if not exists placa_normalizada text
    generated always as (public.normalize_dossier_plate(placa)) stored;

alter table public.driver_health
  drop constraint if exists driver_health_motorista_nome_key;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'driver_health_dossier_identity_key'
      and conrelid = 'public.driver_health'::regclass
  ) then
    alter table public.driver_health
      add constraint driver_health_dossier_identity_key
      unique (motorista_nome_normalizado, placa_normalizada);
  end if;
end;
$$;

-- Documentos passam a acompanhar o UUID mesmo se nome ou placa forem editados.
-- O fallback composto continua disponivel para condutores sem prontuario.
alter table public.driver_documents
  add column if not exists driver_health_id uuid
    references public.driver_health(id) on delete set null;

update public.driver_documents d
set driver_health_id = h.id
from public.driver_health h
where d.driver_health_id is null
  and public.normalize_dossier_driver_name(d.motorista_nome) = h.motorista_nome_normalizado
  and public.normalize_dossier_plate(d.placa) = h.placa_normalizada;

create or replace function public.assign_driver_document_health_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.driver_health_id is null then
    select h.id
      into new.driver_health_id
    from public.driver_health h
    where h.motorista_nome_normalizado = public.normalize_dossier_driver_name(new.motorista_nome)
      and h.placa_normalizada = public.normalize_dossier_plate(new.placa)
    limit 1;
  end if;

  return new;
end;
$$;

revoke all on function public.assign_driver_document_health_identity() from public, anon, authenticated;

drop trigger if exists assign_driver_document_health_identity
  on public.driver_documents;
create trigger assign_driver_document_health_identity
before insert or update of motorista_nome, placa, driver_health_id
on public.driver_documents
for each row execute function public.assign_driver_document_health_identity();

create index if not exists driver_documents_health_created_idx
  on public.driver_documents (driver_health_id, created_at desc)
  where driver_health_id is not null;

create index if not exists driver_documents_dossier_identity_created_idx
  on public.driver_documents (
    public.normalize_dossier_driver_name(motorista_nome),
    public.normalize_dossier_plate(placa),
    created_at desc
  )
  where driver_health_id is null;

-- Os indices abaixo servem tanto a listagem DISTINCT ON quanto a consulta de
-- historico por identidade exata. Nenhum registro bruto e enviado ao cliente
-- para que ele faca a deduplicacao.
create index if not exists driver_events_dossier_identity_ts_idx
  on public.driver_events (
    public.normalize_dossier_driver_name(nome),
    public.normalize_dossier_plate(placa),
    ocorrido_em desc
  )
  where nome is not null;

create index if not exists atendimentos_dossier_identity_ts_idx
  on public.atendimentos (
    public.normalize_dossier_driver_name(motorista),
    public.normalize_dossier_plate(placa),
    created_at desc
  );

create or replace function public.list_dossier_drivers(
  p_search text default null,
  p_limit integer default 300,
  p_offset integer default 0
)
returns table (
  driver_health_id uuid,
  identity_key text,
  nome text,
  placa text,
  transportadora text,
  frota text,
  turno text,
  has_health_record boolean
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with health_sources as (
    select
      h.id as health_id,
      h.motorista_nome_normalizado as norm_name,
      h.placa_normalizada as norm_plate,
      h.motorista_nome as source_name,
      h.placa as source_plate,
      h.transportadora as source_carrier,
      h.frota as source_fleet,
      h.turno as source_shift,
      h.updated_at as seen_at,
      3 as source_priority
    from public.driver_health h
  ),
  event_sources as (
    select distinct on (n.norm_name, n.norm_plate)
      null::uuid as health_id,
      n.norm_name,
      n.norm_plate,
      n.source_name,
      n.source_plate,
      n.source_carrier,
      n.source_fleet,
      n.source_shift,
      n.seen_at,
      2 as source_priority
    from (
      select
        public.normalize_dossier_driver_name(e.nome) as norm_name,
        public.normalize_dossier_plate(e.placa) as norm_plate,
        e.nome as source_name,
        e.placa as source_plate,
        e.transportadora as source_carrier,
        e.frota as source_fleet,
        e.turno as source_shift,
        e.ocorrido_em as seen_at
      from public.driver_events e
      where e.nome is not null
        and public.is_dossier_driver_name(e.nome, e.placa)
    ) n
    order by n.norm_name, n.norm_plate, n.seen_at desc
  ),
  attendance_sources as (
    select distinct on (n.norm_name, n.norm_plate)
      null::uuid as health_id,
      n.norm_name,
      n.norm_plate,
      n.source_name,
      n.source_plate,
      n.source_carrier,
      null::text as source_fleet,
      null::text as source_shift,
      n.seen_at,
      1 as source_priority
    from (
      select
        public.normalize_dossier_driver_name(a.motorista) as norm_name,
        public.normalize_dossier_plate(a.placa) as norm_plate,
        a.motorista as source_name,
        a.placa as source_plate,
        a.transportadora as source_carrier,
        a.created_at as seen_at
      from public.atendimentos a
      where public.is_dossier_driver_name(a.motorista, a.placa)
    ) n
    order by n.norm_name, n.norm_plate, n.seen_at desc
  ),
  raw_sources as (
    select * from event_sources
    union all
    select * from attendance_sources
  ),
  resolved_sources as (
    select * from health_sources
    union all
    select
      h.health_id,
      r.norm_name,
      r.norm_plate,
      r.source_name,
      r.source_plate,
      r.source_carrier,
      r.source_fleet,
      r.source_shift,
      r.seen_at,
      r.source_priority
    from raw_sources r
    left join health_sources h
      on h.norm_name = r.norm_name
     and h.norm_plate = r.norm_plate
  ),
  grouped as (
    select
      r.health_id,
      case
        when r.health_id is not null then 'health:' || r.health_id::text
        else 'driver:' || r.norm_name || '|' || r.norm_plate
      end as driver_key,
      r.norm_name,
      r.norm_plate,
      (array_agg(nullif(btrim(r.source_name), '') order by r.source_priority desc, r.seen_at desc)
        filter (where nullif(btrim(r.source_name), '') is not null))[1] as driver_name,
      (array_agg(nullif(btrim(r.source_plate), '') order by r.source_priority desc, r.seen_at desc)
        filter (where nullif(btrim(r.source_plate), '') is not null))[1] as driver_plate,
      (array_agg(nullif(btrim(r.source_carrier), '') order by r.source_priority desc, r.seen_at desc)
        filter (where nullif(btrim(r.source_carrier), '') is not null))[1] as driver_carrier,
      (array_agg(nullif(btrim(r.source_fleet), '') order by r.source_priority desc, r.seen_at desc)
        filter (where nullif(btrim(r.source_fleet), '') is not null))[1] as driver_fleet,
      (array_agg(nullif(btrim(r.source_shift), '') order by r.source_priority desc, r.seen_at desc)
        filter (where nullif(btrim(r.source_shift), '') is not null))[1] as driver_shift
    from resolved_sources r
    group by r.health_id, r.norm_name, r.norm_plate
  )
  select
    g.health_id,
    g.driver_key,
    g.driver_name,
    coalesce(g.driver_plate, ''),
    coalesce(g.driver_carrier, '—'),
    coalesce(g.driver_fleet, ''),
    coalesce(g.driver_shift, 'diurno'),
    g.health_id is not null
  from grouped g
  where g.driver_name is not null
    and (
      p_search is null
      or btrim(p_search) = ''
      or g.driver_name ilike '%' || btrim(p_search) || '%'
      or (
        public.normalize_dossier_plate(p_search) <> ''
        and g.norm_plate like '%' || public.normalize_dossier_plate(p_search) || '%'
      )
      or coalesce(g.driver_carrier, '') ilike '%' || btrim(p_search) || '%'
    )
  order by g.driver_name, g.driver_plate
  limit least(greatest(coalesce(p_limit, 300), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.list_dossier_drivers(text, integer, integer)
  from public, anon;
grant execute on function public.list_dossier_drivers(text, integer, integer)
  to authenticated, service_role;

create or replace function public.get_dossier_driver(
  p_driver_health_id uuid default null,
  p_motorista_nome text default null,
  p_placa text default null,
  p_event_limit integer default 200,
  p_atendimento_limit integer default 100,
  p_since timestamptz default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_health_id uuid;
  v_input_name text := btrim(coalesce(p_motorista_nome, ''));
  v_input_plate text := btrim(coalesce(p_placa, ''));
  v_name text;
  v_plate text;
  v_norm_name text;
  v_norm_plate text;
  v_health jsonb;
  v_events jsonb;
  v_event_total bigint;
  v_attendances jsonb;
  v_documents jsonb;
begin
  if p_driver_health_id is not null then
    select h.id, h.motorista_nome, coalesce(h.placa, '')
      into v_health_id, v_name, v_plate
    from public.driver_health h
    where h.id = p_driver_health_id;

    if not found then
      raise exception 'Prontuario de motorista nao encontrado'
        using errcode = 'P0002';
    end if;
  else
    if public.normalize_dossier_driver_name(v_input_name) = '' then
      raise exception 'motorista_nome ou driver_health_id e obrigatorio'
        using errcode = '22023';
    end if;

    select h.id, h.motorista_nome, coalesce(h.placa, '')
      into v_health_id, v_name, v_plate
    from public.driver_health h
    where h.motorista_nome_normalizado = public.normalize_dossier_driver_name(v_input_name)
      and h.placa_normalizada = public.normalize_dossier_plate(v_input_plate)
    limit 1;

    if not found then
      v_health_id := null;
      v_name := v_input_name;
      v_plate := v_input_plate;
    end if;
  end if;

  v_norm_name := public.normalize_dossier_driver_name(v_name);
  v_norm_plate := public.normalize_dossier_plate(v_plate);

  select to_jsonb(h)
           - 'motorista_nome_normalizado'
           - 'placa_normalizada'
    into v_health
  from public.driver_health h
  where h.id = v_health_id;

  select count(*)
    into v_event_total
  from public.driver_events e
  where public.normalize_dossier_driver_name(e.nome) = v_norm_name
    and public.normalize_dossier_plate(e.placa) = v_norm_plate
    and (p_since is null or e.ocorrido_em >= p_since);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.ocorrido_em desc), '[]'::jsonb)
    into v_events
  from (
    select
      e.id,
      e.platform_id,
      e.severidade,
      e.nome_evento,
      e.categoria_bucket,
      e.ocorrido_em,
      e.velocidade_kmh
    from public.driver_events e
    where public.normalize_dossier_driver_name(e.nome) = v_norm_name
      and public.normalize_dossier_plate(e.placa) = v_norm_plate
      and (p_since is null or e.ocorrido_em >= p_since)
    order by e.ocorrido_em desc
    limit least(greatest(coalesce(p_event_limit, 200), 1), 500)
  ) t;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
    into v_attendances
  from (
    select
      x.id,
      x.created_at,
      x.tipo,
      x.obs,
      x.operador_nome
    from public.atendimentos x
    where public.normalize_dossier_driver_name(x.motorista) = v_norm_name
      and public.normalize_dossier_plate(x.placa) = v_norm_plate
      and (p_since is null or x.created_at >= p_since)
    order by x.created_at desc
    limit least(greatest(coalesce(p_atendimento_limit, 100), 1), 500)
  ) a;

  if v_health_id is not null then
    select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc), '[]'::jsonb)
      into v_documents
    from (
      select
        x.id,
        x.driver_health_id,
        x.motorista_nome,
        x.placa,
        x.tipo_documento,
        x.file_name,
        x.storage_path,
        x.status,
        x.extracted_data,
        x.error_message,
        x.created_at,
        x.reviewed_by,
        x.reviewed_at
      from public.driver_documents x
      where x.driver_health_id = v_health_id
      order by x.created_at desc
    ) d;
  else
    select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc), '[]'::jsonb)
      into v_documents
    from (
      select
        x.id,
        x.driver_health_id,
        x.motorista_nome,
        x.placa,
        x.tipo_documento,
        x.file_name,
        x.storage_path,
        x.status,
        x.extracted_data,
        x.error_message,
        x.created_at,
        x.reviewed_by,
        x.reviewed_at
      from public.driver_documents x
      where x.driver_health_id is null
        and public.normalize_dossier_driver_name(x.motorista_nome) = v_norm_name
        and public.normalize_dossier_plate(x.placa) = v_norm_plate
      order by x.created_at desc
    ) d;
  end if;

  return jsonb_build_object(
    'driver', jsonb_build_object(
      'driver_health_id', v_health_id,
      'identity_key', case
        when v_health_id is not null then 'health:' || v_health_id::text
        else 'driver:' || v_norm_name || '|' || v_norm_plate
      end,
      'nome', v_name,
      'placa', v_plate
    ),
    'health', v_health,
    'telemetry_events', coalesce(v_events, '[]'::jsonb),
    'telemetry_total', coalesce(v_event_total, 0),
    'atendimentos', coalesce(v_attendances, '[]'::jsonb),
    'documents', coalesce(v_documents, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_dossier_driver(uuid, text, text, integer, integer, timestamptz)
  from public, anon;
grant execute on function public.get_dossier_driver(uuid, text, text, integer, integer, timestamptz)
  to authenticated, service_role;

comment on function public.list_dossier_drivers(text, integer, integer) is
  'Lista identidades de condutores agregadas no banco sem transferir driver_events brutos.';
comment on function public.get_dossier_driver(uuid, text, text, integer, integer, timestamptz) is
  'Retorna um dossie por UUID ou por nome normalizado + placa, sempre com correspondencia AND.';

analyze public.driver_health;
analyze public.driver_documents;
analyze public.driver_events;
analyze public.atendimentos;
