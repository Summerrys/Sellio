import React from 'react';
import { Lock, Check } from 'lucide-react';
import { Sheet, CloseButton } from './Sheet';
import { CHARACTERS, WARDROBE_SOON, characterOf } from '../engine/characters';

// A small flat picture of a hero, drawn from the same colours as the 3D one.
export function HeroPortrait({ hero, size = 64 }) {
  const h = hero || CHARACTERS[0];
  if (h.kind === 'mochi') {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
        <ellipse cx="32" cy="58" rx="16" ry="3.5" fill="rgba(42,24,56,.14)" />
        <ellipse cx="25" cy="54" rx="6" ry="3.4" fill="#f3d9cf" /><ellipse cx="39" cy="54" rx="6" ry="3.4" fill="#f3d9cf" />
        <ellipse cx="32" cy="36" rx="20" ry="18" fill="#fff8f2" stroke="#ecdcd2" strokeWidth="1.2" />
        <rect x="31" y="11" width="2" height="8" rx="1" fill="#4caf6e" />
        <ellipse cx="26" cy="12" rx="6.5" ry="2.8" fill="#4caf6e" transform="rotate(-24 26 12)" /><ellipse cx="38" cy="12" rx="6.5" ry="2.8" fill="#4caf6e" transform="rotate(24 38 12)" />
        <ellipse cx="25.5" cy="33" rx="2.4" ry="3" fill="#20142b" /><ellipse cx="38.5" cy="33" rx="2.4" ry="3" fill="#20142b" />
        <ellipse cx="19" cy="39" rx="3.6" ry="2" fill="#ff9ec4" /><ellipse cx="45" cy="39" rx="3.6" ry="2" fill="#ff9ec4" />
        <path d="M29 39 q3 3 6 0" fill="none" stroke="#20142b" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  const [topStyle, top, trim] = h.top;
  const [botStyle, bottom] = h.bottom;
  const acc = h.acc || [];
  const sleeve = topStyle === 'tee' ? h.skin : top;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      <ellipse cx="32" cy="60" rx="14" ry="3" fill="rgba(42,24,56,.14)" />
      {acc.includes('backpack') && <rect x="18" y="29" width="28" height="18" rx="5" fill={h.accColor} />}
      {acc.includes('courier') && <rect x="15" y="28" width="34" height="20" rx="4" fill={h.accColor} />}
      {/* legs and shoes */}
      <rect x="24.5" y="45" width="6" height="12" rx="3" fill={botStyle === 'pants' ? bottom : h.skin} />
      <rect x="33.5" y="45" width="6" height="12" rx="3" fill={botStyle === 'pants' ? bottom : h.skin} />
      {botStyle === 'shorts' && <><rect x="24" y="44" width="7" height="6.5" rx="2" fill={bottom} /><rect x="33" y="44" width="7" height="6.5" rx="2" fill={bottom} /></>}
      {botStyle === 'skirt' && <path d="M23 43 h18 l4 9 h-26 z" fill={bottom} />}
      <rect x="23" y="56" width="8.5" height="4" rx="2" fill="#fdfaff" stroke="#e6dcef" strokeWidth=".6" /><rect x="32.5" y="56" width="8.5" height="4" rx="2" fill="#fdfaff" stroke="#e6dcef" strokeWidth=".6" />
      {/* arms */}
      <rect x="16.5" y="30" width="5.5" height="14" rx="2.75" fill={sleeve} /><rect x="42" y="30" width="5.5" height="14" rx="2.75" fill={sleeve} />
      {topStyle === 'tee' && <><rect x="16" y="29.5" width="6.5" height="6" rx="3" fill={top} /><rect x="41.5" y="29.5" width="6.5" height="6" rx="3" fill={top} /></>}
      <circle cx="19.2" cy="44.5" r="2.8" fill={h.skin} /><circle cx="44.8" cy="44.5" r="2.8" fill={h.skin} />
      {/* body */}
      <rect x="21" y="28" width="22" height="19" rx="9" fill={top} />
      {topStyle === 'apron' && <><path d="M25 30 h14 v15 a2 2 0 0 1 -2 2 h-10 a2 2 0 0 1 -2 -2 z" fill={trim} /><rect x="28" y="38" width="8" height="5" rx="1.5" fill="#f3c14b" /></>}
      {topStyle === 'jacket' && <><rect x="31" y="29" width="2" height="18" fill={trim} /><path d="M26 28.5 q6 5 12 0" fill="none" stroke={trim} strokeWidth="2.4" strokeLinecap="round" /></>}
      {topStyle === 'hoodie' && <><path d="M25 29 q7 6 14 0" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="2" strokeLinecap="round" /><rect x="26.5" y="39" width="11" height="5" rx="2.5" fill="rgba(0,0,0,.14)" /></>}
      {acc.includes('tote') && <><rect x="44" y="40" width="9" height="11" rx="1.5" fill={h.accColor} stroke="#e6dcef" strokeWidth=".6" /><rect x="46.5" y="44" width="4" height="4" rx="1" fill="#e0449a" /></>}
      {/* head: no hair yet, it arrives with the wardrobe */}
      <circle cx="32" cy="18" r="11" fill={h.skin} />
      <circle cx="28" cy="18" r="1.5" fill="#1d1426" /><circle cx="36" cy="18" r="1.5" fill="#1d1426" />
      <path d="M29.5 22.5 q2.5 2.2 5 0" fill="none" stroke="#1d1426" strokeWidth="1.2" strokeLinecap="round" />
      {acc.includes('glasses') && <g fill="none" stroke={h.accColor} strokeWidth="1.3"><circle cx="28" cy="18" r="3.2" /><circle cx="36" cy="18" r="3.2" /><path d="M31.2 18 h1.6" /></g>}
      {acc.includes('headphones') && <><path d="M18.6 18 a13.4 13.4 0 0 1 26.8 0" fill="none" stroke="#3b2a45" strokeWidth="1.6" strokeLinecap="round" /><rect x="16.2" y="14.5" width="5.2" height="9" rx="2.6" fill={h.accColor} stroke="#3b2a45" strokeWidth=".8" /><rect x="42.6" y="14.5" width="5.2" height="9" rx="2.6" fill={h.accColor} stroke="#3b2a45" strokeWidth=".8" /></>}
    </svg>
  );
}

