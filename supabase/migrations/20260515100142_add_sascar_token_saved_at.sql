-- Migration v10: credenciais de integrações por operador

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS maxtrack_email        TEXT,
  ADD COLUMN IF NOT EXISTS maxtrack_password     TEXT,
  ADD COLUMN IF NOT EXISTS sascar_token          TEXT,
  ADD COLUMN IF NOT EXISTS sascar_token_saved_at TIMESTAMPTZ;
