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
