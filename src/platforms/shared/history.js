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
    const clearsIntervencao = h.tipo === 'intervencao' || h.tipo === 'descarte';
    const clearsReportar    = h.tipo === 'reportar';
    if (!clearsIntervencao && !clearsReportar) continue;
    if (!map[h.placa]) map[h.placa] = {};
    const entry = map[h.placa];
    if (clearsIntervencao && (!entry.lastIntervencao || at > entry.lastIntervencao)) entry.lastIntervencao = at;
    if (clearsReportar    && (!entry.lastReportar    || at > entry.lastReportar))    entry.lastReportar    = at;
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
