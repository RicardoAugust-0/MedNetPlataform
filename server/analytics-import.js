import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import * as XLSX from 'xlsx';
import {
  PLATFORMS,
  parseCSV,
  readHeaders,
  toDate,
  toNum,
  normCrit,
  normClf,
  buildImportRows
} from '../src/utils/fatigueParser.js';
import { retryTransientFetch } from './transient-retry.js';

const DEFAULT_UPLOAD_EXTENSIONS = ['.csv', '.xls', '.xlsx'];
const DEFAULT_UPLOAD_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const DEFAULT_MAX_FILE_SIZE_MB = 256;
const DEFAULT_MAX_TOTAL_SIZE_MB = 512;
const IMPORT_BATCH_SIZE = 5000;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function configuredList(value, fallback) {
  const list = String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  return list.length > 0 ? list : fallback;
}

export function getSpreadsheetUploadConfig(env = process.env) {
  return {
    maxFiles: positiveInteger(env.UPLOAD_MAX_FILES, 10),
    maxFileSizeBytes: positiveInteger(env.UPLOAD_MAX_FILE_SIZE_MB, DEFAULT_MAX_FILE_SIZE_MB) * 1024 * 1024,
    maxTotalBytes: positiveInteger(env.UPLOAD_MAX_TOTAL_MB, DEFAULT_MAX_TOTAL_SIZE_MB) * 1024 * 1024,
    allowedExtensions: configuredList(env.UPLOAD_ALLOWED_EXTENSIONS, DEFAULT_UPLOAD_EXTENSIONS),
    allowedMimeTypes: configuredList(env.UPLOAD_ALLOWED_MIME_TYPES, DEFAULT_UPLOAD_MIME_TYPES),
  };
}

export function isAllowedSpreadsheetFile(file, config = getSpreadsheetUploadConfig()) {
  const extension = path.extname(String(file?.originalname || '')).toLowerCase();
  const mime = String(file?.mimetype || '').toLowerCase();
  return config.allowedExtensions.includes(extension) && config.allowedMimeTypes.includes(mime);
}

export function createSpreadsheetUploadMiddleware(config = getSpreadsheetUploadConfig()) {
  const parser = multer({
    // Large uploads stay on disk while the request is processed. Keeping the
    // original file, decoded text, CSV matrix and database rows in memory at
    // the same time made a 150 MB CSV consume several times that amount.
    storage: multer.diskStorage({
      destination: os.tmpdir(),
      filename(req, file, callback) {
        const extension = path.extname(String(file.originalname || '')).toLowerCase();
        callback(null, `mednet-analytics-${Date.now()}-${randomUUID()}${extension}`);
      },
    }),
    limits: {
      fileSize: config.maxFileSizeBytes,
      files: config.maxFiles,
      fields: 10,
      fieldSize: 256 * 1024,
    },
    fileFilter(req, file, callback) {
      if (isAllowedSpreadsheetFile(file, config)) return callback(null, true);
      const error = new Error('Tipo de arquivo nao permitido. Envie CSV, XLS ou XLSX.');
      error.code = 'UNSUPPORTED_FILE_TYPE';
      return callback(error);
    },
  }).array('files', config.maxFiles);

  return (req, res, next) => parser(req, res, async (error) => {
    if (error) {
      await cleanupUploadedFiles(req.files);
      if (error.code === 'LIMIT_FILE_SIZE') {
        const maxMb = Math.floor(config.maxFileSizeBytes / (1024 * 1024));
        return res.status(413).json({ error: `Arquivo acima do limite de ${maxMb} MB.` });
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(413).json({ error: `Quantidade de arquivos acima do limite de ${config.maxFiles}.` });
      }
      return res.status(415).json({ error: error.message });
    }
    const totalBytes = (req.files || []).reduce((total, file) => total + (file.size || 0), 0);
    if (totalBytes > config.maxTotalBytes) {
      await cleanupUploadedFiles(req.files);
      return res.status(413).json({ error: 'Tamanho total dos arquivos acima do limite.' });
    }
    return next();
  });
}

export const uploadMiddleware = createSpreadsheetUploadMiddleware();

async function cleanupUploadedFiles(files = []) {
  const paths = files.map((file) => file?.path).filter(Boolean);
  await Promise.allSettled(paths.map((filePath) => unlink(filePath)));
}

function detectCsvDelimiter(firstLine) {
  const counts = {
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
  };
  let delimiter = ',';
  if (counts[';'] > counts[delimiter]) delimiter = ';';
  if (counts['\t'] > counts[delimiter]) delimiter = '\t';
  return delimiter;
}

