import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { appT, N_ } from '@/lib/appText';
import { explainError } from '@/lib/plainError';
import { functionErrorMessage } from '@/lib/aiAllowance';

// Sample photos from Pixabay (findProductImage v24; Alvin, 20 Nov 2026: "Let's go with using the
// pixabay", after Unsplash disabled Sellio's account). Pixabay's API rules: its addresses only show
// search results for a while (the 640 px one lasts 24 hours), so a photo the shop uses is copied
// into its own product photos first (keepSamplePhotos) and the product saves the copy; wherever
// results show, they say "Photos from Pixabay" (PhotosFrom). The photographer is still credited
// with the photo: products.image_credits keeps the credit by image URL, and the storefront and
// Explore show "Sample photo" and "Photo by … on Pixabay" with it. Products saved before this
// keep their Unsplash photos (shown from Unsplash, credited "on Unsplash").
export const UNSPLASH_HOME = 'https://unsplash.com/?utm_source=sellio&utm_medium=referral';
export const PIXABAY_HOME = 'https://pixabay.com/';
// The site a credit names, and its home page.
export const creditSite = (credit) => (credit?.source === 'unsplash'
  ? { name: 'Unsplash', href: UNSPLASH_HOME }
  : { name: 'Pixabay', href: PIXABAY_HOME });
export const SEARCH_FAILED = N_('Search failed. Please try again.');
const KEEP_AT_ONCE = 8;
const KEEP_FAILED = N_('Couldn’t save the sample photos. Please try again.');

// The credit for the photo at `url`, or null.
export const creditFor = (credits, url) => (url && credits && typeof credits === 'object' && !Array.isArray(credits) ? credits[url] || null : null);

// The credits of the photos still used (`urls`), or null when none is.
export function keepCredits(credits, urls) {
  const kept = {};
  for (const url of urls || []) {
    const credit = creditFor(credits, typeof url === 'string' ? url : url?.url);
    if (credit) kept[typeof url === 'string' ? url : url.url] = credit;
  }
  return Object.keys(kept).length ? kept : null;
}

// What to say when a photo search fails: the function's own words for a refusal (too many this
// hour, the month's searches used, no access), plain words when something broke. A 5xx carries
// the technical reason (on 20 Nov 2026, "Unsplash API error: 401": Unsplash refused the key; now
// "Pixabay API error: …"), which is for the logs, not the merchant.
export async function photoSearchError(error, fallback = appT(SEARCH_FAILED)) {
  return Number(error?.context?.status) >= 500 ? fallback : functionErrorMessage(error, fallback);
}

// Up to 5 photos for `query`: { id, url, thumb, keepUrl, alt, credit }. `url` and `thumb` are
// Pixabay's 640 px address (to show it while choosing, for up to a day); `keepUrl` its 1280 px one,
// for keepSamplePhotos. None found: []. Throws an Error to show (a friendly one from the function,
// or plain words). `hint`: Scan Menu's words for the dish (scanMenu v22 photo_search, from the
// menu), which findProductImage v26 searches first (Alvin, 20 Nov 2026).
export async function findSamplePhotos({ tenantId, query, page = 1, hint }) {
  const supabase = await getSupabase();
  const words = typeof hint === 'string' ? hint.trim().slice(0, 60) : '';
  const { data, error } = await supabase.functions.invoke('findProductImage', { body: { query: String(query || '').slice(0, 100), page, tenantId, ...(words ? { hint: words } : {}) } });
  if (error) {
    if (error?.context?.status === 404) return [];
    throw Object.assign(new Error(await photoSearchError(error)), { friendly: true });
  }
  return (Array.isArray(data?.photos) ? data.photos : [])
    .filter((photo) => photo?.previewUrl && photo?.keepUrl && photo?.credit?.name)
    .map((photo) => ({ id: photo.id, url: photo.previewUrl, thumb: photo.previewUrl, keepUrl: photo.keepUrl, alt: photo.alt || '', credit: photo.credit }));
}

