/**
 * parser-bridge.js — adapta o parser frontend (browser) para Node.js.
 *
 * O parser original usa `import('xlsx')` via Vite/browser. Aqui fazemos
 * a mesma lógica diretamente com xlsx (CommonJS disponível no Node).
 *
 * TODO: quando o parser frontend for refatorado para ESM puro (sem Vite),
 * substituir este arquivo por um import direto de src/platforms/maxtrack/parser.js
 */

import XLSX from 'xlsx';

// Replica as constantes de src/platforms/maxtrack/columns.js
const COLUMNS = {
  placa:          'Identificador/Placa',
  motorista:      'Motorista',
  cpf:            'CPF',
  matricula:      'Matricula do Motorista',
  transportadora: 'Empresa',
  frota:          'Frota',
  evento:         'Nome',
  descricao:      'Descrição',
  severidade:     'Criticidade',
  hora:           'Data',
  velocidade:     'Velocidade Inicial',
  localidade:     'Localidade',
  duracao:        'Duração',
  analise_ia:     'Análise de IA',
  id_evento:      'Id do Evento',
};

const SEV_MAP = { Gravíssimo: 'Gravíssimo', Grave: 'Grave', Médio: 'Normal' };

const INTERVENCAO = [
  'Detecção de bocejo',
  'Detecção olhos fechados ou falta de atenção - N1',
  'Detecção olhos fechados ou falta de atenção - N2',
  'Somatório de olhos fechados ou falta de atenção na ultima hora - N1',
];

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

function findCol(headers, colName) {
  const norm = normalize(colName);
  return headers.findIndex(h => normalize(h) === norm);
}

function parseTurno(date) {
  const h = new Date(date).getHours();
  return h >= 6 && h < 18 ? 'diurno' : 'noturno';
}

function parseDuracao(raw) {
  if (!raw) return null;
  const n = parseFloat(String(raw).split(' ')[0]);
  return Number.isFinite(n) ? n : null;
}

const INTERVENCAO_NORM = INTERVENCAO.map(normalize);
const MIN_SPEED = 10;

/**
 * Parseia um CSV Maxtrack (ponto-e-vírgula) e retorna rawEventRows
 * prontas para inserção em driver_events.
 *
 * @param {string} csvContent
 * @returns {{ rawEventRows: Array }}
 */
export async function parseCsv(csvContent) {
  const wb = XLSX.read(csvContent, { type: 'string', FS: ';' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 2) return { rawEventRows: [] };

  const headers = rows[0].map(String);
  const iPlaca    = findCol(headers, COLUMNS.placa);
  const iNome     = findCol(headers, COLUMNS.motorista);
  const iCpf      = findCol(headers, COLUMNS.cpf);
  const iMatric   = findCol(headers, COLUMNS.matricula);
  const iTransp   = findCol(headers, COLUMNS.transportadora);
  const iFrota    = findCol(headers, COLUMNS.frota);
  const iEvento   = findCol(headers, COLUMNS.evento);
  const iDescricao = findCol(headers, COLUMNS.descricao);
  const iSev      = findCol(headers, COLUMNS.severidade);
  const iHora     = findCol(headers, COLUMNS.hora);
  const iVel      = findCol(headers, COLUMNS.velocidade);
  const iLocal    = findCol(headers, COLUMNS.localidade);
  const iDuracao  = findCol(headers, COLUMNS.duracao);
  const iAnalise  = findCol(headers, COLUMNS.analise_ia);
  const iIdEvento = findCol(headers, COLUMNS.id_evento);

  const rawEventRows = [];

  for (const row of rows.slice(1)) {
    const placa = String(row[iPlaca] || '').trim();
    if (!placa) continue;

    const velRaw = iVel >= 0 ? parseFloat(String(row[iVel] || '0')) : null;
    if (velRaw !== null && velRaw < MIN_SPEED) continue;

    const horaRaw = iHora >= 0 ? String(row[iHora] || '').trim() : '';
    let ocorrido_em = null;
    if (horaRaw) {
      // Formato "DD/MM/AAAA HH:MM:SS"
      const [datePart, timePart] = horaRaw.split(' ');
      const [d, m, y] = (datePart || '').split('/');
      if (y && m && d) {
        ocorrido_em = new Date(`${y}-${m}-${d}T${timePart || '00:00:00'}-03:00`).toISOString();
      }
    }

    const nomeEvento = iEvento >= 0 ? String(row[iEvento] || '').trim() : '';
    const sevRaw     = iSev    >= 0 ? String(row[iSev]    || '').trim() : '';
    const bucket     = INTERVENCAO_NORM.includes(normalize(nomeEvento)) ? 'intervencao' : 'reportar';

    rawEventRows.push({
      platform_id:          'maxtrack',
      placa,
      nome:                 iNome    >= 0 ? String(row[iNome]    || '').trim() || null : null,
      cpf:                  iCpf     >= 0 ? String(row[iCpf]     || '').trim() || null : null,
      matricula:            iMatric  >= 0 ? String(row[iMatric]  || '').trim() || null : null,
      transportadora:       iTransp  >= 0 ? String(row[iTransp]  || '').trim() || null : null,
      frota:                iFrota   >= 0 ? String(row[iFrota]   || '').trim() || null : null,
      nome_evento:          nomeEvento,
      descricao:            iDescricao >= 0 ? String(row[iDescricao] || '').trim() || null : null,
      categoria_bucket:     bucket,
      severidade:           SEV_MAP[sevRaw] || 'Normal',
      turno:                ocorrido_em ? parseTurno(ocorrido_em) : 'diurno',
      localidade:           iLocal   >= 0 ? String(row[iLocal]   || '').trim() || null : null,
      velocidade_kmh:       velRaw,
      duracao_seg:          iDuracao >= 0 ? parseDuracao(row[iDuracao]) : null,
      analise_ia_plataforma: iAnalise >= 0 ? String(row[iAnalise] || '').trim() || null : null,
      raw_event_type_id:    iIdEvento >= 0 ? String(row[iIdEvento] || '').trim() || null : null,
      ocorrido_em,
    });
  }

  return { rawEventRows };
}
