import React from 'react';
import { ExternalLink, Store } from 'lucide-react';
import { Sheet, CloseButton, Coin } from './Sheet';

export function formatPrice(value, currency = 'SGD') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  try { return new Intl.NumberFormat('en-SG', { style: 'currency', currency: currency || 'SGD' }).format(n); }
  catch { return `$${n.toFixed(2)}`; }
}

function rewardLine({ shop, signedIn, canEarn, visited, visitsLeft, reward }) {
  if (shop.mine) return ['Your own stall does not earn visit coins', false];
  if (!signedIn) return [`Sign in to earn +${reward} coins for visiting`, false];
  if (!canEarn) return ['Visit rewards start when Pop-up Street opens', false];
  if (visited) return ["Today's visit reward collected", true];
  if (visitsLeft <= 0) return ["You've collected all of today's visit rewards", true];
  return [`Visit the storefront today to earn +${reward} coins`, false];
}

// A seller's stall: who they are, three things they sell, and the way into
// their real storefront.
export function StallSheet({ open, shop, onClose, onVisit, onStyle, busy, signedIn, canEarn, visited, visitsLeft, reward }) {
  const s = shop || { name: '', menu: [] };
  const how = [s.collection && 'Self-collect', s.delivery && 'Delivery'].filter(Boolean).join(' & ');
  const meta = [s.mine ? 'Your stall' : null, s.kind, s.area, how].filter(Boolean).join(' · ');
  const [line, done] = shop ? rewardLine({ shop: s, signedIn, canEarn, visited, visitsLeft, reward }) : ['', false];
  return (
    <Sheet open={open} labelId="pw-stall-name">
      <div className="pw-head">
        <span className="pw-avatar" aria-hidden="true" style={{ background: s.mine ? undefined : s.tint }}>
          {s.logo_url ? <img src={s.logo_url} alt="" referrerPolicy="no-referrer" /> : (s.name || '?').charAt(0)}
        </span>
        <div className="pw-min0">
          <h2 id="pw-stall-name">{s.name}</h2>
          <p className="pw-sub">{meta}</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="pw-scroll">
        {s.tagline && <p className="pw-tagline">{s.tagline}</p>}
        {s.menu?.length > 0 && (
          <>
            <h3 className="pw-label">On the menu</h3>
            <ul className="pw-menu">
              {s.menu.map((m, i) => (
                <li key={i}>
                  {m.image_url && <img className="pw-thumb" src={m.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                  <span className="pw-name">{m.name}</span>
                  <span className="pw-price">{formatPrice(m.price, s.currency)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className={`pw-reward${done ? ' done' : ''}`}><Coin small /><span>{line}</span></div>
      </div>
      <div className="pw-actions">
        <button type="button" className="pw-primary" onClick={onVisit} disabled={busy}>
          <ExternalLink size={18} aria-hidden="true" />{s.mine ? 'Open my storefront' : 'Visit storefront'}
        </button>
        {s.mine && <button type="button" className="pw-ghost" onClick={onStyle}><Store size={18} aria-hidden="true" />Style my stall</button>}
      </div>
    </Sheet>
  );
}
