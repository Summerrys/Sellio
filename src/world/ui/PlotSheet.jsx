import React from 'react';
import { Sparkles, LogIn, UserPlus } from 'lucide-react';
import { Sheet, CloseButton, Coin } from './Sheet';

// An empty pitch, or a covered one before launch: what it is and what to do.
export function PlotSheet({ open, plot, viewer, minShops, liveCount, onClose, onAction }) {
  let title = 'This pitch is free', body, actions = [];
  if (plot?.kind === 'soon') {
    title = 'Opening soon';
    body = `A home seller is getting this stall ready. Pop-up Street opens when ${minShops} shops are live (${liveCount} so far).`;
  } else body = 'Every free Sellio shop gets a stall here, with a signboard you can style using coins.';
  if (viewer === 'guest') actions = [['join', 'Open a free shop', UserPlus, true], ['signin', 'Sign in', LogIn, false]];
  else if (viewer === 'shopper') actions = [['openShop', 'Open a free shop', Sparkles, true]];
  else if (viewer === 'owner-not-live') { body = "Your shop's stall appears here once your shop is live: save your selling settings and list at least one item."; actions = [['shopSetup', 'Finish my shop', Sparkles, true]]; }
  else if (viewer === 'owner') body = 'Your stall is already on the street. Invite another home seller to take this pitch.';
  return (
    <Sheet open={open} labelId="pw-plot-title">
      <div className="pw-head">
        <span className="pw-avatar" aria-hidden="true"><Sparkles size={22} /></span>
        <div className="pw-min0"><h2 id="pw-plot-title">{title}</h2></div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="pw-scroll"><p className="pw-tagline">{body}</p></div>
      {actions.length > 0 && (
        <div className="pw-actions">
          {actions.map(([key, label, Icon, primary]) => (
            <button key={key} type="button" className={primary ? 'pw-primary' : 'pw-ghost'} onClick={() => onAction(key)}><Icon size={18} aria-hidden="true" />{label}</button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// Shown when a signed-out visitor walks into a coin.
export function SignInSheet({ open, onClose, onAction }) {
  return (
    <Sheet open={open} labelId="pw-signin-title">
      <div className="pw-head">
        <span className="pw-avatar" aria-hidden="true"><Coin /></span>
        <div className="pw-min0"><h2 id="pw-signin-title">Sign in to collect coins</h2></div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="pw-scroll">
        <p className="pw-tagline">Sellio Coins are kept on your account. Sign in to pick them up, collect a daily reward, finish missions and, with your own free shop, style your stall.</p>
      </div>
      <div className="pw-actions">
        <button type="button" className="pw-primary" onClick={() => onAction('signin')}><LogIn size={18} aria-hidden="true" />Sign in</button>
        <button type="button" className="pw-ghost" onClick={() => onAction('join')}><UserPlus size={18} aria-hidden="true" />Create an account</button>
      </div>
    </Sheet>
  );
}
