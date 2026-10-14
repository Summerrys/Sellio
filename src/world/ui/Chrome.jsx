import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Zap, Crosshair, LocateFixed, CircleHelp, Store, Gift, LogIn, Sparkles, Trophy, Coins } from 'lucide-react';
import { Coin } from './Sheet';

/* Top bar: Sellio World and where you are (opens Sellio Hop), and the coin
   balance with the explorer level ring (opens today's rewards). */
export function Hud({ onMap, place = 'Sellio World', balance, level, levelProgress, showSignIn, canEarn, claimable, onCoins, onSignIn, bumpKey }) {
  const chip = useRef(null);
  useEffect(() => {
    if (!bumpKey || !chip.current || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const el = chip.current; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }, [bumpKey]);
  const R = 15, C = 2 * Math.PI * R;
  return (
    <header className="pw-hud">
      <button type="button" className="pw-chip" onClick={onMap} aria-label={`Sellio World, ${place}. Open Sellio Hop and the shop directory`}>
        <span className="pw-mark" aria-hidden="true">S</span>
        <span className="pw-brand-text"><strong>Sellio World</strong><small>{place}</small></span>
        <Zap size={18} aria-hidden="true" />
      </button>
      {canEarn ? (
        <button type="button" ref={chip} className="pw-chip pw-coins" onClick={onCoins} aria-label={`${balance} coins, explorer level ${level}. Open today's rewards`}>
          <span className="pw-lvl" aria-hidden="true">
            <svg viewBox="0 0 36 36" width="36" height="36">
              <circle cx="18" cy="18" r={R} fill="#fff" stroke="#e6dcef" strokeWidth="4" />
              {levelProgress > 0.02 && (
                <circle cx="18" cy="18" r={R} fill="none" stroke="url(#pwg)" strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={`${C * levelProgress} ${C}`} transform="rotate(-90 18 18)" />
              )}
              <defs><linearGradient id="pwg" x1="0" x2="1"><stop offset="0" stopColor="#fb923c" /><stop offset=".55" stopColor="#e0449a" /><stop offset="1" stopColor="#8b2fc9" /></linearGradient></defs>
            </svg>
            <b>{level}</b>
          </span>
          <span className="pw-num"><Coin /><span>{balance}</span></span>
          {claimable && <span className="pw-dot" aria-hidden="true" />}
        </button>
      ) : showSignIn ? (
        <button type="button" className="pw-chip pw-signin-chip" onClick={onSignIn}>
          <Coin /> Sign in
        </button>
      ) : <span />}
    </header>
  );
}

/* Bottom dock: follow Mochi, the main action for this player, help. */
export function Dock({ primary, onRecentre, following = true, onHelp }) {
  const Icon = { style: Store, daily: Gift, signin: LogIn, shop: Sparkles }[primary?.icon] || Coins;
  return (
    <nav className="pw-dock" aria-label="World actions">
      <button type="button" className={`pw-round${following ? ' on' : ' nudge'}`} onClick={onRecentre} aria-pressed={following}
        aria-label={following ? 'The camera is following Mochi' : 'Find Mochi and follow again'}>
        {following ? <LocateFixed size={22} aria-hidden="true" /> : <Crosshair size={22} aria-hidden="true" />}
      </button>
      {primary && <button type="button" className="pw-primary" onClick={primary.onClick}><Icon size={20} aria-hidden="true" />{primary.label}</button>}
      <button type="button" className="pw-round" onClick={onHelp} aria-label="How Sellio World works, and settings"><CircleHelp size={22} aria-hidden="true" /></button>
    </nav>
  );
}

/* Toasts under the top bar; at most three at a time. */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);
  const dismiss = useCallback((id) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 350);
  }, []);
  const push = useCallback((text, { kind = 'info', action = null, duration = 3200, icon = null } = {}) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, kind, action, icon }]);
    setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);
  return { toasts, push, dismiss };
}

export function Toasts({ toasts, dismiss }) {
  return (
    <div className="pw-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`pw-toast ${t.kind}${t.leaving ? ' leaving' : ''}`}>
          {t.kind === 'reward' && <span className="pw-toast-ico" aria-hidden="true">{t.icon === 'trophy' ? <Trophy size={17} /> : <Coin small />}</span>}
          <span>{t.text}</span>
          {t.action && <button type="button" onClick={() => { dismiss(t.id); t.action.onClick(); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

/* "+3" pops at a screen point, drawn straight into the effects layer. */
export function popAt(layer, x, y, text, big) {
  if (!layer) return;
  const r = layer.getBoundingClientRect();
  const p = document.createElement('div');
  p.className = `pw-pop${big ? ' five' : ''}`; p.textContent = text;
  p.style.left = `${x - r.left}px`; p.style.top = `${y - r.top}px`;
  layer.appendChild(p);
  const done = () => p.remove();
  p.addEventListener('animationend', done);
  setTimeout(done, 1200);
}
