import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from "./context.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import { supabase } from "./supabase.js";
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
import Dashboard from "./modules/Dashboard.jsx";
import Monitor from "./modules/Monitor.jsx";
import Templates from "./modules/Templates.jsx";
import Links from "./modules/Links.jsx";
import Workspace from "./modules/Workspace.jsx";
import Notes from "./modules/Notes.jsx";
import Agenda from "./modules/Agenda.jsx";
import Admin from "./modules/Admin.jsx";
import Analytics from "./modules/Analytics.jsx";
import CrossCheck from "./modules/CrossCheck.jsx";
import Reports from "./modules/Reports.jsx";

function AdminGuard({ children }) {
  const { profile } = useAuth();
  if (!profile) return null;
  if (profile.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
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
  }, []);

  return null;
}

function SascarTokenHandler() {
  const { profile, updateProfile } = useAuth();
  const toast = useToast();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes('sascar-token=')) return;

    const raw   = hash.replace(/^#/, '');
    const param = new URLSearchParams(raw);
    const token = param.get('sascar-token');
    if (!token || !profile?.id) return;

    window.history.replaceState(null, '', window.location.pathname);

    const savedAt = new Date().toISOString();
    supabase
      .from('profiles')
      .update({ sascar_token: token, sascar_token_saved_at: savedAt })
      .eq('id', profile.id)
      .then(({ error }) => {
        if (!error) {
          updateProfile({ sascar_token: token, sascar_token_saved_at: savedAt });
          toast('Token Sascar atualizado. Pode buscar os eventos agora.', 'success');
        }
      });
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <SascarTokenHandler />
        <Sidebar />
        <div className="main-area">
          <Topbar />
          <div className="content-area">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/monitor" element={<Navigate to="/monitor/intervencao" replace />} />
              <Route path="/monitor/:tab" element={<Monitor />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/crosscheck" element={<CrossCheck />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/workspace" element={<Workspace />} />
              <Route path="/notas" element={<Notes />} />
              <Route path="/links" element={<Links />} />
              <Route path="/perfil" element={<Profile />} />
              <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
              <Route path="/analytics" element={<AdminGuard><Analytics /></AdminGuard>} />
              <Route path="/relatorios" element={<AdminGuard><Reports /></AdminGuard>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
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
