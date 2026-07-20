import { describe, expect, it, vi } from 'vitest';
import {
  AutomationEndpointResolutionError,
  createRateLimitMiddleware,
  createSecurityHeadersMiddleware,
  fetchAutomationWebhook,
  isPrivateOrReservedIp,
  safeSecretEqual,
  UnsafeUrlError,
  validateAutomationEndpoint,
} from './security.js';

function responseMock() {
  const headers = new Map([['X-Powered-By', 'Express']]);
  const res = {
    headers,
    setHeader: vi.fn((name, value) => headers.set(name, value)),
    removeHeader: vi.fn((name) => headers.delete(name)),
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe('security helpers', () => {
  it('compara segredos sem aceitar tipos ou comprimentos diferentes', () => {
    expect(safeSecretEqual('segredo-forte', 'segredo-forte')).toBe(true);
    expect(safeSecretEqual('segredo-fraco', 'segredo-forte')).toBe(false);
    expect(safeSecretEqual(undefined, 'segredo-forte')).toBe(false);
  });

  it('classifica enderecos locais e privados', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.2.3.4')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.2')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('fd00::1')).toBe(true);
    expect(isPrivateOrReservedIp('fec0::1')).toBe(true);
    expect(isPrivateOrReservedIp('64:ff9b::c0a8:101')).toBe(true);
    expect(isPrivateOrReservedIp('2001:db8::1')).toBe(true);
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
  });

  it('aceita somente HTTPS, allowlist e DNS publico', async () => {
    const lookupImpl = vi.fn(async () => [{ address: '8.8.8.8', family: 4 }]);
    await expect(validateAutomationEndpoint('https://hooks.example.com/run', {
      allowedHosts: ['hooks.example.com'],
      lookupImpl,
    })).resolves.toEqual(expect.objectContaining({ hostname: 'hooks.example.com' }));
    expect(lookupImpl).toHaveBeenCalledOnce();

    await expect(validateAutomationEndpoint('http://hooks.example.com/run', {
      allowedHosts: ['hooks.example.com'],
      lookupImpl,
    })).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(validateAutomationEndpoint('https://evil.example/run', {
      allowedHosts: ['hooks.example.com'],
      lookupImpl,
    })).rejects.toThrow('allowlist');
  });

  it('bloqueia IP privado literal e DNS rebinding para rede privada', async () => {
    await expect(validateAutomationEndpoint('https://127.0.0.1/run', {
      allowedHosts: ['127.0.0.1'],
    })).rejects.toThrow('privado');

    await expect(validateAutomationEndpoint('https://hooks.example.com/run', {
      allowedHosts: ['hooks.example.com'],
      lookupImpl: vi.fn(async () => [{ address: '169.254.169.254', family: 4 }]),
    })).rejects.toThrow('rede privada');
  });

  it('preserva a causa de uma falha DNS transitoria', async () => {
    const dnsError = Object.assign(new Error('getaddrinfo EAI_AGAIN hooks.example.com'), {
      code: 'EAI_AGAIN',
    });

    await expect(validateAutomationEndpoint('https://hooks.example.com/run', {
      allowedHosts: ['hooks.example.com'],
      lookupImpl: vi.fn(async () => { throw dnsError; }),
    })).rejects.toMatchObject({
      name: 'AutomationEndpointResolutionError',
      code: 'EAI_AGAIN',
      cause: dnsError,
    });
    await expect(validateAutomationEndpoint('https://hooks.example.com/run', {
      allowedHosts: ['hooks.example.com'],
      lookupImpl: vi.fn(async () => { throw dnsError; }),
    })).rejects.toBeInstanceOf(AutomationEndpointResolutionError);
  });

  it('interrompe DNS pendente pelo mesmo signal e nao inicia o fetch', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn();
    const validateEndpoint = (endpoint, { signal }) => validateAutomationEndpoint(endpoint, {
      allowedHosts: ['hooks.example.com'],
      lookupImpl: vi.fn(() => new Promise(() => {})),
      lookupTimeoutMs: 60_000,
      signal,
    });
    const pending = fetchAutomationWebhook('https://hooks.example.com/run', {
      method: 'POST',
      signal: controller.signal,
    }, { fetchImpl, validateEndpoint });
    const abortError = new Error('cancelado pelo deadline');
    abortError.name = 'AbortError';

    controller.abort(abortError);

    await expect(pending).rejects.toBe(abortError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('nao inicia o lookup quando o signal ja nasceu abortado', async () => {
    const controller = new AbortController();
    const abortError = new Error('deadline expirado');
    abortError.name = 'TimeoutError';
    controller.abort(abortError);
    const lookupImpl = vi.fn(async () => {
      throw new Error('lookup nao deveria iniciar');
    });

    await expect(validateAutomationEndpoint('https://hooks.example.com/run', {
      allowedHosts: ['hooks.example.com'],
      lookupImpl,
      signal: controller.signal,
    })).rejects.toBe(abortError);

    expect(lookupImpl).not.toHaveBeenCalled();
  });

  it('nao segue redirects de webhook', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 302, ok: false }));
    await expect(fetchAutomationWebhook('https://hooks.example.com/run', { method: 'POST' }, {
      fetchImpl,
      validateEndpoint: vi.fn(async () => {}),
    })).rejects.toThrow('Redirect');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://hooks.example.com/run',
      expect.objectContaining({ method: 'POST', redirect: 'manual' }),
    );
  });

  it('encaminha ao validador o mesmo signal usado no fetch', async () => {
    const controller = new AbortController();
    const validateEndpoint = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => ({ status: 200, ok: true }));

    await fetchAutomationWebhook('https://hooks.example.com/run', {
      method: 'POST',
      signal: controller.signal,
    }, { fetchImpl, validateEndpoint });

    expect(validateEndpoint).toHaveBeenCalledWith(
      'https://hooks.example.com/run',
      { signal: controller.signal },
    );
  });
});

