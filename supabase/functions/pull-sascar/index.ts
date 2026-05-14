import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BASE       = 'https://www.smartcamera.michelin.com';
const TENANT_ID  = '743';
const APP_ID     = '10006';
const REFRESH_EP = '/gateway/base-server-service/api/v1/user/refresh';
const ALARM_EP   = '/gateway/report/shipper/alarm/page';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento por categoryId (mais confiável que alarmType).
// 100574 = Fadiga → intervenção imediata
// 100575 = Distração/Comportamento → reportar
// 100573 = Técnico → câmera/vídeo
const CATEGORY_BUCKET: Record<number, 'intervencao' | 'reportar' | 'tecnico'> = {
  100574: 'intervencao',
  100575: 'reportar',
  100573: 'tecnico',
};

// Fallback por alarmType quando categoryId não disponível.
const ALARM_BUCKET: Record<number, 'intervencao' | 'reportar' | 'tecnico'> = {
  56001: 'intervencao', // Bocejo
  56003: 'intervencao', // Olho fechado
  56016: 'intervencao', // Sonolência N2
  56002: 'intervencao', // Sonolência
  56004: 'reportar',
  56010: 'reportar',
  0:     'tecnico',
};

// Nomes de evento por alarmType.
const ALARM_NAMES: Record<number, string> = {
  56001: 'Bocejo',
  56003: 'Olho fechado',
  56016: 'Distração Genérica',
  56002: 'Sonolência',
  56004: 'Comportamento indevido',
  56010: 'Evento reportável',
  0:     'Perda de vídeo',
};

function buildHeaders(token: string) {
  return {
    'Content-Type': 'application/json;charset=utf-8',
    'Accept':       'application/json, text/plain, */*',
    'Origin':       BASE,
    'Referer':      BASE + '/',
    '_appId':       APP_ID,
    '_langType':    'pt_BR',
    '_tenantId':    TENANT_ID,
    '_token':       token,
  };
}

async function tryRefresh(token: string): Promise<string | null> {
  try {
    const res  = await fetch(`${BASE}${REFRESH_EP}`, {
      method: 'POST', headers: buildHeaders(token), body: '{}',
    });
    const data = await res.json();
    return data?.success && data?.data ? String(data.data) : null;
  } catch {
    return null;
  }
}

