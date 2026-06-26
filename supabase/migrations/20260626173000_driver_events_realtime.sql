-- Migration: Habilita tempo real (Realtime) para a tabela driver_events
alter publication supabase_realtime add table public.driver_events;
