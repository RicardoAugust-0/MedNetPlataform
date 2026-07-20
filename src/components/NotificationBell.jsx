import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications.jsx';

const KIND_ICON = {
  info: 'ti-info-circle',
  success: 'ti-circle-check',
  warning: 'ti-alert-triangle',
  error: 'ti-alert-circle',
};

function relativeTime(ts) {
  const diffMin = Math.round((Date.now() - ts) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return `${Math.round(diffH / 24)}d`;
}

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const handleItemClick = (n) => {
    markRead(n.id);
    if (n.link) { navigate(n.link); setOpen(false); }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        className="topbar-icon-btn"
        title="Notificações"
        aria-label={`Notificações${unreadCount ? ` (${unreadCount} não lidas)` : ''}`}
        aria-expanded={open}
        onClick={() => { setOpen(v => !v); }}
        style={{ position: 'relative' }}
      >
        <i className="ti ti-bell"></i>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Central de notificações">
          <div className="notif-panel-header">
            <span>Notificações</span>
            {notifications.length > 0 && (
              <div style={{ display: 'flex', gap: 10 }}>
                {unreadCount > 0 && (
                  <button className="notif-panel-action" onClick={markAllRead}>Marcar todas como lidas</button>
                )}
                <button className="notif-panel-action" onClick={clearAll}>Limpar</button>
              </div>
            )}
          </div>
          <div className="notif-panel-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <i className="ti ti-bell-off"></i>
                Nenhuma notificação por aqui.
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`notif-item${n.read ? '' : ' unread'}`}
                  onClick={() => handleItemClick(n)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleItemClick(n); } }}
                >
                  <i className={`ti ${KIND_ICON[n.kind] || KIND_ICON.info} notif-item-icon notif-item-icon--${n.kind}`}></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="notif-item-title">{n.title}</div>
                    {n.body && <div className="notif-item-body">{n.body}</div>}
                    {typeof n.action?.fn === 'function' && (
                      <button
                        className="notif-panel-action"
                        style={{ marginTop: 4 }}
                        onClick={(e) => { e.stopPropagation(); n.action.fn(); markRead(n.id); }}
                      >
                        {n.action.label}
                      </button>
                    )}
                  </div>
                  <span className="notif-item-time">{relativeTime(n.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
