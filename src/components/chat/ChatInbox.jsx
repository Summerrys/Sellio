import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, RefreshCw, ImageIcon } from 'lucide-react';
import { chatList } from '@/lib/chat';
import { BRAND_COLOR, ShopAvatar, ItemImage } from '@/components/explore/shared';

// A list of chats. box: 'all' | 'buying' | 'selling'; tenantId narrows selling chats
// to one shop (the workspace). Each row links to hrefFor(chat).

async function loadChats(box, tenantId) {
  if (box === 'all') {
    const [buying, selling] = await Promise.all([chatList('buying'), chatList('selling')]);
    return [...(buying || []), ...(selling || [])]
      .sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)));
  }
  return (await chatList(box, tenantId)) || [];
}

function shortTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' });
  const days = (now - d) / 86400000;
  if (days < 7) return d.toLocaleDateString('en-SG', { weekday: 'short' });
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

export function useChatList(box, tenantId = null, enabled = true) {
  return useQuery({
    queryKey: ['chatList', box, tenantId],
    queryFn: () => loadChats(box, tenantId),
    enabled,
    refetchInterval: 20000,
    staleTime: 3000,
  });
}

export function ChatRow({ chat, href, selected = false, showBox = false }) {
  const buying = chat.box === 'buying';
  const who = buying ? chat.shop_name : chat.buyer_name;
  const unread = Number(chat.unread) || 0;
  const preview = chat.last_message_preview === 'Photo' ? null : chat.last_message_preview;
  return (
    <Link
      to={href}
      className={`flex items-center gap-3 px-4 py-3 transition-colors ${selected ? 'bg-slate-100' : 'hover:bg-slate-50 active:bg-slate-100'}`}
      aria-current={selected ? 'true' : undefined}
    >
      {buying
        ? <ShopAvatar name={chat.shop_name} logo={chat.shop_logo_url} size={48} />
        : <ShopAvatar name={chat.buyer_name} logo={null} size={48} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className={`flex-1 min-w-0 truncate text-[15px] ${unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{who}</p>
          <span className={`text-[11px] flex-shrink-0 ${unread ? 'font-semibold' : 'text-slate-400'}`} style={unread ? { color: BRAND_COLOR } : undefined}>
            {shortTime(chat.last_message_at)}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate">
          {showBox && <span className="font-semibold text-slate-400">{buying ? 'Buying · ' : 'Selling · '}</span>}
          {chat.product_name}
        </p>
        <div className="flex items-center gap-2">
          <p className={`flex-1 min-w-0 truncate text-sm ${unread ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
            {chat.from_me && <span className="text-slate-400 font-normal">You: </span>}
            {preview ?? <span className="inline-flex items-center gap-1 align-middle"><ImageIcon className="w-3.5 h-3.5" /> Photo</span>}
          </p>
          {unread > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold leading-5 text-center flex-shrink-0">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
      <ItemImage src={chat.product_image_url} name={chat.product_name} className="w-12 h-12 text-lg flex-shrink-0" rounded="rounded-lg" />
    </Link>
  );
}

export default function ChatInbox({ box, tenantId = null, hrefFor, selectedId = null, emptyText }) {
  const { data, status, refetch, isFetching } = useChatList(box, tenantId);

  if (status === 'pending') {
    return (
      <div aria-hidden="true" className="divide-y divide-slate-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
            <div className="w-12 h-12 rounded-full bg-slate-200" />
            <div className="flex-1 space-y-2"><div className="h-3 w-1/2 rounded bg-slate-200" /><div className="h-3 w-3/4 rounded bg-slate-200" /></div>
            <div className="w-12 h-12 rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-slate-600">We couldn't load your chats just now.</p>
        <button type="button" onClick={() => refetch()} disabled={isFetching} className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 disabled:opacity-60">
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Try again
        </button>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="p-8 text-center">
        <span className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
          <MessageCircle className="w-6 h-6 text-slate-400" />
        </span>
        <p className="mt-3 text-sm text-slate-600">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {data.map((chat) => (
        <ChatRow key={chat.id} chat={chat} href={hrefFor(chat)} selected={chat.id === selectedId} showBox={box === 'all'} />
      ))}
    </div>
  );
}
