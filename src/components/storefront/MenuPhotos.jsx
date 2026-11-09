/**
 * A shop's menu on a slow connection (UX state 5): the menu's words show at once, a card
 * counts the photos still on their way ("Loading photos 6 of 24"), and the customer can
 * switch to the menu without photos. That choice lasts while the page is open (this tab),
 * and Android's Data Saver starts the menu without photos.
 *
 * The count is the photos the customer has had on screen: photos further down only start
 * loading when they're scrolled to, so counting them would leave the bar stuck.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

export const PHOTOS_KEY = 'sellio_menu_photos';
// The card shows once a photo on screen has been loading this long.
export const SLOW_AFTER_MS = 2500;
// Once every photo has loaded, the card stays (full bar) this long in view, then folds away.
export const FINISHED_SHOW_MS = 700;
export const TICK_MS = 400;
const FOLD_MS = 220;

const sfType = pixels => `calc(${pixels}px * var(--sf-type-scale, 1))`;
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));

export function initialPhotosOff() {
  try {
    const saved = window.sessionStorage.getItem(PHOTOS_KEY);
    if (saved === 'off') return true;
    if (saved === 'on') return false;
  } catch { /* storage blocked: decide from Data Saver */ }
  try { return navigator.connection?.saveData === true; } catch { return false; }
}

export function rememberPhotos(off) {
  try { window.sessionStorage.setItem(PHOTOS_KEY, off ? 'off' : 'on'); } catch { /* still applies on this page */ }
  console.info(`Sellio menu: photos ${off ? 'off' : 'on'}`);
}

// Loaded, or failed for good: either way it's no longer on its way.
export function photoDone(img) {
  return img.complete || img.dataset.loaded != null;
}

// Which menu photos have been on screen, and since when. Null where the browser can't tell.
export function createPhotoTracker({ now = () => Date.now() } = {}) {
  if (typeof IntersectionObserver !== 'function') return null;
  const photos = new Map();
  const observer = new IntersectionObserver((entries) => {
    const at = now();
    entries.forEach((entry) => {
      const photo = photos.get(entry.target);
      if (photo && entry.isIntersecting && photo.seenAt == null) photo.seenAt = at;
    });
  });
  return {
    track(img) {
      photos.set(img, { seenAt: null });
      observer.observe(img);
      return () => {
        observer.unobserve(img);
        photos.delete(img);
      };
    },
    count(at = now()) {
      let done = 0;
      let total = 0;
      let slow = false;
      photos.forEach((photo, img) => {
        if (photo.seenAt == null) return;
        total += 1;
        if (photoDone(img)) done += 1;
        else if (at - photo.seenAt >= SLOW_AFTER_MS) slow = true;
      });
      return { done, total, slow };
    },
    stop() {
      observer.disconnect();
      photos.clear();
    },
  };
}

const MenuPhotosContext = createContext({ off: false, track: null });
export const MenuPhotosProvider = MenuPhotosContext.Provider;
export const useMenuPhotos = () => useContext(MenuPhotosContext);

// A product's photo on the menu. Nothing when the customer chose the menu without photos.
export function MenuPhoto({ src, style }) {
  const { off, track } = useMenuPhotos();
  const imgRef = useRef(null);
  useEffect(() => {
    const img = imgRef.current;
    if (off || !track || !img) return undefined;
    return track(img);
  }, [off, track, src]);
  if (off) return null;
  return <img ref={imgRef} src={src} alt="" loading="lazy" decoding="async" className="sellio-photo" data-menu-photo="" style={style} />;
}

const viewHeight = () => window.innerHeight || document.documentElement.clientHeight || 0;

// The card only appears where the customer is looking: at the top of the menu, below the
// shop's header. Appearing anywhere else would move the menu under their thumb unseen.
function slotFits(slot, topInset) {
  if (!slot) return false;
  const { top } = slot.getBoundingClientRect();
  return top >= topInset + 16 && top <= viewHeight() - 140;
}

