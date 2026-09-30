import { useEffect } from 'react';
import { useUnreadNotifications } from '../../hooks/useUnreadNotifications';
import { syncAppIconBadge } from '../../utils/pushBadge';
import { useAuthContext } from '../../context/AuthContext';

/**
 * Renders nothing. Subscribes once at the app root and mirrors the shared
 * unread count onto the platform badge (iOS icon; Android local-notification
 * clear on zero).
 */
export default function AppIconBadgeSync() {
  const { user } = useAuthContext();
  const unreadCount = useUnreadNotifications(user?.uid);

  useEffect(() => {
    void syncAppIconBadge(unreadCount);
  }, [unreadCount]);

  return null;
}
