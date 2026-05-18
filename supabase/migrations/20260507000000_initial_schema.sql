-- ============================================================
-- MedNet · Baseline schema (migration.sql + v2 + v3 + v4 + v6)
-- Applied before Supabase migration tracking was set up.
-- ============================================================

-- ── Tabela de atendimentos ──────────────────────────────────
create table if not exists public.atendimentos (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  motorista       text not null,
  placa           text,
  transportadora  text,
  operador_id     uuid references auth.users(id) on delete set null,
  operador_nome   text not null,
  tipo            text not null check (tipo in ('intervencao', 'reportar', 'descarte', 'limpeza')),
  obs             text,
  hora            text
);

alter table public.atendimentos enable row level security;

create index if not exists atendimentos_created_at_idx  on public.atendimentos (created_at desc);
create index if not exists atendimentos_operador_id_idx on public.atendimentos (operador_id);
create index if not exists atendimentos_tipo_idx        on public.atendimentos (tipo);
create index if not exists atendimentos_placa_idx       on public.atendimentos (placa);

alter publication supabase_realtime add table public.atendimentos;

-- ── Templates ──────────────────────────────────────────────
create table if not exists public.templates (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tag        text not null,
  tag_label  text not null,
  title      text not null,
  body       text not null
);
alter table public.templates enable row level security;
create policy "auth_all_templates" on public.templates
  for all to authenticated using (true) with check (true);

-- ── Links rápidos ──────────────────────────────────────────
create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  section     text not null default 'interno',
  name        text not null,
  description text,
  icon        text default 'ti-link',
  bg          text,
  ic          text,
  url         text not null
);
alter table public.links enable row level security;
create policy "auth_all_links" on public.links
  for all to authenticated using (true) with check (true);

-- ── Workspace (páginas) ─────────────────────────────────────
create table if not exists public.ws_pages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  title       text not null,
  icon_index  int not null default 0,
  category    text not null default 'protocolos',
  favorite    boolean not null default false,
  content     text
);
alter table public.ws_pages enable row level security;
create policy "auth_all_ws_pages" on public.ws_pages
  for all to authenticated using (true) with check (true);

-- ── Notas ──────────────────────────────────────────────────
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title      text not null,
  body       text
);
alter table public.notes enable row level security;
create policy "auth_all_notes" on public.notes
  for all to authenticated using (true) with check (true);

-- ── Lembretes ──────────────────────────────────────────────
create table if not exists public.reminders (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  title         text not null,
  sub           text,
  time          text not null,
  urgent        boolean not null default false,
  done          boolean not null default false,
  reminder_date date not null default current_date
);
alter table public.reminders enable row level security;
create policy "auth_all_reminders" on public.reminders
  for all to authenticated using (true) with check (true);

-- ── Perfis de operadores ────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  cargo      text,
  role       text not null default 'operador',
  created_at timestamptz not null default now(),
  last_seen  timestamptz
);
alter table public.profiles enable row level security;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_insert" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles_update" on public.profiles
  for update to authenticated using (id = (select auth.uid()));

-- ── Notas pessoais ─────────────────────────────────────────
alter table public.notes
  add column if not exists is_personal boolean not null default false,
  add column if not exists author_id   uuid references auth.users(id) on delete set null;

drop policy if exists "auth_all_notes" on public.notes;

create policy "notes_select" on public.notes
  for select to authenticated
  using (is_personal = false or author_id = (select auth.uid()));

create policy "notes_insert" on public.notes
  for insert to authenticated
  with check (is_personal = false or author_id = (select auth.uid()));

create policy "notes_update" on public.notes
  for update to authenticated
  using (is_personal = false or author_id = (select auth.uid()));

create policy "notes_delete" on public.notes
  for delete to authenticated
  using (is_personal = false or author_id = (select auth.uid()));

-- ── Security hardening (v4) ─────────────────────────────────
drop policy if exists "auth_all_links" on public.links;
create policy "auth_all_links" on public.links
  for all to authenticated
  using  ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "auth_all_templates" on public.templates;
create policy "auth_all_templates" on public.templates
  for all to authenticated
  using  ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "auth_all_ws_pages" on public.ws_pages;
create policy "auth_all_ws_pages" on public.ws_pages
  for all to authenticated
  using  ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "auth_all_reminders" on public.reminders;
create policy "auth_all_reminders" on public.reminders
  for all to authenticated
  using  ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "notes_insert" on public.notes;
drop policy if exists "notes_select" on public.notes;
drop policy if exists "notes_update" on public.notes;
drop policy if exists "notes_delete" on public.notes;

create policy "notes_select" on public.notes
  for select to authenticated
  using (is_personal = false or author_id = (select auth.uid()));

create policy "notes_insert" on public.notes
  for insert to authenticated
  with check (is_personal = false or author_id = (select auth.uid()));

create policy "notes_update" on public.notes
  for update to authenticated
  using (is_personal = false or author_id = (select auth.uid()));

create policy "notes_delete" on public.notes
  for delete to authenticated
  using (is_personal = false or author_id = (select auth.uid()));

drop policy if exists "Operadores leem atendimentos" on public.atendimentos;
drop policy if exists "Operadores inserem atendimentos" on public.atendimentos;

create policy "Operadores leem atendimentos" on public.atendimentos
  for select to authenticated
  using ((select auth.role()) = 'authenticated');

create policy "Operadores inserem atendimentos" on public.atendimentos
  for insert to authenticated
  with check ((select auth.role()) = 'authenticated');

-- ── rls_auto_enable: event trigger helper (v4) ─────────────
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
as $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

-- ── position em links (v6) ──────────────────────────────────
alter table public.links add column if not exists position integer;

with ordered as (
  select id, row_number() over (order by created_at) as pos
  from public.links
)
update public.links
set position = ordered.pos
from ordered
where public.links.id = ordered.id;
