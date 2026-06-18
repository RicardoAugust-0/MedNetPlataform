// Parser de planilhas OmniLink.
//
// Recebe um File (xlsx/xls/csv) + contexto { history } e devolve { drivers, stats }.
// Formato canônico definido em ../base.js.

import { normalize } from '../shared/normalize.js';
import { parseSpeed, parseEventDate, parseTurno, maxSeveridade } from '../shared/parsers.js';
import { emptyDriver, emptyStats } from '../base.js';
import {
  COLUMNS,
  INTERVENCAO_EVENTOS,
  TECNICO_EVENTOS,
  MIN_MOVING_SPEED_KMH,
} from './columns.js';

const INTERVENCAO_NORM = INTERVENCAO_EVENTOS.map(normalize);
const TECNICO_NORM     = TECNICO_EVENTOS.map(normalize);

// Classifica o evento em um dos três buckets
function getEventBucket(eventName) {
  const norm = normalize(eventName);
  if (INTERVENCAO_NORM.some(x => norm.includes(x)) || norm.includes('fadiga') || norm.includes('sono') || norm.includes('bocejo')) {
    return 'intervencao';
  }
  if (TECNICO_NORM.some(x => norm.includes(x)) || norm.includes('obstru') || norm.includes('video') || norm.includes('camera') || norm.includes('ausencia')) {
    return 'tecnico';
  }
  return 'reportar';
}

// Determina a severidade com base no evento
function getEventSeverity(eventName) {
  const bucket = getEventBucket(eventName);
  if (bucket === 'intervencao') {
    const norm = normalize(eventName);
    if (norm.includes('extrema') || norm.includes('fechado') || norm.includes('micro') || norm.includes('dormindo') || norm.includes('sono')) {
      return 'Gravíssimo';
    }
    return 'Grave';
  }
  return 'Normal';
}

// Detecta se as headers da planilha batem com o formato OmniLink.
export function detect({ fileName = '', headers = [] } = {}) {
  const norm = headers.map(normalize);
  const required = [COLUMNS.placa, COLUMNS.evento, COLUMNS.hora].map(normalize);
  const matches = required.filter((r) => norm.includes(r)).length;
  let score = matches / required.length; // 0..1

  if (norm.includes(normalize(COLUMNS.transportadora))) score += 0.05;
  if (norm.includes(normalize(COLUMNS.velocidade)))     score += 0.05;
  if (/omnilink|omni.?link/i.test(fileName)) score += 0.1;
  return Math.min(1, score);
}

