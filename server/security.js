import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';

const DEFAULT_AUTOMATION_HOSTS = [
  'botsplaywright.duckdns.org',
  'mednetn8n.duckdns.org',
];
const DEFAULT_DNS_LOOKUP_TIMEOUT_MS = 5_000;

export class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export class AutomationEndpointResolutionError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AutomationEndpointResolutionError';
    this.cause = cause;
    this.retrySafe = true;
    if (cause?.code) this.code = cause.code;
  }
}

function timeoutError(message) {
  const error = new Error(message);
  error.name = 'TimeoutError';
  error.code = 'ETIMEDOUT';
  error.retrySafe = true;
  return error;
}

function signalReason(signal) {
  if (signal?.reason) return signal.reason;
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function waitForDnsLookup(lookupFactory, { signal, timeoutMs }) {
  if (signal?.aborted) return Promise.reject(signalReason(signal));

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, signalReason(signal));

    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        finish(reject, timeoutError('DNS lookup timed out.'));
      }, timeoutMs);
    }

    Promise.resolve().then(lookupFactory).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

export function safeSecretEqual(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  const receivedBuffer = Buffer.from(received, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function createSecurityHeadersMiddleware({
  production = false,
  hstsMaxAgeSeconds = 31_536_000,
} = {}) {
  return (req, res, next) => {
    res.removeHeader('X-Powered-By');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    if (production) {
      res.setHeader('Strict-Transport-Security', `max-age=${hstsMaxAgeSeconds}`);
    }
    next();
  };
}

function clientKey(req) {
  const value = req.ip || req.socket?.remoteAddress || 'unknown';
  return String(value).slice(0, 200);
}

export function createRateLimitMiddleware({
  windowMs = 60_000,
  maxRequests = 300,
  maxClients = 10_000,
  now = Date.now,
  keyGenerator = clientKey,
} = {}) {
  if (!Number.isInteger(windowMs) || windowMs <= 0) throw new TypeError('windowMs invalido.');
  if (!Number.isInteger(maxRequests) || maxRequests <= 0) throw new TypeError('maxRequests invalido.');
  if (!Number.isInteger(maxClients) || maxClients <= 0) throw new TypeError('maxClients invalido.');

  const clients = new Map();

  const makeRoom = (currentTime) => {
    for (const [key, state] of clients) {
      if (state.resetAt <= currentTime) clients.delete(key);
    }
    while (clients.size >= maxClients) {
      const oldestKey = clients.keys().next().value;
      clients.delete(oldestKey);
    }
  };

  return (req, res, next) => {
    const currentTime = now();
    const key = String(keyGenerator(req) || 'unknown').slice(0, 200);
    let state = clients.get(key);

    if (!state || state.resetAt <= currentTime) {
      if (!state && clients.size >= maxClients) makeRoom(currentTime);
      state = { count: 0, resetAt: currentTime + windowMs };
      clients.set(key, state);
    }

    state.count += 1;
    const remaining = Math.max(0, maxRequests - state.count);
    const resetSeconds = Math.max(1, Math.ceil((state.resetAt - currentTime) / 1000));
    res.setHeader('RateLimit-Limit', String(maxRequests));
    res.setHeader('RateLimit-Policy', `${maxRequests};w=${Math.ceil(windowMs / 1000)}`);
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(state.resetAt / 1000)));

    if (state.count > maxRequests) {
      res.setHeader('Retry-After', String(resetSeconds));
      return res.status(429).json({ error: 'Muitas requisicoes. Tente novamente mais tarde.' });
    }
    return next();
  };
}

export function getAutomationAllowedHosts(raw = process.env.AUTOMATION_WEBHOOK_ALLOWED_HOSTS) {
  const hosts = raw
    ? raw.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_AUTOMATION_HOSTS;
  return [...new Set(hosts)];
}

function hostAllowed(hostname, allowedHosts) {
  return allowedHosts.some((allowedHost) => {
    if (allowedHost.startsWith('*.')) {
      const suffix = allowedHost.slice(1);
      return hostname.endsWith(suffix) && hostname.length > suffix.length;
    }
    return hostname === allowedHost;
  });
}

function isPrivateIpv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

export function isPrivateOrReservedIp(address) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version !== 6) return true;

  const normalized = address.toLowerCase().split('%')[0];
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  const firstHextet = Number.parseInt(normalized.split(':')[0], 16);
  const isGlobalUnicast = firstHextet >= 0x2000 && firstHextet <= 0x3fff;
  return !isGlobalUnicast
    || normalized.startsWith('2001::')
    || normalized.startsWith('2001:0:')
    || normalized.startsWith('2001:db8:')
    || normalized === '2001:db8::'
    || normalized.startsWith('2001:2:')
    || normalized.startsWith('2001:10:')
    || normalized.startsWith('2001:20:')
    || normalized.startsWith('2002:');
}

export async function validateAutomationEndpoint(
  endpoint,
  {
    allowedHosts = getAutomationAllowedHosts(),
    lookupImpl = dnsLookup,
    lookupTimeoutMs = DEFAULT_DNS_LOOKUP_TIMEOUT_MS,
    signal,
  } = {},
) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new UnsafeUrlError('Endpoint de automacao invalido.');
  }

  if (url.protocol !== 'https:') {
    throw new UnsafeUrlError('O endpoint de automacao deve usar HTTPS.');
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('Credenciais embutidas na URL nao sao permitidas.');
  }
  if (url.port && url.port !== '443') {
    throw new UnsafeUrlError('Apenas a porta HTTPS padrao e permitida.');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new UnsafeUrlError('Host local nao e permitido.');
  }
  if (!hostAllowed(hostname, allowedHosts.map((host) => host.toLowerCase()))) {
    throw new UnsafeUrlError('Host fora da allowlist de automacoes.');
  }

  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new UnsafeUrlError('Endereco IP privado ou reservado nao e permitido.');
    }
    return url;
  }

  let addresses;
  try {
    addresses = await waitForDnsLookup(
      () => lookupImpl(hostname, { all: true, verbatim: true }),
      { signal, timeoutMs: lookupTimeoutMs },
    );
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw error;
    throw new AutomationEndpointResolutionError(
      'Nao foi possivel resolver o host da automacao.',
      error,
    );
  }
  const resolved = Array.isArray(addresses) ? addresses : [addresses];
  if (resolved.length === 0 || resolved.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw new UnsafeUrlError('O host da automacao resolve para rede privada ou reservada.');
  }
  return url;
}

export async function fetchAutomationWebhook(
  endpoint,
  options,
  {
    fetchImpl = fetch,
    validateEndpoint = validateAutomationEndpoint,
  } = {},
) {
  await validateEndpoint(endpoint, { signal: options?.signal });
  if (options?.signal?.aborted) throw signalReason(options.signal);
  let response;
  try {
    response = await fetchImpl(endpoint, { ...options, redirect: 'manual' });
  } catch (error) {
    if (error && typeof error === 'object') {
      const errorText = `${error.message || ''} ${error.code || ''} ${error.cause?.code || ''}`;
      const retrySafe = /UND_ERR_CONNECT_TIMEOUT|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|ENETUNREACH|EHOSTUNREACH/i
        .test(errorText);
      try {
        error.retrySafe = retrySafe;
        error.requestMayHaveBeenSent = !retrySafe;
      } catch {
        // Alguns runtimes congelam erros nativos; o classificador ainda usa code/cause.
      }
    }
    throw error;
  }
  if (response.status >= 300 && response.status < 400) {
    throw new UnsafeUrlError('Redirect de webhook bloqueado. Configure diretamente o destino final.');
  }
  return response;
}
