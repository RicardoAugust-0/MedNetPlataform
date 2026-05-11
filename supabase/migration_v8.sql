-- ============================================================
-- MedNet · Migration v8 — modo manutenção (app_settings)
-- ============================================================

-- Tabela genérica de configurações globais da aplicação
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

-- Qualquer usuário autenticado pode ler (necessário para operadores verem o estado)
drop policy if exists "app_settings_select" on public.app_settings;
create policy "app_settings_select" on public.app_settings
  for select to authenticated using (true);

-- Apenas admins podem escrever
drop policy if exists "app_settings_admin_insert" on public.app_settings;
create policy "app_settings_admin_insert" on public.app_settings
  for insert to authenticated with check (public.is_admin());

drop policy if exists "app_settings_admin_update" on public.app_settings;
create policy "app_settings_admin_update" on public.app_settings
  for update to authenticated using (public.is_admin());

drop policy if exists "app_settings_admin_delete" on public.app_settings;
create policy "app_settings_admin_delete" on public.app_settings
  for delete to authenticated using (public.is_admin());

-- Seed da linha de manutenção (desligada por padrão)
insert into public.app_settings (key, value)
values ('maintenance', '{"enabled": false, "message": ""}'::jsonb)
on conflict (key) do nothing;

-- Realtime para propagar mudanças instantaneamente aos operadores
alter publication supabase_realtime add table public.app_settings;
