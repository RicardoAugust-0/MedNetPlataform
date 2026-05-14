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

// Mapeamento de alarmType → bucket canônico.
// Validar com a equipe ao comparar com relatório CSV.
const ALARM_BUCKET: Record<number, 'intervencao' | 'reportar' | 'tecnico'> = {
  56001: 'intervencao', // Bocejo
  56003: 'intervencao', // Olho fechado
  56016: 'intervencao', // Distração / Sonolência N2
  56002: 'intervencao', // Sonolência
  56004: 'reportar',
  56010: 'reportar',
  0:     'tecnico',     // Video Loss / Câmera
};

// Nomes de evento por alarmType (para exibição no DriverCard).
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
      pageSize:         200,
      startTime,
    });

    const res  = await fetch(`${BASE}${ALARM_EP}`, { method: 'POST', headers, body });
    if (!res.ok) throw new Error(`Sascar alarm/page HTTP ${res.status}`);

    const json = await res.json();
    if (!json?.success) throw new Error(json?.message || 'Sascar retornou erro na lista de alarmes');

    const list  = json?.data?.list ?? [];
    const total = json?.data?.total ?? 0;
    all.push(...list);

    if (all.length >= total || list.length < 200) break;
    page++;
    if (page > 20) break; // cap de segurança
  }

  return all;
}

function parseAlarms(alarms: Record<string, unknown>[]) {
  const SEV_MAP: Record<string, string> = { '15': 'Gravíssimo', '14': 'Grave', '13': 'Normal' };

  // A plataforma Sascar já filtra eventos em baixa velocidade internamente.
  // Não aplicamos filtro de speed aqui para não descartar eventos legítimos.
  const valid = alarms;

  // Agrupa por placa
  const byPlaca: Record<string, {
    placa: string; nome: string; transportadora: string; frota: string;
    eventos: Array<{ bucket: string; nome: string; severidade: string; ts: Date | null }>;
    turnos: string[];
  }> = {};

  for (const a of valid) {
    const vi      = (a.vehicleInfo as Record<string, unknown>) ?? {};
    const placa   = String(vi.vehicleNumber ?? a.vehicleId ?? '').trim();
    if (!placa) continue;

    const fleet         = (vi.fleetList as Array<Record<string,string>>)?.[0];
    const transportadora = fleet?.fleetName ?? '—';
    const alarmType     = Number(a.alarmType ?? -1);
    const alarmLevelId  = String(a.alarmLevelId ?? '13');
    const happenTime    = a.happenTime ? new Date(Number(a.happenTime) * 1000) : null;
    const bucket        = ALARM_BUCKET[alarmType] ?? 'reportar';
    const nomeEvento    = ALARM_NAMES[alarmType] ?? `Evento ${alarmType}`;
    const severidade    = SEV_MAP[alarmLevelId] ?? 'Normal';
    const hora          = happenTime ? happenTime.getHours() : 12;
    const turno         = hora >= 6 && hora < 18 ? 'diurno' : 'noturno';

    if (!byPlaca[placa]) {
      byPlaca[placa] = { placa, nome: '', transportadora, frota: String(vi.deviceNo ?? ''), eventos: [], turnos: [] };
    }

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
    filtradosPorVelocidade: 0,
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
