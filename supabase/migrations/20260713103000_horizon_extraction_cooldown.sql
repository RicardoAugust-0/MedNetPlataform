-- Evita que o robô Horizon repita uma conta recém-importada em execuções
-- manuais ou sobrepostas. Falhas de login/importação não atualizam este campo.
ALTER TABLE public.horizon_credentials
  ADD COLUMN IF NOT EXISTS last_extracted_at timestamptz;

CREATE INDEX IF NOT EXISTS horizon_credentials_last_extracted_at_idx
  ON public.horizon_credentials (last_extracted_at);
