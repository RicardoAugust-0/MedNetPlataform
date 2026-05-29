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
