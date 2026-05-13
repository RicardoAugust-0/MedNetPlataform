import { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [modal, setModal] = useState(null);
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    if (!modal) return;
    confirmBtnRef.current?.focus();
    const handleKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        modal.onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        modal.onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [modal]);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setModal({
        title: options.title || 'Confirmação',
        message: options.message || 'Tem certeza que deseja continuar?',
        confirmText: options.confirmText || 'Confirmar',
        cancelText: options.cancelText || 'Cancelar',
        danger: options.danger || false,
        onConfirm: () => { setModal(null); resolve(true); },
        onCancel: () => { setModal(null); resolve(false); }
      });
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {modal && createPortal(
        <div className="modal-overlay open" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title">
                <i className={`ti ${modal.danger ? 'ti-alert-triangle text-danger' : 'ti-help'}`}></i>
                {modal.title}
              </div>
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
              {modal.message}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={modal.onCancel}>{modal.cancelText}</button>
              <button ref={confirmBtnRef} className={`btn ${modal.danger ? 'btn-danger' : 'btn-primary'}`} onClick={modal.onConfirm}>
                {modal.confirmText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm deve ser usado dentro de um ConfirmProvider');
  return context.confirm;
}
