import React from 'react';
import { useAppUser } from '@/lib/AppUserContext';
import NotificationBell from '@/components/notifications/NotificationBell';

// The workspace's notification bell (orders, chats, …) on Explore's tabs too, for
// anyone with a shop — the same bell and the same notifications as My shop.
export default function ShopBell() {
  const { appUser } = useAppUser() || {};
  if (!appUser?.tenant_id) return null;
  return <NotificationBell />;
}
