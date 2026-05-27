// Parser de planilhas Maxtrack.
//
// Recebe um File (xlsx/xls/csv) + contexto { history } e devolve { drivers, stats }
// no formato canônico definido em ../base.js.
//
// Regras aplicadas:
//   1. Velocidade < MIN_MOVING_SPEED_KMH → ignorado
//   2. Agrupamento por Placa
//   3. Classificação em INTERVENÇÃO / TÉCNICO / REPORTAR
//   4. Filtro de histórico via buildClearMap / isAfterClear
//   5. Severidade máxima e turno predominante

import { normalize } from '../shared/normalize.js';
import { parseSpeed, parseEventDate, parseTurno, maxSeveridade } from '../shared/parsers.js';
import { buildClearMap, isAfterClear } from '../shared/history.js';
import { emptyDriver, emptyStats } from '../base.js';
import {
  COLUMNS,
  INTERVENCAO_EVENTOS,
  TECNICO_EVENTOS,
  MIN_MOVING_SPEED_KMH,
  SEV_MAP,
} from './columns.js';

const INTERVENCAO_NORM = INTERVENCAO_EVENTOS.map(normalize);
const TECNICO_NORM     = TECNICO_EVENTOS.map(normalize);

function mapSeveridade(raw) {
  return SEV_MAP[raw] || 'Normal';
}

// Detecta o índice de uma coluna pelo nome (case-insensitive, sem acentos).
function findCol(headers, colName) {
  const norm = normalize(colName);
  return headers.findIndex(h => normalize(h) === norm);
}

// Detecta se as headers da planilha batem com o formato Maxtrack.
export function detect({ fileName = '', headers = [] } = {}) {
  const norm = headers.map(normalize);
  const required = [COLUMNS.placa, COLUMNS.evento, COLUMNS.hora].map(normalize);
  const matches = required.filter(r => norm.includes(r)).length;
  let score = matches / required.length;
  if (/maxtrack/i.test(fileName)) score = Math.max(score, 0.8);
  if (norm.includes(normalize(COLUMNS.severidade))) score += 0.05;
  return Math.min(score, 1);
}

