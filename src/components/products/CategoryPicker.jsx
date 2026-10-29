import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export const MAX_CATEGORY_LENGTH = 40;

// "  Kueh   salat " → "Kueh salat".
export const cleanCategoryName = (text) =>
  String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CATEGORY_LENGTH).trim();
export const sameCategoryName = (a, b) =>
  !!cleanCategoryName(a) && cleanCategoryName(a).toLowerCase() === cleanCategoryName(b).toLowerCase();

// Words to match on, singular: "Cakes" and "cake" match, and "Bread & buns" matches "bun".
const words = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/)
  .filter((w) => w.length > 2)
  .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));

// The shop's own category that a word in the listing's name points to, if any (no AI:
// "Pandan chiffon cake" → Cakes, "Kueh lapis (box of 10)" → Kueh).
export function suggestCategory(listingName, categories) {
  const nameWords = new Set(words(listingName));
  if (!nameWords.size) return null;
  return (categories || []).find((c) => words(c.name).some((w) => nameWords.has(w))) || null;
}

const PRIMARY = 'rgb(var(--color-primary, 59 130 246))';
const PRIMARY_TINT = 'rgb(var(--color-primary, 59 130 246) / 0.1)';

// The listing's category, beside SKU (skuColumn). Tap it for the shop's categories: find one,
// or type a new name and Add it (onNew; it's saved with the listing, so cancelling the
// listing leaves no category behind). A word in the listing's name can suggest one.
export default function CategoryPicker({
  skuColumn,
  categories = [],
  value = '', // the chosen category's id
  newName = '', // a new category, saved with the listing
  onPick, // (id) an existing category
  onNew, // (name) a new one
  canCreate = true, // may add categories (categories.create)
  listingName = '',
  error = null,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const panelRef = useRef(null);

  const chosen = categories.find((c) => c.id === value) || null;
  const label = newName || chosen?.name || '';
  const suggestion = !label ? suggestCategory(listingName, categories) : null;
  const typed = cleanCategoryName(query);
  const exact = typed ? categories.find((c) => sameCategoryName(c.name, typed)) : null;
  const shown = typed ? categories.filter((c) => c.name.toLowerCase().includes(typed.toLowerCase())) : categories;
  const noCategories = categories.length === 0;

  const close = () => { setOpen(false); setQuery(''); };
  const pick = (category) => { onPick(category.id); close(); };
  const add = () => {
    if (!typed) return;
    if (exact) { pick(exact); return; }
    if (!canCreate) return;
    onNew(typed);
    close();
  };

  // A tap anywhere else closes it.
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) close(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  // Opened: in view in the form (it scrolls).
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

  const rowClass = 'w-full h-11 rounded-lg px-2.5 flex items-center gap-2 text-left text-sm';
  return (
    <div ref={wrapRef}>
      <div className="grid grid-cols-2 gap-4">
        {skuColumn}
        <div className="min-w-0">
          <Label id="category-label" className="text-sm font-medium text-slate-700 mb-1 block">Category</Label>
          <button
            type="button"
            data-testid="category-trigger"
            aria-labelledby="category-label category-value"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => (open ? close() : setOpen(true))}
            className={cn(
              'w-full h-10 rounded-md border bg-transparent px-3 flex items-center gap-1.5 text-sm shadow-sm',
              error ? 'border-red-400' : 'border-input',
            )}
            style={open ? { borderColor: PRIMARY } : undefined}
          >
            <span id="category-value" className={cn('flex-1 min-w-0 truncate text-left', label ? 'text-slate-900' : 'text-slate-500')}>
              {label || 'Select category'}
            </span>
            {newName && (
              <span className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: PRIMARY_TINT, color: PRIMARY }}>New</span>
            )}
            <ChevronDown className="w-4 h-4 flex-shrink-0 text-slate-500" aria-hidden="true" />
          </button>
          {error ? (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          ) : newName ? (
            <p className="text-[11px] mt-1" style={{ color: PRIMARY }} data-testid="category-new-note">Saved to your categories with this listing</p>
          ) : suggestion && !open ? (
            <button
              type="button"
              data-testid="category-suggestion"
              aria-label={`Use the suggested category ${suggestion.name}`}
              onClick={() => onPick(suggestion.id)}
              className="mt-1.5 max-w-full h-7 px-2.5 rounded-full border border-dashed inline-flex items-center gap-1 text-xs font-semibold"
              style={{ borderColor: PRIMARY, color: PRIMARY, background: PRIMARY_TINT }}
            >
              <Plus className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{suggestion.name}</span>
            </button>
          ) : !label && noCategories && canCreate && !open ? (
            <p className="text-[11px] text-slate-500 mt-1">None yet. Tap to add one.</p>
          ) : null}
        </div>
      </div>

      {open && (
        <div ref={panelRef} role="dialog" aria-label="Choose or add a category" data-testid="category-panel" className="mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <div className="flex items-center gap-2 h-10 rounded-lg border border-slate-300 px-2.5">
            <Search className="w-4 h-4 flex-shrink-0 text-slate-500" aria-hidden="true" />
            <input
              data-testid="category-search"
              aria-label={canCreate ? 'Find or add a category' : 'Find a category'}
              value={query}
              maxLength={MAX_CATEGORY_LENGTH}
              // No categories yet: there's only typing to do, so the keyboard comes up at once.
              autoFocus={noCategories && canCreate}
              autoComplete="off"
              enterKeyHint="done"
              placeholder={noCategories ? 'Type a category, e.g. Cakes' : canCreate ? 'Find or add a category' : 'Find a category'}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); add(); }
                else if (e.key === 'Escape') { e.preventDefault(); close(); }
              }}
              className="flex-1 min-w-0 bg-transparent text-base md:text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {suggestion && !typed && (
            <>
              <p className="mt-2.5 mb-0.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">From the listing name</p>
              <button type="button" data-testid="category-suggested-row" onClick={() => pick(suggestion)} className={cn(rowClass, 'hover:bg-slate-50 text-slate-900')}>
                <span className="flex-1 truncate">{suggestion.name}</span>
              </button>
            </>
          )}

          {shown.length > 0 && (
            <>
              <p className="mt-2.5 mb-0.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your categories</p>
              <div className="max-h-60 overflow-y-auto">
                {shown.map((c) => {
                  const selected = c.id === value && !newName;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-testid="category-row"
                      aria-pressed={selected}
                      onClick={() => pick(c)}
                      className={cn(rowClass, selected ? 'font-semibold' : 'hover:bg-slate-50 text-slate-900')}
                      style={selected ? { background: PRIMARY_TINT, color: PRIMARY } : undefined}
                    >
                      <span className="flex-1 truncate">{c.name}</span>
                      {selected && <Check className="w-4 h-4 flex-shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {noCategories && !typed && (
            <p className="px-2 pt-2.5 pb-1 text-sm text-slate-500">
              {canCreate ? 'No categories yet. Type one to add it.' : 'This shop has no categories yet.'}
            </p>
          )}
          {typed && !exact && (canCreate ? (
            <button type="button" data-testid="category-add" onClick={add} className={cn(rowClass, 'mt-1.5 font-semibold')} style={{ background: PRIMARY_TINT, color: PRIMARY }}>
              <Plus className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">Add “{typed}”</span>
            </button>
          ) : shown.length === 0 && (
            <p className="px-2 pt-2.5 pb-1 text-sm text-slate-500">No category called “{typed}”.</p>
          ))}
        </div>
      )}
    </div>
  );
}
