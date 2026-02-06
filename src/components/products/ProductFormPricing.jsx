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

      {formData.price && formData.cost_price && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-sm text-slate-600">
            Profit Margin: <span className="font-semibold text-green-600">
              {currency} {(formData.price - formData.cost_price).toFixed(2)}
            </span> ({(((formData.price - formData.cost_price) / formData.price) * 100).toFixed(1)}%)
          </p>
        </div>
      )}
    </div>
  );
}