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

// Deriva os parâmetros de tempo/bucket a partir do filtro de mês do front.
// - mês específico 'YYYY-MM' : buckets diários, janela = mês, months = base_all.
// - 'custom' + range        : buckets mensais, janela = range, months = janela.
// - 'all' (ou vazio)        : buckets mensais, sem janela, months = base_all.
export function deriveDateParams(month, startDate, endDate) {
  const isSpecific = month && month !== 'all' && month !== 'custom' && month.includes('-');
  if (isSpecific) {
    const { from, to } = spMonthBounds(month);
    return { from, to, daily: true, windowMonths: false };
  }
  if (month === 'custom' && startDate && endDate) {
    return { from: spDayStart(startDate), to: spDayEnd(endDate), daily: false, windowMonths: true };
  }
  return { from: null, to: null, daily: false, windowMonths: false };
}

async function callGetAnalytics(supabase, params) {
  const { data, error } = await supabase.rpc('get_analytics', params);
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
  // 1. Metadados (dropdowns) — sem baixar linhas.
  const { data: meta, error: metaErr } = await supabase.rpc('analytics_metadata', {
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

  // 3. Período atual.
  const d = await callGetAnalytics(supabase, {
    ...baseParams,
    p_date_from: from,
    p_date_to: to,
    p_daily: daily,
    p_window_months: windowMonths,
  });
  resolveFrotaChart(d, resolveMonitorName, aliases);

  // 4. Mês anterior (apenas quando há um mês específico selecionado).
  let prevD = null;
  if (month && month !== 'all' && month !== 'custom' && month.includes('-')) {
    const pk = prevMonthKey(month);
    const pb = spMonthBounds(pk);
    prevD = await callGetAnalytics(supabase, {
      ...baseParams,
      p_date_from: pb.from,
      p_date_to: pb.to,
      p_daily: true,
      p_window_months: false,
    });
    resolveFrotaChart(prevD, resolveMonitorName, aliases);
  }

  return { availableMonths, availableCompanies, availableTypes, d, prevD };
}
