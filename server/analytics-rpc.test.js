import { describe, expect, it, vi } from 'vitest';

import { buildSingleAnalyticsViaRPC } from './analytics-rpc.js';

const helpers = {
  aliases: {},
  resolveMonitorName: (value) => value,
};

function createSupabase({ supportError = null } = {}) {
  const rpc = vi.fn(async (name) => {
    if (name === 'analytics_metadata_rollup') {
      return { data: { fleets: { FrotaA: 4 }, months: ['2026-07'], types: ['Fadiga'] }, error: null };
    }
    if (name === 'get_analytics_rollup') {
      return {
        data: {
          meta: { total: 4 },
          kpis: { total: 4 },
          frota_raw: { FrotaA: 4 },
          uf: { labels: ['SP'], valores: [4] },
        },
        error: null,
      };
    }
    if (name === 'analytics_support_metrics') {
      return supportError
        ? { data: null, error: supportError }
        : {
            data: {
              evidence_total: 4,
              evidence_available: 3,
              t_ini_mediana: 12.3,
              t_fin_mediana: 45.6,
            },
            error: null,
          };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  return { rpc, from: vi.fn() };
}

describe('analytics support metrics RPC', () => {
  it('converte o JSON agregado para o shape historico do dashboard', async () => {
    const supabase = createSupabase();

    const result = await buildSingleAnalyticsViaRPC(supabase, {
      platformId: 'maxtrack',
      month: 'all',
      severity: 'all',
      classification: 'all',
    }, helpers);

    expect(result.d.kpis).toMatchObject({
      pct_evidencia: 75,
      t_ini_mediana: 12.3,
      t_fin_mediana: 45.6,
    });
    expect(result.d.evidencia).toEqual({ disp: 3, aguard: 1 });
    expect(result.d.hasEvidence).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('analytics_support_metrics', expect.objectContaining({
      p_sources: [{ platform_id: 'maxtrack', frotas: null }],
    }));
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('nao mascara falha transitoria com o fallback paginado', async () => {
    const supabase = createSupabase({
      supportError: { code: '57014', message: 'canceling statement due to statement timeout' },
    });

    await expect(buildSingleAnalyticsViaRPC(supabase, {
      platformId: 'maxtrack',
      month: 'all',
      severity: 'all',
      classification: 'all',
    }, helpers)).rejects.toMatchObject({ code: '57014' });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('exige a migration quando a RPC agregada ainda nao existe', async () => {
    const supabase = createSupabase({
      supportError: {
        code: 'PGRST202',
        message: 'Could not find the function public.analytics_support_metrics in the schema cache',
      },
    });

    await expect(buildSingleAnalyticsViaRPC(supabase, {
      platformId: 'maxtrack',
      month: 'all',
      severity: 'all',
      classification: 'all',
    }, helpers)).rejects.toMatchObject({
      code: 'ANALYTICS_SUPPORT_RPC_MISSING',
      name: 'MissingAnalyticsSupportRpcError',
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });
});
