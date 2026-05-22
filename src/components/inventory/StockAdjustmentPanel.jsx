import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useTenant } from '../tenant/TenantContext';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { toast } from 'sonner';

const ADJUSTMENT_TYPES = [
  { value: 'restock',    label: 'Restock',    desc: 'Add stock',  color: '#16a34a', bg: '#dcfce7', icon: '+' },
  { value: 'sale',       label: 'Sale / Used', desc: 'Reduce stock', color: '#2563eb', bg: '#dbeafe', icon: '−' },
  { value: 'waste',      label: 'Damaged',    desc: 'Write off',  color: '#dc2626', bg: '#fee2e2', icon: '!' },
  { value: 'adjustment', label: 'Correction', desc: 'Fix count',  color: '#7c3aed', bg: '#ede9fe', icon: '✎' },
];

export default function StockAdjustmentPanel({ open, onOpenChange, product, tenantId }) {
  const queryClient = useQueryClient();
  const { user } = useTenant();
  const [adjustmentType, setAdjustmentType] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [notes, setNotes] = useState('');

  const currentStock = product?.stock_quantity || 0;
  const threshold = product?.low_stock_threshold ?? 5;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const newStock = adjustmentType === 'restock'
    ? currentStock + quantity
    : currentStock - quantity;

  const handleSubmit = async () => {
    if (!adjustmentType || quantity <= 0) return;
    setIsSubmitting(true);
    try {
      const quantityChange = adjustmentType === 'restock' || adjustmentType === 'adjustment'
        ? quantity
        : -Math.abs(quantity);
      const finalStock = Math.max(0, currentStock + quantityChange);

      const { error: productError } = await supabase
        .from('products')
        .update({ stock_quantity: finalStock })
        .eq('id', product.id);
      if (productError) throw productError;

      queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['inventoryLogs', tenantId] });
      toast.success('Stock updated successfully');
      onOpenChange(false);
      setAdjustmentType('');
      setQuantity(0);
      setNotes('');
    } catch (error) {
      console.error('Stock adjustment error:', error);
      toast.error(`Failed to update stock: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!product) return null;

  const canSubmit = adjustmentType && quantity > 0 && !isSubmitting;

  const buttonLabel = isSubmitting
    ? 'Saving...'
    : !adjustmentType
      ? 'Select adjustment type'
      : quantity <= 0
        ? 'Enter quantity'
        : `${adjustmentType === 'restock' ? '+ Add' : '− Remove'} ${quantity} units`;

  return (
    <Sheet open={open} onOpenChange={(val) => {
      if (!val) {
        setAdjustmentType('');
        setQuantity(0);
        setNotes('');
      }
      onOpenChange(val);
    }}>
      <SheetContent side="bottom" className="p-0 rounded-t-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {product.image_url && (
              <img src={product.image_url} alt={product.name} style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover' }} />
            )}
            <div>
              <p style={{ fontWeight: '700', fontSize: '15px', margin: 0, color: '#0f172a' }}>{product.name}</p>
              {product.sku && <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>{product.sku}</p>}
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '20px', padding: '4px', lineHeight: 1 }}
          >✕</button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Current / After stock */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: '12px', padding: '14px 16px' }}>
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 2px' }}>Current stock</p>
              <p style={{ fontSize: '28px', fontWeight: '700', margin: 0, color: '#0f172a' }}>{currentStock}</p>
            </div>
            {adjustmentType && quantity > 0 && (
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 2px' }}>After adjustment</p>
                <p style={{ fontSize: '28px', fontWeight: '700', margin: 0, color: newStock < 0 ? '#dc2626' : newStock < threshold ? '#f59e0b' : '#16a34a' }}>
                  {Math.max(0, newStock)}
                </p>
              </div>
            )}
          </div>

          {/* Adjustment type pills */}
          <div>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Adjustment type</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {ADJUSTMENT_TYPES.map(type => (
                <button key={type.value} onClick={() => setAdjustmentType(type.value)}
                  style={{
                    padding: '12px 10px', borderRadius: '12px', cursor: 'pointer',
                    border: adjustmentType === type.value ? `2px solid ${type.color}` : '1px solid #e2e8f0',
                    background: adjustmentType === type.value ? type.bg : 'white',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    transition: 'all 0.15s ease'
                  }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: adjustmentType === type.value ? type.color : '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', color: adjustmentType === type.value ? 'white' : '#6b7280',
                    fontWeight: '700'
                  }}>
                    {type.icon}
                  </div>
                  <p style={{ fontSize: '12px', fontWeight: '600', margin: 0, color: adjustmentType === type.value ? type.color : '#0f172a' }}>{type.label}</p>
                  <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>{type.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Quantity stepper */}
          <div>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quantity</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={() => setQuantity(Math.max(0, quantity - 1))}
                style={{ width: '44px', height: '44px', borderRadius: '50%', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a', flexShrink: 0 }}>
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                value={quantity || ''}
                onChange={e => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                onBlur={() => { if (!quantity) setQuantity(0); }}
                style={{ flex: 1, textAlign: 'center', fontSize: '24px', fontWeight: '700', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none' }}
              />
              <button
                onClick={() => setQuantity(quantity + 1)}
                style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgb(var(--color-primary, 99 102 241))', border: 'none', fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                +
              </button>
            </div>
            {/* Quick shortcuts */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              {[5, 10, 20, 50].map(q => (
                <button key={q} onClick={() => setQuantity(q)}
                  style={{ flex: 1, padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', background: quantity === q ? '#f1f5f9' : 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer', color: '#6b7280' }}>
                  +{q}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Notes <span style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Weekly restock from supplier"
              rows={2}
              style={{ width: '100%', borderRadius: '10px', resize: 'none', fontSize: '13px', padding: '10px 12px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              width: '100%', padding: '14px',
              background: canSubmit ? 'rgb(var(--color-primary, 99 102 241))' : '#e2e8f0',
              color: canSubmit ? 'white' : '#94a3b8',
              border: 'none', borderRadius: '12px',
              fontSize: '15px', fontWeight: '700',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s ease'
            }}>
            {buttonLabel}
          </button>

        </div>
      </SheetContent>
    </Sheet>
  );
}