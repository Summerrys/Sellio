import React, { useState } from 'react';
import { useNotifications } from '../components/notifications/NotificationProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Bell, ShoppingBag, AlertTriangle, Users, Search, Check, SlidersHorizontal, X } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const NOTIFICATION_ICONS = {
  new_order: ShoppingBag,
  order_cancelled: AlertTriangle,
  low_stock: AlertTriangle,
  staff_joined: Users,
  waiter_acknowledged: Check,
  order_status_changed: ShoppingBag,
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

const TYPE_FILTERS = [
  { value: 'all', label: 'All types' },
  { value: 'new_order', label: 'New orders' },
  { value: 'low_stock', label: 'Low stock' },
  { value: 'staff_joined', label: 'Staff' },
  { value: 'system', label: 'Announcements' },
];

export default function Notifications() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = searchQuery.trim().toLowerCase();

  const filteredNotifications = notifications.filter(notification => {
    const matchesSearch = `${notification.title || ''} ${notification.message || ''}`.toLowerCase().includes(query);
    const matchesType = typeFilter === 'all' || (typeFilter === 'system'
      ? ['system', 'system_announcement'].includes(notification.type)
      : notification.type === typeFilter);
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'unread' && !notification.is_read) ||
      (statusFilter === 'read' && notification.is_read);
    return matchesSearch && matchesType && matchesStatus;
  });

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) markAsRead(notification.id);
    if (notification.link) navigate(notification.link);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
  };

  return (
    <div className="min-w-0 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 text-xl font-bold tracking-tight text-foreground [overflow-wrap:anywhere]">Notifications</h1>
        {unreadCount > 0 && (
          <Button
            onClick={markAllAsRead}
            variant="outline"
            className="min-h-[44px] min-w-[44px] shrink-0 px-2 text-xs sm:px-3"
            aria-label="Mark all as read"
            title="Mark all as read"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Read all</span>
          </Button>
        )}
      </header>

      <div className="grid grid-cols-3 gap-2" aria-label="Filter notifications by read status">
        {[
          { value: 'all', label: 'Total', count: notifications.length },
          { value: 'unread', label: 'Unread', count: unreadCount },
          { value: 'read', label: 'Read', count: notifications.length - unreadCount },
        ].map(({ value, label, count }) => (
          <button
            key={value}
            type="button"
            aria-pressed={statusFilter === value}
            onClick={() => setStatusFilter(value)}
            className="min-w-0 rounded-xl border bg-card px-2 py-2 text-center shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] sm:py-3"
            style={statusFilter === value ? {
              borderColor: 'rgb(var(--color-primary))',
              backgroundColor: 'rgb(var(--color-primary) / 0.08)',
              color: 'rgb(var(--color-primary))',
            } : undefined}
          >
            <span className="block text-xs font-medium [overflow-wrap:anywhere]">{label}</span>
            <span className="mt-0.5 block text-xl font-semibold tabular-nums [overflow-wrap:anywhere]">{count}</span>
          </button>
        ))}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search notifications"
            placeholder="Search notifications"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            className="h-11 min-w-0 rounded-xl pl-9 pr-9"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
              className="absolute right-0 top-0 flex h-full w-9 items-center justify-center rounded-r-xl text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="relative h-11 w-11 shrink-0 rounded-xl p-0"
              aria-label={`Filter notification type: ${TYPE_FILTERS.find(filter => filter.value === typeFilter)?.label}`}
              title="Filter by type"
              style={typeFilter !== 'all' ? { borderColor: 'rgb(var(--color-primary))', color: 'rgb(var(--color-primary))' } : undefined}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {typeFilter !== 'all' && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[rgb(var(--color-primary))]" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" collisionPadding={12} className="rounded-xl p-2" style={{ width: 'min(280px, calc(100vw - 24px))' }}>
            <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Type</p>
            <div role="group" aria-label="Notification type">
              {TYPE_FILTERS.map(({ value, label }) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={typeFilter === value}
                  onClick={() => { setTypeFilter(value); setFiltersOpen(false); }}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))]"
                  style={typeFilter === value ? { backgroundColor: 'rgb(var(--color-primary) / 0.08)', color: 'rgb(var(--color-primary))' } : undefined}
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
                  {typeFilter === value && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="min-w-0 space-y-2">
        {filteredNotifications.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center">
            <Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{notifications.length ? 'No matching notifications' : 'No notifications yet'}</p>
            {(query || typeFilter !== 'all' || statusFilter !== 'all') && (
              <Button variant="ghost" onClick={resetFilters} className="mt-2 min-h-[44px]">Clear filters</Button>
            )}
          </div>
        ) : filteredNotifications.map(notification => {
          const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
          const colorClass = NOTIFICATION_COLORS[notification.type] || 'text-slate-600 bg-slate-100';
          return (
            <button
              key={notification.id}
              type="button"
              onClick={() => handleNotificationClick(notification)}
              className="block w-full min-w-0 rounded-xl border bg-card px-3 py-3 text-left shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))]"
              style={!notification.is_read ? { borderColor: 'rgb(var(--color-primary) / 0.3)', backgroundColor: 'rgb(var(--color-primary) / 0.04)' } : undefined}
            >
              <span className="flex min-w-0 items-start gap-2.5">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${colorClass}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{notification.title}</span>
                    {!notification.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--color-primary))]" aria-label="Unread" />}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{notification.message}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <time dateTime={notification.created_date} className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {format(new Date(notification.created_date), 'MMM d, HH:mm')}
                    </time>
                    {notification.priority === 'high' && <Badge variant="destructive" className="px-1.5 py-0 text-[11px]">High priority</Badge>}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
