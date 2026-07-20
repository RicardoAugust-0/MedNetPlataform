-- Registra mensagens recebidas do webhook Meta de forma atomica e idempotente.
-- Retries concorrentes com o mesmo meta_message_id nao podem incrementar duas
-- vezes o contador do chat nem regredir/alterar o ultimo horario de mensagem.

create or replace function public.record_whatsapp_inbound_message(
  p_phone text,
  p_name text,
  p_message_id text,
  p_body text,
  p_created_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_chat_id uuid;
  v_created_at timestamptz := coalesce(p_created_at, now());
  v_inserted integer := 0;
begin
  if nullif(btrim(p_phone), '') is null then
    raise exception 'Telefone do WhatsApp e obrigatorio'
      using errcode = '22023';
  end if;

  if nullif(btrim(p_message_id), '') is null then
    raise exception 'Identificador da mensagem e obrigatorio'
      using errcode = '22023';
  end if;

  if p_body is null then
    raise exception 'Conteudo da mensagem e obrigatorio'
      using errcode = '22023';
  end if;

  insert into public.whatsapp_chats (
    phone,
    name,
    last_message_at,
    unread_count
  ) values (
    btrim(p_phone),
    coalesce(nullif(btrim(p_name), ''), 'Contato WhatsApp'),
    v_created_at,
    0
  )
  on conflict (phone) do update
  set name = excluded.name
  returning id into v_chat_id;

  insert into public.whatsapp_messages (
    chat_id,
    direction,
    body,
    status,
    meta_message_id,
    created_at
  ) values (
    v_chat_id,
    'inbound',
    p_body,
    'sent',
    btrim(p_message_id),
    v_created_at
  )
  on conflict (meta_message_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.whatsapp_chats
    set last_message_at = greatest(last_message_at, v_created_at),
        unread_count = unread_count + 1
    where id = v_chat_id;
  end if;

  return v_inserted = 1;
end;
$$;

revoke all on function public.record_whatsapp_inbound_message(
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.record_whatsapp_inbound_message(
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;

-- O frontend de chat ja usa as rotas autenticadas do backend para todas as
-- mutacoes e acessa estas tabelas diretamente apenas pelo Realtime. Remove a
-- possibilidade de um JWT autenticado fabricar mensagens/unread_count.
drop policy if exists "authenticated_all_whatsapp_chats"
  on public.whatsapp_chats;
drop policy if exists "authenticated_read_whatsapp_chats"
  on public.whatsapp_chats;
create policy "authenticated_read_whatsapp_chats"
  on public.whatsapp_chats for select to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "authenticated_all_whatsapp_messages"
  on public.whatsapp_messages;
drop policy if exists "authenticated_read_whatsapp_messages"
  on public.whatsapp_messages;
create policy "authenticated_read_whatsapp_messages"
  on public.whatsapp_messages for select to authenticated
  using ((select auth.uid()) is not null);

comment on function public.record_whatsapp_inbound_message(text, text, text, text, timestamptz) is
  'Registra inbound do Meta com deduplicacao transacional e atualiza o chat somente para mensagens novas.';