function cardInView(card, topInset) {
  if (!card) return false;
  const { top, bottom } = card.getBoundingClientRect();
  return top >= topInset && bottom <= viewHeight();
}

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export function PhotoProgress({ tracker, primaryColor, topInset = 0, onPhotosOff }) {
  const { t } = useLanguage();
  const slotRef = useRef(null);
  const cardRef = useRef(null);
  const insetRef = useRef(topInset);
  insetRef.current = topInset;
  const [state, setState] = useState({ phase: 'hidden', done: 0, total: 0 });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setState({ phase: 'hidden', done: 0, total: 0 });
    if (!tracker) return undefined;
    let phase = 'hidden';
    let finishedInViewSince = null;
    let foldTimer = null;
    const tick = () => {
      if (document.hidden || phase === 'folding') return;
      const at = Date.now();
      const { done, total, slow } = tracker.count(at);
      if (phase === 'hidden') {
        if (!slow || !slotFits(slotRef.current, insetRef.current)) return;
        phase = 'shown';
        setState({ phase, done, total });
        return;
      }
      // Shown. Keep the last real count if the photos went off the page (search, a category).
      if (total > 0) setState(prev => (prev.done === done && prev.total === total ? prev : { ...prev, done, total }));
      // Fold away only once everything has loaded and the customer can see the full bar:
      // the menu never moves while they're looking further down.
      if (done < total || !cardInView(cardRef.current, insetRef.current)) {
        finishedInViewSince = null;
        return;
      }
      if (finishedInViewSince == null) finishedInViewSince = at;
      if (at - finishedInViewSince < FINISHED_SHOW_MS) return;
      phase = 'folding';
      setState(prev => ({ ...prev, phase }));
      foldTimer = setTimeout(() => {
        phase = 'hidden';
        finishedInViewSince = null;
        setState({ phase, done: 0, total: 0 });
      }, reducedMotion() ? 0 : FOLD_MS);
    };
    const timer = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(foldTimer);
    };
  }, [tracker]);

  // Slides open rather than jumping the menu down; folds the same way.
  useEffect(() => {
    if (state.phase !== 'shown') {
      setOpen(false);
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      void slotRef.current?.offsetHeight;
      setOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [state.phase]);

  const { phase, done, total } = state;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const motion = reducedMotion() ? 'none' : `grid-template-rows ${FOLD_MS}ms ease, opacity ${FOLD_MS}ms ease`;
  return (
    <div ref={slotRef} data-testid="photo-progress-slot">
      {phase !== 'hidden' && (
        <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0, transition: motion }}>
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <div ref={cardRef} style={{ padding: '14px 16px 2px' }}>
              <div
                data-testid="photo-progress"
                data-phase={phase}
                style={{ padding: 12, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0', pointerEvents: 'auto' }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: sfType(13), fontWeight: 600, color: '#0f172a' }}>{t('loadingPhotos')}</span>
                  <span data-testid="photo-progress-count" style={{ fontSize: sfType(13), color: '#64748b', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {fill(t('photosCount'), { done, total })}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={t('loadingPhotos')}
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={done}
                  style={{ height: 6, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', margin: '8px 0 10px' }}
                >
                  <div data-testid="photo-progress-bar" style={{ width: `${percent}%`, height: '100%', borderRadius: 999, background: primaryColor, transition: reducedMotion() ? 'none' : 'width .3s ease' }} />
                </div>
                <button
                  type="button"
                  data-testid="photos-off-button"
                  onClick={onPhotosOff}
                  style={{ width: '100%', minHeight: 36, borderRadius: 10, border: '1px solid #e2e8f0', background: '#ffffff', color: '#0f172a', fontSize: sfType(13), fontWeight: 600, cursor: 'pointer', padding: '6px 12px' }}
                >
                  {t('showMenuWithoutPhotos')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// The menu without photos: says so, and brings them back.
export function PhotosOffNote({ primaryColor, onPhotosOn }) {
  const { t } = useLanguage();
  return (
    <div style={{ padding: '14px 16px 2px' }}>
      <div
        data-testid="photos-off-note"
        role="note"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 6px 12px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', pointerEvents: 'auto' }}
      >
        <ImageOff size={16} color="#94a3b8" aria-hidden="true" style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: sfType(13), color: '#475569', lineHeight: 1.4 }}>{t('menuWithoutPhotos')}</span>
        <button
          type="button"
          data-testid="photos-on-button"
          onClick={onPhotosOn}
          style={{ flexShrink: 0, minHeight: 32, border: 'none', borderRadius: 8, background: 'none', color: primaryColor, fontSize: sfType(13), fontWeight: 600, cursor: 'pointer', padding: '6px 8px' }}
        >
          {t('showPhotos')}
        </button>
      </div>
    </div>
  );
}
