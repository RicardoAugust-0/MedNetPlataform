/* =============================================================
   MedNet · Fadiga Zero — Motor universal de planilhas
   Lê XLSX/CSV de múltiplas plataformas (MaxTrack, Sascar, Sascar JD,
   Sighra, Horizon, AutoTrac, OmniLink, Trimble), detecta o layout,
   mapeia colunas e agrega tudo no formato consumido pelo painel.

   Estratégia "universal": dicionário de sinônimos por campo (normalizado
   sem acento/caixa). A detecção de plataforma é por assinatura de
   cabeçalho; o mapeamento é genérico e pode ser ajustado manualmente.
   ============================================================= */

const norm = (s) =>
  (s == null ? '' : String(s)).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ── Plataformas suportadas (assinaturas leves p/ auto-detecção) ──
export const PLATFORMS = [
  { id: 'maxtrack', name: 'MaxTrack', sig: ['maxtrack', 'max track'] },
  { id: 'sascar',   name: 'Sascar',   sig: ['sascar'] },
  { id: 'sascar_jd',name: 'Sascar JD',sig: ['sascar jd', 'sascar_jd', 'jornada digital'] },
  { id: 'sighra',   name: 'Sighra',   sig: ['sighra'] },
  { id: 'horizon',  name: 'Horizon',  sig: ['horizon'] },
  { id: 'autotrac', name: 'AutoTrac', sig: ['autotrac', 'auto trac'] },
  { id: 'omnilink', name: 'OmniLink', sig: ['omnilink', 'omni link'] },
  { id: 'trimble',  name: 'Trimble',  sig: ['trimble'] },
];

// ── Campos do modelo + sinônimos de cabeçalho (normalizados) ──
export const FIELD_DEFS = [
  { key: 'datetime',       label: 'Data / hora do alerta', req: true,
    aliases: ['data/hora', 'data hora', 'datahora', 'data do alerta', 'data do evento', 'data/hora do evento', 'data e hora', 'data ocorrencia', 'data da ocorrencia', 'inicio do evento', 'data inicio', 'horario do alerta', 'timestamp', 'data', 'horario', 'hora do alerta'] },
  { key: 'driver',         label: 'Motorista', req: false,
    aliases: ['motorista', 'condutor', 'nome do motorista', 'nome do condutor', 'driver', 'colaborador', 'operador'] },
  { key: 'plate',          label: 'Placa / veículo', req: false,
    aliases: ['placa', 'placa do veiculo', 'veiculo', 'plate', 'prefixo', 'identificacao do veiculo'] },
  { key: 'criticality',    label: 'Criticidade', req: false,
    aliases: ['criticidade', 'severidade', 'gravidade', 'nivel de risco', 'nivel', 'risco'] },
  { key: 'type',           label: 'Tipo de detecção', req: false,
    aliases: ['tipo de deteccao', 'tipo de evento', 'tipo de alerta', 'tipo de ocorrencia', 'tipo', 'evento', 'deteccao', 'descricao do evento', 'infracao', 'alerta'] },
  { key: 'classification', label: 'Classificação (análise)', req: false,
    aliases: ['classificacao', 'analise', 'resultado da analise', 'validacao', 'tratativa', 'julgamento', 'parecer', 'resultado', 'status do alerta', 'status'] },
  { key: 'speed',          label: 'Velocidade', req: false,
    aliases: ['velocidade no alerta', 'velocidade do veiculo', 'velocidade', 'speed', 'km/h'] },
  { key: 'location',       label: 'Localização / UF', req: false,
    aliases: ['localizacao', 'local', 'uf', 'estado', 'cidade', 'municipio', 'endereco', 'posicao', 'localidade'] },
  { key: 'fleet',          label: 'Frota / base / cliente', req: false,
    aliases: ['frota', 'filial', 'base', 'cliente', 'unidade', 'regional', 'transportadora', 'empresa', 'grupo'] },
  { key: 'evidence',       label: 'Evidência (vídeo)', req: false,
    aliases: ['link do video', 'video', 'evidencia', 'midia', 'anexo', 'imagem', 'url do video', 'tem video'] },
  { key: 'treatStart',     label: 'Início da tratativa', req: false,
    aliases: ['inicio da tratativa', 'inicio tratativa', 'inicio do atendimento', 'atendido em', 'data inicio tratativa'] },
  { key: 'treatEnd',       label: 'Fim da tratativa', req: false,
    aliases: ['fim da tratativa', 'fim tratativa', 'finalizado em', 'encerramento', 'data fim tratativa', 'conclusao', 'data finalizacao evento'] },
  { key: 'description',    label: 'Descrição / Categoria', req: false,
    aliases: ['descricao', 'categoria', 'description', 'category', 'justificativa'] },
];

