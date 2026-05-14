export default function CrossCheckFilters({
  dateFrom,
  dateTo,
  hasDateData,
  filterBy,
  sortBy,
  onlyDivergences,
  carrierFilterLabel,
  searchQuery,
  onSearchChange,
  onDateFromChange,
  onDateToChange,
  onFilterByChange,
  onSortByChange,
  onToggleDivergences,
  onClearCarrierFilter,
  onClearFilters,
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 16 }}>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
        <label className="form-label" style={{ marginBottom: 4 }}>Período</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="form-control"
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            disabled={!hasDateData}
            style={{ minWidth: 140 }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>até</span>
          <input
            className="form-control"
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            disabled={!hasDateData}
            style={{ minWidth: 140 }}
          />
        </div>
        {!hasDateData && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Nenhuma coluna de data identificada nas planilhas.
          </div>
        )}
      </div>

      <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
        <label className="form-label" style={{ marginBottom: 4 }}>Filtrar por</label>
        <select className="form-control" value={filterBy} onChange={(e) => onFilterByChange(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="placa">Somente placas</option>
          <option value="motorista">Somente motoristas</option>
        </select>
      </div>

      <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
        <label className="form-label" style={{ marginBottom: 4 }}>Ordenar por</label>
        <select className="form-control" value={sortBy} onChange={(e) => onSortByChange(e.target.value)}>
          <option value="ocorrencias">Ocorrências</option>
          <option value="alfabetica">Ordem alfabética</option>
        </select>
      </div>

      <button
        type="button"
        className={`btn btn-sm ${onlyDivergences ? 'btn-primary' : 'btn-ghost'}`}
        onClick={onToggleDivergences}
      >
        <i className="ti ti-filter"></i> Somente divergências
      </button>

      {carrierFilterLabel && (
        <span className="badge badge-info" style={{ marginBottom: 2 }}>
          <i className="ti ti-building"></i> {carrierFilterLabel}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onClearCarrierFilter}
            style={{ padding: 0, border: 'none', marginLeft: 6 }}
          >
            <i className="ti ti-x"></i>
          </button>
        </span>
      )}

      <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
        <label className="form-label" style={{ marginBottom: 4 }}>
          <i className="ti ti-search" style={{ marginRight: 4 }}></i>Buscar resultado
        </label>
        <input
          type="search"
          className="form-control"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Placa ou motorista…"
          style={{ fontSize: 13 }}
        />
      </div>

      <button type="button" className="btn btn-sm btn-ghost" onClick={onClearFilters}>
        Limpar filtros
      </button>
    </div>
  );
}
