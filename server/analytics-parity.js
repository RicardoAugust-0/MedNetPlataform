import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { aggregate } from '../src/utils/fatigueParser.js';
import { buildSingleAnalyticsViaRPC } from './analytics-rpc.js';

// Load environment variables
dotenv.config({ path: '../.env' });
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Replicate index.js helpers
function excludeLeve(events) {
  return events.filter((ev) => ev.severidade !== 'Leve');
}

function toSpWallclock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const sp = new Date(d.getTime() - 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${sp.getUTCFullYear()}-${p(sp.getUTCMonth() + 1)}-${p(sp.getUTCDate())} `
       + `${p(sp.getUTCHours())}:${p(sp.getUTCMinutes())}:${p(sp.getUTCSeconds())}`;
}

function resolveMonitorName(name, aliases) {
  if (!name) return '';
  const nameLower = name.toLowerCase();

  for (const key of Object.keys(aliases)) {
    const val = aliases[key];
    if (!val) continue;

    const parts = val.split(',').map(p => p.trim());
    for (const part of parts) {
      if (!part) continue;
      const partLower = part.toLowerCase();

      if (nameLower === partLower || nameLower.includes(partLower)) {
        return key;
      }
    }
  }
  return name;
}

function formatDataRows(events, aliases) {
  return events.map((ev) => [
    toSpWallclock(ev.ocorrido_em),
    ev.nome || '',
    ev.placa || '',
    ev.severidade || '',
    ev.nome_evento || '',
    ev.analise_ia_plataforma || '',
    ev.velocidade_kmh != null ? String(ev.velocidade_kmh) : '',
    ev.localidade || '',
    resolveMonitorName(ev.frota || ev.transportadora || '', aliases) || 'Não informado',
    ev.descricao || '',
    ev.evidencia || '',
    toSpWallclock(ev.inicio_tratativa),
    toSpWallclock(ev.fim_tratativa)
  ]);
}

const HEADERS = [
  'datetime', 'driver', 'plate', 'criticality', 'type',
  'classification', 'speed', 'location', 'fleet', 'description',
  'evidence', 'treatStart', 'treatEnd'
];

const MAPPING = {
  datetime: 'datetime', driver: 'driver', plate: 'plate', criticality: 'criticality', type: 'type',
  classification: 'classification', speed: 'speed', location: 'location', fleet: 'fleet', description: 'description',
  evidence: 'evidence', treatStart: 'treatStart', treatEnd: 'treatEnd'
};

function filterRows(rows, { company, severity, month, startDate, endDate, classification, eventType }) {
  let filtered = rows;

  if (company) {
    filtered = filtered.filter(row => row[8] === company);
  }

  if (severity && severity !== 'all') {
    if (severity === 'high') {
      filtered = filtered.filter(row => row[3] === 'Grave' || row[3] === 'Gravíssimo');
    } else if (severity === 'medium') {
      filtered = filtered.filter(row => row[3] === 'Médio');
    } else {
      filtered = filtered.filter(row => row[3] === severity);
    }
  }

  if (classification && classification !== 'all') {
    filtered = filtered.filter(row => row[5] === classification);
  }

  if (eventType) {
    filtered = filtered.filter(row => row[4] === eventType);
  }

  if (month === 'custom' && startDate && endDate) {
    const start = new Date(startDate + 'T00:00:00.000').getTime();
    const end = new Date(endDate + 'T23:59:59.999').getTime();
    filtered = filtered.filter(row => {
      const t = row[0] ? new Date(row[0]).getTime() : 0;
      return t >= start && t <= end;
    });
  }

  return filtered;
}

async function getCarrierAliases() {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'carrier_aliases')
      .maybeSingle();

    return (data && data.value) ? data.value : {};
  } catch (err) {
    console.error('Error fetching carrier aliases:', err);
    return {};
  }
}

const platformId = '__ptest_parity__';

const testEvents = [
  {
    platform_id: platformId,
    placa: 'AAA1A11',
    nome: 'Driver One',
    severidade: 'Grave',
    nome_evento: 'Fadiga N1',
    analise_ia_plataforma: 'Positivo',
    velocidade_kmh: 80,
    localidade: 'São Paulo, SP',
    frota: 'JSL Filial SP',
    ocorrido_em: '2026-06-01T02:00:00Z', // SP: 2026-05-31 23:00:00
    descricao: 'Test event 1'
  },
  {
    platform_id: platformId,
    placa: 'BBB2B22',
    nome: 'Driver Two',
    severidade: 'Gravíssimo',
    nome_evento: 'Uso de Celular',
    analise_ia_plataforma: 'Positivo',
    velocidade_kmh: 50,
    localidade: 'Rio de Janeiro, RJ',
    frota: 'JSL Filial RJ',
    ocorrido_em: '2026-06-01T03:30:00Z', // SP: 2026-06-01 00:30:00
    descricao: 'Test event 2'
  },
  {
    platform_id: platformId,
    placa: 'CCC3C33',
    nome: 'Driver Three',
    severidade: 'Leve',
    nome_evento: 'Falta de atenção',
    analise_ia_plataforma: 'Não classificado',
    velocidade_kmh: 20,
    localidade: 'Belo Horizonte, MG',
    frota: 'Ignored Fleet',
    ocorrido_em: '2026-06-10T12:00:00Z',
    descricao: 'Test event 3'
  },
  {
    platform_id: platformId,
    placa: 'AAA1A11',
    nome: 'Driver One',
    severidade: 'Médio',
    nome_evento: 'Fadiga N1',
    analise_ia_plataforma: 'Falso positivo',
    velocidade_kmh: 100,
    localidade: 'São Paulo, SP',
    frota: 'Outra Frota',
    ocorrido_em: '2026-06-15T15:00:00Z', // SP: 2026-06-15 12:00:00
    descricao: 'Test event 4'
  },
  {
    platform_id: platformId,
    placa: 'DDD4D44',
    nome: 'Driver Four',
    severidade: 'baixo',
    nome_evento: 'Falta de atenção',
    analise_ia_plataforma: 'Improcedente',
    velocidade_kmh: 30,
    localidade: 'Curitiba, PR',
    frota: '',
    ocorrido_em: '2026-06-16T18:00:00Z',
    descricao: 'Test event 5'
  },
  {
    platform_id: platformId,
    placa: 'EEE5E55',
    nome: 'Driver Five',
    severidade: 'Grave',
    nome_evento: 'Uso de Celular',
    analise_ia_plataforma: null,
    velocidade_kmh: null,
    localidade: 'Curitiba, PR',
    frota: 'JSL Filial SP',
    ocorrido_em: '2026-06-17T09:00:00Z', // SP: 2026-06-17 06:00:00
    descricao: 'Test event 6'
  }
];

function assertDeepEqual(actual, expected, path = '') {
  if (actual === expected) return;

  if (typeof actual !== typeof expected) {
    throw new Error(`Type mismatch at ${path}: expected ${typeof expected} (${JSON.stringify(expected)}), got ${typeof actual} (${JSON.stringify(actual)})`);
  }

  if (typeof actual === 'number') {
    if (Math.abs(actual - expected) > 0.01) {
      throw new Error(`Numerical value mismatch at ${path}: expected ${expected}, got ${actual}`);
    }
    return;
  }

  if (actual === null || expected === null) {
    throw new Error(`Null mismatch at ${path}: expected ${expected}, got ${actual}`);
  }

  if (Array.isArray(actual)) {
    if (!Array.isArray(expected)) {
      throw new Error(`Array type mismatch at ${path}: expected object/value, got Array`);
    }
    if (actual.length !== expected.length) {
      throw new Error(`Array length mismatch at ${path}: expected length ${expected.length}, got ${actual.length}`);
    }
    for (let i = 0; i < actual.length; i++) {
      assertDeepEqual(actual[i], expected[i], `${path}[${i}]`);
    }
    return;
  }

  if (typeof actual === 'object') {
    const actualKeys = Object.keys(actual).filter(k => actual[k] !== undefined).sort();
    const expectedKeys = Object.keys(expected).filter(k => expected[k] !== undefined).sort();

    for (const key of expectedKeys) {
      if (!actualKeys.includes(key)) {
        throw new Error(`Missing key at ${path}: expected key "${key}" to be present`);
      }
    }
    for (const key of actualKeys) {
      if (!expectedKeys.includes(key)) {
        if (key === 'frota_raw') continue;
        throw new Error(`Unexpected extra key at ${path}: key "${key}" is not expected`);
      }
    }

    for (const key of expectedKeys) {
      assertDeepEqual(actual[key], expected[key], `${path}.${key}`);
    }
    return;
  }

  throw new Error(`Value mismatch at ${path}: expected ${expected}, got ${actual}`);
}

function normalizeTopChart(chart) {
  if (!chart || !chart.labels || !chart.valores) return chart;
  const zipped = chart.labels.map((lbl, idx) => ({
    label: lbl,
    value: chart.valores[idx]
  }));
  zipped.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return a.label.localeCompare(b.label);
  });
  return {
    labels: zipped.map(z => z.label),
    valores: zipped.map(z => z.value)
  };
}

function normalizePayload(payload) {
  if (!payload) return payload;
  const p = JSON.parse(JSON.stringify(payload));
  if (p.d) {
    p.d.top_motoristas = normalizeTopChart(p.d.top_motoristas);
    p.d.top_placas = normalizeTopChart(p.d.top_placas);
    p.d.frota = normalizeTopChart(p.d.frota);
    p.d.uf = normalizeTopChart(p.d.uf);
  }
  if (p.prevD) {
    p.prevD.top_motoristas = normalizeTopChart(p.prevD.top_motoristas);
    p.prevD.top_placas = normalizeTopChart(p.prevD.top_placas);
    p.prevD.frota = normalizeTopChart(p.prevD.frota);
    p.prevD.uf = normalizeTopChart(p.prevD.uf);
  }
  return p;
}

async function runParityTests() {
  console.log('--- STARTING ANALYTICS PARITY TESTS ---');

  console.log('Cleaning up old test data...');
  const { error: cleanErr } = await supabase
    .from('driver_events')
    .delete()
    .eq('platform_id', platformId);
  if (cleanErr) throw cleanErr;

  console.log(`Inserting ${testEvents.length} test records...`);
  const { error: insertErr } = await supabase
    .from('driver_events')
    .insert(testEvents);
  if (insertErr) throw insertErr;

  const aliases = await getCarrierAliases();
  const resolveMonitorNameBound = (name, al) => resolveMonitorName(name, al);

  const testCases = [
    {
      query: { month: '2026-06' },
      description: 'Specific month June 2026'
    },
    {
      query: { month: '2026-05' },
      description: 'Specific month May 2026 (includes boundary timezone event)'
    },
    {
      query: { month: 'custom', startDate: '2026-06-01', endDate: '2026-06-15' },
      description: 'Custom date range (first half of June)'
    },
    {
      query: { month: 'custom', startDate: '2026-05-30', endDate: '2026-06-18' },
      description: 'Custom date range spanning May and June'
    },
    {
      query: { month: '2026-06', company: 'JSL' },
      description: 'June 2026 filtered by company JSL (resolved from frota)'
    },
    {
      query: { month: '2026-06', severity: 'high' },
      description: 'June 2026 filtered by high severity'
    },
    {
      query: { month: '2026-06', classification: 'Não classificado' },
      description: 'June 2026 filtered by classif: Não classificado'
    },
    {
      query: { month: '2026-06', eventType: 'Fadiga N1' },
      description: 'June 2026 filtered by eventType: Fadiga N1'
    }
  ];

  let passedCases = 0;

  for (const tc of testCases) {
    console.log(`Running case: ${tc.description}...`);

    const { month, startDate, endDate, company, severity, classification, eventType } = tc.query;
    
    const { data: dbEvents, error: fetchErr } = await supabase
      .from('driver_events')
      .select('platform_id,placa,nome,severidade,nome_evento,analise_ia_plataforma,velocidade_kmh,localidade,frota,transportadora,ocorrido_em,descricao,evidencia,inicio_tratativa,fim_tratativa')
      .eq('platform_id', platformId);
    if (fetchErr) throw fetchErr;

    console.log('Case dbEvents count:', dbEvents.length);
    for (const r of dbEvents) {
      console.log(`db: ocorrido_em: ${r.ocorrido_em}, severidade: ${r.severidade}, descricao: ${r.descricao}`);
    }

    dbEvents.sort((a, b) => {
      const da = a.ocorrido_em ? new Date(a.ocorrido_em).getTime() : 0;
      const db = b.ocorrido_em ? new Date(b.ocorrido_em).getTime() : 0;
      return db - da;
    });

    const activeEvents = excludeLeve(dbEvents);
    const rawRows = formatDataRows(activeEvents, aliases);

    const availableMonthsSet = new Set();
    const availableCompaniesSet = new Set();
    const availableTypesSet = new Set();

    for (const ev of activeEvents) {
      if (ev.ocorrido_em) {
        const dt = new Date(ev.ocorrido_em);
        if (!isNaN(dt.getTime())) {
          const mk = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
          availableMonthsSet.add(mk);
        }
      }
      const resolvedComp = resolveMonitorName(ev.frota || ev.transportadora || '', aliases);
      if (resolvedComp && resolvedComp !== 'Não informado') {
        availableCompaniesSet.add(resolvedComp);
      }
      if (ev.nome_evento) {
        availableTypesSet.add(ev.nome_evento);
      }
    }

    const availableMonthsJS = Array.from(availableMonthsSet).sort().reverse().slice(0, 12);
    const availableCompaniesJS = Array.from(availableCompaniesSet).sort();
    const availableTypesJS = Array.from(availableTypesSet).sort();

    const filteredJS = filterRows(rawRows, { company, severity, month, startDate, endDate, classification, eventType });
    const dJS = aggregate(HEADERS, filteredJS, MAPPING, month === 'all' || month === 'custom' ? null : month);

    let prevDJS = null;
    if (month && month !== 'all' && month !== 'custom' && month.indexOf('-') > -1) {
      const [y, m] = month.split('-');
      const year = parseInt(y);
      const monthNum = parseInt(m);
      const prevDate = new Date(Date.UTC(year, monthNum - 2, 1));
      const py = prevDate.getUTCFullYear();
      const pm = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
      const prevMonthKeyVal = `${py}-${pm}`;

      const filteredPrevJS = filterRows(rawRows, { company, severity, month: prevMonthKeyVal, classification, eventType });
      prevDJS = aggregate(HEADERS, filteredPrevJS, MAPPING, prevMonthKeyVal);
    }

    const payloadJS = {
      availableMonths: availableMonthsJS,
      availableCompanies: availableCompaniesJS,
      availableTypes: availableTypesJS,
      d: dJS,
      prevD: prevDJS
    };

    const payloadRPC = await buildSingleAnalyticsViaRPC(
      supabase,
      { platformId, month, startDate, endDate, company, severity, classification, eventType },
      { resolveMonitorName: resolveMonitorNameBound, aliases }
    );

    try {
      assertDeepEqual(normalizePayload(payloadRPC), normalizePayload(payloadJS));
      console.log(`✅ Case "${tc.description}" matched perfectly.`);
      passedCases++;
    } catch (err) {
      console.error(`❌ Case "${tc.description}" failed parity check!`);
      console.error(err.message);
      console.log('\n--- JS Payload ---');
      console.log(JSON.stringify(payloadJS, null, 2));
      console.log('\n--- RPC Payload ---');
      console.log(JSON.stringify(payloadRPC, null, 2));
      throw err;
    }
  }

  console.log(`\nParity comparison completed successfully: ${passedCases}/${testCases.length} cases passed.`);
}

async function main() {
  try {
    await runParityTests();
  } catch (err) {
    console.error('Fatal error in parity execution:', err);
    process.exitCode = 1;
  } finally {
    console.log('Cleaning up parity test data...');
    try {
      await supabase
        .from('driver_events')
        .delete()
        .eq('platform_id', platformId);
      console.log('Database clean.');
    } catch (cleanErr) {
      console.error('Failed to clean up test data:', cleanErr);
    }
  }
}

main();
