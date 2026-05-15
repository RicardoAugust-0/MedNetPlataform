// Parser de planilhas Sascar.
//
// Recebe um File (xlsx/xls/csv) + contexto { history } e devolve { drivers, stats }
// no formato canônico definido em ../base.js.
//
// Regras de negócio aplicadas (em ordem):
//   1. Linhas com Status="Falso positivo" são removidas (contabilizadas em stats.falsosPositivos)
//   2. Linhas com velocidade < MIN_MOVING_SPEED_KMH são removidas (stats.filtradosPorVelocidade)
//   3. Eventos são agrupados por Placa
//   4. Para cada placa, eventos são classificados em três buckets:
//        - INTERVENÇÃO: Bocejo, Olho fechado, Distração Genérica
//        - TÉCNICO:     Obstrução de Câmera, Perda de vídeo, Sem motorista
//        - REPORTAR:    todo o resto
//   5. Eventos anteriores à última ação (intervencao/descarte/reportar) registrada
//      no histórico são filtrados (stats.filtradosPorHistorico)
//   6. Para transportadoras na lista DINON_CARRIERS_NORM, eventos de fumo são
//      auto-descartados (stats.autoDescartes) — o Monitor registra um atendimento
//      tipo "descarte" silencioso no banco.
//   7. Severidade do motorista = max(Gravíssimo, Grave, Normal) entre eventos
//      de intervenção + reportar (técnicos não contam).
//   8. Turno predominante = mais frequente entre os eventos.

import { normalize, containsAll } from '../shared/normalize.js';
import { parseSpeed, parseEventDate, parseTurno, maxSeveridade } from '../shared/parsers.js';
import { buildClearMap, isAfterClear } from '../shared/history.js';
import {
  COLUMNS,
  INTERVENCAO_EVENTOS,
  TECNICO_CATS,
  TECNICO_EVENTOS,
  MIN_MOVING_SPEED_KMH,
  DINON_CARRIERS_NORM,
  STATUS_FALSO_POSITIVO,
} from './columns.js';

const TECNICO_CATS_NORM        = TECNICO_CATS.map(normalize);
const TECNICO_EVENTOS_NORM     = TECNICO_EVENTOS.map(normalize);
const INTERVENCAO_EVENTOS_NORM = INTERVENCAO_EVENTOS.map(normalize);

// "Distração Genérica" pode aparecer no campo Evento ou Categoria, com variações
// de caixa/acento. Detectamos qualquer combo que contenha ambos os tokens.
function isDistracaoGenerica(e) {
  const combo = `${e._eventoNorm || ''} ${e._categoriaNorm || ''}`;
  return containsAll(combo, ['distracao', 'generica']);
}

function isFumoEvento(e) {
  // Sascar pode emitir como "Fumando" (gerúndio) ou "Fumo" — ambos têm o radical "fum".
  return /\bfum(o|ando|ante|ar)\b/.test(e._eventoNorm) ||
         /\bfum(o|ando|ante|ar)\b/.test(e._categoriaNorm);
}

// Detecta se as headers da planilha batem com o formato Sascar.
// Devolve um score 0..1 (1 = altíssima confiança).
export function detect({ fileName = '', headers = [] } = {}) {
  const norm = headers.map(normalize);
  const required = [COLUMNS.placa, COLUMNS.evento, COLUMNS.hora].map(normalize);
  const matches = required.filter((r) => norm.includes(r)).length;
  let score = matches / required.length; // 0..1
  // Reforço por palavras-chave nas headers
  if (norm.includes(normalize(COLUMNS.transportadora))) score += 0.05;
  if (norm.includes(normalize(COLUMNS.severidade)))     score += 0.05;
  // Reforço por nome de arquivo (Sascar costuma exportar "DetalhesDeEvento_...")
  if (/sascar|detalhes.?de.?evento|smart.?camera/i.test(fileName)) score += 0.1;
  return Math.min(1, score);
}

