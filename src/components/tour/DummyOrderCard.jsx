import { Pencil, Trash2 } from 'lucide-react';

// Rendered only when the merchant has zero real orders yet (almost always true
// this early), for the duration of the tour steps that need an order card to
// point at. Not saved anywhere, inert on tap, clearly marked "Sample" so it's
// never mistaken for a real order.
export default function DummyOrderCard({ currency = 'SGD' }) {
  return (
    <div
      data-tour="order-card"
      style={{ position: 'relative', borderRadius: 16, border: '1px solid #e2e8f0', background: 'white', padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#f59e0b', color: 'white' }}>
        Sample
      </span>
      <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#0f172a' }}>#ORD-SAMPLE</p>
      <p style={{ margin: '2px 0 10px', fontSize: 12, color: '#64748b' }}>Table 1</p>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: '#334155' }}>2× Sample Latte</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{currency} 9.00</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ padding: '6px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Pencil className="w-3 h-3 text-slate-400" />
          </div>
          <div style={{ padding: '6px 10px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Trash2 className="w-3 h-3 text-red-400" />
          </div>
          <div data-tour="order-status-btn" style={{ padding: '6px 14px', borderRadius: 8, background: '#8b5cf6', color: 'white', fontSize: 12, fontWeight: 700 }}>
            Mark Ready
          </div>
        </div>
      </div>
    </div>
  );
}
