import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppProvider } from "./context";
import { CommandPaletteProvider } from "./hooks/useCommandPalette";
import { ConfirmProvider } from "./hooks/useConfirm";
import SessionNotificationsProvider from "./components/SessionNotificationsProvider";
import { ReauthProvider } from "./hooks/useReauth";
import { ToastProvider } from "./hooks/useToast";
import { SheetHistoryProvider } from "./hooks/useSheetHistory";
import "./styles/embedded-sheet.css";
import "./styles/layout.css";
import "./styles/modules.css";
import "./styles/tokens.css";
import "./styles/visual-refresh.css";

// Migração de segurança: versões anteriores armazenavam respostas autenticadas
// do Supabase em um runtime cache global. A regra foi removida do service worker
// e o cache legado é apagado assim que a nova versão inicializa.
if ('caches' in window) {
  void window.caches.delete('supabase-cache');
}

// Notificações antigas usavam uma chave compartilhada entre contas. A versão
// atual persiste cada central apenas sob a chave vinculada ao usuário autenticado.
try {
  window.localStorage.removeItem('mn_notification_center');
} catch {
  // Storage pode estar indisponível em contextos privados/restritos.
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <ErrorBoundary>
      <ConfirmProvider>
        <ToastProvider>
          <AuthProvider>
            <ReauthProvider>
              <SessionNotificationsProvider>
                <SheetHistoryProvider>
                  <AppProvider>
                    <CommandPaletteProvider>
                      <App />
                    </CommandPaletteProvider>
                  </AppProvider>
                </SheetHistoryProvider>
              </SessionNotificationsProvider>
            </ReauthProvider>
          </AuthProvider>
        </ToastProvider>
      </ConfirmProvider>
    </ErrorBoundary>
  </BrowserRouter>,
);
