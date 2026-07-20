import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const readMigration = (name) => readFileSync(new URL(name, migrationsDir), 'utf8').toLowerCase();

const emergencySql = readMigration('20260716140000_emergency_database_security.sql');
const sensitiveSql = readMigration('20260716141000_harden_driver_sensitive_data.sql');
const baselineSql = readMigration('20260701140000_automations_baseline.sql');
const whatsappInboundSql = readMigration('20260716142000_record_whatsapp_inbound_message.sql');

describe('emergency database authorization migration', () => {
  it('prevents self-promotion while preserving ordinary profile updates', () => {
    expect(emergencySql).toContain('create or replace function public.protect_profile_authorization_fields()');
    expect(emergencySql).toContain("and new.role <> 'operador'");
    expect(emergencySql).toContain("p.role = 'admin'");
    expect(emergencySql).toContain('new.role is distinct from old.role');
    expect(emergencySql).toContain('nao e permitido remover o ultimo administrador');
    expect(emergencySql).toMatch(
      /create policy "profiles_insert"[\s\S]*id = \(select auth\.uid\(\)\)[\s\S]*role = 'operador'/,
    );
  });

  it('exposes an explicit admin-only role RPC without PUBLIC execution', () => {
    expect(emergencySql).toContain('create or replace function public.admin_set_profile_role');
    expect(emergencySql).toMatch(
      /revoke all on function public\.admin_set_profile_role\(uuid, text\)\s+from public, anon/,
    );
    expect(emergencySql).toMatch(
      /grant execute on function public\.admin_set_profile_role\(uuid, text\)\s+to authenticated, service_role/,
    );
  });

  it('keeps manual event inserts non-financial and restricts destructive deletes', () => {
    expect(emergencySql).toMatch(
      /create policy "authenticated_manual_insert_driver_events"[\s\S]*and operador is null/,
    );
    expect(emergencySql).toMatch(
      /create policy "privileged_delete_driver_events"[\s\S]*p\.role in \('lider', 'admin'\)/,
    );
  });

  it('allows only service_role to execute mutating definer RPCs', () => {
    const signatures = [
      'public.upsert_driver_events_preserve(jsonb)',
      'public.upsert_driver_events_preserve(jsonb, boolean, boolean)',
      'public.refresh_analytics_daily(text, date[])',
      'public.claim_horizon_treatment_queue(integer, integer)',
      'public.resolve_horizon_treatment_queue(uuid, text, text)',
    ];

    for (const signature of signatures) {
      const escaped = signature.replace(/[()[\]]/g, '\\$&');
      expect(emergencySql).toMatch(
        new RegExp(`revoke all on function ${escaped}\\s+from public, anon, authenticated`),
      );
      expect(emergencySql).toMatch(
        new RegExp(`grant execute on function ${escaped}\\s+to service_role`),
      );
    }

    expect(emergencySql).toContain("'pg_catalog.trigger'::regtype");
    expect(emergencySql).toContain("'pg_catalog.event_trigger'::regtype");
  });
});

describe('driver clinical data hardening migration', () => {
  it('keeps authenticated reads and gates mutations by leader/admin', () => {
    expect(sensitiveSql).toContain('create policy "authenticated_read_driver_health"');
    expect(sensitiveSql).toContain('create policy "authenticated_read_driver_documents"');

    for (const policy of [
      'privileged_insert_driver_health',
      'privileged_update_driver_health',
      'privileged_delete_driver_health',
      'privileged_insert_driver_documents',
      'privileged_update_driver_documents',
      'privileged_delete_driver_documents',
    ]) {
      const position = sensitiveSql.indexOf(`create policy "${policy}"`);
      expect(position).toBeGreaterThan(-1);
      expect(sensitiveSql.slice(position, position + 700)).toContain("p.role in ('lider', 'admin')");
    }
  });

  it('adds an immutable audit trail for both sensitive tables', () => {
    expect(sensitiveSql).toContain('create table if not exists public.driver_sensitive_audit');
    expect(sensitiveSql).toContain('revoke all on table public.driver_sensitive_audit');
    expect(sensitiveSql).toContain('create trigger audit_driver_health_changes');
    expect(sensitiveSql).toContain('create trigger audit_driver_documents_changes');
    expect(sensitiveSql).toMatch(
      /revoke all on function public\.audit_driver_sensitive_change\(\)\s+from public, anon, authenticated/,
    );
  });

  it('keeps storage reads authenticated and gates every storage mutation', () => {
    expect(sensitiveSql).toContain('create policy "driver_documents_authenticated_read"');
    for (const operation of ['insert', 'update', 'delete']) {
      const policy = `create policy "driver_documents_privileged_${operation}"`;
      const position = sensitiveSql.indexOf(policy);
      expect(position).toBeGreaterThan(-1);
      expect(sensitiveSql.slice(position, position + 900)).toContain("p.role in ('lider', 'admin')");
    }
  });
});

