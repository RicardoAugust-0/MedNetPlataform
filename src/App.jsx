import { useEffect, useRef } from 'react';
import { useApp } from "./context.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import { useReminders, RemindersProvider } from "./hooks/useReminders.jsx";
import { useToast } from "./hooks/useToast.jsx";
import { useMaintenance } from "./hooks/useMaintenance.jsx";
import { applyAccent } from "./utils.js";
import LoginPage from "./auth/LoginPage.jsx";
import SetPasswordPage from "./auth/SetPasswordPage.jsx";
import MaintenancePage from "./components/MaintenancePage.jsx";
import Profile from "./modules/Profile.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import TweaksPanel from "./components/TweaksPanel.jsx";
import Dashboard from "./modules/Dashboard.jsx";
import Monitor from "./modules/Monitor.jsx";
import Templates from "./modules/Templates.jsx";
import Links from "./modules/Links.jsx";
import Workspace from "./modules/Workspace.jsx";
import Notes from "./modules/Notes.jsx";
import Agenda from "./modules/Agenda.jsx";
import Admin from "./modules/Admin.jsx";
import Analytics from "./modules/Analytics.jsx";

function Panel({ id, children }) {
  const { activePanel } = useApp();
  if (activePanel !== id) return null;
  return (
    <div className="panel active">
      {children}
    </div>
  );
}

function ReminderNotifier() {
  const { reminders, toggle } = useReminders();
  const toast = useToast();
  const notified = useRef(new Set());

  const remindersRef = useRef(reminders);
  useEffect(() => { remindersRef.current = reminders; }, [reminders]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      remindersRef.current.forEach(r => {
        if (r.done || r.date !== todayStr || r.time !== hhmm || notified.current.has(r.id)) return;
        notified.current.add(r.id);
        toast(
          r.title + (r.sub ? ` — ${r.sub}` : ''),
          'info',
          { label: 'Marcar como feito', fn: () => toggle(r.id) }
        );
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('⏰ ' + r.title, {
            body: r.sub || 'Lembrete da agenda',
            icon: '/favicon.svg',
            tag: 'reminder-' + r.id,
          });
        }
      });
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function AppShell() {
  const { theme, density, mode, vibe, rhythm, accent } = useApp();
  const { profile } = useAuth();
  const { maintenance, loading: maintLoading } = useMaintenance();

  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute('data-theme', theme);
    r.setAttribute('data-density', density);
    r.setAttribute('data-mode', mode);
    r.setAttribute('data-vibe', vibe);
    r.setAttribute('data-rhythm', rhythm);
  }, [theme, density, mode, vibe, rhythm]);

  useEffect(() => { applyAccent(accent); }, [accent]);

  if (!maintLoading && maintenance.enabled && profile?.role !== 'admin') {
    return <MaintenancePage message={maintenance.message} />;
  }

  return (
    <RemindersProvider>
      <div id="app">
        <ReminderNotifier />
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
            <Panel id="perfil"><Profile /></Panel>
            {profile?.role === 'admin' && (
              <>
                <Panel id="admin"><Admin /></Panel>
                <Panel id="analytics"><Analytics /></Panel>
              </>
            )}
          </div>
        </div>
        {profile?.role === 'admin' && maintenance.enabled && (
          <div style={{
            position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: '#F26931', color: '#fff',
            padding: '8px 16px', borderRadius: 999,
            fontSize: 12, fontWeight: 600, letterSpacing: 0.3,
            boxShadow: '0 6px 20px rgba(242,105,49,0.4)',
            display: 'flex', alignItems: 'center', gap: 6,
            zIndex: 9999,
          }}>
            <i className="ti ti-tools"></i> Plataforma em manutenção (visível só para admins)
          </div>
        )}
        <TweaksPanel />
      </div>
    </RemindersProvider>
  );
}

export default function App() {
  const { session, loading, authType } = useAuth();

  if (loading) return null;

  if (session && (authType === 'invite' || authType === 'recovery')) return <SetPasswordPage />;

  if (!session) return <LoginPage />;

  return <AppShell />;
}