function getTodayRange(): { startTime: number; endTime: number } {
  const now = new Date();
  // Meia-noite BRT = 03:00 UTC (UTC-3)
  const start = new Date(now);
  start.setUTCHours(3, 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  return { startTime: Math.floor(start.getTime() / 1000), endTime: Math.floor(now.getTime() / 1000) };
}

async function fetchAllAlarms(token: string): Promise<Record<string, unknown>[]> {
  const { startTime, endTime } = getTodayRange();
  const headers = buildHeaders(token);
  const all: Record<string, unknown>[] = [];
  let page = 1;

  while (true) {
    const body = JSON.stringify({
      alarmCategoryIds: '100574,100575,100573',
      alarmLevelIds:    '15,14,13',
      alarmTypes:       '',
      endTime,
      evidence_state:   3,
      fields:           'vehicle,driver,label',
      labelIds:         '',
      mosaicFlag:       0,
      page:             String(page),
      pageSize:         500,
      startTime,
    });

    const res  = await fetch(`${BASE}${ALARM_EP}`, { method: 'POST', headers, body });
    if (!res.ok) throw new Error(`Sascar alarm/page HTTP ${res.status}`);

    const json = await res.json();
    if (!json?.success) throw new Error(json?.message || 'Sascar retornou erro na lista de alarmes');

    const list  = json?.data?.list ?? [];
    const total = json?.data?.total ?? 0;
    all.push(...list);

    if (all.length >= total || list.length < 500) break;
    page++;
    if (page > 20) break; // cap de segurança
  }

  return all;
}

function parseAlarms(alarms: Record<string, unknown>[]) {
  const SEV_LEVEL: Record<number, string> = { 15: 'Gravíssimo', 14: 'Grave', 13: 'Normal' };
  const MIN_SPEED_KMH = 10;

  // Log distribuição de status → identifica valor dos falsos positivos.
  const statusDistrib: Record<string, number> = {};
  for (const a of alarms) {
    const s = String(a.status ?? 'null');
    statusDistrib[s] = (statusDistrib[s] ?? 0) + 1;
  }
  console.log('[pull-sascar] status distribuição:', JSON.stringify(statusDistrib));

  // Velocidade: speed vem em 1/10 km/h (ex: 620 = 62 km/h).
  let filtradosPorVelocidade = 0;
  const valid = alarms.filter(a => {
    const speedKmh = Number(a.speed ?? 0) / 10;
    if (speedKmh < MIN_SPEED_KMH) { filtradosPorVelocidade++; return false; }
    return true;
  });

  // Agrupa por placa
  const byPlaca: Record<string, {
    placa: string; nome: string; transportadora: string; frota: string;
    eventos: Array<{ bucket: string; nome: string; severidade: string; ts: Date | null }>;
    turnos: string[];
  }> = {};

  for (const a of valid) {
    const vi   = (a.vehicleInfo as Record<string, unknown>) ?? {};
    const placa = String(vi.vehicleNumber ?? '').trim();
    if (!placa) continue;

    // Motorista: driverInfo.driverName
    const driverInfo     = (a.driverInfo as Record<string, unknown>) ?? {};
    const nome           = String(driverInfo.driverName ?? '').trim();

    // Transportadora: carrierName direto
    const transportadora = String(a.carrierName ?? '—').trim() || '—';

    // Classificação: categoryId → bucket
    const catList  = (a.categoryInfoList as Array<Record<string, unknown>>) ?? [];
    const catId    = Number(catList[0]?.categoryId ?? 0);
    const alarmType = Number(a.alarmType ?? -1);
    const bucket   = CATEGORY_BUCKET[catId] ?? ALARM_BUCKET[alarmType] ?? 'reportar';
    const nomeEvento = ALARM_NAMES[alarmType] ?? `Evento ${alarmType}`;

    // Severidade: levelInfo.levelId
    const levelInfo  = (a.levelInfo as Record<string, unknown>) ?? {};
    const levelId    = Number(levelInfo.levelId ?? 13);
    const severidade = SEV_LEVEL[levelId] ?? 'Normal';

    // Turno: startTime → hora BRT (UTC-3)
    const happenTime = a.startTime ? new Date(Number(a.startTime) * 1000) : null;
    const horaBRT    = happenTime ? ((happenTime.getUTCHours() - 3) + 24) % 24 : 12;
    const turno      = horaBRT >= 6 && horaBRT < 18 ? 'diurno' : 'noturno';

    if (!byPlaca[placa]) {
      byPlaca[placa] = { placa, nome, transportadora, frota: String(vi.deviceNo ?? ''), eventos: [], turnos: [] };
    }
    if (!byPlaca[placa].nome && nome) byPlaca[placa].nome = nome;

    byPlaca[placa].eventos.push({ bucket, nome: nomeEvento, severidade, ts: happenTime });
    byPlaca[placa].turnos.push(turno);
  }

  const SEV_ORDER = ['Gravíssimo', 'Grave', 'Normal'];
  const maxSev = (sevs: string[]) => SEV_ORDER.find(s => sevs.includes(s)) ?? 'Normal';

  const drivers = Object.values(byPlaca).map((d) => {
    const evIntervencao = d.eventos.filter(e => e.bucket === 'intervencao');
    const evReportar    = d.eventos.filter(e => e.bucket === 'reportar');
    const evTecnico     = d.eventos.filter(e => e.bucket === 'tecnico');

    const datesI = evIntervencao.map(e => e.ts).filter(Boolean) as Date[];
    const datesR = evReportar.map(e => e.ts).filter(Boolean) as Date[];

    const turnoCount: Record<string, number> = {};
    d.turnos.forEach(t => { turnoCount[t] = (turnoCount[t] ?? 0) + 1; });
    const turno = Object.entries(turnoCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'diurno';

    const tiposTecnico: Record<string, number> = {};
    evTecnico.forEach(e => { tiposTecnico[e.nome] = (tiposTecnico[e.nome] ?? 0) + 1; });

    return {
      nome:                 d.nome || d.placa,
      placa:                d.placa,
      transportadora:       d.transportadora,
      frota:                d.frota,
      turno,
      alertas:              evIntervencao.length,
      tipos:                [...new Set(evIntervencao.map(e => e.nome))],
      ultimoEvento:         datesI.length ? new Date(Math.max(...datesI.map(d => d.getTime()))) : null,
      reportaveis:          evReportar.length,
      tiposReportar:        [...new Set(evReportar.map(e => e.nome))],
      ultimoEventoReportar: datesR.length ? new Date(Math.max(...datesR.map(d => d.getTime()))) : null,
      tecnicos:             evTecnico.length,
      tiposTecnico,
      severidade:           maxSev([...evIntervencao, ...evReportar].map(e => e.severidade)),
      intervencoes:         0,
    };
  });

  const stats = {
    total:                  drivers.length,
    comIntervencao:         drivers.filter(d => d.alertas > 0).length,
    soReportar:             drivers.filter(d => d.alertas === 0 && d.reportaveis > 0).length,
    soTecnico:              drivers.filter(d => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0).length,
    totalEventos:           valid.length,
    falsosPositivos:        0,
    filtradosPorVelocidade,
    filtradosPorHistorico:  0,
    autoDescartes:          [],
  };

  return { drivers, stats };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...CORS, 'Content-Type': 'application/json' },
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

    // Lê token Sascar do perfil do operador
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: profileData } = await serviceClient
      .from('profiles')
      .select('sascar_token')
      .eq('id', user.id)
      .single();

    let token = profileData?.sascar_token;
    if (!token) {
      return json({ error: 'Token Sascar não configurado. Use o Favorito Sascar no portal para configurar.', code: 'NO_TOKEN' }, 400);
    }

    // Tenta renovar o token proativamente (evita expiração durante a busca)
    const refreshed = await tryRefresh(token);
    if (refreshed) {
      token = refreshed;
      // Persiste token renovado no perfil
      await serviceClient.from('profiles').update({ sascar_token: token }).eq('id', user.id);
    }

    // Busca alarmes
    let alarms: Record<string, unknown>[];
    try {
      alarms = await fetchAllAlarms(token);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('401') || msg.includes('token')) {
        return json({ error: 'Token Sascar expirado. Clique no Favorito Sascar no portal para renovar.', code: 'TOKEN_EXPIRED' }, 401);
      }
      throw err;
    }

    const { drivers, stats } = parseAlarms(alarms);
    return json({ drivers, stats });

  } catch (err) {
    console.error('[pull-sascar]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
