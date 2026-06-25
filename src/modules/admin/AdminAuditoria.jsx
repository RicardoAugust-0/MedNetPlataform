// deno-lint-ignore-file
import { useState, useMemo } from 'react';
import { useAtendimentos } from '../../hooks/useAtendimentos.js';
import { useCarrierAliases } from '../../hooks/useCarrierAliases.js';

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

export default function AdminAuditoria() {
  const { history, loading, reload } = useAtendimentos();
  const { resolveMonitorName } = useCarrierAliases();
  const [search, setSearch] = useState('');
  const [tipo, setTipo] = useState(''); // '' = todos
  const [currentPage, setCurrentPage] = useState(1);

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
          <button className="btn btn-sm" onClick={reload} disabled={loading}>
            <i className={`ti ti-refresh ${loading ? 'fz-spin' : ''}`}></i> Atualizar
          </button>
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
          <div className="empty-state"><i className="ti ti-loader-2 fz-spin"></i> Carregando trilha…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ fontSize: 12.5 }}>Nenhuma tratativa encontrada com os filtros atuais.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: 8 }}>Data/Hora</th>
                  <th style={{ padding: 8 }}>Tipo</th>
                  <th style={{ padding: 8 }}>Motorista</th>
                  <th style={{ padding: 8 }}>Placa</th>
                  <th style={{ padding: 8 }}>Transportadora</th>
                  <th style={{ padding: 8 }}>Operador</th>
                  <th style={{ padding: 8 }}>Observação</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(h => {
                  const meta = TIPO_META[h.tipo] || { label: h.tipo, badge: 'info' };
                  return (
                    <tr key={h.id} style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.02))' }}>
                      <td style={{ padding: 8, whiteSpace: 'nowrap', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {h.created_at ? new Date(h.created_at).toLocaleDateString('pt-BR') : '—'} {h.hora || ''}
                      </td>
                      <td style={{ padding: 8 }}>
                        <span className={`badge badge-${meta.badge}`} style={{ fontSize: 9.5 }}>{meta.label}</span>
                      </td>
                      <td style={{ padding: 8, fontWeight: 600, color: 'var(--text-primary)' }}>{h.motorista || '—'}</td>
                      <td style={{ padding: 8 }}>{h.placa || '—'}</td>
                      <td style={{ padding: 8 }}>{h.transportadora ? resolveMonitorName(h.transportadora) : '—'}</td>
                      <td style={{ padding: 8 }}>{h.operador || '—'}</td>
                      <td style={{ padding: 8, color: 'var(--text-secondary)' }}>{h.obs || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
                <button className="btn btn-sm" disabled={page === 1} onClick={() => setCurrentPage(page - 1)}>
                  <i className="ti ti-chevron-left"></i>
                </button>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Página {page} de {totalPages} · {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
                </span>
                <button className="btn btn-sm" disabled={page === totalPages} onClick={() => setCurrentPage(page + 1)}>
                  <i className="ti ti-chevron-right"></i>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
