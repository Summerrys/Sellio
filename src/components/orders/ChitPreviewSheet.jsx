import React from 'react';
import { Printer, Loader2 } from 'lucide-react';

const TYPE_LABELS = { dine_in: 'DINE IN', takeaway: 'TAKEAWAY', delivery: 'DELIVERY', pickup: 'PICKUP' };

// Bottom-sheet preview of the kitchen order chit — mirrors buildOrderChit()
// in printerUtils.js field-for-field (merchant name, big order number/table,
// order type, time, items with variants and flagged notes, NO prices), the
// same way the Receipt Preview sheet in Orders.jsx mirrors
// buildOrderReceipt(). Shared by Orders.jsx and KitchenDisplay.jsx so the
// two previews can't drift apart. Keep in sync with buildOrderChit() when
// chit content changes.
export default function ChitPreviewSheet({ order, merchantName, printing, onClose, onPrint }) {
  if (!order) return null;
  const t = order.order_type || order.type;
  const typeLabel = TYPE_LABELS[t] || (t ? String(t).toUpperCase() : '');
  const dash = { borderTop: '1px dashed #cbd5e1', margin: '10px 0' };
  return (
    <div
      // stopPropagation matters here: in Kitchen Display this sheet renders
      // inside the tap-to-expand order overlay, whose backdrop click closes
      // the whole overlay — without it, tapping the sheet backdrop would
      // close both layers at once.
      style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        style={{ background: '#f8fafc', borderRadius: '20px 20px 0 0', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', background: 'white', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Order Chit Preview</p>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#64748b' }}
          >✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
          <div style={{ background: 'white', borderRadius: 12, padding: '24px 20px', fontFamily: '"Courier New", Courier, monospace', fontSize: 12, color: '#0f172a', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', maxWidth: 360, margin: '0 auto' }}>
            <p style={{ textAlign: 'center', fontWeight: 600, fontSize: 13, margin: 0 }}>{merchantName || 'Order Chit'}</p>
            <div style={dash} />
            <p style={{ textAlign: 'center', fontWeight: 800, fontSize: 26, margin: '4px 0', letterSpacing: '0.02em' }}>#{order.order_number || order.id?.slice(-6)}</p>
            {order.table_name && (
              <p style={{ textAlign: 'center', fontWeight: 800, fontSize: 22, margin: '4px 0' }}>{order.table_name.toUpperCase()}</p>
            )}
            {typeLabel && (
              <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, margin: '4px 0' }}>{typeLabel}</p>
            )}
            <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, margin: '4px 0' }}>
              {new Date(order.created_date || Date.now()).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <div style={dash} />
            {(order.items || []).map((item, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{item.quantity}× {item.name || item.product_name}</p>
                {item.variant && <p style={{ margin: '2px 0 0 14px', color: '#475569', fontSize: 12 }}>({item.variant})</p>}
                {item.notes && <p style={{ margin: '2px 0 0 14px', fontWeight: 700, fontSize: 12 }}>*** {item.notes} ***</p>}
              </div>
            ))}
            {order.notes && (
              <>
                <div style={dash} />
                <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 12 }}>ORDER NOTE:</p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 12 }}>{order.notes}</p>
              </>
            )}
            <div style={dash} />
          </div>
        </div>
        <div style={{ padding: '12px 16px 28px', display: 'flex', gap: 8, background: 'white', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '13px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}
          >Close</button>
          <button
            onClick={onPrint}
            disabled={printing}
            style={{ flex: 2, padding: '13px', borderRadius: 10, border: 'none', background: printing ? '#e2e8f0' : 'var(--color-primary-gradient, rgb(var(--color-primary)))', fontSize: 13, fontWeight: 600, color: printing ? '#94a3b8' : 'white', cursor: printing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {printing
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</>
              : <><Printer size={14} /> Print Order</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
