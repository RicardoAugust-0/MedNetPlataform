-- ============================================================
-- MedNet · Supabase migration
-- Execute no SQL Editor do painel Supabase (supabase.com)
-- ============================================================

-- ── Tabela de atendimentos ──────────────────────────────────
create table if not exists public.atendimentos (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- Motorista
  motorista       text not null,
  placa           text,
  transportadora  text,

  -- Operador (vem do auth)
  operador_id     uuid references auth.users(id) on delete set null,
  operador_nome   text not null,

  -- Tipo de ação
  tipo            text not null check (tipo in ('intervencao', 'reportar', 'descarte', 'limpeza')),
  obs             text,
  hora            text  -- hora legível "HH:MM" para exibição
);

-- Todos os operadores autenticados podem ler e inserir
alter table public.atendimentos enable row level security;

create policy "Operadores leem atendimentos"
  on public.atendimentos for select
  using (auth.role() = 'authenticated');

create policy "Operadores inserem atendimentos"
  on public.atendimentos for insert
  with check (auth.role() = 'authenticated');

-- Índices úteis para queries de histórico e relatórios
create index if not exists atendimentos_created_at_idx  on public.atendimentos (created_at desc);
create index if not exists atendimentos_operador_id_idx on public.atendimentos (operador_id);
create index if not exists atendimentos_tipo_idx        on public.atendimentos (tipo);
create index if not exists atendimentos_placa_idx       on public.atendimentos (placa);
