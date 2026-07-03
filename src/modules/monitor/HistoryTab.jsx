import { useState, useMemo } from 'react';
import { exportCSV } from './utils';
import { useSheetHistory } from '../../hooks/useSheetHistory.js';
import Skeleton from '../../components/Skeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Pagination from '../../components/Pagination.jsx';

function HistoryRowSkeleton() {
  return (
    <div className="history-item">
      <Skeleton circle width={32} height={32} />
      <div className="h-info" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton width={160} height={12} />
        <Skeleton width={220} height={10} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        <Skeleton width={70} height={10} />
        <Skeleton width={60} height={14} radius={99} />
      </div>
    </div>
  );
}

const SHEET_PAGE_SIZE = 15;

const MESES_NUM = {
  JANEIRO:1, FEVEREIRO:2, 'MARÇO':3, ABRIL:4, MAIO:5, JUNHO:6,
  JULHO:7, AGOSTO:8, SETEMBRO:9, OUTUBRO:10, NOVEMBRO:11, DEZEMBRO:12,
};

function sheetSortKey(row) {
  const [mesNome, anoStr] = (row._mes || '').split(' ');
  const year  = parseInt(anoStr) || 0;
  const month = MESES_NUM[mesNome] || 0;
  const [dStr] = (row.data || '').split('/');
  const day = parseInt(dStr) || 0;
  return year * 10000 + month * 100 + day;
}

const CRITICIDADE_COLOR = {
  'GRAVÍSSIMO': 'var(--danger-500)',
  'GRAVE':      'var(--warning-500)',
  'MÉDIO':      'var(--accent-500)',
};

