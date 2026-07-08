-- =========================================================
-- FULL UNIFIED SCHEMA GENERATED AUTOMATICALLY
-- Generated on: 2026-06-25T17:39:47.627Z
-- =========================================================

-- =========================================================
-- MIGRATION: 20260507000000_initial_schema.sql
-- =========================================================

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
  bucket          text check (bucket in ('intervencao', 'reportar', 'tecnico')),
  obs             text,
  hora            text
);

alter table public.atendimentos enable row level security;

create index if not exists atendimentos_created_at_idx  on public.atendimentos (created_at desc);
create index if not exists atendimentos_operador_id_idx on public.atendimentos (operador_id);
create index if not exists atendimentos_tipo_idx        on public.atendimentos (tipo);
create index if not exists atendimentos_bucket_idx      on public.atendimentos (bucket);
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


-- =========================================================
-- MIGRATION: 20260508024239_fix_profiles_select_and_is_admin_anon.sql
-- =========================================================

-- Migration v5: is_admin(), índices e correção de acesso anon

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from anon;

drop policy if exists "profiles_admin_update" on public.profiles;

create policy "profiles_admin_update" on public.profiles
  for update to authenticated
  using (public.is_admin());

create index if not exists notes_author_id_idx   on public.notes (author_id);
create index if not exists notes_is_personal_idx on public.notes (is_personal);
create index if not exists reminders_date_idx    on public.reminders (reminder_date);
create index if not exists reminders_done_idx    on public.reminders (done);
create index if not exists ws_pages_category_idx on public.ws_pages (category);
create index if not exists ws_pages_favorite_idx on public.ws_pages (favorite);


-- =========================================================
-- MIGRATION: 20260509145953_add_icon_to_reminders.sql
-- =========================================================

alter table public.reminders add column if not exists icon character varying;


-- =========================================================
-- MIGRATION: 20260509153426_workspace_images_bucket.sql
-- =========================================================

-- Migration: workspace_images_bucket

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspace-images',
  'workspace-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "workspace_images_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'workspace-images');

CREATE POLICY "workspace_images_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'workspace-images');

CREATE POLICY "workspace_images_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'workspace-images' AND owner = auth.uid());


-- =========================================================
-- MIGRATION: 20260509163941_add_position_to_ws_pages.sql
-- =========================================================

alter table public.ws_pages add column if not exists position integer;

with ordered as (
  select id, row_number() over (order by created_at) - 1 as pos
  from public.ws_pages
)
update public.ws_pages
set position = ordered.pos
from ordered
where public.ws_pages.id = ordered.id;


-- =========================================================
-- MIGRATION: 20260509164800_add_position_to_templates.sql
-- =========================================================

alter table public.templates add column if not exists position integer;

with ordered as (
  select id, row_number() over (order by created_at) - 1 as pos
  from public.templates
)
update public.templates
set position = ordered.pos
from ordered
where public.templates.id = ordered.id;


-- =========================================================
-- MIGRATION: 20260511133252_add_app_settings_maintenance.sql
-- =========================================================

-- Migration v8: modo manutenção (app_settings)

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_select" on public.app_settings;
create policy "app_settings_select" on public.app_settings
  for select to authenticated using (true);

drop policy if exists "app_settings_admin_insert" on public.app_settings;
create policy "app_settings_admin_insert" on public.app_settings
  for insert to authenticated with check (public.is_admin());

drop policy if exists "app_settings_admin_update" on public.app_settings;
create policy "app_settings_admin_update" on public.app_settings
  for update to authenticated using (public.is_admin());

drop policy if exists "app_settings_admin_delete" on public.app_settings;
create policy "app_settings_admin_delete" on public.app_settings
  for delete to authenticated using (public.is_admin());

insert into public.app_settings (key, value)
values ('maintenance', '{"enabled": false, "message": ""}'::jsonb)
on conflict (key) do nothing;

alter publication supabase_realtime add table public.app_settings;


-- =========================================================
-- MIGRATION: 20260513120018_v9_profile_personalization.sql
-- =========================================================

-- Migration v9: personalização de perfil + bucket avatars

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS telefone   TEXT,
  ADD COLUMN IF NOT EXISTS bio        TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_auth_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND owner = auth.uid());

CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND owner = auth.uid());


-- =========================================================
-- MIGRATION: 20260515100142_add_sascar_token_saved_at.sql
-- =========================================================

-- Migration v10: credenciais de integrações por operador

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS maxtrack_email        TEXT,
  ADD COLUMN IF NOT EXISTS maxtrack_password     TEXT,
  ADD COLUMN IF NOT EXISTS sascar_token          TEXT,
  ADD COLUMN IF NOT EXISTS sascar_token_saved_at TIMESTAMPTZ;


-- =========================================================
-- MIGRATION: 20260515235258_fix_function_execute_permissions.sql
-- =========================================================

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;


-- =========================================================
-- MIGRATION: 20260515235307_fix_storage_listing_policies.sql
-- =========================================================

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "workspace_images_public_read" ON storage.objects;

CREATE POLICY "avatars_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "workspace_images_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'workspace-images');


-- =========================================================
-- MIGRATION: 20260515235318_create_profile_credentials_isolate_password.sql
-- =========================================================

CREATE TABLE public.profile_credentials (
  id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  maxtrack_password text,
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE public.profile_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creds_select_own" ON public.profile_credentials
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "creds_insert_own" ON public.profile_credentials
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "creds_update_own" ON public.profile_credentials
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "creds_delete_own" ON public.profile_credentials
  FOR DELETE TO authenticated
  USING (id = (SELECT auth.uid()));

INSERT INTO public.profile_credentials (id, maxtrack_password)
SELECT id, maxtrack_password
FROM public.profiles
WHERE maxtrack_password IS NOT NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS maxtrack_password;


-- =========================================================
-- MIGRATION: 20260515235326_consolidate_profiles_update_policies.sql
-- =========================================================

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR is_admin());


-- =========================================================
-- MIGRATION: 20260518211646_drivers_queue.sql
-- =========================================================

-- ============================================================
-- Drivers queue · fila compartilhada de motoristas com alertas
-- 1 linha por (placa, platform_id). Realtime habilitado para
-- propagar mudanças entre os ~6 operadores em tempo real.
-- ============================================================

create table if not exists public.drivers_queue (
  id                      uuid primary key default gen_random_uuid(),
  placa                   text not null,
  platform_id             text not null,
  nome                    text,
  transportadora          text,
  frota                   text,
  turno                   text,
  alertas                 int  not null default 0,
  tipos                   jsonb not null default '[]'::jsonb,
  ultimo_evento           timestamptz,
  reportaveis             int  not null default 0,
  tipos_reportar          jsonb not null default '[]'::jsonb,
  ultimo_evento_reportar  timestamptz,
  tecnicos                int  not null default 0,
  tipos_tecnico           jsonb not null default '{}'::jsonb,
  eventos_detalhados      jsonb not null default '[]'::jsonb,
  severidade              text,
  loaded_at               timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  updated_by              uuid references auth.users(id) on delete set null,
  constraint drivers_queue_placa_uk unique (placa)
);

create index if not exists drivers_queue_platform_idx    on public.drivers_queue (platform_id);
create index if not exists drivers_queue_updated_at_idx  on public.drivers_queue (updated_at desc);
create index if not exists drivers_queue_alertas_idx     on public.drivers_queue (alertas) where alertas > 0;

-- Mantém updated_at em todo UPDATE
create or replace function public.drivers_queue_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists drivers_queue_touch_updated_at on public.drivers_queue;
create trigger drivers_queue_touch_updated_at
  before update on public.drivers_queue
  for each row execute function public.drivers_queue_touch_updated_at();

-- Realtime: envia old row em UPDATE/DELETE para os clientes saberem o que mudou
alter table public.drivers_queue replica identity full;
alter publication supabase_realtime add table public.drivers_queue;

-- Sem RLS (mesmo padrão de public.atendimentos atualmente)


-- =========================================================
-- MIGRATION: 20260518231355_atendimentos_admin_delete_policy.sql
-- =========================================================

-- Permite que admins apaguem registros de atendimentos.
-- Necessário para a função "Limpar histórico" do painel Admin.

drop policy if exists "Admins apagam atendimentos" on public.atendimentos;

create policy "Admins apagam atendimentos" on public.atendimentos
  for delete to authenticated
  using (public.is_admin());


-- =========================================================
-- MIGRATION: 20260519000000_drivers_queue_rls_policies.sql
-- =========================================================

-- RLS policies for drivers_queue
-- All authenticated operators share read/write access to the queue

CREATE POLICY "drivers_queue_select" ON public.drivers_queue
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "drivers_queue_insert" ON public.drivers_queue
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "drivers_queue_update" ON public.drivers_queue
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "drivers_queue_delete" ON public.drivers_queue
  FOR DELETE TO authenticated
  USING (true);


-- =========================================================
-- MIGRATION: 20260519110000_maxtrack_cache_and_sessions.sql
-- =========================================================

-- Cache do cookie de sessão Maxtrack por usuário (evita login a cada pull)
CREATE TABLE maxtrack_sessions (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cookie     text        NOT NULL,
  cco        text        NOT NULL,
  expires_at timestamptz NOT NULL
);

