import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BASE        = 'https://go.maxtrack.com.br';
const CONCURRENCY = 8;   // requisições paralelas à Maxtrack por vez
const SESSION_TTL = 55 * 60 * 1000;  // 55 min — renova antes de expirar
const RESULT_TTL  =  5 * 60 * 1000;  // 5 min  — cache de resultado

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LoginResult {
  cookie: string;
  cco:    string;
}

async function login(email: string, senha: string): Promise<LoginResult> {
  const res = await fetch(`${BASE}/security/login`, {
    method: 'POST',
    headers: {
      'Content-Type':     'application/json; charset=utf-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin':           BASE,
      'Referer':          `${BASE}/`,
      'tz':               'America/Sao_Paulo',
      'User-Agent':       'Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0',
    },
    body: JSON.stringify({
      email,
      senha,
      so:        'Linux x86_64',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0',
    }),
  });

  if (!res.ok) throw new Error(`Login Maxtrack falhou: HTTP ${res.status}`);

  const setCookie = res.headers.get('set-cookie') ?? '';
  const match     = setCookie.match(/PLAY_SESSION="([^"]+)"/);
  if (!match) throw new Error('Login Maxtrack falhou: credenciais incorretas ou sessão não retornada.');

  const cookie = `PLAY_SESSION="${match[1]}"`;

  let cco = crypto.randomUUID();
  try {
    const body = await res.json();
    const uid = body?.empresa?.uid;
    if (uid) cco = uid;
  } catch { /* ignora erro de parse — usa UUID gerado como fallback */ }

  return { cookie, cco };
}

// Devolve sessão cacheada se ainda válida, ou null.
async function getSession(svc: SupabaseClient, userId: string): Promise<LoginResult | null> {
  const { data } = await svc
    .from('maxtrack_sessions')
    .select('cookie, cco, expires_at')
    .eq('user_id', userId)
    .single();
  if (!data || new Date(data.expires_at) <= new Date()) return null;
  return { cookie: data.cookie, cco: data.cco };
}

async function saveSession(svc: SupabaseClient, userId: string, session: LoginResult) {
  await svc.from('maxtrack_sessions').upsert({
    user_id:    userId,
    cookie:     session.cookie,
    cco:        session.cco,
    expires_at: new Date(Date.now() + SESSION_TTL).toISOString(),
  });
}

// Devolve eventos cacheados se dentro do TTL, ou null.
async function getCachedResult(svc: SupabaseClient, userId: string): Promise<Record<string, unknown>[] | null> {
  const { data } = await svc
    .from('maxtrack_cache')
    .select('events, fetched_at')
    .eq('user_id', userId)
    .single();
  if (!data) return null;
  if (Date.now() - new Date(data.fetched_at).getTime() > RESULT_TTL) return null;
  return data.events as Record<string, unknown>[];
}

async function saveResult(svc: SupabaseClient, userId: string, events: Record<string, unknown>[]) {
  await svc.from('maxtrack_cache').upsert({
    user_id:    userId,
    events,
    fetched_at: new Date().toISOString(),
  });
}