// ── Mapas determinísticos de colunas por plataforma conhecida ──
// Para plataformas reconhecidas, o layout é fixo e conhecido — então em vez de
// confiar só na detecção por sinônimos (que pode escolher a coluna errada quando
// há nomes parecidos, ex.: "Veículo" vs "Placa"), fixamos o cabeçalho exato.
// Cada campo lista cabeçalhos candidatos em ordem de preferência; o primeiro que
// existir na planilha (comparação sem acento/caixa) é fixado, sobrepondo a
// detecção genérica. Campos ausentes mantêm o que a detecção genérica achou.
// Listar vários candidatos cobre variações de export da MESMA plataforma
// (ex.: Sascar bruto "Hora do evento" vs Sascar já normalizado "Data/Hora").
export const PLATFORM_COLUMN_MAPS = {
  sascar: {
    datetime:       ['Hora do evento', 'Data/Hora', 'Data do evento'],
    driver:         ['Motorista'],
    plate:          ['Placa'],
    criticality:    ['Severidade'],
    type:           ['Evento'],
    classification: ['Status', 'Validação', 'Classificação'],
    speed:          ['Velocidade', 'Velocidade (km/h)'],
    location:       ['Localidade'],
    fleet:          ['Transportadora', 'Frota/Empresa', 'Cliente'],
    description:    ['Categoria', 'Descrição'],
  },
  maxtrack: {
    datetime:       ['Data'],
    driver:         ['Motorista'],
    plate:          ['Identificador/Placa'],
    criticality:    ['Criticidade'],
    type:           ['Nome'],
    classification: ['Classificação'],
    speed:          ['Velocidade Inicial', 'Velocidade Final'],
    location:       ['Localidade'],
    fleet:          ['Empresa', 'Cliente'],
    evidence:       ['Possui evidência?'],
    treatStart:     ['Início da Tratativa'],
    treatEnd:       ['Data finalização evento'],
    description:    ['Categoria', 'Descrição'],
  },
  omnilink: {
    datetime:       ['Data da ocorrência', 'Data de cadastro'],
    driver:         ['Motorista'],
    plate:          ['Placa'],
    type:           ['Evento'],
    classification: ['Método de processamento', 'Status'],
    speed:          ['Velocidade'],
    location:       ['Endereço'],
    treatStart:     ['Data de tratamento'],
  },
  sighra: {
    datetime:       ['Data Alerta', 'Primeiro Evento'],
    driver:         ['Motorista'],
    plate:          ['Placa'],
    criticality:    ['Criticidade'],
    type:           ['Evento'],
    classification: ['Classificação', 'Status'],
    fleet:          ['Cliente'],
    treatStart:     ['Início Tratativa'],
    description:    ['Motivo', 'Observações'],
  },
  horizon: {
    datetime:       ['Data/Hora Evento'],
    driver:         ['Motorista / Comandante'],
    plate:          ['Placa / Empurrador'],
    criticality:    ['Gravidade'],
    type:           ['Evento'],
    classification: ['Avaliação', 'Status'],
    speed:          ['Velocidade'],
    location:       ['Local'],
    fleet:          ['Transportadora / Empresa de Navegação', 'Filial'],
    evidence:       ['Data/Hora Disponibilidade Vídeo'],
    treatStart:     ['Data/Hora Publicação'],
    description:    ['Justificativa', 'Descrição'],
  },
};

