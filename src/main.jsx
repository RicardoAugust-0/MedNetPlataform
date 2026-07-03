import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppProvider } from "./context";
import { ConfirmProvider } from "./hooks/useConfirm";
import { ToastProvider } from "./hooks/useToast";
import { SheetHistoryProvider } from "./hooks/useSheetHistory";
import "./styles/embedded-sheet.css";
import "./styles/layout.css";
import "./styles/modules.css";
import "./styles/tokens.css";
import "./styles/visual-refresh.css";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <ErrorBoundary>
      <ConfirmProvider>
        <ToastProvider>
          <AuthProvider>
            <SheetHistoryProvider>
              <AppProvider>
                <App />
              </AppProvider>
            </SheetHistoryProvider>
          </AuthProvider>
        </ToastProvider>
      </ConfirmProvider>
    </ErrorBoundary>
  </BrowserRouter>,
);
