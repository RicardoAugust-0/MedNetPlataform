import { useState } from 'react';

export default function MonitorFilters({
  profile,
  filters,
  setFilters,
  transps,
  resetFilters,
  platform,
  presets,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
}) {
  const taxonomy    = platform?.taxonomy    || { intervencao: [], reportar: [], tecnico: [] };
  const severidades = platform?.severidades || ['Gravíssimo', 'Grave', 'Normal'];
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  const handleSave = () => {
    if (!presetName.trim()) return;
    onSavePreset(presetName.trim());
    setPresetName('');
    setSavingPreset(false);
  };

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
          <label><i className="ti ti-search"></i> Buscar</label>
          <input
            type="search"
            value={filters.busca || ''}
            onChange={e => setFilters({ ...filters, busca: e.target.value })}
            placeholder="Placa ou nome…"
            style={{ fontSize: 12, padding: '2px 6px', minWidth: 140 }}
          />
        </div>
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
        <button className="btn btn-sm" onClick={resetFilters} disabled={!filters.turno && !filters.prioridade && !filters.empresa && !filters.comportamento && !filters.busca}>
          Limpar
        </button>

        {/* Presets */}
        <div className="filter-group" style={{ marginLeft: 'auto', gap: 6 }}>
          <label><i className="ti ti-bookmark"></i> Presets</label>
          {presets.map(p => (
            <span key={p.id} style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => onLoadPreset(p)}
                title={`Turno: ${p.filters.turno || 'todos'} · Transportadora: ${p.filters.empresa || 'todas'} · Severidade: ${p.filters.prioridade || 'todas'}`}
              >
                {p.name}
              </button>
              <button
                className="btn btn-sm btn-icon-only"
                onClick={() => onDeletePreset(p.id)}
                title="Remover preset"
                style={{ padding: '1px 4px', fontSize: 10 }}
              >
                <i className="ti ti-x"></i>
              </button>
            </span>
          ))}

          {savingPreset ? (
            <>
              <input
                className="form-control"
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                placeholder="Nome do preset"
                style={{ fontSize: 12, padding: '2px 6px', minWidth: 120 }}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setSavingPreset(false); }}
                autoFocus
              />
              <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={!presetName.trim()}>OK</button>
              <button className="btn btn-sm" onClick={() => { setSavingPreset(false); setPresetName(''); }}>✕</button>
            </>
          ) : (
            presets.length < 5 && (
              <button className="btn btn-sm btn-ghost" onClick={() => setSavingPreset(true)} title="Salvar filtros atuais como preset">
                <i className="ti ti-plus"></i> Salvar
              </button>
            )
          )}
        </div>
      </div>
    </>
  );
}