function getDayStartBRT(): Date {
  const now   = new Date();
  const start = new Date(now);
  start.setUTCHours(3, 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  return start;
}

function buildWindows(): Array<{ startDate: string; endDate: string }> {
  const dayStart = getDayStartBRT();
  const now      = new Date();
  const windows  = [];
  for (let i = 0; i < 96; i++) {
    const wStart = new Date(dayStart.getTime() + i * 15 * 60 * 1000);
    const wEnd   = new Date(wStart.getTime() + 15 * 60 * 1000 - 1);
    if (wStart >= now) break;
    windows.push({ startDate: wStart.toISOString(), endDate: wEnd.toISOString() });
  }
  return windows;
}

// Parte estática do payload montada uma vez — só as datas variam por janela.
const STATIC_SEARCH = {
  id:               null,
  eventIds:         [],
  companies:        [],
  priorityId:       null,
  latitude:         null,
  longitude:        null,
  distance:         null,
  categories: [
    { id: 57, selectable: true, name: 'Análise de Fadiga (Global)',         canEdit: false, global: true },
    { id: 63, selectable: true, name: 'Análise desatenção/fadiga (Global)', canEdit: false, global: true },
  ],
  criticalityLevels: [
    { id: 3, selectable: true, name: 'Grave',      color: '#d97e17', canEdit: false, level: 80  },
    { id: 4, selectable: true, name: 'Gravíssimo', color: '#da1010', canEdit: false, level: 100 },
    { id: 2, selectable: true, name: 'Médio',      color: '#ecce09', canEdit: false, level: 50  },
  ],
  eventTypes:          [],
  eventSources:        [],
  areas:               [],
  classificationTypes: [],
  classification:      null,
  users:               [],
  localIdentifiers:    null,
  serials:             null,
  locals:              [],
  drivers:             [],
  soSearchType:        null,
  serviceOrders:       null,
  operationals:        null,
  showAutoClose:       null,
  showNewSteps:        [],
  routes:              [],
  analizeIAItemsIds:   [],
  customers:           [],
  reserved:            null,
  biActive:            null,
  eventTypeBIs:        [],
  themeBIId:           null,
  fleetId:             null,
  operatorUnits:       [],
  operationTypes:      [],
} as const;

function buildPayload(startDate: string, endDate: string) {
  return {
    search:             { ...STATIC_SEARCH, startDate, endDate },
    stepEvents:         ['NEW', 'IN_PROCESS', 'PENDING', 'ATTACHMENT', 'REOPEN'],
    loadProcessingType: 'ALL',
    aggregatedType:     'N',
    sort:               'desc',
  };
}

// Busca uma janela com até 2 retentativas em erro transitório (backoff 500 ms / 1 s).
async function fetchWindow(
  startDate: string,
  endDate: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/event/events/load`, {
        method:  'POST',
        headers,
        body:    JSON.stringify(buildPayload(startDate, endDate)),
        signal:  AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      return (d.events ?? []) as Record<string, unknown>[];
    } catch (err) {
      if (attempt === 2) {
        throw new Error(`Maxtrack /event/events/load falhou (${startDate}): ${(err as Error).message}`);
      }
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return [];
}

// Executa fn em lotes de `concurrency` itens para não sobrecarregar a API.
async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = await Promise.all(items.slice(i, i + concurrency).map(fn));
    results.push(...batch);
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autorizado' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Não autorizado' }, 401);

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Retorna imediatamente se o cache de resultado ainda for válido.
    const cached = await getCachedResult(serviceClient, user.id);
    if (cached) return json({ events: cached, isCompanyIntegrator: false, count: cached.length, fromCache: true });

    // Busca credenciais e sessão cacheada em paralelo.
    const [
      { data: profileData },
      { data: credData },
      cachedSession,
    ] = await Promise.all([
      serviceClient.from('profiles').select('maxtrack_email').eq('id', user.id).single(),
      serviceClient.from('profile_credentials').select('maxtrack_password').eq('id', user.id).single(),
      getSession(serviceClient, user.id),
    ]);

    if (!profileData?.maxtrack_email || !credData?.maxtrack_password) {
      return json({ error: 'Credenciais Maxtrack não configuradas. Configure em Meu Perfil.' }, 400);
    }

    // Reutiliza sessão cacheada ou faz novo login e persiste o cookie.
    let session = cachedSession;
    if (!session) {
      session = await login(profileData.maxtrack_email, credData.maxtrack_password);
      saveSession(serviceClient, user.id, session); // fire-and-forget
    }

    const authHeaders: Record<string, string> = {
      'Content-Type':     'application/json; charset=utf-8',
      'Cookie':           session.cookie,
      'X-Requested-With': 'XMLHttpRequest',
      'Origin':           BASE,
      'Referer':          `${BASE}/`,
      'baseURL':          BASE,
      'cm':               'MONITORING',
      'cco':              session.cco,
      'tz':               'America/Sao_Paulo',
      'User-Agent':       'Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0',
    };

    const windows = buildWindows();
    const results = await pool(
      windows,
      CONCURRENCY,
      ({ startDate, endDate }) => fetchWindow(startDate, endDate, authHeaders),
    );

    const seen   = new Set<string>();
    const events: Record<string, unknown>[] = [];
    for (const batch of results) {
      for (const ev of batch) {
        const id = ev._id as string;
        if (id && !seen.has(id)) {
          seen.add(id);
          events.push(ev);
        }
      }
    }

    saveResult(serviceClient, user.id, events); // fire-and-forget

    return json({ events, isCompanyIntegrator: false, count: events.length, fromCache: false });

  } catch (err) {
    console.error('[pull-maxtrack]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