export async function parse(file) {
  const XLSX = await import('xlsx');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);

        // Localiza a coluna de velocidade
        const speedColumnRow = rows.find((row) =>
          Object.keys(row || {}).some((key) => normalize(key).includes('velocidade'))
        );
        const speedColumn = speedColumnRow
          ? Object.keys(speedColumnRow).find((key) => normalize(key).includes('velocidade'))
          : null;

        let falsosPositivos       = 0;
        let filtradosPorVelocidade = 0;

        const valid = rows.filter((r) => {
          // Descartar falsos positivos ou descartados com base no status do OmniLink
          const statusRaw = String(r[COLUMNS.status] || '').toLowerCase();
          if (statusRaw.includes('falso positivo') || statusRaw.includes('descartado')) {
            falsosPositivos += 1;
            return false;
          }
          // Filtrar por tratamento exclusivo pelo usuário hevilyntfzero@gmail.com
          const tratadoPorRaw = String(r[COLUMNS.tratadoPor] || '').trim().toLowerCase();
          if (tratadoPorRaw !== 'hevilyntfzero@gmail.com') {
            return false;
          }
          // Filtrar por velocidade mínima em movimento
          if (speedColumn) {
            const velocidade = parseSpeed(r[speedColumn]);
            if (velocidade !== null && velocidade < MIN_MOVING_SPEED_KMH) {
              filtradosPorVelocidade += 1;
              return false;
            }
          }
          return true;
        });

        // Agrupa eventos por placa
        const byPlaca = {};
        valid.forEach((r) => {
          const placa = String(r[COLUMNS.placa] || '').trim();
          if (!placa) return;

          if (!byPlaca[placa]) {
            byPlaca[placa] = {
              nome:           '',
              placa,
              transportadora: r[COLUMNS.transportadora] || '—',
              frota:          '',
              eventos:        [],
              turnos:         [],
            };
          }
          const entry = byPlaca[placa];
          if (entry.nome === '' && r[COLUMNS.motorista] && r[COLUMNS.motorista] !== '-') {
            entry.nome = String(r[COLUMNS.motorista]).trim();
          }
          entry.eventos.push({
            ...r,
            _eventoNorm:    normalize(r[COLUMNS.evento]),
            _eventDate:     parseEventDate(r[COLUMNS.hora]),
          });
          entry.turnos.push(parseTurno(r[COLUMNS.hora]));
        });

        const drivers = Object.values(byPlaca).map((d) => {
          const evIntervencao = d.eventos.filter(e => getEventBucket(e[COLUMNS.evento]) === 'intervencao');
          const evReportar    = d.eventos.filter(e => getEventBucket(e[COLUMNS.evento]) === 'reportar');
          const evTecnico     = d.eventos.filter(e => getEventBucket(e[COLUMNS.evento]) === 'tecnico');

          const tiposIntervencao = [...new Set(evIntervencao.map((e) => e[COLUMNS.evento]))];
          const tiposReportar    = [...new Set(evReportar.map((e) => e[COLUMNS.evento]))];

          const tiposTecnico = {};
          evTecnico.forEach((e) => {
            const tipo = e[COLUMNS.evento] || '—';
            tiposTecnico[tipo] = (tiposTecnico[tipo] || 0) + 1;
          });

          const evIntervencaoDates = evIntervencao.map((e) => e._eventDate).filter(Boolean);
          const evReportarDates    = evReportar.map((e) => e._eventDate).filter(Boolean);
          const ultimoEvento       = evIntervencaoDates.length > 0
            ? new Date(Math.max(...evIntervencaoDates.map((dt) => dt.getTime()))) : null;
          const ultimoEventoReportar = evReportarDates.length > 0
            ? new Date(Math.max(...evReportarDates.map((dt) => dt.getTime()))) : null;

          const severidadeMax = maxSeveridade(
            [...evIntervencao, ...evReportar].map((e) => getEventSeverity(e[COLUMNS.evento]))
          );

          const turnoCount = {};
          d.turnos.forEach((t) => { turnoCount[t] = (turnoCount[t] || 0) + 1; });
          const turno = Object.entries(turnoCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'diurno';

          const eventosDetalhados = [
            ...evIntervencao.map(e => ({ tipo: e[COLUMNS.evento] || '—', bucket: 'intervencao', severidade: getEventSeverity(e[COLUMNS.evento]), ts: e._eventDate })),
            ...evReportar.map(e    => ({ tipo: e[COLUMNS.evento] || '—', bucket: 'reportar',    severidade: getEventSeverity(e[COLUMNS.evento]), ts: e._eventDate })),
            ...evTecnico.map(e     => ({ tipo: e[COLUMNS.evento] || '—', bucket: 'tecnico',     severidade: getEventSeverity(e[COLUMNS.evento]), ts: e._eventDate })),
          ];

          return {
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
            intervencoes:         0,
            eventosDetalhados,
          };
        });

        const rawEventRows = [];
        valid.forEach((r) => {
          const placa = String(r[COLUMNS.placa] || '').trim();
          if (!placa) return;

          let speed = null;
          if (speedColumn) {
            speed = parseSpeed(r[speedColumn]);
          }

          const eventDate = parseEventDate(r[COLUMNS.hora]);
          const ocorrido_em = eventDate ? eventDate.toISOString() : null;

          const nomeEvento = r[COLUMNS.evento] || '';
          const bucket = getEventBucket(nomeEvento);
          const severidade = getEventSeverity(nomeEvento);

          rawEventRows.push({
            platform_id:          'omnilink',
            placa,
            nome:                 (r[COLUMNS.motorista] && r[COLUMNS.motorista] !== '-') ? String(r[COLUMNS.motorista]).trim() : null,
            cpf:                  null,
            matricula:            null,
            transportadora:       r[COLUMNS.transportadora] || '—',
            frota:                null,
            nome_evento:          nomeEvento,
            descricao:            null,
            categoria_bucket:     bucket,
            severidade,
            turno:                parseTurno(r[COLUMNS.hora]) || 'diurno',
            localidade:           r[COLUMNS.localidade] ? String(r[COLUMNS.localidade]).trim() : null,
            velocidade_kmh:       speed,
            duracao_seg:          null,
            analise_ia_plataforma: null,
            raw_event_type_id:    null,
            ocorrido_em,
          });
        });

        const stats = {
          total:                  drivers.length,
          comIntervencao:         drivers.filter((d) => d.alertas > 0).length,
          soReportar:             drivers.filter((d) => d.alertas === 0 && d.reportaveis > 0).length,
          soTecnico:              drivers.filter((d) => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0).length,
          totalEventos:           valid.length,
          falsosPositivos,
          filtradosPorVelocidade,
          filtradosPorHistorico:  0,
          autoDescartes:          [],
        };

        resolve({ drivers, stats, rawEventRows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