// Incremental counterpart of parseCSV. It preserves delimiters and line breaks
// inside quotes, including when a quote or UTF-8 character crosses a chunk.
export async function* parseCsvRows(chunks) {
  const decoder = new StringDecoder('utf8');
  let delimiter = null;
  let prefix = '';
  let row = [];
  let cell = '';
  let inQuotes = false;
  let started = false;

  const consume = (text) => {
    const completedRows = [];
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (!started) {
        started = true;
        if (char === '\uFEFF') continue;
      }
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          cell += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        row.push(cell.trim());
        cell = '';
      } else if (char === '\n') {
        row.push(cell.trim());
        completedRows.push(row);
        row = [];
        cell = '';
      } else if (char !== '\r') {
        cell += char;
      }
    }
    return completedRows;
  };

  const feed = (text) => {
    if (!text) return [];
    if (!delimiter) {
      prefix += text;
      const newlineIndex = prefix.indexOf('\n');
      if (newlineIndex < 0) return [];
      delimiter = detectCsvDelimiter(prefix.slice(0, newlineIndex));
      const buffered = prefix;
      prefix = '';
      return consume(buffered);
    }
    return consume(text);
  };

  for await (const chunk of chunks) {
    const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
    for (const completedRow of feed(text)) yield completedRow;
  }

  const tail = decoder.end();
  for (const completedRow of feed(tail)) yield completedRow;
  if (!delimiter && prefix) {
    delimiter = detectCsvDelimiter(prefix);
    for (const completedRow of consume(prefix)) yield completedRow;
    prefix = '';
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    yield row;
  }
}

function openCsvChunks(file) {
  if (file?.path) return createReadStream(file.path, { encoding: 'utf8' });
  if (Buffer.isBuffer(file?.buffer)) return Readable.from([file.buffer]);
  throw new Error(`Arquivo temporario indisponivel: ${file?.originalname || 'sem nome'}`);
}

function hasData(row) {
  return (row || []).some((cellValue) => cellValue !== '' && cellValue != null);
}

async function openCsvData(file) {
  const iterator = parseCsvRows(openCsvChunks(file))[Symbol.asyncIterator]();
  const initialRows = [];
  while (initialRows.length < 15) {
    const next = await iterator.next();
    if (next.done) break;
    initialRows.push(next.value);
  }
  const { headers, dataRows } = readHeaders(initialRows);
  return { iterator, headers, dataRows };
}

async function inspectCsvFile(file) {
  const { iterator, headers, dataRows } = await openCsvData(file);
  let dataRowCount = dataRows.length;
  while (true) {
    const next = await iterator.next();
    if (next.done) break;
    if (hasData(next.value)) dataRowCount += 1;
  }
  return { kind: 'csv', file, headers, dataRowCount };
}

async function* iterateCsvDataRows(file) {
  const { iterator, dataRows } = await openCsvData(file);
  for (const rowValue of dataRows) yield rowValue;
  while (true) {
    const next = await iterator.next();
    if (next.done) break;
    if (hasData(next.value)) yield next.value;
  }
}

function inspectWorkbookFile(file) {
  const workbook = file?.path
    ? XLSX.readFile(file.path, { cellDates: true })
    : XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const { headers, dataRows } = readHeaders(aoa);
  return { kind: 'workbook', file, headers, dataRows, dataRowCount: dataRows.length };
}

async function inspectUploadFile(file) {
  const extension = path.extname(String(file?.originalname || '')).toLowerCase();
  const mime = String(file?.mimetype || '').toLowerCase();
  const isCsv = extension === '.csv' || ['text/csv', 'application/csv', 'text/plain'].includes(mime);
  return isCsv ? inspectCsvFile(file) : inspectWorkbookFile(file);
}

async function* iterateUploadRows(descriptor) {
  if (descriptor.kind === 'csv') {
    yield* iterateCsvDataRows(descriptor.file);
    return;
  }
  for (const rowValue of descriptor.dataRows) yield rowValue;
}

function mergeImportStats(target, source) {
  for (const key of Object.keys(target)) target[key] += source[key] || 0;
}

// O ranking MaxTrack pode alimentar remuneração, então as colunas de origem
// precisam ser autoritativas quando realmente existem no arquivo. Isso permite
// que uma célula atualmente vazia limpe um valor antigo sem fazer o mesmo em
// layouts/plataformas que nem sequer possuem essas colunas.
export function getImportAuthority(stage) {
  const hasMappedColumn = (field) => {
    const header = stage.mapping?.[field];
    return Boolean(header && stage.headers.includes(header));
  };
  const isMaxtrack = stage.platformId === 'maxtrack';

  return {
    p_authoritative_operator: isMaxtrack && hasMappedColumn('operator'),
    p_authoritative_treatment_end: isMaxtrack && hasMappedColumn('treatEnd'),
  };
}

