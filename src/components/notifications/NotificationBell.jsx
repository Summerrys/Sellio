import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Bell, Check, ShoppingBag, AlertTriangle, Users, TrendingUp, Building2 } from 'lucide-react';
import { useNotifications } from './NotificationProvider';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';

const NOTIFICATION_ICONS = {
  new_order: ShoppingBag,
  order_cancelled: AlertTriangle,
  low_stock: AlertTriangle,
  staff_joined: Users,
  waiter_acknowledged: Check,
  order_status_changed: TrendingUp,
  new_tenant_signup: Building2,
  usage_limit_warning: AlertTriangle,
  system_announcement: Bell,
};

const NOTIFICATION_COLORS = {
  new_order: 'text-blue-600 bg-blue-100',
  order_cancelled: 'text-red-600 bg-red-100',
  low_stock: 'text-amber-600 bg-amber-100',
  staff_joined: 'text-green-600 bg-green-100',
  waiter_acknowledged: 'text-green-600 bg-green-100',
  order_status_changed: 'text-purple-600 bg-purple-100',
  system_announcement: 'text-slate-600 bg-slate-100',
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const recentNotifications = notifications.slice(0, 10);

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) markAsRead(notification.id);
    if (notification.link) {
      navigate(notification.link);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative min-h-[44px] min-w-[44px]" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}>
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-xs rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="flex flex-col overflow-hidden rounded-xl p-0"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        aria-label="Recent notifications"
        style={{
          width: 'min(384px, calc(100vw - 24px))',
          maxHeight: 'min(560px, var(--radix-popover-content-available-height, 70dvh))',
        }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
          <h3 className="min-w-0 font-semibold [overflow-wrap:anywhere]">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="min-h-[44px] min-w-[44px] shrink-0 px-2 text-xs"
              aria-label="Mark all as read"
              title="Mark all as read"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Read all</span>
            </Button>
          )}
        </div>

        {/* Notifications List */}
        <div className="min-h-0 overflow-y-auto overscroll-contain" style={{ maxHeight: 'min(360px, 52dvh)' }}>
          {recentNotifications.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <div className="min-w-0 divide-y">
              {recentNotifications.map((notification) => {
                const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
                const colorClass = NOTIFICATION_COLORS[notification.type] || 'text-slate-600 bg-slate-100';
                
                return (
                  <button
                    type="button"
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className="block w-full min-w-0 px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--color-primary))]"
                    style={{ backgroundColor: !notification.is_read ? 'rgb(var(--color-primary) / 0.06)' : undefined }}
                  >
                    <div className="flex gap-3">
                      <div className={`w-9 h-9 rounded-full ${colorClass} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="min-w-0 flex-1 text-sm font-semibold text-popover-foreground [overflow-wrap:anywhere]">{notification.title}</p>
                          {!notification.is_read && (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--color-primary))]" aria-label="Unread" />
                          )}
                        </div>
                        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{notification.message}</p>
                        <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                          {formatDistanceToNow(new Date(notification.created_date), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="shrink-0 border-t p-2">
            <Button
              variant="ghost"
              className="h-auto min-h-[44px] w-full whitespace-normal text-sm"
              onClick={() => {
                navigate(createPageUrl('Notifications'));
                setOpen(false);
              }}
            >
              View all notifications
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}