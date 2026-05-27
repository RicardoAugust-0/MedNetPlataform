-- Adiciona colunas de identificação e classificação editáveis ao prontuário do motorista.
ALTER TABLE public.driver_health
  ADD COLUMN IF NOT EXISTS placa text,
  ADD COLUMN IF NOT EXISTS transportadora text,
  ADD COLUMN IF NOT EXISTS frota text,
  ADD COLUMN IF NOT EXISTS turno text;
