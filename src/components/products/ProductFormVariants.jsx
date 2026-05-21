import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, X, GripVertical } from 'lucide-react';

export default function ProductFormVariants({ formData, onChange }) {
  const [newVariant, setNewVariant] = useState({ name: '', price_modifier: 0 });
  const variants = formData.variants || [];

  const addGroup = () => {
    onChange({
      variants: [...variants, { name: '', type: 'other', options: [{ label: '', price_modifier: 0 }] }],
    });
  };

  const removeGroup = (groupIndex) => {
    onChange({ variants: variants.filter((_, i) => i !== groupIndex) });
  };

  const addOption = (groupIndex) => {
    const updated = variants.map((g, i) =>
      i === groupIndex ? { ...g, options: [...g.options, { label: '', price_modifier: 0 }] } : g
    );
    onChange({ variants: updated });
  };

  const removeOption = (groupIndex, optIndex) => {
    const updated = variants.map((g, i) =>
      i === groupIndex ? { ...g, options: g.options.filter((_, oi) => oi !== optIndex) } : g
    );
    onChange({ variants: updated });
  };

  const updateGroupName = (groupIndex, value) => {
    const type =
      /size/i.test(value) ? 'size' :
      /colou?r/i.test(value) ? 'color' :
      /add.?on|topping|extra/i.test(value) ? 'addon' : 'other';
    const updated = variants.map((g, i) => i === groupIndex ? { ...g, name: value, type } : g);
    onChange({ variants: updated });
  };

  const updateGroupType = (groupIndex, value) => {
    const updated = variants.map((g, i) => i === groupIndex ? { ...g, type: value } : g);
    onChange({ variants: updated });
  };

  const updateOptionLabel = (groupIndex, optIndex, value) => {
    const updated = variants.map((g, i) =>
      i === groupIndex
        ? { ...g, options: g.options.map((o, oi) => oi === optIndex ? { ...o, label: value } : o) }
        : g
    );
    onChange({ variants: updated });
  };

  const updateOptionPrice = (groupIndex, optIndex, value) => {
    const updated = variants.map((g, i) =>
      i === groupIndex
        ? { ...g, options: g.options.map((o, oi) => oi === optIndex ? { ...o, price_modifier: parseFloat(value) || 0 } : o) }
        : g
    );
    onChange({ variants: updated });
  };

  // Legacy flat-variant helpers (kept for UI compatibility during transition)
  const addVariant = () => {
    if (!newVariant.name.trim()) return;
    onChange({
      variants: [
        ...variants,
        { name: newVariant.name.trim(), price_modifier: parseFloat(newVariant.price_modifier) || 0 },
      ],
    });
    setNewVariant({ name: '', price_modifier: 0 });
  };

  const removeVariant = (index) => {
    onChange({ variants: variants.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Product Variants</Label>
        <p className="text-xs text-slate-500 mt-1">
          Add options like sizes, colors, or add-ons with price adjustments
        </p>
      </div>

      {/* Existing Variants */}
      {variants.length > 0 && (
        <div className="space-y-2">
          {variants.map((variant, index) => (
            <Card key={index} className="p-3 flex items-center gap-3">
              <GripVertical className="w-4 h-4 text-slate-400 cursor-move" />
              <div className="flex-1">
                <p className="font-medium text-slate-900">{variant.name}</p>
                <p className="text-sm text-slate-500">
                  {variant.price_modifier > 0 ? '+' : ''}
                  {variant.price_modifier.toFixed(2)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeVariant(index)}
                className="h-8 w-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Add New Variant */}
      <div className="flex gap-2">
        <Input
          placeholder="Variant name (e.g., Large, Red)"
          value={newVariant.name}
          onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })}
          onKeyPress={(e) => e.key === 'Enter' && addVariant()}
        />
        <Input
          type="number"
          step="0.01"
          placeholder="+0.00"
          value={newVariant.price_modifier}
          onChange={(e) => setNewVariant({ ...newVariant, price_modifier: e.target.value })}
          className="w-24"
        />
        <Button
          type="button"
          variant="outline"
          onClick={addVariant}
          disabled={!newVariant.name.trim()}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {variants.length === 0 && (
        <div className="text-center py-6 text-sm text-slate-400">
          No variants added. Products without variants have a single price.
        </div>
      )}
    </div>
  );
}