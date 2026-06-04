import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { BellRing, X } from 'lucide-react';

export default function StockAdjustmentPanel({ open, onOpenChange, product, tenantId, onSuccess, onClose, initialThreshold }) {
  const queryClient = useQueryClient();

  const currentStock = product?.current_stock ?? product?.inventory?.[0]?.current_stock ?? product?.stock_quantity ?? 0;

  const [newStock, setNewStock] = useState(currentStock ?? 0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [threshold, setThreshold] = useState(initialThreshold ?? product?.low_stock_threshold ?? product?.inventory?.[0]?.low_stock_threshold ?? 5);

  useEffect(() => {
    setNewStock(currentStock ?? 0);
    setNotes('');
    setIsSubmitting(false);
    setThreshold(initialThreshold ?? product?.low_stock_threshold ?? product?.inventory?.[0]?.low_stock_threshold ?? 5);
  }, [currentStock, open, initialThreshold]);

  const handleClose = () => {
    onOpenChange(false);
    onClose?.();
  };

  const handleSubmit = async () => {
    if (newStock === currentStock && threshold === (initialThreshold ?? 5)) return;
    setIsSubmitting(true);
    try {
      const supabase = await getSupabase();
      const productId = product?.id;

      const { data: existing } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('product_id', productId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('inventory_items')
          .update({
            current_stock: newStock,
            low_stock_threshold: threshold,
            last_restock_date: new Date().toISOString(),
            updated_date: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .eq('tenant_id', tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('inventory_items')
          .insert({ tenant_id: tenantId, product_id: productId, current_stock: newStock, low_stock_threshold: threshold, unit: 'pcs', last_restock_date: new Date().toISOString() });
        if (error) throw error;
      }

      await supabase.from('products').update({ stock_quantity: newStock, low_stock_threshold: threshold, updated_date: new Date().toISOString() }).eq('id', productId).eq('tenant_id', tenantId);

      try {
        await supabase.from('stock_history').insert({
          tenant_id: tenantId,
          product_id: productId,
          product_name: product?.name || null,
          old_stock: currentStock,
          new_stock: newStock,
          change_amount: newStock - currentStock,
          notes: notes?.trim() || null,
          changed_by: (await supabase.auth.getUser())?.data?.user?.email || null,
        });
      } catch (historyErr) {
        console.warn('stock_history insert failed (non-fatal):', historyErr.message);
      }

      queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['inventoryLogs', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['stockHistory', tenantId] });

      onSuccess?.();
      handleClose();
    } catch (error) {
      console.error('Stock adjustment error:', error);
      alert(`Failed: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || !product) return null;

  const stockColor = newStock === 0 ? '#dc2626' : newStock < threshold ? '#f59e0b' : '#16a34a';
  const noChange = newStock === currentStock && threshold === (initialThreshold ?? 5);
  const stockIncreased = newStock > currentStock;
  const stockDecreased = newStock < currentStock;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={handleClose}
      />

      <style>{`
        @media (min-width: 640px) {
          .stock-panel-inner {
            bottom: auto !important;
            left: 50% !important;
            right: auto !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 100% !important;
            max-width: 480px !important;
            border-radius: 20px !important;
            max-height: 90vh !important;
          }
        }
      `}</style>

      {/* Panel — bottom sheet on mobile, centered modal on desktop */}
        <div
          className="stock-panel-inner fixed z-50 bg-white flex flex-col"
          style={{
            bottom: 0,
            left: 0,
            right: 0,
            borderRadius: '20px 20px 0 0',
            maxHeight: '92vh',
          }}
        >
          {/* Drag handle (mobile only) */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-slate-200" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-3">
              {product.image_url && (
                <img src={product.image_url} alt={product.name} style={{ width: '38px', height: '38px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div>
                <p className="font-bold text-sm text-slate-900">{product.name}</p>
                {product.sku && <p className="text-xs text-slate-400">{product.sku}</p>}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col items-center gap-6">

            {/* Main counter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <button
                onClick={() => setNewStock(prev => Math.max(0, prev - 1))}
                style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  border: '0.5px solid #e2e8f0',
                  background: newStock < currentStock ? '#fee2e2' : '#f8fafc',
                  fontSize: '28px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: newStock < currentStock ? '#dc2626' : '#6b7280',
                  transition: 'all 0.15s ease', flexShrink: 0,
                }}>
                −
              </button>

              <div style={{ textAlign: 'center', minWidth: '80px' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={newStock}
                  onChange={e => setNewStock(Math.max(0, parseInt(e.target.value) || 0))}
                  style={{
                    fontSize: '52px', fontWeight: '700', textAlign: 'center',
                    border: 'none', background: 'none', width: '120px',
                    color: stockColor,
                    outline: 'none', padding: 0,
                    WebkitAppearance: 'none', MozAppearance: 'textfield', appearance: 'none',
                  }}
                />
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0' }}>units</p>
              </div>

              <button
                onClick={() => setNewStock(prev => prev + 1)}
                style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  border: 'none',
                  background: newStock > currentStock ? '#dcfce7' : '#f8fafc',
                  fontSize: '28px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: newStock > currentStock ? '#16a34a' : '#6b7280',
                  transition: 'all 0.15s ease', flexShrink: 0,
                }}>
                +
              </button>
            </div>

            {/* Change indicator */}
            <div style={{ height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {newStock !== currentStock ? (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  background: newStock > currentStock ? '#dcfce7' : '#fee2e2',
                  borderRadius: '999px', padding: '4px 14px',
                }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: newStock > currentStock ? '#166534' : '#991b1b' }}>
                    {newStock > currentStock ? `+${newStock - currentStock}` : `−${currentStock - newStock}`}
                  </span>
                  <span style={{ fontSize: '12px', color: newStock > currentStock ? '#16a34a' : '#dc2626' }}>
                    from {currentStock}
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: '12px', color: '#6b7280' }}>No change</span>
              )}
            </div>

            {/* Quick shortcuts */}
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              {[
                { label: 'Reset', value: 0, color: '#dc2626', bg: '#fee2e2' },
                { label: '+5', value: currentStock + 5, color: '#166534', bg: '#dcfce7' },
                { label: '+10', value: currentStock + 10, color: '#166534', bg: '#dcfce7' },
                { label: '+20', value: currentStock + 20, color: '#166534', bg: '#dcfce7' },
              ].map(shortcut => (
                <button key={shortcut.label}
                  onClick={() => setNewStock(shortcut.value)}
                  style={{
                    flex: 1, padding: '8px 4px',
                    borderRadius: '10px', border: 'none',
                    background: newStock === shortcut.value ? shortcut.bg : '#f8fafc',
                    fontSize: '12px', fontWeight: '600',
                    color: newStock === shortcut.value ? shortcut.color : '#6b7280',
                    cursor: 'pointer', transition: 'all 0.15s ease'
                  }}>
                  {shortcut.label}
                </button>
              ))}
            </div>

            {/* Notes */}
            <div style={{ width: '100%' }}>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notes e.g. Weekly restock, damaged goods..."
                rows={2}
                style={{
                  width: '100%', borderRadius: '10px', fontSize: '13px', resize: 'none',
                  color: '#0f172a', padding: '10px 12px', border: '1px solid #e2e8f0',
                  background: '#f8fafc', outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Low stock threshold */}
            <div className="border-t border-slate-100 pt-4 w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BellRing className="w-4 h-4" style={{ color: 'rgb(var(--color-primary))' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'rgb(var(--color-primary))' }}>Low stock alert</p>
                    <p className="text-xs text-slate-400">Notify when stock falls below</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setThreshold(t => Math.max(0, t - 1))}
                    className="w-7 h-7 rounded-full border border-slate-200 text-slate-500 flex items-center justify-center text-sm">−</button>
                  <span className="w-8 text-center text-sm font-semibold text-slate-700">{threshold}</span>
                  <button onClick={() => setThreshold(t => t + 1)}
                    className="w-7 h-7 rounded-full border border-slate-200 text-slate-500 flex items-center justify-center text-sm">+</button>
                </div>
              </div>
            </div>

          </div>

          {/* Fixed footer save button */}
          <div className="px-6 pb-6 pt-3 border-t border-slate-100 flex-shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}>
            <button
              onClick={handleSubmit}
              disabled={noChange || isSubmitting}
              style={{
                width: '100%', padding: '15px',
                background: noChange ? '#e2e8f0' : stockDecreased ? '#dc2626' : 'var(--color-primary-gradient)',
                color: noChange ? '#94a3b8' : 'white',
                border: 'none', borderRadius: '14px',
                fontSize: '15px', fontWeight: '700',
                cursor: noChange ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}>
              {isSubmitting ? 'Saving...'
               : noChange ? 'No changes made'
               : stockIncreased ? `Save — add ${newStock - currentStock} units`
               : stockDecreased ? `Save — remove ${currentStock - newStock} units`
               : 'Save changes'}
            </button>
          </div>
        </div>
    </>
  );
}