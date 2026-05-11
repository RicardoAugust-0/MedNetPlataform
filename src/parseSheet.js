const INTERVENCAO_EVENTOS = ['Bocejo', 'Olho fechado', 'Distração Genérica'];
const TECNICO_CATS        = ['Obstrução de Câmera'];
const TECNICO_EVENTOS     = ['Perda de vídeo'];

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const TECNICO_CATS_NORM = TECNICO_CATS.map(normalize);
const TECNICO_EVENTOS_NORM = TECNICO_EVENTOS.map(normalize);
const INTERVENCAO_EVENTOS_NORM = INTERVENCAO_EVENTOS.map(normalize);

function parseTurno(horaStr) {
  if (!horaStr) return 'diurno';
  const parts = String(horaStr).split(' ');
  const timePart = parts[1] || parts[0];
  const hour = parseInt(timePart?.split(':')[0], 10);
  if (isNaN(hour)) return 'diurno';
  // Diurno 06–18h, Noturno 18–06h
  return (hour >= 6 && hour < 18) ? 'diurno' : 'noturno';
}

function maxSeveridade(severidades) {
  if (severidades.includes('Gravíssimo')) return 'Gravíssimo';
  if (severidades.includes('Grave'))      return 'Grave';
  return 'Normal';
}

// Aceita Date, número serial do Excel ou string "DD/MM/AAAA HH:MM[:SS]".
function parseEventDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const ms = (value - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const str = String(value).trim();
  let m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, dd, mm, yyRaw, h, mi, s] = m;
    const year = yyRaw.length === 2 ? 2000 + parseInt(yyRaw, 10) : parseInt(yyRaw, 10);
    return new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10), parseInt(h, 10), parseInt(mi, 10), parseInt(s || '0', 10));
  }
  m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const [, dd, mm, yyRaw] = m;
    const year = yyRaw.length === 2 ? 2000 + parseInt(yyRaw, 10) : parseInt(yyRaw, 10);
    return new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10));
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// Constrói índice de "última ação que limpou alerta" por placa.
// intervencao e descarte limpam alertas de intervenção; reportar limpa alertas reportáveis.
function buildClearMap(history) {
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

export async function parseSheetFile(file, history = []) {
  const XLSX = await import('xlsx');
  const clearMap = buildClearMap(history);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);

        // Remove falsos positivos
        const valid = rows.filter(r => r['Status'] !== 'Falso positivo');

        // Agrupar por Placa
        const byPlaca = {};
        valid.forEach(r => {
          const placa = r['Placa'];
          if (!placa) return;
          if (!byPlaca[placa]) {
            byPlaca[placa] = {
              nome:            '',
              placa,
              transportadora:  r['Transportadora'] || '—',
              frota:           '',
              eventos:         [],
              turnos:          [],
            };
          }
          const entry = byPlaca[placa];
          if (entry.nome === '' && r['Motorista'] && r['Motorista'] !== '-') {
            entry.nome = r['Motorista'];
          }
          if (entry.frota === '' && r['Frota']) {
            entry.frota = String(r['Frota']);
          }
          entry.eventos.push({
            ...r,
            _eventoNorm: normalize(r['Evento']),
            _categoriaNorm: normalize(r['Categoria']),
            _eventDate: parseEventDate(r['Hora do evento']),
          });
          entry.turnos.push(parseTurno(r['Hora do evento']));
        });

        let filtradosPorHistorico = 0;

        // Montar objetos de motorista
        const drivers = Object.values(byPlaca).map(d => {
          const isIntervencao = e => INTERVENCAO_EVENTOS_NORM.includes(e._eventoNorm);
          const isTecnico     = e => {
            const byCategoria = TECNICO_CATS_NORM.includes(e._categoriaNorm);
            const byEvento = TECNICO_EVENTOS_NORM.includes(e._eventoNorm);
            return byCategoria || byEvento;
          };
          const isReportar    = e => !isIntervencao(e) && !isTecnico(e);

          const clear = clearMap[d.placa] || {};
          // Eventos sem data parseável são mantidos (postura conservadora).
          const isAfter = (e, clearAt) => !clearAt || !e._eventDate || e._eventDate > clearAt;

          const evIntervencaoRaw = d.eventos.filter(isIntervencao);
          const evIntervencao    = evIntervencaoRaw.filter(e => isAfter(e, clear.lastIntervencao));
          filtradosPorHistorico += evIntervencaoRaw.length - evIntervencao.length;

          const evReportarRaw = d.eventos.filter(isReportar);
          const evReportar    = evReportarRaw.filter(e => isAfter(e, clear.lastReportar));
          filtradosPorHistorico += evReportarRaw.length - evReportar.length;

          const evTecnico     = d.eventos.filter(isTecnico);

          const tiposIntervencao = [...new Set(evIntervencao.map(e => e['Evento']))];
          const tiposReportar    = [...new Set(evReportar.map(e => e['Evento']))];

          const severidadeMax = maxSeveridade(
            [...evIntervencao, ...evReportar].map(e => e['Severidade'])
          );

          // Turno predominante
          const turnoCount = {};
          d.turnos.forEach(t => { turnoCount[t] = (turnoCount[t] || 0) + 1; });
          const turno = Object.entries(turnoCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'diurno';

          return {
            nome:            d.nome || d.placa,
            placa:           d.placa,
            transportadora:  d.transportadora,
            frota:           d.frota,
            turno,
            // Intervenção (Bocejo + Olho fechado)
            alertas:         evIntervencao.length,
            tipos:           tiposIntervencao,
            // Reportar à empresa
            reportaveis:     evReportar.length,
            tiposReportar,
            // Técnicos (Obstrução de Câmera + Perda de vídeo)
            tecnicos:        evTecnico.length,
            severidade:      severidadeMax,
            intervencoes:    0,
          };
        });

        const stats = {
          total:            drivers.length,
          comIntervencao:   drivers.filter(d => d.alertas > 0).length,
          soReportar:       drivers.filter(d => d.alertas === 0 && d.reportaveis > 0).length,
          soTecnico:        drivers.filter(d => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0).length,
          totalEventos:     valid.length,
          falsosPositivos:  rows.length - valid.length,
          filtradosPorHistorico,
        };

        resolve({ drivers, stats });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
