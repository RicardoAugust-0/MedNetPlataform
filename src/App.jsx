import { useEffect } from 'react';
import { useApp } from './context';
import { useAuth } from './auth/AuthContext';
import { applyAccent } from './utils';
import LoginPage from './auth/LoginPage';
import SetPasswordPage from './auth/SetPasswordPage';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import TweaksPanel from './components/TweaksPanel';
import Dashboard from './modules/Dashboard';
import Monitor from './modules/Monitor';
import Templates from './modules/Templates';
import Links from './modules/Links';
import Workspace from './modules/Workspace';
import Notes from './modules/Notes';
import Agenda from './modules/Agenda';

function Panel({ id, children }) {
  const { activePanel } = useApp();
  return (
    <div className={`panel ${activePanel === id ? 'active' : ''}`}>
      {children}
    </div>
  );
}

function AppShell() {
  const { theme, density, mode, vibe, rhythm, accent } = useApp();

  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute('data-theme', theme);
    r.setAttribute('data-density', density);
    r.setAttribute('data-mode', mode);
    r.setAttribute('data-vibe', vibe);
    r.setAttribute('data-rhythm', rhythm);
  }, [theme, density, mode, vibe, rhythm]);

  useEffect(() => { applyAccent(accent); }, [accent]);

  return (
    <div id="app">
      <Sidebar />
      <div className="main-area">
        <Topbar />
        <div className="content-area">
          <Panel id="dashboard"><Dashboard /></Panel>
          <Panel id="monitor"><Monitor /></Panel>
          <Panel id="agenda"><Agenda /></Panel>
          <Panel id="templates"><Templates /></Panel>
          <Panel id="workspace"><Workspace /></Panel>
          <Panel id="notas"><Notes /></Panel>
          <Panel id="links"><Links /></Panel>
        </div>
      </div>
      <TweaksPanel />
    </div>
  );
}

export default function App() {
  const { session, loading, authType } = useAuth();

  if (loading) return null;

  if (session && (authType === 'invite' || authType === 'recovery')) return <SetPasswordPage />;

  if (!session) return <LoginPage />;

  return <AppShell />;
}
