-- ============================================================
-- MedNet Â· Baseline schema (migration.sql + v2 + v3 + v4 + v6)
-- Applied before Supabase migration tracking was set up.
-- ============================================================

--  Tabela de atendimentos
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

--  Templates
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

--  Links rÃ¡pidos
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

--  Workspace (páginas)
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

--  Notas
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

--  Lembretes
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

--  Perfis de operadores
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

--  Notas pessoais
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

--  Security hardening (v4)
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

--  rls_auto_enable: event trigger helper (v4)
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

--  position em links (v6)
alter table public.links add column if not exists position integer;

with ordered as (
  select id, row_number() over (order by created_at) as pos
  from public.links
)
update public.links
set position = ordered.pos
from ordered
where public.links.id = ordered.id;


-- Migration v5: is_admin(), í­ndices e correção de acesso anon

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


alter table public.reminders add column if not exists icon character varying;


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


alter table public.ws_pages add column if not exists position integer;

with ordered as (
  select id, row_number() over (order by created_at) - 1 as pos
  from public.ws_pages
)
update public.ws_pages
set position = ordered.pos
from ordered
where public.ws_pages.id = ordered.id;


alter table public.templates add column if not exists position integer;

with ordered as (
  select id, row_number() over (order by created_at) - 1 as pos
  from public.templates
)
update public.templates
set position = ordered.pos
from ordered
where public.templates.id = ordered.id;


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


-- Migration v10: credenciais de integração por operador

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS maxtrack_email        TEXT,
  ADD COLUMN IF NOT EXISTS maxtrack_password     TEXT,
  ADD COLUMN IF NOT EXISTS sascar_token          TEXT,
  ADD COLUMN IF NOT EXISTS sascar_token_saved_at TIMESTAMPTZ;


REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;


DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "workspace_images_public_read" ON storage.objects;

CREATE POLICY "avatars_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "workspace_images_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'workspace-images');


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


DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR is_admin());


-- ============================================================
-- Drivers queue Â· fila compartilhada de motoristas com alertas
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


-- Permite que admins apaguem registros de atendimentos.
-- Necessário para a função "Limpar histórico" do painel Admin.

drop policy if exists "Admins apagam atendimentos" on public.atendimentos;

create policy "Admins apagam atendimentos" on public.atendimentos
  for delete to authenticated
  using (public.is_admin());


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


-- RF01: Infraestrutura de Automação RPA
--
-- 1. Remove tabelas órfãs da automação anterior (Edge Functions já deletadas)
-- 2. Cria tabela rpa_credentials (credenciais do robô, lidas só pela VPS via service_role)
-- 3. Semeia chave rpa_config em app_settings

--  1. Limpeza das tabelas órfãs
DROP TABLE IF EXISTS maxtrack_cache;
DROP TABLE IF EXISTS maxtrack_sessions;

--  2. Credenciais do robô
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

--  3. Configuração do robô em app_settings
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


-- Habilita que o frontend (operadores autenticados) grave eventos diretamente
-- na tabela de histórico permanente driver_events durante upload manual.

CREATE POLICY "authenticated insert driver_events"
  ON public.driver_events FOR INSERT TO authenticated
  WITH CHECK (true);


-- Adiciona colunas de identificação e classificação editáveis ao prontuário do motorista.
ALTER TABLE public.driver_health
  ADD COLUMN IF NOT EXISTS placa text,
  ADD COLUMN IF NOT EXISTS transportadora text,
  ADD COLUMN IF NOT EXISTS frota text,
  ADD COLUMN IF NOT EXISTS turno text;


