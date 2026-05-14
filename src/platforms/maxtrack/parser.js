// Parser da resposta JSON da API Maxtrack.
//
// Diferente da Sascar (que recebe um File xlsx), este parser recebe o objeto
// JSON já desserializado devolvido pela Edge Function `pull-maxtrack`.
//
// Regras aplicadas (mesma filosofia da Sascar):
//   1. Velocidade < MIN_MOVING_SPEED_KMH → ignorado
//   2. Agrupamento por `identifier` (placa)
//   3. Classificação em INTERVENÇÃO / TÉCNICO / REPORTAR
//   4. Filtro de histórico via buildClearMap / isAfterClear
//   5. Severidade máxima e turno predominante

import { normalize } from '../shared/normalize.js';
import { parseSpeed, parseTurno, maxSeveridade } from '../shared/parsers.js';
import { buildClearMap, isAfterClear } from '../shared/history.js';
import { emptyDriver, emptyStats } from '../base.js';
import {
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

// Recebe o objeto { events: [...] } retornado pela Edge Function + contexto { history }.
export function parseApiResponse(apiData, { history = [] } = {}) {
  const clearMap = buildClearMap(history);
  const events   = apiData?.events || [];

  let filtradosPorVelocidade = 0;

  const valid = events.filter((ev) => {
    const speed = parseSpeed(ev.speed);
    if (speed !== null && speed < MIN_MOVING_SPEED_KMH) {
      filtradosPorVelocidade++;
      return false;
    }
    return true;
  });

  // Agrupa por placa (identifier)
  const byPlaca = {};
  valid.forEach((ev) => {
    const placa = ev.identifier;
    if (!placa) return;

    if (!byPlaca[placa]) {
      byPlaca[placa] = {
        placa,
        nome:           null,
        transportadora: ev.company?.name || '—',
        frota:          String(ev.fleetId || ''),
        eventos:        [],
        turnos:         [],
      };
    }

    const entry = byPlaca[placa];
    // Usa primeiro nome não-nulo encontrado
    if (!entry.nome && ev.driver?.name) entry.nome = ev.driver.name;

    // startDate na API é Unix timestamp em segundos
    const eventDate = ev.startDate ? new Date(ev.startDate * 1000) : null;
    const nomeEvento = ev.event?.name || '';

    entry.eventos.push({
      _nome:       nomeEvento,
      _nomeNorm:   normalize(nomeEvento),
      _severidade: mapSeveridade(ev.event?.criticalityLevel?.name),
      _eventDate:  eventDate,
    });

    entry.turnos.push(eventDate ? parseTurno(eventDate) : 'diurno');
  });

  let filtradosPorHistorico = 0;

  const drivers = Object.values(byPlaca).map((d) => {
    const isIntervencao = (e) => INTERVENCAO_NORM.includes(e._nomeNorm);
    const isTecnico     = (e) => TECNICO_NORM.includes(e._nomeNorm);
    const isReportar    = (e) => !isIntervencao(e) && !isTecnico(e);

    const clear = clearMap[d.placa] || {};

    const evIntervencaoRaw = d.eventos.filter(isIntervencao);
    const evIntervencao    = evIntervencaoRaw.filter((e) => isAfterClear(e._eventDate, clear.lastIntervencao));
    filtradosPorHistorico += evIntervencaoRaw.length - evIntervencao.length;

    const evReportarRaw = d.eventos.filter(isReportar);
    const evReportar    = evReportarRaw.filter((e) => isAfterClear(e._eventDate, clear.lastReportar));
    filtradosPorHistorico += evReportarRaw.length - evReportar.length;

    const evTecnico = d.eventos.filter(isTecnico);

    const tiposIntervencao = [...new Set(evIntervencao.map((e) => e._nome))];
    const tiposReportar    = [...new Set(evReportar.map((e) => e._nome))];

    const tiposTecnico = {};
    evTecnico.forEach((e) => {
      tiposTecnico[e._nome] = (tiposTecnico[e._nome] || 0) + 1;
    });

    const datesIntervencao = evIntervencao.map((e) => e._eventDate).filter(Boolean);
    const datesReportar    = evReportar.map((e) => e._eventDate).filter(Boolean);

    const ultimoEvento = datesIntervencao.length
      ? new Date(Math.max(...datesIntervencao.map((dt) => dt.getTime()))) : null;
    const ultimoEventoReportar = datesReportar.length
      ? new Date(Math.max(...datesReportar.map((dt) => dt.getTime()))) : null;

    const severidadeMax = maxSeveridade(
      [...evIntervencao, ...evReportar].map((e) => e._severidade),
    );

    const turnoCount = {};
    d.turnos.forEach((t) => { turnoCount[t] = (turnoCount[t] || 0) + 1; });
    const turno = Object.entries(turnoCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'diurno';

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
    };
  });

  const stats = {
    ...emptyStats(),
    total:                  drivers.length,
    comIntervencao:         drivers.filter((d) => d.alertas > 0).length,
    soReportar:             drivers.filter((d) => d.alertas === 0 && d.reportaveis > 0).length,
    soTecnico:              drivers.filter((d) => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0).length,
    totalEventos:           valid.length,
    filtradosPorVelocidade,
    filtradosPorHistorico,
  };

  return { drivers, stats };
}
