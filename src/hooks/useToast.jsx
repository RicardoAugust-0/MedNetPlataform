import { createContext, useContext, useState, useCallback } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((msg, kind = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, msg, kind }]);
    setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              pointerEvents: 'all',
              boxShadow: 'var(--shadow-lg)',
              animation: 'slideInRight 0.2s ease',
              ...(t.kind === 'error'   ? { background: 'var(--danger-600, #c0392b)', color: '#fff' } :
                  t.kind === 'success' ? { background: '#1a7a3a', color: '#fff' } :
                  { background: 'var(--surface-0)', color: 'var(--text-primary)', border: '1px solid var(--border-md)' }),
            }}
          >
            <i className={`ti ${
              t.kind === 'error'   ? 'ti-alert-circle' :
              t.kind === 'success' ? 'ti-circle-check' :
              'ti-info-circle'
            }`} style={{ flexShrink: 0 }} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