// Copies the sample photos the shop uses into its own product photos (findProductImage 'keep', 8
// at a time), before the products are saved: Pixabay's addresses aren't for keeping. Resolves a
// Map from each photo's keepUrl to the shop's copy; a photo that couldn't be copied (its address
// had expired, say) isn't in it. Throws an Error to show when the copying couldn't be asked for:
// the function's words for a refusal, else `fallback`.
export async function keepSamplePhotos({ tenantId, photos, fallback = appT(KEEP_FAILED) }) {
  const wanted = [...new Map((photos || []).filter((photo) => photo?.keepUrl && photo?.id).map((photo) => [photo.keepUrl, photo])).values()];
  const kept = new Map();
  for (let i = 0; i < wanted.length; i += KEEP_AT_ONCE) {
    const batch = wanted.slice(i, i + KEEP_AT_ONCE).map((photo) => ({ id: photo.id, url: photo.keepUrl }));
    const supabase = await getSupabase();
    const { data, error } = await supabase.functions.invoke('findProductImage', { body: { action: 'keep', tenantId, photos: batch } });
    if (error) throw Object.assign(new Error(await photoSearchError(error, fallback)), { friendly: true });
    for (const copy of Array.isArray(data?.kept) ? data.kept : []) {
      if (copy?.from && copy?.url) kept.set(copy.from, copy.url);
    }
  }
  return kept;
}

// A sample photo as a scanned item's picture.
export const samplePicture = (photo) => ({ url: photo.url, sample: photo });

// Scan Menu's review: a sample photo for each item without a picture, found one by one in the
// order given (like the descriptions). An item's state: _photo 'waiting' while it's looked for;
// samples: the photos found (to choose another in its editor). A picture of its own, or one
// removed in its editor (_noSample), is never replaced. progress: { status: 'idle' | 'finding' |
// 'done' | 'stopped' | 'failed', total, done, error }.
export const PHOTOS_IDLE = { status: 'idle', total: 0, done: 0, error: null };

export function useSamplePhotoFinder({ tenantId, setItems }) {
  const run = useRef(0);
  const [progress, setProgress] = useState(PHOTOS_IDLE);
  const clearWaiting = useCallback(() => {
    setItems((prev) => (prev.some((i) => i._photo === 'waiting') ? prev.map((i) => (i._photo === 'waiting' ? { ...i, _photo: undefined } : i)) : prev));
  }, [setItems]);
  const stop = useCallback(() => {
    run.current += 1;
    clearWaiting();
    setProgress((p) => (p.status === 'finding' ? { ...p, status: 'stopped' } : p));
  }, [clearWaiting]);
  const reset = useCallback(() => {
    run.current += 1;
    clearWaiting();
    setProgress(PHOTOS_IDLE);
  }, [clearWaiting]);
  useEffect(() => () => { run.current += 1; }, []);

  const start = useCallback(async (queue) => {
    run.current += 1;
    const id = run.current;
    const alive = () => run.current === id;
    const list = (queue || []).filter((item) => String(item?.name || '').trim());
    if (!list.length) { setProgress(PHOTOS_IDLE); return; }
    const asked = new Set(list.map((item) => item._id));
    setItems((prev) => prev.map((item) => (asked.has(item._id) ? { ...item, _photo: 'waiting' } : item)));
    setProgress({ status: 'finding', total: list.length, done: 0, error: null });
    let done = 0;
    for (const item of list) {
      let photos;
      try {
        photos = await findSamplePhotos({ tenantId, query: item.name, hint: item.photoSearch });
      } catch (error) {
        if (!alive()) return;
        run.current += 1;
        clearWaiting();
        setProgress((p) => ({ ...p, status: 'failed', error: explainError(error, { t: appT, fallback: appT(SEARCH_FAILED) }).description }));
        return;
      }
      if (!alive()) return;
      setItems((prev) => prev.map((i) => {
        if (i._id !== item._id) return i;
        const next = { ...i, _photo: undefined, samples: photos };
        return i.picture || i._noSample || !photos.length ? next : { ...next, picture: samplePicture(photos[0]) };
      }));
      done += 1;
      setProgress((p) => ({ ...p, done }));
    }
    if (alive()) setProgress((p) => ({ ...p, status: 'done' }));
  }, [clearWaiting, setItems, tenantId]);

  return { progress, start, stop, reset };
}
