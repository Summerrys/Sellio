import React, { useState } from 'react';
import { useNotifications } from '../components/notifications/NotificationProvider';
import PageHeader from '../components/ui-custom/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Bell, ShoppingBag, AlertTriangle, Users, Search, Check } from 'lucide-react';
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

export default function Notifications() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Filter notifications
  const filteredNotifications = notifications.filter(notification => {
    const matchesSearch = notification.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         notification.message.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || notification.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'unread' && !notification.is_read) ||
                         (statusFilter === 'read' && notification.is_read);
    return matchesSearch && matchesType && matchesStatus;
  });

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Stay updated with your business activities"
        actions={
          unreadCount > 0 && (
            <Button onClick={markAllAsRead} variant="outline">
              <Check className="w-4 h-4 mr-2" />
              Mark All as Read
            </Button>
          )
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500 mb-1">Total</p>
          <p className="text-2xl font-bold">{notifications.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 mb-1">Unread</p>
          <p className="text-2xl font-bold text-blue-600">{unreadCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 mb-1">Read</p>
          <p className="text-2xl font-bold text-slate-400">{notifications.length - unreadCount}</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="new_order">New Orders</SelectItem>
              <SelectItem value="low_stock">Low Stock</SelectItem>
              <SelectItem value="staff_joined">Staff</SelectItem>
              <SelectItem value="system_announcement">Announcements</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Notifications List */}
      <div className="space-y-2">
        {filteredNotifications.length === 0 ? (
          <Card className="p-12 text-center">
            <Bell className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg">No notifications found</p>
          </Card>
        ) : (
          filteredNotifications.map((notification) => {
            const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
            const colorClass = NOTIFICATION_COLORS[notification.type] || 'text-slate-600 bg-slate-100';

            return (
              <Card
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`p-4 cursor-pointer hover:shadow-md transition-all ${
                  !notification.is_read ? 'border-l-4 border-l-blue-600 bg-blue-50/30' : ''
                }`}
              >
                <div className="flex gap-4">
                  <div className={`w-12 h-12 rounded-full ${colorClass} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{notification.title}</h3>
                        {!notification.is_read && (
                          <Badge variant="default" className="bg-blue-600">New</Badge>
                        )}
                        {notification.priority === 'high' && (
                          <Badge variant="destructive">High Priority</Badge>
                        )}
                      </div>
                      <span className="text-sm text-slate-500 whitespace-nowrap">
                        {format(new Date(notification.created_date), 'MMM dd, HH:mm')}
                      </span>
                    </div>
                    <p className="text-slate-600">{notification.message}</p>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}