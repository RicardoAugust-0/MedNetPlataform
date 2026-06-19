import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { aggregate, PLATFORMS } from '../src/utils/fatigueParser.js';
import { buildSingleAnalyticsViaRPC } from './analytics-rpc.js';

// Load env variables from root and server directory
dotenv.config({ path: '../.env' });
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[MedNet Backend] ERRO: Credenciais do Supabase não configuradas.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log(`[MedNet Backend] Conectado ao Supabase: ${supabaseUrl}`);

// In-memory caches
const rawEventsCache = {};
let carrierAliasesCache = null;
const resultCache = new Map();            // chave: engine|originalUrl -> { data, ts }
const RESULT_TTL = 5 * 60 * 1000;

// Fetch and cache carrier aliases
async function getCarrierAliases() {
  if (carrierAliasesCache && (Date.now() - carrierAliasesCache.timestamp < 5 * 60 * 1000)) {
    return carrierAliasesCache.aliases;
  }
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'carrier_aliases')
      .maybeSingle();

    const aliases = (data && data.value) ? data.value : {};
    carrierAliasesCache = {
      aliases,
      timestamp: Date.now()
    };
    return aliases;
  } catch (err) {
    console.error('[MedNet Backend] Erro ao buscar aliases de transportadoras:', err);
    return carrierAliasesCache ? carrierAliasesCache.aliases : {};
  }
}

// Resolve fleet name to clean company name
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

// Fetch all raw events for a platform (paginated)
async function getRawEvents(platformId) {
  const now = Date.now();
  if (rawEventsCache[platformId] && (now - rawEventsCache[platformId].timestamp < 5 * 60 * 1000)) {
    console.log(`[MedNet Backend] Servindo cache de eventos para: ${platformId} (${rawEventsCache[platformId].data.length} registros)`);
    return rawEventsCache[platformId].data;
  }

  console.log(`[MedNet Backend] Carregando eventos do Supabase para: ${platformId}...`);
  
  // 1. Get exact total count
  const { count, error: countErr } = await supabase
    .from('driver_events')
    .select('*', { count: 'exact', head: true })
    .eq('platform_id', platformId);

  if (countErr) throw countErr;
  
  const total = count || 0;
  console.log(`[MedNet Backend] Plataforma ${platformId} possui ${total} registros no total.`);

  const events = [];
  const limit = 1000;
  const numPages = Math.ceil(total / limit);
  const BATCH_SIZE = 10;

  for (let i = 0; i < numPages; i += BATCH_SIZE) {
    const promises = [];
    for (let j = i; j < Math.min(i + BATCH_SIZE, numPages); j++) {
      const from = j * limit;
      const to = from + limit - 1;
      promises.push(
        supabase
          .from('driver_events')
          .select('platform_id,placa,nome,severidade,nome_evento,analise_ia_plataforma,velocidade_kmh,localidade,frota,transportadora,ocorrido_em,descricao')
          .eq('platform_id', platformId)
          .order('id')
          .range(from, to)
          .then(({ data, error }) => {
            if (error) throw error;
            return data || [];
          })
      );
    }
    const results = await Promise.all(promises);
    for (const page of results) {
      events.push(...page);
    }
  }

  // Sort events chronologically descending
  events.sort((a, b) => {
    const da = a.ocorrido_em ? new Date(a.ocorrido_em).getTime() : 0;
    const db = b.ocorrido_em ? new Date(b.ocorrido_em).getTime() : 0;
    return db - da;
  });

  rawEventsCache[platformId] = {
    data: events,
    timestamp: Date.now()
  };

  console.log(`[MedNet Backend] Carregamento completo para ${platformId}: ${events.length} registros.`);
  return events;
}

// Eventos de criticidade "Leve" são preservados no banco, mas ficam FORA da
// análise (não entram em totais, gráficos, comparação nem export do relatório).
function excludeLeve(events) {
  return events.filter((ev) => ev.severidade !== 'Leve');
}

