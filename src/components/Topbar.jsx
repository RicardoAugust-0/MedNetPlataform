import { useEffect, useState } from 'react';
import { useApp } from '../context';
import { PANEL_TITLES } from '../data';
import { fmtDate, fmtTime } from '../utils';

export default function Topbar() {
  const { activePanel, theme, setTheme } = useApp();
  const [clock, setClock] = useState(fmtTime());

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
        <span className="status-pill"><span className="dot"></span> Fadiga Zero · Online</span>
        <span className="topbar-clock">{clock}</span>
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
