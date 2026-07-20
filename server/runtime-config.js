function configuredInteger(env, key, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}, errors = []) {
  if (env[key] === undefined || env[key] === '') return fallback;
  const parsed = Number(env[key]);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${key} invalido.`);
    return fallback;
  }
  return parsed;
}

function parseOrigins(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean))];
}

export function loadRuntimeConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const errors = [];
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseKey = serviceRoleKey || (!production ? env.VITE_SUPABASE_PUBLISHABLE_KEY : null);
  const corsAllowedOrigins = parseOrigins(env.CORS_ORIGIN);
  const jsonBodyLimit = env.JSON_BODY_LIMIT || '2mb';
  const readinessTimeoutMs = configuredInteger(
    env,
    'READINESS_TIMEOUT_MS',
    5_000,
    { min: 100, max: 60_000 },
    errors,
  );
  const trustProxyHops = configuredInteger(
    env,
    'TRUST_PROXY_HOPS',
    production ? 1 : 0,
    { min: 0, max: 10 },
    errors,
  );
  const rateLimitWindowMs = configuredInteger(
    env,
    'RATE_LIMIT_WINDOW_MS',
    60_000,
    { min: 1_000, max: 3_600_000 },
    errors,
  );
  const rateLimitMaxRequests = configuredInteger(
    env,
    'RATE_LIMIT_MAX_REQUESTS',
    300,
    { min: 1, max: 100_000 },
    errors,
  );
  const rateLimitMaxClients = configuredInteger(
    env,
    'RATE_LIMIT_MAX_CLIENTS',
    10_000,
    { min: 1, max: 1_000_000 },
    errors,
  );
  const hstsMaxAgeSeconds = configuredInteger(
    env,
    'HSTS_MAX_AGE_SECONDS',
    31_536_000,
    { min: 300, max: 63_072_000 },
    errors,
  );

  if (!supabaseUrl) errors.push('SUPABASE_URL ausente.');
  if (production && !serviceRoleKey) errors.push('SUPABASE_SERVICE_ROLE_KEY e obrigatoria em producao.');
  if (!supabaseKey) errors.push('Credencial do Supabase ausente.');
  if (production && corsAllowedOrigins.length === 0) errors.push('CORS_ORIGIN e obrigatoria em producao.');
  if (!/^\d+(?:\.\d+)?(?:b|kb|mb|gb)$/i.test(jsonBodyLimit)) errors.push('JSON_BODY_LIMIT invalido.');
  if (errors.length > 0) throw new Error(errors.join(' '));

  return {
    production,
    supabaseUrl,
    supabaseKey,
    serviceRoleKey,
    corsAllowedOrigins,
    jsonBodyLimit,
    readinessTimeoutMs,
    trustProxyHops,
    securityHeaders: { hstsMaxAgeSeconds },
    rateLimit: {
      windowMs: rateLimitWindowMs,
      maxRequests: rateLimitMaxRequests,
      maxClients: rateLimitMaxClients,
    },
  };
}

export function buildCorsOptions(allowedOrigins, { production = false } = {}) {
  const allowed = new Set(allowedOrigins);
  return {
    origin(origin, callback) {
      // Clientes M2M e health checks nao enviam Origin; CORS so se aplica ao navegador.
      if (!origin || allowed.has(origin) || (!production && allowed.size === 0)) {
        callback(null, true);
        return;
      }
      const error = new Error('Origem nao permitida pelo CORS.');
      error.status = 403;
      callback(error);
    },
    optionsSuccessStatus: 204,
  };
}

async function checkSupabaseReady(supabase, timeoutMs) {
  let timer;
  try {
    const result = await Promise.race([
      supabase.from('profiles').select('id').limit(1),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
        timer.unref?.();
      }),
    ]);
    if (result?.error) throw result.error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function registerHealthRoutes(app, supabase, { readinessTimeoutMs = 5_000 } = {}) {
  const livePayload = () => ({
    status: 'ok',
    service: 'MedNet Backend API',
    uptime_seconds: Math.floor(process.uptime()),
  });

  app.get('/', (req, res) => res.status(200).json(livePayload()));
  app.get('/health', (req, res) => res.status(200).json(livePayload()));
  app.get('/health/live', (req, res) => res.status(200).json(livePayload()));
  app.get('/health/ready', async (req, res) => {
    try {
      await checkSupabaseReady(supabase, readinessTimeoutMs);
      return res.status(200).json({ status: 'ready', checks: { database: 'ok' } });
    } catch {
      return res.status(503).json({ status: 'not_ready', checks: { database: 'unavailable' } });
    }
  });
}