export async function parse(file, { history = [] } = {}) {
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

        // Localiza coluna de velocidade (nomes variam — buscamos qualquer header
        // que contenha "velocidade").
        const speedColumnRow = rows.find((row) =>
          Object.keys(row || {}).some((key) => normalize(key).includes('velocidade'))
        );
        const speedColumn = speedColumnRow
          ? Object.keys(speedColumnRow).find((key) => normalize(key).includes('velocidade'))
          : null;

        let falsosPositivos       = 0;
        let filtradosPorVelocidade = 0;

        const valid = rows.filter((r) => {
          if (r[COLUMNS.status] === STATUS_FALSO_POSITIVO) {
            falsosPositivos += 1;
            return false;
          }
          if (speedColumn) {
            const velocidade = parseSpeed(r[speedColumn]);
            if (velocidade !== null && velocidade < MIN_MOVING_SPEED_KMH) {
              filtradosPorVelocidade += 1;
              return false;
            }
          }
          return true;
        });

        // Agrupa por placa
        const byPlaca = {};
        valid.forEach((r) => {
          const placa = r[COLUMNS.placa];
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
            entry.nome = r[COLUMNS.motorista];
          }
          if (entry.frota === '' && r[COLUMNS.frota]) {
            entry.frota = String(r[COLUMNS.frota]);
          }
          entry.eventos.push({
            ...r,
            _eventoNorm:    normalize(r[COLUMNS.evento]),
            _categoriaNorm: normalize(r[COLUMNS.categoria]),
            _eventDate:     parseEventDate(r[COLUMNS.hora]),
          });
          entry.turnos.push(parseTurno(r[COLUMNS.hora]));
        });

        let filtradosPorHistorico = 0;
        const autoDescartes = [];

        const drivers = Object.values(byPlaca).map((d) => {
          const isIntervencao = (e) =>
            INTERVENCAO_EVENTOS_NORM.includes(e._eventoNorm) || isDistracaoGenerica(e);
          const isTecnico = (e) =>
            TECNICO_CATS_NORM.includes(e._categoriaNorm) ||
            TECNICO_EVENTOS_NORM.includes(e._eventoNorm);
          const isReportar = (e) => !isIntervencao(e) && !isTecnico(e);

          const clear = clearMap[d.placa] || {};

          const evIntervencaoRaw = d.eventos.filter(isIntervencao);
          const evIntervencao    = evIntervencaoRaw.filter((e) => isAfterClear(e._eventDate, clear.lastIntervencao));
          filtradosPorHistorico += evIntervencaoRaw.length - evIntervencao.length;

          const evReportarRaw = d.eventos.filter(isReportar);
          const evReportar    = evReportarRaw.filter((e) => isAfterClear(e._eventDate, clear.lastReportar));
          filtradosPorHistorico += evReportarRaw.length - evReportar.length;

          const evTecnico = d.eventos.filter(isTecnico);

          // Regra Dinon: eventos de fumo são auto-descartados.
          const transportadoraNorm = normalize(d.transportadora);
          const isDinonCarrier     = DINON_CARRIERS_NORM.some((n) => transportadoraNorm.includes(n));
          const evReportarAutoDesc = isDinonCarrier ? evReportar.filter(isFumoEvento) : [];
          const evReportarFinal    = isDinonCarrier ? evReportar.filter((e) => !isFumoEvento(e)) : evReportar;

          const tiposIntervencao = [...new Set(evIntervencao.map((e) => e[COLUMNS.evento]))];
          const tiposReportar    = [...new Set(evReportarFinal.map((e) => e[COLUMNS.evento]))];

          const tiposTecnico = {};
          evTecnico.forEach((e) => {
            const tipo = e[COLUMNS.evento] || '—';
            tiposTecnico[tipo] = (tiposTecnico[tipo] || 0) + 1;
          });

          const evIntervencaoDates  = evIntervencao.map((e) => e._eventDate).filter(Boolean);
          const evReportarDates     = evReportarFinal.map((e) => e._eventDate).filter(Boolean);
          const ultimoEvento        = evIntervencaoDates.length > 0
            ? new Date(Math.max(...evIntervencaoDates.map((dt) => dt.getTime()))) : null;
          const ultimoEventoReportar = evReportarDates.length > 0
            ? new Date(Math.max(...evReportarDates.map((dt) => dt.getTime()))) : null;

          const severidadeMax = maxSeveridade(
            [...evIntervencao, ...evReportarFinal].map((e) => e[COLUMNS.severidade])
          );

          // Turno predominante
          const turnoCount = {};
          d.turnos.forEach((t) => { turnoCount[t] = (turnoCount[t] || 0) + 1; });
          const turno = Object.entries(turnoCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'diurno';

          if (evReportarAutoDesc.length > 0) {
            autoDescartes.push({
              nome:           d.nome || d.placa,
              placa:          d.placa,
              transportadora: d.transportadora,
              count:          evReportarAutoDesc.length,
              motivo:         'Regra Dinon · eventos de fumo',
            });
          }

          const eventosDetalhados = [
            ...evIntervencao.map(e  => ({ tipo: e[COLUMNS.evento] || '—', bucket: 'intervencao', severidade: e[COLUMNS.severidade] || '', ts: e._eventDate })),
            ...evReportarFinal.map(e => ({ tipo: e[COLUMNS.evento] || '—', bucket: 'reportar',    severidade: e[COLUMNS.severidade] || '', ts: e._eventDate })),
            ...evTecnico.map(e       => ({ tipo: e[COLUMNS.evento] || '—', bucket: 'tecnico',     severidade: e[COLUMNS.severidade] || '', ts: e._eventDate })),
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
            reportaveis:          evReportarFinal.length,
            tiposReportar,
            ultimoEventoReportar,
            tecnicos:             evTecnico.length,
            tiposTecnico,
            severidade:           severidadeMax,
            intervencoes:         0,
            eventosDetalhados,
          };
        });

        const stats = {
          total:                  drivers.length,
          comIntervencao:         drivers.filter((d) => d.alertas > 0).length,
          soReportar:             drivers.filter((d) => d.alertas === 0 && d.reportaveis > 0).length,
          soTecnico:              drivers.filter((d) => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0).length,
          totalEventos:           valid.length,
          falsosPositivos,
          filtradosPorVelocidade,
          filtradosPorHistorico,
          autoDescartes,
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
