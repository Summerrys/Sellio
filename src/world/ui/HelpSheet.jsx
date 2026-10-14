import React from 'react';
import { Sheet, CloseButton } from './Sheet';

function Switch({ checked, onChange, label }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="pw-switch" onClick={() => onChange(!checked)} />;
}

// How to play, plus the few settings a player may want.
export function HelpSheet({ open, onClose, themeChoice, onTheme, sound, onSound, saver, onSaver, signedIn, onReset }) {
  return (
    <Sheet open={open} labelId="pw-help-title">
      <div className="pw-head">
        <h2 id="pw-help-title">How Sellio World works</h2>
        <CloseButton onClick={onClose} />
      </div>
      <div className="pw-scroll">
        <dl className="pw-howto">
          <div><dt>Walk</dt><dd>Tap the ground and Mochi walks there. On a keyboard, use WASD or the arrow keys.</dd></div>
          <div><dt>Look around</dt><dd>Drag the map to look around, pinch or scroll to zoom, and drag with two fingers (or the right mouse button) to turn and tilt. The target button finds Mochi again.</dd></div>
          <div><dt>Hop</dt><dd>Step onto a pink Sellio Hop pad, or open Sellio Hop from the top bar, to jump between districts.</dd></div>
          <div><dt>Visit shops</dt><dd>Tap a storefront or a stall to see what they sell, then step inside their real Sellio storefront.</dd></div>
          <div><dt>Collect coins</dt><dd>{signedIn ? 'Walk over coins on Pop-up Street. New coins arrive every day, and a yellow arrow points to the nearest one.' : 'Sign in, then walk over coins on Pop-up Street. New coins arrive every day.'}</dd></div>
          <div><dt>Earn more</dt><dd>Your first storefront visit to a shop each day pays 2 coins (up to 5 shops a day). Collect the daily reward and finish missions for more.</dd></div>
          <div><dt>Style your stall</dt><dd>Free shop owners spend coins on awnings, signboards, lights and decor. Try an item on before you unlock it. The best items unlock as more buyers pay for your orders.</dd></div>
        </dl>
        <h3 className="pw-label">Settings</h3>
        <div className="pw-settings">
          <div className="pw-setting">
            <div><strong>Time of day</strong><small>Auto follows your clock: evening from 6:30pm.</small></div>
            <div className="pw-seg" role="group" aria-label="Time of day">
              {[['auto', 'Auto'], ['day', 'Day'], ['dusk', 'Evening']].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={themeChoice === k} onClick={() => onTheme(k)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="pw-setting">
            <div><strong>Sound effects</strong><small>Coin chimes and unlock fanfares.</small></div>
            <Switch checked={sound} onChange={onSound} label="Sound effects" />
          </div>
          <div className="pw-setting">
            <div><strong>Battery saver</strong><small>Lower resolution, 30 frames a second.</small></div>
            <Switch checked={saver} onChange={onSaver} label="Battery saver" />
          </div>
        </div>
        <p className="pw-note">Every coin is counted by Sellio's server, so your balance is the same on every device you sign in on.</p>
        {onReset && <div className="pw-actions" style={{ marginBottom: 8 }}><button type="button" className="pw-ghost" onClick={onReset}>Reset demo coins and unlocks</button></div>}
      </div>
    </Sheet>
  );
}
