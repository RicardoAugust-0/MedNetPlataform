-- Fix Supabase linter findings for public tables exposed through PostgREST.
-- drivers_queue already has authenticated policies; enabling RLS makes them effective.
alter table if exists public.drivers_queue enable row level security;

-- temp_auth_users appears to be an internal/temporary table. With no policies, enabling
-- RLS denies anon/authenticated API access while service-role operations still work.
alter table if exists public.temp_auth_users enable row level security;
