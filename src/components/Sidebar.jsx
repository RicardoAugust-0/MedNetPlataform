// deno-lint-ignore-file
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from "../context.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { NAV_ITEMS, ROLE_LEVEL } from "../data.js";
import { iniciais } from '../utils.js';
import { usePWA } from '../hooks/usePWA.js';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { drivers, sidebarCollapsed, setSidebarCollapsed } = useApp();
  const { profile, signOut } = useAuth();
  const [query, setQuery]   = useState('');
  const [open,  setOpen]    = useState(false);
  const searchRef = useRef(null);
  const paletteRef = useRef(null);
  const { isInstallable, install } = usePWA();

  // Maxtrack: só conta no badge se o motorista acumulou 8+ alertas
  // (intervenção não é solicitada diretamente pela plataforma).
  // Demais plataformas: conta a partir de 5 alertas (mesmo limiar do Monitor).
  const alertCount = drivers.filter(d =>
    d._platformId === 'maxtrack' ? d.alertas >= 8 : d.alertas >= 5
  ).length;

  // Fecha ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      if (!searchRef.current?.contains(e.target) && !paletteRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (sidebarCollapsed) setSidebarCollapsed(false);
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [sidebarCollapsed, setSidebarCollapsed]);

  // Foca a busca assim que ela fica visível (após expandir de um estado colapsado)
  useEffect(() => {
    if (open && !sidebarCollapsed) searchRef.current?.focus();
  }, [open, sidebarCollapsed]);

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

  const navResults = query.length > 0
    ? NAV_ITEMS.filter(i => canSee(i) && i.label.toLowerCase().includes(query.toLowerCase()))
    : [];

  const driverResults = query.length >= 2
    ? drivers.filter(d =>
        d.nome.toLowerCase().includes(query.toLowerCase()) ||
        (d.placa || '').toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5)
    : [];

  const hasResults = navResults.length > 0 || driverResults.length > 0;

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
    <aside className={'sidebar' + (sidebarCollapsed ? ' collapsed' : '')}>
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

      {/* Search */}
      <div className="sidebar-search" style={{ position: 'relative' }}>
        <div
          className="sidebar-search-wrap"
          title={sidebarCollapsed ? 'Buscar (Ctrl+K)' : undefined}
          onClick={() => { if (sidebarCollapsed) { setSidebarCollapsed(false); setOpen(true); } }}
        >
          <i className="ti ti-search"></i>
          <input
            ref={searchRef}
            placeholder="Buscar…"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
          />
          <span className="sidebar-search-kbd">⌘K</span>
        </div>

        {open && query.length > 0 && (
          <div ref={paletteRef} style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
            background: 'var(--surface-0)', border: '1px solid var(--border-md)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
            marginTop: 4, overflow: 'hidden',
          }}>
            {!hasResults ? (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>Nenhum resultado para "{query}"</div>
            ) : (
              <>
                {navResults.length > 0 && (
                  <>
                    <div style={{ padding: '6px 12px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Páginas</div>
                    {navResults.map(item => (
                      <div key={item.id}
                        style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-1)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                        onClick={() => { navigate(item.path); setOpen(false); setQuery(''); }}
                      >
                        <i className={`ti ${item.icon}`} style={{ color: 'var(--accent-500)', fontSize: 15 }}></i>
                        {item.label}
                      </div>
                    ))}
                  </>
                )}
                {driverResults.length > 0 && (
                  <>
                    <div style={{ padding: '6px 12px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: navResults.length > 0 ? '1px solid var(--border)' : 'none', marginTop: navResults.length > 0 ? 4 : 0 }}>Motoristas</div>
                    {driverResults.map(d => (
                      <div key={d.placa}
                        style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-1)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                        onClick={() => { navigate('/monitor/intervencao'); setOpen(false); setQuery(''); }}
                      >
                        <i className="ti ti-truck" style={{ color: 'var(--text-muted)', fontSize: 14 }}></i>
                        <span style={{ color: 'var(--text-primary)' }}>{d.nome}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>{d.placa}</span>
                        {d.alertas > 0 && <span className="badge badge-danger" style={{ marginLeft: 'auto', fontSize: 9.5 }}>{d.alertas}</span>}
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}
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
  );
}
