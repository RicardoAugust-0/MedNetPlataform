/* =============================================================
   MedNet · Analytics — caminho RPC (agregação no Postgres)
   ------------------------------------------------------------
   Alternativa rápida/escalável ao caminho JS (server/index.js):
   em vez de baixar TODAS as linhas e reagregar em memória, chama
   as RPCs analytics_metadata e get_analytics, que devolvem,
   respectivamente, os dropdowns e o objeto `d` já pronto — no
   MESMO shape que aggregate() do fatigueParser.js.

   Fuso padronizado em America/Sao_Paulo (fixo UTC-3; o Brasil não
   adota horário de verão desde 2019, então para os dados do hot
   tier — 12 meses — o offset é constante e bate com o
   `at time zone 'America/Sao_Paulo'` usado dentro da RPC).

   Ativado por ANALYTICS_ENGINE=rpc. Só trata o caminho de UMA
   plataforma; comparação e o fallback de erro caem no caminho JS.
   ============================================================= */

const SP_OFFSET = '-03:00';

function isMissingSupportMetricsRPC(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = `${error?.message || ''} ${error?.details || ''}`;
  return ['PGRST202', '42883'].includes(code)
    && /analytics_support_metrics/i.test(message)
    && /could not find|does not exist|schema cache/i.test(message);
}

function normalizeSupportSources({ sources, platformId, frotas }) {
  const values = Array.isArray(sources)
    ? sources
    : [{ platform_id: platformId, frotas }];

  return values
    .map((source) => ({
      platform_id: source.platform_id || source.platformId,
      frotas: Array.isArray(source.frotas) ? source.frotas : null,
    }))
    .filter((source) => source.platform_id && (!Array.isArray(source.frotas) || source.frotas.length > 0));
}

function supportMetricsFromRPC(data) {
  const evidenceTotal = Number(data?.evidence_total || 0);
  const evidenceAvailable = Number(data?.evidence_available || 0);
  return {
    pct_evidencia: evidenceTotal
      ? +((evidenceAvailable / evidenceTotal) * 100).toFixed(1)
      : null,
    evidencia: evidenceTotal
      ? { disp: evidenceAvailable, aguard: evidenceTotal - evidenceAvailable }
      : null,
    hasEvidence: evidenceTotal > 0,
    t_ini_mediana: data?.t_ini_mediana == null ? null : Number(data.t_ini_mediana),
    t_fin_mediana: data?.t_fin_mediana == null ? null : Number(data.t_fin_mediana),
  };
}

async function querySupportMetrics(supabase, params) {
  const sources = normalizeSupportSources(params);
  if (sources.length === 0) {
    return supportMetricsFromRPC(null);
  }

  const { data, error } = await supabase.rpc('analytics_support_metrics', {
    p_sources: sources,
    p_date_from: params.dateFrom || null,
    p_date_to: params.dateTo || null,
    p_severity: params.severity || null,
    p_classification: params.classification || null,
    p_event_type: params.eventType || null,
  });

  if (error) {
    if (isMissingSupportMetricsRPC(error)) {
      // Esta RPC apenas enriquece o rollup com evidencia e tempos de
      // tratativa. Durante um deploy em que o backend sobe antes da migration,
      // mantenha o restante do Analytics disponivel com os mesmos valores
      // neutros que o proprio get_analytics_rollup ja devolve.
      console.warn(
        '[MedNet Backend] RPC analytics_support_metrics ausente; '
        + 'aplique a migration 20260720113000. Servindo Analytics sem metricas de suporte.',
      );
      return supportMetricsFromRPC(null);
    }
    throw error;
  }

  return supportMetricsFromRPC(data);
}

function mergeSupportMetrics(d, support) {
  if (!d) return d;
  d.kpis = {
    ...(d.kpis || {}),
    pct_evidencia: support.pct_evidencia,
    t_ini_mediana: support.t_ini_mediana,
    t_fin_mediana: support.t_fin_mediana,
  };
  d.evidencia = support.evidencia;
  d.hasEvidence = support.hasEvidence;
  return d;
}

async function enrichRollupSupportMetrics(supabase, d, supportParams) {
  const support = await querySupportMetrics(supabase, supportParams);
  return mergeSupportMetrics(d, support);
}

