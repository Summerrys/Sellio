// Sellio chat: buyers message sellers about Explore listings.
// Everything goes through the chat_* database functions. Photos live in the private
// chat-images bucket (each sender's own folder) and show through short-lived links.
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { checkDrawn, UNREADABLE_PHOTO_MESSAGE } from '@/lib/imageShrink';

export const CHAT_PHOTO_BUCKET = 'chat-images';
export const ONLINE_GREEN = '#16a34a'; // online now: the dot on a chat, and "Online"
const NO_ARCHIVED = { chats: 0, unread: 0 };
const NO_UNREAD = { buying: 0, selling: 0, by_tenant: {}, archived: { buying: NO_ARCHIVED, selling: NO_ARCHIVED, by_tenant: {} } };

export async function getChatUser() {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user || null;
}

// The signed-in Supabase user ({ loading, user }), following sign-in and sign-out.
export function useChatUser() {
  const [state, setState] = useState({ loading: true, user: null });
  useEffect(() => {
    let alive = true;
    let subscription = null;
    (async () => {
      const supabase = await getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      setState({ loading: false, user: session?.user || null });
      subscription = supabase.auth.onAuthStateChange((_event, next) => {
        if (alive) setState({ loading: false, user: next?.user || null });
      }).data.subscription;
    })().catch(() => { if (alive) setState({ loading: false, user: null }); });
    return () => { alive = false; subscription?.unsubscribe(); };
  }, []);
  return state;
}

async function call(name, args) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export const exploreItem = (productId) => call('explore_item', { p_product_id: productId });
// archived: the person's Archived chats instead of their Chats.
export const chatList = (box, tenantId = null, { archived = false } = {}) =>
  call('chat_list', { p_box: box, p_tenant_id: tenantId, p_archived: !!archived });
export const chatThread = (conversationId, { afterId = null, beforeId = null, limit = 50 } = {}) =>
  call('chat_thread', { p_conversation_id: conversationId, p_after_id: afterId, p_before_id: beforeId, p_limit: limit });
export const chatMarkRead = (conversationId) => call('chat_mark_read', { p_conversation_id: conversationId });
export const chatUnread = () => call('chat_unread', {});
export const chatSend = ({ conversationId = null, productId = null, body = null, imagePath = null }) =>
  call('chat_send', { p_conversation_id: conversationId, p_product_id: productId, p_body: body, p_image_path: imagePath });
// Archive and delete are each person's own (Alvin, 9 Nov 2026): a shop's other staff and the
// other side keep the chat as it is. A new message leaves an archived chat in Archived; a
// deleted chat comes back with only the messages written after the delete.
export const chatArchive = (conversationId, archived = true) =>
  call('chat_archive', { p_conversation_id: conversationId, p_archived: archived });
export const chatDelete = (conversationId) => call('chat_delete', { p_conversation_id: conversationId });
// Sellio open on this phone or computer: every minute while on screen, and once on leaving.
export const presencePing = (leaving = false) => call('presence_ping', { p_leaving: !!leaving });

