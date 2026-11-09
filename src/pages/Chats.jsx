import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useTenant } from '@/components/tenant/TenantContext';
import ChatInbox from '@/components/chat/ChatInbox';
import ChatThread from '@/components/chat/ChatThread';
import { chatUrl } from '@/components/explore/shared';

// The shop's chats with buyers. Wide screens: the list and the open chat side by side.
// Phones: the list; a chat opens full screen (the same screen as in Explore).

const WIDE = '(min-width: 1024px)';

function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(WIDE).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const onChange = () => setWide(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  return wide;
}

// The shop's Archived chats (each person's own): /Chats?archived=1.
const ARCHIVED_HREF = '/Chats?archived=1';

export default function Chats() {
  const { tenant, tenantId, hasPermission } = useTenant();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const wide = useWide();
  const selected = params.get('c');
  const archived = params.get('archived') === '1';

  useEffect(() => {
    const previous = document.title;
    document.title = archived ? 'Archived chats · Sellio' : 'Chats · Sellio';
    return () => { document.title = previous; };
  }, [archived]);

  if (!hasPermission('orders.view')) {
    return (
      <div className="max-w-xl mx-auto mt-10 bg-white rounded-2xl border border-slate-100 p-6 text-center">
        <p className="text-base font-semibold text-slate-900">Chats aren't part of your role</p>
        <p className="mt-1 text-sm text-slate-500">Ask the shop owner if you need to answer buyers.</p>
      </div>
    );
  }

  // A chat link (notification) on a phone: open it full screen.
  if (!wide && selected) return <Navigate to={chatUrl(selected)} replace />;

  const hrefFor = (chat) => (wide ? `/Chats?${archived ? 'archived=1&' : ''}c=${encodeURIComponent(chat.id)}` : chatUrl(chat.id));
  const emptyText = archived
    ? 'No archived chats. Chats you archive show up here.'
    : 'When buyers message you about your listings on Explore, the chats show up here.';
  // A chat deleted while it's open beside the list: the list alone again.
  const onRemoved = (id) => { if (id === selected) navigate(archived ? ARCHIVED_HREF : '/Chats', { replace: true }); };
  const inbox = (extra) => (
    <ChatInbox
      box="selling"
      tenantId={tenantId}
      hrefFor={hrefFor}
      emptyText={emptyText}
      archived={archived}
      archivedHref={archived ? null : ARCHIVED_HREF}
      onRemoved={onRemoved}
      {...extra}
    />
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4 px-2 sm:px-0">
        <h1 className="text-2xl font-bold text-slate-900">{archived ? 'Archived chats' : 'Chats'}</h1>
        <p className="text-sm text-slate-500">
          {archived
            ? 'Chats you\'ve archived (just for you).'
            : <>Buyers' questions about {tenant?.name ? `${tenant.name}'s` : 'your'} listings.</>}
        </p>
      </div>
      {wide ? (
        <div className="grid grid-cols-[360px_1fr] bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ height: 'calc(100vh - 15rem)', minHeight: 480 }}>
          <div className="border-r border-slate-100 overflow-y-auto">
            {inbox({ selectedId: selected })}
          </div>
          <div className="min-h-0">
            {selected ? (
              <ChatThread key={selected} conversationId={selected} variant="pane" />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 text-slate-500">
                <MessageCircle className="w-10 h-10 text-slate-300" />
                <p className="mt-3 text-sm">Choose a chat to read and reply.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {inbox({})}
        </div>
      )}
    </div>
  );
}