ALTER TABLE maxtrack_sessions ENABLE ROW LEVEL SECURITY;

-- Cache dos eventos buscados por usuário (evita re-pull dentro do TTL)
CREATE TABLE maxtrack_cache (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  events     jsonb       NOT NULL DEFAULT '[]',
  fetched_at timestamptz NOT NULL
);

ALTER TABLE maxtrack_cache ENABLE ROW LEVEL SECURITY;


-- =========================================================
-- MIGRATION: 20260527000001_driver_events.sql
-- =========================================================

-- Histórico permanente de eventos brutos de telemetria.
--
-- Cada linha representa um alerta individual capturado pelo RPA (ou upload manual).
-- A chave única (platform_id, placa, ocorrido_em, nome_evento) garante idempotência:
-- o writer da VPS pode usar INSERT … ON CONFLICT DO NOTHING sem checar duplicatas.
--
-- Hot tier: mantém os últimos 12 meses em produção.
-- Cold tier: job mensal na VPS arquiva eventos > 12 meses em Supabase Storage
--            como JSONL comprimido (event-archives/{ano}/{mes}.jsonl.gz).

CREATE TABLE driver_events (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Origem
  platform_id           text        NOT NULL,  -- 'maxtrack' | 'sascar' | …

  -- Identificação do motorista/veículo
  placa                 text        NOT NULL,
  nome                  text,
  cpf                   text,
  matricula             text,
  transportadora        text,
  frota                 text,

  -- Evento
  nome_evento           text        NOT NULL,   -- 'Detecção olhos fechados ou falta de atenção - N1'
  descricao             text,                   -- 'Desatenção / Fadiga'
  categoria_bucket      text,                   -- 'intervencao' | 'reportar' | 'tecnico'
  severidade            text,                   -- 'Gravíssimo' | 'Grave' | 'Normal'
  turno                 text,                   -- 'diurno' | 'noturno'

  -- Contexto do evento
  localidade            text,
  velocidade_kmh        numeric,
  duracao_seg           numeric,
  analise_ia_plataforma text,                   -- análise da própria Maxtrack ('Concluído - Positivo' etc.)
  raw_event_type_id     text,                   -- 'Id do Evento' da plataforma (código de tipo, não instância)

  -- Timestamps
  ocorrido_em           timestamptz NOT NULL,   -- quando o alerta aconteceu na estrada
  importado_em          timestamptz DEFAULT now(),

  -- Deduplicação: INSERT … ON CONFLICT DO NOTHING no writer da VPS
  UNIQUE (platform_id, placa, ocorrido_em, nome_evento)
);

-- Índices para queries de relatório
CREATE INDEX driver_events_placa_ts    ON driver_events (placa,          ocorrido_em DESC);
CREATE INDEX driver_events_transp_ts   ON driver_events (transportadora, ocorrido_em DESC);
CREATE INDEX driver_events_platform_ts ON driver_events (platform_id,    ocorrido_em DESC);
CREATE INDEX driver_events_bucket_ts   ON driver_events (categoria_bucket, ocorrido_em DESC);

-- RLS: operadores autenticados leem (painel Relatórios).
-- Inserções apenas via service_role (VPS) — service_role bypassa RLS por padrão no Supabase.
ALTER TABLE driver_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read driver_events"
  ON driver_events FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- =========================================================
-- MIGRATION: 20260527000002_rpa_infrastructure.sql
-- =========================================================

-- RF01: Infraestrutura de Automação RPA
--
-- 1. Remove tabelas órfãs da automação anterior (Edge Functions já deletadas)
-- 2. Cria tabela rpa_credentials (credenciais do robô, lidas só pela VPS via service_role)
-- 3. Semeia chave rpa_config em app_settings

-- ── 1. Limpeza das tabelas órfãs ────────────────────────────────────────────
DROP TABLE IF EXISTS maxtrack_cache;
DROP TABLE IF EXISTS maxtrack_sessions;

-- ── 2. Credenciais do robô ───────────────────────────────────────────────────
-- Cada linha é uma conta dedicada por plataforma (maxtrack, sascar, …).
-- INSERT/UPDATE/DELETE: admin autenticado.
-- SELECT: admin autenticado (email visível na UI, senha apenas texto cifrado na VPS).
-- A VPS lê com service_role (bypassa RLS) via SUPABASE_SERVICE_KEY em .env.

