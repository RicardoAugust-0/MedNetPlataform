import { useEffect, useRef, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import LoginPage from "./auth/LoginPage.jsx";
import SetPasswordPage from "./auth/SetPasswordPage.jsx";
import MaintenancePage from "./components/MaintenancePage.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import { useApp } from "./context.jsx";
import { useMaintenance } from "./hooks/useMaintenance.jsx";
import { RemindersProvider, useReminders } from "./hooks/useReminders.jsx";
import { useToast } from "./hooks/useToast.jsx";
import { DataProvider } from "./components/DataProvider.jsx";
const AdminLayout = lazy(() => import("./modules/admin/AdminLayout.jsx"));
const AdminEquipe = lazy(() => import("./modules/admin/EquipeTab.jsx"));
const AdminIntegracoes = lazy(() => import("./modules/admin/IntegracoesLayout.jsx"));
const AdminCredenciais = lazy(() => import("./modules/admin/IntegracoesCredenciais.jsx"));
const AdminTransportadoras = lazy(() => import("./modules/admin/IntegracoesTransportadoras.jsx"));
const AdminHorizon = lazy(() => import("./modules/admin/IntegracoesHorizon.jsx"));
const AdminIA = lazy(() => import("./modules/admin/AiCredentials.jsx"));
const AdminSistema = lazy(() => import("./modules/admin/SistemaLayout.jsx"));
const AdminManutencao = lazy(() => import("./modules/admin/SistemaManutencao.jsx"));
const AdminLimpeza = lazy(() => import("./modules/admin/SistemaLimpeza.jsx"));
const AdminAuditoria = lazy(() => import("./modules/admin/AdminAuditoria.jsx"));
const AdminAiChat = lazy(() => import("./modules/admin/AiChatTab.jsx"));
const Agenda = lazy(() => import("./modules/Agenda.jsx"));
const Analytics = lazy(() => import("./modules/Analytics.jsx"));
const CrossCheck = lazy(() => import("./modules/CrossCheck.jsx"));
const Dashboard = lazy(() => import("./modules/Dashboard.jsx"));
const DossiesPage = lazy(() => import("./modules/DossiesPage.jsx"));
const Links = lazy(() => import("./modules/Links.jsx"));
const Monitor = lazy(() => import("./modules/Monitor.jsx"));
const Notes = lazy(() => import("./modules/Notes.jsx"));
const Profile = lazy(() => import("./modules/Profile.jsx"));
const Templates = lazy(() => import("./modules/Templates.jsx"));
const Automacoes = lazy(() => import("./modules/Automacoes.jsx"));
const Workspace = lazy(() => import("./modules/Workspace.jsx"));
const EmbeddedSheet = lazy(() => import("./modules/EmbeddedSheet.jsx"));
import { applyAccent } from "./utils.js";
import { ROLE_LEVEL } from "./data.js";
import GlobalAiChat from "./components/GlobalAiChat.jsx";

function AdminGuard({ children }) {
  const { profile } = useAuth();
  if (!profile) return null;
  if (profile.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

// Guard genérico por hierarquia de role (operador < líder < admin).
function RoleGuard({ min = "lider", children }) {
  const { profile } = useAuth();
  if (!profile) return null;
  if ((ROLE_LEVEL[profile.role] ?? 0) < ROLE_LEVEL[min]) return <Navigate to="/dashboard" replace />;
  return children;
}

function ReminderNotifier() {
  const { reminders, toggle } = useReminders();
  const toast = useToast();
  const notified = useRef(new Set());

  const remindersRef = useRef(reminders);
  useEffect(() => {
    remindersRef.current = reminders;
  }, [reminders]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      remindersRef.current.forEach((r) => {
        if (
          r.done ||
          r.date !== todayStr ||
          r.time !== hhmm ||
          notified.current.has(r.id)
        )
          return;
        notified.current.add(r.id);
        toast(r.title + (r.sub ? ` — ${r.sub}` : ""), "info", {
          label: "Marcar como feito",
          fn: () => toggle(r.id),
        });
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("⏰ " + r.title, {
            body: r.sub || "Lembrete da agenda",
            icon: "/favicon.svg",
            tag: "reminder-" + r.id,
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

function AppShell() {
  const { theme, density, mode, vibe, rhythm, accent } = useApp();
  const { profile } = useAuth();
  const { maintenance, loading: maintLoading } = useMaintenance();
  const location = useLocation();

  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", theme);
    r.setAttribute("data-density", density);
    r.setAttribute("data-mode", mode);
    r.setAttribute("data-vibe", vibe);
    r.setAttribute("data-rhythm", rhythm);
  }, [theme, density, mode, vibe, rhythm]);

  useEffect(() => {
    applyAccent(accent);
  }, [accent]);

  if (!maintLoading && maintenance.enabled && profile?.role !== "admin") {
    return <MaintenancePage message={maintenance.message} />;
  }

  const isChat = location.pathname === "/chat";

  return (
    <RemindersProvider>
      <DataProvider>
        <div id="app" className={isChat ? "is-chat-page" : ""}>
          <ReminderNotifier />
          <Sidebar />
          <div className="main-area">
            {!isChat && <Topbar />}
            <main className={isChat ? "content-area chat-content-area" : "content-area"}>
              <Suspense fallback={null}>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route
                    path="/monitor"
                    element={<Navigate to="/monitor/intervencao" replace />}
                  />
                  <Route path="/monitor/:tab" element={<Monitor />} />
                  <Route path="/planilha" element={<EmbeddedSheet />} />
                  <Route path="/dossies" element={<Navigate to="/dossies/clinico" replace />} />
                  <Route path="/dossies/:tab" element={<DossiesPage />} />
                  <Route path="/agenda" element={<Agenda />} />
                  <Route
                    path="/crosscheck"
                    element={<RoleGuard min="lider"><CrossCheck /></RoleGuard>}
                  />
                  <Route
                    path="/chat"
                    element={<AdminGuard><AdminAiChat /></AdminGuard>}
                  />
                  <Route path="/templates" element={<Templates />} />
                  <Route path="/automacoes" element={<Automacoes />} />
                  <Route path="/workspace" element={<Workspace />} />
                  <Route path="/workspace/:categoria" element={<Workspace />} />
                  <Route path="/notas" element={<Notes />} />
                  <Route path="/links" element={<Links />} />
                  <Route path="/perfil" element={<Profile />} />
                  {/* Compat: rotas antigas redirecionam para o novo escopo /admin */}
                  <Route path="/analytics" element={<Navigate to="/admin/analytics" replace />} />
                  <Route path="/relatorios" element={<Navigate to="/admin/analytics" replace />} />

                  {/* Administração: guard único no pai, sub-rotas reais via <Outlet/> */}
                  <Route
                    path="/admin"
                    element={
                      <AdminGuard>
                        <AdminLayout />
                      </AdminGuard>
                    }
                  >
                    <Route index element={<Navigate to="analytics" replace />} />
                    <Route path="analytics" element={<Analytics />} />
                    <Route path="equipe" element={<AdminEquipe />} />
                    <Route path="integracoes" element={<AdminIntegracoes />}>
                      <Route index element={<Navigate to="credenciais" replace />} />
                      <Route path="credenciais" element={<AdminCredenciais />} />
                      <Route path="transportadoras" element={<AdminTransportadoras />} />
                      <Route path="horizon" element={<AdminHorizon />} />
                    </Route>
                    <Route path="ia" element={<AdminIA />} />
                    <Route path="sistema" element={<AdminSistema />}>
                      <Route index element={<Navigate to="manutencao" replace />} />
                      <Route path="manutencao" element={<AdminManutencao />} />
                      <Route path="limpeza" element={<AdminLimpeza />} />
                    </Route>
                  </Route>
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Suspense>
            </main>
          </div>
          {profile?.role === "admin" && maintenance.enabled && (
            <div
              style={{
                position: "fixed",
                bottom: 16,
                left: "50%",
                transform: "translateX(-50%)",
                background: "#F26931",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.3,
                boxShadow: "0 6px 20px rgba(242,105,49,0.4)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                zIndex: 9999,
              }}
            >
              <i className="ti ti-tools"></i> Plataforma em manutenção (visível só
              para admins)
            </div>
          )}
          <GlobalAiChat />
        </div>
      </DataProvider>
    </RemindersProvider>
  );
}

export default function App() {
  const { session, loading, authType } = useAuth();

  if (loading) return null;

  if (session && (authType === "invite" || authType === "recovery"))
    return <SetPasswordPage />;

  if (!session) return <LoginPage />;

  return <AppShell />;
}
