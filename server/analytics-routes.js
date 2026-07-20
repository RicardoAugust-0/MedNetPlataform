import { aggregate, PLATFORMS, normClf, toUF } from '../src/utils/fatigueParser.js';
import { buildSingleAnalyticsViaRPC, buildCompareViaRPC, companiesFromFleets, deriveDateParams } from './analytics-rpc.js';
import { uploadMiddleware, handleImportEvents } from './analytics-import.js';
import { isTransientFetchError } from './transient-retry.js';

// In-memory caches
const rawEventsCache = {};
let carrierAliasesCache = null;
const resultCache = new Map();
const RESULT_TTL = 5 * 60 * 1000;

// Hierarquia de acesso (espelha src/data.js ROLE_LEVEL e o AdminGuard do front).
const ROLE_LEVELS = { operador: 0, lider: 1, admin: 2 };

export function isMissingPlatformCountsRpcError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = `${error?.message || ''} ${error?.details || ''}`;
  return ['PGRST202', '42883'].includes(code)
    && /analytics_platform_counts/i.test(message)
    && /could not find|does not exist|schema cache/i.test(message);
}

export function isTransientAnalyticsRpcError(error) {
  const code = String(error?.code || '').toUpperCase();
  return isTransientFetchError(error)
    || error?.name === 'TimeoutError'
    || error?.name === 'AbortError'
    || code.startsWith('08')
    || code === 'ANALYTICS_SUPPORT_RPC_MISSING'
    || ['53300', '57014', '57P01', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003'].includes(code);
}

export function isMissingAnalyticsRollupRpcError(error) {
  const code = String(error?.code || '').toUpperCase();
  if (code === 'PGRST202') return true;
  if (code !== '42883') return false;
  const message = `${error?.message || ''} ${error?.details || ''}`;
  return /analytics_metadata_rollup|get_analytics_rollup(?:_multi)?/i.test(message)
    && /does not exist|could not find/i.test(message);
}

// Middleware: exige um JWT Supabase válido no header Authorization e um role
// igual/superior a `minRole`. O front (Analytics) é admin-only, mas o front
// sozinho não protege nada — esta API roda com service_role (ignora RLS), então
// SEM este gate qualquer um alcançaria os dados e o CSV com PII. Validação via
// supabase.auth.getUser(token) + leitura de profiles.role.
export function requireRole(supabase, minRole) {
  const min = ROLE_LEVELS[minRole] ?? 99;
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
      if (!token) {
        return res.status(401).json({ error: 'Autenticação obrigatória.' });
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }

      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (profErr || !profile) {
        return res.status(403).json({ error: 'Perfil não encontrado.' });
      }

      if ((ROLE_LEVELS[profile.role] ?? 0) < min) {
        return res.status(403).json({ error: 'Acesso negado: nível de permissão insuficiente.' });
      }

      req.authUser = userData.user;
      req.authRole = profile.role;
      next();
    } catch (err) {
      console.error('[MedNet Backend] Erro na verificação de acesso:', err);
      return res.status(500).json({ error: 'Erro na verificação de acesso.' });
    }
  };
}