// Handler da rota do Express que orquestra a importação
export async function handleImportEvents(supabase, req, res, clearCache) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado para importação.' });
    }

    const platformId = typeof req.body?.platformId === 'string' ? req.body.platformId.trim() : '';
    const operatorEmail = req.authUser?.email || req.body?.operatorEmail || '';
    
    if (!PLATFORMS.some((platform) => platform.id === platformId)) {
      return res.status(400).json({ error: 'platformId invalido.' });
    }

    let mapping;
    try {
      mapping = JSON.parse(req.body.mapping);
      const entries = Object.entries(mapping || {});
      if (
        Array.isArray(mapping)
        || typeof mapping !== 'object'
        || entries.length > 100
        || entries.some(([key, value]) => key.length > 100 || (value !== null && typeof value !== 'string'))
      ) {
        throw new Error('mapping invalido');
      }
    } catch {
      return res.status(400).json({ error: 'Mapeamento invalido no corpo da requisicao.' });
    }

    const parsedFiles = [];
    const maxRows = positiveInteger(process.env.UPLOAD_MAX_ROWS, 500_000);
    let parsedRowCount = 0;

    for (const file of req.files) {
      const isCsv = /\.csv$/i.test(file.originalname) || file.mimetype === 'text/csv';
      const fileData = file.buffer;

      let aoa;
      if (isCsv) {
        const text = fileData.toString('utf-8');
        aoa = parseCSV(text);
      } else {
        const wb = XLSX.read(fileData, { type: 'buffer', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      }

      const { headers, dataRows } = readHeaders(aoa);
      if (!headers.length || !dataRows.length) {
        return res.status(400).json({
          error: `Não foi possível identificar o cabeçalho ou linhas de dados no arquivo: ${file.originalname}`
        });
      }

      parsedRowCount += dataRows.length;
      if (parsedRowCount > maxRows) {
        return res.status(413).json({ error: `Quantidade de linhas acima do limite de ${maxRows}.` });
      }

      parsedFiles.push({ name: file.originalname, headers, dataRows });
    }

    // Combinar os dados de todas as planilhas
    const baseFile = parsedFiles[0];
    const baseHeaders = baseFile.headers;
    let combinedDataRows = [...baseFile.dataRows];

    // Alinha as colunas dos arquivos subsequentes com base nas colunas da primeira planilha
    for (let i = 1; i < parsedFiles.length; i++) {
      const currentFile = parsedFiles[i];
      
      const headersMatch = currentFile.headers.length === baseHeaders.length &&
        currentFile.headers.every((h, idx) => h === baseHeaders[idx]);

      if (headersMatch) {
        combinedDataRows.push(...currentFile.dataRows);
      } else {
        const mappedRows = currentFile.dataRows.map(row => {
          return baseHeaders.map(baseHeader => {
            const currentIdx = currentFile.headers.indexOf(baseHeader);
            return currentIdx > -1 ? row[currentIdx] : '';
          });
        });
        combinedDataRows.push(...mappedRows);
      }
    }

    const stage = {
      platformId,
      headers: baseHeaders,
      dataRows: combinedDataRows,
      mapping
    };
    const importAuthority = getImportAuthority(stage);

    const { rows, stats } = buildImportRows(stage, operatorEmail);

    if (rows.length === 0) {
      const partes = [];
      if (stats.semData) partes.push(`${stats.semData} sem data/hora válida`);
      if (stats.operador) partes.push(`${stats.operador} de outro operador`);
      if (stats.velocidade) partes.push(`${stats.velocidade} com velocidade < 10 km/h`);
      const detalhe = partes.length ? ` De ${stats.lidas} linhas: ${partes.join(', ')}.` : '';
      return res.status(400).json({ error: 'Nenhuma linha entrou na importação.' + detalhe, stats });
    }

    // Deduplica em memória
    const uniqueRows = [];
    const seenKeys = new Set();
    for (const r of rows) {
      const key = `${r.platform_id}|${r.placa}|${r.ocorrido_em}|${r.nome_evento}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueRows.push(r);
      }
    }

    const dupsFiltered = rows.length - uniqueRows.length;
    console.log(`[Import Backend] De ${rows.length} linhas, ${uniqueRows.length} são únicas. ${dupsFiltered} duplicados locais filtrados.`);

    // Inserção em lote no banco
    const chunkSize = 5000;
    let i = 0;
    const totalRows = uniqueRows.length;

    while (i < totalRows) {
      const chunk = uniqueRows.slice(i, i + chunkSize);
      // O RPC faz upsert pela chave natural do evento, portanto e seguro
      // repetir quando a conexao cai sem uma resposta conclusiva.
      const { error: upsertError } = await retryTransientFetch(
        () => supabase.rpc('upsert_driver_events_preserve', {
          p_rows: chunk,
          ...importAuthority,
        }),
        { label: `Import Backend · lote ${Math.floor(i / chunkSize) + 1}` },
      );

      if (upsertError) {
        console.error('[Import Backend] Erro no upsert do Supabase:', upsertError);
        throw upsertError;
      }
      i += chunk.length;
    }

    // Limpar o cache no backend
    if (clearCache) {
      clearCache(platformId);
    }

    return res.status(200).json({
      success: true,
      stats,
      dupsFiltered,
      uniqueSavedCount: totalRows
    });

  } catch (err) {
    console.error('[Import Backend] Erro geral na importação de eventos:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
