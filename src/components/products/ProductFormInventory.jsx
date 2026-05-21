import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export default function ProductFormInventory({ formData, onChange }) {
  const trackInventory = formData.stock_quantity !== undefined && formData.stock_quantity !== null;

  const [stockInput, setStockInput] = useState(String(formData.stock_quantity ?? 0));
  const [thresholdInput, setThresholdInput] = useState(String(formData.low_stock_threshold ?? 5));

  // Sync inputs when formData changes externally (e.g. toggling track inventory)
  useEffect(() => {
    setStockInput(String(formData.stock_quantity ?? 0));
  }, [formData.stock_quantity]);

  useEffect(() => {
    setThresholdInput(String(formData.low_stock_threshold ?? 5));
  }, [formData.low_stock_threshold]);

  const handleStockChange = (e) => {
    setStockInput(e.target.value);
    const num = parseInt(e.target.value);
    if (!isNaN(num) && num >= 0) {
      onChange({ stock_quantity: num });
    }
  };

  const handleThresholdChange = (e) => {
    setThresholdInput(e.target.value);
    const num = parseInt(e.target.value);
    if (!isNaN(num) && num >= 0) {
      onChange({ low_stock_threshold: num });
    }
  };

  return (
    <div className="space-y-4">
      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
        <div>
          <Label className="text-sm font-medium">Track Inventory</Label>
          <p className="text-xs text-slate-500">Monitor stock levels for this product</p>
        </div>
        <Switch
          checked={trackInventory}
          onCheckedChange={(checked) => {
            if (checked) {
              onChange({ stock_quantity: 0, low_stock_threshold: 5 });
            } else {
              onChange({ stock_quantity: null, low_stock_threshold: null });
            }
          }}
        />
      </div>

      {trackInventory && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Current Stock *</Label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              value={stockInput}
              onChange={handleStockChange}
              onBlur={() => {
                if (stockInput === '' || isNaN(parseInt(stockInput))) {
                  setStockInput('0');
                  onChange({ stock_quantity: 0 });
                }
              }}
              className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div>
            <Label>Low Stock Threshold</Label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              value={thresholdInput}
              onChange={handleThresholdChange}
              onBlur={() => {
                if (thresholdInput === '' || isNaN(parseInt(thresholdInput))) {
                  setThresholdInput('5');
                  onChange({ low_stock_threshold: 5 });
                }
              }}
              className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-slate-500 mt-1">Alert when below this number</p>
          </div>
        </div>
      )}

      {!trackInventory && (
        <div className="text-center py-4 text-sm text-slate-500">
          Inventory tracking disabled - product treated as unlimited stock
        </div>
      )}
    </div>
  );
}