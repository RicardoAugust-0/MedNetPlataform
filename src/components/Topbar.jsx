import { useEffect, useState } from 'react';
import { useApp } from '../context';
import { useAuth } from '../auth/AuthContext';
import { PANEL_TITLES } from '../data';
import { fmtDate, fmtTime, iniciais } from '../utils';

export default function Topbar() {
  const { activePanel, theme, setTheme } = useApp();
  const { profile, signOut } = useAuth();
  const [clock, setClock]     = useState(fmtTime());
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setClock(fmtTime()), 1000);
    return () => clearInterval(id);
  }, []);

  const meta = PANEL_TITLES[activePanel] || { t: activePanel, s: '' };

  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">{meta.t}</div>
        <div className="topbar-breadcrumb">{meta.s} · {fmtDate()}</div>
      </div>
      <div className="topbar-spacer" />
      <div className="topbar-actions">
        <span className="status-pill"><span className="dot"></span> Sistemas operacionais</span>
        <span className="topbar-clock">{clock}</span>
        <button
          className="topbar-icon-btn"
          title="Alternar tema"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          <i className={`ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'}`}></i>
        </button>

        {/* Avatar do operador + menu de logout */}
        {profile && (
          <div style={{ position: 'relative' }}>
            <button
              title={`${profile.nome} · ${profile.email}`}
              onClick={() => setShowMenu(m => !m)}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent-500), var(--accent-700))',
                border: 'none', cursor: 'pointer',
                display: 'grid', placeItems: 'center',
                fontSize: 11, fontWeight: 600, color: '#fff',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {iniciais(profile.nome)}
            </button>

            {showMenu && (
              <>
                {/* Overlay para fechar */}
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 98 }}
                  onClick={() => setShowMenu(false)}
                />
                <div style={{
                  position: 'absolute', top: 38, right: 0, zIndex: 99,
                  background: 'var(--surface-0)',
                  border: '1px solid var(--border-md)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '6px',
                  minWidth: 200,
                }}>
                  <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{profile.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{profile.email}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>{profile.cargo}</div>
                  </div>
                  <button
                    className="btn btn-ghost btn-danger"
                    style={{ width: '100%', justifyContent: 'flex-start', marginTop: 4 }}
                    onClick={() => { setShowMenu(false); signOut(); }}
                  >
                    <i className="ti ti-logout"></i> Sair
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