// Under a chat's name: "Online", or when the other side was last on Sellio (always shown,
// Alvin 9 Nov 2026). '' when they've never been seen.
export function lastSeenText({ online = false, last_seen_at: lastSeenAt = null } = {}, now = new Date()) {
  if (online) return 'Online';
  if (!lastSeenAt) return '';
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return '';
  const minutes = Math.floor((now - seen) / 60000);
  if (minutes < 1) return 'Last seen just now';
  if (minutes < 60) return `Last seen ${minutes} min ago`;
  const time = seen.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  if (seen.toDateString() === now.toDateString()) return `Last seen today at ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (seen.toDateString() === yesterday.toDateString()) return `Last seen yesterday at ${time}`;
  return `Last seen ${seen.toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', ...(seen.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })}`;
}

// How many chats sit in Archived for a list (box 'all' | 'buying' | 'selling', or one shop's
// selling chats), and how many of those have something new: { chats, unread }.
export function archivedCount(unread, box, tenantId = null) {
  const archived = unread?.archived || {};
  const read = (entry) => ({ chats: Number(entry?.chats) || 0, unread: Number(entry?.unread) || 0 });
  if (tenantId) return read(archived.by_tenant?.[tenantId]);
  if (box === 'buying' || box === 'selling') return read(archived[box]);
  const buying = read(archived.buying);
  const selling = read(archived.selling);
  return { chats: buying.chats + selling.chats, unread: buying.unread + selling.unread };
}

// The database's own wording for problems people can act on; a plain fallback otherwise.
const FRIENDLY = new Set(['sign_in', 'empty', 'too_long', 'bad_image', 'not_found', 'listing_unavailable', 'own_listing', 'rate_limited', 'no_chat']);
export function chatErrorMessage(error, fallback = "Couldn't send that. Check your connection and try again.") {
  if (error?.friendly) return error.message;
  if (FRIENDLY.has(error?.hint) && error?.message) return error.message;
  return fallback;
}

// ── Live updates ──
// One shared subscription: any change to a chat this person can see (RLS decides)
// tells every listener to refetch. Polling covers a dropped connection.
const listeners = new Set();
let channel = null;
let starting = null;

async function startLive() {
  if (channel || starting) return starting;
  starting = (async () => {
    const supabase = await getSupabase();
    if (!listeners.size) return;
    channel = supabase
      .channel(`chat-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, (payload) => {
        listeners.forEach((fn) => { try { fn(payload); } catch { /* listener error */ } });
      })
      .subscribe();
  })().finally(() => { starting = null; });
  return starting;
}

async function stopLive() {
  if (listeners.size || !channel) return;
  const current = channel;
  channel = null;
  try { (await getSupabase()).removeChannel(current); } catch { /* already closed */ }
}

export function useChatLive(enabled, onChange) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    if (!enabled) return undefined;
    const fn = (payload) => ref.current?.(payload);
    listeners.add(fn);
    startLive().catch(() => {});
    return () => { listeners.delete(fn); stopLive(); };
  }, [enabled]);
}

// Chats with something new: { buying, selling, by_tenant: { [tenantId]: n } }.
export function useChatUnread(enabled = true) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['chatUnread'],
    queryFn: async () => ((await getChatUser()) ? chatUnread() : NO_UNREAD),
    enabled,
    refetchInterval: 30000,
    staleTime: 5000,
  });
  useChatLive(enabled, () => {
    queryClient.invalidateQueries({ queryKey: ['chatUnread'] }, { cancelRefetch: false });
    queryClient.invalidateQueries({ queryKey: ['chatList'] }, { cancelRefetch: false });
  });
  return enabled && data ? data : NO_UNREAD;
}

// Sellio open: tells the people this person chats with that they're online (presence_ping),
// while the page is on screen and someone is signed in. Every minute; once more on leaving.
export function usePresencePing() {
  const { user } = useChatUser();
  const userId = user?.id || null;
  useEffect(() => {
    if (!userId) return undefined;
    let timer = null;
    const ping = (leaving) => { presencePing(leaving).catch(() => { /* offline: next time */ }); };
    const start = () => {
      if (timer) return;
      ping(false);
      timer = setInterval(() => ping(false), 60 * 1000);
    };
    const stop = (leaving) => {
      if (timer) { clearInterval(timer); timer = null; }
      if (leaving) ping(true);
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop(true));
    const onPageHide = () => stop(true);
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      stop(false);
    };
  }, [userId]);
}

// ── Photos ──
const MAX_SIDE = 1600;
const MAX_UPLOAD = 5 * 1024 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Smaller photos send faster: at most 1600px on the long side, WebP (or JPEG).
export async function prepareChatPhoto(file) {
  const friendly = (message) => Object.assign(new Error(message), { friendly: true });
  if (!file || !/^image\//.test(file.type || '')) throw friendly('Choose a photo (JPG, PNG or WebP).');
  let img;
  try { img = await loadImage(file); } catch { throw friendly("That photo couldn't be opened. Try another one."); }
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw friendly("That photo couldn't be prepared. Try again.");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  // A photo that didn't come through whole draws as nothing, and would send as a white
  // square (see imageShrink.js).
  const drawn = await checkDrawn(context, canvas.width, canvas.height, file);
  if (drawn === 'cut-off') throw friendly(UNREADABLE_PHOTO_MESSAGE);
  if (drawn === 'not-drawn') throw friendly("That photo couldn't be prepared. Try again.");
  context.globalCompositeOperation = 'destination-over'; // white behind see-through parts
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  let blob = await toBlob(canvas, 'image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.85);
  if (!blob) throw friendly("That photo couldn't be prepared. Try again.");
  if (blob.size > MAX_UPLOAD) throw friendly('That photo is too large to send.');
  return blob;
}

function randomName() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

// Uploads into the sender's own folder; returns the path chat_send expects.
export async function uploadChatPhoto(file, userId) {
  const blob = await prepareChatPhoto(file);
  const path = `${userId}/${randomName()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
  const supabase = await getSupabase();
  const { error } = await supabase.storage.from(CHAT_PHOTO_BUCKET).upload(path, blob, {
    contentType: blob.type, upsert: false, cacheControl: '31536000',
  });
  if (error) throw error;
  return path;
}

const signed = new Map(); // path → { url, until }

// Short-lived links to chat photos the signed-in person may see (storage rules decide).
export async function chatPhotoUrls(paths) {
  const now = Date.now();
  const wanted = [...new Set(paths.filter(Boolean))];
  const missing = wanted.filter((p) => !(signed.get(p)?.until > now + 5 * 60 * 1000));
  if (missing.length) {
    const supabase = await getSupabase();
    const { data, error } = await supabase.storage.from(CHAT_PHOTO_BUCKET).createSignedUrls(missing, 3600);
    if (!error) {
      (data || []).forEach((row) => {
        if (row?.signedUrl && !row.error) signed.set(row.path, { url: row.signedUrl, until: now + 3600 * 1000 });
      });
    }
  }
  return Object.fromEntries(wanted.map((p) => [p, signed.get(p)?.url || null]));
}
