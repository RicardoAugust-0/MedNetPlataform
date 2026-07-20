import { useAuth } from '../auth/AuthContext.jsx';
import { NotificationsProvider } from '../hooks/useNotifications.jsx';

export default function SessionNotificationsProvider({ children }) {
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  return (
    <NotificationsProvider key={userId || 'signed-out'} userId={userId}>
      {children}
    </NotificationsProvider>
  );
}
