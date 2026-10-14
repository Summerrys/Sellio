import React from 'react';
import { DoorOpen, Footprints, Sparkles, Tag, Globe2, Eye, Zap, Coffee, Store, ShoppingBag, Flower2, MapPin } from 'lucide-react';
import { Sheet, CloseButton, Coin } from './Sheet';
import { formatPrice } from './StallSheet';

const ICONS = { plaza: MapPin, fnb: Coffee, popup: Store, retail: ShoppingBag, services: Flower2 };

function hoursLine(shop) {
  const h = shop.hours_today;
  if (!h) return null;
  if (h.closed) return 'Closed today';
  const fmt = (t) => {
    const [hh, mm] = String(t || '').split(':').map(Number);
    if (!Number.isFinite(hh)) return '';
    const d = new Date(2000, 0, 1, hh, mm || 0);
    return d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: mm ? '2-digit' : undefined }).replace(/\s/g, '').toLowerCase();
  };
  if (shop.open_now === true) return `Open now · until ${fmt(h.close)}`;
  if (shop.open_now === false) return `Closed now · opens ${fmt(h.open)}`;
  return `${fmt(h.open)} – ${fmt(h.close)}`;
}

function rewardLine({ signedIn, canEarn, visited, visitsLeft, reward }) {
  if (!signedIn) return [`Sign in to earn +${reward} coins for visiting`, false];
  if (!canEarn) return ['Visit rewards start when Pop-up Street opens', false];
  if (visited) return ["Today's visit reward collected", true];
  if (visitsLeft <= 0) return ["You've collected all of today's visit rewards", true];
  return [`Step inside today to earn +${reward} coins`, false];
}

