export default function MonitorFilters({
  profile,
  filters,
  setFilters,
  transps,
  resetFilters
}) {
  return (
    <>
      {/* Operador */}
      <div className="operator-bar">
        <label><i className="ti ti-user"></i> Operador:</label>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{profile?.nome}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{profile?.cargo} · {profile?.email}</span>
      </div>

      {/* Filtros fila */}
      <div className="filter-bar">
        <div className="filter-group"><label><i className="ti ti-filter"></i> Filtros:</label></div>
        <div className="filter-group">
          <label>Turno</label>
          <select value={filters.turno} onChange={e => setFilters({ ...filters, turno: e.target.value })}>
            <option value="">Ambos</option>
            <option value="diurno">Diurno (06–18h)</option>
            <option value="noturno">Noturno (18–06h)</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Severidade</label>
          <select value={filters.prioridade} onChange={e => setFilters({ ...filters, prioridade: e.target.value })}>
            <option value="">Todas</option>
            <option value="gravissimo">Gravíssimo</option>
            <option value="grave">Grave</option>
            <option value="normal">Normal</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Transportadora</label>
          <select value={filters.empresa} onChange={e => setFilters({ ...filters, empresa: e.target.value })}>
            <option value="">Todas</option>
            {transps.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Evento</label>
          <select value={filters.comportamento} onChange={e => setFilters({ ...filters, comportamento: e.target.value })}>
            <option value="">Todos</option>
            <optgroup label="— Intervenção —">
              <option value="Bocejo">Bocejo</option>
              <option value="Olho fechado">Olho fechado</option>
            </optgroup>
            <optgroup label="— Reportar —">
              <option value="Distração">Distração genérica</option>
              <option value="Uso de celular">Uso de celular</option>
              <option value="Fumando">Fumando</option>
            </optgroup>
          </select>
        </div>
        <button className="btn btn-sm" onClick={resetFilters} disabled={!filters.turno && !filters.prioridade && !filters.empresa && !filters.comportamento}>
          Limpar
        </button>
      </div>
    </>
  );
}