// 'YYYY-MM' -> limites UTC (ISO com -03:00) do mês inteiro em SP.
export function spMonthBounds(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${y}-${mm}-01T00:00:00.000${SP_OFFSET}`,
    to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}T23:59:59.999${SP_OFFSET}`,
  };
}

// 'YYYY-MM-DD' -> início/fim do dia em SP (ISO com -03:00).
export function spDayStart(dateStr) {
  return `${dateStr}T00:00:00.000${SP_OFFSET}`;
}
export function spDayEnd(dateStr) {
  return `${dateStr}T23:59:59.999${SP_OFFSET}`;
}

// Mês anterior a 'YYYY-MM' (mesma lógica do server/index.js).
export function prevMonthKey(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// fleets {frotaCrua: contagem} -> lista de empresas canônicas (exclui
// '' e 'Não informado'), igual a availableCompanies do caminho JS.
export function companiesFromFleets(fleets, resolveMonitorName, aliases) {
  const set = new Set();
  for (const raw of Object.keys(fleets || {})) {
    const resolved = resolveMonitorName(raw, aliases);
    if (resolved && resolved !== 'Não informado') set.add(resolved);
  }
  return Array.from(set).sort();
}

// Empresa canônica selecionada -> frotas cruas que resolvem para ela.
// null  => sem filtro de empresa.
// []    => empresa sem frota correspondente (casa o "nenhuma linha" do JS).
export function frotasForCompany(company, fleets, resolveMonitorName, aliases) {
  if (!company) return null;
  const list = [];
  for (const raw of Object.keys(fleets || {})) {
    if (resolveMonitorName(raw, aliases) === company) list.push(raw);
  }
  return list;
}

// get_analytics devolve frota_raw (frota crua -> contagem); aqui resolvemos
// aliases, mesclamos por nome canônico ('' -> 'Não informado'), pegamos o top 8
// e gravamos em d.frota — igual a topN(fleets, 8) do aggregate().
export function resolveFrotaChart(d, resolveMonitorName, aliases) {
  const raw = d.frota_raw || {};
  const merged = {};
  for (const [rawKey, cnt] of Object.entries(raw)) {
    const name = resolveMonitorName(rawKey, aliases) || 'Não informado';
    merged[name] = (merged[name] || 0) + cnt;
  }
  const labels = Object.keys(merged).sort((a, b) => merged[b] - merged[a]).slice(0, 8);
  d.frota = { labels, valores: labels.map((k) => merged[k]) };
  delete d.frota_raw;
  return d;
}

// Quantos dias (inclusive) entre duas datas 'YYYY-MM-DD'.
function daySpan(startDate, endDate) {
  return Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
}

// Deriva os parâmetros de tempo/bucket a partir do filtro de mês do front.
// - mês específico 'YYYY-MM'      : buckets diários, janela = mês, months = base_all.
// - 'custom' + range <= 31 dias   : buckets diários, janela = range, months = base_all.
// - 'custom' + range > 31 dias    : buckets mensais, janela = range, months = janela.
// - 'all' (ou vazio)              : buckets mensais, sem janela, months = base_all.
export function deriveDateParams(month, startDate, endDate) {
  const isSpecific = month && month !== 'all' && month !== 'custom' && month.includes('-');
  if (isSpecific) {
    const { from, to } = spMonthBounds(month);
    return { from, to, daily: true, windowMonths: false };
  }
  if (month === 'custom' && startDate && endDate) {
    const span = daySpan(startDate, endDate);
    const daily = span > 0 && span <= 31;
    return { from: spDayStart(startDate), to: spDayEnd(endDate), daily, windowMonths: !daily };
  }
  return { from: null, to: null, daily: false, windowMonths: false };
}

async function callGetAnalytics(supabase, params) {
  // Lê o rollup pré-agregado (analytics_daily) via get_analytics_rollup — mesma
  // saída que get_analytics (paridade validada), mas em ~5k linhas em vez de
  // varrer driver_events. get_analytics (cru) segue como referência/fallback.
  const { data, error } = await supabase.rpc('get_analytics_rollup', params);
  if (error) throw error;
  return data;
}

/**
 * Monta a resposta de /api/analytics (uma plataforma) via RPC.
 * Retorna { availableMonths, availableCompanies, availableTypes, d, prevD }.
 * Lança em erro de RPC — o chamador faz fallback para o caminho JS.
 */
export async function buildSingleAnalyticsViaRPC(supabase, {
  platformId, month, startDate, endDate, company, severity, classification, eventType,
}, { resolveMonitorName, aliases }) {
  // 1. Metadados (dropdowns) — do rollup, sem varrer driver_events.
  const { data: meta, error: metaErr } = await supabase.rpc('analytics_metadata_rollup', {
    p_platform_ids: [platformId],
  });
  if (metaErr) throw metaErr;
  const fleets = (meta && meta.fleets) || {};
  const availableMonths = ((meta && meta.months) || []).slice(0, 12); // já vem desc
  const availableTypes = (meta && meta.types) || [];
  const availableCompanies = companiesFromFleets(fleets, resolveMonitorName, aliases);

  // 2. Parâmetros de tempo + filtro de empresa.
  const { from, to, daily, windowMonths } = deriveDateParams(month, startDate, endDate);
  const pFrotas = frotasForCompany(company, fleets, resolveMonitorName, aliases);
  const baseParams = {
    p_platform_ids: [platformId],
    p_frotas: pFrotas,
    p_severity: severity || null,
    p_classification: classification || null,
    p_event_type: eventType || null,
    p_tz: 'America/Sao_Paulo',
  };

  const fetchPeriodData = async (dateFrom, dateTo, isDaily, isWindowMonths) => {
    const [rollupData, supportData] = await Promise.all([
      callGetAnalytics(supabase, {
        ...baseParams,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_daily: isDaily,
        p_window_months: isWindowMonths,
      }),
      querySupportMetrics(supabase, {
        platformId,
        frotas: pFrotas,
        dateFrom,
        dateTo,
        severity,
        classification,
        eventType,
      }),
    ]);
    resolveFrotaChart(rollupData, resolveMonitorName, aliases);
    mergeSupportMetrics(rollupData, supportData);
    return rollupData;
  };

  const hasPrevMonth = Boolean(month && month !== 'all' && month !== 'custom' && month.includes('-'));
  const prevBounds = hasPrevMonth ? spMonthBounds(prevMonthKey(month)) : null;

  const [d, prevD] = await Promise.all([
    fetchPeriodData(from, to, daily, windowMonths),
    prevBounds ? fetchPeriodData(prevBounds.from, prevBounds.to, true, false) : Promise.resolve(null),
  ]);

  // availableUfs = todas as UFs presentes (não filtrado por UF — a RPC nunca roda
  // com filtro de UF; quando há um, o caminho JS assume). d.uf já vem do rollup.
  const availableUfs = (((d && d.uf && d.uf.labels) || []).slice()).sort();

  return { availableMonths, availableCompanies, availableTypes, availableUfs, d, prevD };
}

async function callRollupMulti(supabase, params) {
  const { data, error } = await supabase.rpc('get_analytics_rollup_multi', params);
  if (error) throw error;
  return data;
}

function platformLabel(pid) {
  return pid === 'omnilink' ? 'OmniLink'
    : pid === 'maxtrack' ? 'MaxTrack'
    : pid.toUpperCase();
}

/**
 * Monta a resposta de /api/analytics em modo COMPARAÇÃO via rollup.
 * `sources` é uma lista de fontes { platformId, company } — cada uma vira uma
 * coluna (agregada por get_analytics_rollup), e o painel combinado é a UNIÃO
 * delas (get_analytics_rollup_multi). Serve tanto "comparar plataformas" quanto
 * "comparar empresas da mesma plataforma" — o servidor não distingue o modo,
 * apenas recebe a lista de fontes.
 */
export async function buildCompareViaRPC(supabase, {
  sources, month, startDate, endDate, severity, classification, eventType,
}, { resolveMonitorName, aliases }) {
  const platformIds = [...new Set(sources.map((s) => s.platformId))];

  // Metadados (frotas/meses/tipos) por plataforma envolvida — do rollup.
  const metaByPlatform = {};
  for (const pid of platformIds) {
    const { data: meta, error } = await supabase.rpc('analytics_metadata_rollup', { p_platform_ids: [pid] });
    if (error) throw error;
    metaByPlatform[pid] = meta || { months: [], types: [], fleets: {} };
  }

  // Dropdowns globais = união entre as plataformas.
  const monthsSet = new Set();
  const typesSet = new Set();
  const companiesSet = new Set();
  for (const pid of platformIds) {
    const m = metaByPlatform[pid];
    (m.months || []).forEach((x) => monthsSet.add(x));
    (m.types || []).forEach((x) => typesSet.add(x));
    companiesFromFleets(m.fleets || {}, resolveMonitorName, aliases).forEach((x) => companiesSet.add(x));
  }
  const availableMonths = Array.from(monthsSet).sort().reverse().slice(0, 12);
  const availableTypes = Array.from(typesSet).sort();
  const availableCompanies = Array.from(companiesSet).sort();

  const { from, to, daily, windowMonths } = deriveDateParams(month, startDate, endDate);

  // Cada fonte: agregação individual + filtro resolvido p/ o combinado.
  const outSources = [];
  const resolvedForCombined = [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const fleets = metaByPlatform[s.platformId].fleets || {};
    const pFrotas = frotasForCompany(s.company, fleets, resolveMonitorName, aliases); // null = todas
    resolvedForCombined.push({ platform_id: s.platformId, frotas: pFrotas });

    const d = await callGetAnalytics(supabase, {
      p_platform_ids: [s.platformId],
      p_frotas: pFrotas,
      p_date_from: from, p_date_to: to,
      p_severity: severity || null,
      p_classification: classification || null,
      p_event_type: eventType || null,
      p_daily: daily, p_window_months: windowMonths,
      p_tz: 'America/Sao_Paulo',
    });
    resolveFrotaChart(d, resolveMonitorName, aliases);
    await enrichRollupSupportMetrics(supabase, d, {
      platformId: s.platformId,
      frotas: pFrotas,
      dateFrom: from,
      dateTo: to,
      severity,
      classification,
      eventType,
    });

    const platformName = platformLabel(s.platformId);
    outSources.push({
      id: `src-${i}-${s.platformId}`,
      platformId: s.platformId,
      platformName,
      company: s.company || '',
      label: s.company ? s.company : platformName,
      rows: (d.meta && d.meta.total) || 0,
      availableCompanies: companiesFromFleets(fleets, resolveMonitorName, aliases),
      data: d,
    });
  }

  // Painel combinado = união das fontes.
  const d = await callRollupMulti(supabase, {
    p_sources: resolvedForCombined,
    p_date_from: from, p_date_to: to,
    p_severity: severity || null,
    p_classification: classification || null,
    p_event_type: eventType || null,
    p_daily: daily, p_window_months: windowMonths,
    p_tz: 'America/Sao_Paulo',
  });
  resolveFrotaChart(d, resolveMonitorName, aliases);
  const combinedSupport = await querySupportMetrics(supabase, {
    sources: resolvedForCombined,
    dateFrom: from,
    dateTo: to,
    severity,
    classification,
    eventType,
  });
  mergeSupportMetrics(d, combinedSupport);

  // Mês anterior (só quando há um mês específico selecionado).
  let prevD = null;
  if (month && month !== 'all' && month !== 'custom' && month.includes('-')) {
    const pk = prevMonthKey(month);
    const pb = spMonthBounds(pk);
    prevD = await callRollupMulti(supabase, {
      p_sources: resolvedForCombined,
      p_date_from: pb.from, p_date_to: pb.to,
      p_severity: severity || null,
      p_classification: classification || null,
      p_event_type: eventType || null,
      p_daily: true, p_window_months: false,
      p_tz: 'America/Sao_Paulo',
    });
    resolveFrotaChart(prevD, resolveMonitorName, aliases);
    const prevCombinedSupport = await querySupportMetrics(supabase, {
      sources: resolvedForCombined,
      dateFrom: pb.from,
      dateTo: pb.to,
      severity,
      classification,
      eventType,
    });
    mergeSupportMetrics(prevD, prevCombinedSupport);
  }

  const availableUfs = (((d && d.uf && d.uf.labels) || []).slice()).sort();

  return { availableMonths, availableCompanies, availableTypes, availableUfs, sources: outSources, d, prevD };
}
