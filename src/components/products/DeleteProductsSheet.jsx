import React from 'react';
import { Trash2 } from 'lucide-react';
import { useAppText } from '@/lib/appText';
import { useBackToClose } from '@/lib/useBackToClose';

// Before deleting what's selected (Alvin, 20 Nov 2026): what goes and what stays. Deleting a
// product takes its stock count (inventory_items) and its likes with it; past orders keep their
// own copy of each item's name and price (order_items, orders.items). Hiding instead keeps the
// item, off the menu (is_active false), for whoever may edit products.
export default function DeleteProductsSheet({ open, products = [], isListings = false, words, canHide = false, busy = false, onCancel, onDelete, onHide }) {
  const { t } = useAppText();
  useBackToClose(open, () => { if (!busy) onCancel?.(); });
  if (!open || !products.length) return null;
  const count = products.length;
  const [first, second] = products.map((p) => p.name || '');
  let body;
  if (count === 1) {
    body = isListings
      ? t('{name} will come off your shop and Explore, with its stock count.', { name: first })
      : t('{name} will come off your menu, the Counter and your storefront, with its stock count.', { name: first });
  } else if (count === 2) {
    body = isListings
      ? t('{first} and {second} will come off your shop and Explore, with their stock counts.', { first, second })
      : t('{first} and {second} will come off your menu, the Counter and your storefront, with their stock counts.', { first, second });
  } else {
    body = isListings
      ? t('These {count} listings will come off your shop and Explore, with their stock counts.', { count })
      : t('These {count} products will come off your menu, the Counter and your storefront, with their stock counts.', { count });
  }
  const close = () => { if (!busy) onCancel?.(); };
  return (
    <div
      data-pull-refresh-block
      onClick={close}
      onKeyDown={(event) => { if (event.key === 'Escape') close(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 210, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(15,23,42,0.5)' }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-products-title"
        aria-describedby="delete-products-body"
        data-testid="delete-sheet"
        onClick={(event) => event.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, boxSizing: 'border-box', background: '#ffffff', borderRadius: '20px 20px 0 0', padding: '10px 20px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div aria-hidden="true" style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, background: '#cbd5e1' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Trash2 size={22} color="#dc2626" aria-hidden="true" />
          </div>
          <h2 id="delete-products-title" style={{ margin: 0, fontSize: 19, lineHeight: '25px', fontWeight: 800, color: '#0f172a', overflowWrap: 'anywhere' }}>
            {count === 1 ? t('Delete {name}?', { name: first }) : t('Delete {count} {products}?', { count, products: words?.products || t('products') })}
          </h2>
        </div>
        <div id="delete-products-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: '21px', color: '#334155', overflowWrap: 'anywhere' }}>{body}</p>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: '21px', color: '#334155' }}>{t('Past orders keep their names and prices. This can’t be undone.')}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" autoFocus disabled={busy} onClick={close} style={{ flex: 1, height: 50, borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', fontSize: 15, fontWeight: 600, color: '#334155', cursor: busy ? 'default' : 'pointer' }}>
            {t('Cancel')}
          </button>
          <button type="button" disabled={busy} onClick={onDelete} style={{ flex: 1.4, height: 50, borderRadius: 12, border: 'none', background: busy ? '#f87171' : '#dc2626', fontSize: 15, fontWeight: 700, color: '#ffffff', cursor: busy ? 'default' : 'pointer' }}>
            {busy ? t('Deleting…') : count === 1 ? t('Delete') : t('Delete {count}', { count })}
          </button>
        </div>
        {canHide && (
          <button type="button" disabled={busy} onClick={onHide} style={{ alignSelf: 'center', minHeight: 44, border: 'none', background: 'none', padding: '0 8px', fontSize: 14, fontWeight: 600, color: 'rgb(var(--color-primary))', cursor: busy ? 'default' : 'pointer' }}>
            {count === 1 ? t('Hide it instead') : t('Hide them instead')}
          </button>
        )}
      </section>
    </div>
  );
}
