-- Migration: 20260702120000_maxtrack_ingest_automation.sql
-- Trilha B2 (ingestão MaxTrack): automação Bot_MaxtrackScraping, espelho de
-- Bot_HorizonScraping (20260701150000_horizon_credentials.sql) — robô na VPS
-- exporta o relatório "Fechados" da Central de Eventos MaxTrack de hora em
-- hora e envia para POST /api/maxtrack/ingest (server/maxtrack-routes.js).

INSERT INTO public.automations (id, name, icon, description, active, endpoint, trigger, schedule, event_type, token, position)
VALUES (
  'a1b94e82-e3e7-4c74-bfd4-3a56df93df28',
  'Bot_MaxtrackScraping',
  'ti-cloud-download',
  'Exporta relatórios de fadiga da MaxTrack de hora em hora e atualiza driver_events automaticamente.',
  true,
  'https://botsplaywright.duckdns.org/automacoes/bot_MaxtrackScraping',
  'agendado',
  'a cada 1 hora',
  null,
  null,
  3
)
ON CONFLICT (id) DO NOTHING;
