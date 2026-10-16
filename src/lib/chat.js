// Sellio chat: buyers message sellers about Explore listings.
// Everything goes through the chat_* database functions. Photos live in the private
// chat-images bucket (each sender's own folder) and show through short-lived links.
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';

export const CHAT_PHOTO_BUCKET = 'chat-images';
const NO_UNREAD = { buying: 0, selling: 0, by_tenant: {} };

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
export const chatList = (box, tenantId = null) => call('chat_list', { p_box: box, p_tenant_id: tenantId });
export const chatThread = (conversationId, { afterId = null, beforeId = null, limit = 50 } = {}) =>
  call('chat_thread', { p_conversation_id: conversationId, p_after_id: afterId, p_before_id: beforeId, p_limit: limit });
export const chatMarkRead = (conversationId) => call('chat_mark_read', { p_conversation_id: conversationId });
export const chatUnread = () => call('chat_unread', {});
export const chatSend = ({ conversationId = null, productId = null, body = null, imagePath = null }) =>
  call('chat_send', { p_conversation_id: conversationId, p_product_id: productId, p_body: body, p_image_path: imagePath });

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
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
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
