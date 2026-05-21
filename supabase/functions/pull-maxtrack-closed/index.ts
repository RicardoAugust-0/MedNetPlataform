import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BASE        = 'https://go.maxtrack.com.br';
const SESSION_TTL = 55 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LoginResult {
  cookie: string;
  cco:    string;
}

interface ClosedEvent {
  _id:             string;
  startDate:       number | null;
  identifier:      string;
  driverName:      string;
  companyName:     string;
  eventName:       string;
  criticalityName: string;
  fechadoPor:      string | null;
  fechadoEm:       number | null;
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
  } catch { /* ignora erro de parse */ }

  return { cookie, cco };
}

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

// Retorna o intervalo do dia BRT atual: 03:00 UTC → 02:59:59 UTC do dia seguinte.
function getDayRangeBRT(): { startDate: string; endDate: string } {
  const now   = new Date();
  const start = new Date(now);
  start.setUTCHours(3, 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1); // 02:59:59.999 UTC

  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

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
  soSearchType:        'N',
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
    stepEvents: [
      'CLOSED',
      'AUTO_CLOSED',
      'AUTO_CLOSED_TIME',
      'AUTO_CLOSED_NO_EVIDENCE_TIME',
      'AUTO_CLOSED_COMPLEMENTARY',
      'AUTO_CLOSED_AUTOMATION',
      'AUTO_CLOSED_SUSPENSION',
    ],
    loadProcessingType: '',
    aggregatedType:     'N',
    sort:               'desc',
  };
}

// ev.step é o status atual do evento: { id: 'AUTO_CLOSED_*' | 'CLOSED', name: string }
// Para auto-fechamento, não há operador humano — usamos o nome do step como "fechadoPor".
// Para fechamento manual (CLOSED), procuramos um campo de usuário.
function extractClosingInfo(ev: Record<string, unknown>): { fechadoPor: string | null; fechadoEm: number | null } {
  const step     = ev.step as Record<string, unknown> | undefined;
  const stepName = String(step?.name || '');

  const closingUser =
    (ev.closingUser as Record<string, unknown>)?.name as string | undefined ||
    (ev.closedByUser as Record<string, unknown>)?.name as string | undefined;

  const fechadoPor = closingUser || (stepName || null);

  // autoCloseDate vem em milissegundos; endDate em segundos (0 = não preenchido).
  const autoCloseDateMs = ev.autoCloseDate as number | undefined;
  const endDateRaw      = ev.endDate as number | undefined;

  let fechadoEm: number | null = null;
  if (autoCloseDateMs && autoCloseDateMs > 0) {
    fechadoEm = Math.floor(autoCloseDateMs / 1000);
  } else if (endDateRaw && endDateRaw > 0) {
    fechadoEm = endDateRaw > 1e10 ? Math.floor(endDateRaw / 1000) : endDateRaw;
  }

  return { fechadoPor, fechadoEm };
}

function parseEvent(ev: Record<string, unknown>): ClosedEvent {
  const { fechadoPor, fechadoEm } = extractClosingInfo(ev);

  const rawStart = ev.startDate as number | undefined;
  const startDate = rawStart
    ? (rawStart > 1e10 ? Math.floor(rawStart / 1000) : rawStart)
    : null;

  return {
    _id:             String(ev._id || ''),
    startDate,
    identifier:      String(ev.identifier || ''),
    driverName:      String((ev.driver as Record<string, unknown>)?.name || ''),
    companyName:     String((ev.company as Record<string, unknown>)?.name || ''),
    eventName:       String((ev.event as Record<string, unknown>)?.name || ''),
    criticalityName: String(
      ((ev.event as Record<string, unknown>)?.criticalityLevel as Record<string, unknown>)?.name || ''
    ),
    fechadoPor,
    fechadoEm,
  };
}

// O portal Maxtrack usa uma única requisição para o dia inteiro (sem janelas).
// Usamos a mesma estratégia para garantir todos os eventos fechados.
async function fetchAllClosedToday(headers: Record<string, string>): Promise<Record<string, unknown>[]> {
  const { startDate, endDate } = getDayRangeBRT();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/event/events/load`, {
        method:  'POST',
        headers,
        body:    JSON.stringify(buildPayload(startDate, endDate)),
        signal:  AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      return (d.events ?? []) as Record<string, unknown>[];
    } catch (err) {
      if (attempt === 2) {
        throw new Error(`Maxtrack /event/events/load falhou: ${(err as Error).message}`);
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return [];
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

    let session = cachedSession;
    if (!session) {
      session = await login(profileData.maxtrack_email, credData.maxtrack_password);
      saveSession(serviceClient, user.id, session);
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

    const rawEvents = await fetchAllClosedToday(authHeaders);

    const seen   = new Set<string>();
    const events: ClosedEvent[] = [];
    for (const ev of rawEvents) {
      const id = ev._id as string;
      if (id && !seen.has(id)) {
        seen.add(id);
        events.push(parseEvent(ev));
      }
    }

    // Ordena pelo horário de fechamento mais recente primeiro.
    events.sort((a, b) => (b.fechadoEm ?? b.startDate ?? 0) - (a.fechadoEm ?? a.startDate ?? 0));

    return json({ events, count: events.length });

  } catch (err) {
    console.error('[pull-maxtrack-closed]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
