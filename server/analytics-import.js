import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import * as XLSX from 'xlsx';
import {
  PLATFORMS,
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

export async function cleanupUploadedFiles(files = []) {
  const paths = files.map((file) => file?.path).filter(Boolean);
  await Promise.allSettled(paths.map((filePath) => unlink(filePath)));
}

export async function readUploadedFileBuffer(file) {
  if (Buffer.isBuffer(file?.buffer)) return file.buffer;
  if (file?.path) return readFile(file.path);
  throw new Error(`Arquivo temporario indisponivel: ${file?.originalname || 'sem nome'}`);
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

async function inspectWorkbookFile(file) {
  // The ESM SheetJS build does not bind Node's fs adapter, so XLSX.readFile()
  // always throws "Cannot access file" for disk-backed Multer uploads. Read
  // through Node first, then give SheetJS the bytes it can parse reliably.
  const workbook = XLSX.read(await readUploadedFileBuffer(file), { type: 'buffer', cellDates: true });
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

export async function readUploadHeaders(file) {
  const extension = path.extname(String(file?.originalname || '')).toLowerCase();
  const mime = String(file?.mimetype || '').toLowerCase();
  const isCsv = extension === '.csv' || ['text/csv', 'application/csv', 'text/plain'].includes(mime);
  if (!isCsv) return (await inspectWorkbookFile(file)).headers;

  const { iterator, headers } = await openCsvData(file);
  if (typeof iterator.return === 'function') await iterator.return();
  return headers;
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
      const descriptor = await inspectUploadFile(file);
      if (!descriptor.headers.length || descriptor.dataRowCount === 0) {
        return res.status(400).json({
          error: `Não foi possível identificar o cabeçalho ou linhas de dados no arquivo: ${file.originalname}`
        });
      }

      parsedRowCount += descriptor.dataRowCount;
      if (parsedRowCount > maxRows) {
        return res.status(413).json({ error: `Quantidade de linhas acima do limite de ${maxRows}.` });
      }
      parsedFiles.push(descriptor);
    }

    const baseHeaders = parsedFiles[0].headers;
    const baseStage = { platformId, headers: baseHeaders, mapping };
    const importAuthority = getImportAuthority(baseStage);
    const stats = { lidas: 0, semData: 0, operador: 0, velocidade: 0, leves: 0, importadas: 0 };
    const seenKeys = new Set();
    let dupsFiltered = 0;
    let uniqueSavedCount = 0;
    let pendingRows = [];

    const flushRows = async () => {
      if (pendingRows.length === 0) return;
      const chunk = pendingRows;
      pendingRows = [];
      const { error: upsertError } = await retryTransientFetch(
        () => supabase.rpc('upsert_driver_events_preserve', {
          p_rows: chunk,
          ...importAuthority,
        }),
        { label: `Import Backend · lote ${Math.floor(uniqueSavedCount / IMPORT_BATCH_SIZE) + 1}` },
      );
      if (upsertError) {
        console.error('[Import Backend] Erro no upsert do Supabase:', upsertError);
        throw upsertError;
      }
      uniqueSavedCount += chunk.length;
    };

    const importDataRows = async (dataRows) => {
      const { rows, stats: batchStats } = buildImportRows({ ...baseStage, dataRows }, operatorEmail);
      mergeImportStats(stats, batchStats);
      for (const rowValue of rows) {
        const key = `${rowValue.platform_id}|${rowValue.placa}|${rowValue.ocorrido_em}|${rowValue.nome_evento}`;
        if (seenKeys.has(key)) {
          dupsFiltered += 1;
          continue;
        }
        seenKeys.add(key);
        pendingRows.push(rowValue);
        if (pendingRows.length >= IMPORT_BATCH_SIZE) await flushRows();
      }
    };

    for (const descriptor of parsedFiles) {
      const headersMatch = descriptor.headers.length === baseHeaders.length
        && descriptor.headers.every((header, index) => header === baseHeaders[index]);
      const headerIndexes = headersMatch
        ? null
        : baseHeaders.map((header) => descriptor.headers.indexOf(header));
      let batch = [];
      for await (const sourceRow of iterateUploadRows(descriptor)) {
        batch.push(headerIndexes
          ? headerIndexes.map((sourceIndex) => (sourceIndex > -1 ? sourceRow[sourceIndex] : ''))
          : sourceRow);
        if (batch.length >= IMPORT_BATCH_SIZE) {
          await importDataRows(batch);
          batch = [];
        }
      }
      if (batch.length > 0) await importDataRows(batch);
    }

    await flushRows();

    if (uniqueSavedCount === 0) {
      const partes = [];
      if (stats.semData) partes.push(`${stats.semData} sem data/hora válida`);
      if (stats.operador) partes.push(`${stats.operador} de outro operador`);
      if (stats.velocidade) partes.push(`${stats.velocidade} com velocidade < 10 km/h`);
      const detalhe = partes.length ? ` De ${stats.lidas} linhas: ${partes.join(', ')}.` : '';
      return res.status(400).json({ error: 'Nenhuma linha entrou na importação.' + detalhe, stats });
    }

    console.log(`[Import Backend] De ${stats.importadas} linhas válidas, ${uniqueSavedCount} são únicas. ${dupsFiltered} duplicados locais filtrados.`);

    // Limpar o cache no backend
    if (clearCache) {
      clearCache(platformId);
    }

    return res.status(200).json({
      success: true,
      stats,
      dupsFiltered,
      uniqueSavedCount
    });

  } catch (err) {
    console.error('[Import Backend] Erro geral na importação de eventos:', err);
    return res.status(500).json({ error: err.message || String(err) });
  } finally {
    await cleanupUploadedFiles(req.files);
  }
}
