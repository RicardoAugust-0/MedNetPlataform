import { useCrossCheck } from './useCrossCheck.js';
import { buildStats, formatLoadedAt } from './utils.js';
import UploadPanel from './UploadPanel.jsx';
import MatchCard from './MatchCard.jsx';

const LEFT_NAME  = 'Maxtrack';
const RIGHT_NAME = 'Horizon';

export default function CrossCheck() {
  const {
    leftEvents, rightEvents,
    matches, filteredMatches,
    leftMeta, rightMeta,
    leftInputKey, rightInputKey,
    filterBy, setFilterBy,
    sortBy, setSortBy,
    onlyDivergences, setOnlyDivergences,
    handleUpload, handleDrop,
    compareNow, clearSide, clearAll, swapSides,
    exportResults,
  } = useCrossCheck();

  const leftStats  = buildStats(leftEvents);
  const rightStats = buildStats(rightEvents);
  const totalPlates  = new Set([...leftStats.plates,  ...rightStats.plates]).size;
  const totalDrivers = new Set([...leftStats.drivers, ...rightStats.drivers]).size;
  const totalRows    = leftStats.rows + rightStats.rows;
  const plateMatches    = matches.filter((m) => m.by === 'placa').length;
  const driverMatches   = matches.filter((m) => m.by === 'motorista').length;
  const divergenceCount = matches.filter((m) => m.left.length !== m.right.length).length;

  const latestFile  = [leftMeta, rightMeta].filter((m) => m.loadedAt).sort((a, b) => new Date(b.loadedAt) - new Date(a.loadedAt))[0];
  const latestLabel = latestFile ? `${latestFile.name} · ${formatLoadedAt(latestFile.loadedAt)}` : '—';

  const hasData = leftEvents.length > 0 || rightEvents.length > 0;

  return (
    <div>
      <div className="card">
        <div className="card-header card-header-wrap">
          <div>
            <div className="card-title">
              <i className="ti ti-shuffle" style={{ color: 'var(--accent-500)' }}></i> Cross-Check
              <span className="pill-count">{matches.length} matches</span>
            </div>
            <span className="topbar-breadcrumb">Comparar alertas entre plataformas</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-sm btn-ghost" onClick={swapSides} disabled={!hasData}>
              <i className="ti ti-switch-horizontal"></i> Trocar lados
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => clearSide('left')} disabled={leftEvents.length === 0}>
              Limpar planilha 1
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => clearSide('right')} disabled={rightEvents.length === 0}>
              Limpar planilha 2
            </button>
            <button className="btn btn-sm btn-ghost" onClick={clearAll} disabled={!hasData && matches.length === 0}>
              Limpar tudo
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => exportResults(filteredMatches, LEFT_NAME, RIGHT_NAME)} disabled={filteredMatches.length === 0}>
              <i className="ti ti-download"></i> Exportar
            </button>
            <button className="btn btn-sm btn-primary" onClick={compareNow} disabled={leftEvents.length === 0 || rightEvents.length === 0}>
              <i className="ti ti-shuffle"></i> Comparar
            </button>
          </div>
        </div>

        <div className="stat-strip">
          <div className="stat-box">
            <div className="stat-label">Linhas lidas</div>
            <div className="stat-value">{totalRows}</div>
            <div className="stat-sub">{LEFT_NAME}: {leftStats.rows} · {RIGHT_NAME}: {rightStats.rows}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Placas totais</div>
            <div className="stat-value">{totalPlates}</div>
            <div className="stat-sub">{plateMatches} em comum</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Motoristas totais</div>
            <div className="stat-value">{totalDrivers}</div>
            <div className="stat-sub">{driverMatches} em comum</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Matches encontrados</div>
            <div className="stat-value">{matches.length}</div>
            <div className="stat-sub">{divergenceCount} divergência(s)</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Último arquivo</div>
            <div className="stat-value" style={{ fontSize: 13 }}>{latestLabel}</div>
            <div className="stat-sub">carregado recentemente</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginBottom: 16 }}>
          <UploadPanel
            name={LEFT_NAME}
            label="Planilha 1"
            meta={leftMeta}
            stats={leftStats}
            inputKey={`left-${leftInputKey}`}
            onUpload={(e) => handleUpload(e, 'left')}
            onDrop={(e) => handleDrop(e, 'left')}
          />
          <UploadPanel
            name={RIGHT_NAME}
            label="Planilha 2"
            meta={rightMeta}
            stats={rightStats}
            inputKey={`right-${rightInputKey}`}
            onUpload={(e) => handleUpload(e, 'right')}
            onDrop={(e) => handleDrop(e, 'right')}
          />
        </div>

        <div className="filter-bar">
          <div className="filter-group">
            <label><i className="ti ti-filter"></i> Filtrar por</label>
            <select value={filterBy} onChange={(e) => setFilterBy(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="placa">Somente placas</option>
              <option value="motorista">Somente motoristas</option>
            </select>
          </div>
          <div className="filter-divider" />
          <div className="filter-group">
            <label><i className="ti ti-arrows-sort"></i> Ordenar por</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="ocorrencias">Ocorrências</option>
              <option value="alfabetica">Ordem alfabética</option>
            </select>
          </div>
          <div className="filter-divider" />
          <button
            className={`btn btn-sm ${onlyDivergences ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setOnlyDivergences(!onlyDivergences)}
          >
            <i className="ti ti-git-diff"></i> Somente divergências
          </button>
          <button className="filter-reset" onClick={() => { setFilterBy('todos'); setSortBy('ocorrencias'); setOnlyDivergences(false); }}>
            <i className="ti ti-x"></i> Limpar filtros
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="links-section-title" style={{ marginBottom: 12 }}>
            Resultados — {filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''}
            {filteredMatches.length !== matches.length ? ` (de ${matches.length})` : ''}
          </div>
          {filteredMatches.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-layers-subtract"></i>
              <p>Nenhuma correspondência encontrada para os filtros atuais.</p>
            </div>
          ) : (
            filteredMatches.map((m, i) => (
              <MatchCard key={i} match={m} leftName={LEFT_NAME} rightName={RIGHT_NAME} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
