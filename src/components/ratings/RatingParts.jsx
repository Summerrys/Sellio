import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackToClose } from '@/lib/useBackToClose';
import { rememberReturnPath } from '@/lib/authNavigation';
import { NOTE_MAX, STAR_COLOR, STAR_WORDS, rateOrder, ratingText } from '@/lib/ratings';

// The pieces of shop ratings: stars, the "★ 4.8 (12)" pill, the breakdown window, the
// rate window, the row on a finished order and the one-time prompt on the ordering page.
// Inline styles: these also show on ordering pages, which use the shop's own theme.

const EMPTY = '#cbd5e1';

export function StarIcon({ filled = true, size = 14, color = STAR_COLOR }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'inline-block', flexShrink: 0 }}>
      <path
        d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"
        fill={filled ? color : 'none'}
        stroke={filled ? color : EMPTY}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Five stars, `value` of them filled (rounded to the nearest whole star).
export function Stars({ value = 0, size = 14, gap = 2 }) {
  const full = Math.round(Number(value) || 0);
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap, whiteSpace: 'nowrap' }}>
      {[1, 2, 3, 4, 5].map((i) => <StarIcon key={i} filled={i <= full} size={size} />)}
    </span>
  );
}

// "★ 4.8 (12)"; variant 'long': "★ 4.8 · 12 ratings"; 'bare': "★ 4.8".
export function RatingPill({ summary, size = 12, variant = 'short', color = '#0f172a', muted = '#64748b' }) {
  if (!summary) return null;
  const count = Number(summary.rating_count) || 0;
  const long = variant === 'long';
  return (
    <span
      aria-label={`Rated ${ratingText(summary.rating)} out of 5 by ${count} buyers`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: size, lineHeight: 1.2, whiteSpace: 'nowrap' }}
    >
      <StarIcon size={size} />
      <span style={{ fontWeight: 700, color }}>{ratingText(summary.rating)}</span>
      {variant !== 'bare' && <span style={{ color: muted }}>{long ? `· ${count} ${count === 1 ? 'rating' : 'ratings'}` : `(${count})`}</span>}
    </span>
  );
}

function Sheet({ open, onClose, labelledBy, children, zIndex = 1000 }) {
  useBackToClose(open, onClose);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} data-pull-refresh-block style={{ position: 'fixed', inset: 0, zIndex, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pointerEvents: 'auto' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, background: '#fff', borderRadius: '20px 20px 0 0', padding: '18px 20px calc(24px + env(safe-area-inset-bottom, 0px))', fontFamily: 'inherit', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, borderRadius: 9, background: '#e2e8f0', margin: '0 auto 14px' }} />
        <button type="button" aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#64748b', fontSize: 16, cursor: 'pointer' }}>✕</button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// A shop's average, count and the 5→1 bars.
export function RatingSheet({ open, onClose, shopName, summary }) {
  const count = Number(summary?.rating_count) || 0;
  const rows = [5, 4, 3, 2, 1].map((n) => [n, Number(summary?.[`stars_${n}`]) || 0]);
  return (
    <Sheet open={open && !!summary} onClose={onClose} labelledBy="rating-sheet-title">
      <p id="rating-sheet-title" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a', paddingRight: 40 }}>{shopName}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{ratingText(summary?.rating)}</div>
          <div style={{ marginTop: 6 }}><Stars value={summary?.rating} size={14} /></div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{count} {count === 1 ? 'rating' : 'ratings'}</div>
        </div>
        <div style={{ flex: 1 }}>
          {rows.map(([n, c]) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b', margin: '3px 0' }}>
              <span style={{ width: 8 }}>{n}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 9, background: '#f1f5f9', overflow: 'hidden' }}>
                <div style={{ width: `${count ? (c / count) * 100 : 0}%`, height: '100%', background: STAR_COLOR }} />
              </div>
              <span style={{ width: 18, textAlign: 'right' }}>{c}</span>
            </div>
          ))}
        </div>
      </div>
      <p style={{ margin: '16px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
        Ratings come only from buyers who ordered on Sellio and got their order. Each buyer counts once (their latest rating).
      </p>
    </Sheet>
  );
}

