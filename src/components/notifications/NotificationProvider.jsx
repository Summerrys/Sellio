import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  };

  // Fetch notifications
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.email],
    queryFn: async () => {
      if (!user) return [];
      return base44.entities.Notification.filter(
        { user_email: user.email },
        '-created_date',
        50
      );
    },
    enabled: !!user,
    refetchInterval: 30000, // Backup polling every 30s
  });

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const unsubscribe = base44.entities.Notification.subscribe((event) => {
      if (event.type === 'create' && event.data?.user_email === user.email) {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        
        // Show toast
        toast.info(event.data.title, {
          description: event.data.message,
          duration: 5000,
        });

        // Play sound for high priority
        if (event.data.priority === 'high' || event.data.priority === 'critical') {
          playNotificationSound();
        }
      }
    });

    return unsubscribe;
  }, [user, queryClient]);

  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }
  };

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      return base44.entities.Notification.update(notificationId, {
        is_read: true,
        read_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unreadNotifications = notifications.filter(n => !n.is_read);
      return Promise.all(
        unreadNotifications.map(n =>
          base44.entities.Notification.update(n.id, {
            is_read: true,
            read_at: new Date().toISOString(),
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All notifications marked as read');
    },
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const value = {
    notifications,
    unreadCount,
    markAsRead: (id) => markAsReadMutation.mutate(id),
    markAllAsRead: () => markAllAsReadMutation.mutate(),
    playSound: playNotificationSound,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZSBQMS6Ln77BcGwU+ltTy0H4qBSh+zPDajzoJE1yy6+SfUBMJS6Lg8rllIQU2j9Ty0oIuBSV4yPDbki4HGWu/7OKXRxILT6jk8bJeHQU7mtXx0H8pBCuCzvDakTsJElyw6+GdTxkKSZ7h8rllHwU2kdPx1IIvBSp4yO/bkz0KFl2w6+KdUhIMT6fn8LRfHQU7nNXy0IAqBS2Bze/aj0IJEV6w6+SfVBUJSaDg8bViIAU3kdTy1IQxBSh4x+/ckT4KFl6x6+KeUhMLUanl8bNgHgVEnNTy0H8pBSt/yPDbkDwJFF+x6uKeTBYKSaHg8bllIAU5k9Tx1IMyBSh5ye/dlEEKFGCy6uOfUhQMUavm8bRiHwVFntXx0H4pBSh/ye7ckUILFWGz6+OgVBYLS6Ph8r" />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}