CREATE TABLE rpa_credentials (
  platform_id  text        PRIMARY KEY,                              -- 'maxtrack' | 'sascar' | …
  email        text        NOT NULL,
  password     text        NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE rpa_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_rpa_credentials" ON rpa_credentials
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 3. Configuração do robô em app_settings ─────────────────────────────────
-- Campos lidos/escritos pela UI (admin):  enabled, interval_minutes
-- Campos escritos pela VPS (service_role): last_run_at, last_run_status, last_run_message
-- Campos informativos:                     platforms (lista das plataformas gerenciadas)

INSERT INTO app_settings (key, value)
VALUES (
  'rpa_config',
  '{
    "enabled": false,
    "interval_minutes": 30,
    "platforms": ["maxtrack"],
    "last_run_at": null,
    "last_run_status": null,
    "last_run_message": null
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;


-- =========================================================
-- MIGRATION: 20260527000003_ai_credentials.sql
-- =========================================================

-- Credenciais de provedores de IA para geração de relatórios.
-- Mesmo padrão de rpa_credentials: admin escreve via browser, edge function lê via service_role.

CREATE TABLE ai_credentials (
  provider    text        PRIMARY KEY,   -- 'anthropic' | 'google'
  api_key     text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE ai_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_ai_credentials" ON ai_credentials
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());

-- Configuração pública: qual provedor/modelo usar por padrão (sem dados sensíveis).
INSERT INTO app_settings (key, value)
VALUES (
  'ai_config',
  '{
    "provider": "anthropic",
    "anthropic_model": "claude-sonnet-4-6",
    "google_model": "gemini-2.5-flash"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;


-- =========================================================
-- MIGRATION: 20260527000004_driver_health.sql
-- =========================================================

-- Tabela de prontuário clínico e dados de saúde do motorista.
-- Vinculada ao nome do motorista.

CREATE TABLE if not exists public.driver_health (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  motorista_nome      text        NOT NULL UNIQUE,
  escala_epworth      integer     CHECK (escala_epworth >= 0 AND escala_epworth <= 24),
  polissonografia     text,
  historico_clinico   text,
  ultimo_exame_em     date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Habilita RLS
ALTER TABLE public.driver_health ENABLE ROW LEVEL SECURITY;

-- Políticas para acesso dos operadores autenticados
CREATE POLICY "authenticated_select_driver_health" ON public.driver_health
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_driver_health" ON public.driver_health
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_driver_health" ON public.driver_health
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_driver_health" ON public.driver_health
  FOR DELETE TO authenticated
  USING (true);


-- =========================================================
-- MIGRATION: 20260527000005_driver_events_insert_policy.sql
-- =========================================================

-- Habilita que o frontend (operadores autenticados) grave eventos diretamente
-- na tabela de histórico permanente driver_events durante upload manual.

CREATE POLICY "authenticated insert driver_events"
  ON public.driver_events FOR INSERT TO authenticated
  WITH CHECK (true);


-- =========================================================
-- MIGRATION: 20260527000006_add_metadata_to_driver_health.sql
-- =========================================================

-- Adiciona colunas de identificação e classificação editáveis ao prontuário do motorista.
ALTER TABLE public.driver_health
  ADD COLUMN IF NOT EXISTS placa text,
  ADD COLUMN IF NOT EXISTS transportadora text,
  ADD COLUMN IF NOT EXISTS frota text,
  ADD COLUMN IF NOT EXISTS turno text;


-- =========================================================
-- MIGRATION: 20260527000007_distinct_transportadoras_rpc.sql
-- =========================================================

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


-- =========================================================
-- MIGRATION: 20260528092430_restrict_templates_links_ws_pages.sql
-- =========================================================

-- ============================================================
-- Migration: Restrição de acesso para Operadores Padrão
-- E introdução da permissão para Liderança (role = 'lider')
-- ============================================================

-- Criar a função can_modify_knowledge que autoriza admin e lider
create or replace function public.can_modify_knowledge()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'lider')
  );
$$;

revoke execute on function public.can_modify_knowledge() from anon;
grant execute on function public.can_modify_knowledge() to authenticated;

-- ============================================================
-- 1. Políticas RLS para public.templates
-- ============================================================
drop policy if exists "auth_all_templates" on public.templates;
drop policy if exists "templates_select_all" on public.templates;
drop policy if exists "templates_modify_authorized" on public.templates;

create policy "templates_select_all" on public.templates
  for select to authenticated
  using (true);

create policy "templates_modify_authorized" on public.templates
  for all to authenticated
  using (public.can_modify_knowledge())
  with check (public.can_modify_knowledge());

-- ============================================================
-- 2. Políticas RLS para public.links
-- ============================================================
drop policy if exists "auth_all_links" on public.links;
drop policy if exists "links_select_all" on public.links;
drop policy if exists "links_modify_authorized" on public.links;

create policy "links_select_all" on public.links
  for select to authenticated
  using (true);

create policy "links_modify_authorized" on public.links
  for all to authenticated
  using (public.can_modify_knowledge())
  with check (public.can_modify_knowledge());

-- ============================================================
-- 3. Políticas RLS para public.ws_pages (Workspace)
-- ============================================================
drop policy if exists "auth_all_ws_pages" on public.ws_pages;
drop policy if exists "ws_pages_select_all" on public.ws_pages;
drop policy if exists "ws_pages_modify_authorized" on public.ws_pages;

create policy "ws_pages_select_all" on public.ws_pages
  for select to authenticated
  using (true);

create policy "ws_pages_modify_authorized" on public.ws_pages
  for all to authenticated
  using (public.can_modify_knowledge())
  with check (public.can_modify_knowledge());


-- =========================================================
-- MIGRATION: 20260528101500_embedded_sheet_integration.sql
-- =========================================================

-- ============================================================
-- Migration: Planilha Embutida (Embedded Sheet) & Controle de Sync
-- Tabela public.intervencoes_sheet + Triggers de sincronização
-- ============================================================

-- Habilitar a extensão pg_net caso não esteja ativa
create extension if not exists pg_net;

-- ── 1. Tabela de Intervenções (Planilha Embutida) ─────────────────────────
create table if not exists public.intervencoes_sheet (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  
  -- Dados da Intervenção (mapeados para a Planilha)
  data            text not null,
  empresa         text not null,
  sistema         text not null,
  colaborador     text not null,
  placa           text not null,
  frota           text,
  criticidade     text not null,
  classificacao   text not null,
  
  -- Controle de Status/Realização (operador edita diretamente na Grid)
  realizado       text not null default 'NÃO', -- 'SIM' ou 'NÃO'
  motivo          text,
  solicitado_por  text,
  hora_solicitacao text,
  realizado_por   text,
  hora_realizacao text,
  justificativa   text,
  
  -- Colunas de Controle de Sincronização com o Google Sheets
  status_sync      text not null default 'pendente' check (status_sync in ('pendente', 'sincronizado', 'erro')),
  tentativas_sync  integer not null default 0,
  ultimo_erro_sync text,
  linha_sheet      text
);

-- Habilitar RLS
alter table public.intervencoes_sheet enable row level security;

-- Índices para otimização de buscas e relatórios
create index if not exists intervencoes_sheet_status_sync_idx on public.intervencoes_sheet (status_sync);
create index if not exists intervencoes_sheet_placa_idx on public.intervencoes_sheet (placa);
create index if not exists intervencoes_sheet_created_at_idx on public.intervencoes_sheet (created_at desc);

-- ── 2. Políticas RLS (Acesso para operadores autenticados) ──────────────────
drop policy if exists "Operadores leem intervencoes_sheet" on public.intervencoes_sheet;
create policy "Operadores leem intervencoes_sheet" on public.intervencoes_sheet
  for select to authenticated
  using (true);

drop policy if exists "Operadores inserem intervencoes_sheet" on public.intervencoes_sheet;
create policy "Operadores inserem intervencoes_sheet" on public.intervencoes_sheet
  for insert to authenticated
  with check (true);

drop policy if exists "Operadores atualizam intervencoes_sheet" on public.intervencoes_sheet;
create policy "Operadores atualizam intervencoes_sheet" on public.intervencoes_sheet
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists "Admins apagam intervencoes_sheet" on public.intervencoes_sheet;
create policy "Admins apagam intervencoes_sheet" on public.intervencoes_sheet
  for delete to authenticated
  using (public.is_admin());

-- Trigger para atualizar updated_at automaticamente
create or replace function public.touch_intervencoes_sheet_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_intervencoes_sheet_updated_at on public.intervencoes_sheet;
create trigger touch_intervencoes_sheet_updated_at
  before update on public.intervencoes_sheet
  for each row execute function public.touch_intervencoes_sheet_updated_at();

-- ── 3. Realtime Enablement ─────────────────────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.intervencoes_sheet;
exception
  when others then null;
end;
$$;

create or replace function public.trigger_espelhamento_sheets_fn()
returns trigger
language plpgsql
security definer
as $$
DECLARE
  payload jsonb;
  should_sync boolean := false;
  req_host text;
  func_url text;
BEGIN
  -- Se for INSERT, sincroniza apenas se o status for 'pendente'
  -- (evita disparar trigger ao importar dados pré-existentes da planilha)
  IF TG_OP = 'INSERT' THEN
    IF NEW.status_sync = 'pendente' THEN
      should_sync := true;
    END IF;
  -- Se for UPDATE, sincroniza apenas se houve alteração em algum dado operacional
  ELSIF TG_OP = 'UPDATE' THEN
    IF (
      old.data is distinct from new.data or
      old.empresa is distinct from new.empresa or
      old.sistema is distinct from new.sistema or
      old.colaborador is distinct from new.colaborador or
      old.placa is distinct from new.placa or
      old.frota is distinct from new.frota or
      old.criticidade is distinct from new.criticidade or
      old.classificacao is distinct from new.classificacao or
      old.realizado is distinct from new.realizado or
      old.motivo is distinct from new.motivo or
      old.solicitado_por is distinct from new.solicitado_por or
      old.hora_solicitacao is distinct from new.hora_solicitacao or
      old.realizado_por is distinct from new.realizado_por or
      old.hora_realizacao is distinct from new.hora_realizacao or
      old.justificativa is distinct from new.justificativa
    ) THEN
      should_sync := true;
    END IF;
  END IF;

  -- Disparo assíncrono para a Edge Function via pg_net apenas se necessário
  IF should_sync THEN
    payload := jsonb_build_object(
      'type', TG_OP,
      'record', row_to_json(NEW)
    );

    -- Recupera o host da requisição atual via PostgREST
    req_host := COALESCE(
      current_setting('request.headers', true)::json->>'host',
      -- Fallback se for execução interna / background (usando o ID do projeto cloud)
      'jvqlxrixzqlbwmmdwcob.supabase.co'
    );
    
    -- Se o host for local, direciona para o kong interno do docker. Caso contrário, monta a URL pública.
    IF req_host LIKE 'localhost%' OR req_host LIKE '127.0.0.1%' OR req_host = 'kong:8000' THEN
      func_url := 'http://kong:8000/functions/v1/append-sheet';
    ELSE
      func_url := 'https://' || req_host || '/functions/v1/append-sheet';
    END IF;

    -- Verifica dinamicamente se a extensão pg_net está no schema 'net' ou 'extensions'
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
      EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
      USING func_url,
            payload,
            jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', COALESCE(
                current_setting('request.headers', true)::json->>'authorization',
                'Bearer SYSTEM_TRIGGER'
              )
            ),
            5000;
    ELSIF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
      EXECUTE 'SELECT extensions.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
      USING func_url,
            payload,
            jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', COALESCE(
                current_setting('request.headers', true)::json->>'authorization',
                'Bearer SYSTEM_TRIGGER'
              )
            ),
            5000;
    ELSE
      RAISE EXCEPTION 'Extensao pg_net nao encontrada. Habilite-a no seu painel ou via SQL.';
    END IF;
  END IF;

  return new;
END;
$$;

-- Criar o trigger na tabela
drop trigger if exists trigger_espelhamento_sheets on public.intervencoes_sheet;
create trigger trigger_espelhamento_sheets
  after insert or update on public.intervencoes_sheet
  for each row
  execute function public.trigger_espelhamento_sheets_fn();


-- =========================================================
-- MIGRATION: 20260529120000_secure_append_sheet_trigger.sql
-- =========================================================

-- ============================================================
-- Migration: Endurecer a autenticação do espelhamento Sheets
--
-- Substitui o literal hardcoded 'Bearer SYSTEM_TRIGGER' por um secret
-- compartilhado lido do Vault (`trigger_secret`). A função append-sheet
-- passa a aceitar esse secret via env TRIGGER_SECRET.
--
-- PROVISIONAMENTO (obrigatório para fechar a brecha — fazer os DOIS):
--   1. Vault (banco):
--        select vault.create_secret('<VALOR_ALEATORIO_LONGO>', 'trigger_secret');
--   2. Edge Function (Supabase → Functions → append-sheet → Secrets):
--        TRIGGER_SECRET=<MESMO_VALOR_ALEATORIO_LONGO>
--
-- Enquanto o secret NÃO estiver provisionado, o comportamento permanece
-- idêntico ao atual (fallback para 'SYSTEM_TRIGGER'), sem downtime.
-- ============================================================

create or replace function public.trigger_espelhamento_sheets_fn()
returns trigger
language plpgsql
security definer
as $$
DECLARE
  payload jsonb;
  should_sync boolean := false;
  req_host text;
  func_url text;
  v_secret text;
  auth_header text;
