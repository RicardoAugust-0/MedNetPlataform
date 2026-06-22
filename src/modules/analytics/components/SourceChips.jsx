export default function SourceChips({
  sourcesList = [],
  activeId,
  compare,
  setCompare,
  setActiveId,
  removeSource,
}) {
  if (sourcesList.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
      <span style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', fontWeight: 600 }}>
        Fontes
      </span>
      {sourcesList.map((src) => (
        <div
          key={src.id}
          role="button"
          tabIndex={0}
          onClick={() => {
            setCompare(false);
            setActiveId(src.id);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCompare(false); setActiveId(src.id); } }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '9px',
            padding: '7px 10px',
            borderRadius: '10px',
            cursor: 'pointer',
            background: 'var(--surface-0)',
            border: src.id === activeId && !compare ? '1px solid #9E1A45' : '1px solid var(--border)',
            boxShadow: src.id === activeId && !compare ? '0 0 0 1px rgba(158,26,69,0.15)' : 'none',
            transition: 'all .15s ease',
          }}
        >
          <i className="ti ti-table" style={{ fontSize: '14px', flexShrink: 0, color: '#9E1A45' }}></i>
          <div style={{ minWidth: 0, lineHeight: 1.25 }}>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{src.platformName}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
              {src.rows.toLocaleString('pt-BR')} reg.
            </div>
          </div>
          <button
            onClick={(e) => removeSource(src.id, e)}
            title="Remover fonte"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '14px',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#E24B4A';
              e.currentTarget.style.background = 'rgba(226,75,74,0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <i className="ti ti-trash"></i>
          </button>
        </div>
      ))}
    </div>
  );
}
