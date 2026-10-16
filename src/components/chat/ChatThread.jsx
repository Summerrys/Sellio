import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, SendHorizontal, Loader2, X, RotateCcw, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import PhotoPickerControl from '@/components/ui-custom/PhotoPickerControl';
import { useBackToClose } from '@/lib/useBackToClose';
import { rememberReturnPath } from '@/lib/authNavigation';
import {
  chatThread, chatSend, chatMarkRead, chatErrorMessage, chatPhotoUrls, exploreItem,
  uploadChatPhoto, useChatLive, useChatUser,
} from '@/lib/chat';
import {
  BRAND_COLOR, BRAND_GRADIENT, BOTTOM_INSET, ShopAvatar, ItemImage, formatPrice, listingUrl, storeUrl,
} from '@/components/explore/shared';

// One chat about a listing, for its buyer or for the shop.
// variant 'page': full screen (Explore, phones). 'pane': fills its box (workspace).
// With no conversationId and a productId, it's the buyer's first message: the chat
// starts when it's sent (onCreated gets the new chat's id).

const QUICK_REPLIES = ['Is this still available?', 'Can I collect it today?', 'Do you deliver?'];
const POLL_MS = 5000;

const byId = (a, b) => a.id - b.id;
function mergeById(list, incoming) {
  const map = new Map(list.map((m) => [m.id, m]));
  incoming.forEach((m) => map.set(m.id, m));
  return [...map.values()].sort(byId);
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}
const clock = (iso) => new Date(iso).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' });

function headFromItem(data) {
  return {
    id: null,
    my_role: 'buyer',
    tenant_id: data.shop.id,
    shop_name: data.shop.name,
    shop_slug: data.shop.slug,
    shop_logo_url: data.shop.logo_url,
    product_id: data.product.id,
    product_name: data.product.name,
    product_image_url: data.product.images?.[0] || null,
    price: data.product.price,
    compare_at_price: data.product.compare_at_price,
    currency: data.shop.currency,
    listing_available: data.visible !== false,
    sold_out: data.product.sold_out,
    other_read_at: null,
  };
}

function ImageViewer({ src, onClose }) {
  useBackToClose(true, onClose);
  return (
    <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-[70] bg-black flex flex-col" data-pull-refresh-block>
      <div className="flex justify-end px-3" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(56px + env(safe-area-inset-top, 0px))' }}>
        <button type="button" onClick={onClose} aria-label="Close photo" autoFocus className="w-10 h-10 mt-2 rounded-full flex items-center justify-center text-white hover:bg-white/10">
          <X className="w-6 h-6" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-2 min-h-0">
        <img src={src} alt="" className="max-w-full max-h-full object-contain" />
      </div>
      <div style={{ height: BOTTOM_INSET }} />
    </div>
  );
}

function PhotoBubble({ src, onOpen }) {
  const [loaded, setLoaded] = useState(false);
  if (!src) return <div className="w-48 h-48 rounded-2xl bg-slate-200 animate-pulse" aria-label="Loading photo" />;
  return (
    <button type="button" onClick={() => onOpen(src)} aria-label="Open photo" className="block rounded-2xl overflow-hidden bg-slate-200">
      <img
        src={src}
        alt="Photo"
        onLoad={() => setLoaded(true)}
        className={`block max-w-[min(240px,65vw)] max-h-[320px] object-cover ${loaded ? '' : 'min-w-[12rem] min-h-[12rem]'}`}
      />
    </button>
  );
}

