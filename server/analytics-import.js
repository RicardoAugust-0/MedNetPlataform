import multer from 'multer';
import * as XLSX from 'xlsx';
import {
  parseCSV,
  readHeaders,
  toDate,
  toNum,
  normCrit,
  normClf,
  buildImportRows
} from '../src/utils/fatigueParser.js';

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
}).array('files');

// Handler da rota do Express que orquestra a importação
export async function handleImportEvents(supabase, req, res, clearCache) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado para importação.' });
    }

    const platformId = req.body.platformId;
    const operatorEmail = req.body.operatorEmail || '';
    
    if (!platformId) {
      return res.status(400).json({ error: 'platformId é obrigatório.' });
    }

    let mapping;
    try {
      mapping = JSON.parse(req.body.mapping);
    } catch (e) {
      return res.status(400).json({ error: 'Mapeamento inválido no corpo da requisição.' });
    }

    const parsedFiles = [];

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
      const { error: upsertError } = await supabase
        .from('driver_events')
        .upsert(chunk, {
          onConflict: 'platform_id,placa,ocorrido_em,nome_evento',
          ignoreDuplicates: true,
        });

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
