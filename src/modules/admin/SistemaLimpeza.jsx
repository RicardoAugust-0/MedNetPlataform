// deno-lint-ignore-file
import { useState, useMemo } from 'react';
import { useAtendimentos } from '../../hooks/useAtendimentos.js';
import { useToast } from '../../hooks/useToast.jsx';
import { buildCleanupDateRange } from './cleanupDateRange.js';
import { exportCSV } from '../monitor/utils.jsx';

const TIPO_OPTS = [
  { value: 'intervencao', label: 'Intervenção' },
  { value: 'reportar',    label: 'Reportar' },
  { value: 'descarte',    label: 'Descarte' },
  { value: 'limpeza',     label: 'Limpeza' },
];

// /admin/sistema/limpeza — apaga registros de `atendimentos` (irreversível).
export default function SistemaLimpeza() {
  const { loadAllByFilter, deleteByFilter } = useAtendimentos();
  const toast = useToast();
  const [period, setPeriod] = useState('todos'); // hoje | semana | mes | intervalo | todos
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');
  const [tipos, setTipos] = useState([]); // vazio = todos
  const [preview, setPreview] = useState(null); // { count, rows } | null
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [confirming, setConfirming]   = useState(false);
  const [deleting, setDeleting]       = useState(false);

  // Converte período relativo em YYYY-MM-DD usando o calendário local. Usar
  // toISOString aqui deslocava "hoje" para amanhã após 21h em UTC-3.
  const dateRange = useMemo(
    () => buildCleanupDateRange(period, from, to),
    [period, from, to],
  );

  const canPreview = period !== 'intervalo' || (from && to);

  const handlePreview = async () => {
    setLoadingPreview(true);
    setPreview(null);
    const { data, error } = await loadAllByFilter({
      from: dateRange.from,
      to:   dateRange.to,
      tipos: tipos.length > 0 ? tipos : undefined,
    });
    if (error) {
      toast('Erro ao carregar prévia: ' + error, 'error');
      setLoadingPreview(false);
      return;
    }
    setPreview({ count: data.length, rows: data });
    setLoadingPreview(false);
  };

  const handleStartConfirm = () => {
    if (!preview || preview.count === 0) return;
    setConfirmText('');
    setConfirming(true);
  };

  const handleCancel = () => {
    setConfirming(false);
    setConfirmText('');
  };

  const handleExecute = async () => {
    if (confirmText !== 'LIMPAR') return;
    setDeleting(true);
    try {
      // Exporta CSV antes (rede de segurança)
      if (preview.rows.length > 0) exportCSV(preview.rows);
      const { count, error } = await deleteByFilter({
        from: dateRange.from,
        to:   dateRange.to,
        tipos: tipos.length > 0 ? tipos : undefined,
      });
      if (error) {
        toast('Erro ao limpar: ' + error, 'error');
      } else {
        toast(`${count} registro(s) apagado(s). CSV baixado.`, 'success');
        setPreview(null);
        setConfirming(false);
        setConfirmText('');
      }
    } finally {
      setDeleting(false);
    }
  };

  const toggleTipo = (t) => {
    setTipos(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    setPreview(null);
  };

  const resetPreview = () => setPreview(null);

  return (
    <div className="fz-in" style={{ maxWidth: 720, width: '100%' }}>
      <div className="card" style={{ marginBottom: 16, borderColor: confirming ? 'var(--danger-500)' : undefined }}>
        <div className="card-header">
          <div className="card-title">
            <i className="ti ti-eraser" style={{ color: 'var(--danger-500)' }}></i> Limpar histórico de atendimentos
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.55 }}>
          Apaga registros da tabela <code>atendimentos</code> (intervenções, descartes, reportar, limpeza). Um CSV de backup é baixado automaticamente antes do delete. <strong>Ação irreversível.</strong>
        </div>

        <div className="form-group" style={{ marginBottom: 10 }}>
          <label className="form-label" htmlFor="clear-period">Período</label>
          <select id="clear-period" className="form-control" value={period} onChange={e => { setPeriod(e.target.value); resetPreview(); }} disabled={confirming || deleting}>
            <option value="todos">Todos (apagar histórico inteiro)</option>
            <option value="hoje">Hoje</option>
            <option value="semana">Últimos 7 dias</option>
            <option value="mes">Últimos 30 dias</option>
            <option value="intervalo">Intervalo personalizado</option>
          </select>
        </div>

        {period === 'intervalo' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label" htmlFor="clear-date-from">De</label>
              <input id="clear-date-from" className="form-control" type="date" value={from} onChange={e => { setFrom(e.target.value); resetPreview(); }} disabled={confirming || deleting} />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label" htmlFor="clear-date-to">Até</label>
              <input id="clear-date-to" className="form-control" type="date" value={to} onChange={e => { setTo(e.target.value); resetPreview(); }} disabled={confirming || deleting} />
            </div>
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Tipos (vazio = todos)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TIPO_OPTS.map(opt => {
              const active = tipos.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`btn btn-sm ${active ? 'btn-primary' : ''}`}
                  onClick={() => toggleTipo(opt.value)}
                  disabled={confirming || deleting}
                  style={{ fontSize: 11.5 }}
                >
                  {active && <i className="ti ti-check" style={{ marginRight: 4 }}></i>}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {!confirming && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              onClick={handlePreview}
              disabled={!canPreview || loadingPreview || deleting}
            >
              {loadingPreview ? <><i className="ti ti-loader-2"></i> Calculando…</> : <><i className="ti ti-eye"></i> Calcular prévia</>}
            </button>
            {preview && (
              <>
                <span style={{ fontSize: 13, color: preview.count > 0 ? 'var(--danger-500)' : 'var(--text-muted)', fontWeight: 600 }}>
                  {preview.count} registro(s) serão apagados
                </span>
                <button
                  type="button"
                  className="btn"
                  onClick={handleStartConfirm}
                  disabled={preview.count === 0}
                  style={{ background: 'var(--danger-500)', color: '#fff', border: 'none', marginLeft: 'auto' }}
                >
                  <i className="ti ti-trash"></i> Exportar CSV e limpar
                </button>
              </>
            )}
          </div>
        )}

        {confirming && (
          <div style={{ padding: 12, background: 'var(--danger-50, rgba(220, 38, 38, 0.08))', borderRadius: 6, border: '1px solid var(--danger-500)' }}>
            <div style={{ fontSize: 13, color: 'var(--danger-600, var(--danger-500))', marginBottom: 8, lineHeight: 1.5 }}>
              <i className="ti ti-alert-triangle" style={{ marginRight: 4 }}></i>
              Você vai apagar <strong>{preview.count}</strong> registro(s) de forma permanente. Digite <code>LIMPAR</code> para confirmar.
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="form-control"
                style={{ flex: 1 }}
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Digite LIMPAR"
                disabled={deleting}
                autoFocus
              />
              <button
                type="button"
                className="btn"
                onClick={handleExecute}
                disabled={confirmText !== 'LIMPAR' || deleting}
                style={{ background: 'var(--danger-500)', color: '#fff', border: 'none' }}
              >
                {deleting ? <><i className="ti ti-loader-2"></i> Apagando…</> : <><i className="ti ti-check"></i> Confirmar</>}
              </button>
              <button type="button" className="btn" onClick={handleCancel} disabled={deleting}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