BEGIN
  -- Se for INSERT, sincroniza apenas se o status for 'pendente'
  -- (evita disparar trigger ao importar dados pré-existentes da planilha)
  IF TG_OP = 'INSERT' THEN
    IF NEW.status_sync = 'pendente' THEN
      should_sync := true;
    END IF;
  -- Se for UPDATE, sincroniza apenas se houve alteração em algum dado operacional
  ELSIF TG_OP = 'UPDATE' THEN
    IF (
      old.data is distinct from new.data or
      old.empresa is distinct from new.empresa or
      old.sistema is distinct from new.sistema or
      old.colaborador is distinct from new.colaborador or
      old.placa is distinct from new.placa or
      old.frota is distinct from new.frota or
      old.criticidade is distinct from new.criticidade or
      old.classificacao is distinct from new.classificacao or
      old.realizado is distinct from new.realizado or
      old.motivo is distinct from new.motivo or
      old.solicitado_por is distinct from new.solicitado_por or
      old.hora_solicitacao is distinct from new.hora_solicitacao or
      old.realizado_por is distinct from new.realizado_por or
      old.hora_realizacao is distinct from new.hora_realizacao or
      old.justificativa is distinct from new.justificativa
    ) THEN
      should_sync := true;
    END IF;
  END IF;

  -- Disparo assíncrono para a Edge Function via pg_net apenas se necessário
  IF should_sync THEN
    payload := jsonb_build_object(
      'type', TG_OP,
      'record', row_to_json(NEW)
    );

    -- Resolve o secret compartilhado via Vault (se disponível).
    -- Em ambientes sem Vault (ex.: local) cai no fallback legado mais abaixo.
    BEGIN
      SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets
      WHERE name = 'trigger_secret'
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_secret := NULL;
    END;

    -- Preferência: 1) JWT do operador (request atual) 2) secret do Vault 3) literal legado
    auth_header := COALESCE(
      current_setting('request.headers', true)::json->>'authorization',
      CASE WHEN v_secret IS NOT NULL THEN 'Bearer ' || v_secret END,
      'Bearer SYSTEM_TRIGGER'
    );

    -- Recupera o host da requisição atual via PostgREST
    req_host := COALESCE(
      current_setting('request.headers', true)::json->>'host',
      -- Fallback se for execução interna / background (usando o ID do projeto cloud)
      'jvqlxrixzqlbwmmdwcob.supabase.co'
    );

    -- Se o host for local, direciona para o kong interno do docker. Caso contrário, monta a URL pública.
    IF req_host LIKE 'localhost%' OR req_host LIKE '127.0.0.1%' OR req_host = 'kong:8000' THEN
      func_url := 'http://kong:8000/functions/v1/append-sheet';
    ELSE
      func_url := 'https://' || req_host || '/functions/v1/append-sheet';
    END IF;

    -- Verifica dinamicamente se a extensão pg_net está no schema 'net' ou 'extensions'
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
      EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
      USING func_url,
            payload,
            jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', auth_header
            ),
            5000;
    ELSIF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
      EXECUTE 'SELECT extensions.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
      USING func_url,
            payload,
            jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', auth_header
            ),
            5000;
    ELSE
      RAISE EXCEPTION 'Extensao pg_net nao encontrada. Habilite-a no seu painel ou via SQL.';
    END IF;
  END IF;

  return new;
END;
$$;


-- =========================================================
-- MIGRATION: 20260618000000_driver_events_delete_policy.sql
-- =========================================================

-- Permite que usuários autenticados excluam registros de driver_events.
-- Necessário para a funcionalidade "Remover fonte" da tela de Analytics.

create policy "authenticated delete driver_events"
  on public.driver_events for delete to authenticated
  using (true);


-- =========================================================
-- MIGRATION: 20260619120000_analytics_indexes.sql
-- =========================================================

-- Fase 1 do plano de aceleração do Analytics: índices adicionais.
--
-- O servidor sempre exclui criticidade "Leve" da análise (excludeLeve / filtro
-- "severidade is distinct from 'Leve'"). Os índices parciais abaixo casam com
-- essa exclusão para que as RPCs de agregação (analytics_metadata / get_analytics)
-- e a busca por janela usem índice em vez de varrer a tabela inteira.
--
-- Observação de paridade: usamos "is distinct from 'Leve'" (NÃO "<> 'Leve'"),
-- porque o caminho JS mantém linhas com severidade NULL na análise
-- (null !== 'Leve' é verdadeiro; normCrit(null) => 'Médio'). "<> 'Leve'"
-- descartaria os NULLs e divergiria do JS.

-- Janela por plataforma/tempo (caso comum: um mês de uma plataforma).
create index if not exists driver_events_platform_ts_active
  on driver_events (platform_id, ocorrido_em desc)
  where severidade is distinct from 'Leve';

-- Agrupamento/filtro por empresa (frota).
create index if not exists driver_events_frota_active
  on driver_events (frota)
  where severidade is distinct from 'Leve';

-- Agregações por tipo de evento.
create index if not exists driver_events_platform_evento_active
  on driver_events (platform_id, nome_evento)
  where severidade is distinct from 'Leve';

analyze driver_events;


-- =========================================================
-- MIGRATION: 20260619120100_analytics_helpers_and_metadata_rpc.sql
-- =========================================================

-- Fase 2 do plano de aceleração do Analytics.
--
-- (a) Funções-helper que replicam EXATAMENTE a normalização do fatigueParser.js
--     (norm / normCrit / normClf / toUF). O caminho JS re-normaliza os valores
--     crus do banco dentro de aggregate(); para a RPC bater com o JS na paridade,
--     o SQL precisa aplicar a mesma normalização — não basta assumir que a coluna
--     já está normalizada.
-- (b) RPC analytics_metadata: monta os dropdowns (meses / tipos / frotas) sem
--     baixar todas as linhas. A resolução de frota -> empresa (carrier_aliases)
--     continua no servidor (matching por substring sobre JSON em app_settings).

-- ── norm(): trim + lower + remoção de acentos (Português) ──
create or replace function analytics_norm(s text)
returns text
language sql
immutable
as $$
  select translate(
    lower(trim(coalesce(s, ''))),
    'àáâãäåèéêëìíîïòóôõöøùúûüçñ',
    'aaaaaaeeeeiiiioooooouuuucn'
  );
$$;

-- ── normCrit(): {Gravíssimo, Grave, Médio, Leve}, mesma ordem de testes do JS ──
create or replace function analytics_norm_crit(v text)
returns text
language plpgsql
immutable
as $$
declare s text;
begin
  s := analytics_norm(v);
  if s = '' then return 'Médio'; end if;
  if s like '%gravi%' or s like '%critic%' or s like '% n2%' or s like '%n2'
     or s like '%altiss%' or s like '%alta%' or s like '%alto%' then
    return 'Gravíssimo';
  end if;
  if s like '%grave%' or s like '%moder%' then
    return 'Grave';
  end if;
  if s like '%leve%' or s = 'baixo' or s = 'baixa' then
    return 'Leve';
  end if;
  return 'Médio';
end;
$$;

-- ── normClf(): {Positivo, Falso positivo, Não classificado} ──
-- "Improcedente" contém "procede" => testar Falso positivo ANTES de Positivo.
create or replace function analytics_norm_clf(v text)
returns text
language plpgsql
immutable
as $$
declare s text;
begin
  s := analytics_norm(v);
  if s = '' then return 'Não classificado'; end if;
  if s like '%falso%' or s like '%improced%' then
    return 'Falso positivo';
  end if;
  if s like '%positiv%' or s like '%confirmad%' or s like '%procede%'
     or s like '%verdadeir%' or s like '%real%' or s like '%valido%' then
    return 'Positivo';
  end if;
  return 'Não classificado';
end;
$$;

