-- Fix Supabase performance linter warnings for RLS policies:
-- - wrap auth.uid() in SELECT so it is evaluated once per statement;
-- - split FOR ALL write policies to avoid overlapping SELECT policies.

-- Read policies using auth.uid()
drop policy if exists "authenticated read driver_events" on public.driver_events;
create policy "authenticated read driver_events"
  on public.driver_events for select to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "authenticated read analytics_daily" on public.analytics_daily;
create policy "authenticated read analytics_daily"
  on public.analytics_daily for select to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "authenticated_read_horizon_treatment_queue" on public.horizon_treatment_queue;
create policy "authenticated_read_horizon_treatment_queue"
  on public.horizon_treatment_queue for select to authenticated
  using ((select auth.uid()) is not null);

-- platform_rules: public read for authenticated users, admin-only writes.
drop policy if exists "authenticated read platform_rules" on public.platform_rules;
create policy "authenticated read platform_rules"
  on public.platform_rules for select to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "admin write platform_rules" on public.platform_rules;
drop policy if exists "admin insert platform_rules" on public.platform_rules;
drop policy if exists "admin update platform_rules" on public.platform_rules;
drop policy if exists "admin delete platform_rules" on public.platform_rules;

create policy "admin insert platform_rules"
  on public.platform_rules for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

create policy "admin update platform_rules"
  on public.platform_rules for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

create policy "admin delete platform_rules"
  on public.platform_rules for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

-- custom_rules: public read for authenticated users, admin-only writes.
drop policy if exists "authenticated read custom_rules" on public.custom_rules;
create policy "authenticated read custom_rules"
  on public.custom_rules for select to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "admin write custom_rules" on public.custom_rules;
drop policy if exists "admin insert custom_rules" on public.custom_rules;
drop policy if exists "admin update custom_rules" on public.custom_rules;
drop policy if exists "admin delete custom_rules" on public.custom_rules;

create policy "admin insert custom_rules"
  on public.custom_rules for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

create policy "admin update custom_rules"
  on public.custom_rules for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

create policy "admin delete custom_rules"
  on public.custom_rules for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

-- Admin-only AI persistence policies.
drop policy if exists "admin_all_chat_messages" on public.ai_chat_messages;
create policy "admin_all_chat_messages" on public.ai_chat_messages
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  );

drop policy if exists "admin_all_generated_reports" on public.ai_generated_reports;
create policy "admin_all_generated_reports" on public.ai_generated_reports
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  );

drop policy if exists "admin_all_chat_threads" on public.ai_chat_threads;
create policy "admin_all_chat_threads" on public.ai_chat_threads
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  );

-- Horizon credentials remain admin-only; service_role bypasses RLS for backend automation.
drop policy if exists "admin_all_horizon_credentials" on public.horizon_credentials;
create policy "admin_all_horizon_credentials"
  on public.horizon_credentials for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

-- Knowledge tables: keep read-all, split modify policy into write-only commands.
drop policy if exists "templates_modify_authorized" on public.templates;
drop policy if exists "templates_insert_authorized" on public.templates;
drop policy if exists "templates_update_authorized" on public.templates;
drop policy if exists "templates_delete_authorized" on public.templates;
create policy "templates_insert_authorized" on public.templates
  for insert to authenticated
  with check ((select public.can_modify_knowledge()));
create policy "templates_update_authorized" on public.templates
  for update to authenticated
  using ((select public.can_modify_knowledge()))
  with check ((select public.can_modify_knowledge()));
create policy "templates_delete_authorized" on public.templates
  for delete to authenticated
  using ((select public.can_modify_knowledge()));

drop policy if exists "links_modify_authorized" on public.links;
drop policy if exists "links_insert_authorized" on public.links;
drop policy if exists "links_update_authorized" on public.links;
drop policy if exists "links_delete_authorized" on public.links;
create policy "links_insert_authorized" on public.links
  for insert to authenticated
  with check ((select public.can_modify_knowledge()));
create policy "links_update_authorized" on public.links
  for update to authenticated
  using ((select public.can_modify_knowledge()))
  with check ((select public.can_modify_knowledge()));
create policy "links_delete_authorized" on public.links
  for delete to authenticated
  using ((select public.can_modify_knowledge()));

drop policy if exists "ws_pages_modify_authorized" on public.ws_pages;
drop policy if exists "ws_pages_insert_authorized" on public.ws_pages;
drop policy if exists "ws_pages_update_authorized" on public.ws_pages;
drop policy if exists "ws_pages_delete_authorized" on public.ws_pages;
create policy "ws_pages_insert_authorized" on public.ws_pages
  for insert to authenticated
  with check ((select public.can_modify_knowledge()));
create policy "ws_pages_update_authorized" on public.ws_pages
  for update to authenticated
  using ((select public.can_modify_knowledge()))
  with check ((select public.can_modify_knowledge()));
create policy "ws_pages_delete_authorized" on public.ws_pages
  for delete to authenticated
  using ((select public.can_modify_knowledge()));

-- WhatsApp templates: read-all, admin-only writes without overlapping SELECT.
drop policy if exists "admin_all_whatsapp_templates" on public.whatsapp_templates;
drop policy if exists "admin_insert_whatsapp_templates" on public.whatsapp_templates;
drop policy if exists "admin_update_whatsapp_templates" on public.whatsapp_templates;
drop policy if exists "admin_delete_whatsapp_templates" on public.whatsapp_templates;
create policy "admin_insert_whatsapp_templates" on public.whatsapp_templates
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "admin_update_whatsapp_templates" on public.whatsapp_templates
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "admin_delete_whatsapp_templates" on public.whatsapp_templates
  for delete to authenticated
  using ((select public.is_admin()));

-- WhatsApp dispatches: authenticated users can read/insert; admins can update/delete.
drop policy if exists "admin_all_whatsapp_dispatches" on public.whatsapp_dispatches;
drop policy if exists "admin_update_whatsapp_dispatches" on public.whatsapp_dispatches;
drop policy if exists "admin_delete_whatsapp_dispatches" on public.whatsapp_dispatches;
create policy "admin_update_whatsapp_dispatches" on public.whatsapp_dispatches
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "admin_delete_whatsapp_dispatches" on public.whatsapp_dispatches
  for delete to authenticated
  using ((select public.is_admin()));
