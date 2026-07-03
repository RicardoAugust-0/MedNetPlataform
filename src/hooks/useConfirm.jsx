import { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [modal, setModal] = useState(null);
  const confirmBtnRef = useRef(null);
  const inputRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (!modal) return;
    (modal.input ? inputRef : confirmBtnRef).current?.focus();
    if (modal.input) inputRef.current?.select();
    const handleKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        modal.onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        modal.onCancel();
      } else if (e.key === 'Tab') {
        // Focus trap — teclado não deve sair do modal enquanto ele estiver aberto.
        const focusables = modalRef.current?.querySelectorAll(
          'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
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
        input: options.input || null,
        onConfirm: () => {
          setModal(null);
          resolve(options.input ? (inputRef.current?.value.trim() || null) : true);
        },
        onCancel: () => { setModal(null); resolve(options.input ? null : false); }
      });
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {modal && createPortal(
        <div className="modal-overlay open" style={{ zIndex: 9999 }}>
          <div
            ref={modalRef}
            className="modal"
            style={{ maxWidth: 420 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
          >
            <div className="modal-header">
              <div className="modal-title" id="confirm-modal-title">
                <i className={`ti ${modal.danger ? 'ti-alert-triangle text-danger' : 'ti-help'}`}></i>
                {modal.title}
              </div>
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: modal.input ? 12 : 24, lineHeight: 1.5 }}>
              {modal.message}
            </div>
            {modal.input && (
              <input
                ref={inputRef}
                type="text"
                className="form-control"
                defaultValue={modal.input.defaultValue || ''}
                placeholder={modal.input.placeholder || ''}
                style={{ marginBottom: 24 }}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={modal.onCancel}>{modal.cancelText}</button>
              <button ref={modal.input ? null : confirmBtnRef} className={`btn ${modal.danger ? 'btn-danger' : 'btn-primary'}`} onClick={modal.onConfirm}>
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
