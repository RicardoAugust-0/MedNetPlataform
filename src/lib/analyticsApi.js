import { supabase } from '../supabase.js';
import { API_URL } from './runtimeConfig.js';

export { API_URL } from './runtimeConfig.js';

/**
 * Header Authorization com o access_token da sessão Supabase atual.
 * A API de analytics é admin-only e roda com service_role: sem token a request
 * é rejeitada com 401. Retorna {} quando não há sessão (deixa o backend negar).
 */
export async function getAuthHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function waitForAuthHeaders(timeoutMs = 1200) {
  const initial = await getAuthHeaders();
  if (initial.Authorization) return initial;

  return new Promise((resolve) => {
    let settled = false;
    let subscription = null;

    const finish = (headers) => {
      if (settled) return;
      settled = true;
      subscription?.unsubscribe?.();
      resolve(headers);
    };

    const timer = setTimeout(() => finish({}), timeoutMs);

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token;
      if (!token) return;
      clearTimeout(timer);
      finish({ Authorization: `Bearer ${token}` });
    });
    subscription = data?.subscription || null;
  });
}

/**
 * fetch autenticado para a API de analytics. `path` deve começar com '/'.
 * Injeta o header de auth preservando quaisquer headers passados em options.
 *
 * Resiliência a 401: logo após um F5, a sessão do Supabase pode ainda estar
 * sendo restaurada/renovada — o token vem nulo ou expirado e o backend rejeita
 * com 401. Nesse caso, renovamos a sessão e repetimos a request UMA vez.
 * É seguro reenviar: um 401 significa que a request não foi processada.
 */
export async function apiFetch(path, options = {}) {
  const { timeoutMs = 30000, signal: externalSignal, ...fetchOptions } = options;

  let timer = null;
  let signal = externalSignal;

  if (timeoutMs > 0) {
    const controller = new AbortController();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
      }
    }
    timer = setTimeout(() => {
      controller.abort(new Error(`Timeout de ${timeoutMs}ms excedido na requisição ${path}`));
    }, timeoutMs);
    signal = controller.signal;
  }

  try {
    const auth = await waitForAuthHeaders();
    const res = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      signal,
      headers: { ...(fetchOptions.headers || {}), ...auth },
    });

    if (res.status !== 401) return res;

    // Tenta renovar a sessão e repetir uma única vez.
    let refreshed;
    try {
      const { data } = await supabase.auth.refreshSession();
      refreshed = data?.session?.access_token || null;
    } catch {
      refreshed = null;
    }
    if (!refreshed) {
      // fallback: relê a sessão (pode ter terminado de restaurar nesse meio-tempo)
      const retryAuth = await getAuthHeaders();
      if (!retryAuth.Authorization) return res; // sem token: devolve o 401 original
      return fetch(`${API_URL}${path}`, {
        ...fetchOptions,
        signal,
        headers: { ...(fetchOptions.headers || {}), ...retryAuth },
      });
    }

    return fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      signal,
      headers: { ...(fetchOptions.headers || {}), Authorization: `Bearer ${refreshed}` },
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fonte única da verdade para a query string de /api/analytics (e do CSV).
 * Usada pelo loader principal, pelo drill-down e pela exportação — evita que as
 * três cópias divirjam (ex.: `sources=` vs `company_<pid>=`).
 *
 * Em modo comparação, `sources` é a lista [{ platformId, company }]; em modo
 * único, usa-se `platformId` (+ `company` opcional). `classification` só é
 * incluída quando diferente de 'all' (o drill passa a classificação-alvo).
 */
export function buildAnalyticsQuery({
  compare = false,
  sources = [],
  platformId = null,
  company = '',
  month = null,
  startDate = '',
  endDate = '',
  severity = '',
  classification = '',
  eventType = '',
  uf = '',
} = {}) {
  const params = new URLSearchParams();

  if (compare) {
    const platformIds = [...new Set((sources || []).map((s) => s.platformId))];
    params.set('compare', 'true');
    params.set('platformIds', platformIds.join(','));
    params.set('sources', JSON.stringify(sources || []));
  } else {
    if (platformId) params.set('platformId', platformId);
    if (company) params.set('company', company);
    if (uf) params.set('uf', uf);
  }

  if (month) params.set('month', month);
  if (month === 'custom' && startDate && endDate) {
    params.set('startDate', startDate);
    params.set('endDate', endDate);
  }
  if (severity) params.set('severity', severity);
  if (classification && classification !== 'all') params.set('classification', classification);
  if (eventType) params.set('eventType', eventType);

  return params.toString();
}