// Rate (or change the rating of) a finished order. Signed out: the stars, then log in.
export function RateOrderSheet({ open, onClose, order, shopName, initialStars = 0, existing = null, signedIn, returnPath, onRated, accent = '#e0449a' }) {
  const [stars, setStars] = useState(initialStars);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStars(initialStars || existing?.stars || 0);
    setNote(existing?.note || '');
    setError(null);
    setNeedsLogin(false);
  }, [open, order?.id]);

  const logIn = () => {
    rememberReturnPath(`${returnPath}${returnPath.includes('?') ? '&' : '?'}rate=${encodeURIComponent(order.id)}${stars ? `&stars=${stars}` : ''}`);
    window.location.assign('/Auth');
  };

  const post = async () => {
    if (!stars || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await rateOrder(order.id, stars, note.trim());
      onRated?.(saved);
    } catch (e) {
      if (e.hint === 'sign_in') setNeedsLogin(true);
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const items = (order?.items || []).map((i) => i.name).filter(Boolean);
  const showLogin = !signedIn || needsLogin;
  return (
    <Sheet open={open && !!order} onClose={() => { if (!saving) onClose(); }} labelledBy="rate-order-title" zIndex={1010}>
      <p id="rate-order-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a', textAlign: 'center', padding: '0 36px' }}>
        {existing ? 'Your rating of' : 'Rate'} {shopName}
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
        Order {order?.order_number ? `#${order.order_number}` : ''}{items.length ? ` · ${items.slice(0, 2).join(', ')}${items.length > 2 ? '…' : ''}` : ''}
      </p>
      <div role="radiogroup" aria-label="Stars" style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: '16px 0 4px' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}: ${STAR_WORDS[n]}`}
            onClick={() => setStars(n)}
            style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 0 }}
          >
            <StarIcon filled={n <= stars} size={38} />
          </button>
        ))}
      </div>
      <p style={{ margin: '0 0 14px', minHeight: 18, fontSize: 13, fontWeight: 600, color: '#b45309', textAlign: 'center' }}>{STAR_WORDS[stars] || 'Tap a star'}</p>

      {showLogin ? (
        <>
          <button type="button" onClick={logIn} disabled={!stars} style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', background: stars ? 'linear-gradient(90deg, #fb923c, #e0449a, #8b2fc9)' : '#e2e8f0', color: stars ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: 15, cursor: stars ? 'pointer' : 'default' }}>
            Log in to post your rating
          </button>
          <p style={{ margin: '10px 0 0', fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>Ratings come from signed-in buyers, so they can be trusted.</p>
        </>
      ) : (
        <>
          <label htmlFor="rate-note" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
            Anything to tell the seller? <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional, only they see it)</span>
          </label>
          <textarea
            id="rate-note"
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Lovely cake, easy collection"
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'none', outline: 'none' }}
          />
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>{note.length}/{NOTE_MAX}</p>
          <button type="button" onClick={post} disabled={!stars || saving} style={{ marginTop: 8, width: '100%', height: 48, borderRadius: 12, border: 'none', background: stars ? 'linear-gradient(90deg, #fb923c, #e0449a, #8b2fc9)' : '#e2e8f0', color: stars ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: 15, cursor: stars && !saving ? 'pointer' : 'default', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Posting…' : existing ? 'Update rating' : 'Post rating'}
          </button>
          <p style={{ margin: '10px 0 0', fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>You can change it for 30 days.</p>
        </>
      )}
      {error && !showLogin && <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: '#dc2626', textAlign: 'center' }}>{error}</p>}
      {needsLogin && <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: accent, textAlign: 'center' }}>Your sign-in has ended. Log in again to post.</p>}
    </Sheet>
  );
}

// On a finished order: "How was your order?" with stars, or "You rated ★★★★☆ · Change".
export function OrderRateRow({ order, rating, onPick, accent = '#e0449a' }) {
  if (!order || order.status !== 'completed') return null;
  if (rating) {
    return (
      <div data-testid="order-rated" style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: '#fff', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
        <span>You rated</span>
        <Stars value={rating.stars} size={13} />
        {rating.can_change && (
          <button type="button" onClick={() => onPick(rating.stars)} style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: accent, cursor: 'pointer' }}>Change</button>
        )}
      </div>
    );
  }
  return (
    <div data-testid="order-rate" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#fff', border: '1px solid #fde68a' }}>
      <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>How was your order?</p>
      <div style={{ display: 'flex', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`Rate ${n} ${n === 1 ? 'star' : 'stars'}`} onClick={() => onPick(n)} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 0 }}>
            <StarIcon filled={false} size={28} />
          </button>
        ))}
      </div>
    </div>
  );
}

// Once per order, on the next visit to the shop: a small card above the menu.
export function RatePrompt({ order, onPick, onDismiss, bottom = 20 }) {
  if (!order) return null;
  return (
    <div role="region" aria-label="Rate your order" style={{ position: 'fixed', left: 12, right: 12, bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`, zIndex: 60, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, boxShadow: '0 8px 28px rgba(15,23,42,0.18)', border: '1px solid #f1f5f9', padding: '12px 14px', pointerEvents: 'auto', position: 'relative' }}>
        <button type="button" aria-label="Not now" onClick={onDismiss} style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#64748b', fontSize: 13, cursor: 'pointer' }}>✕</button>
        <p style={{ margin: '0 32px 6px 0', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>How was your order #{order.order_number}?</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`Rate ${n} ${n === 1 ? 'star' : 'stars'}`} onClick={() => onPick(n)} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 0 }}>
              <StarIcon filled={false} size={30} />
            </button>
          ))}
          <button type="button" onClick={onDismiss} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 12, fontWeight: 600, color: '#94a3b8', cursor: 'pointer' }}>Not now</button>
        </div>
      </div>
    </div>
  );
}