// ── Assinaturas por cabeçalho (fallback quando o nome do arquivo não denuncia) ──
// Alguns exports não trazem o nome da plataforma no arquivo nem nas colunas
// (ex.: MaxTrack "Relatório - Eventos", Horizon "historico ...xlsx"). Aqui
// reconhecemos pela presença de colunas características (já normalizadas).
const PLATFORM_HEADER_SIGS = [
  { id: 'maxtrack', need: ['identificador/placa'], anyOf: ['criticidade original', 'tipo de operacao', 'matricula do motorista'] },
  { id: 'sighra',   need: ['id alerta', 'quantidade eventos'] },
  { id: 'horizon',  need: [], anyOf: ['placa / empurrador', 'transportadora / empresa de navegacao', 'abono motorista'] },
  { id: 'omnilink', need: ['metodo de processamento', 'tratado por'] },
];

// Tenta reconhecer a plataforma só pelos cabeçalhos (recebe cabeçalhos já normalizados).
export function detectByHeaders(normHeaders) {
  for (const sig of PLATFORM_HEADER_SIGS) {
    const hasNeed = sig.need.every((n) => normHeaders.includes(n));
    const hasAny = !sig.anyOf || sig.anyOf.length === 0 || sig.anyOf.some((a) => normHeaders.includes(a));
    if (hasNeed && hasAny) return sig.id;
  }
  return null;
}

// Aplica o mapa determinístico da plataforma sobre um mapeamento já calculado.
// Só sobrepõe um campo quando algum cabeçalho candidato realmente existe na
// planilha — caso contrário preserva o resultado da detecção genérica.
export function applyPlatformMap(headers, platformId, mapping = {}) {
  const map = PLATFORM_COLUMN_MAPS[platformId];
  if (!map) return mapping;
  const normHeaders = headers.map(norm);
  for (const field of Object.keys(map)) {
    for (const cand of map[field]) {
      const idx = normHeaders.indexOf(norm(cand));
      if (idx > -1) { mapping[field] = headers[idx]; break; }
    }
  }
  return mapping;
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

// ── Conversores robustos ──
export function toDate(v) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number') { // serial Excel
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d;
  }
  const s = String(v || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), +(m[6]||0)); }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0));
  const d = new Date(s); return isNaN(d) ? null : d;
}

export function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[^\d,.\-]/g, '');
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = parseFloat(s); return isNaN(n) ? null : n;
}

export function toUF(v) {
  if (!v) return null;
  const s = String(v).toUpperCase();
  const m = s.match(/\b[A-Z]{2}\b/g);
  if (m) {
    for (let i = m.length - 1; i >= 0; i--) {
      if (UFS.includes(m[i])) return m[i];
    }
  }
  return null;
}

export function normCrit(v) {
  const s = norm(v); if (!s) return 'Médio';
  if (s.includes('gravi') || s.includes('critic') || s.includes(' n2') || s.endsWith('n2') || s.includes('altiss') || s.includes('alta') || s.includes('alto')) return 'Gravíssimo';
  if (s.includes('grave') || s.includes('moder')) return 'Grave';
  // "Leve" é um nível próprio: os eventos são preservados no banco, mas ficam
  // FORA da análise (ver aggregate() e o filtro do servidor).
  if (s.includes('leve') || s === 'baixo' || s === 'baixa') return 'Leve';
  return 'Médio';
}

