-- Migration v10: credenciais de integrações por operador
-- Adiciona maxtrack_email e maxtrack_password em profiles.
-- maxtrack_password nunca é lido pelo frontend — apenas pela Edge Function
-- pull-maxtrack via service_role.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS maxtrack_email    TEXT,
  ADD COLUMN IF NOT EXISTS maxtrack_password TEXT;
