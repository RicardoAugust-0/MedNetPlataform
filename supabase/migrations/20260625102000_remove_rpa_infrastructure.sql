-- SQL Migration: Remove Obsolete RPA Infrastructure
--
-- 1. Drops the rpa_credentials table (since MaxTrack automation credentials are managed in N8N/code)
-- 2. Removes the obsolete rpa_config from the app_settings table

-- ── 1. Drop rpa_credentials table ────────────────────────────────────────────
DROP TABLE IF EXISTS rpa_credentials;

-- ── 2. Delete rpa_config settings row ────────────────────────────────────────
DELETE FROM app_settings WHERE key = 'rpa_config';
