import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useAppUser } from '@/lib/AppUserContext';
import { rememberReturnPath } from '@/lib/authNavigation';
import { useChatUnread } from '@/lib/chat';
import ChatInbox from '@/components/chat/ChatInbox';
import ChatThread from '@/components/chat/ChatThread';
import ExploreTabBar, { TAB_BAR_SPACE } from './ExploreTabBar';
import ShopBell from './ShopBell';
import { BRAND_COLOR, BRAND_GRADIENT, ExploreTabHeader, chatUrl, goBack } from './shared';

// Explore → Chat: chats as a buyer and about your own listings.

const BOXES = [
  { key: 'all', label: 'All' },
  { key: 'buying', label: 'Buying' },
  { key: 'selling', label: 'Selling' },
];
const EMPTY = {
  all: 'No chats yet. Tap Chat on any listing to ask the seller a question.',
  buying: 'Chats you start about listings show up here.',
  selling: 'When buyers message you about your listings, the chats show up here.',
};
const BOX_KEY = 'sellio_chat_box';

export default function ExploreChats() {
  const { appUser } = useAppUser() || {};
  const unread = useChatUnread(!!appUser);
  const [box, setBox] = useState(() => {
    try { return sessionStorage.getItem(BOX_KEY) || 'all'; } catch { return 'all'; }
  });

  useEffect(() => {
    const previous = document.title;
    document.title = 'Chats · Sellio';
    return () => { document.title = previous; };
  }, []);

  const choose = (key) => {
    setBox(key);
    try { sessionStorage.setItem(BOX_KEY, key); } catch { /* storage unavailable */ }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <ExploreTabHeader title="Chats" right={<ShopBell />}>
        {appUser && (
          <div className="max-w-6xl mx-auto px-4 pb-2 flex gap-2" role="tablist" aria-label="Chats">
            {BOXES.map(({ key, label }) => {
              const active = box === key;
              const count = key === 'buying' ? unread.buying : key === 'selling' ? unread.selling : 0;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => choose(key)}
                  className={`h-8 px-3.5 rounded-full text-sm font-semibold border inline-flex items-center gap-1.5 ${active ? 'text-white border-transparent' : 'bg-white text-slate-700 border-slate-200'}`}
                  style={active ? { background: BRAND_GRADIENT } : undefined}
                >
                  {label}
                  {Number(count) > 0 && (
                    <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-[18px] ${active ? 'bg-white/90' : 'bg-rose-500 text-white'}`} style={active ? { color: BRAND_COLOR } : undefined}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </ExploreTabHeader>
      <main className="max-w-3xl mx-auto" style={{ paddingBottom: TAB_BAR_SPACE }}>
        {appUser ? (
          <div className="bg-white md:mt-4 md:rounded-2xl md:border md:border-slate-100 overflow-hidden">
            <ChatInbox box={box} hrefFor={(chat) => chatUrl(chat.id)} emptyText={EMPTY[box]} />
          </div>
        ) : (
          <div className="m-4 bg-white rounded-2xl border border-slate-100 p-6 text-center">
            <span className="mx-auto w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: BRAND_GRADIENT }}>
              <MessageCircle className="w-6 h-6" />
            </span>
            <p className="mt-3 text-base font-bold text-slate-900">Chat with sellers</p>
            <p className="mt-1 text-sm text-slate-500">Log in to ask about listings and see your chats.</p>
            <Link
              to="/Auth"
              onClick={() => rememberReturnPath('/explore/chats')}
              className="mt-4 h-10 px-5 rounded-full text-sm font-semibold text-white inline-flex items-center"
              style={{ background: BRAND_GRADIENT }}
            >
              Log in
            </Link>
          </div>
        )}
      </main>
      <ExploreTabBar active="chats" />
    </div>
  );
}

// /explore/chats/:conversationId, or /explore/chats/new?listing=<id> for a first message.
export function ExploreChatThread() {
  const { conversationId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isNew = conversationId === 'new';
  const productId = isNew ? params.get('listing') : null;

  useEffect(() => {
    const previous = document.title;
    document.title = 'Chat · Sellio';
    return () => { document.title = previous; };
  }, []);

  return (
    <ChatThread
      key={isNew ? `new-${productId}` : conversationId}
      conversationId={isNew ? null : conversationId}
      productId={productId}
      variant="page"
      onBack={() => goBack(navigate, '/explore/chats')}
      onCreated={(id) => navigate(chatUrl(id), { replace: true })}
    />
  );
}