// A café or restaurant on the F&B boulevard: its name and colours, today's
// hours, a few things from the menu and the way in to its real storefront.
export function StorefrontSheet({ open, shop, onClose, onVisit, busy, signedIn, canEarn, visited, visitsLeft, reward }) {
  const s = shop || { name: '', menu: [] };
  const name = (s.name || '').trim();
  const hours = shop ? hoursLine(s) : null;
  const [line, done] = shop ? rewardLine({ signedIn, canEarn, visited, visitsLeft, reward }) : ['', false];
  return (
    <Sheet open={open} labelId="pw-store-name" className="storefront">
      {s.banner_url && <div className="pw-banner" style={{ backgroundImage: `url("${String(s.banner_url).replace(/"/g, '%22')}")` }} aria-hidden="true" />}
      <div className="pw-head">
        <span className="pw-avatar" aria-hidden="true" style={{ background: s.tint }}>
          {s.logo_url ? <img src={s.logo_url} alt="" referrerPolicy="no-referrer" /> : (name || '?').charAt(0)}
        </span>
        <div className="pw-min0">
          <h2 id="pw-store-name">{name}</h2>
          <p className="pw-sub">{[s.kind, hours].filter(Boolean).join(' · ')}</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="pw-scroll">
        {s.headline && <p className="pw-promo"><Tag size={15} aria-hidden="true" />{s.headline}</p>}
        {s.tagline && <p className="pw-tagline">{s.tagline}</p>}
        {s.menu?.length > 0 && (
          <>
            <h3 className="pw-label">Popular here</h3>
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
        {shop && <div className={`pw-reward${done ? ' done' : ''}`}><Coin small /><span>{line}</span></div>}
      </div>
      <div className="pw-actions">
        <button type="button" className="pw-primary" onClick={onVisit} disabled={busy}>
          <DoorOpen size={18} aria-hidden="true" />{name && name.length <= 18 ? `Step inside ${name}` : 'Step inside'}
        </button>
      </div>
    </Sheet>
  );
}

// An empty storefront on the boulevard.
export function FnbPlotSheet({ open, onClose, onAction }) {
  return (
    <Sheet open={open} labelId="pw-fnbplot-title">
      <div className="pw-head">
        <span className="pw-avatar" aria-hidden="true"><Sparkles size={22} /></span>
        <div className="pw-min0"><h2 id="pw-fnbplot-title">Your café here</h2><p className="pw-sub">F&B District · free storefront</p></div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="pw-scroll">
        <p className="pw-tagline">Every café, restaurant and bakery on Sellio gets a full storefront on this boulevard, in its own colours, with its name over the door and its menu inside. Shoppers walk in from here to order.</p>
      </div>
      <div className="pw-actions">
        <button type="button" className="pw-primary" onClick={() => onAction('merchants')}><Sparkles size={18} aria-hidden="true" />Bring my café to Sellio</button>
      </div>
    </Sheet>
  );
}

// Retail Avenue and Services Garden, before they open.
export function ComingSoonSheet({ open, district, onClose, onLook }) {
  const d = district || { name: '', blurb: '' };
  const Icon = ICONS[d.key] || Sparkles;
  return (
    <Sheet open={open} labelId="pw-soon-title">
      <div className="pw-head">
        <span className="pw-avatar soon" aria-hidden="true"><Icon size={22} /></span>
        <div className="pw-min0"><h2 id="pw-soon-title">{d.name}</h2><p className="pw-sub">Coming soon to Sellio World</p></div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="pw-scroll">
        <p className="pw-tagline">{d.blurb}. The cranes are up: this district opens as more Sellio shops join. For now, F&B District and Pop-up Street are open to explore.</p>
      </div>
      <div className="pw-actions">
        <button type="button" className="pw-ghost" onClick={onLook}><Eye size={18} aria-hidden="true" />Look around</button>
      </div>
    </Sheet>
  );
}

// Sellio Hop: jump between districts, see who is where, or zoom back out.
export function HopSheet({ open, onClose, districts, here, onHop, onPeek, onOverview, list, onWalk }) {
  return (
    <Sheet open={open} labelId="pw-hop-title" className="tall">
      <div className="pw-head">
        <span className="pw-avatar" aria-hidden="true"><Zap size={22} /></span>
        <div className="pw-min0">
          <h2 id="pw-hop-title">Sellio Hop</h2>
          <p className="pw-sub">Step onto a pink pad, or jump from here.</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="pw-scroll">
        <ul className="pw-hops">
          {districts.map((d) => {
            const Icon = ICONS[d.key] || MapPin;
            const live = d.status !== 'soon';
            return (
              <li key={d.key} className={d.key === here ? 'here' : ''}>
                <span className={`pw-hop-ico ${d.key}${live ? '' : ' soon'}`} aria-hidden="true"><Icon size={18} /></span>
                <div className="pw-min0"><strong>{d.name}</strong><small>{d.key === here ? 'You are here' : d.note}</small></div>
                {live
                  ? <button type="button" className="pw-ghost sm" disabled={d.key === here} onClick={() => onHop(d.key)}><Zap size={15} aria-hidden="true" />Hop</button>
                  : <button type="button" className="pw-ghost sm" onClick={() => onPeek(d.key)}><Eye size={15} aria-hidden="true" />Look</button>}
              </li>
            );
          })}
        </ul>
        {list && list.items.length > 0 && (
          <>
            <h3 className="pw-label">{list.title}</h3>
            <ul className="pw-directory">
              {list.items.map((s) => (
                <li key={s.tenant_id}>
                  <span className="pw-swatch" style={{ background: s.tint }} aria-hidden="true" />
                  <div className="pw-min0"><strong>{(s.name || '').trim()}{s.mine ? ' (you)' : ''}</strong><small>{[s.kind, s.area].filter(Boolean).join(' · ')}</small></div>
                  <button type="button" className="pw-ghost sm" onClick={() => onWalk(s)} aria-label={`Walk to ${s.name}`}><Footprints size={15} aria-hidden="true" />Go</button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="pw-actions" style={{ marginTop: 14 }}>
          <button type="button" className="pw-ghost" onClick={onOverview}><Globe2 size={18} aria-hidden="true" />See the whole island</button>
        </div>
      </div>
    </Sheet>
  );
}

export { hoursLine };
