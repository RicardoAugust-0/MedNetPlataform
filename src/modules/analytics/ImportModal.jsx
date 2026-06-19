import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
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

export default function ImportModal({ modalOpen, setModalOpen, saving, onImportConfirm }) {
  const [step, setStep] = useState('drop'); // 'drop' | 'review'
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);
  const [platformHint, setPlatformHint] = useState('auto');
  const [stage, setStage] = useState(null); // { fileName, headers, dataRows, platformId, platformName, mapping }

  const fileInputRef = useRef(null);

  const handleFiles = (files) => {
    const f = files && files[0];
    if (!f) return;
    setParsing(true);
    setError(null);
    const isCsv = /\.csv$/i.test(f.name) || f.type === 'text/csv';
    const reader = new FileReader();

    reader.onload = (ev) => {
      try {
        let aoa;
        if (isCsv) {
          aoa = parseCSV(ev.target.result);
        } else {
          const data = new Uint8Array(ev.target.result);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        }
        const { headers, dataRows } = readHeaders(aoa);
        if (!headers.length || !dataRows.length) {
          setParsing(false);
          setError('Não foi possível identificar o cabeçalho ou linhas de dados nesta planilha.');
          return;
        }
        const det = detect(headers, platformHint, f.name);
        setParsing(false);
        setStep('review');
        setStage({
          fileName: f.name,
          headers,
          dataRows,
          platformId: det.platform,
          platformName: det.platformName,
          mapping: det.mapping,
        });
      } catch (err) {
        setParsing(false);
        setError('Erro ao ler o arquivo: ' + (err?.message || err));
      }
    };

    reader.onerror = () => {
      setParsing(false);
      setError('Falha ao ler o arquivo.');
    };

    if (isCsv) reader.readAsText(f, 'UTF-8');
    else reader.readAsArrayBuffer(f);
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
    const p = PLATFORMS.find((x) => x.id === id);
    setStage((prev) => {
      if (!prev) return null;
      const updatedMapping = { ...prev.mapping };
      if (id === 'omnilink') {
        const metodoProcHeader = prev.headers.find(h => {
          const nh = String(h || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return nh === 'metodo de processamento' || nh === 'metodoprocessamento';
        });
        if (metodoProcHeader) {
          updatedMapping['classification'] = metodoProcHeader;
        }
      }
      return {
        ...prev,
        platformId: id,
        platformName: p ? p.name : 'Detecção automática',
        mapping: updatedMapping,
      };
    });
  };

  const handleConfirmClick = () => {
    if (!stage) return;
    setError(null);

    const getVal = (row, k) => {
      const headerIdx = stage.mapping[k] ? stage.headers.indexOf(stage.mapping[k]) : -1;
      return headerIdx > -1 ? row[headerIdx] : null;
    };

    const isOmnilink = stage.platformId === 'omnilink';

    // Find index for 'Tratado por' column for OmniLink filter
    const tratadoPorIdx = stage.headers.findIndex(h => {
      const nh = String(h || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return nh === 'tratado por';
    });

    // Find index for 'Método de processamento' column
    const metodoProcIdx = stage.headers.findIndex(h => {
      const nh = String(h || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return nh === 'metodo de processamento' || nh === 'metodoprocessamento';
    });

    const rowsToInsert = [];
    for (const row of stage.dataRows) {
      const dtRaw = getVal(row, 'datetime');
      const dt = toDate(dtRaw);
      if (!dt) continue;

      // 1. Filter out by operator email if it is OmniLink
      if (isOmnilink && tratadoPorIdx > -1) {
        const tratadoPor = String(row[tratadoPorIdx] || '').trim().toLowerCase();
        if (tratadoPor !== 'hevilyntfzero@gmail.com') {
          continue; // skip
        }
      }

      // 2. Filter by speed < 10 km/h (minimum moving speed limit)
      const speedVal = toNum(getVal(row, 'speed'));
      if (speedVal !== null && speedVal < 10) {
        continue; // skip
      }

      // 3. Keep false positives and discarded events for analytics, but still normalize classification
      const classificationRaw = getVal(row, 'classification');
      const classificationNorm = classificationRaw ? normClf(classificationRaw) : 'Não classificado';

      const plateVal = String(getVal(row, 'plate') || '').trim();
      const typeVal = String(getVal(row, 'type') || '').trim();

      // For OmniLink, we prioritize 'Método de processamento' over 'Status' (classification)
      const resolvedClassification = (isOmnilink && metodoProcIdx > -1 && row[metodoProcIdx])
        ? normClf(row[metodoProcIdx])
        : classificationNorm;

      rowsToInsert.push({
        platform_id: stage.platformId,
        placa: plateVal || 'SEM_PLACA',
        nome: getVal(row, 'driver') ? String(getVal(row, 'driver')).trim() : null,
        nome_evento: typeVal || 'Fadiga',
        severidade: getVal(row, 'criticality') ? normCrit(getVal(row, 'criticality')) : 'Médio',
        analise_ia_plataforma: resolvedClassification,
        velocidade_kmh: speedVal,
        localidade: getVal(row, 'location') ? String(getVal(row, 'location')).trim() : null,
        frota: getVal(row, 'fleet') ? String(getVal(row, 'fleet')).trim() : null,
        ocorrido_em: dt.toISOString(),
      });
    }

    if (rowsToInsert.length === 0) {
      setError('Nenhuma linha com data/hora válida e filtros correspondentes foi encontrada.');
      return;
    }

    onImportConfirm(rowsToInsert, stage.platformId, stage.platformName);
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

  return (
    <div data-noprint style={{ position: 'fixed', inset: 0, background: 'rgba(10,7,23,0.55)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
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
                Arraste a planilha aqui ou clique para selecionar
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
                Suporta XLSX, XLS ou CSV · A primeira aba do arquivo será utilizada
              </div>
            </div>

            {parsing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                <i className="ti ti-loader-2 fz-spin" style={{ fontSize: '16px', color: '#9E1A45' }}></i>
                Processando e analisando arquivo...
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
            
            <div className="field-mapping-table" style={{ flex: 1, overflowY: 'auto' }}>
              {fieldRows.map((f) => (
                <div key={f.key} className="field-mapping-row">
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {f.label}
                    {f.req && <span style={{ color: '#E24B4A', marginLeft: '3px' }}>*</span>}
                  </div>
                  <select
                    value={f.value}
                    onChange={f.onChange}
                    style={{ width: '100%', padding: '6px 9px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-primary)', background: 'var(--surface-0)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
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
                disabled={saving}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  backgroundColor: '#F26931',
                  color: '#fff',
                  opacity: saving ? 0.7 : 1,
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
      />
    </div>
  );
}
