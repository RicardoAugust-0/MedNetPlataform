-- ============================================================
-- MedNet · Migration v3 — perfis, lembretes com data, notas pessoais
-- Execute no SQL Editor do Supabase após migration_v2.sql
-- ============================================================

-- ── Tabela de perfis de operadores ─────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  cargo      text,
  role       text not null default 'operador', -- 'operador' | 'admin'
  created_at timestamptz not null default now(),
  last_seen  timestamptz
);
alter table public.profiles enable row level security;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_insert" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles_update" on public.profiles
  for update to authenticated using (id = auth.uid());

-- Admins podem atualizar qualquer perfil (role, etc.)
create policy "profiles_admin_update" on public.profiles
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── Adicionar coluna "date" nos lembretes ──────────────────
alter table public.reminders
  add column if not exists reminder_date date not null default current_date;

-- ── Adicionar colunas para notas pessoais ─────────────────
alter table public.notes
  add column if not exists is_personal boolean not null default false,
  add column if not exists author_id   uuid references auth.users(id) on delete set null;

-- Recriar políticas de notas para suportar notas pessoais
drop policy if exists "auth_all_notes" on public.notes;

create policy "notes_select" on public.notes
  for select to authenticated
  using (is_personal = false or author_id = auth.uid());

create policy "notes_insert" on public.notes
  for insert to authenticated with check (true);

create policy "notes_update" on public.notes
  for update to authenticated
  using (is_personal = false or author_id = auth.uid());

create policy "notes_delete" on public.notes
  for delete to authenticated
  using (is_personal = false or author_id = auth.uid());