// The round button above the dock that opens the hero picker.
export function HeroButton({ hero, onClick }) {
  return (
    <button type="button" className="pw-round pw-hero-btn" onClick={onClick} aria-label={`Change hero. You are playing as ${hero.name}`}>
      <HeroPortrait hero={hero} size={40} />
    </button>
  );
}

// Choose who you play as. Tapping a hero swaps them in the world right away,
// so the player sees them standing on the street; the button keeps the choice.
export function HeroSheet({ open, value, saved, onPick, onChoose, onClose }) {
  const picked = characterOf(value);
  const first = !saved;
  return (
    <Sheet open={open} labelId="pw-hero-title" className="tall hero">
      <div className="pw-head">
        <div className="pw-min0">
          <h2 id="pw-hero-title">Choose your hero</h2>
          <p className="pw-sub">{first ? 'Who will you explore Sellio World as?' : 'Change hero whenever you like.'}</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="pw-scroll">
        <div className="pw-heroes" role="radiogroup" aria-label="Heroes">
          {CHARACTERS.map((h) => {
            const on = h.id === picked.id;
            return (
              <button key={h.id} type="button" role="radio" aria-checked={on} className={`pw-hero${on ? ' on' : ''}`} onClick={() => { if (!on) onPick(h.id); }}>
                {on && <span className="pw-hero-tick" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>}
                <HeroPortrait hero={h} size={60} />
                <span className="nm">{h.name}</span>
                <span className="meta">{h.role}</span>
              </button>
            );
          })}
        </div>
        <p className="pw-tagline" aria-live="polite">{picked.kind === 'mochi' ? `${picked.name}. ${picked.line}` : `${picked.name}, the ${picked.role.toLowerCase()}. ${picked.line}`}</p>
        <h3 className="pw-label">Wardrobe</h3>
        <ul className="pw-soon-list">
          {WARDROBE_SOON.map((w) => <li key={w}><Lock size={13} aria-hidden="true" />{w}<small>Coming soon</small></li>)}
        </ul>
      </div>
      <div className="pw-actions">
        <button type="button" className="pw-primary" onClick={() => onChoose(picked.id)}>
          {first ? `Start exploring as ${picked.name}` : picked.id === saved ? `Keep playing as ${picked.name}` : `Switch to ${picked.name}`}
        </button>
      </div>
    </Sheet>
  );
}
