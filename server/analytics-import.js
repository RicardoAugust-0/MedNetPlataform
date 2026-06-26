import multer from 'multer';
import * as XLSX from 'xlsx';
import {
  parseCSV,
  readHeaders,
  toDate,
  toNum,
  normCrit,
  normClf
} from '../src/utils/fatigueParser.js';

// Configuração do multer em memória (limite de 100MB por arquivo)
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
}).array('files');

// Normaliza um cabeçalho para comparação sem acento/caixa
function normHeaderName(h) {
  return String(h || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Constrói as linhas a inserir + estatísticas de descarte
function buildImportRows(stage, operatorEmail) {
  const getVal = (row, k) => {
    const headerIdx = stage.mapping[k] ? stage.headers.indexOf(stage.mapping[k]) : -1;
    return headerIdx > -1 ? row[headerIdx] : null;
  };

  const isOmnilink = stage.platformId === 'omnilink';
  const tratadoPorIdx = stage.headers.findIndex((h) => normHeaderName(h) === 'tratado por');
  const metodoProcIdx = stage.headers.findIndex((h) => {
    const nh = normHeaderName(h);
    return nh === 'metodo de processamento' || nh === 'metodoprocessamento';
  });
  const statusIdx = stage.headers.findIndex((h) => normHeaderName(h) === 'status');
  const tipoClfIdx = stage.headers.findIndex((h) => {
    const nh = normHeaderName(h);
    return nh === 'tipo de classificacao' || nh === 'tipo classificacao';
  });

  const rows = [];
  const stats = { lidas: stage.dataRows.length, semData: 0, operador: 0, velocidade: 0, leves: 0, importadas: 0 };

  for (const row of stage.dataRows) {
    const dt = toDate(getVal(row, 'datetime'));
    if (!dt) { stats.semData++; continue; }

    // Filtro OmniLink: só eventos tratados pelo operador configurado.
    if (isOmnilink && tratadoPorIdx > -1) {
      const tratadoPor = String(row[tratadoPorIdx] || '').trim().toLowerCase();
      if (tratadoPor !== operatorEmail.toLowerCase()) { stats.operador++; continue; }
    }

    // Filtro de velocidade < 10 km/h (mínimo de veículo em movimento).
    const speedVal = toNum(getVal(row, 'speed'));
    if (speedVal !== null && speedVal < 10) { stats.velocidade++; continue; }

    const classificationRaw = getVal(row, 'classification');
    const classificationNorm = classificationRaw ? normClf(classificationRaw) : 'Não classificado';
    const plateVal = String(getVal(row, 'plate') || '').trim();
    const typeVal = String(getVal(row, 'type') || '').trim();

    // Para OmniLink, "Método de processamento" tem prioridade sobre "Status".
    let resolvedClassification = (isOmnilink && metodoProcIdx > -1 && row[metodoProcIdx])
      ? normClf(row[metodoProcIdx])
      : classificationNorm;

    if (stage.platformId === 'maxtrack' && resolvedClassification === 'Não classificado') {
      const statusRaw = statusIdx > -1 ? String(row[statusIdx] || '').trim() : '';
      const tipoClfRaw = tipoClfIdx > -1 ? String(row[tipoClfIdx] || '').trim() : '';
      if (statusRaw.startsWith('Auto Finalizado')) {
        resolvedClassification = 'Não classificado - Auto Finalizado';
      } else if (statusRaw === 'Finalizado' && tipoClfRaw === 'Imagem não visível') {
        resolvedClassification = 'Não classificado - Imagem não visível';
      }
    }

    const severidade = getVal(row, 'criticality') ? normCrit(getVal(row, 'criticality')) : 'Médio';
    // "Leve" é salvo (entra em rows) mas não entra na análise (excluído no servidor).
    if (severidade === 'Leve') stats.leves++;

    rows.push({
      platform_id: stage.platformId,
      placa: plateVal || 'SEM_PLACA',
      nome: getVal(row, 'driver') ? String(getVal(row, 'driver')).trim() : null,
      nome_evento: typeVal || 'Fadiga',
      severidade,
      analise_ia_plataforma: resolvedClassification,
      velocidade_kmh: speedVal,
      localidade: getVal(row, 'location') ? String(getVal(row, 'location')).trim() : null,
      frota: getVal(row, 'fleet') ? String(getVal(row, 'fleet')).trim() : null,
      descricao: getVal(row, 'description') ? String(getVal(row, 'description')).trim() : null,
      ocorrido_em: dt.toISOString(),
      evidencia: getVal(row, 'evidence') ? String(getVal(row, 'evidence')).trim() : null,
      inicio_tratativa: getVal(row, 'treatStart') ? toDate(getVal(row, 'treatStart'))?.toISOString() : null,
      fim_tratativa: getVal(row, 'treatEnd') ? toDate(getVal(row, 'treatEnd'))?.toISOString() : null,
    });
  }

  stats.importadas = rows.length;
  return { rows, stats };
}

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
