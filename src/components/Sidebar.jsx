// deno-lint-ignore-file
import { useState, useRef, useEffect } from 'react';
import { useApp } from "../context.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { NAV_ITEMS, APP_CONFIG } from "../data.js";
import { iniciais } from '../utils.js';
import { usePWA } from '../hooks/usePWA.js';

export default function Sidebar() {
  const { activePanel, setActivePanel, drivers } = useApp();
  const { profile, signOut } = useAuth();
  const [query, setQuery]   = useState('');
  const [open,  setOpen]    = useState(false);
  const searchRef = useRef(null);
  const paletteRef = useRef(null);
  const { isInstallable, install } = usePWA();

  const alertCount = drivers.filter(d => d.alertas > 0).length;

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
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); setOpen(true); }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const navResults = query.length > 0
    ? NAV_ITEMS.filter(i => (!i.adminOnly || isAdmin) && i.label.toLowerCase().includes(query.toLowerCase()))
    : [];

  const driverResults = query.length >= 2
    ? drivers.filter(d =>
        d.nome.toLowerCase().includes(query.toLowerCase()) ||
        (d.placa || '').toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5)
    : [];

  const hasResults = navResults.length > 0 || driverResults.length > 0;

  const isAdmin = profile?.role === 'admin';

  let curGroup = '';
  const navRows = [];
  NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).forEach(item => {
    if (item.group !== curGroup) {
      curGroup = item.group;
      navRows.push(<div className="nav-group-label" key={'g-' + item.group}>{item.group}</div>);
    }
    const badge = item.id === 'monitor' ? (alertCount > 0 ? alertCount : null) : (item.badge || null);
    navRows.push(
      <div key={item.id} className={'nav-item' + (activePanel === item.id ? ' active' : '')} onClick={() => setActivePanel(item.id)}>
        <i className={`ti ${item.icon} nav-icon`}></i>
        <span className="nav-label">{item.label}</span>
        {badge ? <span className="nav-badge">{badge}</span> : null}
      </div>
    );
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
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
        <div className="logo-text">
          <div className="logo-grupo">GRUPO</div>
          <div className="logo-name">Med<span className="net">Net</span></div>
          <div className="logo-sub">Medicina e Seg. do Trabalho</div>
        </div>
      </div>

      {/* Search */}
      <div className="sidebar-search" style={{ position: 'relative' }}>
        <div className="sidebar-search-wrap">
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
                        onClick={() => { setActivePanel(item.id); setOpen(false); setQuery(''); }}
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
                        onClick={() => { setActivePanel('monitor'); setOpen(false); setQuery(''); }}
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
          <div style={{ padding: '0 12px', marginBottom: 12 }}>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 13, gap: 6 }} onClick={install}>
              <i className="ti ti-download"></i> Instalar App
            </button>
          </div>
        )}
        <div className="user-card" style={{ cursor: 'pointer' }} onClick={() => setActivePanel('perfil')} title="Abrir perfil">
          <div className="user-avatar" style={profile?.avatar_url ? { padding: 0, overflow: 'hidden' } : null}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt={profile.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : profile ? iniciais(profile.nome) : '?'}
          </div>
          <div className="user-meta">
            <div className="user-name">{profile?.nome || '—'}</div>
            <div className="user-role">{profile?.cargo || 'Operador'}</div>
          </div>
          <button title="Sair" onClick={e => { e.stopPropagation(); signOut(); }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: 'var(--radius-sm)', display: 'grid', placeItems: 'center' }}>
            <i className="ti ti-logout" style={{ fontSize: 16 }}></i>
          </button>
        </div>
      </div>
    </aside>
  );
}
