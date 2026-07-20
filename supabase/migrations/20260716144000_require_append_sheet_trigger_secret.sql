-- Torna obrigatorio o secret compartilhado do espelhamento Google Sheets.
--
-- Provisionar o MESMO valor antes desta migration/deploy:
--   Banco: vault.create_secret('<valor-aleatorio-longo>', 'trigger_secret')
--   Edge Function append-sheet: TRIGGER_SECRET=<valor-aleatorio-longo>
--
-- Sem Vault/secret a mutacao operacional falha e nenhum HTTP e enviado. Nao
-- existe fallback previsivel nem reaproveitamento do JWT da requisicao.

create or replace function public.trigger_espelhamento_sheets_fn()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
  should_sync boolean := false;
  req_host text;
  func_url text;
  v_secret text;
  auth_header text;
begin
  if tg_op = 'INSERT' then
    if new.status_sync = 'pendente' then
      should_sync := true;
    end if;
  elsif tg_op = 'UPDATE' then
    if (
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
    ) then
      should_sync := true;
    end if;
  end if;

  if should_sync then
    payload := jsonb_build_object(
      'type', tg_op,
      'record', row_to_json(new)
    );

    begin
      select nullif(btrim(decrypted_secret), '')
      into v_secret
      from vault.decrypted_secrets
      where name = 'trigger_secret'
      limit 1;
    exception when others then
      raise exception 'append-sheet bloqueado: Vault/trigger_secret indisponivel'
        using errcode = 'P0001';
    end;

    if v_secret is null then
      raise exception 'append-sheet bloqueado: trigger_secret nao configurado no Vault'
        using errcode = 'P0001';
    end if;

    auth_header := 'Bearer ' || v_secret;

    req_host := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb->>'host',
      'jvqlxrixzqlbwmmdwcob.supabase.co'
    );

    if req_host like 'localhost%'
       or req_host like '127.0.0.1%'
       or req_host = 'kong:8000' then
      func_url := 'http://kong:8000/functions/v1/append-sheet';
    else
      -- Nunca concatena Host arbitrario ao destino que recebe o secret.
      func_url := 'https://jvqlxrixzqlbwmmdwcob.supabase.co/functions/v1/append-sheet';
    end if;

    if exists (
      select 1 from pg_catalog.pg_namespace where nspname = 'net'
    ) then
      execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
      using func_url,
            payload,
            jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', auth_header
            ),
            5000;
    elsif exists (
      select 1 from pg_catalog.pg_namespace where nspname = 'extensions'
    ) then
      execute 'select extensions.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
      using func_url,
            payload,
            jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', auth_header
            ),
            5000;
    else
      raise exception 'Extensao pg_net nao encontrada'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.trigger_espelhamento_sheets_fn()
  from public, anon, authenticated;

drop trigger if exists trigger_espelhamento_sheets
  on public.intervencoes_sheet;
create trigger trigger_espelhamento_sheets
after insert or update on public.intervencoes_sheet
for each row execute function public.trigger_espelhamento_sheets_fn();

comment on function public.trigger_espelhamento_sheets_fn() is
  'Dispara append-sheet somente com trigger_secret nao vazio lido do Vault; ausencia do secret bloqueia a mutacao.';
