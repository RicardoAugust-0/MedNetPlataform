-- ============================================================
-- Automações: Hooks da VPS e logs de execução
-- ============================================================

-- 1. Tabela de configurações de automação
create table if not exists public.automations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  icon        text not null default 'ti-robot',
  desc        text,
  active      boolean not null default true,
  endpoint    text not null,
  trigger     text not null check (trigger in ('manual', 'agendado', 'evento')),
  schedule    text,
  event_type  text,
  token       text,
  position    integer not null default 0
);

alter table public.automations enable row level security;

create policy "authenticated_all_automations" on public.automations
  for all to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

-- 2. Tabela de histórico/logs de execuções
create table if not exists public.automation_logs (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  automation_id  uuid references public.automations(id) on delete cascade not null,
  status         text not null check (status in ('success', 'failure', 'running')),
  duration       text,
  detail         text,
  logs           jsonb not null default '[]'::jsonb
);

alter table public.automation_logs enable row level security;

create policy "authenticated_all_automation_logs" on public.automation_logs
  for all to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

create index if not exists automation_logs_automation_id_idx on public.automation_logs (automation_id);
create index if not exists automation_logs_created_at_idx on public.automation_logs (created_at desc);

-- 3. Habilita Realtime
do $$
begin
  alter publication supabase_realtime add table public.automations;
  alter publication supabase_realtime add table public.automation_logs;
exception
  when others then null;
end;
$$;

-- 4. Semente de dados iniciais (Seed)
insert into public.automations (id, name, icon, desc, active, endpoint, trigger, schedule, event_type, token, position)
values
  (
    'b0a94e82-e3e7-4c74-bfd4-3a56df93df23', 
    'Bot_Maxtrack', 
    'ti-robot', 
    'Tratamento automático de alertas de fadiga na plataforma MaxTrack.', 
    true, 
    'https://168.231.94.0/hooks/bot-maxtrack', 
    'evento', 
    null, 
    'Alerta NV3 (sonolência grave)', 
    null, 
    0
  ),
  (
    'c1b94e82-e3e7-4c74-bfd4-3a56df93df24', 
    'Bot_HorizonScraping', 
    'ti-cloud-download', 
    'Acessa 17 contas na plataforma Horizon, extrai relatórios e envia para a pasta do OneDrive.', 
    true, 
    'https://168.231.94.0/hooks/bot-horizon', 
    'agendado', 
    'diário 06:00', 
    null, 
    null, 
    1
  )
on conflict (id) do nothing;

insert into public.automation_logs (id, automation_id, status, duration, detail, logs, created_at)
values
  (
    'd0a94e82-e3e7-4c74-bfd4-3a56df93df25', 
    'b0a94e82-e3e7-4c74-bfd4-3a56df93df23', 
    'success', 
    '2.4 s', 
    '3 alertas tratados', 
    '[
      {"t": "14:18:02", "lvl": "ok", "m": "Webhook recebido — alerta NV3 (placa BWY-3K47)"},
      {"t": "14:18:03", "lvl": "info", "m": "Autenticando sessão MaxTrack…"},
      {"t": "14:18:04", "lvl": "ok", "m": "Alerta tratado e marcado como resolvido"},
      {"t": "13:51:40", "lvl": "ok", "m": "2 alertas tratados em lote"},
      {"t": "12:30:11", "lvl": "warn", "m": "Sessão expirada — reautenticando"},
      {"t": "12:30:14", "lvl": "ok", "m": "Reautenticado · operação retomada"}
    ]'::jsonb, 
    now() - interval '4 minutes'
  ),
  (
    'e0a94e82-e3e7-4c74-bfd4-3a56df93df26', 
    'c1b94e82-e3e7-4c74-bfd4-3a56df93df24', 
    'success', 
    '8 min 12 s', 
    '17/17 contas · 17 relatórios → OneDrive', 
    '[
      {"t": "06:06:00", "lvl": "info", "m": "Iniciando rotina agendada · 17 contas na fila"},
      {"t": "06:09:22", "lvl": "ok", "m": "Contas 1–9 processadas"},
      {"t": "06:12:48", "lvl": "ok", "m": "Contas 10–17 processadas"},
      {"t": "06:14:10", "lvl": "ok", "m": "17 relatórios enviados → OneDrive/Relatorios/2026-06-11"},
      {"t": "06:14:12", "lvl": "ok", "m": "Rotina concluída em 8 min 12 s"}
    ]'::jsonb, 
    now() - interval '4 hours'
  )
on conflict (id) do nothing;
