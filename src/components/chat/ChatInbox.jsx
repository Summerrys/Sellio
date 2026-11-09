import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, RefreshCw, ImageIcon, Archive, ArchiveRestore, Trash2, MoreHorizontal, Info } from 'lucide-react';
import { toast } from 'sonner';
import { ONLINE_GREEN, archivedCount, chatArchive, chatDelete, chatErrorMessage, chatList, useChatUnread } from '@/lib/chat';
import { useBackToClose } from '@/lib/useBackToClose';
import { BRAND_COLOR, ShopAvatar, ItemImage } from '@/components/explore/shared';
import BottomSheet from '@/components/explore/BottomSheet';
import LoadingShapes from '@/components/ui-custom/LoadingShapes';

// A list of chats. box: 'all' | 'buying' | 'selling'; tenantId narrows selling chats to one
// shop (the workspace); archived: the person's Archived chats. Each row links to hrefFor(chat).
//
// Each person archives or deletes a chat for themselves (Alvin, 9 Nov 2026): swipe a row
// left, press and hold it, or (with a mouse) its ⋯. A new message leaves an archived chat in
// Archived. A green dot on the picture: the other side has Sellio open now.

const ACTION_WIDTH = 74;   // px per action behind a row
const HOLD_MS = 500;       // press and hold
const SLOP = 8;            // px of movement before it's a swipe or a scroll, not a press

async function loadChats(box, tenantId, archived) {
  if (box === 'all') {
    const [buying, selling] = await Promise.all([chatList('buying', null, { archived }), chatList('selling', null, { archived })]);
    return [...(buying || []), ...(selling || [])]
      .sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)));
  }
  return (await chatList(box, tenantId, { archived })) || [];
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

export function useChatList(box, tenantId = null, enabled = true, archived = false) {
  return useQuery({
    queryKey: ['chatList', box, tenantId, !!archived],
    queryFn: () => loadChats(box, tenantId, !!archived),
    enabled,
    refetchInterval: 20000,
    staleTime: 3000,
  });
}

// A mouse or trackpad (the ⋯ on each row) rather than a finger (swipe, press and hold).
function useFinePointer() {
  return useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches, []);
}

const whoFor = (chat) => (chat.box === 'buying' ? chat.shop_name : chat.buyer_name);

function ChatAvatar({ chat, size }) {
  const buying = chat.box === 'buying';
  return (
    <span className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {buying
        ? <ShopAvatar name={chat.shop_name} logo={chat.shop_logo_url} size={size} />
        : <ShopAvatar name={chat.buyer_name} logo={null} size={size} />}
      {chat.online && (
        <span
          aria-hidden="true"
          data-testid="chat-online-dot"
          className="absolute right-0 bottom-0 rounded-full border-2 border-white"
          style={{ width: Math.round(size / 4), height: Math.round(size / 4), background: ONLINE_GREEN }}
        />
      )}
    </span>
  );
}

