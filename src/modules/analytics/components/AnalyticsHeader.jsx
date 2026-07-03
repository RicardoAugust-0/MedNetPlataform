import SavedViewsMenu from './SavedViewsMenu.jsx';

export default function AnalyticsHeader({
  activeId,
  compare,
  availableMonths = [],
  selectedMonth,
  setSelectedMonth,
  formatMonthKey,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  d,
  sourcesList = [],
  handleCompareClick,
  activeSource,
  exportToCSV,
  exportToHTML,
  setModalOpen,
  selectedCompany,
  setSelectedCompany,
  availableCompanies = [],
  savedViews = [],
  promptSaveCurrentView,
  applySavedView,
  removeSavedView,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Análise de Fadiga</h2>
          <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Consolidação multi-plataforma de alertas de fadiga e desatenção
          </p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--text-secondary)', background: 'var(--surface-1)', border: '1px solid var(--border)', padding: '6px 11px', borderRadius: '99px', marginTop: '6px' }}>
          <i className="ti ti-calendar" style={{ fontSize: '13px', color: 'var(--text-muted)' }}></i>
          {d && d.meta?.periodo ? `${d.meta.periodo[0]} – ${d.meta.periodo[1]}` : 'Sem período definido'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        
        {/* Seletor Dinâmico de Mês */}
        {(activeId || compare) && (availableMonths.length > 0 || selectedMonth === 'custom') && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginRight: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Filtrar Mês:</span>
            <select
              value={selectedMonth || 'all'}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                background: 'var(--surface-0)',
                cursor: 'pointer',
                outline: 'none',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease',
              }}
            >
              <option value="all">Todos os meses</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {formatMonthKey(m)}
                </option>
              ))}
              <option value="custom">Período Customizado...</option>
            </select>
          </div>
        )}

        {/* Seletor de Período Customizado */}
        {(activeId || compare) && selectedMonth === 'custom' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginRight: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>De:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  padding: '5px 8px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  background: 'var(--surface-0)',
                  fontFamily: 'inherit',
                  outline: 'none'
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Até:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  padding: '5px 8px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  background: 'var(--surface-0)',
                  fontFamily: 'inherit',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        )}

        {/* Seletor de Empresa */}
        {activeId && !compare && availableCompanies.length > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginRight: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Empresa:</span>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                background: 'var(--surface-0)',
                cursor: 'pointer',
                outline: 'none',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease',
              }}
            >
              <option value="">Todas as empresas</option>
              {availableCompanies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}


        {(activeId || compare) && (
          <SavedViewsMenu
            views={savedViews}
            onApply={applySavedView}
            onSave={promptSaveCurrentView}
            onRemove={removeSavedView}
          />
        )}

        {sourcesList.length >= 2 && (
          <button
            onClick={handleCompareClick}
            className="btn btn-sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'inherit',
              border: compare ? '1px solid #9E1A45' : '1px solid var(--border)',
              background: compare ? 'rgba(158, 26, 69, 0.05)' : 'var(--surface-0)',
              color: compare ? '#9E1A45' : 'var(--text-primary)',
              fontWeight: 500,
              borderRadius: '8px',
              padding: '7px 12px',
              cursor: 'pointer',
            }}
          >
            <i className="ti ti-arrows-diff" style={{ fontSize: '14px' }}></i> Comparar plataformas
          </button>
        )}
        
        {activeSource && (
          <button
            onClick={exportToCSV}
            className="btn btn-sm btn-ghost"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              border: '1px solid var(--border)',
              background: 'var(--surface-0)',
              color: 'var(--text-primary)',
              fontWeight: 500,
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            <i className="ti ti-download" style={{ fontSize: '14px' }}></i> Exportar CSV
          </button>
        )}

        {d && (activeSource || compare) && (
          <button
            onClick={exportToHTML}
            className="btn btn-sm btn-ghost"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              border: '1px solid var(--border)',
              background: 'var(--surface-0)',
              color: 'var(--text-primary)',
              fontWeight: 500,
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            <i className="ti ti-file-code" style={{ fontSize: '14px' }}></i> Exportar HTML
          </button>
        )}

        <button
          onClick={() => window.print()}
          className="btn btn-sm btn-ghost"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 12px',
            border: '1px solid var(--border)',
            background: 'var(--surface-0)',
            color: 'var(--text-primary)',
            fontWeight: 500,
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          <i className="ti ti-file-type-pdf" style={{ fontSize: '14px' }}></i> Exportar PDF
        </button>
        
        <button
          onClick={() => setModalOpen(true)}
          className="btn btn-sm btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 13px',
            fontWeight: 500,
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          <i className="ti ti-upload" style={{ fontSize: '14px' }}></i> Importar planilha
        </button>
      </div>
    </div>
  );
}
