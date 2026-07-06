import { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabase.js';
import {
  PLATFORMS,
  FIELD_DEFS,
  parseCSV,
  readHeaders,
  detect,
  toDate,
  toNum,
  normCrit,
  normClf
} from '../../utils/fatigueParser.js';

const DEFAULT_OPERATOR_EMAIL = 'hevilyntfzero@gmail.com';

// Normaliza um cabeçalho para comparação sem acento/caixa.
function normHeaderName(h) {
  return String(h || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Constrói as linhas a inserir + estatísticas de descarte. Função pura: usada
// tanto pelo resumo ao vivo (passo de revisão) quanto pela confirmação, para que
// a contagem mostrada seja exatamente o que será salvo.
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
      operador: getVal(row, 'operator') ? String(getVal(row, 'operator')).trim() : null,
    });
  }

  stats.importadas = rows.length;
  return { rows, stats };
}

function fmtDateTimeShort(dt) {
  if (!dt) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export default function ImportModal({ modalOpen, setModalOpen, saving, onImportConfirm }) {
  const [step, setStep] = useState('drop'); // 'drop' | 'review'
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);
  const [platformHint, setPlatformHint] = useState('auto');
  const [stage, setStage] = useState(null); // { fileName, headers, dataRows, platformId, platformName, mapping }
  const [operatorEmail, setOperatorEmail] = useState(DEFAULT_OPERATOR_EMAIL);
  const [rawFiles, setRawFiles] = useState([]);

  const fileInputRef = useRef(null);

  // Reset all internal state when modal opens.
  useEffect(() => {
    if (modalOpen) {
      setStep('drop');
      setDragOver(false);
      setParsing(false);
      setError(null);
      setPlatformHint('auto');
      setStage(null);
      setOperatorEmail(DEFAULT_OPERATOR_EMAIL);
      setRawFiles([]);
    }
  }, [modalOpen]);

  // Close modal on Escape key.
  useEffect(() => {
    if (!modalOpen) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [modalOpen, setModalOpen]);

  // Para OmniLink, busca o operador configurado (usado no resumo e no filtro).
  useEffect(() => {
    let active = true;
    if (stage?.platformId === 'omnilink') {
      (async () => {
        try {
          const { data } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'omnilink_config')
            .maybeSingle();
          if (active && data?.value?.operator_email) setOperatorEmail(data.value.operator_email);
        } catch (err) {
          console.warn('[ImportModal] Erro ao obter omnilink_config:', err);
        }
      })();
    } else {
      setOperatorEmail(DEFAULT_OPERATOR_EMAIL);
    }
    return () => { active = false; };
  }, [stage?.platformId]);

  const handleFiles = async (filesList) => {
    const files = filesList ? Array.from(filesList) : [];
    if (!files.length) return;
    setParsing(true);
    setError(null);
    setRawFiles(files);

    try {
      const parsedFiles = [];

      for (const f of files) {
        const isCsv = /\.csv$/i.test(f.name) || f.type === 'text/csv';
        
        const fileData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.onerror = () => reject(new Error(`Falha ao ler o arquivo: ${f.name}`));
          if (isCsv) {
            // Ler apenas os primeiros 150KB para evitar carregar arquivos gigantes na memória do preview
            const sliceBlob = f.slice(0, 150 * 1024);
            reader.readAsText(sliceBlob, 'UTF-8');
          }
          else reader.readAsArrayBuffer(f);
        });

        let aoa;
        if (isCsv) {
          aoa = parseCSV(fileData);
          if (aoa.length > 100) aoa = aoa.slice(0, 100);
        } else {
          const data = new Uint8Array(fileData);
          // Passar sheetRows: 100 para o parser ler apenas o cabeçalho e as primeiras linhas de preview
          const wb = XLSX.read(data, { type: 'array', cellDates: true, sheetRows: 100 });
          const ws = wb.Sheets[wb.SheetNames[0]];
          aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        }

        const { headers, dataRows } = readHeaders(aoa);
        if (!headers.length || !dataRows.length) {
          throw new Error(`Não foi possível identificar o cabeçalho ou linhas de dados no arquivo: ${f.name}`);
        }

        parsedFiles.push({ name: f.name, headers, dataRows });
      }

      // Combinar os dados de todas as planilhas
      const baseFile = parsedFiles[0];
      const baseHeaders = baseFile.headers;
      let combinedDataRows = [...baseFile.dataRows];

      // Alinha as colunas dos arquivos subsequentes com base nas colunas da primeira planilha
      for (let i = 1; i < parsedFiles.length; i++) {
        const currentFile = parsedFiles[i];
        
        // Se as colunas forem idênticas em ordem e quantidade, adiciona diretamente
        const headersMatch = currentFile.headers.length === baseHeaders.length &&
          currentFile.headers.every((h, idx) => h === baseHeaders[idx]);

        if (headersMatch) {
          combinedDataRows.push(...currentFile.dataRows);
        } else {
          // Alinha as colunas conforme o nome do cabeçalho
          const mappedRows = currentFile.dataRows.map(row => {
            return baseHeaders.map(baseHeader => {
              const currentIdx = currentFile.headers.indexOf(baseHeader);
              return currentIdx > -1 ? row[currentIdx] : '';
            });
          });
          combinedDataRows.push(...mappedRows);
        }
      }

      // Detecção de plataforma usando a assinatura da primeira planilha
      const det = detect(baseHeaders, platformHint, baseFile.name);
      
      setParsing(false);
      setStep('review');
      setStage({
        fileName: files.length === 1 
          ? baseFile.name 
          : `${files.length} arquivos (${baseFile.name} + ${files.length - 1} outro${files.length > 2 ? 's' : ''})`,
        headers: baseHeaders,
        dataRows: combinedDataRows,
        platformId: det.platform,
        platformName: det.platformName,
        mapping: det.mapping,
      });
    } catch (err) {
      setParsing(false);
      setError(err?.message || 'Erro ao ler ou processar os arquivos.');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileInputChange = (e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  };

  const handleSetMapField = (key, value) => {
    if (!stage) return;
    setStage((prev) => ({
      ...prev,
      mapping: {
        ...prev.mapping,
        [key]: value || null,
      },
    }));
  };

  const handleStagePlatformChange = (e) => {
    const id = e.target.value;
    setStage((prev) => {
      if (!prev) return null;
      // Recalcula o mapeamento inteiro para a plataforma escolhida: detecção por
      // sinônimos + mapa determinístico de colunas (fixa as colunas certas de cada
      // plataforma, ex.: Sighra "Placa" em vez de "Veículo"; OmniLink usa
      // "Método de processamento" como classificação).
      const det = detect(prev.headers, id, prev.fileName);
      return {
        ...prev,
        platformId: det.platform,
        platformName: det.platformName,
        mapping: det.mapping,
      };
    });
  };

  // Resumo ao vivo (recalcula conforme o mapeamento/plataforma mudam).
  const summary = useMemo(() => (stage ? buildImportRows(stage, operatorEmail).stats : null), [stage, operatorEmail]);

  // Amostra das 3 primeiras linhas já resolvidas com o mapeamento atual.
  const preview = useMemo(() => {
    if (!stage) return [];
    const getVal = (row, k) => {
      const i = stage.mapping[k] ? stage.headers.indexOf(stage.mapping[k]) : -1;
      return i > -1 ? row[i] : null;
    };
    return stage.dataRows.slice(0, 3).map((row) => {
      const sev = getVal(row, 'criticality') ? normCrit(getVal(row, 'criticality')) : 'Médio';
      const clfRaw = getVal(row, 'classification');
      const startDt = toDate(getVal(row, 'treatStart'));
      const endDt = toDate(getVal(row, 'treatEnd'));
      return {
        data: fmtDateTimeShort(toDate(getVal(row, 'datetime'))),
        placa: String(getVal(row, 'plate') || '—').trim() || '—',
        tipo: String(getVal(row, 'type') || '—').trim() || '—',
        sev,
        clf: clfRaw ? normClf(clfRaw) : 'Não classificado',
        vel: toNum(getVal(row, 'speed')),
        frota: String(getVal(row, 'fleet') || '—').trim() || '—',
        isLeve: sev === 'Leve',
        evidencia: getVal(row, 'evidence') ? String(getVal(row, 'evidence')).trim() : '—',
        inicio_tratativa: startDt ? fmtDateTimeShort(startDt) : '—',
        fim_tratativa: endDt ? fmtDateTimeShort(endDt) : '—',
      };
    });
  }, [stage]);

  const datetimeMapped = !!stage?.mapping?.datetime;

  const handleConfirmClick = async () => {
    if (!stage) return;
    setError(null);

    if (!datetimeMapped) {
      setError('Mapeie a coluna obrigatória "Data / hora do alerta" antes de continuar.');
      return;
    }

    let opEmail = operatorEmail;
    if (stage.platformId === 'omnilink') {
      try {
        const { data: configData } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'omnilink_config')
          .maybeSingle();
        if (configData?.value?.operator_email) opEmail = configData.value.operator_email;
      } catch (err) {
        console.warn('[ImportModal] Erro ao obter omnilink_config:', err);
      }
    }

    onImportConfirm(rawFiles, stage.platformId, stage.platformName, stage.mapping, opEmail);
  };

  const fieldRows = stage
    ? FIELD_DEFS.map((f) => ({
        key: f.key,
        label: f.label,
        req: !!f.req,
        value: stage.mapping[f.key] || '',
        onChange: (e) => handleSetMapField(f.key, e.target.value),
      }))
    : [];

  if (!modalOpen) return null;

  const sevColor = (sev) =>
    sev === 'Gravíssimo' ? '#C62F2F' : sev === 'Grave' ? '#E8A020' : sev === 'Leve' ? '#8A94A6' : '#2A8DD9';

  return (
    <div data-noprint onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(10,7,23,0.55)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="fz-in" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px 24px', width: '580px', maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(15,25,35,0.14)' }}>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="ti ti-table-import" style={{ fontSize: '18px', color: '#9E1A45' }}></i> Importar planilha de fadiga
          </div>
          <button
            onClick={() => setModalOpen(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px', padding: '4px', borderRadius: '6px', display: 'flex' }}
          >
            <i className="ti ti-x"></i>
          </button>
        </div>

        {/* Passo 1: Dropzone */}
        {step === 'drop' && (
          <div style={{ overflowY: 'auto' }}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Plataforma de origem
              </label>
              <select
                value={platformHint}
                onChange={(e) => setPlatformHint(e.target.value)}
                style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', background: 'var(--surface-2)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
              >
                <option value="auto">Detecção automática</option>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                Deixe em automático ou escolha a plataforma para reforçar o mapeamento de colunas.
              </div>
            </div>

            <div
              onClick={triggerFileSelect}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`dropzone ${dragOver ? 'drag-over' : ''}`}
            >
              <i className="ti ti-cloud-upload" style={{ fontSize: '34px', color: '#9E1A45' }}></i>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '10px' }}>
                Arraste uma ou mais planilhas aqui ou clique para selecionar
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
                Suporta XLSX, XLS ou CSV · Todas as planilhas devem ser da mesma plataforma
              </div>
            </div>

            {parsing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                <i className="ti ti-loader-2 fz-spin" style={{ fontSize: '16px', color: '#9E1A45' }}></i>
                Processando e analisando arquivos...
              </div>
            )}

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '12.5px', color: '#C62F2F', background: '#FCEBEB', border: '1px solid #E24B4A', borderRadius: '8px', padding: '9px 12px' }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: '16px' }}></i> {error}
              </div>
            )}

            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Plataformas integradas
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {PLATFORMS.map((p) => (
                  <span key={p.id} style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '99px' }}>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Passo 2: Revisor de Mapeamento de Colunas */}
        {step === 'review' && stage && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', flexShrink: 0 }}>
              <i className="ti ti-file-spreadsheet" style={{ fontSize: '20px', color: '#2DA75A', flexShrink: 0 }}></i>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {stage.fileName}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {stage.dataRows.length.toLocaleString('pt-BR')} registros · {stage.headers.length} colunas encontradas
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '14px', flexShrink: 0 }}>
              <label style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Confirmar Plataforma
              </label>
              <select
                value={stage.platformId}
                onChange={handleStagePlatformChange}
                style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', background: 'var(--surface-2)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
              >
                <option value="auto">Detecção automática</option>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.6px', flexShrink: 0 }}>
              Mapeamento de colunas da planilha
            </div>

            <div className="field-mapping-table" style={{ flex: 1, overflowY: 'auto', minHeight: '120px' }}>
              {fieldRows.map((f) => (
                <div key={f.key} className="field-mapping-row">
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {f.label}
                    {f.req && <span style={{ color: '#E24B4A', marginLeft: '3px' }}>*</span>}
                  </div>
                  <select
                    value={f.value}
                    onChange={f.onChange}
                    style={{ width: '100%', padding: '6px 9px', border: `1px solid ${f.req && !f.value ? '#E24B4A' : 'var(--border)'}`, borderRadius: '6px', fontSize: '12px', color: 'var(--text-primary)', background: 'var(--surface-0)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="">— ignorar coluna —</option>
                    {stage.headers.map((h, idx) => (
                      <option key={idx} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Pré-visualização do mapeamento */}
            <div style={{ marginTop: '14px', flexShrink: 0 }}>
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Pré-visualização (3 primeiras linhas)
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', fontSize: '9.5px', background: 'var(--surface-2)' }}>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>Data</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>Placa</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>Tipo</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>Crit.</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>Classif.</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Vel.</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>Frota</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>Evid.</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>Início Trat.</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>Fim Trat.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)', color: r.isLeve ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                        <td style={{ padding: '6px 8px', fontFamily: "'IBM Plex Mono', monospace" }}>{r.data}</td>
                        <td style={{ padding: '6px 8px', fontFamily: "'IBM Plex Mono', monospace" }}>{r.placa}</td>
                        <td style={{ padding: '6px 8px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.tipo}>{r.tipo}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: sevColor(r.sev) }}>
                          {r.sev}{r.isLeve && <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}> · fora</span>}
                        </td>
                        <td style={{ padding: '6px 8px' }}>{r.clf}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{r.vel != null ? r.vel : '—'}</td>
                        <td style={{ padding: '6px 8px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.frota}>{r.frota}</td>
                        <td style={{ padding: '6px 8px' }} title={r.evidencia}>{r.evidencia}</td>
                        <td style={{ padding: '6px 8px', fontFamily: "'IBM Plex Mono', monospace" }}>{r.inicio_tratativa}</td>
                        <td style={{ padding: '6px 8px', fontFamily: "'IBM Plex Mono', monospace" }}>{r.fim_tratativa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Resumo de importação */}
            {summary && (
              <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', background: 'rgba(45,167,90,0.1)', border: '1px solid rgba(45,167,90,0.3)', padding: '3px 9px', borderRadius: '99px' }}>
                  {summary.importadas.toLocaleString('pt-BR')} importadas
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>de {summary.lidas.toLocaleString('pt-BR')} lidas</span>
                {summary.leves > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '3px 9px', borderRadius: '99px' }}>
                    {summary.leves.toLocaleString('pt-BR')} leves (salvas, fora da análise)
                  </span>
                )}
                {summary.semData > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>· {summary.semData} sem data</span>
                )}
                {summary.operador > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} title={`Operador: ${operatorEmail}`}>· {summary.operador} de outro operador</span>
                )}
                {summary.velocidade > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>· {summary.velocidade} vel &lt; 10</span>
                )}
              </div>
            )}

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '12.5px', color: '#C62F2F', background: '#FCEBEB', border: '1px solid #E24B4A', borderRadius: '8px', padding: '9px 12px', flexShrink: 0 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: '16px' }}></i> {error}
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button
                onClick={() => {
                  if (saving) return;
                  setStep('drop');
                  setStage(null);
                  setError(null);
                }}
                className="btn btn-ghost"
                disabled={saving}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 500,
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  color: 'var(--text-primary)',
                  background: 'var(--surface-0)',
                  opacity: saving ? 0.5 : 1,
                  pointerEvents: saving ? 'none' : 'auto',
                }}
              >
                <i className="ti ti-arrow-left" style={{ fontSize: '14px' }}></i> Voltar
              </button>
              <button
                onClick={handleConfirmClick}
                className="btn btn-primary"
                disabled={saving || !datetimeMapped}
                title={!datetimeMapped ? 'Mapeie a coluna de Data / hora do alerta' : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: 'none',
                  cursor: (saving || !datetimeMapped) ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  backgroundColor: '#F26931',
                  color: '#fff',
                  opacity: (saving || !datetimeMapped) ? 0.6 : 1,
                  pointerEvents: saving ? 'none' : 'auto',
                }}
              >
                {saving ? (
                  <>
                    <i className="ti ti-loader-2 fz-spin" style={{ fontSize: '14px' }}></i> Salvando...
                  </>
                ) : (
                  <>
                    <i className="ti ti-check" style={{ fontSize: '14px' }}></i> Confirmar e Analisar
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
        multiple
      />
    </div>
  );
}