// Fetch and cache carrier aliases
async function getCarrierAliases(supabase) {
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
async function getRawEvents(supabase, platformId) {
  const now = Date.now();
  if (rawEventsCache[platformId] && (now - rawEventsCache[platformId].timestamp < 5 * 60 * 1000)) {
    console.log(`[MedNet Backend] Servindo cache de eventos para: ${platformId} (${rawEventsCache[platformId].data.length} registros)`);
    return rawEventsCache[platformId].data;
  }

  console.log(`[MedNet Backend] Carregando eventos do Supabase para: ${platformId}...`);
  
  const { count, error: countErr } = await supabase
    .from('driver_events')
    .select('id', { count: 'exact', head: true })
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
          .select('platform_id,placa,nome,severidade,nome_evento,analise_ia_plataforma,velocidade_kmh,localidade,frota,transportadora,ocorrido_em,descricao,evidencia,inicio_tratativa,fim_tratativa')
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

// Mesmo corte de granularidade do caminho RPC (server/analytics-rpc.js
// deriveDateParams): período customizado <= 31 dias vira bucket diário.
function customDailyRange(month, startDate, endDate) {
  if (month !== 'custom' || !startDate || !endDate) return null;
  const span = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  return (span > 0 && span <= 31) ? { start: startDate, end: endDate } : null;
}

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
  'datetime', 'driver', 'plate', 'criticality', 'type', 'classification',
  'speed', 'location', 'fleet', 'description', 'evidence', 'treatStart', 'treatEnd'
];

const MAPPING = {
  datetime: 'datetime', driver: 'driver', plate: 'plate', criticality: 'criticality',
  type: 'type', classification: 'classification', speed: 'speed', location: 'location',
  fleet: 'fleet', description: 'description', evidence: 'evidence', treatStart: 'treatStart', treatEnd: 'treatEnd'
};

function filterRows(rows, { company, severity, month, startDate, endDate, classification, eventType, uf }) {
  let filtered = rows;

  if (company) {
    filtered = filtered.filter(row => row[8] === company);
  }

  if (uf) {
    filtered = filtered.filter(row => toUF(row[7]) === uf);
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
    filtered = filtered.filter(row => normClf(row[5]) === classification);
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

export function registerAnalyticsRoutes(app, supabase) {
  // Analytics é restrito a admin (espelha o AdminGuard de /admin/analytics).
  const requireAdmin = requireRole(supabase, 'admin');

  // 1. Get platform counts from the database
  app.get('/api/platforms', requireAdmin, async (req, res) => {
    try {
      // Contagens (eventos ativos por plataforma) servidas pelo rollup —
      // uma RPC, sem varrer driver_events. Fallback: head count por plataforma.
      const { data: rollupCounts, error: rcErr } = await supabase.rpc('analytics_platform_counts');
      if (!rcErr) {
        return res.json(
          rollupCounts && typeof rollupCounts === 'object' ? rollupCounts : {},
        );
      }

      // O fallback legado existe apenas para ambientes que ainda nao receberam
      // a migration da RPC. Em timeout/indisponibilidade, abrir mais oito queries
      // contra o mesmo Supabase amplia a falha; responda 503 para o cliente recuar.
      if (!isMissingPlatformCountsRpcError(rcErr)) {
        res.set('Retry-After', '5');
        return res.status(503).json({
          error: 'Contagens temporariamente indisponiveis. Tente novamente em instantes.',
        });
      }

      const counts = {};
      const promises = PLATFORMS.map(async (p) => {
        // `is distinct from 'Leve'` preserva linhas com severidade NULL — bate com
        // o rollup/índices parciais e com o excludeLeve do JS. `.neq` sozinho
        // descartaria os NULLs e subnotificaria a contagem.
        const { count, error } = await supabase
          .from('driver_events')
          .select('id', { count: 'exact', head: true })
          .eq('platform_id', p.id)
          .or('severidade.is.null,severidade.neq.Leve');
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

  // 1b. Opções de comparação: plataformas (com contagem) e suas empresas.
  // Alimenta o modal de comparação (modo "empresas" precisa das empresas por plataforma).
  app.get('/api/compare-options', requireAdmin, async (req, res) => {
    try {
      const aliases = await getCarrierAliases(supabase);
      const { data: counts, error: cErr } = await supabase.rpc('analytics_platform_counts');
      if (cErr) throw cErr;

      const platformIds = Object.keys(counts || {});
      const options = [];
      for (const pid of platformIds) {
        const { data: meta } = await supabase.rpc('analytics_metadata_rollup', { p_platform_ids: [pid] });
        const companies = companiesFromFleets((meta && meta.fleets) || {}, resolveMonitorName, aliases);
        const platformName = pid === 'omnilink' ? 'OmniLink' : pid === 'maxtrack' ? 'MaxTrack' : pid.toUpperCase();
        options.push({ platformId: pid, platformName, rows: counts[pid], companies });
      }
      res.json(options);
    } catch (err) {
      console.error('[MedNet Backend] Erro no /api/compare-options:', err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 2. Fetch aggregated analytics
  app.get('/api/analytics', requireAdmin, async (req, res) => {
    const {
      platformId, compare, platformIds, month, startDate, endDate,
      company, severity, classification, eventType, uf
    } = req.query;

    try {
      const aliases = await getCarrierAliases(supabase);
      const isCompare = compare === 'true';
      const targetPlatformIds = isCompare
        ? (platformIds ? platformIds.split(',') : [])
        : (platformId ? [platformId] : []);

      if (targetPlatformIds.length === 0) {
        return res.status(400).json({ error: 'Nenhuma plataforma especificada.' });
      }

      const engine = (process.env.ANALYTICS_ENGINE || 'rpc').toLowerCase();
      const cacheKey = `${engine}|${req.originalUrl}`;
      const cached = resultCache.get(cacheKey);
      if (cached && (Date.now() - cached.ts < RESULT_TTL)) {
        return res.json(cached.data);
      }
      const sendPayload = (payload) => {
        resultCache.set(cacheKey, { data: payload, ts: Date.now() });
        return res.json(payload);
      };

      // UF não faz parte do grão do rollup (é só um breakdown jsonb por linha do
      // grão), então filtrar por UF na RPC corromperia as demais métricas. Quando
      // há filtro de UF, caímos no caminho JS (eventos crus), que tem a UF por
      // evento via toUF(localidade). O resultado segue cacheado por 5 min.
      if (engine === 'rpc' && !isCompare && !uf && targetPlatformIds.length === 1) {
        try {
          const payload = await buildSingleAnalyticsViaRPC(
            supabase,
            { platformId: targetPlatformIds[0], month, startDate, endDate,
              company, severity, classification, eventType },
            { resolveMonitorName, aliases }
          );
          return sendPayload(payload);
        } catch (rpcErr) {
          if (!isMissingAnalyticsRollupRpcError(rpcErr)) throw rpcErr;
          console.error('[MedNet Backend] RPC falhou, fallback JS:', rpcErr.message || rpcErr);
        }
      }

      // Comparação via rollup. Aceita `sources` (JSON de [{platformId, company}])
      // — cobre tanto comparar plataformas quanto empresas da mesma plataforma.
      // Compat: sem `sources`, monta a partir de platformIds + company_<pid>.
      if (engine === 'rpc' && isCompare && !uf) {
        try {
          let sources;
          if (req.query.sources) {
            sources = JSON.parse(req.query.sources);
          } else {
            sources = targetPlatformIds.map((pid) => ({
              platformId: pid,
              company: req.query[`company_${pid}`] !== undefined ? req.query[`company_${pid}`] : (company || ''),
            }));
          }
          sources = (Array.isArray(sources) ? sources : []).filter((s) => s && s.platformId);
          if (sources.length >= 2) {
            const payload = await buildCompareViaRPC(
              supabase,
              { sources, month, startDate, endDate, severity, classification, eventType },
              { resolveMonitorName, aliases }
            );
            return sendPayload(payload);
          }
        } catch (rpcErr) {
          if (!isMissingAnalyticsRollupRpcError(rpcErr)) throw rpcErr;
          console.error('[MedNet Backend] RPC compare falhou, fallback JS:', rpcErr.message || rpcErr);
        }
      }

      const allEventsByPlatform = {};
      for (const pid of targetPlatformIds) {
        allEventsByPlatform[pid] = excludeLeve(await getRawEvents(supabase, pid));
      }

      const availableMonthsSet = new Set();
      const availableCompaniesSet = new Set();
      const availableTypesSet = new Set();
      const availableUfsSet = new Set();

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
          const ufVal = toUF(ev.localidade);
          if (ufVal) {
            availableUfsSet.add(ufVal);
          }
        }
      }

      const availableMonths = Array.from(availableMonthsSet).sort().reverse().slice(0, 12);
      const availableCompanies = Array.from(availableCompaniesSet).sort();
      const availableTypes = Array.from(availableTypesSet).sort();
      const availableUfs = Array.from(availableUfsSet).sort();

      if (isCompare) {
        const combinedRawRows = [];
        const combinedRawRowsPrev = [];

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
          
          const platformCompaniesSet = new Set();
          for (const ev of events) {
            const resolvedComp = resolveMonitorName(ev.frota || ev.transportadora || '', aliases);
            if (resolvedComp && resolvedComp !== 'Não informado') {
              platformCompaniesSet.add(resolvedComp);
            }
          }
          const platformCompanies = Array.from(platformCompaniesSet).sort();
          const platformCompany = req.query[`company_${pid}`] !== undefined ? req.query[`company_${pid}`] : company;

          const filtered = filterRows(rawRows, { company: platformCompany, severity, month, startDate, endDate, classification, eventType, uf });
          for (const row of filtered) {
            combinedRawRows.push(row);
          }

          let filteredPrev = [];
          if (prevMonthKey) {
            filteredPrev = filterRows(rawRows, { company: platformCompany, severity, month: prevMonthKey, classification, eventType, uf });
            for (const row of filteredPrev) {
              combinedRawRowsPrev.push(row);
            }
          }

          const agg = aggregate(HEADERS, filtered, MAPPING, month === 'all' || month === 'custom' ? null : month, customDailyRange(month, startDate, endDate));
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

        const combinedD = aggregate(HEADERS, combinedRawRows, MAPPING, month === 'all' || month === 'custom' ? null : month, customDailyRange(month, startDate, endDate));
        let combinedPrevD = null;
        if (prevMonthKey) {
          combinedPrevD = aggregate(HEADERS, combinedRawRowsPrev, MAPPING, prevMonthKey);
        }

        return sendPayload({
          availableMonths, availableCompanies, availableTypes, availableUfs, sources, d: combinedD, prevD: combinedPrevD
        });
      } else {
        const pid = targetPlatformIds[0];
        const events = allEventsByPlatform[pid] || [];
        const rawRows = formatDataRows(events, aliases);

        const filtered = filterRows(rawRows, { company, severity, month, startDate, endDate, classification, eventType, uf });
        const d = aggregate(HEADERS, filtered, MAPPING, month === 'all' || month === 'custom' ? null : month, customDailyRange(month, startDate, endDate));

        let prevD = null;
        if (month && month !== 'all' && month !== 'custom' && month.indexOf('-') > -1) {
          const [y, m] = month.split('-');
          const year = parseInt(y);
          const monthNum = parseInt(m);
          const prevDate = new Date(Date.UTC(year, monthNum - 2, 1));
          const py = prevDate.getUTCFullYear();
          const pm = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
          const prevMonthKey = `${py}-${pm}`;

          const filteredPrev = filterRows(rawRows, { company, severity, month: prevMonthKey, classification, eventType, uf });
          prevD = aggregate(HEADERS, filteredPrev, MAPPING, prevMonthKey);
        }

        return sendPayload({
          availableMonths, availableCompanies, availableTypes, availableUfs, d, prevD
        });
      }
    } catch (err) {
      console.error('[MedNet Backend] Erro no /api/analytics:', err);
      if (isTransientAnalyticsRpcError(err)) {
        res.set('Retry-After', '5');
        return res.status(503).json({
          error: 'Analytics temporariamente indisponivel. Tente novamente em instantes.',
        });
      }
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 3. Export filtered data as CSV
  app.get('/api/analytics/csv', requireAdmin, async (req, res) => {
    const {
      platformId, month, startDate, endDate, company, severity, classification, eventType, uf
    } = req.query;

    if (!platformId) {
      return res.status(400).json({ error: 'Parâmetro platformId é obrigatório.' });
    }

    try {
      const aliases = await getCarrierAliases(supabase);
      const events = excludeLeve(await getRawEvents(supabase, platformId));
      const rawRows = formatDataRows(events, aliases);

      let rowsToExport = filterRows(rawRows, { company, severity, month, startDate, endDate, classification, eventType, uf });

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
  app.post('/api/clear-cache', requireAdmin, (req, res) => {
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

  // 5. Importação de planilhas gigantes no backend
  app.post('/api/analytics/import', requireAdmin, uploadMiddleware, (req, res) => {
    handleImportEvents(supabase, req, res, clearAnalyticsCache);
  });

  // 6. Ranking de operadores (só MaxTrack) — contagem, severidades, intervenções e produtividade horária.
  app.get('/api/analytics/operator-ranking', requireAdmin, async (req, res) => {
    const { platformId, month, startDate, endDate, severity } = req.query;
    if (!platformId) {
      return res.status(400).json({ error: 'Parametro platformId e obrigatorio.' });
    }
    try {
      const cacheKey = `operator-ranking|${req.originalUrl}`;
      const cached = resultCache.get(cacheKey);
      if (cached && (Date.now() - cached.ts < RESULT_TTL)) {
        return res.json(cached.data);
      }

      const { from, to } = deriveDateParams(month, startDate, endDate);

      // As consultas são independentes. Executá-las juntas reduz a latência da
      // rota ao tempo da mais lenta, em vez da soma das três idas ao banco.
      const [eventResult, sheetResult, profilesResult] = await Promise.all([
        supabase.rpc('get_operator_event_activity', {
          p_platform_id: platformId,
          p_date_from: from,
          p_date_to: to,
          p_severity: severity || null,
        }),
        supabase.rpc('get_operator_sheet_activity', {
          p_platform_id: platformId,
          p_date_from: from,
          p_date_to: to,
        }),
        supabase
          .from('profiles')
          .select('nome')
          .in('role', ['operador', 'admin']),
      ]);

      const { data: eventRows, error } = eventResult;
      if (error) throw error;
      const { data: sheetRows, error: sheetError } = sheetResult;
      if (sheetError) throw sheetError;
      const { data: dbProfiles, error: profilesError } = profilesResult;
      if (profilesError) throw profilesError;

      const normalizeOperatorName = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      const titleCaseOperator = (value) => String(value || '').trim()
        .toLocaleLowerCase('pt-BR')
        .replace(/\b\p{L}/gu, letter => letter.toLocaleUpperCase('pt-BR'));
      const skipSet = new Set(['', '-', 'auto descarte', 'limpeza', 'descarte', 'nao realizado', 'sem contato', 'sistema']);

      // Perfis são a fonte canônica. Nomes completos já presentes nas fontes
      // históricas complementam a resolução para instalações antigas.
      const canonicalByNormalizedName = new Map();
      for (const name of (dbProfiles || []).map(p => p.nome).filter(Boolean)) {
        canonicalByNormalizedName.set(normalizeOperatorName(name), name.trim());
      }
      for (const name of [
        ...(eventRows || []).map(e => e.operador),
        ...(sheetRows || []).map(e => e.realizado_por),
      ].filter(Boolean)) {
        const normalized = normalizeOperatorName(name);
        if (normalized.split(' ').length > 1 && !canonicalByNormalizedName.has(normalized)) {
          canonicalByNormalizedName.set(normalized, titleCaseOperator(name));
        }
      }

      const canonicalNames = [...canonicalByNormalizedName.entries()].map(([normalized, name]) => ({ normalized, name }));
      const explicitAliases = new Map([
        ['kaiky', 'Kaiky Salviano'],
        ['kaiky souza', 'Kaiky Salviano'],
        ['kaiky salviano', 'Kaiky Salviano'],
      ]);

      const getFullOperatorName = (rawName) => {
        const normalized = normalizeOperatorName(rawName);
        if (skipSet.has(normalized)) return null;
        if (explicitAliases.has(normalized)) return explicitAliases.get(normalized);
        if (canonicalByNormalizedName.has(normalized)) return canonicalByNormalizedName.get(normalized);

        const words = normalized.split(' ');
        const matches = words.length > 1
          ? canonicalNames.filter(candidate => candidate.normalized.startsWith(`${normalized} `))
          : canonicalNames.filter(candidate => candidate.normalized.split(' ')[0] === normalized);

        // Só completa um nome abreviado quando existe uma única pessoa possível;
        // isso impede juntar pessoas diferentes que compartilham o primeiro nome.
        if (matches.length === 1) return matches[0].name;
        return titleCaseOperator(rawName);
      };

      const toArray24 = (value) => {
        if (Array.isArray(value)) {
          return Array.from({ length: 24 }, (_, i) => Number(value[i] || 0));
        }
        if (typeof value === 'string') {
          const parsed = JSON.parse(value || '[]');
          return Array.from({ length: 24 }, (_, i) => Number(parsed[i] || 0));
        }
        return Array(24).fill(0);
      };

      const toStringArray = (value) => {
        if (Array.isArray(value)) return value.filter(Boolean);
        if (typeof value === 'string') return JSON.parse(value || '[]').filter(Boolean);
        return [];
      };

      const rankingMap = {};
      const hourlyMap = {};

      const ensureRanking = (op) => {
        if (!rankingMap[op]) {
          rankingMap[op] = { operador: op, total_eventos: 0, gravissimo: 0, grave: 0, medio: 0, intervencoes: 0 };
        }
        return rankingMap[op];
      };

      const ensureHourly = (op) => {
        if (!hourlyMap[op]) {
          hourlyMap[op] = {
            operador: op,
            total: 0,
            intervencoes: 0,
            hourly: Array(24).fill(0),
            hourlyInterventions: Array(24).fill(0),
            activeHours: 0,
            activeSlots: new Set(),
          };
        }
        return hourlyMap[op];
      };

      for (const e of (eventRows || [])) {
        const op = getFullOperatorName(e.operador) || e.operador;
        const ranking = ensureRanking(op);
        const hourly = ensureHourly(op);
        const hourlyCounts = toArray24(e.hourly);

        ranking.total_eventos += Number(e.total_eventos || 0);
        ranking.gravissimo += Number(e.gravissimo || 0);
        ranking.grave += Number(e.grave || 0);
        ranking.medio += Number(e.medio || 0);

        hourly.total += Number(e.total_eventos || 0);
        hourly.hourly = hourly.hourly.map((v, i) => v + hourlyCounts[i]);
        for (const slot of toStringArray(e.active_slots)) hourly.activeSlots.add(slot);
        hourly.activeHours = Math.max(hourly.activeHours, Number(e.active_hours || 0));
      }

      for (const r of (sheetRows || [])) {
        const op = getFullOperatorName(r.realizado_por);
        if (!op) continue;
        const ranking = ensureRanking(op);
        const hourly = ensureHourly(op);
        const hourlyInterventions = toArray24(r.hourly_interventions);

        ranking.intervencoes += Number(r.intervencoes || 0);
        hourly.intervencoes += Number(r.intervencoes || 0);
        hourly.hourlyInterventions = hourly.hourlyInterventions.map((v, i) => v + hourlyInterventions[i]);
        for (const slot of toStringArray(r.active_slots)) hourly.activeSlots.add(slot);
        hourly.activeHours = Math.max(hourly.activeHours, Number(r.active_hours || 0));
      }

      const ranking = Object.values(rankingMap).sort((a, b) => b.total_eventos - a.total_eventos);
      const hourlyProductivity = Object.keys(hourlyMap).map(op => {
        const hStats = hourlyMap[op];
        const activeHours = hStats.activeSlots.size || hStats.activeHours;
        const average = activeHours > 0 ? (hStats.total / activeHours) : 0;
        return {
          operador: op,
          total: hStats.total,
          intervencoes: hStats.intervencoes,
          activeHours,
          average: parseFloat(average.toFixed(2)),
          hourly: hStats.hourly,
          hourlyInterventions: hStats.hourlyInterventions,
        };
      });

      const payload = { ranking, hourlyProductivity };
      resultCache.set(cacheKey, { data: payload, ts: Date.now() });
      res.json(payload);
    } catch (err) {
      console.error('[MedNet Backend] Erro no /api/analytics/operator-ranking:', err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });
}

// Limpa o cache em memória do Analytics após uma importação. Exportada para
// que outras rotas de ingestão (ex.: server/horizon-routes.js) reutilizem a
// mesma referência de cache em vez de duplicar o estado.
export function clearAnalyticsCache(platformId) {
  if (platformId) {
    delete rawEventsCache[platformId];
  } else {
    Object.keys(rawEventsCache).forEach(k => delete rawEventsCache[k]);
  }
  resultCache.clear();
  console.log(`[MedNet Backend] Cache limpo após importação para platformId: ${platformId}`);
}