export async function parse(file, { history = [] } = {}) {
  const XLSX = await import('xlsx');

  const buf     = await file.arrayBuffer();
  const wb      = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet   = wb.Sheets[wb.SheetNames[0]];
  const rows    = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 2) return { drivers: [], stats: emptyStats() };

  const headers = rows[0].map(String);

  const iPlaca   = findCol(headers, COLUMNS.placa);
  const iNome    = findCol(headers, COLUMNS.motorista);
  const iTransp  = findCol(headers, COLUMNS.transportadora);
  const iFrota   = findCol(headers, COLUMNS.frota);
  const iEvento  = findCol(headers, COLUMNS.evento);
  const iSev     = findCol(headers, COLUMNS.severidade);
  const iHora    = findCol(headers, COLUMNS.hora);
  const iVel     = findCol(headers, COLUMNS.velocidade);

  const clearMap = buildClearMap(history);

  let filtradosPorVelocidade = 0;
  let filtradosPorHistorico  = 0;

  const byPlaca = {};

  for (const row of rows.slice(1)) {
    const placa = String(row[iPlaca] || '').trim();
    if (!placa) continue;

    const speed = iVel >= 0 ? parseSpeed(row[iVel]) : null;
    if (speed !== null && speed < MIN_MOVING_SPEED_KMH) {
      filtradosPorVelocidade++;
      continue;
    }

    const eventDate = iHora >= 0 ? parseEventDate(row[iHora]) : null;

    const clearAt = clearMap.get(placa);
    if (clearAt && eventDate && !isAfterClear(eventDate, clearAt)) {
      filtradosPorHistorico++;
      continue;
    }

    if (!byPlaca[placa]) {
      byPlaca[placa] = {
        placa,
        nome:           null,
        transportadora: iTransp >= 0 ? String(row[iTransp] || '').trim() || '—' : '—',
        frota:          iFrota  >= 0 ? String(row[iFrota]  || '').trim() : '',
        eventos:        [],
        turnos:         [],
      };
    }

    const entry = byPlaca[placa];
    if (!entry.nome && iNome >= 0 && row[iNome]) entry.nome = String(row[iNome]).trim();

    const nomeEvento  = iEvento >= 0 ? String(row[iEvento] || '').trim() : '';
    const sevRaw      = iSev    >= 0 ? String(row[iSev]    || '').trim() : '';

    entry.eventos.push({
      _nome:       nomeEvento,
      _nomeNorm:   normalize(nomeEvento),
      _severidade: mapSeveridade(sevRaw),
      _eventDate:  eventDate,
    });

    entry.turnos.push(eventDate ? parseTurno(eventDate) : 'diurno');
  }

  const drivers = Object.values(byPlaca).map(d => {
    const isIntervencao = e => INTERVENCAO_NORM.includes(e._nomeNorm);
    const isTecnico     = e => TECNICO_NORM.includes(e._nomeNorm);
    const isReportar    = e => !isIntervencao(e) && !isTecnico(e);

    const evIntervencao = d.eventos.filter(isIntervencao);
    const evReportar    = d.eventos.filter(isReportar);
    const evTecnico     = d.eventos.filter(isTecnico);

    const tiposIntervencao = [...new Set(evIntervencao.map(e => e._nome))];
    const tiposReportar    = [...new Set(evReportar.map(e => e._nome))];

    const tiposTecnico = {};
    evTecnico.forEach(e => { tiposTecnico[e._nome] = (tiposTecnico[e._nome] || 0) + 1; });

    const datesIntervencao = evIntervencao.map(e => e._eventDate).filter(Boolean);
    const datesReportar    = evReportar.map(e => e._eventDate).filter(Boolean);

    const ultimoEvento = datesIntervencao.length
      ? new Date(Math.max(...datesIntervencao.map(dt => dt.getTime()))) : null;
    const ultimoEventoReportar = datesReportar.length
      ? new Date(Math.max(...datesReportar.map(dt => dt.getTime()))) : null;

    const severidadeMax = maxSeveridade(
      [...evIntervencao, ...evReportar].map(e => e._severidade),
    );

    const turnoCount = {};
    d.turnos.forEach(t => { turnoCount[t] = (turnoCount[t] || 0) + 1; });
    const turno = Object.entries(turnoCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'diurno';

    const eventosDetalhados = [
      ...evIntervencao.map(e => ({ tipo: e._nome, bucket: 'intervencao', severidade: e._severidade, ts: e._eventDate })),
      ...evReportar.map(e    => ({ tipo: e._nome, bucket: 'reportar',    severidade: e._severidade, ts: e._eventDate })),
      ...evTecnico.map(e     => ({ tipo: e._nome, bucket: 'tecnico',     severidade: e._severidade, ts: e._eventDate })),
    ];

    return {
      ...emptyDriver(),
      nome:                 d.nome || d.placa,
      placa:                d.placa,
      transportadora:       d.transportadora,
      frota:                d.frota,
      turno,
      alertas:              evIntervencao.length,
      tipos:                tiposIntervencao,
      ultimoEvento,
      reportaveis:          evReportar.length,
      tiposReportar,
      ultimoEventoReportar,
      tecnicos:             evTecnico.length,
      tiposTecnico,
      severidade:           severidadeMax,
      eventosDetalhados,
    };
  });

  const stats = {
    ...emptyStats(),
    total:                  drivers.length,
    comIntervencao:         drivers.filter(d => d.alertas > 0).length,
    soReportar:             drivers.filter(d => d.alertas === 0 && d.reportaveis > 0).length,
    soTecnico:              drivers.filter(d => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0).length,
    totalEventos:           rows.slice(1).filter(r => String(r[iPlaca] || '').trim()).length,
    filtradosPorVelocidade,
    filtradosPorHistorico,
  };

  return { drivers, stats };
}
