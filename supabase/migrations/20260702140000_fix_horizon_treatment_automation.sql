-- Migration: 20260702140000_fix_horizon_treatment_automation.sql
-- O registro 'Bot_HorizonTreatment' foi semeado em 20260701150000 com a
-- arquitetura antiga (disparo por evento 'Atendimento registrado (MaxTrack)',
-- vindo da tela CrossCheck.jsx manual, endpoint em minúsculo). A arquitetura
-- final (Auto Cross-Check + fila) decidida em 2026-07-02 usa polling
-- agendado consumindo horizon_treatment_queue WHERE status='pending', no
-- mesmo padrão dos Bot_HorizonScraping/Bot_MaxtrackScraping. Corrige o
-- registro existente para refletir isso, em vez de duplicar.

UPDATE public.automations
SET
  description = 'Consome horizon_treatment_queue (status=pending) e replica na Horizon a tratativa já resolvida na MaxTrack.',
  endpoint = 'https://botsplaywright.duckdns.org/automacoes/BOT_HorizonTreatment',
  trigger = 'agendado',
  schedule = 'a cada 15 minutos',
  event_type = null,
  position = 4
WHERE id = 'f0a94e82-e3e7-4c74-bfd4-3a56df93df27';
