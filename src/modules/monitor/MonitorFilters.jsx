export default function MonitorFilters({
  profile,
  filters,
  setFilters,
  transps,
  resetFilters,
  platform,
}) {
  const taxonomy    = platform?.taxonomy    || { intervencao: [], reportar: [], tecnico: [] };
  const severidades = platform?.severidades || ['Gravíssimo', 'Grave', 'Normal'];

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
            {severidades.map(sev => (
              <option key={sev} value={sev.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}>{sev}</option>
            ))}
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
            {taxonomy.intervencao.length > 0 && (
              <optgroup label="— Intervenção —">
                {taxonomy.intervencao.map(ev => <option key={ev} value={ev}>{ev}</option>)}
              </optgroup>
            )}
            {taxonomy.reportar.length > 0 && (
              <optgroup label="— Reportar —">
                {taxonomy.reportar.map(ev => <option key={ev} value={ev}>{ev}</option>)}
              </optgroup>
            )}
            {taxonomy.tecnico.length > 0 && (
              <optgroup label="— Técnico —">
                {taxonomy.tecnico.map(ev => <option key={ev} value={ev}>{ev}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <button className="btn btn-sm" onClick={resetFilters} disabled={!filters.turno && !filters.prioridade && !filters.empresa && !filters.comportamento}>
          Limpar
        </button>
      </div>
    </>
  );
}
