import { useApp } from '../context';
import { NAV_ITEMS, APP_CONFIG } from '../data';

export default function Sidebar() {
  const { activePanel, setActivePanel } = useApp();

  let curGroup = '';
  const navRows = [];
  NAV_ITEMS.forEach(item => {
    if (item.group !== curGroup) {
      curGroup = item.group;
      navRows.push(<div className="nav-group-label" key={'g-' + item.group}>{item.group}</div>);
    }
    navRows.push(
      <div
        key={item.id}
        className={'nav-item' + (activePanel === item.id ? ' active' : '')}
        onClick={() => setActivePanel(item.id)}
      >
        <i className={`ti ${item.icon} nav-icon`}></i>
        <span className="nav-label">{item.label}</span>
        {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
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
        <div className="user-card">
          <div className="user-avatar">{APP_CONFIG.usuario.iniciais}</div>
          <div className="user-meta">
            <div className="user-name">{APP_CONFIG.usuario.nome}</div>
            <div className="user-role">{APP_CONFIG.usuario.cargo}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
