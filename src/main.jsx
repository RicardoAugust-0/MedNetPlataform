import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './auth/AuthContext';
import { AppProvider } from './context';
import { ToastProvider } from './hooks/useToast';
import { ConfirmProvider } from './hooks/useConfirm';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';
import 'virtual:pwa-register';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/modules.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
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
    </ErrorBoundary>
  </StrictMode>
);
