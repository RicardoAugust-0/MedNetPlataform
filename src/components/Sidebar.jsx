import { useApp } from '../context';
import { useAuth } from '../auth/AuthContext';
import { NAV_ITEMS, APP_CONFIG } from '../data';
import { iniciais } from '../utils';

export default function Sidebar() {
  const { activePanel, setActivePanel, drivers } = useApp();
  const { profile, signOut } = useAuth();

  const alertCount = drivers.filter(d => d.alertas > 0).length;

  let curGroup = '';
  const navRows = [];
  NAV_ITEMS.forEach(item => {
    if (item.group !== curGroup) {
      curGroup = item.group;
      navRows.push(<div className="nav-group-label" key={'g-' + item.group}>{item.group}</div>);
    }
    const badge = item.id === 'monitor' ? (alertCount > 0 ? alertCount : null) : (item.badge || null);
    navRows.push(
      <div
        key={item.id}
        className={'nav-item' + (activePanel === item.id ? ' active' : '')}
        onClick={() => setActivePanel(item.id)}
      >
        <i className={`ti ${item.icon} nav-icon`}></i>
        <span className="nav-label">{item.label}</span>
        {badge ? <span className="nav-badge">{badge}</span> : null}
      </div>
    );
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">M</div>
        <div className="logo-text">
          <div className="logo-name">{APP_CONFIG.empresa}</div>
          <div className="logo-sub">{APP_CONFIG.setor}</div>
        </div>
      </div>

      <div className="sidebar-search">
        <div className="sidebar-search-wrap">
          <i className="ti ti-search"></i>
          <input placeholder="Buscar..." />
          <span className="sidebar-search-kbd">⌘K</span>
        </div>
      </div>

      <nav className="sidebar-nav">{navRows}</nav>

      <div className="sidebar-footer">
        <div className="user-card" style={{ cursor: 'pointer' }} onClick={() => setActivePanel('perfil')} title="Abrir perfil">
          <div className="user-avatar">{profile ? iniciais(profile.nome) : '?'}</div>
          <div className="user-meta">
            <div className="user-name">{profile?.nome || '—'}</div>
            <div className="user-role">{profile?.cargo || 'Operador'}</div>
          </div>
          <button
            title="Sair"
            onClick={e => { e.stopPropagation(); signOut(); }}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--text-muted)', padding: '4px',
              borderRadius: 'var(--radius-sm)', display: 'grid', placeItems: 'center',
            }}
          >
            <i className="ti ti-logout" style={{ fontSize: 16 }}></i>
          </button>
        </div>
      </div>
    </aside>
  );
}