// ocorrido_em (instante UTC) -> wall-clock de São Paulo 'YYYY-MM-DD HH:mm:ss'.
// SP é UTC-3 fixo (Brasil sem horário de verão desde 2019); bate com o
// `at time zone 'America/Sao_Paulo'` da RPC para os dados do hot tier.
function toSpWallclock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const sp = new Date(d.getTime() - 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${sp.getUTCFullYear()}-${p(sp.getUTCMonth() + 1)}-${p(sp.getUTCDate())} `
       + `${p(sp.getUTCHours())}:${p(sp.getUTCMinutes())}:${p(sp.getUTCSeconds())}`;
}

// Convert events array to raw dataRows format used by aggregate function
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
    ev.descricao || ''
  ]);
}

const HEADERS = [
  'datetime',
  'driver',
  'plate',
  'criticality',
  'type',
  'classification',
  'speed',
  'location',
  'fleet',
  'description'
];

const MAPPING = {
  datetime: 'datetime',
  driver: 'driver',
  plate: 'plate',
  criticality: 'criticality',
  type: 'type',
  classification: 'classification',
  speed: 'speed',
  location: 'location',
  fleet: 'fleet',
  description: 'description'
};

// Filter rows by company, severity, classification, eventType, and date range in memory
function filterRows(rows, { company, severity, month, startDate, endDate, classification, eventType }) {
  let filtered = rows;

  // Filter by company
  if (company) {
    filtered = filtered.filter(row => row[8] === company);
  }

  // Filter by severity
  if (severity && severity !== 'all') {
    if (severity === 'high') {
      filtered = filtered.filter(row => row[3] === 'Grave' || row[3] === 'Gravíssimo');
    } else if (severity === 'medium') {
      filtered = filtered.filter(row => row[3] === 'Médio');
    } else {
      filtered = filtered.filter(row => row[3] === severity);
    }
  }

  // Filter by classification
  if (classification && classification !== 'all') {
    filtered = filtered.filter(row => row[5] === classification);
  }

  // Filter by event type
  if (eventType) {
    filtered = filtered.filter(row => row[4] === eventType);
  }

  // Filter by date range (for custom or month)
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

// ── ENDPOINTS ──

// Health check endpoint for Coolify
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'MedNet Analytics API' });
});

// 1. Get platform counts from the database
app.get('/api/platforms', async (req, res) => {
  try {
    const counts = {};
    const promises = PLATFORMS.map(async (p) => {
      // Conta apenas eventos que entram na análise (exclui criticidade "Leve").
      const { count, error } = await supabase
        .from('driver_events')
        .select('*', { count: 'exact', head: true })
        .eq('platform_id', p.id)
        .neq('severidade', 'Leve');
      if (!error && count !== null) {
        counts[p.id] = count;
      }
    });
    await Promise.all(promises);
    res.json(counts);
  } catch (err) {
    console.error('[MedNet Backend] Erro no /api/platforms:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// 2. Fetch aggregated analytics
app.get('/api/analytics', async (req, res) => {
  const {
    platformId,
    compare,
    platformIds,
    month,
    startDate,
    endDate,
    company,
    severity,
    classification,
    eventType
  } = req.query;

  try {
    const aliases = await getCarrierAliases();
    const isCompare = compare === 'true';
    const targetPlatformIds = isCompare
      ? (platformIds ? platformIds.split(',') : [])
      : (platformId ? [platformId] : []);

    if (targetPlatformIds.length === 0) {
      return res.status(400).json({ error: 'Nenhuma plataforma especificada.' });
    }

    const engine = (process.env.ANALYTICS_ENGINE || 'js').toLowerCase();
    const cacheKey = `${engine}|${req.originalUrl}`;
    const cached = resultCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts < RESULT_TTL)) {
      return res.json(cached.data);
    }
    const sendPayload = (payload) => {
      resultCache.set(cacheKey, { data: payload, ts: Date.now() });
      return res.json(payload);
    };

    // Caminho RPC: só uma plataforma. Compare e qualquer erro caem no caminho JS.
    if (engine === 'rpc' && !isCompare && targetPlatformIds.length === 1) {
      try {
        const payload = await buildSingleAnalyticsViaRPC(
          supabase,
          { platformId: targetPlatformIds[0], month, startDate, endDate,
            company, severity, classification, eventType },
          { resolveMonitorName, aliases }
        );
        return sendPayload(payload);
      } catch (rpcErr) {
        console.error('[MedNet Backend] RPC falhou, fallback JS:', rpcErr.message || rpcErr);
      }
    }

    // Load raw events for all target platforms (eventos "Leve" ficam fora da análise)
    const allEventsByPlatform = {};
    for (const pid of targetPlatformIds) {
      allEventsByPlatform[pid] = excludeLeve(await getRawEvents(pid));
    }

    // Extract available months, companies, and event types from the loaded raw events
    const availableMonthsSet = new Set();
    const availableCompaniesSet = new Set();
    const availableTypesSet = new Set();

    for (const pid of targetPlatformIds) {
      const events = allEventsByPlatform[pid];
      for (const ev of events) {
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
    }

    const availableMonths = Array.from(availableMonthsSet).sort().reverse().slice(0, 12);
    const availableCompanies = Array.from(availableCompaniesSet).sort();
    const availableTypes = Array.from(availableTypesSet).sort();

    if (isCompare) {
      // Return aggregated sources for comparison view
      const combinedRawRows = [];
      const combinedRawRowsPrev = [];

      // Generate prevMonthKey if monthly view
      let prevMonthKey = null;
      if (month && month !== 'all' && month !== 'custom' && month.indexOf('-') > -1) {
        const [y, m] = month.split('-');
        const year = parseInt(y);
        const monthNum = parseInt(m);
        const prevDate = new Date(Date.UTC(year, monthNum - 2, 1));
        const py = prevDate.getUTCFullYear();
        const pm = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
        prevMonthKey = `${py}-${pm}`;
      }

      const sources = targetPlatformIds.map((pid) => {
        const events = allEventsByPlatform[pid] || [];
        const rawRows = formatDataRows(events, aliases);
        
        // Extract companies available for this platform SPECIFICALLY
        const platformCompaniesSet = new Set();
        for (const ev of events) {
          const resolvedComp = resolveMonitorName(ev.frota || ev.transportadora || '', aliases);
          if (resolvedComp && resolvedComp !== 'Não informado') {
            platformCompaniesSet.add(resolvedComp);
          }
        }
        const platformCompanies = Array.from(platformCompaniesSet).sort();

        // Determine company filter specifically for this platform
        const platformCompany = req.query[`company_${pid}`] !== undefined ? req.query[`company_${pid}`] : company;

        // Filter current period
        const filtered = filterRows(rawRows, { company: platformCompany, severity, month, startDate, endDate, classification, eventType });
        for (const row of filtered) {
          combinedRawRows.push(row);
        }

        // Filter previous period
        let filteredPrev = [];
        if (prevMonthKey) {
          filteredPrev = filterRows(rawRows, { company: platformCompany, severity, month: prevMonthKey, classification, eventType });
          for (const row of filteredPrev) {
            combinedRawRowsPrev.push(row);
          }
        }

        const agg = aggregate(HEADERS, filtered, MAPPING, month === 'all' || month === 'custom' ? null : month);
        
        const platformName = pid === 'omnilink' ? 'OmniLink'
          : pid === 'maxtrack' ? 'MaxTrack'
          : pid.toUpperCase();

        return {
          id: 'src-' + pid,
          platformId: pid,
          platformName,
          rows: rawRows.length,
          availableCompanies: platformCompanies,
          data: agg
        };
      });

      // Aggregate combined data
      const combinedD = aggregate(HEADERS, combinedRawRows, MAPPING, month === 'all' || month === 'custom' ? null : month);
      let combinedPrevD = null;
      if (prevMonthKey) {
        combinedPrevD = aggregate(HEADERS, combinedRawRowsPrev, MAPPING, prevMonthKey);
      }

      return sendPayload({
        availableMonths,
        availableCompanies,
        availableTypes,
        sources,
        d: combinedD,
        prevD: combinedPrevD
      });
    } else {
      // Single platform aggregated view
      const pid = targetPlatformIds[0];
      const events = allEventsByPlatform[pid] || [];
      const rawRows = formatDataRows(events, aliases);

      // Current month aggregation
      const filtered = filterRows(rawRows, { company, severity, month, startDate, endDate, classification, eventType });
      const d = aggregate(HEADERS, filtered, MAPPING, month === 'all' || month === 'custom' ? null : month);

      // Previous month aggregation (only if month is a specific month key like '2026-06')
      let prevD = null;
      if (month && month !== 'all' && month !== 'custom' && month.indexOf('-') > -1) {
        const [y, m] = month.split('-');
        const year = parseInt(y);
        const monthNum = parseInt(m);
        const prevDate = new Date(Date.UTC(year, monthNum - 2, 1));
        const py = prevDate.getUTCFullYear();
        const pm = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
        const prevMonthKey = `${py}-${pm}`;

        const filteredPrev = filterRows(rawRows, { company, severity, month: prevMonthKey, classification, eventType });
        prevD = aggregate(HEADERS, filteredPrev, MAPPING, prevMonthKey);
      }

      return sendPayload({
        availableMonths,
        availableCompanies,
        availableTypes,
        d,
        prevD
      });
    }
  } catch (err) {
    console.error('[MedNet Backend] Erro no /api/analytics:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// 3. Export filtered data as CSV
app.get('/api/analytics/csv', async (req, res) => {
  const {
    platformId,
    month,
    startDate,
    endDate,
    company,
    severity,
    classification,
    eventType
  } = req.query;

  if (!platformId) {
    return res.status(400).json({ error: 'Parâmetro platformId é obrigatório.' });
  }

  try {
    const aliases = await getCarrierAliases();
    const events = excludeLeve(await getRawEvents(platformId));
    const rawRows = formatDataRows(events, aliases);

    // Filter rows by date, month, company, severity, classification, eventType
    let rowsToExport = filterRows(rawRows, { company, severity, month, startDate, endDate, classification, eventType });

    // Filter by specific month code if month is standard month key
    if (month && month !== 'all' && month !== 'custom' && month.indexOf('-') > -1) {
      rowsToExport = rowsToExport.filter(row => {
        const dt = new Date(row[0]);
        if (isNaN(dt.getTime())) return false;
        const mk = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
        return mk === month;
      });
    }

    const headers = ['Data/Hora', 'Motorista', 'Placa', 'Severidade', 'Evento', 'Classificação', 'Velocidade (km/h)', 'Localidade', 'Frota/Empresa', 'Descrição'];
    const csvEscape = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(';') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = rowsToExport.map(row => row.map(csvEscape).join(';'));
    const csvContent = '\uFEFF' + [headers.join(';'), ...lines].join('\r\n');

    const filename = `relatorio_fadiga_${platformId}_${new Date().toISOString().slice(0, 10)}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csvContent);
  } catch (err) {
    console.error('[MedNet Backend] Erro no /api/analytics/csv:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// 4. Clear cache (triggered when new data is imported)
app.post('/api/clear-cache', (req, res) => {
  const { platformId } = req.body || req.query;

  if (platformId) {
    delete rawEventsCache[platformId];
    resultCache.clear();
    console.log(`[MedNet Backend] Cache limpo para a plataforma: ${platformId}`);
  } else {
    Object.keys(rawEventsCache).forEach(k => delete rawEventsCache[k]);
    carrierAliasesCache = null;
    resultCache.clear();
    console.log('[MedNet Backend] Todo o cache em memória foi invalidado.');
  }

  res.json({ success: true, message: platformId ? `Cache limpo para ${platformId}` : 'Todo o cache foi limpo' });
});

app.listen(PORT, () => {
  console.log(`[MedNet Backend] Servidor rodando na porta ${PORT}`);
});