export function normClf(v) {
  const s = norm(v); if (!s) return 'Não classificado';
  // "Improcedente" contém "procede", "inválido" contém "válido", e "não procede" contém "procede".
  // Devem ser testados no bloco de Falso positivo antes de conferir o bloco de Positivo.
  if (
    s.includes('falso') ||
    s.includes('improced') ||
    s.includes('invalid') ||
    s.includes('nao procede') ||
    s.includes('sem proced') ||
    s.includes('justific')
  ) {
    return 'Falso positivo';
  }
  if (
    s.includes('positiv') ||
    s.includes('confirmad') ||
    s.includes('procede') ||
    s.includes('verdadeir') ||
    s.includes('real') ||
    s.includes('valido')
  ) {
    return 'Positivo';
  }
  return 'Não classificado';
}

export function hasEvid(v) {
  if (v == null || v === '') return false;
  const s = norm(v);
  if (s === '0' || s === '-' || s.includes('sem') || s.includes('aguard') || s.includes('indispon') || s === 'nao' || s.includes('nao ') || s.includes('false')) return false;
  return true;
}

export function median(arr) {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y), n = a.length, h = Math.floor(n / 2);
  return n % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
}

export const mesLabel = (mk) => { 
  const [y, m] = mk.split('-'); 
  return MESES[+m - 1] + '/' + y.slice(2); 
};

// ── CSV próprio: preserva strings cruas (evita o XLSX trocar dd/mm por mm/dd) ──
export function parseCSV(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const nl = text.indexOf('\n');
  const first = nl > -1 ? text.slice(0, nl) : text;
  const cnt = { ',': (first.match(/,/g) || []).length, ';': (first.match(/;/g) || []).length, '\t': (first.match(/\t/g) || []).length };
  let delim = ','; if (cnt[';'] > cnt[delim]) delim = ';'; if (cnt['\t'] > cnt[delim]) delim = '\t';
  const rows = []; let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim) { row.push(cur.trim()); cur = ''; }
      else if (c === '\n') { row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows;
}

// ── Cabeçalhos: encontra a linha de cabeçalho numa matriz (AOA) ──
export function readHeaders(aoa) {
  let hi = 0, best = -1;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const filled = (aoa[i] || []).filter((c) => c !== '' && c != null).length;
    if (filled > best) { best = filled; hi = i; }
    if (filled >= 4) { hi = i; break; }
  }
  const headers = (aoa[hi] || []).map((c) => String(c == null ? '' : c).trim());
  const dataRows = aoa.slice(hi + 1).filter((r) => (r || []).some((c) => c !== '' && c != null));
  return { headers, dataRows };
}

// ── Detecção: plataforma (assinatura) + mapeamento (sinônimos) ──
export function detect(headers, platformHint, fileName) {
  const normHeaders = headers.map(norm);
  const joined = ' ' + normHeaders.join(' | ') + ' ' + norm(fileName || '') + ' ';

  let platform = null;
  if (platformHint && platformHint !== 'auto') {
    platform = PLATFORMS.find((p) => p.id === platformHint) || null;
  }
  if (!platform) {
    for (const p of PLATFORMS) {
      if (p.sig.some((s) => joined.includes(s))) { platform = p; break; }
    }
  }
  // Fallback: reconhecer pela "impressão digital" das colunas quando o nome do
  // arquivo/cabeçalho não denuncia a plataforma (ex.: MaxTrack "Relatório - Eventos",
  // Horizon "historico ...").
  if (!platform) {
    const byHeaders = detectByHeaders(normHeaders);
    if (byHeaders) platform = PLATFORMS.find((p) => p.id === byHeaders) || null;
  }

  const used = new Set();
  const mapping = {};
  for (const f of FIELD_DEFS) {
    let bestIdx = -1, bestScore = 0;
    headers.forEach((h, i) => {
      if (used.has(i) || !h) return;
      const nh = normHeaders[i];
      if (!nh) return;
      let score = 0;
      for (const a of f.aliases) {
        if (nh === a) score = Math.max(score, 100 + a.length);
        else if (nh.includes(a)) score = Math.max(score, 50 + a.length);
        else if (a.includes(nh) && nh.length >= 5) score = Math.max(score, 10 + nh.length);
      }
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });
    if (bestIdx > -1) { mapping[f.key] = headers[bestIdx]; used.add(bestIdx); }
    else mapping[f.key] = null;
  }

  // Para plataformas conhecidas, fixa as colunas pelo mapa determinístico
  // (sobrepõe a detecção genérica apenas quando a coluna existe na planilha).
  if (platform) {
    applyPlatformMap(headers, platform.id, mapping);
  }

  return { platform: platform ? platform.id : 'auto', platformName: platform ? platform.name : 'Detecção automática', mapping };
}

