import React, { useEffect, useRef } from 'react';
import { ArrowRight, Clock3, Eye, Coffee, Store, ShoppingBag, Flower2 } from 'lucide-react';

const ICONS = { fnb: Coffee, popup: Store, retail: ShoppingBag, services: Flower2 };

// The welcome screen: the whole island turning slowly behind a short welcome
// and one card per district. Live districts can be entered; the rest show
// what is coming.
export function Hub({ gone, state, error, districts, onEnter, onPeek, onRetry }) {
  const first = useRef(null);
  useEffect(() => {
    if (state === 'ready' && !gone && !window.matchMedia?.('(pointer: coarse)').matches) first.current?.focus({ preventScroll: true });
  }, [state, gone]);
  return (
    <div className={`pw-hub${gone ? ' gone' : ''}`} role="dialog" aria-labelledby="pw-hub-title" aria-hidden={gone} inert={gone ? '' : undefined}>
      <div className="pw-hub-top">
        <div className="pw-hub-brand"><span className="pw-mark" aria-hidden="true">S</span>Sellio World</div>
        <h1 id="pw-hub-title">{state === 'error' ? "The island didn't load" : 'Explore the island of Sellio shops'}</h1>
        <p>{state === 'error' ? (error || 'Check your connection and try again.')
          : 'Pick a district and step in. Walk the streets, visit real storefronts and collect Sellio Coins along the way.'}</p>
        {state === 'error' && <button type="button" className="pw-primary sm" onClick={onRetry}>Try again</button>}
      </div>
      {state !== 'error' && (
        <ul className="pw-hub-cards" aria-label="Districts">
          {districts.map((d, i) => (
            <li key={d.key}>
              <button type="button" ref={i === 0 ? first : undefined} className={`pw-dcard ${d.status}`}
                onClick={() => (d.status === 'soon' ? onPeek(d.key) : onEnter(d.key))} disabled={state !== 'ready'}
                aria-label={`${d.name}. ${d.note}. ${d.status === 'soon' ? 'Coming soon: look around' : 'Enter'}`}>
                <span className={`pw-dcard-art ${d.key}`} aria-hidden="true">{React.createElement(ICONS[d.key] || Store, { size: 22 })}</span>
                <span className="pw-dcard-body">
                  <strong>{d.name}</strong>
                  <small>{state === 'ready' ? d.note : 'Loading the island…'}</small>
                  <span className="pw-dcard-go" aria-hidden="true">
                    {d.status === 'soon' ? <><Eye size={15} />Look around</> : d.status === 'opening' ? <><Clock3 size={15} />Peek inside</> : <>Enter<ArrowRight size={15} /></>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A district's name across the top of the screen as you walk into it.
export function AreaTitle({ title, sub, show }) {
  return (
    <div className={`pw-area${show ? ' show' : ''}`} aria-live="polite">
      {title && <><strong>{title}</strong>{sub && <small>{sub}</small>}</>}
    </div>
  );
}
