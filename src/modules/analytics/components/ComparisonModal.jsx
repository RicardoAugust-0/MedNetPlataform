import { useEffect } from 'react';

export default function ComparisonModal({
  sourcesList = [],
  tempSelected = [],
  handleToggleTempCompare,
  handleConfirmCompare,
  setCompareModalOpen,
}) {
  // Close modal on Escape key.
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setCompareModalOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [setCompareModalOpen]);

  return (
    <div data-noprint onClick={(e) => { if (e.target === e.currentTarget) setCompareModalOpen(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(10,7,23,0.55)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="fz-in" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px 24px', width: '450px', maxWidth: '100%', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(15,25,35,0.14)' }}>
        
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="ti ti-arrows-diff" style={{ fontSize: '18px', color: '#9E1A45' }}></i> Selecionar plataformas para comparar
          </div>
          <button
            onClick={() => setCompareModalOpen(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px', padding: '4px', display: 'flex' }}
          >
            <i className="ti ti-x"></i>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
            Escolha pelo menos duas plataformas com dados importados para comparar seus volumes, criticidades e distribuições de alertas:
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sourcesList.map((src) => {
              const pid = src.platformId;
              const isChecked = tempSelected.includes(pid);
              return (
                <label
                  key={src.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    background: isChecked ? 'rgba(158, 26, 69, 0.03)' : 'var(--surface-1)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleTempCompare(pid)}
                      style={{
                        cursor: 'pointer',
                        accentColor: '#9E1A45',
                        width: '15px',
                        height: '15px'
                      }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {src.platformName}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {src.rows.toLocaleString('pt-BR')} reg.
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
          <button
            onClick={() => setCompareModalOpen(false)}
            className="btn btn-sm btn-ghost"
            style={{ borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmCompare}
            disabled={tempSelected.length < 2}
            className="btn btn-sm btn-primary"
            style={{
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12.5px',
              cursor: tempSelected.length >= 2 ? 'pointer' : 'not-allowed',
              opacity: tempSelected.length >= 2 ? 1 : 0.6,
              border: 'none',
              background: '#9E1A45',
              color: '#fff'
            }}
          >
            Confirmar Comparação
          </button>
        </div>
      </div>
    </div>
  );
}
