-- Migration v5: is_admin(), índices e correção de acesso anon

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from anon;

drop policy if exists "profiles_admin_update" on public.profiles;

create policy "profiles_admin_update" on public.profiles
  for update to authenticated
  using (public.is_admin());

create index if not exists notes_author_id_idx   on public.notes (author_id);
create index if not exists notes_is_personal_idx on public.notes (is_personal);
create index if not exists reminders_date_idx    on public.reminders (reminder_date);
create index if not exists reminders_done_idx    on public.reminders (done);
create index if not exists ws_pages_category_idx on public.ws_pages (category);
create index if not exists ws_pages_favorite_idx on public.ws_pages (favorite);
