import { createRoot } from "react-dom/client";
import "virtual:pwa-register";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppProvider } from "./context";
import { ConfirmProvider } from "./hooks/useConfirm";
import { ToastProvider } from "./hooks/useToast";
import "./styles/crosscheck.css";
import "./styles/layout.css";
import "./styles/modules.css";
import "./styles/tokens.css";

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <ConfirmProvider>
      <ToastProvider>
        <AuthProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </AuthProvider>
      </ToastProvider>
    </ConfirmProvider>
  </ErrorBoundary>,
);
