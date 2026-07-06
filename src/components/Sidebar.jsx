// deno-lint-ignore-file
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from "../context.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { NAV_ITEMS, ROLE_LEVEL } from "../data.js";
import { iniciais } from '../utils.js';
import { usePWA } from '../hooks/usePWA.js';
import { useCommandPalette } from '../hooks/useCommandPalette.jsx';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { drivers, sidebarCollapsed, setSidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useApp();
  const { profile, signOut } = useAuth();
  const { isInstallable, install } = usePWA();
  const cmdPalette = useCommandPalette();

  // Maxtrack: só conta no badge se o motorista acumulou 8+ alertas
  // (intervenção não é solicitada diretamente pela plataforma).
  // Demais plataformas: conta a partir de 5 alertas (mesmo limiar do Monitor).
  const alertCount = drivers.filter(d =>
    d._platformId === 'maxtrack' ? d.alertas >= 8 : d.alertas >= 5
  ).length;

  const triggerSearch = () => {
    if (sidebarCollapsed) setSidebarCollapsed(false);
    cmdPalette.open();
  };

  // Fecha o drawer mobile a cada navegação.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, setMobileNavOpen]);

  // Visibilidade por hierarquia de role: operador < líder < admin.
  const myLevel = ROLE_LEVEL[profile?.role] ?? 0;
  const canSee = (item) => !item.minRole || myLevel >= ROLE_LEVEL[item.minRole];

  const isItemActive = (item) => {
    // Casa pelo primeiro segmento do path do item (não pelo id), para que a
    // entrada única "Administração" (/admin) fique ativa em todas as sub-rotas
    // (/admin/analytics, /admin/equipe, …) e o Monitor em /monitor/:tab.
    const base = '/' + item.path.split('/')[1];
    return location.pathname === base || location.pathname.startsWith(base + '/');
  };

  let curGroup = '';
  const navRows = [];
  NAV_ITEMS.filter(canSee).forEach(item => {
    if (item.group !== curGroup) {
      curGroup = item.group;
      navRows.push(<div className="nav-group-label" key={'g-' + item.group}>{item.group}</div>);
    }
    const badge = item.id === 'monitor' ? (alertCount > 0 ? alertCount : null) : (item.badge || null);
    navRows.push(
      <div
        key={item.id}
        className={'nav-item' + (isItemActive(item) ? ' active' : '')}
        onClick={() => navigate(item.path)}
        title={sidebarCollapsed ? item.label : undefined}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(item.path);
          }
        }}
      >
        <i className={`ti ${item.icon} nav-icon`}></i>
        <span className="nav-label">{item.label}</span>
        {badge ? <span className="nav-badge">{badge}</span> : null}
      </div>
    );
  });

  return (
    <>
      <div
        className={'sidebar-backdrop' + (mobileNavOpen ? ' open' : '')}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden="true"
      />
      <aside className={'sidebar' + (sidebarCollapsed && !mobileNavOpen ? ' collapsed' : '') + (mobileNavOpen ? ' mobile-open' : '')}>
      <div className="sidebar-logo">
        <button
          className="logo-mark-btn"
          title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          <svg className="logo-mark" width="34" height="34" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="mn-logo-bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#9E1A45"/>
                <stop offset="100%" stopColor="#5A0F25"/>
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="7" fill="url(#mn-logo-bg)"/>
            <text x="15" y="23" fontFamily="system-ui,-apple-system,sans-serif" fontSize="19" fontWeight="800" fill="white" textAnchor="middle">M</text>
            <rect x="23" y="5" width="2" height="8" rx="1" fill="#F26931"/>
            <rect x="20" y="8" width="8" height="2" rx="1" fill="#F26931"/>
          </svg>
          <i className={`ti ${sidebarCollapsed ? 'ti-chevron-right' : 'ti-chevron-left'} logo-mark-chevron`}></i>
        </button>
        <div className="logo-text">
          <div className="logo-grupo">GRUPO</div>
          <div className="logo-name">Med<span className="net">Net</span></div>
          <div className="logo-sub">Medicina e Seg. do Trabalho</div>
        </div>
      </div>

      {/* Search — abre a command palette global (Ctrl+K de qualquer tela) */}
      <div className="sidebar-search" style={{ position: 'relative' }}>
        <div
          className="sidebar-search-wrap"
          title="Buscar (Ctrl+K)"
          onClick={triggerSearch}
        >
          <i className="ti ti-search"></i>
          <input
            readOnly
            placeholder="Buscar…"
            value=""
            onFocus={(e) => { e.target.blur(); triggerSearch(); }}
          />
          <span className="sidebar-search-kbd">⌘K</span>
        </div>
      </div>

      <nav className="sidebar-nav">{navRows}</nav>

      <div className="sidebar-footer">
        {isInstallable && (
          <div className="sidebar-install" style={{ padding: '0 12px', marginBottom: 12 }}>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 13, gap: 6 }} onClick={install}>
              <i className="ti ti-download"></i> Instalar App
            </button>
          </div>
        )}
        <div
          className="user-card"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/perfil')}
          title={sidebarCollapsed ? `${profile?.nome || 'Perfil'} — abrir perfil` : 'Abrir perfil'}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/perfil');
            }
          }}
        >
          <div className="user-avatar" style={profile?.avatar_url ? { padding: 0, overflow: 'hidden' } : null}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt={profile.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : profile ? iniciais(profile.nome) : '?'}
          </div>
          <div className="user-meta">
            <div className="user-name">{profile?.nome || '—'}</div>
            <div className="user-role">{profile?.cargo || 'Operador'}</div>
          </div>
          {!sidebarCollapsed && (
            <button title="Sair" onClick={e => { e.stopPropagation(); signOut(); }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: 'var(--radius-sm)', display: 'grid', placeItems: 'center' }}>
              <i className="ti ti-logout" style={{ fontSize: 16 }}></i>
            </button>
          )}
        </div>
      </div>
      </aside>
    </>
  );
}
