import React, { useEffect, useId, useRef, useState } from 'react';
import { Camera, MoreHorizontal, Sparkles, Check, X, ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppText } from '@/lib/appText';
import { useBackToClose } from '@/lib/useBackToClose';
import { formatMoney, currencyPrefix } from '@/lib/money';
import { typedPrice } from '@/lib/menuScan';
import NativeCameraScanControl from '@/components/ui-custom/NativeCameraScanControl';
import { PhotoCredit, PhotosFrom } from '@/components/ui-custom/PhotoCredit';
import PhotoPickerControl from '@/components/ui-custom/PhotoPickerControl';

// Scan Menu's review, redesigned (Alvin, 20 Nov 2026: the category squeezed beside the price, the
// AI should fill each item in as it does for a photo). Sections in the menu's order, each with
// Rename; a roomy row per item: its photo, its full name, its price, and its description, which
// the AI writes one by one (marked "AI draft") when the menu printed none. Tapping an item opens
// its editor (ScanItemSheet). The items are saved in the order shown (groupScanItems).

const AI = { text: '#6d28d9', dark: '#5b21b6', soft: '#f5f3ff', line: '#ede9fe', track: '#e4dcfb', bar: '#7c3aed' };
export const SCAN_REVIEW_CSS = `
@keyframes sellioScanRowIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
@keyframes sellioScanPulse { 0%, 100% { opacity: .45 } 50% { opacity: 1 } }
@keyframes sellioScanBlink { 50% { opacity: 0 } }
@keyframes sellioScanFade { from { opacity: 0 } to { opacity: 1 } }
.sellio-scan-row { animation: sellioScanRowIn .35s ease both }
.sellio-scan-pulse { animation: sellioScanPulse 1.2s ease-in-out infinite }
.sellio-scan-caret { display: inline-block; width: 1.5px; height: 14px; margin-left: 1px; background: ${AI.text}; vertical-align: -2px; animation: sellioScanBlink .9s steps(1) infinite }
.sellio-scan-fade { animation: sellioScanFade .4s ease }
@media (prefers-reduced-motion: reduce) { .sellio-scan-row, .sellio-scan-pulse, .sellio-scan-caret, .sellio-scan-fade { animation: none } }
`;

const sectionKey = (category) => String(category || '').trim().toLowerCase();

