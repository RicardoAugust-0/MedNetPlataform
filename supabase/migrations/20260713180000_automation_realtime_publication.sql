-- Garante que os cards, logs e fila das automações recebam eventos Realtime.
-- A migration legada adicionava várias tabelas num único bloco com exception:
-- uma duplicata na primeira tabela impedia as demais de serem publicadas.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'automations'
  ) then
    alter publication supabase_realtime add table public.automations;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'automation_logs'
  ) then
    alter publication supabase_realtime add table public.automation_logs;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'horizon_treatment_queue'
  ) then
    alter publication supabase_realtime add table public.horizon_treatment_queue;
  end if;
end
$$;

comment on table public.automation_logs is
  'Histórico operacional das automações, publicado no Supabase Realtime.';