describe('versioned automations migration hygiene', () => {
  it('has a baseline before the first versioned automation seed', () => {
    expect(baselineSql).toContain('create table if not exists public.automations');
    expect(baselineSql).toContain('create table if not exists public.automation_logs');
    expect(baselineSql).toContain("policyname in ('authenticated_all_automations', 'leaders_manage_automations')");
    expect('20260701140000_automations_baseline.sql' < '20260701150000_horizon_credentials.sql').toBe(true);
  });

  it('uses unique versions for every timestamped migration', () => {
    const files = readdirSync(migrationsDir)
      .filter((name) => /^\d{14}_.+\.sql$/.test(name));
    const versions = files.map((name) => name.slice(0, 14));
    const duplicates = versions.filter((version, index) => versions.indexOf(version) !== index);

    expect(duplicates).toEqual([]);
    expect(files).toContain('20260713180500_automation_realtime_publication.sql');
    expect(files).not.toContain('20260713180000_automation_realtime_publication.sql');
  });
});

describe('transactional WhatsApp inbound migration', () => {
  it('deduplicates the message before updating the chat summary', () => {
    const insertPosition = whatsappInboundSql.indexOf('insert into public.whatsapp_messages');
    const conflictPosition = whatsappInboundSql.indexOf('on conflict (meta_message_id) do nothing');
    const diagnosticsPosition = whatsappInboundSql.indexOf('get diagnostics v_inserted = row_count');
    const updatePosition = whatsappInboundSql.indexOf('update public.whatsapp_chats', diagnosticsPosition);

    expect(whatsappInboundSql).toContain('create or replace function public.record_whatsapp_inbound_message');
    expect(insertPosition).toBeGreaterThan(-1);
    expect(conflictPosition).toBeGreaterThan(insertPosition);
    expect(diagnosticsPosition).toBeGreaterThan(conflictPosition);
    expect(updatePosition).toBeGreaterThan(diagnosticsPosition);
    expect(whatsappInboundSql.slice(diagnosticsPosition, updatePosition)).toContain('if v_inserted = 1 then');
    expect(whatsappInboundSql).toContain('unread_count = unread_count + 1');
    expect(whatsappInboundSql).toContain('greatest(last_message_at, v_created_at)');
  });

  it('is service-role only and removes direct authenticated writes', () => {
    expect(whatsappInboundSql).toMatch(
      /revoke all on function public\.record_whatsapp_inbound_message\([\s\S]*?\) from public, anon, authenticated/,
    );
    expect(whatsappInboundSql).toMatch(
      /grant execute on function public\.record_whatsapp_inbound_message\([\s\S]*?\) to service_role/,
    );
    expect(whatsappInboundSql).toContain('drop policy if exists "authenticated_all_whatsapp_chats"');
    expect(whatsappInboundSql).toContain('drop policy if exists "authenticated_all_whatsapp_messages"');
    expect(whatsappInboundSql).toContain('create policy "authenticated_read_whatsapp_chats"');
    expect(whatsappInboundSql).toContain('create policy "authenticated_read_whatsapp_messages"');
  });
});
