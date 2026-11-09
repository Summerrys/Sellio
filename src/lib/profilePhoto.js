import { useEffect, useSyncExternalStore } from 'react';
import { getSupabase, SUPABASE_URL } from '@/lib/supabaseClient';
import { shrinkImage, LONG_CACHE } from '@/lib/imageShrink';

// A person's profile photo (Alvin, 10 Nov 2026): their Google photo by default, or one they chose,
// or none (the letter). Sellio's server says which (my_profile_photo) and changes it
// (set_profile_photo); chosen photos live in the public profile-photos bucket, in the person's
// own folder. Read once per account and shared by every avatar on screen (Me, the profile window,
// the side menu), so a change shows everywhere at once.

export const PROFILE_PHOTO_MAX_SIDE = 512; // shown at up to 84px
const BUCKET = 'profile-photos';
const USABLE = /^image\/(jpeg|png|webp)$/;
export const PHOTO_TYPE_MESSAGE = 'This photo can’t be used. Please choose a JPG, PNG or WebP photo.';

const answers = new Map(); // account (lower-case email) → my_profile_photo's answer
const asking = new Map(); // account → the request on its way
const listeners = new Set();
const tell = () => listeners.forEach((listener) => listener());
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const keyFor = (email) => String(email || '').trim().toLowerCase();

// The address to show for my_profile_photo's answer, or null for the letter.
export function profilePhotoUrl(answer) {
  if (!answer) return null;
  if (answer.source === 'upload' && answer.path) {
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${String(answer.path).split('/').map(encodeURIComponent).join('/')}`;
  }
  if (answer.source === 'google' && answer.google) return answer.google;
  return null;
}

export function rememberProfilePhoto(email, answer) {
  const key = keyFor(email);
  if (!key) return;
  answers.set(key, answer || null);
  tell();
}

export function forgetProfilePhotos() {
  answers.clear();
  asking.clear();
  tell();
}

export async function loadProfilePhoto(email, { fresh = false } = {}) {
  const key = keyFor(email);
  if (!key) return null;
  if (!fresh && answers.has(key)) return answers.get(key);
  if (!fresh && asking.has(key)) return asking.get(key);
  const request = (async () => {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.rpc('my_profile_photo');
      if (error) throw error;
      rememberProfilePhoto(key, data || null);
      return data || null;
    } finally {
      asking.delete(key);
    }
  })();
  asking.set(key, request);
  return request;
}

// { answer, url } for the signed-in account's email; url null shows the letter.
export function useProfilePhoto(email) {
  const key = keyFor(email);
  const answer = useSyncExternalStore(subscribe, () => (key ? answers.get(key) : undefined), () => undefined);
  useEffect(() => {
    if (key && !answers.has(key)) loadProfilePhoto(key).catch(() => {});
  }, [key]);
  return { answer: answer ?? null, url: profilePhotoUrl(answer) };
}

async function removeOld(supabase, path) {
  if (!path) return;
  try { await supabase.storage.from(BUCKET).remove([path]); } catch { /* an old file left behind is harmless */ }
}

// A photo from the phone: shrunk, put in the person's folder, then made their photo.
export async function uploadProfilePhoto(email, file) {
  const photo = await shrinkImage(file, { maxSide: PROFILE_PHOTO_MAX_SIDE });
  if (!USABLE.test(String(photo.type || '').toLowerCase())) throw new Error(PHOTO_TYPE_MESSAGE);
  const supabase = await getSupabase();
  const answer = answers.get(keyFor(email)) || await loadProfilePhoto(email, { fresh: true });
  const folder = answer?.folder;
  if (!folder) throw new Error('Please sign in again to change your photo.');
  const ext = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${folder}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, photo.blob, {
    contentType: photo.type, cacheControl: LONG_CACHE, upsert: false,
  });
  if (uploadError) throw new Error('Couldn’t upload the photo. Please try again.');
  const { data, error } = await supabase.rpc('set_profile_photo', { p_choice: 'upload', p_path: path });
  if (error) {
    await removeOld(supabase, path);
    throw error;
  }
  rememberProfilePhoto(email, data);
  await removeOld(supabase, data?.replaced);
  return data;
}

// 'google' (back to the Google photo) or 'none' (the letter).
export async function chooseProfilePhoto(email, choice) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('set_profile_photo', { p_choice: choice });
  if (error) throw error;
  rememberProfilePhoto(email, data);
  await removeOld(supabase, data?.replaced);
  return data;
}