export function ChatRow({ chat, href, selected = false, showBox = false, onOptions = null, finePointer = false }) {
  const buying = chat.box === 'buying';
  const who = whoFor(chat);
  const unread = Number(chat.unread) || 0;
  const preview = chat.last_message_preview === 'Photo' ? null : chat.last_message_preview;
  return (
    <div className="relative flex items-center bg-white">
      <Link
        to={href}
        draggable={false}
        className={`flex-1 min-w-0 flex items-center gap-3 px-4 py-3 transition-colors ${selected ? 'bg-slate-100' : 'hover:bg-slate-50 active:bg-slate-100'}`}
        aria-current={selected ? 'true' : undefined}
      >
        <ChatAvatar chat={chat} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className={`flex-1 min-w-0 truncate text-[15px] ${unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>
              {who}
              {chat.online && <span className="sr-only"> (online)</span>}
            </p>
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
      {onOptions && (finePointer ? (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOptions(); }}
          aria-label={`Options for your chat with ${who}`}
          data-testid="chat-options"
          className="mr-2 w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 flex-shrink-0"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      ) : (
        // Phones: swipe or press and hold; a screen reader gets this button instead.
        <button type="button" onClick={onOptions} className="sr-only" data-testid="chat-options">
          Options for your chat with {who}
        </button>
      ))}
    </div>
  );
}

// A row that slides left to show its actions (one row open at a time), and opens the options
// on a long press or a right click.
function SwipeRow({ open, onOpenChange, actions, onHold, children }) {
  const width = actions.reduce((sum, action) => sum + (action.width || ACTION_WIDTH), 0);
  const [dragX, setDragX] = useState(null); // where the row is while a finger moves it
  const gesture = useRef(null);
  const swallowClick = useRef(false);

  useEffect(() => () => { if (gesture.current?.hold) clearTimeout(gesture.current.hold); }, []);

  const endHold = (g) => { if (g?.hold) { clearTimeout(g.hold); g.hold = null; } };

  const onPointerDown = (e) => {
    swallowClick.current = false;
    if (e.pointerType === 'mouse' || (e.button ?? 0) !== 0) return;
    const g = { id: e.pointerId, x: e.clientX, y: e.clientY, start: open ? -width : 0, offset: null, sideways: null, hold: null, el: e.currentTarget };
    g.hold = setTimeout(() => {
      g.hold = null;
      if (gesture.current !== g || g.sideways) return;
      gesture.current = null;
      swallowClick.current = true; // the press ends without opening the chat
      onHold();
    }, HOLD_MS);
    gesture.current = g;
  };

  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.sideways) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      endHold(g);
      if (Math.abs(dx) <= Math.abs(dy)) { gesture.current = null; return; } // a scroll
      g.sideways = true;
      try { g.el.setPointerCapture?.(e.pointerId); } catch { /* not supported */ }
    }
    g.offset = Math.max(-width - 24, Math.min(0, g.start + dx));
    setDragX(g.offset);
  };

  const finish = (e, cancelled) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    endHold(g);
    gesture.current = null;
    if (!g.sideways) return; // a tap: the link opens the chat
    swallowClick.current = true;
    const offset = g.offset ?? g.start;
    setDragX(null);
    onOpenChange(cancelled ? g.start !== 0 : offset < -width / 2);
  };

  const onClickCapture = (e) => {
    if (swallowClick.current) {
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    } else if (open) {
      e.preventDefault(); // a tap on an open row closes it
      e.stopPropagation();
      onOpenChange(false);
    }
  };

  const onContextMenu = (e) => {
    e.preventDefault(); // no link menu on a long press
    const g = gesture.current;
    if (g && !g.sideways) { // the phone saw a long press before the timer did
      endHold(g);
      gesture.current = null;
      swallowClick.current = true;
      onHold();
    } else if (!g && !swallowClick.current) {
      onHold(); // a right click (after a long press the options are open already)
    }
  };

  const x = dragX ?? (open ? -width : 0);
  return (
    <div className="relative overflow-hidden" data-chat-row>
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={!open}>
        {actions.map(({ key, label, icon: Icon, color, width: w, onSelect }) => (
          <button
            key={key}
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={onSelect}
            data-testid={`chat-swipe-${key}`}
            className="h-full flex flex-col items-center justify-center gap-1 text-white text-[11.5px] font-bold"
            style={{ width: w || ACTION_WIDTH, background: color }}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </div>
      <div
        className="relative"
        style={{
          transform: `translateX(${x}px)`,
          transition: dragX === null ? 'transform 180ms ease' : 'none',
          touchAction: 'pan-y',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onClickCapture={onClickCapture}
        onContextMenu={onContextMenu}
      >
        {children}
      </div>
    </div>
  );
}

function SheetOption({ icon: Icon, label, hint = '', danger = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full h-[52px] flex items-center gap-3 px-1 border-b border-slate-100 text-[15px] font-semibold text-left ${danger ? 'text-rose-600' : 'text-slate-800'}`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-xs font-medium text-slate-400">{hint}</span>}
    </button>
  );
}

// Delete asks first, and says exactly what goes (it can't be undone).
function DeleteChatDialog({ chat, onCancel, onConfirm }) {
  const open = !!chat;
  const cancelRef = useRef(null);
  useBackToClose(open, onCancel);
  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!chat) return null;
  const who = whoFor(chat);
  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-chat-title"
      aria-describedby="delete-chat-text"
      data-pull-refresh-block
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
    >
      <div aria-hidden="true" onClick={onCancel} className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.45)' }} />
      <div className="relative w-full max-w-sm bg-white rounded-[20px] px-5 pt-5 pb-4 text-center shadow-2xl">
        <span className="mx-auto w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
          <Trash2 className="w-5 h-5" />
        </span>
        <h2 id="delete-chat-title" className="mt-3 text-[17px] font-extrabold text-slate-900">Delete this chat?</h2>
        <p id="delete-chat-text" className="mt-2 text-[13.5px] leading-relaxed text-slate-500">
          Your chat with <b className="text-slate-900">{who}</b>
          {chat.product_name ? <> about <b className="text-slate-900">{chat.product_name}</b></> : null}
          , with its messages and photos, goes from your chats. {who} keeps their copy. If either of you writes again, it starts fresh.
        </p>
        <button type="button" onClick={() => onConfirm(chat)} data-testid="delete-chat-confirm" className="mt-4 w-full h-11 rounded-xl bg-rose-600 text-white text-sm font-bold">
          Delete chat
        </button>
        <button type="button" ref={cancelRef} onClick={onCancel} className="mt-2 w-full h-11 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800">
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}

