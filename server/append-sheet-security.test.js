import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const edgeSource = readFileSync(
  new URL('../supabase/functions/append-sheet/index.ts', import.meta.url),
  'utf8',
);
const migrationSql = readFileSync(
  new URL('../supabase/migrations/20260716144000_require_append_sheet_trigger_secret.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('append-sheet authentication hardening', () => {
  it('has no predictable token fallback in the deployed Edge Function', () => {
    expect(edgeSource).not.toContain('SYSTEM_TRIGGER');
    expect(edgeSource).toContain("Deno.env.get('TRIGGER_SECRET')?.trim()");
    expect(edgeSource).toContain('if (!triggerSecret)');
    expect(edgeSource).toContain("return json({ error: 'Autorização interna não configurada' }, 503)");
  });

  it('requires a non-empty Vault secret before scheduling the HTTP request', () => {
    const vaultPosition = migrationSql.indexOf('from vault.decrypted_secrets');
    const nullGuardPosition = migrationSql.indexOf('if v_secret is null then');
    const httpPosition = migrationSql.indexOf("execute 'select net.http_post");

    expect(migrationSql).not.toContain('system_trigger');
    expect(migrationSql).not.toContain("current_setting('request.headers', true)::json->>'authorization'");
    expect(migrationSql).toContain("select nullif(btrim(decrypted_secret), '')");
    expect(vaultPosition).toBeGreaterThan(-1);
    expect(nullGuardPosition).toBeGreaterThan(vaultPosition);
    expect(httpPosition).toBeGreaterThan(nullGuardPosition);
    expect(migrationSql).toContain("auth_header := 'bearer ' || v_secret");
    expect(migrationSql).not.toContain("'https://' || req_host");
    expect(migrationSql).toContain(
      "func_url := 'https://jvqlxrixzqlbwmmdwcob.supabase.co/functions/v1/append-sheet'",
    );
  });

  it('replaces the trigger idempotently and keeps the function off PostgREST RPC', () => {
    expect(migrationSql).toContain('create or replace function public.trigger_espelhamento_sheets_fn()');
    expect(migrationSql).toContain('set search_path = pg_catalog, public');
    expect(migrationSql).toMatch(
      /revoke all on function public\.trigger_espelhamento_sheets_fn\(\)\s+from public, anon, authenticated/,
    );
    expect(migrationSql).toContain('drop trigger if exists trigger_espelhamento_sheets');
    expect(migrationSql).toContain('create trigger trigger_espelhamento_sheets');
  });
});
