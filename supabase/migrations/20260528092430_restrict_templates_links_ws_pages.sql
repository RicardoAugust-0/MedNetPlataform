-- ============================================================
-- Migration: Restrição de acesso para Operadores Padrão
-- E introdução da permissão para Liderança (role = 'lider')
-- ============================================================

-- Criar a função can_modify_knowledge que autoriza admin e lider
create or replace function public.can_modify_knowledge()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'lider')
  );
$$;

revoke execute on function public.can_modify_knowledge() from anon;
grant execute on function public.can_modify_knowledge() to authenticated;

-- ============================================================
-- 1. Políticas RLS para public.templates
-- ============================================================
drop policy if exists "auth_all_templates" on public.templates;
drop policy if exists "templates_select_all" on public.templates;
drop policy if exists "templates_modify_authorized" on public.templates;

create policy "templates_select_all" on public.templates
  for select to authenticated
  using (true);

create policy "templates_modify_authorized" on public.templates
  for all to authenticated
  using (public.can_modify_knowledge())
  with check (public.can_modify_knowledge());

-- ============================================================
-- 2. Políticas RLS para public.links
-- ============================================================
drop policy if exists "auth_all_links" on public.links;
drop policy if exists "links_select_all" on public.links;
drop policy if exists "links_modify_authorized" on public.links;

create policy "links_select_all" on public.links
  for select to authenticated
  using (true);

create policy "links_modify_authorized" on public.links
  for all to authenticated
  using (public.can_modify_knowledge())
  with check (public.can_modify_knowledge());

-- ============================================================
-- 3. Políticas RLS para public.ws_pages (Workspace)
-- ============================================================
drop policy if exists "auth_all_ws_pages" on public.ws_pages;
drop policy if exists "ws_pages_select_all" on public.ws_pages;
drop policy if exists "ws_pages_modify_authorized" on public.ws_pages;

create policy "ws_pages_select_all" on public.ws_pages
  for select to authenticated
  using (true);

create policy "ws_pages_modify_authorized" on public.ws_pages
  for all to authenticated
  using (public.can_modify_knowledge())
  with check (public.can_modify_knowledge());
