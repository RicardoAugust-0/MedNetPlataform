import { supabase } from '../supabase.js';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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

/**
 * fetch autenticado para a API de analytics. `path` deve começar com '/'.
 * Injeta o header de auth preservando quaisquer headers passados em options.
 */
export async function apiFetch(path, options = {}) {
  const auth = await getAuthHeaders();
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), ...auth },
  });
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
