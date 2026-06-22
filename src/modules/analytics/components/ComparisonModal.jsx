import { useEffect } from 'react';

export default function ComparisonModal({
  sourcesList = [],
  compareOptions = [],
  tempMode = 'platforms',
  setTempMode,
  tempSelected = [],
  handleToggleTempCompare,
  tempCompanyPlatform = '',
  handleSelectTempCompanyPlatform,
  tempCompanyList = [],
  handleToggleTempCompany,
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

  const isCompanies = tempMode === 'companies';
  const selectedOption = compareOptions.find((o) => o.platformId === tempCompanyPlatform);
  const platformCompanies = selectedOption ? (selectedOption.companies || []) : [];
  const canConfirm = isCompanies
    ? (!!tempCompanyPlatform && tempCompanyList.length >= 2)
    : tempSelected.length >= 2;

  const tabStyle = (active) => ({
    flex: 1,
    padding: '8px 10px',
    fontSize: '12.5px',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    borderRadius: '8px',
    background: active ? '#9E1A45' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
    transition: 'all 0.15s ease',
  });

  const rowStyle = (checked) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    cursor: 'pointer',
    background: checked ? 'rgba(158, 26, 69, 0.03)' : 'var(--surface-1)',
    transition: 'all 0.15s ease',
  });

  return (
    <div data-noprint onClick={(e) => { if (e.target === e.currentTarget) setCompareModalOpen(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(10,7,23,0.55)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="fz-in" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px 24px', width: '450px', maxWidth: '100%', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(15,25,35,0.14)' }}>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="ti ti-arrows-diff" style={{ fontSize: '18px', color: '#9E1A45' }}></i> Comparar
          </div>
          <button
            onClick={() => setCompareModalOpen(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px', padding: '4px', display: 'flex' }}
          >
            <i className="ti ti-x"></i>
          </button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: '4px', padding: '4px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '16px' }}>
          <button style={tabStyle(!isCompanies)} onClick={() => setTempMode('platforms')}>
            <i className="ti ti-stack-2" style={{ fontSize: '14px', marginRight: '6px' }}></i>Plataformas
          </button>
          <button style={tabStyle(isCompanies)} onClick={() => setTempMode('companies')}>
            <i className="ti ti-building-warehouse" style={{ fontSize: '14px', marginRight: '6px' }}></i>Empresas
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ marginBottom: '20px' }}>
          {!isCompanies && (
            <>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
                Escolha pelo menos duas plataformas com dados importados para comparar volumes, criticidades e distribuições:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sourcesList.map((src) => {
                  const pid = src.platformId;
                  const isChecked = tempSelected.includes(pid);
                  return (
                    <label key={src.id} style={rowStyle(isChecked)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTempCompare(pid)}
                          style={{ cursor: 'pointer', accentColor: '#9E1A45', width: '15px', height: '15px' }}
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
            </>
          )}

          {isCompanies && (
            <>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Escolha uma plataforma e pelo menos duas empresas dela para comparar entre si:
              </p>

              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Plataforma
              </label>
              <select
                value={tempCompanyPlatform}
                onChange={(e) => handleSelectTempCompanyPlatform(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface-1)', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', marginBottom: '14px', fontFamily: 'inherit' }}
              >
                <option value="">Selecione…</option>
                {compareOptions.map((o) => (
                  <option key={o.platformId} value={o.platformId}>{o.platformName}</option>
                ))}
              </select>

              {tempCompanyPlatform && (
                <>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Empresas {tempCompanyList.length > 0 && `(${tempCompanyList.length} selecionadas)`}
                  </label>
                  {platformCompanies.length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0' }}>
                      Nenhuma empresa identificada para esta plataforma.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '230px', overflowY: 'auto' }}>
                      {platformCompanies.map((c) => {
                        const isChecked = tempCompanyList.includes(c);
                        return (
                          <label key={c} style={rowStyle(isChecked)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleTempCompany(c)}
                                style={{ cursor: 'pointer', accentColor: '#9E1A45', width: '15px', height: '15px' }}
                              />
                              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{c}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
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
            disabled={!canConfirm}
            className="btn btn-sm btn-primary"
            style={{
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12.5px',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              opacity: canConfirm ? 1 : 0.6,
              border: 'none',
              background: '#9E1A45',
              color: '#fff',
            }}
          >
            Confirmar Comparação
          </button>
        </div>
      </div>
    </div>
  );
}
