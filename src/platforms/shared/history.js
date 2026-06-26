// Filtro de eventos com base no histórico de atendimentos.
// Esta lógica é PLATFORM-AGNOSTIC: qualquer plataforma que produza eventos
// associados a uma placa pode usar este filtro para descartar eventos antigos
// que já foram tratados anteriormente.

// Constrói o índice "última ação que limpou alerta" por placa.
//
// Regras:
// - "intervencao" e "descarte" limpam alertas de intervenção
// - "reportar" limpa alertas reportáveis
// - Eventos sem data parseável são MANTIDOS (postura conservadora — preferimos
//   mostrar duplicado a esconder algo legítimo)
//
// Entrada: array de atendimentos com { placa, created_at, tipo }
// Saída: { [placa]: { lastIntervencao?: Date, lastReportar?: Date } }
export function buildClearMap(history) {
  const map = {};
  for (const h of history || []) {
    if (!h.placa || !h.created_at) continue;
    const at = new Date(h.created_at);
    if (isNaN(at.getTime())) continue;

    // Se houver bucket específico, usa. Senão cai no fallback legado
    const bucket = h.bucket;
    const clearsIntervencao = bucket ? (bucket === 'intervencao') : (h.tipo === 'intervencao' || h.tipo === 'descarte');
    const clearsReportar    = bucket ? (bucket === 'reportar')    : (h.tipo === 'reportar');
    const clearsTecnico     = bucket ? (bucket === 'tecnico')     : false;

    if (!clearsIntervencao && !clearsReportar && !clearsTecnico) continue;
    if (!map[h.placa]) map[h.placa] = {};
    const entry = map[h.placa];
    if (clearsIntervencao && (!entry.lastIntervencao || at > entry.lastIntervencao)) entry.lastIntervencao = at;
    if (clearsReportar    && (!entry.lastReportar    || at > entry.lastReportar))    entry.lastReportar    = at;
    if (clearsTecnico     && (!entry.lastTecnico     || at > entry.lastTecnico))     entry.lastTecnico     = at;
  }
  return map;
}

// Devolve true se o evento ocorre DEPOIS da última ação registrada para a placa.
// Se não há data no evento (ou clearAt é null), devolve true (mantém o evento).
export function isAfterClear(eventDate, clearAt) {
  if (!clearAt) return true;
  if (!eventDate) return true;
  return eventDate > clearAt;
}

// Aplica o filtro de histórico sobre um array de drivers no formato canônico.
// Deve ser chamado pelo Monitor após receber dados de qualquer plataforma —
// os adaptadores NÃO devem mais fazer esse filtro internamente.
//
// Quando o driver tem eventosDetalhados, usa filtro granular (por evento individual).
// Quando não tem, usa filtro conservador (por bucket — zera o bucket se o evento
// mais recente for anterior ao último atendimento).
//
// Retorna { drivers, filtradosPorHistorico }.
export function applyHistoryFilter(drivers, history) {
  const clearMap = buildClearMap(history);
  let filtradosPorHistorico = 0;
  const maxTs = arr => {
    const times = arr.map(e => e.ts?.getTime()).filter(Boolean);
    return times.length ? new Date(Math.max(...times)) : null;
  };

  const filtered = drivers.map(d => {
    const clear = clearMap[d.placa] || {};
    let { alertas, tipos, ultimoEvento, reportaveis, tiposReportar, ultimoEventoReportar, tecnicos, tiposTecnico } = d;

    let eventosDetalhados = (d.eventosDetalhados || []).map(e => ({
      ...e, ts: e.ts ? new Date(e.ts) : null,
    }));

    if (eventosDetalhados.length > 0) {
      // Filtro granular: cada evento tem seu próprio timestamp
      const evI = eventosDetalhados.filter(e => e.bucket === 'intervencao' && isAfterClear(e.ts, clear.lastIntervencao));
      const evR = eventosDetalhados.filter(e => e.bucket === 'reportar'    && isAfterClear(e.ts, clear.lastReportar));
      const evT = eventosDetalhados.filter(e => e.bucket === 'tecnico'     && isAfterClear(e.ts, clear.lastTecnico));

      filtradosPorHistorico +=
        eventosDetalhados.filter(e => e.bucket === 'intervencao').length - evI.length +
        eventosDetalhados.filter(e => e.bucket === 'reportar').length    - evR.length +
        eventosDetalhados.filter(e => e.bucket === 'tecnico').length     - evT.length;

      alertas              = evI.length;
      tipos                = [...new Set(evI.map(e => e.tipo))];
      ultimoEvento         = maxTs(evI);
      reportaveis          = evR.length;
      tiposReportar        = [...new Set(evR.map(e => e.tipo))];
      ultimoEventoReportar = maxTs(evR);
      tecnicos             = evT.length;

      const nextTiposTecnico = {};
      evT.forEach(e => {
        const t = e.tipo || '—';
        nextTiposTecnico[t] = (nextTiposTecnico[t] || 0) + 1;
      });
      tiposTecnico = nextTiposTecnico;

      eventosDetalhados    = [...evI, ...evR, ...evT];
    } else {
      // Filtro conservador: usa o timestamp mais recente do bucket
      const uE  = ultimoEvento         ? new Date(ultimoEvento)         : null;
      const uER = ultimoEventoReportar  ? new Date(ultimoEventoReportar) : null;
      if (!isAfterClear(uE, clear.lastIntervencao)) {
        filtradosPorHistorico += alertas;
        alertas = 0; tipos = []; ultimoEvento = null;
      }
      if (!isAfterClear(uER, clear.lastReportar)) {
        filtradosPorHistorico += reportaveis;
        reportaveis = 0; tiposReportar = []; ultimoEventoReportar = null;
      }
      if (clear.lastTecnico) {
        filtradosPorHistorico += tecnicos;
        tecnicos = 0; tiposTecnico = {};
      }
    }

    return { ...d, alertas, tipos, ultimoEvento, reportaveis, tiposReportar, ultimoEventoReportar, tecnicos, tiposTecnico, eventosDetalhados };
  }).filter(d => d.alertas > 0 || d.reportaveis > 0 || d.tecnicos > 0);

  return { drivers: filtered, filtradosPorHistorico };
}
