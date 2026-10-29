import React, { useEffect, useMemo, useState } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { BRAND_COLOR, BRAND_GRADIENT, ItemImage, formatPrice } from './shared';
import {
  chooseLabel, combineChoices, isMultiChoice, isPicked, isRequiredChoice, missingChoices, normaliseVariants, pickOption,
} from '@/lib/itemOptions';
import { MAX_LINE_QUANTITY } from '@/lib/shopCart';

// Choosing an item's options (size, add-ons), a special request and how many, before
// it goes into the cart (mode 'cart') or straight to checkout (mode 'buy'). The same
// rules as the shop page's item screen (see itemOptions.js).
export default function ItemOptionsSheet({ open, mode, item, currency, image, onClose, onConfirm }) {
  const groups = useMemo(() => normaliseVariants(item?.variants, item?.price), [item]);
  const [picks, setPicks] = useState({});
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState(1);

  // Cleared as it closes (and opens), so it always opens with nothing picked.
  useEffect(() => {
    setPicks({});
    setNotes('');
    setQuantity(1);
  }, [open]);

  const variant = combineChoices(picks);
  const unit = (Number(item?.price) || 0) + (variant?.price_modifier || 0);
  const missing = missingChoices(groups, picks);
  const verb = mode === 'buy' ? 'Buy now' : 'Add to cart';

  const confirm = () => {
    if (missing.length) return;
    onConfirm({ variant, notes: notes.trim() || null, quantity });
  };

  const footer = (
    <button
      type="button"
      onClick={confirm}
      disabled={missing.length > 0}
      className="w-full h-[50px] rounded-[14px] text-[15px] font-bold disabled:cursor-default"
      style={missing.length ? { background: '#e2e8f0', color: '#475569' } : { background: BRAND_GRADIENT, color: '#fff' }}
    >
      {missing.length ? chooseLabel(missing[0]) : `${verb} · ${formatPrice(unit * quantity, currency)}`}
    </button>
  );

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="item-options-title" footer={footer}>
      <div className="flex items-start gap-3">
        <ItemImage src={image} name={item?.name} className="w-[72px] h-[72px] text-[28px] flex-shrink-0" rounded="rounded-xl" />
        <div className="min-w-0 flex-1">
          <p id="item-options-title" className="text-[15px] font-semibold text-slate-900 leading-snug line-clamp-2 break-words">{item?.name}</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{formatPrice(unit, currency)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mt-1.5 -mr-2.5 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-50 flex-shrink-0">
          <X className="w-[22px] h-[22px]" />
        </button>
      </div>

      {groups.map((group, gi) => {
        const multi = isMultiChoice(group);
        const required = isRequiredChoice(group);
        const name = String(group?.name || '').trim() || (multi ? 'Add-ons' : 'Options');
        const headingId = `item-option-group-${gi}`;
        return (
          <div key={gi} className="mt-4" role="group" aria-labelledby={headingId}>
            <p id={headingId} className="mb-2 text-sm font-bold text-slate-900">
              {name}{' '}
              <span className="text-xs font-medium text-slate-500">{multi ? 'Choose any' : required ? 'Choose 1 · Required' : 'Choose 1'}</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(group.options || []).map((option, oi) => {
                const on = isPicked(picks, groups, gi, option);
                const extra = Number(option.price_modifier) || 0;
                return (
                  <button
                    key={oi}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicks((prev) => pickOption(prev, groups, gi, option))}
                    className="min-h-[42px] px-2.5 py-2 rounded-[14px] text-[13px] leading-snug text-center break-words"
                    style={on
                      ? { border: `2px solid ${BRAND_COLOR}`, background: 'rgb(var(--color-primary, 59 130 246) / 0.08)', color: BRAND_COLOR, fontWeight: 700 }
                      : { border: '1.5px solid #e2e8f0', background: '#fff', color: '#334155', fontWeight: 500 }}
                  >
                    {option.label}{extra > 0 ? ` +${formatPrice(extra, currency)}` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="mt-4">
        <label htmlFor="item-special-request" className="block mb-2 text-sm font-bold text-slate-900">
          Special request <span className="text-xs font-medium text-slate-500">optional</span>
        </label>
        <textarea
          id="item-special-request"
          rows={2}
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. No onions, extra spicy"
          className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-slate-200 text-sm text-slate-900 resize-none outline-none focus:border-slate-400"
        />
      </div>

      <div className="mt-3.5 flex items-center justify-between">
        <span id="item-quantity-label" className="text-sm font-bold text-slate-900">Quantity</span>
        <div role="group" aria-labelledby="item-quantity-label" className="flex items-center h-10 rounded-full border border-slate-200">
          <button
            type="button"
            aria-label="One less"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            className="w-11 h-10 flex items-center justify-center text-slate-700 disabled:text-slate-300"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="min-w-[22px] text-center text-[15px] font-semibold text-slate-900" aria-live="polite">{quantity}</span>
          <button
            type="button"
            aria-label="One more"
            onClick={() => setQuantity((q) => Math.min(MAX_LINE_QUANTITY, q + 1))}
            disabled={quantity >= MAX_LINE_QUANTITY}
            className="w-11 h-10 flex items-center justify-center text-slate-700 disabled:text-slate-300"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
