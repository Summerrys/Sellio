import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useBackToClose } from '@/lib/useBackToClose';
import { rememberReturnPath } from '@/lib/authNavigation';
import { useAppUser } from '@/lib/AppUserContext';
import {
  NOTE_MAX, REPORT_REASONS, STAR_COLOR, STAR_WORDS, isSignedIn, publicName, rateOrder, ratingText, reportComment, shopComments,
} from '@/lib/ratings';

// The pieces of shop ratings: stars, the "★ 4.8 (12)" pill, the breakdown window (with
// buyers' public comments), the rate window, reporting a comment, the row on a finished
// order and the one-time prompt on the ordering page.
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

const COMMENTS_PAGE = 10;
const monthYear = (iso) => (iso ? new Date(iso).toLocaleDateString('en-SG', { month: 'short', year: 'numeric' }) : '');

// A shop's average, count and the 5→1 bars, then what buyers say (public comments;
// shopId given). Each comment can be reported.
export function RatingSheet({ open, onClose, shopName, summary, shopId = null }) {
  const count = Number(summary?.rating_count) || 0;
  const rows = [5, 4, 3, 2, 1].map((n) => [n, Number(summary?.[`stars_${n}`]) || 0]);
  const [comments, setComments] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reporting, setReporting] = useState(null);
  const showing = open && !!summary;

  useEffect(() => {
    if (!showing || !shopId) return undefined;
    let cancelled = false;
    shopComments(shopId, 0, COMMENTS_PAGE)
      .then((list) => { if (!cancelled) { setComments(list); setHasMore(list.length === COMMENTS_PAGE); } })
      .catch(() => { if (!cancelled) { setComments([]); setHasMore(false); } });
    return () => { cancelled = true; };
  }, [showing, shopId]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const list = await shopComments(shopId, comments.length, COMMENTS_PAGE);
      setComments((prev) => [...prev, ...list]);
      setHasMore(list.length === COMMENTS_PAGE);
    } catch { /* the button stays */ }
    setLoadingMore(false);
  };

  return (
    <>
    <Sheet open={showing} onClose={onClose} labelledBy="rating-sheet-title">
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
      {comments.length > 0 && (
        <div style={{ marginTop: 18 }} data-testid="rating-comments">
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>What buyers say</p>
          {comments.map((c) => (
            <div key={c.id} data-testid="rating-comment" style={{ padding: '10px 0', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{c.rater_name}</span>
                <Stars value={c.stars} size={11} />
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>{monthYear(c.posted_at)}{c.edited ? ' · edited' : ''}</span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#334155', lineHeight: 1.5, wordBreak: 'break-word' }}>{c.note}</p>
              {!c.mine && (
                <button type="button" onClick={() => setReporting(c)} data-testid="report-comment" style={{ marginTop: 4, background: 'none', border: 'none', padding: 0, fontSize: 11, color: '#94a3b8', cursor: 'pointer', textDecoration: 'underline' }}>
                  Report
                </button>
              )}
            </div>
          ))}
          {hasMore && (
            <button type="button" onClick={loadMore} disabled={loadingMore} style={{ width: '100%', marginTop: 6, height: 36, borderRadius: 999, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
              {loadingMore ? 'Loading…' : 'Show more'}
            </button>
          )}
        </div>
      )}
      <p style={{ margin: '16px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
        Ratings come only from buyers who ordered on Sellio and got their order. Each buyer counts once (their latest rating).
      </p>
    </Sheet>
    <ReportCommentSheet
      open={!!reporting}
      comment={reporting}
      onClose={() => setReporting(null)}
      onReported={(result) => {
        if (result?.hidden) setComments((prev) => prev.filter((c) => c.id !== reporting?.id));
        setReporting(null);
      }}
    />
    </>
  );
}

// Report a public comment: why, and anything else to add. Logged out: log in first.
export function ReportCommentSheet({ open, onClose, comment, onReported }) {
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [signedIn, setSignedIn] = useState(true);

  useEffect(() => {
    if (!open) return;
    setReason(null);
    setDetails('');
    setError(null);
    isSignedIn().then(setSignedIn);
  }, [open, comment?.id]);

  const logIn = () => {
    rememberReturnPath(`${window.location.pathname}${window.location.search}`);
    window.location.assign('/Auth');
  };

  const send = async () => {
    if (!reason || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await reportComment(comment.id, reason, details.trim());
      toast.success(result?.hidden ? 'Thanks. It’s hidden while Sellio takes a look.' : 'Thanks. Sellio will take a look.');
      onReported?.(result);
    } catch (e) {
      if (e.hint === 'sign_in') setSignedIn(false);
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open && !!comment} onClose={() => { if (!sending) onClose(); }} labelledBy="report-comment-title" zIndex={1020}>
      <p id="report-comment-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a', paddingRight: 40 }}>Report this comment</p>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.5, background: '#f8fafc', borderRadius: 10, padding: '8px 10px', wordBreak: 'break-word' }}>
        “{comment?.note}” <span style={{ color: '#94a3b8' }}>— {comment?.rater_name}</span>
      </p>
      {!signedIn ? (
        <>
          <p style={{ margin: '14px 0 10px', fontSize: 13, color: '#475569' }}>Log in to report a comment, so reports can be trusted.</p>
          <button type="button" onClick={logIn} style={{ width: '100%', height: 46, borderRadius: 12, border: 'none', background: 'linear-gradient(90deg, #fb923c, #e0449a, #8b2fc9)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            Log in to report
          </button>
        </>
      ) : (
        <>
          <div role="radiogroup" aria-label="Why are you reporting it?" style={{ marginTop: 12, display: 'grid', gap: 6 }}>
            {REPORT_REASONS.map(([value, label]) => (
              <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${reason === value ? '#0f172a' : '#e2e8f0'}`, fontSize: 14, color: '#0f172a', cursor: 'pointer' }}>
                <input type="radio" name="report-reason" value={value} checked={reason === value} onChange={() => setReason(value)} style={{ width: 16, height: 16 }} />
                {label}
              </label>
            ))}
          </div>
          <textarea
            value={details}
            maxLength={300}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Anything else we should know? (optional)"
            rows={2}
            aria-label="Anything else we should know?"
            style={{ marginTop: 10, width: '100%', boxSizing: 'border-box', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'none', outline: 'none' }}
          />
          <button type="button" onClick={send} disabled={!reason || sending} data-testid="report-send" style={{ marginTop: 8, width: '100%', height: 46, borderRadius: 12, border: 'none', background: reason ? '#0f172a' : '#e2e8f0', color: reason ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: 15, cursor: reason && !sending ? 'pointer' : 'default', opacity: sending ? 0.7 : 1 }}>
            {sending ? 'Sending…' : 'Send report'}
          </button>
          <p style={{ margin: '10px 0 0', fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>A reported comment is hidden while Sellio looks at it. The buyer’s stars still count.</p>
        </>
      )}
      {error && signedIn && <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: '#dc2626', textAlign: 'center' }}>{error}</p>}
    </Sheet>
  );
}

// Rate (or change the rating of) a finished order. Signed out: the stars, then log in.
// The comment shows on the shop's page as "Alicia T." unless the buyer unticks it (then
// only the seller sees it).
export function RateOrderSheet({ open, onClose, order, shopName, initialStars = 0, existing = null, signedIn, returnPath, onRated, accent = '#e0449a' }) {
  const { appUser } = useAppUser() || {};
  const [stars, setStars] = useState(initialStars);
  const [note, setNote] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const myName = publicName(appUser?.full_name);

  useEffect(() => {
    if (!open) return;
    setStars(initialStars || existing?.stars || 0);
    setNote(existing?.note || '');
    setIsPublic(existing?.note ? !!existing.note_public : true);
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
      const saved = await rateOrder(order.id, stars, note.trim(), isPublic);
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
            Your comment <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
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
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} data-testid="rate-public" style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: accent }} />
            <span style={{ fontSize: 12, color: '#334155', lineHeight: 1.45 }}>
              Show my comment on {shopName}’s page as <strong>{myName || 'your first name and initial'}</strong>
              <span style={{ display: 'block', fontSize: 11, color: '#94a3b8' }}>
                {isPublic ? 'Leave out phone numbers, addresses and other personal details.' : 'Only the seller will see it.'}
              </span>
            </span>
          </label>
          {existing?.note && existing?.note_state === 'removed' && (
            <p data-testid="rate-comment-removed" style={{ margin: '8px 0 0', fontSize: 12, color: '#b45309', lineHeight: 1.45 }}>Sellio removed your comment after a review, so it isn’t shown. Your stars still count.</p>
          )}
          {existing?.note && existing?.note_public && existing?.note_state === 'reported' && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#b45309', lineHeight: 1.45 }}>Your comment is hidden while Sellio looks at a report.</p>
          )}
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
