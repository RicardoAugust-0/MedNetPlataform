export function FilterBar({ filters, setFilters, tipos: TIPOS, resultados: RESULTADOS, transportadoras: TRANSPORTADORAS_RAW, equipe: EQUIPE_LISTA, periodos: PERIODOS }) {
  const TRANSPORTADORAS = TRANSPORTADORAS_RAW.map(t => typeof t === 'string' ? { name: t, total: 0, abertos: 0 } : t);
  const toggleSet = (key, id) => {
    const set = new Set(filters[key]);
    set.has(id) ? set.delete(id) : set.add(id);
    setFilters({ ...filters, [key]: [...set] });
  };
  // Selecionar placeholder vazio "Outras…" volta pra "todas" (não zera o filtro)
  const setEmpresa = (e) => setFilters({ ...filters, empresa: e.target.value || 'todas' });
  const toggleEmpresa = (name) =>
    setFilters({ ...filters, empresa: filters.empresa === name ? 'todas' : name });
  const setPeriodo = (id) => setFilters({ ...filters, periodo: id });
  const reset = () => setFilters({ tipo: [], resultado: [], empresa: 'todas', periodo: 'hoje', operador: 'todos' });

  const hasFilter = filters.tipo.length || filters.resultado.length || filters.empresa !== 'todas' || filters.operador !== 'todos' || filters.periodo !== 'hoje';

  return (
    <div className="dg-filters">
      <div className="dg-filter-group">
        <label><i className="ti ti-radar" style={{ fontSize: 11, marginRight: 3 }}></i>Tipo do alerta</label>
        <div className="dg-chip-row">
          {TIPOS.map(c => (
            <span
              key={c.id}
              className={`dg-chip${filters.tipo.includes(c.id) ? ' active' : ''}`}
              onClick={() => toggleSet('tipo', c.id)}
              style={filters.tipo.includes(c.id) ? { background: c.color, borderColor: c.color, boxShadow: `0 4px 12px ${c.color}40` } : null}
              title={c.hint}
            >
              <span className="dot" style={{ background: c.color }}></span>
              {c.label}
              <span className="count">{c.count}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="dg-filter-divider"></div>

      <div className="dg-filter-group">
        <label><i className="ti ti-checks" style={{ fontSize: 11, marginRight: 3 }}></i>Resultado</label>
        <div className="dg-chip-row">
          {RESULTADOS.map(c => (
            <span
              key={c.id}
              className={`dg-chip${filters.resultado.includes(c.id) ? ' active' : ''}`}
              onClick={() => toggleSet('resultado', c.id)}
              style={filters.resultado.includes(c.id) ? { background: c.color, borderColor: c.color, boxShadow: `0 4px 12px ${c.color}40` } : null}
              title={c.hint}
            >
              {c.id === 'pos-positivo' && <i className="ti ti-refresh" style={{ fontSize: 11 }}></i>}
              <span className="dot" style={{ background: c.color }}></span>
              {c.label}
              <span className="count">{c.count}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="dg-filter-divider"></div>

      <div className="dg-filter-group" style={{ flex: '1 1 auto', minWidth: 0 }}>
        <label>Empresa</label>
        <div className="dg-chip-row" style={{ alignItems: 'center' }}>
          <span
            className={`dg-chip${filters.empresa === 'todas' ? ' active' : ''}`}
            onClick={() => setFilters({ ...filters, empresa: 'todas' })}
          >Todas</span>
          {TRANSPORTADORAS.slice(0, 6).map(t => (
            <span
              key={t.name}
              className={`dg-chip${filters.empresa === t.name ? ' active' : ''}`}
              onClick={() => toggleEmpresa(t.name)}
              title={`${t.name} · ${t.total} alertas · ${t.abertos} em aberto · clique pra alternar`}
            >
              {t.name.split(' ')[0]}
              <span className="count">{t.total}</span>
            </span>
          ))}
          {TRANSPORTADORAS.length > 6 && (
            <select
              className="dg-select"
              value={TRANSPORTADORAS.slice(0, 6).find(t => t.name === filters.empresa) || filters.empresa === 'todas' ? '' : filters.empresa}
              onChange={setEmpresa}
              style={{ minWidth: 130 }}
            >
              <option value="">Outras…</option>
              {TRANSPORTADORAS.slice(6).map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="dg-filter-group">
        <label>Operador</label>
        <select className="dg-select" value={filters.operador} onChange={(e) => setFilters({ ...filters, operador: e.target.value })}>
          <option value="todos">Toda a equipe</option>
          {(EQUIPE_LISTA || []).map(op => <option key={op.nome} value={op.nome}>{op.nome}</option>)}
        </select>
      </div>

      <div className="dg-filter-divider"></div>

      <div className="dg-filter-group">
        <label>Período</label>
        <div className="dg-chip-row">
          {PERIODOS.map(p => (
            <span
              key={p.id}
              className={`dg-chip${filters.periodo === p.id ? ' active' : ''}`}
              onClick={() => setPeriodo(p.id)}
            >
              {p.label}
            </span>
          ))}
        </div>
      </div>

      {hasFilter && (
        <button className="dg-filter-reset" onClick={reset}>
          <i className="ti ti-x"></i> Limpar filtros
        </button>
      )}
    </div>
  );
}
