import React, { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { Sheet, CloseButton, Coin, Bar } from './Sheet';
import { Swatch } from './Swatch';
import { RARITY, SLOT_LABELS } from '../engine/catalog';

const SLOTS = ['awning', 'sign', 'lights', 'decor'];

// Spend coins on the owner's stall. Tapping an item you don't own puts it on
// the stall to try; unlocking asks the server, which charges and equips it.
export function StylePanel({ open, stall, shopName, balance, busy, onClose, onPreview, onBuy, onEquip }) {
  const [slot, setSlot] = useState('awning');
  const [preview, setPreview] = useState(null);
  useEffect(() => { if (!open) { setPreview(null); setSlot('awning'); } }, [open]);
  useEffect(() => {
    if (!stall) return;
    onPreview(preview ? { ...stall.style, [preview.slot]: preview.code } : null);
  }, [preview, stall, onPreview]);

  const items = useMemo(() => (stall?.catalog || []).filter((c) => c.slot === slot), [stall, slot]);
  const lvl = stall?.stall_level;
  const pv = preview && stall?.catalog.find((c) => c.id === preview.id);
  const short = pv ? pv.price - balance : 0;

  function tap(item) {
    if (busy) return;
    if (item.owned) { setPreview(null); if (stall.style[item.slot] !== item.code) onEquip(item); return; }
    setPreview((p) => (p?.id === item.id ? null : { id: item.id, slot: item.slot, code: item.code }));
  }

  return (
    <Sheet open={open} labelId="pw-style-title" className="tall tryon">
      <div className="pw-head">
        <div className="pw-min0">
          <h2 id="pw-style-title">Style my stall</h2>
          <p className="pw-sub">{shopName} · tap an item to try it on</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="pw-balance">
        <span><Coin small /><b>{balance}</b> coins</span>
        {lvl && <span className="pw-lvl-tag">Stall level {lvl.level}</span>}
      </div>
      {lvl && (
        <div className="pw-level">
          <div className="pw-min0" style={{ flex: 1 }}>
            <div>
              {lvl.next_at != null
                ? `${lvl.buyers} of ${lvl.next_at} paying buyers for stall level ${lvl.level + 1}`
                : `${lvl.buyers} paying buyers · top level`}
            </div>
            {lvl.next_at != null && <div style={{ marginTop: 5 }}><Bar value={lvl.buyers} max={lvl.next_at} label="Progress to the next stall level" /></div>}
          </div>
        </div>
      )}
      <div className="pw-tabs" role="tablist" aria-label="Stall parts">
        {SLOTS.map((s) => (
          <button key={s} type="button" role="tab" id={`pw-tab-${s}`} className="pw-tab" aria-selected={slot === s}
            onClick={() => { setSlot(s); setPreview(null); }}>{SLOT_LABELS[s]}</button>
        ))}
      </div>
      <div className="pw-scroll">
        {!stall ? <p className="pw-note">Loading your stall…</p> : (
          <div className="pw-items" role="tabpanel" aria-labelledby={`pw-tab-${slot}`}>
            {items.map((item) => {
              const eq = stall.style[item.slot] === item.code;
              const isPv = preview?.id === item.id;
              const cls = eq ? 'is-equipped' : item.owned ? 'is-owned' : 'is-locked';
              const rar = RARITY[item.rarity] || RARITY.common;
              let meta;
              if (eq) meta = 'Equipped';
              else if (item.owned) meta = 'Owned · tap to use';
              else if (item.level_locked) meta = <><Lock size={13} aria-hidden="true" />Stall level {item.min_stall_level}</>;
              else meta = <><Lock size={13} aria-hidden="true" /><Coin small />{item.price}<span className="pw-sr"> coins</span></>;
              return (
                <button key={item.id} type="button" className={`pw-item ${cls}${isPv ? ' is-preview' : ''}`} aria-pressed={eq} onClick={() => tap(item)}>
                  {item.rarity !== 'starter' && <span className="pw-rarity" style={{ background: rar.color }}>{rar.label}</span>}
                  <Swatch slot={item.slot} code={item.code} />
                  <span className="nm">{item.name}</span>
                  <span className="meta">{meta}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {pv && (
        <div className="pw-buybar">
          <div className="pw-min0">
            <strong>{pv.name}</strong>
            <span>
              {pv.level_locked
                ? `Trying it on. Unlocks at stall level ${pv.min_stall_level}.`
                : short > 0 ? `Trying it on. You need ${short} more coin${short === 1 ? '' : 's'}.` : 'Trying it on. Unlock to keep it.'}
            </span>
          </div>
          <button type="button" className="pw-primary sm" disabled={busy || pv.level_locked || short > 0}
            onClick={() => onBuy(pv).then((ok) => { if (ok) setPreview(null); })}>
            {pv.level_locked ? `Level ${pv.min_stall_level}` : short > 0 ? `${pv.price} coins` : `Unlock for ${pv.price}`}
          </button>
        </div>
      )}
    </Sheet>
  );
}
