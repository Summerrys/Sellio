import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useAppUser } from '@/lib/AppUserContext';
import { useChatUnread } from '@/lib/chat';
import { useBusinessBar } from '@/components/navigation/MerchantTabBar';
import NotificationBell from '@/components/notifications/NotificationBell';

// The workspace's notification bell (orders, chats, …) on Explore's tabs too, for
// anyone with a shop — the same bell and the same notifications as My shop.
// A business has no Chat tab in its bar, so its chats (buying and selling) sit next to
// the bell here; a home seller's are in the bar. withChat: false on the Chats page itself.
export default function ShopBell({ withChat = true }) {
  const { appUser } = useAppUser() || {};
  const hasShop = !!appUser?.tenant_id;
  const business = useBusinessBar(hasShop);
  if (!hasShop) return null;
  return (
    <>
      {withChat && business && <ChatsButton />}
      <NotificationBell />
    </>
  );
}

function ChatsButton() {
  const unread = useChatUnread(true);
  const count = (Number(unread.buying) || 0) + (Number(unread.selling) || 0);
  return (
    <Link
      to="/explore/chats"
      aria-label={`Chats${count ? `, ${count} unread` : ''}`}
      title="Chats"
      className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md text-slate-700 hover:bg-slate-100"
    >
      <MessageCircle className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-[18px] text-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
