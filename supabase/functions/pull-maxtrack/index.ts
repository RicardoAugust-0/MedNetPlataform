import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BASE = 'https://go.maxtrack.com.br';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LoginResult {
  cookie: string;
  cco:    string;  // company/correlation object ID usado nos headers subsequentes
}

// Autentica no portal Maxtrack, devolve cookie de sessão + cco da empresa.
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

  // Extrai cco = empresa.uid do body do login (UUID obrigatório nas chamadas seguintes).
  let cco = crypto.randomUUID();
  try {
    const body = await res.json();
    const uid = body?.empresa?.uid;
    if (uid) cco = uid;
  } catch { /* ignora erro de parse — usa UUID gerado como fallback */ }

  return { cookie, cco };
}

// Retorna o início do dia atual em BRT (UTC-3) como Date UTC.
// 00:00 BRT = 03:00 UTC.
function getDayStartBRT(): Date {
  const now   = new Date();
  const start = new Date(now);
  start.setUTCHours(3, 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  return start;
}

// Gera janelas de 15 min cobrindo o dia inteiro em BRT até o momento atual.
// A API limita ~30 eventos por chamada; janelas de 15 min garantem que nenhuma
// janela estoure o limite mesmo nos horários de pico de alertas.
function buildWindows(): Array<{ startDate: string; endDate: string }> {
  const dayStart = getDayStartBRT();
  const now      = new Date();
  const windows  = [];
  for (let i = 0; i < 96; i++) {                // 96 x 15 min = 24 h
    const wStart = new Date(dayStart.getTime() + i * 15 * 60 * 1000);
    const wEnd   = new Date(wStart.getTime() + 15 * 60 * 1000 - 1);
    if (wStart >= now) break;
    windows.push({
      startDate: wStart.toISOString(),
      endDate:   wEnd.toISOString(),
    });
  }
  return windows;
}

function buildPayload(startDate: string, endDate: string) {
  return {
    search: {
      id:               null,
      eventIds:         [],
      companies:        [],
      startDate,
      endDate,
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
    },
    stepEvents:         ['NEW', 'IN_PROCESS', 'PENDING', 'ATTACHMENT', 'REOPEN'],
    loadProcessingType: 'ALL',
    aggregatedType:     'N',
    sort:               'desc',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    // Verifica sessão do operador MedNet
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autorizado' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Não autorizado' }, 401);

    // Busca credenciais Maxtrack do perfil do operador (leitura via service_role)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: profileData, error: profileError } = await serviceClient
      .from('profiles')
      .select('maxtrack_email')
      .eq('id', user.id)
      .single();

    const { data: credData, error: credError } = await serviceClient
      .from('profile_credentials')
      .select('maxtrack_password')
      .eq('id', user.id)
      .single();

    if (profileError || credError || !profileData?.maxtrack_email || !credData?.maxtrack_password) {
      return json({ error: 'Credenciais Maxtrack não configuradas. Configure em Meu Perfil.' }, 400);
    }

    // Autentica na Maxtrack com as credenciais do operador
    const { cookie: sessionCookie, cco } = await login(profileData.maxtrack_email, credData.maxtrack_password);

    // Headers usados em todas as chamadas autenticadas — espelha o que o browser envia
    const authHeaders = {
      'Content-Type':     'application/json; charset=utf-8',
      'Cookie':           sessionCookie,
      'X-Requested-With': 'XMLHttpRequest',
      'Origin':           BASE,
      'Referer':          `${BASE}/`,
      'baseURL':          BASE,
      'cm':               'MONITORING',
      'cco':              cco,
      'tz':               'America/Sao_Paulo',
      'User-Agent':       'Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0',
    };

    // Busca todos os eventos do dia em janelas de 15 min em paralelo.
    // A API limita ~30 eventos por chamada; janelas de 15 min evitam o teto.
    const windows = buildWindows();

    const fetchWindow = async (startDate: string, endDate: string) => {
      const res = await fetch(`${BASE}/event/events/load`, {
        method:  'POST',
        headers: authHeaders,
        body:    JSON.stringify(buildPayload(startDate, endDate)),
      });
      if (!res.ok) throw new Error(`Maxtrack /event/events/load HTTP ${res.status} (${startDate})`);
      const d = await res.json();
      return (d.events ?? []) as Record<string, unknown>[];
    };

    const results = await Promise.all(
      windows.map(({ startDate, endDate }) => fetchWindow(startDate, endDate))
    );

    // Deduplica por _id (janelas adjacentes podem ter o mesmo evento na borda)
    const seen  = new Set<string>();
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

    return json({ events, isCompanyIntegrator: false, count: events.length });

  } catch (err) {
    console.error('[pull-maxtrack]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
