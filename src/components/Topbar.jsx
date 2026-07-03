import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context';
import { PANEL_TITLES } from '../data';
import { fmtTime } from '../utils';
import { useOnline } from '../hooks/useOnline';
import { usePwaUpdate } from '../hooks/usePwaUpdate';
import NotificationBell from './NotificationBell.jsx';

export default function Topbar() {
  const { theme, setTheme, setMobileNavOpen } = useApp();
  const location = useLocation();
  const [clock, setClock] = useState(fmtTime());
  const online = useOnline();
  usePwaUpdate();

  useEffect(() => {
    const id = setInterval(() => setClock(fmtTime()), 1000);
    return () => clearInterval(id);
  }, []);

  // Resolve o título tentando a chave de 2 segmentos (ex: 'admin/analytics')
  // e caindo para o 1º segmento (ex: 'admin'/'monitor') — suporta sub-rotas.
  const segs = location.pathname.split('/').filter(Boolean);
  const panelId = segs[0] || 'dashboard';
  const key2 = segs.slice(0, 2).join('/');
  const meta = PANEL_TITLES[key2] || PANEL_TITLES[panelId] || { t: panelId, s: '' };
  const hour = new Date().getHours();
  const turno = hour >= 6 && hour < 18 ? 'diurno' : 'noturno';
  const subtitle = panelId === 'dashboard' ? `${meta.s} · turno ${turno}` : meta.s;

  return (
    <header className="topbar">
      <button
        className="topbar-icon-btn topbar-menu-btn"
        title="Abrir menu"
        aria-label="Abrir menu"
        onClick={() => setMobileNavOpen(true)}
      >
        <i className="ti ti-menu-2"></i>
      </button>
      <div className="topbar-brand">
        <svg className="topbar-mark" width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="mn-topbar-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#9E1A45"/>
              <stop offset="100%" stopColor="#5A0F25"/>
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="7" fill="url(#mn-topbar-bg)"/>
          <text x="15" y="23" fontFamily="system-ui,-apple-system,sans-serif" fontSize="19" fontWeight="800" fill="white" textAnchor="middle">M</text>
          <rect x="23" y="5" width="2" height="8" rx="1" fill="#F26931"/>
          <rect x="20" y="8" width="8" height="2" rx="1" fill="#F26931"/>
        </svg>
        <div className="topbar-brand-text">
          <span className="topbar-brand-grupo">GRUPO</span>
          <span className="topbar-brand-name">Med<b>Net</b></span>
        </div>
      </div>
      <div className="topbar-meta">
        <div className="topbar-title">{meta.t}</div>
        {subtitle && <div className="topbar-breadcrumb">{subtitle}</div>}
      </div>
      <div className="topbar-spacer" />
      <div className="topbar-actions">
        <span className={`status-pill${online ? '' : ' is-offline'}`}>
          <span className="dot"></span> Fadiga Zero · {online ? 'Online' : 'Offline'}
        </span>
        <span className="topbar-clock">{clock}</span>
        <NotificationBell />
        <button
          className="topbar-icon-btn"
          title="Alternar tema"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          <i className={`ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'}`}></i>
        </button>
      </div>
    </header>
  );
}
