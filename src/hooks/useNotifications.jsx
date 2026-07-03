import { createContext, useContext, useState, useCallback } from 'react';

const NotificationsCtx = createContext(null);
const STORAGE_KEY = 'mn_notification_center';
const MAX_STORED = 50;

function load() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}

function save(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* storage não crítico */ }
}

// Central de notificações persistente — distinta dos toasts efêmeros (useToast):
// fica registrada até o usuário ler/limpar, sobrevive a reload (localStorage).
export function NotificationsProvider({ children }) {
  const [notifications, setNotifications] = useState(load);

  const notify = useCallback(({ title, body, kind = 'info', link = null, action = null }) => {
    setNotifications(prev => {
      const next = [{ id: crypto.randomUUID(), title, body, kind, link, action, read: false, createdAt: Date.now() }, ...prev];
      const trimmed = next.slice(0, MAX_STORED);
      save(trimmed);
      return trimmed;
    });
  }, []);

  const markRead = useCallback((id) => {
    setNotifications(prev => {
      const next = prev.map(n => (n.id === id ? { ...n, read: true } : n));
      save(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      save(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    save([]);
  }, []);

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
