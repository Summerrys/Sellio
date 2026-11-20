import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { appT, N_ } from '@/lib/appText';
import { explainError } from '@/lib/plainError';
import { functionErrorMessage } from '@/lib/aiAllowance';

// Sample photos from Unsplash (findProductImage v23; Alvin, 20 Nov 2026: credit the
// photographers). Unsplash's API guidelines: a photo is shown from Unsplash's own address (never
// copied), Unsplash is told when one is used (reportUsedPhotos), and the photographer is credited
// wherever it's shown: products.image_credits keeps the credit by image URL, and the storefront and
// Explore show "Sample photo" and "Photo by … on Unsplash" with it.
export const UNSPLASH_HOME = 'https://unsplash.com/?utm_source=sellio&utm_medium=referral';
export const SEARCH_FAILED = N_('Search failed. Please try again.');

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

// Up to 5 photos for `query`: { id, url, thumb, alt, credit, downloadLocation }. None found: [].
// Throws an Error to show (a friendly one from the function, or plain words).
export async function findSamplePhotos({ tenantId, query, page = 1 }) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke('findProductImage', { body: { query: String(query || '').slice(0, 100), page, tenantId } });
  if (error) {
    if (error?.context?.status === 404) return [];
    throw Object.assign(new Error(await functionErrorMessage(error, appT(SEARCH_FAILED))), { friendly: true });
  }
  return (Array.isArray(data?.photos) ? data.photos : [])
    .filter((photo) => photo?.url && photo?.credit?.name)
    .map((photo) => ({ id: photo.id, url: photo.url, thumb: photo.previewUrl || photo.url, alt: photo.alt || '', credit: photo.credit, downloadLocation: photo.downloadLocation }));
}

// Tells Unsplash these photos were used (when they're saved with a product). Never fails the save.
export async function reportUsedPhotos({ tenantId, photos }) {
  const locations = [...new Set((photos || []).map((photo) => photo?.downloadLocation).filter(Boolean))];
  for (let i = 0; i < locations.length; i += 30) {
    try {
      const supabase = await getSupabase();
      await supabase.functions.invoke('findProductImage', { body: { action: 'use', tenantId, downloadLocations: locations.slice(i, i + 30) } });
    } catch (error) {
      console.warn('Sample photos: Unsplash wasn’t told of their use:', error);
    }
  }
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
        photos = await findSamplePhotos({ tenantId, query: item.name });
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
