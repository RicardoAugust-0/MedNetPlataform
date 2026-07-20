import { useState } from 'react';

// Skeleton loader for table
const TableSkeleton = () => (
  <div className="space-y-4 py-2">
    {/* Table Header Skeleton */}
    <div className="animate-pulse grid grid-cols-6 gap-4 pb-3 border-b border-[var(--border)]">
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div>
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3"></div>
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div>
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4"></div>
    </div>
    {/* Table Rows Skeleton */}
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="animate-pulse grid grid-cols-6 gap-4 py-4 border-b border-[var(--border)]/40">
        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div>
        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3"></div>
        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4"></div>
      </div>
    ))}
  </div>
);

export default function DispatchesTable({ dispatches = [], loadingDispatches = false, fetchDispatches }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [vagaFilter, setVagaFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [filterReferenceTime, setFilterReferenceTime] = useState(Date.now);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Extract unique job/vacancy names from variables (usually index 1, i.e. {{2}})
  const uniqueVagas = Array.from(new Set(
    dispatches.flatMap(d => {
      if (!Array.isArray(d.variables)) return [];
      if (d.variables.length > 1 && typeof d.variables[1] === 'string') {
        return [d.variables[1]];
      }
      return d.variables.filter(v => typeof v === 'string' && v.length > 2 && !v.includes('+') && !v.match(/^\d+$/));
    })
  )).filter(Boolean).sort();

  // Filtered dispatches logic
  const filteredDispatches = dispatches.filter(d => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      d.recipient_name?.toLowerCase().includes(query) ||
      d.recipient_phone?.includes(query) ||
      d.template_name?.toLowerCase().includes(query);
      
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    
    // Match Vaga
    let matchesVaga = true;
    if (vagaFilter !== 'all') {
      matchesVaga = Array.isArray(d.variables) && d.variables.includes(vagaFilter);
    }
    
    let matchesDate = true;
    if (dateFilter === 'today') {
      const dDate = new Date(d.created_at);
      const today = new Date(filterReferenceTime);
      matchesDate = dDate.toDateString() === today.toDateString();
    } else if (dateFilter === 'week') {
      const dDate = new Date(d.created_at).getTime();
      const sevenDaysAgo = filterReferenceTime - 7 * 24 * 60 * 60 * 1000;
      matchesDate = dDate >= sevenDaysAgo;
    }
    
    return matchesSearch && matchesStatus && matchesVaga && matchesDate;
  });

  // Pagination for logs table
  const totalPages = Math.ceil(filteredDispatches.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedDispatches = filteredDispatches.slice(startIndex, startIndex + itemsPerPage);

  const resetFilters = () => {
    setSearchQuery('');
    setVagaFilter('all');
    setStatusFilter('all');
    setDateFilter('all');
    setFilterReferenceTime(Date.now());
    setCurrentPage(1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      {/* Advanced Search and Filter Section (Aligned with Design System tokens) */}
      <div 
        className="card"
        style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', width: '100%', padding: '16px 20px' }}
      >
        {/* Search box with magnifying glass */}
        <div className="search-wrap" style={{ maxWidth: '400px', width: '100%' }}>
          <i className="ti ti-search"></i>
          <input 
            placeholder="Buscar destinatário, celular ou template..." 
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            style={{ border: 'none', background: 'none', boxShadow: 'none', outline: 'none' }}
          />
          {searchQuery && (
            <button 
              onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
              className="btn-ghost"
              style={{ border: 'none', background: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <i className="ti ti-x" style={{ fontSize: '12px' }}></i>
            </button>
          )}
        </div>
        
        {/* Dropdowns Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          {/* Filter Vaga */}
          <select 
            className="form-control"
            value={vagaFilter}
            onChange={e => { setVagaFilter(e.target.value); setCurrentPage(1); }}
            style={{ width: 'auto', minWidth: '140px', height: '38px', padding: '0 10px', fontWeight: '600', color: 'var(--text-secondary)' }}
          >
            <option value="all">Vagas: Todas</option>
            {uniqueVagas.map(vaga => (
              <option key={vaga} value={vaga}>Vaga: {vaga}</option>
            ))}
          </select>

          {/* Filter Status */}
          <select 
            className="form-control"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            style={{ width: 'auto', minWidth: '140px', height: '38px', padding: '0 10px', fontWeight: '600', color: 'var(--text-secondary)' }}
          >
            <option value="all">Status: Todos</option>
            <option value="sent">Status: Enviados</option>
            <option value="delivered">Status: Entregues</option>
            <option value="read">Status: Lidos</option>
            <option value="failed">Status: Falhas</option>
          </select>

          {/* Filter Period */}
          <select 
            className="form-control"
            value={dateFilter}
            onChange={e => { setDateFilter(e.target.value); setFilterReferenceTime(Date.now()); setCurrentPage(1); }}
            style={{ width: 'auto', minWidth: '140px', height: '38px', padding: '0 10px', fontWeight: '600', color: 'var(--text-secondary)' }}
          >
            <option value="all">Período: Todo histórico</option>
            <option value="today">Período: Hoje</option>
            <option value="week">Período: 7 dias</option>
          </select>

          {/* Clear Filters Button */}
          {(searchQuery || vagaFilter !== 'all' || statusFilter !== 'all' || dateFilter !== 'all') && (
            <button 
              className="btn btn-sm"
              onClick={resetFilters}
              style={{ borderStyle: 'dashed', fontWeight: '600' }}
            >
              <i className="ti ti-filter-off"></i> Limpar
            </button>
          )}

          {/* Refresh button */}
          <button 
            className="btn btn-icon-only"
            onClick={fetchDispatches} 
            disabled={loadingDispatches}
            title="Atualizar histórico"
            style={{ height: '38px', width: '38px', justifyContent: 'center' }}
          >
            <i className={`ti ${loadingDispatches ? 'ti-loader-2 animate-spin' : 'ti-refresh'}`} style={{ fontSize: '14px' }}></i>
          </button>
        </div>
      </div>

      {/* Logs Table Card */}
      <div className="card" style={{ width: '100%', overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h4 style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-secondary)', margin: 0 }}>Histórico de Envios</h4>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Logs de entregas monitorados em tempo real via Meta Cloud Webhooks.</p>
          </div>
          <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '4px 10px', borderRadius: '12px', backgroundColor: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
            {filteredDispatches.length} registros
          </span>
        </div>

        {loadingDispatches && dispatches.length === 0 ? (
          <div style={{ padding: '24px' }}><TableSkeleton /></div>
        ) : filteredDispatches.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-mail-opened"></i>
            <h5 style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '4px' }}>Nenhum disparo encontrado</h5>
            <p style={{ fontSize: '12px', maxWidth: '380px', margin: '0 auto', lineHeight: '1.5' }}>Não encontramos nenhum registro para os filtros aplicados. Tente ajustar os filtros ou realizar um disparo de teste.</p>
          </div>
        ) : (
          <div style={{ width: '100%' }}>
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-1)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '10px' }}>
                    <th style={{ padding: '12px 24px' }}>Data/Hora</th>
                    <th style={{ padding: '12px 24px' }}>Destinatário</th>
                    <th style={{ padding: '12px 24px' }}>Celular</th>
                    <th style={{ padding: '12px 24px' }}>Template</th>
                    <th style={{ padding: '12px 24px' }}>Status</th>
                    <th style={{ padding: '12px 24px', textAlign: 'right' }}>Custo Est.</th>
                  </tr>
                </thead>
                <tbody style={{ display: 'table-row-group', verticalAlign: 'middle' }}>
                  {paginatedDispatches.map(d => {
                    const date = new Date(d.created_at).toLocaleString('pt-BR');
                    
                    // Styled Badges complying 100% with the design system variables in tokens.css
                    const statusStyles = {
                      sent: { 
                        style: { backgroundColor: 'var(--info-bg)', color: 'var(--info-500)', borderColor: 'rgba(42, 141, 217, 0.22)' },
                        label: 'Enviado', 
                        icon: 'ti-send' 
                      },
                      delivered: { 
                        style: { backgroundColor: 'var(--tag-contato-bg)', color: 'var(--tag-contato-color)', borderColor: 'rgba(12, 68, 124, 0.22)' },
                        label: 'Entregue', 
                        icon: 'ti-check' 
                      },
                      read: { 
                        style: { backgroundColor: 'var(--success-bg)', color: 'var(--success-600)', borderColor: 'rgba(45, 167, 90, 0.22)' },
                        label: 'Lido', 
                        icon: 'ti-checks' 
                      },
                      failed: { 
                        style: { backgroundColor: 'var(--danger-bg)', color: 'var(--danger-600)', borderColor: 'rgba(226, 75, 74, 0.22)' },
                        label: 'Falhou', 
                        icon: 'ti-alert-circle' 
                      }
                    };
                    
                    const st = statusStyles[d.status] || { 
                      style: { backgroundColor: 'var(--surface-2)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }, 
                      label: d.status, 
                      icon: 'ti-info-circle' 
                    };
                    
                    return (
                      <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }} className="table-row-hover">
                        <td style={{ padding: '14px 24px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{date}</td>
                        <td style={{ padding: '14px 24px', fontWeight: '600', color: 'var(--text-primary)' }}>{d.recipient_name}</td>
                        <td style={{ padding: '14px 24px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{d.recipient_phone}</td>
                        <td style={{ padding: '14px 24px', color: 'var(--text-secondary)', fontWeight: '500' }}>{d.template_name}</td>
                        <td style={{ padding: '14px 24px' }}>
                          <span 
                            style={{ 
                              display: 'inline-flex', alignItems: 'center', gap: '6px', 
                              padding: '2px 10px', borderRadius: '99px', fontSize: '10px', fontWeight: '800',
                              border: '1px solid transparent', ...st.style 
                            }}
                            title={d.status === 'failed' && d.error_message ? d.error_message : undefined}
                          >
                            <i className={`ti ${st.icon}`} style={{ fontSize: '11px' }}></i>
                            {st.label}
                            {d.status === 'failed' && d.error_message && <i className="ti ti-info-circle" style={{ fontSize: '9px', opacity: 0.75 }}></i>}
                          </span>
                        </td>
                        <td style={{ padding: '14px 24px', textAlign: 'right', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                          R$ {Number(d.estimated_cost || 0).toFixed(2).replace('.', ',')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', backgroundColor: 'var(--surface-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>
                  Página <b>{currentPage}</b> de <b>{totalPages}</b> · Exibindo {paginatedDispatches.length} de {filteredDispatches.length} registros
                </span>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className="btn btn-sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  >
                    <i className="ti ti-chevron-left"></i> Anterior
                  </button>
                  <button 
                    className="btn btn-sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  >
                    Próximo <i className="ti ti-chevron-right"></i>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
