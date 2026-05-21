import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export default function ProductFormPricing({ formData, onChange, currency = 'SGD' }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Price ({currency}) *</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={formData.price || ''}
            onChange={(e) => onChange({ price: parseFloat(e.target.value) || 0 })}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label>Cost Price ({currency})</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={formData.cost_price || ''}
            onChange={(e) => onChange({ cost_price: parseFloat(e.target.value) || 0 })}
            className="mt-1.5"
          />
          <p className="text-xs text-slate-500 mt-1">For profit tracking</p>
        </div>
      </div>

      <div>
        <Label>Compare-at Price ({currency})</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={formData.compare_at_price || ''}
          onChange={(e) => onChange({ compare_at_price: parseFloat(e.target.value) || null })}
          className="mt-1.5"
          placeholder="Optional - shows as strikethrough"
        />
      </div>

      {formData.price > 0 && formData.cost_price > 0 && (() => {
        const profitMargin = formData.price - formData.cost_price;
        const profitPercent = ((profitMargin / formData.cost_price) * 100).toFixed(1);
        const marginColor = profitMargin > 0 ? '#16a34a' : profitMargin < 0 ? '#dc2626' : '#6b7280';
        const marginLabel = profitMargin > 0 ? 'Profit Margin:' : profitMargin < 0 ? 'Loss per unit:' : 'Break even';
        return (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p style={{ fontSize: '13px', color: marginColor }}>
              {marginLabel}{profitMargin !== 0 && <> <strong>{currency} {Math.abs(profitMargin).toFixed(2)}</strong> ({Math.abs(profitPercent)}%)</>}
            </p>
          </div>
        );
      })()}
    </div>
  );
}