describe('HTTP security middleware', () => {
  it('remove identificacao do Express e aplica headers defensivos', () => {
    const res = responseMock();
    const next = vi.fn();
    createSecurityHeadersMiddleware({ production: true, hstsMaxAgeSeconds: 600 })({}, res, next);

    expect(res.headers.get('X-Powered-By')).toBeUndefined();
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=600');
    expect(next).toHaveBeenCalledOnce();
  });

  it('nao envia HSTS fora de producao', () => {
    const res = responseMock();
    createSecurityHeadersMiddleware({ production: false })({}, res, vi.fn());
    expect(res.headers.has('Strict-Transport-Security')).toBe(false);
  });
});

describe('global rate limiter', () => {
  it('limita por IP, publica quota e libera uma nova janela', () => {
    let currentTime = 10_000;
    const middleware = createRateLimitMiddleware({
      windowMs: 1_000,
      maxRequests: 2,
      maxClients: 10,
      now: () => currentTime,
    });
    const req = { ip: '203.0.113.10' };
    const next = vi.fn();

    let res = responseMock();
    middleware(req, res, next);
    expect(res.headers.get('RateLimit-Remaining')).toBe('1');

    res = responseMock();
    middleware(req, res, next);
    expect(res.headers.get('RateLimit-Remaining')).toBe('0');

    res = responseMock();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.headers.get('Retry-After')).toBe('1');
    expect(next).toHaveBeenCalledTimes(2);

    currentTime = 11_000;
    res = responseMock();
    middleware(req, res, next);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.headers.get('RateLimit-Remaining')).toBe('1');
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('mantem quotas independentes e recusa configuracao invalida', () => {
    const middleware = createRateLimitMiddleware({ windowMs: 1_000, maxRequests: 1, maxClients: 2 });
    const firstNext = vi.fn();
    const secondNext = vi.fn();
    middleware({ ip: '198.51.100.1' }, responseMock(), firstNext);
    middleware({ ip: '198.51.100.2' }, responseMock(), secondNext);
    expect(firstNext).toHaveBeenCalledOnce();
    expect(secondNext).toHaveBeenCalledOnce();
    expect(() => createRateLimitMiddleware({ maxRequests: 0 })).toThrow('maxRequests');
  });
});