// ── Agregação principal ──
export function aggregate(headers, dataRows, mapping, filterMonth = null) {
  const idx = {};
  Object.keys(mapping).forEach((k) => { idx[k] = mapping[k] ? headers.indexOf(mapping[k]) : -1; });
  const get = (row, k) => (idx[k] > -1 ? row[idx[k]] : '');

  // 1. Encontrar todos os meses disponíveis na planilha (usando dados brutos)
  const availableMonths = new Set();
  if (idx.datetime > -1) {
    for (const row of dataRows) {
      const d = toDate(row[idx.datetime]);
      if (d) {
        const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        availableMonths.add(mk);
      }
    }
  }
  const sortedMonths = Array.from(availableMonths).sort();

  // 2. Filtrar linhas se houver um filtro de mês ativo
  let rowsToProcess = [];
  if (filterMonth && idx.datetime > -1) {
    for (const row of dataRows) {
      const d = toDate(row[idx.datetime]);
      if (d) {
        const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (mk === filterMonth) {
          rowsToProcess.push(row);
        }
      }
    }
  } else {
    rowsToProcess = dataRows;
  }

  // 3. Determinar chaves de tempo e inicializar contadores
  let timeKeys = [];
  if (filterMonth) {
    // Agrupamento diário
    const [yearStr, monthStr] = filterMonth.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const numDays = new Date(year, month, 0).getDate();
    for (let i = 1; i <= numDays; i++) {
      timeKeys.push(`${yearStr}-${monthStr}-${String(i).padStart(2, '0')}`);
    }
  } else {
    // Agrupamento mensal
    timeKeys = sortedMonths;
  }

  const timeSet = {}, critByTime = {}, typeByTime = {}, typeTotal = {};
  const falsoByTime = {}, totByTimeForFalso = {};
  const categoryCounts = {};

  for (const tk of timeKeys) {
    timeSet[tk] = 0;
    critByTime[tk] = { 'Gravíssimo': 0, 'Grave': 0, 'Médio': 0 };
    typeByTime[tk] = {};
    falsoByTime[tk] = 0;
    totByTimeForFalso[tk] = 0;
  }

  const clf = { 'Positivo': 0, 'Falso positivo': 0, 'Não classificado': 0 };
  const naoclass_reasons = { autoFinalizado: 0, imagemNaoVisivel: 0, outros: 0 };
  const drivers = {}, plates = {}, fleets = {}, ufs = {};
  const driverSet = new Set(), vehSet = new Set();
  const hora = new Array(24).fill(0), horaPos = new Array(24).fill(0);
  const dowArr = new Array(7).fill(0);
  const velBuckets = [0, 0, 0, 0, 0, 0]; const velLabels = ['0-20', '20-40', '40-60', '60-70', '70-80', '80+'];
  const velAll = []; let velHigh = 0, velCount = 0;
  let evidDisp = 0, evidAguard = 0;
  const treatStartDiffs = [], treatEndDiffs = [];
  let minD = null, maxD = null, total = 0;

  for (const row of rowsToProcess) {
    // Eventos de criticidade "Leve" ficam fora da análise (preservados no banco,
    // mas não contam em totais, criticidades, classificação, etc.).
    if (normCrit(get(row, 'criticality')) === 'Leve') continue;
    const d = toDate(get(row, 'datetime'));
    total++;
    const clfV = normClf(get(row, 'classification'));
    clf[clfV] = (clf[clfV] || 0) + 1;
    const isPos = clfV === 'Positivo';

    if (clfV === 'Não classificado') {
      const rawClf = get(row, 'classification') || '';
      if (rawClf === 'Não classificado - Auto Finalizado') {
        naoclass_reasons.autoFinalizado++;
      } else if (rawClf === 'Não classificado - Imagem não visível') {
        naoclass_reasons.imagemNaoVisivel++;
      } else {
        naoclass_reasons.outros++;
      }
    }

    if (d) {
      if (!minD || d < minD) minD = d;
      if (!maxD || d > maxD) maxD = d;

      const tk = filterMonth
        ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
        : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

      if (timeSet[tk] === undefined) {
        timeSet[tk] = 0;
        critByTime[tk] = { 'Gravíssimo': 0, 'Grave': 0, 'Médio': 0 };
        typeByTime[tk] = {};
        falsoByTime[tk] = 0;
        totByTimeForFalso[tk] = 0;
      }

      timeSet[tk]++;
      const crit = normCrit(get(row, 'criticality'));
      critByTime[tk][crit]++;
      if (clfV === 'Falso positivo') falsoByTime[tk]++;
      totByTimeForFalso[tk]++;

      const h = d.getHours(); hora[h]++; if (isPos) horaPos[h]++;
      dowArr[d.getDay()]++;
    }

    const tRaw = String(get(row, 'type') || '').trim();
    const t = tRaw || 'Não informado';
    typeTotal[t] = (typeTotal[t] || 0) + 1;
    if (d) {
      const tk = filterMonth
        ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
        : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

      if (!typeByTime[tk]) typeByTime[tk] = {};
      typeByTime[tk][t] = (typeByTime[tk][t] || 0) + 1;
    }

    const dn = String(get(row, 'driver') || '').trim();
    if (dn) { drivers[dn] = (drivers[dn] || 0) + 1; driverSet.add(dn.toUpperCase()); }
    const pl = String(get(row, 'plate') || '').trim();
    if (pl) { plates[pl] = (plates[pl] || 0) + 1; vehSet.add(pl.toUpperCase()); }
    const fl = String(get(row, 'fleet') || '').trim();
    if (fl) fleets[fl] = (fleets[fl] || 0) + 1;
    const uf = toUF(get(row, 'location'));
    if (uf) ufs[uf] = (ufs[uf] || 0) + 1;

    const v = toNum(get(row, 'speed'));
    if (v != null && v >= 0 && v < 200) {
      velAll.push(v); velCount++; if (v > 60) velHigh++;
      if (v < 20) velBuckets[0]++; else if (v < 40) velBuckets[1]++; else if (v < 60) velBuckets[2]++;
      else if (v < 70) velBuckets[3]++; else if (v < 80) velBuckets[4]++; else velBuckets[5]++;
    }

    if (idx.evidence > -1) { if (hasEvid(get(row, 'evidence'))) evidDisp++; else evidAguard++; }

    const desc = String(get(row, 'description') || '').trim();
    if (desc) {
      categoryCounts[desc] = (categoryCounts[desc] || 0) + 1;
    }

    if (idx.treatStart > -1 && d) { const ts = toDate(get(row, 'treatStart')); if (ts) { const m = (ts - d) / 60000; if (m >= 0 && m < 1440) treatStartDiffs.push(m); } }
    if (idx.treatEnd > -1 && d) { const te = toDate(get(row, 'treatEnd')); if (te) { const m = (te - d) / 60000; if (m >= 0 && m < 4320) treatEndDiffs.push(m); } }
  }

  const sortedKeys = filterMonth ? timeKeys : Object.keys(timeSet).sort();
  const valores = sortedKeys.map((tk) => timeSet[tk] || 0);
  const variacao = valores.map((v, i) => i === 0 ? null : (valores[i - 1] ? +(((v - valores[i - 1]) / valores[i - 1]) * 100).toFixed(1) : null));

  const critSeries = { 'Gravíssimo': [], 'Grave': [], 'Médio': [] };
  sortedKeys.forEach((tk) => {
    const c = critByTime[tk] || {};
    critSeries['Gravíssimo'].push(c['Gravíssimo'] || 0);
    critSeries['Grave'].push(c['Grave'] || 0);
    critSeries['Médio'].push(c['Médio'] || 0);
  });

  const topTypes = Object.keys(typeTotal).sort((a, b) => typeTotal[b] - typeTotal[a]).slice(0, 5);
  const typeSeries = {};
  topTypes.forEach((t) => {
    typeSeries[t] = sortedKeys.map((tk) => (typeByTime[tk] && typeByTime[tk][t]) || 0);
  });

  const falsoPct = sortedKeys.map((tk) => totByTimeForFalso[tk] ? +(((falsoByTime[tk] || 0) / totByTimeForFalso[tk]) * 100).toFixed(1) : 0);

  const topN = (obj, n) => { const k = Object.keys(obj).sort((a, b) => obj[b] - obj[a]).slice(0, n); return { labels: k, valores: k.map((x) => obj[x]) }; };
  const ufSorted = Object.keys(ufs).sort((a, b) => ufs[b] - ufs[a]);

  const t = total || 1;
  const velMed = median(velAll);

  const labelFn = filterMonth
    ? (tk) => { const [y, m, d] = tk.split('-'); return d + '/' + m; }
    : (tk) => { const [y, m] = tk.split('-'); return MESES[+m - 1] + '/' + y.slice(2); };
  
  const labels = sortedKeys.map(labelFn);

  return {
    meta: {
      total,
      periodo: (minD && maxD) ? [fmtD(minD), fmtD(maxD)] : null,
      motoristas: driverSet.size,
      veiculos: vehSet.size,
      months: sortedMonths,
    },
    kpis: {
      total,
      pct_positivo: +((clf['Positivo'] / t) * 100).toFixed(1),
      pct_falso: +((clf['Falso positivo'] / t) * 100).toFixed(1),
      pct_naoclass: +((clf['Não classificado'] / t) * 100).toFixed(1),
      pct_evidencia: (evidDisp + evidAguard) ? +((evidDisp / (evidDisp + evidAguard)) * 100).toFixed(1) : null,
      vel_mediana: velMed != null ? Math.round(velMed) : null,
      vel_media: velAll.length ? +(velAll.reduce((a, b) => a + b, 0) / velAll.length).toFixed(1) : null,
      pct_vel_alta: velCount ? +((velHigh / velCount) * 100).toFixed(1) : null,
      t_ini_mediana: treatStartDiffs.length ? +median(treatStartDiffs).toFixed(1) : null,
      t_fin_mediana: treatEndDiffs.length ? +median(treatEndDiffs).toFixed(1) : null,
    },
    mensal: { meses: sortedKeys, labels, valores, variacao },
    mensal_crit: { meses: sortedKeys, labels, series: critSeries },
    mensal_tipo: { meses: sortedKeys, labels, series: typeSeries },
    clf_total: clf,
    falso_mensal: { labels, pct: falsoPct },
    top_motoristas: topN(drivers, 15),
    top_placas: topN(plates, 15),
    frota: topN(fleets, 8),
    uf: { labels: ufSorted, valores: ufSorted.map((u) => ufs[u]) },
    hora: { horas: Array.from({ length: 24 }, (_, i) => i), valores: hora, valores_pos: horaPos },
    dow: { labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], valores: [dowArr[1], dowArr[2], dowArr[3], dowArr[4], dowArr[5], dowArr[6], dowArr[0]] },
    vel: { labels: velLabels, valores: velBuckets },
    evidencia: (evidDisp + evidAguard) ? { disp: evidDisp, aguard: evidAguard } : null,
    hasEvidence: idx.evidence > -1 && (evidDisp + evidAguard) > 0,
    categorias: categoryCounts,
    naoclass_reasons,
  };
}

function fmtD(d) {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
