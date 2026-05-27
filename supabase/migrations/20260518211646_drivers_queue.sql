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
