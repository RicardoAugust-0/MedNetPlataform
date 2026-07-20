import { describe, expect, it, vi } from 'vitest';
import {
  isMissingAnalyticsRollupRpcError,
  isMissingPlatformCountsRpcError,
  isTransientAnalyticsRpcError,
  registerAnalyticsRoutes,
} from './analytics-routes.js';

function captureRoutes() {
  const routes = new Map();
  const register = (path, ...handlers) => routes.set(path, handlers);
  return {
    app: { get: register, post: register },
    routes,
  };
}

function responseRecorder() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe('analytics platform counts resilience', () => {
  it('recognizes only missing-RPC errors as compatible with the legacy fallback', () => {
    expect(isMissingPlatformCountsRpcError({
      code: 'PGRST202',
      message: 'Could not find public.analytics_platform_counts in the schema cache',
    })).toBe(true);
    expect(isMissingPlatformCountsRpcError({
      code: '42883',
      message: 'function public.analytics_platform_counts() does not exist',
    })).toBe(true);
    expect(isMissingPlatformCountsRpcError({
      code: '42883',
      message: 'function public.analytics_norm_crit(text) does not exist',
    })).toBe(false);
    expect(isMissingPlatformCountsRpcError({ code: 'PGRST000' })).toBe(false);
    expect(isMissingPlatformCountsRpcError({ message: 'Failed to fetch' })).toBe(false);
  });

  it('fails fast on transient RPC errors instead of opening eight table counts', async () => {
    const { app, routes } = captureRoutes();
    const supabase = {
      auth: { getUser: vi.fn() },
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST000', message: 'upstream timeout' },
      }),
      from: vi.fn(),
    };
    registerAnalyticsRoutes(app, supabase);
    const routeHandlers = routes.get('/api/platforms');
    const handler = routeHandlers.at(-1);
    const res = responseRecorder();

    await handler({}, res);

    expect(res.statusCode).toBe(503);
    expect(res.headers['Retry-After']).toBe('5');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns the aggregated RPC payload without touching driver_events', async () => {
    const { app, routes } = captureRoutes();
    const supabase = {
      auth: { getUser: vi.fn() },
      rpc: vi.fn().mockResolvedValue({
        data: { maxtrack: 42, horizon: 7 },
        error: null,
      }),
      from: vi.fn(),
    };
    registerAnalyticsRoutes(app, supabase);
    const handler = routes.get('/api/platforms').at(-1);
    const res = responseRecorder();

    await handler({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ maxtrack: 42, horizon: 7 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('uses the legacy table counts only when the RPC is missing', async () => {
    const { app, routes } = captureRoutes();
    const from = vi.fn(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        or: vi.fn().mockResolvedValue({ count: 3, error: null }),
      };
      return query;
    });
    const supabase = {
      auth: { getUser: vi.fn() },
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find public.analytics_platform_counts in the schema cache',
        },
      }),
      from,
    };
    registerAnalyticsRoutes(app, supabase);
    const handler = routes.get('/api/platforms').at(-1);
    const res = responseRecorder();

    await handler({}, res);

    expect(res.statusCode).toBe(200);
    expect(from).toHaveBeenCalledTimes(8);
    expect(Object.keys(res.body)).toHaveLength(8);
    expect(Object.values(res.body).every(count => count === 3)).toBe(true);
  });
});

describe('analytics payload resilience', () => {
  it('classifica apenas falhas operacionais como transitorias', () => {
    expect(isTransientAnalyticsRpcError({ code: '57014' })).toBe(true);
    expect(isTransientAnalyticsRpcError({ code: 'PGRST003' })).toBe(true);
    expect(isTransientAnalyticsRpcError({ message: 'fetch failed', cause: { code: 'ETIMEDOUT' } })).toBe(true);
    expect(isTransientAnalyticsRpcError({ code: '42703', message: 'column not found' })).toBe(false);
  });

  it('nao confunde erro interno 42883 com RPC de rollup ausente', () => {
    expect(isMissingAnalyticsRollupRpcError({ code: 'PGRST202' })).toBe(true);
    expect(isMissingAnalyticsRollupRpcError({
      code: '42883',
      message: 'function public.get_analytics_rollup(text[]) does not exist',
    })).toBe(true);
    expect(isMissingAnalyticsRollupRpcError({
      code: '42883',
      message: 'function public.analytics_has_evid(text) does not exist',
    })).toBe(false);
  });

  it('retorna 503 sem abrir o fallback cru quando a RPC agregada expira', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, routes } = captureRoutes();
    const appSettingsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { value: {} }, error: null }),
    };
    appSettingsQuery.select.mockReturnValue(appSettingsQuery);
    appSettingsQuery.eq.mockReturnValue(appSettingsQuery);
    const from = vi.fn((table) => {
      if (table === 'app_settings') return appSettingsQuery;
      throw new Error(`Fallback inesperado para ${table}`);
    });
    const rpc = vi.fn(async (name) => {
      if (name === 'analytics_metadata_rollup') {
        return { data: { fleets: {}, months: [], types: [] }, error: null };
      }
      if (name === 'get_analytics_rollup') {
        return {
          data: {
            meta: { total: 0 },
            kpis: { total: 0 },
            frota_raw: {},
            uf: { labels: [], valores: [] },
          },
          error: null,
        };
      }
      if (name === 'analytics_support_metrics') {
        return {
          data: null,
          error: { code: '57014', message: 'canceling statement due to statement timeout' },
        };
      }
      throw new Error(`RPC inesperada: ${name}`);
    });
    registerAnalyticsRoutes(app, { auth: { getUser: vi.fn() }, from, rpc });
    const handler = routes.get('/api/analytics').at(-1);
    const res = responseRecorder();

    try {
      await handler({
        query: {
          platformId: 'maxtrack',
          month: 'all',
          severity: 'all',
          classification: 'all',
        },
        originalUrl: '/api/analytics?platformId=maxtrack&month=all&severity=all',
      }, res);

      expect(res.statusCode).toBe(503);
      expect(res.headers['Retry-After']).toBe('5');
      expect(from).toHaveBeenCalledTimes(1);
      expect(from).toHaveBeenCalledWith('app_settings');
    } finally {
      errorSpy.mockRestore();
    }
  });
});
