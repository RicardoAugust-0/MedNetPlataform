import { createContext, useContext, useState, useCallback } from 'react';

const NotificationsCtx = createContext(null);
const STORAGE_PREFIX = 'mn_notification_center';
const MAX_STORED = 50;

function storageKey(userId) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : null;
}

function load(userId) {
  try {
    const key = storageKey(userId);
    if (!key) return [];
    const v = localStorage.getItem(key);
    const parsed = v ? JSON.parse(v) : [];
    if (!Array.isArray(parsed)) return [];
    // Funções nunca são restauradas de storage. Também neutraliza registros
    // legados cuja action foi serializada apenas com label, sem handler.
    return parsed.map((notification) => ({ ...notification, action: null }));
  } catch {
    return [];
  }
}

function save(userId, list) {
  try {
    const key = storageKey(userId);
    if (!key) return;
    const serializable = list.map((notification) => {
      const copy = { ...notification };
      delete copy.action;
      return copy;
    });
    localStorage.setItem(key, JSON.stringify(serializable));
  } catch { /* storage não crítico */ }
}

// Central de notificações persistente — distinta dos toasts efêmeros (useToast):
// fica registrada até o usuário ler/limpar, sobrevive a reload (localStorage).
export function NotificationsProvider({ children, userId }) {
  const [notifications, setNotifications] = useState(() => load(userId));

  const notify = useCallback(({ title, body, kind = 'info', link = null, action = null }) => {
    setNotifications(prev => {
      const next = [{ id: crypto.randomUUID(), title, body, kind, link, action, read: false, createdAt: Date.now() }, ...prev];
      const trimmed = next.slice(0, MAX_STORED);
      save(userId, trimmed);
      return trimmed;
    });
  }, [userId]);

  const markRead = useCallback((id) => {
    setNotifications(prev => {
      const next = prev.map(n => (n.id === id ? { ...n, read: true } : n));
      save(userId, next);
      return next;
    });
  }, [userId]);

  const markAllRead = useCallback(() => {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      save(userId, next);
      return next;
    });
  }, [userId]);

  const clearAll = useCallback(() => {
    setNotifications([]);
    save(userId, []);
  }, [userId]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationsCtx.Provider value={{ notifications, unreadCount, notify, markRead, markAllRead, clearAll }}>
      {children}
    </NotificationsCtx.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsCtx);
  if (!context) throw new Error('useNotifications deve ser usado dentro de um NotificationsProvider');
  return context;
}