function SheetRow({ row }) {
  const color = CRITICIDADE_COLOR[row.criticidade?.toUpperCase()] || 'var(--text-muted)';
  const done  = Boolean(row.realizadoPor?.trim());
  return (
    <div className="history-item">
      <div className="h-avatar" style={{ background: 'var(--surface-2)' }}>
        <i className="ti ti-table-column" style={{ fontSize: 13, color: 'var(--accent-500)' }}></i>
      </div>
      <div className="h-info">
        <div className="h-name">
          {row.colaborador || '—'}
          {row.placa && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{row.placa}</span>}
          {row.empresa && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>· {row.empresa}</span>}
        </div>
        <div className="h-meta">
          {row.sistema && <span style={{ marginRight: 8 }}>{row.sistema}</span>}
          {row.solicitadoPor && <span>Solicitado por {row.solicitadoPor}</span>}
          {done && row.realizadoPor && <span style={{ marginLeft: 8 }}>· Realizado por {row.realizadoPor}{row.horaRealizacao ? ` às ${row.horaRealizacao}` : ''}</span>}
          {row.justificativa && <span style={{ marginLeft: 8, fontStyle: 'italic' }}>· {row.justificativa}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
        <div className="h-time">
          {row.data} {row.horaSolicitacao && `· ${row.horaSolicitacao}`}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {row.criticidade && (
            <span className="badge" style={{ fontSize: 9.5, background: color, color: '#fff' }}>
              {row.criticidade}
            </span>
          )}
          <span className={`badge badge-${done ? 'success' : 'warning'}`} style={{ fontSize: 9.5 }}>
            {done ? 'Realizado' : 'Pendente'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function HistoryTab({ history, histLoading, histError, loadByRange, currentPage, setCurrentPage, pageSize, initialSearch = '' }) {
  const [histPeriod, setHistPeriod] = useState(initialSearch ? 'todos' : 'hoje');
  const [histTipo, setHistTipo]     = useState('');
  const [histSearch, setHistSearch] = useState(initialSearch);
  const [histFrom, setHistFrom]     = useState('');
  const [histTo, setHistTo]         = useState('');

  const [rangeHistory, setRangeHistory] = useState([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError]     = useState(null);

  const [showSheets, setShowSheets] = useState(false);
  const [sheetSearch, setSheetSearch] = useState('');
  const [sheetPage, setSheetPage] = useState(1);
  const sheet = useSheetHistory();

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



  const handleRangeSearch = async () => {
    if (!histFrom || !histTo) return;
    setRangeLoading(true);
    setRangeError(null);
    const { data, error } = await loadByRange(histFrom, histTo);
    setRangeHistory(data);
    if (error) setRangeError(error);
    setRangeLoading(false);
  };

  const handleToggleSheets = () => {
    if (!showSheets && !sheet.loaded) sheet.load();
    setShowSheets(v => !v);
    setSheetPage(1);
  };

  const displayHistory = histPeriod === 'intervalo' ? rangeHistory : histFiltered;
  const displayLoading  = histPeriod === 'intervalo' ? rangeLoading : histLoading;
  const displayError    = histPeriod === 'intervalo' ? rangeError   : histError;

  const totalPages  = Math.ceil(displayHistory.length / pageSize) || 1;
  const paginatedList = displayHistory.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const sheetFiltered = useMemo(() => {
    const q = sheetSearch.trim().toLowerCase();
    const filtered = q
      ? sheet.rows.filter(r =>
          r.colaborador?.toLowerCase().includes(q) ||
          r.placa?.toLowerCase().includes(q) ||
          r.empresa?.toLowerCase().includes(q) ||
          r.solicitadoPor?.toLowerCase().includes(q)
        )
      : sheet.rows;
    return [...filtered].sort((a, b) => sheetSortKey(b) - sheetSortKey(a));
  }, [sheet.rows, sheetSearch]);

  const sheetTotalPages   = Math.ceil(sheetFiltered.length / SHEET_PAGE_SIZE) || 1;
  const sheetPaginatedList = sheetFiltered.slice((sheetPage - 1) * SHEET_PAGE_SIZE, sheetPage * SHEET_PAGE_SIZE);

  const histIcon  = { intervencao: 'ti-headset', reportar: 'ti-building', descarte: 'ti-trash', limpeza: 'ti-trash' };
  const tipoLabel = { intervencao: 'Intervenção', reportar: 'Reportar', descarte: 'Descarte', limpeza: 'Limpeza' };
  const tipoBadge = { intervencao: 'danger', reportar: 'warning', descarte: 'info', limpeza: 'info' };

  return (
    <div>
      {/* Filtros do histórico Supabase */}
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
                type="date" value={histFrom} onChange={e => setHistFrom(e.target.value)}
                style={{ padding:'4px 8px', fontSize:12, border:'1px solid var(--border-md)', borderRadius:'var(--radius-sm)', background:'var(--surface-0)', color:'var(--text-primary)' }}
              />
            </div>
            <div className="filter-group">
              <label>Até</label>
              <input
                type="date" value={histTo} onChange={e => setHistTo(e.target.value)}
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
            style={{ padding:'4px 8px', fontSize:12, border:'1px solid var(--border-md)', borderRadius:'var(--radius-sm)', background:'var(--surface-0)', color:'var(--text-primary)', width:'100%' }}
            placeholder="Motorista, placa ou operador…"
            value={histSearch}
            onChange={e => { setHistSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <button className="btn btn-sm" onClick={() => exportCSV(displayHistory)}>
          <i className="ti ti-download"></i> Exportar CSV
        </button>

        <button
          className={`btn btn-sm ${showSheets ? 'btn-primary' : 'btn-ghost'}`}
          onClick={handleToggleSheets}
          title="Visualizar atendimentos registrados diretamente na planilha Google Sheets"
        >
          <i className="ti ti-table-column"></i> Planilha Sheets
        </button>
      </div>

      {/* Histórico Supabase */}
      {displayLoading ? (
        <div className="driver-list" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => <HistoryRowSkeleton key={i} />)}
        </div>
      ) : displayError ? (
        <div className="empty-state" style={{ color:'var(--danger-500)' }}><i className="ti ti-alert-circle"></i> {displayError}</div>
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
                  {item.placa && <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:6 }}>{item.placa}</span>}
                </div>
                <div className="h-meta">{item.operador} · {item.obs}</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3, flexShrink:0 }}>
                <div className="h-time">{new Date(item.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })} {item.hora}</div>
                <span className={`badge badge-${tipoBadge[item.tipo] || 'info'}`} style={{ fontSize:9.5 }}>{tipoLabel[item.tipo] || item.tipo}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />

      {/* Seção Planilha Google Sheets */}
      {showSheets && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12, flexWrap:'wrap' }}>
            <div style={{ fontWeight:600, fontSize:14, color:'var(--text-primary)' }}>
              <i className="ti ti-table-column" style={{ color:'var(--accent-500)', marginRight:6 }}></i>
              Planilha Google Sheets
              {sheet.loaded && <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:400, marginLeft:8 }}>{sheetFiltered.length} registro(s) · mês atual + anterior</span>}
            </div>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => sheet.load()}
              disabled={sheet.loading}
              title="Recarregar planilha"
            >
              <i className={`ti ${sheet.loading ? 'ti-loader-2 ti-spin' : 'ti-refresh'}`}></i>
            </button>
            {sheet.loaded && (
              <input
                style={{ padding:'4px 8px', fontSize:12, border:'1px solid var(--border-md)', borderRadius:'var(--radius-sm)', background:'var(--surface-0)', color:'var(--text-primary)', minWidth:200 }}
                placeholder="Buscar colaborador, placa, empresa…"
                value={sheetSearch}
                onChange={e => { setSheetSearch(e.target.value); setSheetPage(1); }}
              />
            )}
          </div>

          {sheet.loading && (
            <div className="driver-list" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => <HistoryRowSkeleton key={i} />)}
            </div>
          )}
          {sheet.error  && <div className="empty-state" style={{ color:'var(--danger-500)' }}><i className="ti ti-alert-circle"></i> {sheet.error}</div>}
          {sheet.loaded && sheetFiltered.length === 0 && <EmptyState icon="ti-table-off" msg="Nenhum registro encontrado na planilha" />}
          {sheet.loaded && sheetFiltered.length > 0 && (
            <>
              <div className="driver-list">
                {sheetPaginatedList.map((row, i) => <SheetRow key={i} row={row} />)}
              </div>
              <Pagination page={sheetPage} totalPages={sheetTotalPages} onPageChange={setSheetPage} totalCount={sheetFiltered.length} style={{ marginTop: 12 }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
