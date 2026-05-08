import { useState, useMemo, useEffect } from 'react';
import { exportCSV, EmptyState } from './utils';

export default function HistoryTab({ history, histLoading, histError, loadByRange, currentPage, setCurrentPage, pageSize }) {
  const [histPeriod, setHistPeriod] = useState('hoje');
  const [histTipo, setHistTipo] = useState('');
  const [histSearch, setHistSearch] = useState('');
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  
  const [rangeHistory, setRangeHistory] = useState([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState(null);

  // Filters logic
  const histFiltered = useMemo(() => {
    const now = new Date();
    return history.filter(item => {
      const d = new Date(item.created_at);
      if (histPeriod === 'hoje'   && d.toDateString() !== now.toDateString()) return false;
      if (histPeriod === 'semana' && (now - d) > 7 * 86400000)                return false;
      if (histPeriod === 'mes'    && (now - d) > 30 * 86400000)               return false;
      if (histTipo && item.tipo !== histTipo) return false;
      if (histSearch) {
        const q = histSearch.toLowerCase();
        if (!item.motorista?.toLowerCase().includes(q) && !item.operador?.toLowerCase().includes(q) && !item.placa?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [history, histPeriod, histTipo, histSearch]);

  useEffect(() => {
    if (histPeriod !== 'intervalo') {
      setRangeHistory([]);
      setRangeError(null);
    }
  }, [histPeriod]);

  const handleRangeSearch = async () => {
    if (!histFrom || !histTo) return;
    setRangeLoading(true);
    setRangeError(null);
    const { data, error } = await loadByRange(histFrom, histTo);
    setRangeHistory(data);
    if (error) setRangeError(error);
    setRangeLoading(false);
  };

  const displayHistory = histPeriod === 'intervalo' ? rangeHistory : histFiltered;
  const displayLoading = histPeriod === 'intervalo' ? rangeLoading : histLoading;
  const displayError   = histPeriod === 'intervalo' ? rangeError   : histError;

  // Pagination scoped for history
  const totalPages = Math.ceil(displayHistory.length / pageSize) || 1;
  const paginatedList = displayHistory.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const histIcon  = { intervencao: 'ti-headset', reportar: 'ti-building', descarte: 'ti-trash', limpeza: 'ti-trash' };
  const tipoLabel = { intervencao: 'Intervenção', reportar: 'Reportar', descarte: 'Descarte', limpeza: 'Limpeza' };
  const tipoBadge = { intervencao: 'danger', reportar: 'warning', descarte: 'info', limpeza: 'info' };

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: 8 }}>
        <div className="filter-group">
          <label>Período</label>
          <select value={histPeriod} onChange={e => { setHistPeriod(e.target.value); setCurrentPage(1); }}>
            <option value="hoje">Hoje</option>
            <option value="semana">7 dias</option>
            <option value="mes">30 dias</option>
            <option value="todos">Todos</option>
            <option value="intervalo">Intervalo personalizado</option>
          </select>
        </div>
        
        {histPeriod === 'intervalo' && (
          <>
            <div className="filter-group">
              <label>De</label>
              <input
                type="date"
                value={histFrom}
                onChange={e => setHistFrom(e.target.value)}
                style={{ padding:'4px 8px', fontSize:12, border:'1px solid var(--border-md)', borderRadius:'var(--radius-sm)', background:'var(--surface-0)', color:'var(--text-primary)' }}
              />
            </div>
            <div className="filter-group">
              <label>Até</label>
              <input
                type="date"
                value={histTo}
                onChange={e => setHistTo(e.target.value)}
                style={{ padding:'4px 8px', fontSize:12, border:'1px solid var(--border-md)', borderRadius:'var(--radius-sm)', background:'var(--surface-0)', color:'var(--text-primary)' }}
              />
            </div>
            <button className="btn btn-sm btn-primary" onClick={() => { handleRangeSearch(); setCurrentPage(1); }} disabled={!histFrom || !histTo}>
              <i className="ti ti-search"></i> Buscar
            </button>
          </>
        )}
        
        <div className="filter-group">
          <label>Tipo</label>
          <select value={histTipo} onChange={e => { setHistTipo(e.target.value); setCurrentPage(1); }}>
            <option value="">Todos</option>
            <option value="intervencao">Intervenção</option>
            <option value="reportar">Reportar</option>
            <option value="descarte">Descarte</option>
            <option value="limpeza">Limpeza</option>
          </select>
        </div>
        
        <div className="filter-group" style={{ flex: 1 }}>
          <label>Busca</label>
          <input
            style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--border-md)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-0)', color: 'var(--text-primary)', width: '100%' }}
            placeholder="Motorista, placa ou operador…"
            value={histSearch}
            onChange={e => { setHistSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>
        
        <button className="btn btn-sm" onClick={() => exportCSV(displayHistory)}>
          <i className="ti ti-download"></i> Exportar CSV
        </button>
      </div>

      {displayLoading ? (
        <div className="empty-state"><i className="ti ti-loader-2"></i> Carregando histórico…</div>
      ) : displayError ? (
        <div className="empty-state" style={{ color: 'var(--danger-500)' }}><i className="ti ti-alert-circle"></i> {displayError}</div>
      ) : displayHistory.length === 0 ? (
        <EmptyState icon="ti-history" msg="Nenhum registro encontrado" />
      ) : (
        <div className="driver-list">
          {paginatedList.map(item => (
            <div className="history-item" key={item.id} style={{ opacity: item._pending ? 0.6 : 1 }}>
              <div className="h-avatar"><i className={`ti ${histIcon[item.tipo] || 'ti-check'}`} style={{ fontSize: 13 }}></i></div>
              <div className="h-info">
                <div className="h-name">
                  {item.motorista}
                  {item.placa && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{item.placa}</span>}
                </div>
                <div className="h-meta">{item.operador} · {item.obs}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                <div className="h-time">{new Date(item.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })} {item.hora}</div>
                <span className={`badge badge-${tipoBadge[item.tipo] || 'info'}`} style={{ fontSize: 9.5 }}>{tipoLabel[item.tipo] || item.tipo}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
            <i className="ti ti-chevron-left"></i>
          </button>
          <span style={{ fontSize: 13, alignSelf: 'center', color: 'var(--text-muted)' }}>Página {currentPage} de {totalPages}</span>
          <button className="btn btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
            <i className="ti ti-chevron-right"></i>
          </button>
        </div>
      )}
    </div>
  );
}
