import { useEffect, useRef } from 'react';
import { useApp } from './context';
import { useAuth } from './auth/AuthContext';
import { useReminders } from './hooks/useReminders';
import { useToast } from './hooks/useToast';
import { applyAccent } from './utils';
import LoginPage from './auth/LoginPage';
import SetPasswordPage from './auth/SetPasswordPage';
import Profile from './modules/Profile';
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
import Admin from './modules/Admin';
import Analytics from './modules/Analytics';

function Panel({ id, children }) {
  const { activePanel } = useApp();
  return (
    <div className={`panel ${activePanel === id ? 'active' : ''}`}>
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
