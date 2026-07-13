import { Pencil, ImageIcon } from 'lucide-react';

// Rendered only when the merchant has zero real products yet, and only for the
// duration of the tour steps that need something to point at. Not saved
// anywhere — purely a visual stand-in styled to match a real product card, with
// a "Sample" ribbon so nobody mistakes it for actual data. Inert on tap.
export default function DummyProductCard({ currency = 'SGD' }) {
  return (
    <div
      data-tour="product-card"
      style={{ position: 'relative', borderRadius: 16, border: '1px solid #e2e8f0', background: 'white', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <span style={{ position: 'absolute', top: 8, left: 8, zIndex: 1, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#f59e0b', color: 'white' }}>
        Sample
      </span>
      <div style={{ height: 120, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ImageIcon className="w-8 h-8 text-slate-300" />
      </div>
      <div style={{ padding: 12 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Sample Cappuccino</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{currency} 4.50</span>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Pencil className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
