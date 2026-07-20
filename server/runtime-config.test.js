import { describe, expect, it, vi } from 'vitest';
import { buildCorsOptions, loadRuntimeConfig, registerHealthRoutes } from './runtime-config.js';

function responseMock() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe('runtime configuration', () => {
  it('exige service role e CORS explicito em producao', () => {
    expect(() => loadRuntimeConfig({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://project.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key',
    })).toThrow(/SUPABASE_SERVICE_ROLE_KEY.*CORS_ORIGIN/);
  });

  it('usa somente a service role no backend de producao', () => {
    const config = loadRuntimeConfig({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key',
      CORS_ORIGIN: 'https://app.example.com, https://admin.example.com',
    });
    expect(config.supabaseKey).toBe('service-key');
    expect(config.corsAllowedOrigins).toEqual(['https://app.example.com', 'https://admin.example.com']);
    expect(config.trustProxyHops).toBe(1);
    expect(config.rateLimit).toEqual({ windowMs: 60_000, maxRequests: 300, maxClients: 10_000 });
    expect(config.securityHeaders).toEqual({ hstsMaxAgeSeconds: 31_536_000 });
  });

  it('mantem fallback local sem abrir CORS de producao', () => {
    const config = loadRuntimeConfig({
      NODE_ENV: 'test',
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key',
    });
    expect(config.supabaseKey).toBe('public-key');
    expect(config.trustProxyHops).toBe(0);

    const callback = vi.fn();
    buildCorsOptions([], { production: true }).origin('https://evil.example', callback);
    expect(callback.mock.calls[0][0]).toEqual(expect.objectContaining({ status: 403 }));
  });

  it('carrega limites HTTP configuraveis', () => {
    const config = loadRuntimeConfig({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      CORS_ORIGIN: 'https://app.example.com',
      JSON_BODY_LIMIT: '3mb',
      TRUST_PROXY_HOPS: '2',
      RATE_LIMIT_WINDOW_MS: '120000',
      RATE_LIMIT_MAX_REQUESTS: '450',
      RATE_LIMIT_MAX_CLIENTS: '25000',
      HSTS_MAX_AGE_SECONDS: '86400',
    });

    expect(config.jsonBodyLimit).toBe('3mb');
    expect(config.trustProxyHops).toBe(2);
    expect(config.rateLimit).toEqual({ windowMs: 120_000, maxRequests: 450, maxClients: 25_000 });
    expect(config.securityHeaders).toEqual({ hstsMaxAgeSeconds: 86_400 });
  });

  it('falha fechado com limites HTTP invalidos', () => {
    expect(() => loadRuntimeConfig({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      CORS_ORIGIN: 'https://app.example.com',
      JSON_BODY_LIMIT: 'sem-limite',
      TRUST_PROXY_HOPS: '99',
      RATE_LIMIT_WINDOW_MS: '100',
      RATE_LIMIT_MAX_REQUESTS: '0',
      RATE_LIMIT_MAX_CLIENTS: '-1',
      HSTS_MAX_AGE_SECONDS: '0',
    })).toThrow(/TRUST_PROXY_HOPS.*RATE_LIMIT_WINDOW_MS.*RATE_LIMIT_MAX_REQUESTS.*RATE_LIMIT_MAX_CLIENTS.*HSTS_MAX_AGE_SECONDS.*JSON_BODY_LIMIT/);
  });
});

describe('health routes', () => {
  it('separa liveness de readiness', async () => {
    const routes = new Map();
    const app = { get: (path, handler) => routes.set(path, handler) };
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
      })),
    };
    registerHealthRoutes(app, supabase, { readinessTimeoutMs: 50 });

    const liveRes = responseMock();
    routes.get('/health/live')({}, liveRes);
    expect(liveRes.status).toHaveBeenCalledWith(200);
    expect(liveRes.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }));

    const readyRes = responseMock();
    await routes.get('/health/ready')({}, readyRes);
    expect(readyRes.status).toHaveBeenCalledWith(200);
    expect(readyRes.json).toHaveBeenCalledWith({ status: 'ready', checks: { database: 'ok' } });
  });

  it('retorna 503 quando o banco nao esta pronto', async () => {
    const routes = new Map();
    const app = { get: (path, handler) => routes.set(path, handler) };
    const supabase = {
      from: () => ({ select: () => ({ limit: async () => ({ error: new Error('offline') }) }) }),
    };
    registerHealthRoutes(app, supabase, { readinessTimeoutMs: 50 });

    const res = responseMock();
    await routes.get('/health/ready')({}, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ status: 'not_ready', checks: { database: 'unavailable' } });
  });
});
