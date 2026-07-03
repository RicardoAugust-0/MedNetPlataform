import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ open, onClose, children, width, style, labelledBy, className = '', closeOnOverlay = true }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    const getFocusables = () => modalRef.current?.querySelectorAll(
      'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    getFocusables()?.[0]?.focus();

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      } else if (e.key === 'Tab') {
        const focusables = getFocusables();
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
    return () => {
      window.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay open" onClick={closeOnOverlay ? onClose : undefined}>
      <div
        ref={modalRef}
        className={`modal ${className}`.trim()}
        style={{ ...(width ? { width, maxWidth: '95vw' } : null), ...style }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
