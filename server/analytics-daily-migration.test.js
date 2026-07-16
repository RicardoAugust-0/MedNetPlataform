import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../supabase/migrations/20260716134000_serialize_analytics_daily_refresh.sql',
  import.meta.url,
);
const migrationSql = readFileSync(migrationUrl, 'utf8');

describe('analytics_daily concurrent refresh migration', () => {
  it('locks by platform before rebuilding the rollup', () => {
    const lockPosition = migrationSql.indexOf('pg_advisory_xact_lock');
    const deletePosition = migrationSql.indexOf(
      'delete from public.analytics_daily',
    );

    expect(migrationSql).toContain(
      "'analytics_daily:' || coalesce(p_platform, '<null>')",
    );
    expect(lockPosition).toBeGreaterThan(-1);
    expect(deletePosition).toBeGreaterThan(lockPosition);
  });

  it('keeps full delete-and-rebuild semantics instead of masking conflicts', () => {
    expect(migrationSql).toContain(
      'create or replace function public.refresh_analytics_daily',
    );
    expect(migrationSql).toContain('insert into public.analytics_daily');
    expect(migrationSql.toLowerCase()).not.toContain('on conflict');
  });
});
