import { createContext, useContext, useState, useCallback } from 'react';

const ToastCtx = createContext(null);

const MAX_TOASTS = 4;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((msg, kind = 'info', action = null) => {
    const id = crypto.randomUUID();
    setToasts(prev => {
      const next = [...prev, { id, msg, kind, action }];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
    setTimeout(() => dismiss(id), action ? 8000 : 4500);
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-stack">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast-item toast-item--${t.kind}${!t.action ? ' toast-item--clickable' : ''}`}
            onClick={() => { if (!t.action) dismiss(t.id); }}
          >
            <i className={`ti ${
              t.kind === 'error'   ? 'ti-alert-circle' :
              t.kind === 'success' ? 'ti-circle-check' :
              'ti-info-circle'
            }`} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{t.msg}</span>
            {t.action && (
              <button className="toast-action-btn" onClick={() => { t.action.fn(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
            {t.action && (
              <button className="toast-dismiss-btn" onClick={() => dismiss(t.id)}>
                <i className="ti ti-x"></i>
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