export default function ChatThread({ conversationId = null, productId = null, variant = 'page', onBack, onCreated }) {
  const queryClient = useQueryClient();
  const { loading: userLoading, user } = useChatUser();
  const [status, setStatus] = useState('loading'); // loading | ready | missing | own | error | signed_out
  const [head, setHead] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState([]);
  const [draft, setDraft] = useState('');
  const [photos, setPhotos] = useState({});
  const [viewing, setViewing] = useState(null);
  const scroller = useRef(null);
  const input = useRef(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const fetching = useRef(false);
  const stickToBottom = useRef(true);
  const keepOffset = useRef(null);
  const isPage = variant === 'page';

  const refreshLists = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['chatUnread'] }, { cancelRefetch: false });
    queryClient.invalidateQueries({ queryKey: ['chatList'] }, { cancelRefetch: false });
  }, [queryClient]);

  const markRead = useCallback(() => {
    if (!conversationId || document.visibilityState !== 'visible') return;
    chatMarkRead(conversationId).then(refreshLists).catch(() => {});
  }, [conversationId, refreshLists]);

  // First load.
  useEffect(() => {
    if (userLoading) return undefined;
    if (!user) { setStatus('signed_out'); return undefined; }
    let alive = true;
    setStatus('loading');
    (async () => {
      if (conversationId) {
        const res = await chatThread(conversationId);
        if (!alive) return;
        setHead(res.conversation);
        setMessages(res.messages || []);
        setHasMore(!!res.has_more);
        stickToBottom.current = true;
        setStatus('ready');
        markRead();
      } else if (productId) {
        const data = await exploreItem(productId);
        if (!alive) return;
        if (!data) { setStatus('missing'); return; }
        if (data.viewer?.conversation_id) { onCreated?.(data.viewer.conversation_id); return; }
        if (data.viewer?.is_own) { setStatus('own'); return; }
        setHead(headFromItem(data));
        setMessages([]);
        setStatus('ready');
      } else {
        setStatus('missing');
      }
    })().catch((err) => {
      if (!alive) return;
      console.warn('Chat failed to load:', err);
      setStatus(err?.hint === 'not_found' ? 'missing' : 'error');
    });
    return () => { alive = false; };
  }, [conversationId, productId, user, userLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // New messages: live, with polling as a fallback.
  const fetchNewer = useCallback(async () => {
    if (!conversationId || fetching.current || status !== 'ready') return;
    fetching.current = true;
    try {
      let more = true;
      while (more) {
        const lastId = messagesRef.current.length ? messagesRef.current[messagesRef.current.length - 1].id : 0;
        const res = await chatThread(conversationId, { afterId: lastId });
        setHead(res.conversation);
        const incoming = res.messages || [];
        if (incoming.length) {
          const el = scroller.current;
          stickToBottom.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 160;
          messagesRef.current = mergeById(messagesRef.current, incoming);
          setMessages(messagesRef.current);
          if (incoming.some((m) => !m.from_me)) markRead();
        }
        more = !!res.has_more && incoming.length > 0;
      }
    } catch (err) {
      console.warn('Chat refresh failed:', err);
    } finally {
      fetching.current = false;
    }
  }, [conversationId, status, markRead]);

  useChatLive(!!conversationId && status === 'ready', (payload) => {
    if (payload?.new?.id === conversationId) fetchNewer();
  });

  useEffect(() => {
    if (!conversationId || status !== 'ready') return undefined;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') fetchNewer(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') { fetchNewer(); markRead(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [conversationId, status, fetchNewer, markRead]);

  // Photo links for messages that have photos.
  useEffect(() => {
    const paths = messages.map((m) => m.image_path).filter((p) => p && !photos[p]);
    if (!paths.length) return;
    let alive = true;
    chatPhotoUrls(paths).then((urls) => {
      if (alive) setPhotos((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(urls).filter(([, u]) => u)) }));
    }).catch(() => {});
    return () => { alive = false; };
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scrolling: stay at the newest message; keep the place when older ones load.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepOffset.current != null) {
      el.scrollTop = el.scrollHeight - keepOffset.current;
      keepOffset.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, pending, status]);

  const loadOlder = async () => {
    if (!conversationId || loadingOlder || !messages.length) return;
    setLoadingOlder(true);
    try {
      const res = await chatThread(conversationId, { beforeId: messages[0].id });
      const el = scroller.current;
      keepOffset.current = el ? el.scrollHeight - el.scrollTop : null;
      stickToBottom.current = false;
      messagesRef.current = mergeById(messagesRef.current, res.messages || []);
      setMessages(messagesRef.current);
      setHasMore(!!res.has_more);
    } catch {
      toast.error("Couldn't load earlier messages.");
    } finally {
      setLoadingOlder(false);
    }
  };

  const deliver = async (item) => {
    setPending((list) => list.map((p) => (p.tempId === item.tempId ? { ...p, status: 'sending' } : p)));
    try {
      let imagePath = null;
      if (item.file) imagePath = await uploadChatPhoto(item.file, user.id);
      const res = await chatSend({
        conversationId,
        productId: conversationId ? null : productId,
        body: item.body,
        imagePath,
      });
      if (imagePath && item.localUrl) setPhotos((prev) => ({ ...prev, [imagePath]: item.localUrl }));
      stickToBottom.current = true;
      messagesRef.current = mergeById(messagesRef.current, [res.message]);
      setMessages(messagesRef.current);
      setPending((list) => list.filter((p) => p.tempId !== item.tempId));
      refreshLists();
      if (!conversationId && res.conversation_id) onCreated?.(res.conversation_id);
    } catch (err) {
      const message = chatErrorMessage(err);
      setPending((list) => list.map((p) => (p.tempId === item.tempId ? { ...p, status: 'failed', error: message } : p)));
      toast.error(message);
    }
  };

  const queue = (body, file = null) => {
    const text = (body || '').trim();
    if (!text && !file) return;
    if (text.length > 2000) { toast.error('Messages can be up to 2,000 characters.'); return; }
    const item = {
      tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      body: text || null,
      file,
      localUrl: file ? URL.createObjectURL(file) : null,
      status: 'sending',
    };
    stickToBottom.current = true;
    setPending((list) => [...list, item]);
    if (text) setDraft('');
    deliver(item);
  };

  const fineMouse = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches, []);
  const onKeyDown = (event) => {
    if (fineMouse && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      queue(draft);
    }
  };

  // Grow the box with the text, up to about five lines.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [draft]);

  const isBuyer = head?.my_role === 'buyer';
  const title = head ? (isBuyer ? head.shop_name : head.buyer_name) : '';
  const lastMine = [...messages].reverse().find((m) => m.from_me);
  const seen = !!(lastMine && head?.other_read_at && new Date(head.other_read_at) >= new Date(lastMine.created_at));

  const shell = (children) => (
    <div
      className={isPage ? 'h-screen flex flex-col bg-slate-50' : 'h-full flex flex-col bg-slate-50 min-h-0'}
      style={isPage ? { height: '100dvh' } : undefined}
      data-pull-refresh-block
    >
      {children}
    </div>
  );

  const header = (
    <header className="bg-white border-b border-slate-100 flex-shrink-0" style={isPage ? { paddingTop: 'env(safe-area-inset-top, 0px)' } : undefined}>
      <div className="h-14 px-2 flex items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back" className="w-10 h-10 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        {head && (
          isBuyer
            ? (
              <Link to={storeUrl(head.shop_slug)} className="flex items-center gap-2.5 min-w-0 flex-1">
                <ShopAvatar name={head.shop_name} logo={head.shop_logo_url} size={36} />
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold text-slate-900 truncate">{title}</span>
                  <span className="block text-xs text-slate-500">Seller</span>
                </span>
              </Link>
            ) : (
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <ShopAvatar name={head.buyer_name} logo={null} size={36} />
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold text-slate-900 truncate">{title}</span>
                  <span className="block text-xs text-slate-500">Buyer · {head.shop_name}</span>
                </span>
              </div>
            )
        )}
      </div>
    </header>
  );

  if (status === 'signed_out') {
    return shell(
      <>
        {header}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <MessageCircle className="w-10 h-10 text-slate-300" />
          <p className="mt-3 text-base font-semibold text-slate-900">Log in to chat</p>
          <p className="mt-1 text-sm text-slate-500">Message sellers about their listings.</p>
          <Link
            to="/Auth"
            onClick={() => rememberReturnPath(`${window.location.pathname}${window.location.search}`)}
            className="mt-4 h-10 px-5 rounded-full text-sm font-semibold text-white inline-flex items-center"
            style={{ background: BRAND_GRADIENT }}
          >
            Log in
          </Link>
        </div>
      </>,
    );
  }

  if (status === 'loading') {
    return shell(
      <>
        {header}
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      </>,
    );
  }

  if (status !== 'ready') {
    const text = {
      missing: ["This chat isn't available", 'The listing may have been removed.'],
      own: ['This is your listing', 'Buyers will message you here about it.'],
      error: ["We couldn't load this chat", 'Check your connection and try again.'],
    }[status];
    return shell(
      <>
        {header}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <p className="text-base font-semibold text-slate-900">{text[0]}</p>
          <p className="mt-1 text-sm text-slate-500">{text[1]}</p>
          {status === 'error' && (
            <button type="button" onClick={() => window.location.reload()} className="mt-4 h-10 px-4 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700">Try again</button>
          )}
        </div>
      </>,
    );
  }

  const rows = [];
  let lastDay = null;
  messages.forEach((m, i) => {
    const day = new Date(m.created_at).toDateString();
    if (day !== lastDay) {
      rows.push(<div key={`d-${m.id}`} className="text-center my-3"><span className="text-[11px] font-semibold text-slate-500 bg-slate-200/70 rounded-full px-2.5 py-1">{dayLabel(m.created_at)}</span></div>);
      lastDay = day;
    }
    const next = messages[i + 1];
    const endOfRun = !next || next.from_me !== m.from_me
      || new Date(next.created_at) - new Date(m.created_at) > 5 * 60 * 1000
      || new Date(next.created_at).toDateString() !== day;
    const mine = m.from_me;
    rows.push(
      <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${endOfRun ? 'mb-2.5' : 'mb-1'}`}>
        {m.image_path && (
          <div className={m.body ? 'mb-1' : ''}><PhotoBubble src={photos[m.image_path]} onOpen={setViewing} /></div>
        )}
        {m.body && (
          <div
            className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-[15px] leading-snug whitespace-pre-wrap break-words ${mine ? 'text-white rounded-br-md' : 'bg-white text-slate-900 border border-slate-100 rounded-bl-md'}`}
            style={mine ? { background: BRAND_GRADIENT } : undefined}
          >
            {m.body}
          </div>
        )}
        {endOfRun && (
          <span className="mt-1 px-1 text-[11px] text-slate-400">
            {clock(m.created_at)}{mine && m.id === lastMine?.id && seen ? ' · Seen' : ''}
          </span>
        )}
      </div>,
    );
  });

  const showQuickReplies = isBuyer && !messages.length && !pending.length && !draft;

  return shell(
    <>
      {header}

      {/* The listing this chat is about. */}
      <div className="bg-white border-b border-slate-100 px-3 py-2 flex items-center gap-3 flex-shrink-0">
        {head.product_id && head.listing_available ? (
          <Link to={listingUrl(head.product_id)} className="flex-shrink-0">
            <ItemImage src={head.product_image_url} name={head.product_name} className="w-11 h-11 text-base" rounded="rounded-lg" />
          </Link>
        ) : (
          <ItemImage src={head.product_image_url} name={head.product_name} className="w-11 h-11 text-base flex-shrink-0" rounded="rounded-lg" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{head.product_name}</p>
          <p className="text-sm">
            {head.listing_available ? (
              <>
                <span className="font-bold text-slate-900">{formatPrice(head.price, head.currency)}</span>
                {head.sold_out && <span className="ml-2 text-xs font-semibold text-red-600">Sold out</span>}
              </>
            ) : <span className="text-xs text-slate-500">No longer available</span>}
          </p>
        </div>
        {head.listing_available && head.product_id && (
          isBuyer && !head.sold_out ? (
            <Link
              to={`${storeUrl(head.shop_slug)}?item=${encodeURIComponent(head.product_id)}`}
              className="h-9 px-4 rounded-full text-sm font-semibold text-white inline-flex items-center flex-shrink-0"
              style={{ background: BRAND_GRADIENT }}
            >
              Buy
            </Link>
          ) : (
            <Link to={listingUrl(head.product_id)} className="h-9 px-3 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center flex-shrink-0">
              View
            </Link>
          )
        )}
      </div>

      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pt-2 pb-3">
        {hasMore && (
          <div className="flex justify-center my-2">
            <button type="button" onClick={loadOlder} disabled={loadingOlder} className="h-8 px-3 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-600 inline-flex items-center gap-1.5 disabled:opacity-60">
              {loadingOlder && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Show earlier messages
            </button>
          </div>
        )}
        {!messages.length && !pending.length && (
          <div className="text-center text-sm text-slate-500 mt-10 px-6">
            {isBuyer ? `Ask ${head.shop_name} about this listing.` : 'No messages yet.'}
          </div>
        )}
        {rows}
        {pending.map((p) => (
          <div key={p.tempId} className="flex flex-col items-end mb-2.5">
            {p.localUrl && (
              <div className={`relative rounded-2xl overflow-hidden ${p.body ? 'mb-1' : ''}`}>
                <img src={p.localUrl} alt="" className={`block max-w-[min(240px,65vw)] max-h-[320px] object-cover ${p.status === 'sending' ? 'opacity-60' : ''}`} />
                {p.status === 'sending' && <Loader2 className="absolute inset-0 m-auto w-6 h-6 animate-spin text-white" />}
              </div>
            )}
            {p.body && (
              <div className={`max-w-[80%] px-3.5 py-2 rounded-2xl rounded-br-md text-[15px] leading-snug whitespace-pre-wrap break-words text-white ${p.status === 'sending' ? 'opacity-70' : ''}`} style={{ background: BRAND_GRADIENT }}>
                {p.body}
              </div>
            )}
            {p.status === 'sending' ? (
              <span className="mt-1 px-1 text-[11px] text-slate-400">Sending…</span>
            ) : (
              <span className="mt-1 px-1 text-[11px] text-red-600 inline-flex items-center gap-2">
                Not sent
                <button type="button" onClick={() => deliver(p)} className="font-semibold inline-flex items-center gap-1 underline underline-offset-2">
                  <RotateCcw className="w-3 h-3" /> Retry
                </button>
                <button type="button" onClick={() => setPending((list) => list.filter((x) => x.tempId !== p.tempId))} className="font-semibold underline underline-offset-2">
                  Remove
                </button>
              </span>
            )}
          </div>
        ))}
      </div>

      {showQuickReplies && (
        <div className="flex gap-2 overflow-x-auto px-3 pb-2 flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
          {QUICK_REPLIES.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => { setDraft(text); input.current?.focus(); }}
              className="h-9 px-3.5 rounded-full border bg-white text-sm font-medium whitespace-nowrap"
              style={{ borderColor: BRAND_COLOR, color: BRAND_COLOR }}
            >
              {text}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); queue(draft); }}
        className="bg-white border-t border-slate-200 px-2 pt-2 flex items-end gap-1.5 flex-shrink-0"
        style={{ paddingBottom: isPage ? `calc(8px + ${BOTTOM_INSET})` : '8px' }}
      >
        <PhotoPickerControl
          label="Send a photo"
          onFile={(file) => queue('', file)}
          className="w-11 h-11 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 flex-shrink-0"
        >
          <ImagePlus className="w-6 h-6" />
        </PhotoPickerControl>
        <textarea
          ref={input}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={2000}
          placeholder="Write a message"
          aria-label="Message"
          enterKeyHint={fineMouse ? 'send' : 'enter'}
          className="flex-1 min-w-0 resize-none rounded-2xl bg-slate-100 px-4 py-[11px] text-[15px] leading-[22px] text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!draft.trim()}
          className="w-11 h-11 rounded-full flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40 active:scale-95 transition-transform"
          style={{ background: BRAND_GRADIENT }}
        >
          <SendHorizontal className="w-5 h-5" />
        </button>
      </form>

      {viewing && <ImageViewer src={viewing} onClose={() => setViewing(null)} />}
    </>,
  );
}
