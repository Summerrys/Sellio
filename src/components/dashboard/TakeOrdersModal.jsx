import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '@/lib/supabaseClient';
import { X, UtensilsCrossed, ShoppingBag, Loader2, ChevronLeft } from 'lucide-react';

const STATUS_STYLES = {
  available: { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', label: 'Available' },
  occupied:  { bg: '#fef2f2', border: '#fecaca', text: '#ef4444', label: 'Occupied' },
  reserved:  { bg: '#fffbeb', border: '#fde68a', text: '#d97706', label: 'Reserved' },
  maintenance: { bg: '#f8fafc', border: '#e2e8f0', text: '#94a3b8', label: 'Maintenance' },
};

// Staff-facing "take an order on behalf of a customer" launcher. Deliberately
// reuses the exact same public storefront the customer-facing QR flow already
// uses (cart, checkout, everything) rather than building a parallel order-entry
// UI — the storefront just doesn't have a Dine-in/Takeaway/table picker built
// into it (it normally gets that context from which QR code was scanned), so
// this modal supplies that missing first step before handing off.
export default function TakeOrdersModal({ open, onClose, tenantId, tenantSlug }) {
  const navigate = useNavigate();
  const [step, setStep] = useState('type'); // 'type' | 'tables'
  const [tables, setTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(false);

  if (!open) return null;

  const reset = () => { setStep('type'); onClose(); };

  const handleTakeaway = () => {
    navigate(`/store/${tenantSlug}?staff=true`);
    reset();
  };

  const handleDineIn = async () => {
    setStep('tables');
    setLoadingTables(true);
    try {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('tables')
        .select('id, name, zone, status, capacity')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true });
      setTables(data || []);
    } finally {
      setLoadingTables(false);
    }
  };

  const handleSelectTable = (table) => {
    // Deliberately always starts a fresh order regardless of the table's current
    // status — a table left "Occupied" from a customer who scanned the QR, then
    // changed their mind and left, shouldn't block staff from using it.
    navigate(`/order/${tenantSlug}/${table.id}?staff=true`);
    reset();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 700, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.6)' }}
      onClick={reset}
    >
      <div
        style={{ background: '#f8fafc', borderRadius: '20px 20px 0 0', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px', background: 'white', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          {step === 'tables' && (
            <button onClick={() => setStep('type')} style={{ width: 32, height: 32, borderRadius: 8, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
          )}
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
              {step === 'type' ? 'Take an Order' : 'Select a Table'}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
              {step === 'type' ? "Ordering on a customer's behalf" : 'Any table can be used, even if occupied'}
            </p>
          </div>
          <button onClick={reset} style={{ width: 32, height: 32, borderRadius: 8, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {step === 'type' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={handleDineIn}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <UtensilsCrossed className="w-5 h-5" style={{ color: '#3b82f6' }} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Dine In</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Choose a table for this order</p>
                </div>
              </button>
              <button
                onClick={handleTakeaway}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ShoppingBag className="w-5 h-5" style={{ color: '#8b5cf6' }} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Takeaway</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>No table needed</p>
                </div>
              </button>
            </div>
          ) : loadingTables ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : tables.length === 0 ? (
            <p style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', padding: '32px 0' }}>No tables have been set up yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {tables.map(table => {
                const s = STATUS_STYLES[table.status] || STATUS_STYLES.available;
                return (
                  <button
                    key={table.id}
                    onClick={() => handleSelectTable(table)}
                    style={{ padding: 12, borderRadius: 14, border: `1px solid ${s.border}`, background: s.bg, cursor: 'pointer', textAlign: 'left' }}
                  >
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{table.name}</p>
                    {table.zone && <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>{table.zone}</p>}
                    <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 700, color: s.text }}>{s.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
