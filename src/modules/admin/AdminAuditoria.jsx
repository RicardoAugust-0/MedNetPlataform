// deno-lint-ignore-file
import { useState, useMemo } from 'react';
import { useAtendimentos } from '../../hooks/useAtendimentos.js';
import { useCarrierAliases } from '../../hooks/useCarrierAliases.js';
import Skeleton from '../../components/Skeleton.jsx';
import Pagination from '../../components/Pagination.jsx';
import DataTable from '../../components/DataTable.jsx';
import AuditTimeline from './AuditTimeline.jsx';

// /admin/auditoria — trilha global e somente-leitura de todas as tratativas
// (atendimentos) registradas pela equipe. Reaproveita o `history` já carregado
// pelo AtendimentosProvider (realtime), sem disparar nova carga.
const TIPO_META = {
  intervencao: { label: 'Intervenção', badge: 'danger' },
  reportar:    { label: 'Reportar',    badge: 'warning' },
  descarte:    { label: 'Descarte',    badge: 'info' },
  limpeza:     { label: 'Limpeza',     badge: 'info' },
};

const TIPOS = ['intervencao', 'reportar', 'descarte', 'limpeza'];
const PAGE_SIZE = 25;

const COLUMNS = (resolveMonitorName) => [
  {
    key: 'data',
    header: 'Data/Hora',
    cellStyle: { whiteSpace: 'nowrap', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
    render: h => `${h.created_at ? new Date(h.created_at).toLocaleDateString('pt-BR') : '—'} ${h.hora || ''}`,
  },
  {
    key: 'tipo',
    header: 'Tipo',
    render: h => {
      const meta = TIPO_META[h.tipo] || { label: h.tipo, badge: 'info' };
      return <span className={`badge badge-${meta.badge}`} style={{ fontSize: 9.5 }}>{meta.label}</span>;
    },
  },
  {
    key: 'motorista',
    header: 'Motorista',
    cellStyle: { fontWeight: 600, color: 'var(--text-primary)' },
    render: h => h.motorista || '—',
  },
  { key: 'placa', header: 'Placa', render: h => h.placa || '—' },
  { key: 'transportadora', header: 'Transportadora', render: h => (h.transportadora ? resolveMonitorName(h.transportadora) : '—') },
  { key: 'operador', header: 'Operador', render: h => h.operador || '—' },
  { key: 'obs', header: 'Observação', cellStyle: { color: 'var(--text-secondary)' }, render: h => h.obs || '—' },
];

export default function AdminAuditoria() {
  const { history, loading, reload } = useAtendimentos();
  const { resolveMonitorName } = useCarrierAliases();
  const [search, setSearch] = useState('');
  const [tipo, setTipo] = useState(''); // '' = todos
  const [currentPage, setCurrentPage] = useState(1);
  const [view, setView] = useState('table'); // 'table' | 'timeline'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return history.filter(h => {
      if (tipo && h.tipo !== tipo) return false;
      if (!q) return true;
      return (
        (h.motorista || '').toLowerCase().includes(q) ||
        (h.placa || '').toLowerCase().includes(q) ||
        (h.operador || '').toLowerCase().includes(q) ||
        (h.transportadora || '').toLowerCase().includes(q)
      );
    });
  }, [history, search, tipo]);

  // Paginação. O clamp da página evita ficar numa página vazia quando a lista
  // encolhe (filtro mais restrito ou DELETE chegando via realtime).
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="fz-in" style={{ width: '100%' }}>
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div className="card-title">
            <i className="ti ti-history"></i> Trilha de tratativas · {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="seg">
              <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')} title="Ver como tabela">
                <i className="ti ti-table"></i>
              </button>
              <button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')} title="Ver como linha do tempo">
                <i className="ti ti-timeline-event"></i>
              </button>
            </div>
            <button className="btn btn-sm" onClick={reload} disabled={loading}>
              <i className={`ti ti-refresh ${loading ? 'fz-spin' : ''}`}></i> Atualizar
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <input
            className="form-control"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="Buscar por motorista, placa, operador ou transportadora…"
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
          />
          <select className="form-control" style={{ width: 'auto' }} value={tipo} onChange={e => { setTipo(e.target.value); setCurrentPage(1); }}>
            <option value="">Todos os tipos</option>
            {TIPOS.map(t => <option key={t} value={t}>{TIPO_META[t].label}</option>)}
          </select>
        </div>

        {loading && history.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} height={30} radius={6} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ fontSize: 12.5 }}>Nenhuma tratativa encontrada com os filtros atuais.</div>
        ) : (
          <div>
            {view === 'table' ? (
              <DataTable columns={COLUMNS(resolveMonitorName)} rows={pageRows} />
            ) : (
              <AuditTimeline rows={pageRows} resolveMonitorName={resolveMonitorName} />
            )}
            <Pagination page={page} totalPages={totalPages} onPageChange={setCurrentPage} totalCount={filtered.length} />
          </div>
        )}
      </div>
    </div>
  );
}
