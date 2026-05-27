// Parser de planilhas Maxtrack.
//
// Recebe um File (xlsx/xls/csv) + contexto { history } e devolve { drivers, stats }.
// Formato canônico definido em ../base.js.
//
// Regras aplicadas:
//   1. Velocidade < MIN_MOVING_SPEED_KMH → ignorado
//   2. Agrupamento por Placa
//   3. Classificação em INTERVENÇÃO / TÉCNICO / REPORTAR
//   4. Filtro de histórico via buildClearMap / isAfterClear
//   5. Severidade máxima e turno predominante
//
// Nota: exportações Maxtrack em CSV usam ponto-e-vírgula como delimitador.
// XLSX.read com { type: 'array' } não detecta isso; usamos { type: 'string', FS: ';' }.

import { normalize } from '../shared/normalize.js';
import { parseSpeed, parseEventDate, parseTurno, maxSeveridade } from '../shared/parsers.js';
import { buildClearMap, isAfterClear } from '../shared/history.js';
import { emptyDriver, emptyStats } from '../base.js';
import {
  COLUMNS,
  FINALIZADO_STATUS,
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

// Duração vem como "15.661 segundos" — extrai só o número.
function parseDuracao(raw) {
  if (raw == null || raw === '') return null;
  const n = parseFloat(String(raw).split(' ')[0]);
  return Number.isFinite(n) ? n : null;
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

  // Maxtrack CSV usa ponto-e-vírgula — XLSX precisa de { type: 'string', FS: ';' }.
  const isCSV = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  let wb;
  if (isCSV) {
    const text = await file.text();
    wb = XLSX.read(text, { type: 'string', FS: ';' });
  } else {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: 'array', cellDates: true });
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 2) return { drivers: [], stats: emptyStats() };

  const headers = rows[0].map(String);

  const iPlaca    = findCol(headers, COLUMNS.placa);
  const iNome     = findCol(headers, COLUMNS.motorista);
  const iCpf      = findCol(headers, COLUMNS.cpf);
  const iMatric   = findCol(headers, COLUMNS.matricula);
  const iTransp   = findCol(headers, COLUMNS.transportadora);
  const iFrota    = findCol(headers, COLUMNS.frota);
  const iEvento   = findCol(headers, COLUMNS.evento);
  const iDescricao= findCol(headers, COLUMNS.descricao);
  const iSev      = findCol(headers, COLUMNS.severidade);
  const iHora     = findCol(headers, COLUMNS.hora);
  const iVel      = findCol(headers, COLUMNS.velocidade);
  const iLocal    = findCol(headers, COLUMNS.localidade);
  const iDuracao  = findCol(headers, COLUMNS.duracao);
  const iAnalise  = findCol(headers, COLUMNS.analise_ia);
  const iIdEvento = findCol(headers, COLUMNS.id_evento);
  const iStatus   = findCol(headers, COLUMNS.status);

  const clearMap = buildClearMap(history);

  let filtradosPorVelocidade = 0;
  let filtradosPorHistorico  = 0;
  let totalFechados          = 0;

  const byPlaca = {};
  // Linhas brutas aprovadas no filtro — usadas pelo writer VPS para driver_events.
  const rawEventRows = [];

  for (const row of rows.slice(1)) {
    const placa = String(row[iPlaca] || '').trim();
    if (!placa) continue;

    const statusRaw = iStatus >= 0 ? String(row[iStatus] || '').trim() : '';
    const isFinalizado = FINALIZADO_STATUS.has(statusRaw);

    // Velocidade Maxtrack já vem em km/h (não dividir por 10).
    const speed = iVel >= 0 ? parseSpeed(row[iVel]) : null;
    const eventDate = iHora >= 0 ? parseEventDate(row[iHora]) : null;

    if (isFinalizado) {
      totalFechados++;

      const nomeEvento = iEvento  >= 0 ? String(row[iEvento]  || '').trim() : '';
      const sevRaw     = iSev     >= 0 ? String(row[iSev]     || '').trim() : '';
      const descricao  = iDescricao >= 0 ? String(row[iDescricao] || '').trim() : '';
      const localidade = iLocal   >= 0 ? String(row[iLocal]   || '').trim() : '';
      const analise    = iAnalise >= 0 ? String(row[iAnalise] || '').trim() : '';
      const idEvento   = iIdEvento >= 0 ? String(row[iIdEvento] || '').trim() : '';
      const duracao    = iDuracao >= 0 ? parseDuracao(row[iDuracao]) : null;

      const nomeNorm   = normalize(nomeEvento);
      const bucket     = INTERVENCAO_NORM.includes(nomeNorm) ? 'intervencao'
                       : TECNICO_NORM.includes(nomeNorm)     ? 'tecnico'
                       : 'reportar';

      const motoristaNome = iNome >= 0 && row[iNome] ? String(row[iNome]).trim() : null;
      const cpfVal = iCpf >= 0 && row[iCpf] ? String(row[iCpf]).trim() : null;
      const matriculaVal = iMatric >= 0 && row[iMatric] ? String(row[iMatric]).trim() : null;
      const transportadoraVal = iTransp >= 0 ? String(row[iTransp] || '').trim() || '—' : '—';
      const frotaVal = iFrota >= 0 ? String(row[iFrota] || '').trim() : '';

      rawEventRows.push({
        platform_id:          'maxtrack',
        placa,
        nome:                 motoristaNome,
        cpf:                  cpfVal,
        matricula:            matriculaVal,
        transportadora:       transportadoraVal,
        frota:                frotaVal,
        nome_evento:          nomeEvento,
        descricao:            descricao || null,
        categoria_bucket:     bucket,
        severidade:           mapSeveridade(sevRaw),
        turno:                eventDate ? parseTurno(eventDate) : 'diurno',
        localidade:           localidade || null,
        velocidade_kmh:       speed,
        duracao_seg:          duracao,
        analise_ia_plataforma: analise || null,
        raw_event_type_id:    idEvento || null,
        ocorrido_em:          eventDate ? eventDate.toISOString() : null,
      });

      continue;
    }

    if (speed !== null && speed < MIN_MOVING_SPEED_KMH) {
      filtradosPorVelocidade++;
      continue;
    }

    const clearAt = clearMap[placa];
    if (clearAt && eventDate && !isAfterClear(eventDate, clearAt)) {
      filtradosPorHistorico++;
      continue;
    }

    if (!byPlaca[placa]) {
      byPlaca[placa] = {
        placa,
        nome:           null,
        cpf:            null,
        matricula:      null,
        transportadora: iTransp >= 0 ? String(row[iTransp] || '').trim() || '—' : '—',
        frota:          iFrota  >= 0 ? String(row[iFrota]  || '').trim() : '',
        eventos:        [],
        turnos:         [],
      };
    }

    const entry = byPlaca[placa];
    if (!entry.nome      && iNome   >= 0 && row[iNome])   entry.nome      = String(row[iNome]).trim();
    if (!entry.cpf       && iCpf    >= 0 && row[iCpf])    entry.cpf       = String(row[iCpf]).trim();
    if (!entry.matricula && iMatric >= 0 && row[iMatric]) entry.matricula = String(row[iMatric]).trim();

    const nomeEvento = iEvento  >= 0 ? String(row[iEvento]  || '').trim() : '';
    const sevRaw     = iSev     >= 0 ? String(row[iSev]     || '').trim() : '';
    const descricao  = iDescricao >= 0 ? String(row[iDescricao] || '').trim() : '';
    const localidade = iLocal   >= 0 ? String(row[iLocal]   || '').trim() : '';
    const analise    = iAnalise >= 0 ? String(row[iAnalise] || '').trim() : '';
    const idEvento   = iIdEvento >= 0 ? String(row[iIdEvento] || '').trim() : '';
    const duracao    = iDuracao >= 0 ? parseDuracao(row[iDuracao]) : null;

    const nomeNorm   = normalize(nomeEvento);
    const bucket     = INTERVENCAO_NORM.includes(nomeNorm) ? 'intervencao'
                     : TECNICO_NORM.includes(nomeNorm)     ? 'tecnico'
                     : 'reportar';

    entry.eventos.push({
      _nome:       nomeEvento,
      _nomeNorm:   nomeNorm,
      _severidade: mapSeveridade(sevRaw),
      _eventDate:  eventDate,
    });

    entry.turnos.push(eventDate ? parseTurno(eventDate) : 'diurno');

    // Linha bruta para ingestão no driver_events (VPS writer).
    rawEventRows.push({
      platform_id:          'maxtrack',
      placa,
      nome:                 entry.nome,
      cpf:                  entry.cpf,
      matricula:            entry.matricula,
      transportadora:       entry.transportadora,
      frota:                entry.frota,
      nome_evento:          nomeEvento,
      descricao:            descricao || null,
      categoria_bucket:     bucket,
      severidade:           mapSeveridade(sevRaw),
      turno:                eventDate ? parseTurno(eventDate) : 'diurno',
      localidade:           localidade || null,
      velocidade_kmh:       speed,
      duracao_seg:          duracao,
      analise_ia_plataforma: analise || null,
      raw_event_type_id:    idEvento || null,
      ocorrido_em:          eventDate ? eventDate.toISOString() : null,
    });
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
    totalFechados,
  };

  return { drivers, stats, rawEventRows };
}
