import React from 'react';
import { useAppUser } from '@/lib/AppUserContext';
import { useChatUnread } from '@/lib/chat';
import { useBusinessBar } from '@/components/navigation/MerchantTabBar';

// The number on Explore's Chat link on wide screens (ExploreDesktopTabs), so a new message
// shows without opening Chat (Alvin, 14 Nov 2026). The same count as the bottom bar's Chat on
// phones: chats about things you buy and you sell. A business's chats have their own button
// beside the bell (ShopBell), and signed out there are none, so neither shows a number here.
export default function ExploreChatCount() {
  const { appUser } = useAppUser() || {};
  const business = useBusinessBar(!!appUser?.tenant_id);
  const unread = useChatUnread(!!appUser && !business);
  const count = (Number(unread.buying) || 0) + (Number(unread.selling) || 0);
  if (count <= 0) return null;
  return (
    <>
      <span className="sr-only">{`, ${count} unread`}</span>
      <span
        aria-hidden="true"
        data-testid="chat-tab-unread"
        className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-[18px] text-center"
      >
        {count > 99 ? '99+' : count}
      </span>
    </>
  );
}
