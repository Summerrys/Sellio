import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export default function ProductFormInventory({ formData, onChange }) {
  const trackInventory = formData.track_inventory === true;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
        <div>
          <Label className="text-sm font-medium">Track Inventory</Label>
          <p className="text-xs text-slate-500">Monitor stock levels for this product</p>
        </div>
        <Switch
          checked={trackInventory}
          onCheckedChange={(checked) => {
            if (checked) {
              onChange({ track_inventory: true, current_stock: formData.current_stock ?? 0, low_stock_threshold: formData.low_stock_threshold ?? 5 });
            } else {
              onChange({ track_inventory: false });
            }
          }}
        />
      </div>

      {trackInventory && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Current Stock *</Label>
            <Input
              type="number"
              min="0"
              value={formData.current_stock ?? 0}
              onChange={(e) => onChange({ current_stock: parseInt(e.target.value) || 0 })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label>Low Stock Threshold</Label>
            <Input
              type="number"
              min="0"
              value={formData.low_stock_threshold ?? 5}
              onChange={(e) => onChange({ low_stock_threshold: parseInt(e.target.value) || 5 })}
              className="mt-1.5"
            />
            <p className="text-xs text-slate-500 mt-1">Alert when below this number</p>
          </div>
        </div>
      )}

      {!trackInventory && (
        <div className="text-center py-4 text-sm text-slate-500">
          Inventory tracking disabled — product treated as unlimited stock
        </div>
      )}
    </div>
  );
}