-- ── toUF(): última sigla [A-Z]{2} que seja uma UF válida (igual ao JS) ──
-- WITH ORDINALITY garante a ordem dos matches (rn). O JS itera de trás p/ frente
-- e devolve a primeira sigla válida => aqui: maior rn que seja UF (order by rn desc).
create or replace function analytics_to_uf(v text)
returns text
language sql
immutable
as $$
  select m.arr[1]
  from regexp_matches(upper(coalesce(v, '')), '\m[A-Z]{2}\M', 'g')
       with ordinality as m(arr, rn)
  where m.arr[1] = any (array[
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
    'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  ])
  order by m.rn desc
  limit 1;
$$;

-- ── RPC de metadados (dropdowns) ──
-- months: desc (servidor corta em 12, igual a sort().reverse().slice(0,12) do JS).
-- types : nome_evento distintos, asc.
-- fleets: valor cru de frota (com fallback p/ transportadora) -> contagem.
--         O servidor resolve aliases p/ montar availableCompanies.
create or replace function analytics_metadata(p_platform_ids text[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select frota, transportadora, nome_evento, ocorrido_em
    from driver_events
    where platform_id = any (p_platform_ids)
      and severidade is distinct from 'Leve'
  )
  select jsonb_build_object(
    'months', (
      select coalesce(jsonb_agg(m order by m desc), '[]'::jsonb)
      from (
        select distinct to_char(ocorrido_em at time zone 'America/Sao_Paulo', 'YYYY-MM') m
        from base
      ) s
    ),
    'types', (
      select coalesce(jsonb_agg(t order by t), '[]'::jsonb)
      from (
        select distinct nome_evento t
        from base
        where nome_evento is not null and nome_evento <> ''
      ) s
    ),
    'fleets', (
      select coalesce(jsonb_object_agg(fleet, c), '{}'::jsonb)
      from (
        select coalesce(nullif(frota, ''), nullif(transportadora, ''), '') as fleet,
               count(*) c
        from base
        group by 1
      ) f
    )
  );
$$;

revoke execute on function analytics_metadata(text[]) from anon;
grant execute on function analytics_metadata(text[]) to authenticated;


-- =========================================================
-- MIGRATION: 20260619120200_get_analytics_rpc.sql
-- =========================================================

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


-- =========================================================
-- MIGRATION: 20260619130000_add_evidence_and_treatment_columns.sql
-- =========================================================

-- Adiciona colunas de evidência e tratativa à tabela driver_events
alter table driver_events add column if not exists evidencia text;
alter table driver_events add column if not exists inicio_tratativa timestamptz;
alter table driver_events add column if not exists fim_tratativa timestamptz;

-- Função auxiliar para validar presença de evidência (idêntica ao hasEvid do JS)
create or replace function analytics_has_evid(v text)
returns boolean
language plpgsql
immutable
as $$
declare s text;
begin
  if v is null or v = '' then
    return false;
  end if;
  s := analytics_norm(v);
  if s = '0' or s = '-' or s like '%sem%' or s like '%aguard%' or s like '%indispon%' or s = 'nao' or s like '%nao %' or s like '%false%' then
    return false;
  end if;
  return true;
end;
$$;

-- Atualização da RPC get_analytics para computar os novos indicadores
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
      e.evidencia, e.inicio_tratativa, e.fim_tratativa,
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
        'pct_evidencia', (
          select case when count(evidencia) = 0 then null
                      else round(100.0 * count(*) filter (where analytics_has_evid(evidencia)) / count(evidencia), 1)::float8
                 end
          from base
        ),
        'vel_mediana', (select round((percentile_cont(0.5) within group (order by velocidade_kmh))::numeric)::int from v),
        'vel_media',   (select round(avg(velocidade_kmh), 1)::float8 from v),
        'pct_vel_alta',(select case when count(*) = 0 then null
                         else round(100.0 * count(*) filter (where velocidade_kmh > 60) / count(*), 1)::float8 end from v),
        't_ini_mediana', (
          select round(
            coalesce(
              percentile_cont(0.5) within group (order by extract(epoch from (inicio_tratativa - ocorrido_em)) / 60.0),
              null
            )::numeric,
            1
          )::float8
          from base
          where inicio_tratativa is not null
            and ocorrido_em is not null
            and inicio_tratativa >= ocorrido_em
            and inicio_tratativa - ocorrido_em <= interval '24 hours'
        ),
        't_fin_mediana', (
          select round(
            coalesce(
              percentile_cont(0.5) within group (order by extract(epoch from (fim_tratativa - ocorrido_em)) / 60.0),
              null
            )::numeric,
            1
          )::float8
          from base
          where fim_tratativa is not null
            and ocorrido_em is not null
            and fim_tratativa >= ocorrido_em
            and fim_tratativa - ocorrido_em <= interval '72 hours'
        )
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
    'evidencia', (
      select case when count(evidencia) = 0 then null
                  else jsonb_build_object(
                    'disp', count(*) filter (where analytics_has_evid(evidencia)),
                    'aguard', count(*) filter (where not analytics_has_evid(evidencia))
                  )
             end
      from base
    ),
    'hasEvidence', (
      select count(evidencia) > 0 from base
    ),
    'categorias', (select coalesce(jsonb_object_agg(d, c), '{}'::jsonb)
        from (select trim(descricao) d, count(*) c from base
              where trim(coalesce(descricao, '')) <> '' group by 1) s)
  ) into result;

  return result;
end;
$$;

revoke execute on function get_analytics(text[], timestamptz, timestamptz, text[], text, text, text, boolean, boolean, text) from anon;
grant execute on function get_analytics(text[], timestamptz, timestamptz, text[], text, text, text, boolean, boolean, text) to authenticated;


-- =========================================================
-- MIGRATION: 20260622134000_whatsapp_integration.sql
-- =========================================================

-- Migration: WhatsApp API Integration and Cost Tracking
-- Target: Supabase database

-- 1. Table for WhatsApp credentials
CREATE TABLE IF NOT EXISTS public.whatsapp_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  whatsapp_business_account_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.whatsapp_credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can perform all actions on credentials
CREATE POLICY "admin_all_whatsapp_credentials" ON public.whatsapp_credentials
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2. Table for WhatsApp templates cache
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  language TEXT NOT NULL,
  status TEXT NOT NULL,
  components JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Policies: Authenticated users can read templates, only admins can modify
CREATE POLICY "authenticated_select_whatsapp_templates" ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admin_all_whatsapp_templates" ON public.whatsapp_templates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Table for WhatsApp dispatches history and logs
CREATE TABLE IF NOT EXISTS public.whatsapp_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  template_name TEXT NOT NULL,
  category TEXT,
  estimated_cost NUMERIC(10,4) DEFAULT 0.0000,
  status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  variables JSONB NOT NULL DEFAULT '[]'::JSONB,
  error_message TEXT,
  meta_message_id TEXT,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.whatsapp_dispatches ENABLE ROW LEVEL SECURITY;

-- Policies: Authenticated users can read and insert dispatches
CREATE POLICY "authenticated_select_whatsapp_dispatches" ON public.whatsapp_dispatches
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_whatsapp_dispatches" ON public.whatsapp_dispatches
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "admin_all_whatsapp_dispatches" ON public.whatsapp_dispatches
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS whatsapp_dispatches_created_at_idx ON public.whatsapp_dispatches (created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_dispatches_meta_message_id_idx ON public.whatsapp_dispatches (meta_message_id);

-- 4. Add tables to realtime publication if possible
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_dispatches;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_templates;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_credentials;
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$$;


-- =========================================================
-- MIGRATION: 20260622144700_whatsapp_chat_system.sql
-- =========================================================

-- Migration: WhatsApp Live Chat System and Messaging Logs
-- Target: Supabase database

-- 1. Table for WhatsApp Chat Sessions
CREATE TABLE IF NOT EXISTS public.whatsapp_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_chats ENABLE ROW LEVEL SECURITY;

-- Policies for whatsapp_chats
CREATE POLICY "authenticated_all_whatsapp_chats" ON public.whatsapp_chats
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Table for WhatsApp Messages
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  meta_message_id TEXT UNIQUE,
  error_message TEXT,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Policies for whatsapp_messages
CREATE POLICY "authenticated_all_whatsapp_messages" ON public.whatsapp_messages
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Indexes for Performance
CREATE INDEX IF NOT EXISTS whatsapp_chats_last_msg_idx ON public.whatsapp_chats (last_message_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_chat_id_idx ON public.whatsapp_messages (chat_id);
CREATE INDEX IF NOT EXISTS whatsapp_messages_meta_id_idx ON public.whatsapp_messages (meta_message_id);

-- 4. Enable Supabase Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_chats;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$$;


-- =========================================================
-- MIGRATION: 20260622150000_analytics_generated_columns.sql
-- =========================================================

-- Aceleração do Analytics — Fase 5: normalização na ESCRITA (colunas geradas).
--
-- Diagnóstico (277k linhas, instância Micro): o get_analytics gastava ~44s
-- ("todos os meses") porque cada um dos ~15 sub-agregados re-chamava as funções
-- plpgsql de normalização POR LINHA (analytics_norm_crit / _clf / _to_uf). Um
-- único passe dessas funções sobre a tabela inteira já custava ~4,5s; multiplicado
-- pelos passes, dava os 40s+. A CPU é o gargalo (cache hit 100%, vCPU burstable).
--
-- Solução: materializar a normalização UMA VEZ, no momento da escrita, como colunas
-- STORED. As funções são todas IMMUTABLE, então o resultado é idêntico ao que o
-- caminho JS (aggregate) e a RPC calculavam em tempo de consulta — paridade
-- preservada. A partir daqui as queries leem colunas de texto simples (comparação
-- barata) em vez de chamar plpgsql por linha.
--
-- Colunas:
--   sev_norm   = analytics_norm_crit(severidade)            -- {Gravíssimo,Grave,Médio,Leve}
--   clf_norm   = analytics_norm_clf(analise_ia_plataforma)  -- {Positivo,Falso positivo,Não classificado}
--   uf         = analytics_to_uf(localidade)                -- sigla UF ou NULL
--   fleet_raw  = frota (fallback transportadora, '' se nenhum) -- mesma expressão do get_analytics
--
-- Custo único: ADD COLUMN ... GENERATED ... STORED reescreve a tabela uma vez
-- (~88MB). As 4 colunas vão num único ALTER para fazer apenas UM rewrite.

alter table driver_events
  add column sev_norm  text generated always as (analytics_norm_crit(severidade)) stored,
  add column clf_norm  text generated always as (analytics_norm_clf(analise_ia_plataforma)) stored,
  add column uf        text generated always as (analytics_to_uf(localidade)) stored,
  add column fleet_raw text generated always as
    (coalesce(nullif(frota, ''), nullif(transportadora, ''), '')) stored;

-- Índice parcial p/ agrupamento por empresa usando a coluna já materializada
-- (substitui o uso de driver_events_frota_active quando filtramos por fleet_raw).
create index if not exists driver_events_fleet_raw_active
  on driver_events (platform_id, fleet_raw)
  where severidade is distinct from 'Leve';

analyze driver_events;


-- =========================================================
-- MIGRATION: 20260622150100_get_analytics_fast.sql
-- =========================================================

-- Aceleração do Analytics — Fase 6: get_analytics em passe único.
--
-- Reescreve get_analytics SEM mudar assinatura nem shape de saída (paridade
-- byte-a-byte com a versão anterior, validada por md5 sobre dados reais).
--
-- Mudanças de performance (não de resultado):
--  1. Usa as colunas geradas sev_norm / clf_norm / uf / fleet_raw (migration
--     20260622150000) em vez de chamar analytics_norm_crit / _clf / _to_uf por
--     linha. Some o custo plpgsql repetido em ~15 sub-agregados.
--  2. CTEs base_all / base / bkt marcadas MATERIALIZED: o scan da tabela acontece
--     UMA vez; os sub-agregados varrem o tuplestore em memória, não a heap.
--  3. base_all projeta só as colunas usadas (tuplestore mais estreito).
--  4. SET work_mem alto SÓ durante a função, p/ o tuplestore/hashaggs ficarem em
--     RAM (evita spill em disco numa instância pequena).
--
-- Paridade preservada: as colunas geradas usam EXATAMENTE as mesmas funções
-- immutable; filtros, ordenações e desempates continuam idênticos.

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
set work_mem = '64MB'
as $$
declare
  result jsonb;
begin
  with base_all as materialized (
    select
      e.placa, e.nome, e.sev_norm, e.nome_evento, e.clf_norm,
      e.velocidade_kmh, e.uf, e.descricao, e.ocorrido_em, e.fleet_raw,
      (e.ocorrido_em at time zone p_tz) as tl
    from driver_events e
    where e.platform_id = any (p_platform_ids)
      and e.severidade is distinct from 'Leve'
      and e.sev_norm <> 'Leve'
      and (p_frotas is null or e.fleet_raw = any (p_frotas))
      and (p_classification is null or p_classification = '' or p_classification = 'all'
           or e.clf_norm = p_classification)
      and (p_event_type is null or p_event_type = ''
           or e.nome_evento = p_event_type)
      and (p_severity is null or p_severity = '' or p_severity = 'all'
           or (p_severity = 'high'   and e.severidade in ('Grave', 'Gravíssimo'))
           or (p_severity = 'medium' and e.severidade = 'Médio')
           or (p_severity not in ('high', 'medium', 'all', '') and e.severidade = p_severity))
  ),
  base as materialized (
    select * from base_all
    where (p_date_from is null or ocorrido_em >= p_date_from)
      and (p_date_to   is null or ocorrido_em <= p_date_to)
  ),
  bkt as materialized (
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
      count(*) filter (where sev_norm = 'Gravíssimo') as cg,
      count(*) filter (where sev_norm = 'Grave')      as cgr,
      count(*) filter (where sev_norm = 'Médio')      as cm,
      count(*) filter (where clf_norm = 'Falso positivo') as cf
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
           cl as (select clf_norm k from base),
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
        'Positivo',         count(*) filter (where clf_norm = 'Positivo'),
        'Falso positivo',   count(*) filter (where clf_norm = 'Falso positivo'),
        'Não classificado', count(*) filter (where clf_norm = 'Não classificado')
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
      from (select uf, count(*) c from base
            where uf is not null group by 1) u
    ),
    'hora', jsonb_build_object(
      'horas', (select jsonb_agg(g order by g) from generate_series(0, 23) g),
      'valores', (select coalesce(jsonb_agg(coalesce(h.c, 0) order by g), '[]'::jsonb)
                  from generate_series(0, 23) g
                  left join (select extract(hour from tl)::int hh, count(*) c from base group by 1) h on h.hh = g),
      'valores_pos', (select coalesce(jsonb_agg(coalesce(h.c, 0) order by g), '[]'::jsonb)
                  from generate_series(0, 23) g
                  left join (select extract(hour from tl)::int hh, count(*) c from base
                             where clf_norm = 'Positivo' group by 1) h on h.hh = g)
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


-- =========================================================
-- MIGRATION: 20260622160000_analytics_daily_rollup.sql
-- =========================================================

-- Aceleração do Analytics — Fase 7: rollup diário pré-agregado.
--
-- Diagnóstico: get_analytics varre driver_events (~277k linhas) ~15 vezes por
-- carga. Mesmo otimizada (colunas geradas + passe único) isso é caro numa
-- instância Micro (CPU estrangulada). Solução estrutural: pré-agregar por dia
-- num grão minúsculo e fazer o dashboard ler o rollup em vez dos dados crus.
--
-- Cardinalidades medidas (maxtrack, 277k linhas): fleet_raw=2, nome_evento=4,
-- sev_norm<=4, clf_norm=3, uf=23, descricao=1; só motorista (1395) e placa (1061)
-- são altos. O grão (platform, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
-- tem 5.334 linhas (52x menos). Motorista/placa cabem como mapas jsonb por linha.
--
-- Tudo (exceto cnt) é jsonb {chave: contagem}, ADITIVO: mesclar várias linhas do
-- grão = somar os mapas. Velocidade é inteira (0..199) => histograma reproduz a
-- mediana exata. dow é derivado de `dia`. hora_pos (positivos) é derivado porque
-- clf_norm está no grão.

create table if not exists analytics_daily (
  platform_id   text  not null,
  dia           date  not null,
  fleet_raw     text  not null,
  sev_norm      text  not null,
  clf_norm      text  not null,
  nome_evento   text  not null,
  cnt           integer not null,
  uf_counts     jsonb not null default '{}'::jsonb,  -- {uf: c}            (uf não nulo)
  hora_counts   jsonb not null default '{}'::jsonb,  -- {'0'..'23': c}
  vel_counts    jsonb not null default '{}'::jsonb,  -- {'0'..'199': c}    (vel válida)
  desc_counts   jsonb not null default '{}'::jsonb,  -- {descricao_trim: c}
  driver_counts jsonb not null default '{}'::jsonb,  -- {nome_trim: c}     (não vazio)
  plate_counts  jsonb not null default '{}'::jsonb,  -- {placa_trim: c}    (não vazio)
  primary key (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
);

create index if not exists analytics_daily_platform_dia
  on analytics_daily (platform_id, dia);

alter table analytics_daily enable row level security;
create policy "authenticated read analytics_daily"
  on analytics_daily for select using (auth.uid() is not null);

-- ── Refresh (recompute) do rollup para um platform + conjunto de dias ──
-- p_dias null  => recomputa a plataforma inteira (rebuild).
-- p_dias array => recomputa só esses dias (incremental, barato).
create or replace function refresh_analytics_daily(p_platform text, p_dias date[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_dias is null then
    delete from analytics_daily where platform_id = p_platform;
  else
    delete from analytics_daily where platform_id = p_platform and dia = any (p_dias);
  end if;

  insert into analytics_daily (
    platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, cnt,
    uf_counts, hora_counts, vel_counts, desc_counts, driver_counts, plate_counts)
  with ev as materialized (
    select e.platform_id,
      (e.ocorrido_em at time zone 'America/Sao_Paulo')::date as dia,
      e.fleet_raw, e.sev_norm, e.clf_norm, e.nome_evento, e.uf,
      extract(hour from (e.ocorrido_em at time zone 'America/Sao_Paulo'))::int as hh,
      case when e.velocidade_kmh is not null and e.velocidade_kmh >= 0 and e.velocidade_kmh < 200
           then e.velocidade_kmh::int end as vh,
      nullif(trim(e.descricao), '') as dsc,
      nullif(trim(e.nome), '')      as drv,
      nullif(trim(e.placa), '')     as plt
    from driver_events e
    where e.platform_id = p_platform
      and e.severidade is distinct from 'Leve'
      and e.sev_norm <> 'Leve'
      and (p_dias is null
           or (e.ocorrido_em at time zone 'America/Sao_Paulo')::date = any (p_dias))
  ),
  g as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, count(*) cnt
    from ev group by 1,2,3,4,5,6),
  uf as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, jsonb_object_agg(uf, c) j
    from (select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, uf, count(*) c
          from ev where uf is not null group by 1,2,3,4,5,6,7) x
    group by 1,2,3,4,5,6),
  ho as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, jsonb_object_agg(hh::text, c) j
    from (select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, hh, count(*) c
          from ev group by 1,2,3,4,5,6,7) x
    group by 1,2,3,4,5,6),
  ve as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, jsonb_object_agg(vh::text, c) j
    from (select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, vh, count(*) c
          from ev where vh is not null group by 1,2,3,4,5,6,7) x
    group by 1,2,3,4,5,6),
  ds as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, jsonb_object_agg(dsc, c) j
    from (select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, dsc, count(*) c
          from ev where dsc is not null group by 1,2,3,4,5,6,7) x
    group by 1,2,3,4,5,6),
  dr as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, jsonb_object_agg(drv, c) j
    from (select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, drv, count(*) c
          from ev where drv is not null group by 1,2,3,4,5,6,7) x
    group by 1,2,3,4,5,6),
  pl as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, jsonb_object_agg(plt, c) j
    from (select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, plt, count(*) c
          from ev where plt is not null group by 1,2,3,4,5,6,7) x
    group by 1,2,3,4,5,6)
  select g.platform_id, g.dia, g.fleet_raw, g.sev_norm, g.clf_norm, g.nome_evento, g.cnt,
    coalesce(uf.j, '{}'::jsonb), coalesce(ho.j, '{}'::jsonb), coalesce(ve.j, '{}'::jsonb),
    coalesce(ds.j, '{}'::jsonb), coalesce(dr.j, '{}'::jsonb), coalesce(pl.j, '{}'::jsonb)
  from g
  left join uf using (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
  left join ho using (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
  left join ve using (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
  left join ds using (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
  left join dr using (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
  left join pl using (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento);
end;
$$;

-- ── Trigger de manutenção: mantém o rollup consistente com driver_events ──
-- Statement-level com transition tables: por import (em lote), recomputa só os
-- dias afetados. Cobre TODOS os caminhos de escrita (RPA/VPS, import manual,
-- edge functions), pois é no banco.
create or replace function trg_analytics_daily_ins() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select platform_id, array_agg(distinct dia) dias from (
      select platform_id, (ocorrido_em at time zone 'America/Sao_Paulo')::date dia from new_rows
    ) s group by platform_id
  loop perform refresh_analytics_daily(r.platform_id, r.dias); end loop;
  return null;
end; $$;

create or replace function trg_analytics_daily_del() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select platform_id, array_agg(distinct dia) dias from (
      select platform_id, (ocorrido_em at time zone 'America/Sao_Paulo')::date dia from old_rows
    ) s group by platform_id
  loop perform refresh_analytics_daily(r.platform_id, r.dias); end loop;
  return null;
end; $$;

create or replace function trg_analytics_daily_upd() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select platform_id, array_agg(distinct dia) dias from (
      select platform_id, (ocorrido_em at time zone 'America/Sao_Paulo')::date dia from new_rows
      union
      select platform_id, (ocorrido_em at time zone 'America/Sao_Paulo')::date dia from old_rows
    ) s group by platform_id
  loop perform refresh_analytics_daily(r.platform_id, r.dias); end loop;
  return null;
end; $$;

drop trigger if exists analytics_daily_ins on driver_events;
drop trigger if exists analytics_daily_del on driver_events;
drop trigger if exists analytics_daily_upd on driver_events;

create trigger analytics_daily_ins after insert on driver_events
  referencing new table as new_rows for each statement
  execute function trg_analytics_daily_ins();
create trigger analytics_daily_del after delete on driver_events
  referencing old table as old_rows for each statement
  execute function trg_analytics_daily_del();
create trigger analytics_daily_upd after update on driver_events
  referencing old table as old_rows new table as new_rows for each statement
  execute function trg_analytics_daily_upd();


-- =========================================================
-- MIGRATION: 20260622160100_get_analytics_rollup.sql
-- =========================================================

-- Aceleração do Analytics — Fase 8: get_analytics_rollup (lê o rollup diário).
--
-- Mesma assinatura e MESMO shape de saída que get_analytics, mas reconstrói o
-- objeto `d` a partir de analytics_daily (5.334 linhas) em vez de varrer
-- driver_events (277k). Tudo é aditivo: filtra as linhas do grão e soma os mapas.
--
-- Paridade: validada chave-a-chave contra get_analytics (caminho cru) sobre dados
-- reais. Caveat herdado (doc seção 4): o filtro de severidade usa sev_norm
-- (em produção severidade já vem normalizada, então cru == normalizado).
--
-- Mediana de velocidade: analytics_median_from_counts() reproduz round(
-- percentile_cont(0.5))::int a partir do histograma inteiro (validado).

create or replace function get_analytics_rollup(
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
    where d.platform_id = any (p_platform_ids)
      and (p_frotas is null or d.fleet_raw = any (p_frotas))
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
    select *, case when p_daily then to_char(dia, 'YYYY-MM-DD') else to_char(dia, 'YYYY-MM') end as tk
    from base
  ),
  tk_list as (
    select to_char(g, 'YYYY-MM-DD') as tk
    from generate_series(v_from, v_to, interval '1 day') g
    where p_daily and v_from is not null and v_to is not null
    union
    select distinct to_char(dia, 'YYYY-MM') as tk from base
    where not (p_daily and v_from is not null and v_to is not null)
  ),
  tk_ord as (select tk, row_number() over (order by tk) as ord from tk_list),
  per_tk as (
    select tk,
      sum(cnt) as total,
      sum(cnt) filter (where sev_norm = 'Gravíssimo')      as cg,
      sum(cnt) filter (where sev_norm = 'Grave')           as cgr,
      sum(cnt) filter (where sev_norm = 'Médio')           as cm,
      sum(cnt) filter (where clf_norm = 'Falso positivo')  as cf
    from bkt group by tk
  ),
  ts as (
    select o.ord, o.tk, coalesce(p.total,0) total, coalesce(p.cg,0) cg,
      coalesce(p.cgr,0) cgr, coalesce(p.cm,0) cm, coalesce(p.cf,0) cf
    from tk_ord o left join per_tk p on p.tk = o.tk
  ),
  ts_var as (
    select ord, tk, total, cg, cgr, cm, cf,
      case when p_daily
           then substring(tk from 9 for 2) || '/' || substring(tk from 6 for 2)
           else (array['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'])[substring(tk from 6 for 2)::int]
                || '/' || substring(tk from 3 for 2)
      end as lbl,
      case when ord = 1 then null
           when lag(total) over (order by ord) is null or lag(total) over (order by ord) = 0 then null
           else round(100.0 * (total - lag(total) over (order by ord)) / lag(total) over (order by ord), 1)::float8
      end as variacao
    from ts
  ),
  type_totals as (
    select coalesce(nullif(trim(nome_evento), ''), 'Não informado') as typ, sum(cnt) as c
    from base group by 1
  ),
  top_types as (
    select typ, c, row_number() over (order by c desc, typ asc) as rk
    from type_totals order by c desc, typ asc limit 5
  ),
  type_per_tk as (
    select tk, coalesce(nullif(trim(nome_evento), ''), 'Não informado') as typ, sum(cnt) as c
    from bkt group by 1, 2
  ),
  uf_x   as (select k as uf, sum(v::int) c from base, jsonb_each_text(uf_counts)   e(k,v) group by 1),
  drv_x  as (select k as nm, sum(v::int) c from base, jsonb_each_text(driver_counts) e(k,v) group by 1),
  plt_x  as (select k as pl, sum(v::int) c from base, jsonb_each_text(plate_counts)  e(k,v) group by 1),
  desc_x as (select k as d,  sum(v::int) c from base, jsonb_each_text(desc_counts)  e(k,v) group by 1),
  hora_x as (select k::int hh, sum(v::int) c from base, jsonb_each_text(hora_counts) e(k,v) group by 1),
  hora_pos_x as (select k::int hh, sum(v::int) c from base, jsonb_each_text(hora_counts) e(k,v)
                 where clf_norm = 'Positivo' group by 1),
  vel_x as (select k::int sp, sum(v::int) c from base, jsonb_each_text(vel_counts) e(k,v) group by 1),
  vel_stats as (
    select coalesce(sum(c),0) vcnt, coalesce(sum(sp*c),0) vsum,
      coalesce(sum(c) filter (where sp > 60),0) vgt60,
      (select jsonb_object_agg(sp::text, c) from vel_x) vjson
    from vel_x
  ),
  dow_x as (select extract(dow from dia)::int dw, sum(cnt) c from base group by 1)
  select jsonb_build_object(
    'meta', jsonb_build_object(
      'total', (select coalesce(sum(cnt),0) from base),
      'periodo', (select case when coalesce(sum(cnt),0) = 0 then null
                    else jsonb_build_array(to_char(min(dia),'DD/MM/YYYY'), to_char(max(dia),'DD/MM/YYYY')) end
                  from base),
      'motoristas', (select count(distinct upper(nm)) from drv_x),
      'veiculos',   (select count(distinct upper(pl)) from plt_x),
      'months', (select coalesce(jsonb_agg(m order by m), '[]'::jsonb)
                 from (select distinct to_char(dia,'YYYY-MM') m
                       from (select dia from base where p_window_months
                             union all select dia from base_all where not p_window_months) src) s)
    ),
    'kpis', (
      with tot as (select coalesce(sum(cnt),0)::numeric c from base)
      select jsonb_build_object(
        'total', (select coalesce(sum(cnt),0) from base),
        'pct_positivo', round(100.0 * (select coalesce(sum(cnt),0) from base where clf_norm='Positivo')        / greatest((select c from tot),1), 1)::float8,
        'pct_falso',    round(100.0 * (select coalesce(sum(cnt),0) from base where clf_norm='Falso positivo')   / greatest((select c from tot),1), 1)::float8,
        'pct_naoclass', round(100.0 * (select coalesce(sum(cnt),0) from base where clf_norm='Não classificado') / greatest((select c from tot),1), 1)::float8,
        'pct_evidencia', null,
        'vel_mediana', (select analytics_median_from_counts(vjson) from vel_stats),
        'vel_media',   (select case when vcnt = 0 then null else round(vsum::numeric / vcnt, 1)::float8 end from vel_stats),
        'pct_vel_alta',(select case when vcnt = 0 then null else round(100.0 * vgt60 / vcnt, 1)::float8 end from vel_stats),
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
                 from (select tt.typ, tt.rk,
                         (select coalesce(jsonb_agg(coalesce(tp.c,0) order by o.ord), '[]'::jsonb)
                          from tk_ord o left join type_per_tk tp on tp.tk = o.tk and tp.typ = tt.typ) as arr
                       from top_types tt) z)
    ),
    'clf_total', (select jsonb_build_object(
        'Positivo',         coalesce(sum(cnt) filter (where clf_norm='Positivo'),0),
        'Falso positivo',   coalesce(sum(cnt) filter (where clf_norm='Falso positivo'),0),
        'Não classificado', coalesce(sum(cnt) filter (where clf_norm='Não classificado'),0)
      ) from base),
    'falso_mensal', jsonb_build_object(
      'labels', (select coalesce(jsonb_agg(lbl order by ord), '[]'::jsonb) from ts_var),
      'pct',    (select coalesce(jsonb_agg(case when total=0 then 0 else round(100.0*cf/total,1)::float8 end order by ord), '[]'::jsonb) from ts_var)
    ),
    'top_motoristas', (
      select jsonb_build_object(
        'labels',  coalesce(jsonb_agg(nm order by c desc, nm asc), '[]'::jsonb),
        'valores', coalesce(jsonb_agg(c  order by c desc, nm asc), '[]'::jsonb))
      from (select nm, c from drv_x order by c desc, nm asc limit 15) d
    ),
    'top_placas', (
      select jsonb_build_object(
        'labels',  coalesce(jsonb_agg(pl order by c desc, pl asc), '[]'::jsonb),
        'valores', coalesce(jsonb_agg(c  order by c desc, pl asc), '[]'::jsonb))
      from (select pl, c from plt_x order by c desc, pl asc limit 15) d
    ),
    'frota_raw', (select coalesce(jsonb_object_agg(fleet_raw, c), '{}'::jsonb)
                  from (select fleet_raw, sum(cnt) c from base group by 1) f),
    'uf', (
      select jsonb_build_object(
        'labels',  coalesce(jsonb_agg(uf order by c desc, uf asc), '[]'::jsonb),
        'valores', coalesce(jsonb_agg(c  order by c desc, uf asc), '[]'::jsonb))
      from uf_x
    ),
    'hora', jsonb_build_object(
      'horas', (select jsonb_agg(g order by g) from generate_series(0,23) g),
      'valores', (select coalesce(jsonb_agg(coalesce(h.c,0) order by g), '[]'::jsonb)
                  from generate_series(0,23) g left join hora_x h on h.hh = g),
      'valores_pos', (select coalesce(jsonb_agg(coalesce(h.c,0) order by g), '[]'::jsonb)
                  from generate_series(0,23) g left join hora_pos_x h on h.hh = g)
    ),
    'dow', jsonb_build_object(
      'labels', jsonb_build_array('Seg','Ter','Qua','Qui','Sex','Sáb','Dom'),
      'valores', (select jsonb_agg(coalesce(d.c,0) order by m.ord)
                  from (values (1,1),(2,2),(3,3),(4,4),(5,5),(6,6),(0,7)) m(dw,ord)
                  left join dow_x d on d.dw = m.dw)
    ),
    'vel', jsonb_build_object(
      'labels', jsonb_build_array('0-20','20-40','40-60','60-70','70-80','80+'),
      'valores', (select jsonb_build_array(
          coalesce(sum(c) filter (where sp>=0  and sp<20),0),
          coalesce(sum(c) filter (where sp>=20 and sp<40),0),
          coalesce(sum(c) filter (where sp>=40 and sp<60),0),
          coalesce(sum(c) filter (where sp>=60 and sp<70),0),
          coalesce(sum(c) filter (where sp>=70 and sp<80),0),
          coalesce(sum(c) filter (where sp>=80 and sp<200),0)
        ) from vel_x)
    ),
    'evidencia', null,
    'hasEvidence', false,
    'categorias', (select coalesce(jsonb_object_agg(d, c), '{}'::jsonb) from desc_x)
  ) into result;

  return result;
end;
$$;

revoke execute on function get_analytics_rollup(text[], timestamptz, timestamptz, text[], text, text, text, boolean, boolean, text) from anon;
grant execute on function get_analytics_rollup(text[], timestamptz, timestamptz, text[], text, text, text, boolean, boolean, text) to authenticated;

-- ── Metadados (dropdowns) servidos pelo rollup — mesmo shape que analytics_metadata ──
-- months(desc) / types(asc) / fleets{fleet_raw: contagem}. O servidor resolve os
-- aliases p/ montar availableCompanies, igual ao caminho anterior.
create or replace function analytics_metadata_rollup(p_platform_ids text[])
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (select dia, nome_evento, fleet_raw, cnt from analytics_daily where platform_id = any (p_platform_ids))
  select jsonb_build_object(
    'months', (select coalesce(jsonb_agg(m order by m desc), '[]'::jsonb)
               from (select distinct to_char(dia,'YYYY-MM') m from b) s),
    'types',  (select coalesce(jsonb_agg(t order by t), '[]'::jsonb)
               from (select distinct nome_evento t from b where nome_evento is not null and nome_evento <> '') s),
    'fleets', (select coalesce(jsonb_object_agg(fleet_raw, c), '{}'::jsonb)
               from (select fleet_raw, sum(cnt) c from b group by 1) f)
  );
$$;
revoke execute on function analytics_metadata_rollup(text[]) from anon;
grant execute on function analytics_metadata_rollup(text[]) to authenticated;

-- ── Contagem de eventos ativos por plataforma (badge do /api/platforms) ──
create or replace function analytics_platform_counts()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(platform_id, c), '{}'::jsonb)
  from (select platform_id, sum(cnt) c from analytics_daily group by 1) s;
$$;
revoke execute on function analytics_platform_counts() from anon;
grant execute on function analytics_platform_counts() to authenticated;


-- =========================================================
-- MIGRATION: 20260622170000_get_analytics_rollup_multi.sql
-- =========================================================

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


-- =========================================================
-- MIGRATION: 20260625102000_remove_rpa_infrastructure.sql
-- =========================================================

-- SQL Migration: Remove Obsolete RPA Infrastructure
--
-- 1. Drops the rpa_credentials table (since MaxTrack automation credentials are managed in N8N/code)
-- 2. Removes the obsolete rpa_config from the app_settings table

-- ── 1. Drop rpa_credentials table ────────────────────────────────────────────
DROP TABLE IF EXISTS rpa_credentials;

-- ── 2. Delete rpa_config settings row ────────────────────────────────────────
DELETE FROM app_settings WHERE key = 'rpa_config';


-- =========================================================
-- MIGRATION: 20260625155200_driver_events_platform_dia_idx.sql
-- =========================================================

-- Aceleração do import: índice funcional por plataforma e dia.
--
-- O trigger statement-level `trg_analytics_daily_ins` reconstrói o rollup
-- para os dias afetados rodando a função `refresh_analytics_daily`.
-- Essa função filtra por platform_id e dia via:
--   (e.ocorrido_em at time zone 'America/Sao_Paulo')::date = any (p_dias)
-- Sem este índice funcional, o Postgres é forçado a fazer um scan sequencial
-- na plataforma inteira (~277k+ registros), fazendo com que até mesmo
-- mini-lotes (como batch size de 25) gerem timeout.
--
-- Com o índice abaixo, o Postgres pode buscar diretamente os registros
-- dos dias afetados em milissegundos.

CREATE INDEX IF NOT EXISTS driver_events_platform_dia_active
  ON driver_events (platform_id, ((ocorrido_em at time zone 'America/Sao_Paulo')::date))
  WHERE severidade IS DISTINCT FROM 'Leve' AND sev_norm <> 'Leve';

ANALYZE driver_events;


-- =========================================================
-- MIGRATION: 20260625162100_fix_horizon_classification.sql
-- =========================================================

-- Fix analytics_norm_clf parity with JS normClf
-- 1. Redefine function to include 'justific', 'invalid', 'nao procede', 'sem proced'
create or replace function analytics_norm_clf(v text)
returns text
language plpgsql
immutable
as $$
declare s text;
begin
  s := analytics_norm(v);
  if s = '' then return 'Não classificado'; end if;
  if s like '%falso%' or s like '%improced%' or s like '%invalid%'
     or s like '%nao procede%' or s like '%sem proced%' or s like '%justific%' then
    return 'Falso positivo';
  end if;
  if s like '%positiv%' or s like '%confirmad%' or s like '%procede%'
     or s like '%verdadeir%' or s like '%real%' or s like '%valido%' then
    return 'Positivo';
  end if;
  return 'Não classificado';
end;
$$;

