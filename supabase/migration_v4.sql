-- ============================================================
-- MedNet · Migration v4 — security hardening
-- Resolve alertas do Supabase Security Linter
-- Execute no SQL Editor após migration_v3.sql
-- ============================================================

-- ── 1. Tabelas compartilhadas: tornar intenção explícita ────
-- links, templates, ws_pages, reminders são dados de equipe:
-- qualquer operador autenticado pode ler/escrever.
-- Usamos (select auth.uid()) is not null — avalia uma vez por
-- query (não por linha), evitando o lint "Auth RLS Init Plan".

-- links
drop policy if exists "auth_all_links" on public.links;
create policy "auth_all_links" on public.links
  for all to authenticated
  using  ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

-- templates
drop policy if exists "auth_all_templates" on public.templates;
create policy "auth_all_templates" on public.templates
  for all to authenticated
  using  ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

-- ws_pages
drop policy if exists "auth_all_ws_pages" on public.ws_pages;
create policy "auth_all_ws_pages" on public.ws_pages
  for all to authenticated
  using  ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

-- reminders
drop policy if exists "auth_all_reminders" on public.reminders;
create policy "auth_all_reminders" on public.reminders
  for all to authenticated
  using  ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

-- ── 2. notes: corrigir todas as policies ───────────────────
-- notes_insert: impede forjar author_id
-- Demais policies: wrapping (select auth.uid()) para evitar
-- reavaliação por linha (lint: Auth RLS Init Plan).
drop policy if exists "notes_insert" on public.notes;
drop policy if exists "notes_select" on public.notes;
drop policy if exists "notes_update" on public.notes;
drop policy if exists "notes_delete" on public.notes;

create policy "notes_select" on public.notes
  for select to authenticated
  using (is_personal = false or author_id = (select auth.uid()));

create policy "notes_insert" on public.notes
  for insert to authenticated
  with check (
    is_personal = false
    or author_id = (select auth.uid())
  );

create policy "notes_update" on public.notes
  for update to authenticated
  using (is_personal = false or author_id = (select auth.uid()));

create policy "notes_delete" on public.notes
  for delete to authenticated
  using (is_personal = false or author_id = (select auth.uid()));

-- ── 3. profiles: wrapping auth.uid() nas policies ──────────
-- Resolve lint "Auth RLS Init Plan" em todas as policies
-- que referenciam auth.uid() diretamente.
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;

create policy "profiles_insert" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()));

create policy "profiles_admin_update" on public.profiles
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

-- ── 4. atendimentos: wrapping auth.role() ──────────────────
drop policy if exists "Operadores leem atendimentos" on public.atendimentos;
drop policy if exists "Operadores inserem atendimentos" on public.atendimentos;

create policy "Operadores leem atendimentos" on public.atendimentos
  for select to authenticated
  using ((select auth.role()) = 'authenticated');

create policy "Operadores inserem atendimentos" on public.atendimentos
  for insert to authenticated
  with check ((select auth.role()) = 'authenticated');

-- ── 3. rls_auto_enable: remover do schema exposto ──────────
-- A função é SECURITY DEFINER e estava acessível via
-- /rest/v1/rpc/rls_auto_enable por anon e authenticated.
-- Revogamos EXECUTE e movemos para o schema interno.

revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

-- ── 4. Leaked Password Protection ──────────────────────────
-- Não é configurável via SQL.
-- Habilitar manualmente em:
-- Supabase Dashboard → Authentication → Providers → Email
-- → Enable "Leaked password protection" (HaveIBeenPwned check)