// The items in sections, in the order the sections first appear (the menu's), each section's
// items in their order: [{ key, name, items }]. Names differing only in capitals are one section.
export function groupScanItems(items) {
  const sections = [];
  const byKey = new Map();
  for (const item of items || []) {
    const key = sectionKey(item.category);
    let section = byKey.get(key);
    if (!section) {
      section = { key, name: String(item.category || '').trim(), items: [] };
      byKey.set(key, section);
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections;
}

// "AI draft": a description the AI wrote, for the shop to check.
export function AiDraftChip({ style }) {
  const { t } = useAppText();
  return (
    <span data-testid="ai-draft" style={{ display: 'inline-block', padding: '0 6px', borderRadius: 999, background: AI.soft, color: AI.text, fontSize: 11, lineHeight: '17px', fontWeight: 600, whiteSpace: 'nowrap', ...style }}>
      {t('AI draft')}
    </span>
  );
}

// Under the header while descriptions are written, then once they're done.
export function DescriptionsStrip({ progress, drafts, onStop, onRetry }) {
  const { t } = useAppText();
  if (progress.status === 'writing') {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div data-testid="scan-writing" role="status" aria-live="polite" style={{ padding: '10px 16px 12px 20px', background: AI.soft, borderBottom: `1px solid ${AI.line}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color={AI.text} aria-hidden="true" />
          <p style={{ margin: 0, flex: 1, fontSize: 13, lineHeight: '18px', fontWeight: 600, color: AI.dark }}>
            {t('Writing descriptions · {done} of {total}', { done: progress.done, total: progress.total })}
          </p>
          <button type="button" onClick={onStop} style={{ border: 'none', background: 'none', padding: '6px 4px', fontSize: 13, fontWeight: 600, color: AI.dark, cursor: 'pointer' }}>{t('Stop')}</button>
        </div>
        <div aria-hidden="true" style={{ marginTop: 8, height: 4, borderRadius: 2, background: AI.track, overflow: 'hidden' }}>
          <div style={{ height: 4, borderRadius: 2, background: AI.bar, width: `${pct}%`, transition: 'width .3s ease' }} />
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: '16px', color: AI.dark }}>{t('You can check items or add them now. Any still waiting stay blank.')}</p>
      </div>
    );
  }
  if (progress.status === 'failed') {
    return (
      <div data-testid="scan-writing-failed" role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 10px 20px', background: '#fffbeb', borderBottom: '1px solid #fde68a', flexShrink: 0 }}>
        <p style={{ margin: 0, flex: 1, fontSize: 12.5, lineHeight: '17px', color: '#92400e' }}>
          {progress.error} {t('Items without one stay blank.')}
        </p>
        <button type="button" onClick={onRetry} style={{ border: 'none', background: 'none', padding: '6px 4px', fontSize: 13, fontWeight: 600, color: '#92400e', cursor: 'pointer', flexShrink: 0 }}>{t('Try again')}</button>
      </div>
    );
  }
  if ((progress.status === 'done' || progress.status === 'stopped') && drafts > 0) {
    return (
      <div data-testid="scan-written" role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 12px 20px', background: '#f0fdf4', borderBottom: '1px solid #dcfce7', flexShrink: 0 }}>
        <Check size={16} color="#15803d" strokeWidth={2.4} aria-hidden="true" />
        <p style={{ margin: 0, fontSize: 13, lineHeight: '18px', fontWeight: 600, color: '#166534' }}>
          {drafts === 1 ? t('1 description written. Check it: it’s marked AI draft.') : t('{count} descriptions written. Check the ones marked AI draft.', { count: drafts })}
        </p>
      </div>
    );
  }
  return null;
}

// Under the descriptions' strip while sample photos are found, then once they're in.
export function PhotosStrip({ progress, samples, onStop }) {
  const { t } = useAppText();
  if (progress.status === 'finding') {
    return (
      <div data-testid="scan-finding-photos" role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 8px 20px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', flexShrink: 0 }}>
        <Camera size={15} color="#1d4ed8" aria-hidden="true" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: '18px', fontWeight: 600, color: '#1e40af' }}>{t('Finding sample photos · {done} of {total}', { done: progress.done, total: progress.total })}</p>
          <PhotosFrom style={{ color: '#1e40af' }} />
        </div>
        <button type="button" onClick={onStop} style={{ border: 'none', background: 'none', padding: '6px 4px', fontSize: 13, fontWeight: 600, color: '#1e40af', cursor: 'pointer' }}>{t('Stop')}</button>
      </div>
    );
  }
  if (progress.status === 'failed') {
    return (
      <div data-testid="scan-photos-failed" role="status" aria-live="polite" style={{ padding: '8px 16px 8px 20px', background: '#fffbeb', borderBottom: '1px solid #fde68a', fontSize: 12.5, lineHeight: '17px', color: '#92400e', flexShrink: 0 }}>
        {t('Sample photos stopped: {reason}', { reason: progress.error })}
      </div>
    );
  }
  if ((progress.status === 'done' || progress.status === 'stopped') && samples > 0) {
    return (
      <div data-testid="scan-photos-added" role="status" aria-live="polite" style={{ padding: '8px 16px 8px 20px', background: '#f0fdf4', borderBottom: '1px solid #dcfce7', fontSize: 12.5, lineHeight: '17px', color: '#166534', flexShrink: 0 }}>
        {samples === 1 ? t('1 sample photo added. Customers see it marked “Sample photo”, with the photographer’s credit.') : t('{count} sample photos added. Customers see each marked “Sample photo”, with the photographer’s credit.', { count: samples })}
        <PhotosFrom style={{ color: '#166534' }} />
      </div>
    );
  }
  return null;
}

function PriceButton({ item, currency, pricesAsked, onClick, size = 'row' }) {
  const { t } = useAppText();
  const price = typedPrice(item.price);
  const missing = item._selected && price == null;
  const name = item.name || t('this item');
  return (
    <button
      type="button"
      data-testid="scan-item-price"
      data-missing={missing ? 'yes' : 'no'}
      onClick={onClick}
      aria-label={price == null ? t('Add a price for {name}', { name }) : t('Price of {name}: {price}', { name, price: formatMoney(price, currency) })}
      style={{
        border: price == null ? `1.5px ${missing && pricesAsked ? 'solid #ef4444' : 'dashed #f59e0b'}` : '1px solid #e2e8f0',
        background: price == null ? '#fffbeb' : '#ffffff',
        borderRadius: 8, padding: size === 'row' ? '3px 9px' : '6px 12px', fontSize: 14, lineHeight: '20px', fontWeight: 700,
        color: price == null ? '#92400e' : 'rgb(var(--color-primary))', cursor: 'pointer',
      }}
    >
      {price == null ? t('Add price') : formatMoney(price, currency)}
    </button>
  );
}

function ItemDescription({ item, onAdd }) {
  const { t } = useAppText();
  if (item._desc === 'waiting') {
    return (
      <div className="sellio-scan-pulse" data-testid="scan-item-waiting" aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
        <div style={{ height: 9, width: '86%', borderRadius: 5, background: '#e9eef5' }} />
        <div style={{ height: 9, width: '52%', borderRadius: 5, background: '#e9eef5' }} />
      </div>
    );
  }
  if (item._desc === 'writing') {
    return (
      <p data-testid="scan-item-writing" style={{ margin: 0, fontSize: 13, lineHeight: '18px', color: '#475569' }}>
        <span style={{ display: 'inline-block', marginRight: 6, padding: '0 6px', borderRadius: 999, background: AI.soft, color: AI.text, fontSize: 11, lineHeight: '17px', fontWeight: 600 }}>{t('Writing…')}</span>
        {item._typed}
        <span className="sellio-scan-caret" aria-hidden="true" />
      </p>
    );
  }
  if (item.description) {
    return (
      <p data-testid="scan-item-description" className={item._desc === 'done' ? 'sellio-scan-fade' : undefined} style={{ margin: 0, fontSize: 13, lineHeight: '18px', color: '#475569', overflowWrap: 'anywhere' }}>
        {item.description}
        {item._desc === 'done' && <> <AiDraftChip style={{ marginLeft: 2, verticalAlign: 1 }} /></>}
      </p>
    );
  }
  return (
    <button type="button" onClick={onAdd} style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: '2px 0', fontSize: 13, lineHeight: '18px', color: '#64748b', cursor: 'pointer' }}>
      {t('+ Add a description')}
    </button>
  );
}

function optionsText(variants) {
  const money = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return (variants || []).map((group) => `${group.name}: ${group.options.map((o) => (o.price_modifier > 0 ? `${o.label} +${money(Number(o.price_modifier))}` : o.label)).join(' / ')}`).join(' · ');
}

function PhotoTile({ item, size, canEdit, onClick, label, testId = 'scan-item-photo' }) {
  const { t } = useAppText();
  const fromMenu = !!(item.picture && (item.picture.rect || item.picture.fromMenu));
  const badge = fromMenu ? t('Menu') : item.picture?.sample ? t('Sample') : null;
  if (!item.picture && item._photo === 'waiting') {
    return <div className="sellio-scan-pulse" data-testid="scan-photo-waiting" aria-hidden="true" style={{ width: size, height: size, borderRadius: size > 80 ? 14 : 12, background: '#e9eef5', flexShrink: 0 }} />;
  }
  if (item.picture) {
    return (
      <button type="button" data-testid={testId} aria-label={label} disabled={!canEdit} onClick={onClick}
        style={{ position: 'relative', width: size, height: size, padding: 0, border: 'none', borderRadius: size > 80 ? 14 : 12, overflow: 'hidden', flexShrink: 0, cursor: canEdit ? 'pointer' : 'default', background: '#f1f5f9' }}>
        {/* A sample shows Pixabay's 640 px address here, while choosing; the product keeps the shop's own copy, made when it's saved. */}
        <img src={item.picture.sample?.thumb || item.picture.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {badge && <span style={{ position: 'absolute', left: 4, bottom: 4, padding: '1px 5px', borderRadius: 6, background: 'rgba(15,23,42,.78)', color: '#ffffff', fontSize: 10, lineHeight: '14px', fontWeight: 600 }}>{badge}</span>}
      </button>
    );
  }
  return (
    <button type="button" data-testid={testId} aria-label={label} disabled={!canEdit} onClick={onClick}
      style={{ width: size, height: size, padding: 0, border: '1.5px dashed #cbd5e1', borderRadius: size > 80 ? 14 : 12, background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0, cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : 0.6 }}>
      {canEdit ? <Camera size={size > 80 ? 24 : 20} color="#64748b" strokeWidth={1.8} aria-hidden="true" /> : <ImageIcon size={18} color="#94a3b8" aria-hidden="true" />}
      <span style={{ fontSize: size > 80 ? 12 : 10, lineHeight: '12px', fontWeight: 600, color: '#64748b' }}>{size > 80 ? t('No photo yet') : t('Photo')}</span>
    </button>
  );
}

function SectionHeader({ section, onRename }) {
  const { t } = useAppText();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(section.name);
  const inputRef = useRef(null);
  useEffect(() => { if (renaming) inputRef.current?.focus(); }, [renaming]);
  const title = section.name || t('No section');
  const save = (event) => {
    event?.preventDefault();
    const next = name.replace(/\s+/g, ' ').trim();
    if (next && next !== section.name) onRename(section.key, next);
    setRenaming(false);
  };
  return (
    <div data-testid="scan-section" style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, boxSizing: 'border-box', padding: '4px 12px 4px 20px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
      {renaming ? (
        <form onSubmit={save} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} aria-label={t('Section name')} maxLength={60}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setName(section.name); setRenaming(false); } }}
            style={{ flex: 1, minWidth: 0, height: 36, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 8, padding: '0 10px', fontSize: 14, fontWeight: 600, color: '#0f172a' }} />
          <button type="submit" style={{ height: 36, border: 'none', borderRadius: 8, padding: '0 12px', background: 'rgb(var(--color-primary))', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('Save')}</button>
          <button type="button" onClick={() => { setName(section.name); setRenaming(false); }} aria-label={t('Cancel')} style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
        </form>
      ) : (
        <>
          <h3 style={{ margin: 0, minWidth: 0, fontSize: 12, lineHeight: '16px', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#475569', overflowWrap: 'anywhere' }}>{title}</h3>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{section.items.length}</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => { setName(section.name); setRenaming(true); }} aria-label={t('Rename {section}', { section: title })}
            style={{ border: 'none', background: 'none', padding: '8px 6px', fontSize: 12.5, fontWeight: 600, color: 'rgb(var(--color-primary))', cursor: 'pointer' }}>{t('Rename')}</button>
        </>
      )}
    </div>
  );
}

// The review's list: sections, each with its items.
export function ScanReviewList({ items, currency, pricesAsked, canEditPhoto, onToggle, onOpen, onPhoto, onRename }) {
  const { t } = useAppText();
  const sections = groupScanItems(items);
  let index = 0;
  return (
    <div>
      {sections.map((section) => (
        <div key={section.key || '(none)'} data-testid="scan-review-section">
          <SectionHeader section={section} onRename={onRename} />
          {section.items.map((item) => {
            const name = item.name || t('this item');
            const delay = Math.min(index++, 20) * 35;
            return (
              <div key={item._id} data-testid="scan-item" className="sellio-scan-row"
                style={{ animationDelay: `${delay}ms`, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 4px 12px 8px', borderBottom: '1px solid #f1f5f9', background: item._selected ? '#ffffff' : '#f8fafc' }}>
                <label style={{ width: 32, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
                  <input type="checkbox" checked={item._selected} onChange={() => onToggle(item._id)} aria-label={t('Add {name}', { name })}
                    style={{ width: 18, height: 18, margin: 0, accentColor: 'rgb(var(--color-primary))', cursor: 'pointer' }} />
                </label>
                <PhotoTile item={item} size={64} canEdit={canEditPhoto(item)} onClick={() => onPhoto(item._id)} label={t('Photo for {name}', { name })} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, opacity: item._selected ? 1 : 0.6 }}>
                  <button type="button" onClick={() => onOpen(item._id)} style={{ textAlign: 'left', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
                    <span data-testid="scan-item-name" style={{ display: 'block', fontSize: 15, lineHeight: '20px', fontWeight: 600, color: item.name ? '#0f172a' : '#94a3b8', overflowWrap: 'anywhere' }}>{item.name || t('No name')}</span>
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PriceButton item={item} currency={currency} pricesAsked={pricesAsked} onClick={() => onOpen(item._id, 'price')} />
                  </div>
                  <ItemDescription item={item} onAdd={() => onOpen(item._id, 'description')} />
                  {item.variants?.length > 0 && (
                    <p data-testid="scan-item-options" style={{ margin: 0, fontSize: 12, lineHeight: '16px', color: '#64748b' }}>{optionsText(item.variants)}</p>
                  )}
                </div>
                <button type="button" onClick={() => onOpen(item._id)} aria-label={t('Edit {name}', { name })}
                  style={{ width: 44, height: 44, border: 'none', background: 'none', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', color: '#64748b' }}>
                  <MoreHorizontal size={20} />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const FIELD_LABEL = { fontSize: 13, lineHeight: '18px', fontWeight: 600, color: '#334155' };
const FIELD = { height: 44, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 10, padding: '0 12px', fontSize: 15, color: '#0f172a', background: '#ffffff', width: '100%' };
const PHOTO_OPTION = { height: 36, boxSizing: 'border-box', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff', fontSize: 13, fontWeight: 600, color: '#334155', textAlign: 'left', padding: '0 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%' };

// One item's editor (screen 3): photo, name, price, section, description (Rewrite asks the AI
// again), and Remove from scan. Changes apply as they're made; Done or Back closes it.
export function ScanItemSheet({ item, items, currency, pricesAsked, focus, hasMenuPhoto, rewriting, onChange, onDescription, onRewrite, onPhotoFile, onEditPhoto, onBoxOnMenu, onRemovePhoto, onUseSample, onFindSamples, onRemove, onClose }) {
  const { t } = useAppText();
  const ids = useId();
  const titleId = `${ids}-title`;
  const priceRef = useRef(null);
  const nameRef = useRef(null);
  const descRef = useRef(null);
  useBackToClose(true, onClose);
  useEffect(() => {
    const target = focus === 'price' ? priceRef.current : focus === 'description' ? descRef.current : nameRef.current;
    target?.focus();
  }, [focus]);
  const sections = groupScanItems(items);
  const section = sections.find((s) => s.key === sectionKey(item.category)) || { name: item.category || '', items: [item] };
  const position = section.items.findIndex((i) => i._id === item._id) + 1;
  const sectionTitle = section.name || t('No section');
  const price = typedPrice(item.price);
  const missing = item._selected && price == null;
  const name = item.name || t('this item');
  const pick = (file) => onPhotoFile(file);
  return (
    <div data-pull-refresh-block onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      style={{ position: 'fixed', inset: 0, zIndex: 10, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(15,23,42,0.45)' }}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="scan-edit" onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: '#ffffff', borderRadius: '20px 20px 0 0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 12px 12px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={titleId} style={{ margin: 0, fontSize: 16, lineHeight: '20px', fontWeight: 700, color: '#0f172a' }}>{t('Edit item')}</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, lineHeight: '17px', color: '#64748b' }}>{t('{position} of {count} in {section}', { position, count: section.items.length, section: sectionTitle })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('Close')} style={{ width: 44, height: 44, border: 'none', background: 'none', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, ...FIELD_LABEL }}>{t('Photo')}</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <PhotoTile item={item} size={112} canEdit={!item.picture?.sample && (hasMenuPhoto || !!item.picture)} onClick={onEditPhoto} label={t('Photo for {name}', { name })} testId="scan-edit-photo" />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <NativeCameraScanControl label={t('Take a photo')} action={t('Take a photo')} onFile={pick} onError={(message) => toast.message(message)} style={PHOTO_OPTION}>{t('Take a photo')}</NativeCameraScanControl>
                <PhotoPickerControl label={t('Choose from phone')} onFile={pick} style={PHOTO_OPTION}>{t('Choose from phone')}</PhotoPickerControl>
                {hasMenuPhoto && <button type="button" onClick={onBoxOnMenu} style={PHOTO_OPTION}>{t('Box it on the menu photo')}</button>}
                {!item.samples?.length && item._photo !== 'waiting' && <button type="button" onClick={onFindSamples} disabled={!item.name?.trim()} style={PHOTO_OPTION}>{t('Find sample photos')}</button>}
                {item.picture && <button type="button" onClick={onRemovePhoto} style={{ ...PHOTO_OPTION, color: '#b91c1c' }}>{t('Remove photo')}</button>}
              </div>
            </div>
            {(item.samples?.length > 0 || item._photo === 'waiting') && (
              <div data-testid="scan-samples" style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, ...FIELD_LABEL }}>{t('Sample photos')}</p>
                {item._photo === 'waiting' ? (
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{t('Finding sample photos…')}</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
                    {item.samples.map((photo, i) => {
                      const chosen = item.picture?.url === photo.url;
                      return (
                        <button key={photo.id || photo.url} type="button" onClick={() => onUseSample(photo)} aria-pressed={chosen} aria-label={t('Use sample photo {number}', { number: i + 1 })}
                          style={{ aspectRatio: '1', padding: 0, borderRadius: 10, overflow: 'hidden', border: chosen ? '2px solid rgb(var(--color-primary))' : '1px solid #e2e8f0', background: '#f1f5f9', cursor: 'pointer' }}>
                          <img src={photo.thumb} alt={photo.alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        </button>
                      );
                    })}
                  </div>
                )}
                <PhotosFrom />
                {item.picture?.sample && <PhotoCredit credit={item.picture.sample.credit} />}
                <p style={{ margin: 0, fontSize: 12, lineHeight: '17px', color: '#475569' }}>{t('A sample shows a similar dish, not yours. Customers see it marked “Sample photo”, with the photographer’s credit.')}</p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor={`${ids}-name`} style={FIELD_LABEL}>{t('Name')}</label>
            <input ref={nameRef} id={`${ids}-name`} value={item.name} onChange={(e) => onChange('name', e.target.value)} placeholder={t('Product name')} style={{ ...FIELD, fontWeight: 600 }} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 128, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor={`${ids}-price`} style={FIELD_LABEL}>{t('Price ({currency})', { currency: currencyPrefix(currency).trim() })}</label>
              <input ref={priceRef} id={`${ids}-price`} data-testid="scan-edit-price" inputMode="decimal" value={item.price} placeholder={t('Add price')}
                aria-invalid={missing && pricesAsked ? 'true' : undefined}
                onChange={(e) => onChange('price', e.target.value)}
                style={{ ...FIELD, fontWeight: 700, color: 'rgb(var(--color-primary))', border: `1px solid ${missing ? (pricesAsked ? '#ef4444' : '#f59e0b') : '#cbd5e1'}`, background: missing ? '#fffbeb' : '#ffffff' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor={`${ids}-section`} style={FIELD_LABEL}>{t('Section')}</label>
              <select id={`${ids}-section`} value={sectionKey(item.category)} onChange={(e) => onChange('category', sections.find((s) => s.key === e.target.value)?.name ?? '')}
                style={{ ...FIELD, fontSize: 14, padding: '0 8px 0 10px' }}>
                {sections.map((s) => <option key={s.key || '(none)'} value={s.key}>{s.name || t('No section')}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label htmlFor={`${ids}-desc`} style={FIELD_LABEL}>{t('Description')}</label>
              {item._desc === 'done' && <AiDraftChip />}
              <span style={{ flex: 1 }} />
              <button type="button" onClick={onRewrite} disabled={rewriting || !item.name?.trim()}
                style={{ border: 'none', background: 'none', padding: '6px 2px', fontSize: 13, fontWeight: 600, color: AI.text, display: 'flex', alignItems: 'center', gap: 4, cursor: rewriting ? 'default' : 'pointer', opacity: !item.name?.trim() ? 0.5 : 1 }}>
                {rewriting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
                {rewriting ? t('Writing…') : item.description ? t('Rewrite') : t('Write one')}
              </button>
            </div>
            <textarea ref={descRef} id={`${ids}-desc`} rows={3} value={item._desc === 'writing' ? (item._typed || '') : (item.description || '')} onChange={(e) => onDescription(e.target.value)}
              placeholder={t('Description (optional)')}
              style={{ boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 10, padding: '10px 12px', fontSize: 14, lineHeight: '20px', color: '#334155', resize: 'none', width: '100%', fontFamily: 'inherit' }} />
          </div>

          {item.variants?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <p style={{ margin: 0, ...FIELD_LABEL }}>{t('Options')}</p>
              <p style={{ margin: 0, fontSize: 13, lineHeight: '18px', color: '#475569' }}>{optionsText(item.variants)}</p>
              <p style={{ margin: 0, fontSize: 12, lineHeight: '16px', color: '#64748b' }}>{t('You can change options after adding, in the product’s editor.')}</p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
          <button type="button" onClick={onRemove} style={{ border: 'none', background: 'none', padding: '12px 4px', fontSize: 14, fontWeight: 600, color: '#b91c1c', cursor: 'pointer' }}>{t('Remove from scan')}</button>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{ height: 48, minWidth: 140, borderRadius: 12, border: 'none', background: 'var(--color-primary-gradient)', fontSize: 15, fontWeight: 700, color: '#ffffff', cursor: 'pointer' }}>{t('Done')}</button>
        </div>
      </section>
    </div>
  );
}