function ArchivedEntry({ href, count }) {
  return (
    <Link to={href} data-testid="archived-chats-row" className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-100">
      <span className="w-12 h-12 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
        <Archive className="w-5 h-5" />
      </span>
      <span className="flex-1 text-[15px] font-semibold text-slate-800">Archived</span>
      <span className={`text-sm ${count.unread ? 'font-bold' : 'font-semibold text-slate-500'}`} style={count.unread ? { color: BRAND_COLOR } : undefined}>
        {count.chats}
        {count.unread > 0 && <span className="sr-only"> ({count.unread} with new messages)</span>}
      </span>
    </Link>
  );
}

function ArchivedNote({ finePointer }) {
  return (
    <div className="mx-3 mt-3 mb-1 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs leading-relaxed flex gap-2" data-testid="archived-note">
      <Info className="w-4 h-4 flex-shrink-0 mt-px" />
      <span>
        New messages leave a chat here.{' '}
        {finePointer ? 'Use the ⋯ on a chat to move it back to Chats.' : 'Swipe a chat left, or press and hold it, to move it back to Chats.'}
      </span>
    </div>
  );
}

export default function ChatInbox({
  box, tenantId = null, hrefFor, selectedId = null, emptyText, archived = false, archivedHref = null, onRemoved = null,
}) {
  const queryClient = useQueryClient();
  const { data, status, refetch, isFetching } = useChatList(box, tenantId, true, archived);
  const unread = useChatUnread(!archived && !!archivedHref);
  const archivedTotals = archivedCount(unread, box, tenantId);
  const finePointer = useFinePointer();
  const [openId, setOpenId] = useState(null);
  const [menuChat, setMenuChat] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const listKey = ['chatList', box, tenantId, !!archived];

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['chatList'] }, { cancelRefetch: false });
    queryClient.invalidateQueries({ queryKey: ['chatUnread'] }, { cancelRefetch: false });
  }, [queryClient]);
  const takeOut = (id) => queryClient.setQueryData(listKey, (old) => (Array.isArray(old) ? old.filter((c) => c.id !== id) : old));

  const move = async (chat, toArchived, { undo = false } = {}) => {
    setOpenId(null);
    setMenuChat(null);
    if (!undo) takeOut(chat.id);
    try {
      await chatArchive(chat.id, toArchived);
      if (!undo) {
        toast(toArchived ? 'Chat archived' : 'Moved back to Chats', {
          action: { label: 'Undo', onClick: () => move(chat, !toArchived, { undo: true }) },
        });
      }
    } catch (err) {
      toast.error(chatErrorMessage(err, toArchived
        ? "Couldn't archive that chat. Check your connection and try again."
        : "Couldn't move that chat back. Check your connection and try again."));
    } finally {
      refresh();
    }
  };

  const remove = async (chat) => {
    setDeleting(null);
    setOpenId(null);
    takeOut(chat.id);
    try {
      await chatDelete(chat.id);
      onRemoved?.(chat.id);
      toast('Chat deleted');
    } catch (err) {
      toast.error(chatErrorMessage(err, "Couldn't delete that chat. Check your connection and try again."));
    } finally {
      refresh();
    }
  };

  const closeMenu = useCallback(() => setMenuChat(null), []);
  const cancelDelete = useCallback(() => setDeleting(null), []);
  const askDelete = (chat) => { setMenuChat(null); setOpenId(null); setDeleting(chat); };

  const showArchivedEntry = !archived && !!archivedHref && archivedTotals.chats > 0;
  const overlays = (
    <>
      <BottomSheet open={!!menuChat} onClose={closeMenu} labelledBy="chat-options-title">
        {menuChat && (
          <div data-testid="chat-options-sheet">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <ChatAvatar chat={menuChat} size={38} />
              <div className="min-w-0">
                <p id="chat-options-title" className="text-sm font-bold text-slate-900 truncate">{whoFor(menuChat)}</p>
                <p className="text-xs text-slate-500 truncate">{menuChat.box === 'buying' ? 'Buying' : 'Selling'} · {menuChat.product_name}</p>
              </div>
            </div>
            {archived
              ? <SheetOption icon={ArchiveRestore} label="Move back to Chats" onClick={() => move(menuChat, false)} />
              : <SheetOption icon={Archive} label="Archive chat" hint="Moves to Archived" onClick={() => move(menuChat, true)} />}
            <SheetOption icon={Trash2} label="Delete chat" danger onClick={() => askDelete(menuChat)} />
            <button type="button" onClick={closeMenu} className="mt-3 w-full h-12 rounded-xl bg-slate-100 text-[15px] font-bold text-slate-700">
              Cancel
            </button>
          </div>
        )}
      </BottomSheet>
      <DeleteChatDialog chat={deleting} onCancel={cancelDelete} onConfirm={remove} />
    </>
  );

  if (status === 'pending') {
    return (
      <LoadingShapes label="Loading chats">
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-slate-200" />
              <div className="flex-1 space-y-2"><div className="h-3 w-1/2 rounded bg-slate-200" /><div className="h-3 w-3/4 rounded bg-slate-200" /></div>
              <div className="w-12 h-12 rounded-lg bg-slate-200" />
            </div>
          ))}
        </div>
      </LoadingShapes>
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
      <>
        {showArchivedEntry && <div className="border-b border-slate-100"><ArchivedEntry href={archivedHref} count={archivedTotals} /></div>}
        <div className="p-8 text-center">
          <span className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
            {archived ? <Archive className="w-6 h-6 text-slate-400" /> : <MessageCircle className="w-6 h-6 text-slate-400" />}
          </span>
          <p className="mt-3 text-sm text-slate-600">{emptyText}</p>
        </div>
        {overlays}
      </>
    );
  }

  return (
    <>
      {archived && <ArchivedNote finePointer={finePointer} />}
      <div className="divide-y divide-slate-100">
        {showArchivedEntry && <ArchivedEntry href={archivedHref} count={archivedTotals} />}
        {data.map((chat) => {
          const actions = archived
            ? [{ key: 'unarchive', label: 'Move back to Chats', icon: ArchiveRestore, color: '#475569', width: ACTION_WIDTH * 2, onSelect: () => move(chat, false) }]
            : [
              { key: 'archive', label: 'Archive', icon: Archive, color: '#64748b', onSelect: () => move(chat, true) },
              { key: 'delete', label: 'Delete', icon: Trash2, color: '#e11d48', onSelect: () => askDelete(chat) },
            ];
          return (
            <SwipeRow
              key={chat.id}
              open={openId === chat.id}
              onOpenChange={(open) => setOpenId(open ? chat.id : null)}
              actions={actions}
              onHold={() => { setOpenId(null); setMenuChat(chat); }}
            >
              <ChatRow
                chat={chat}
                href={hrefFor(chat)}
                selected={chat.id === selectedId}
                showBox={box === 'all'}
                finePointer={finePointer}
                onOptions={() => { setOpenId(null); setMenuChat(chat); }}
              />
            </SwipeRow>
          );
        })}
      </div>
      {overlays}
    </>
  );
}
