import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PackagePlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ProductFormBasic({ 
  formData, 
  onChange, 
  categories, 
  errors,
  isEditMode,
  savedSku,
  currentStock,
  customPrimary,
  onAdjustStock,
  trackInventory,
  onTrackInventoryChange,
}) {

  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {/* Featured toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#fafafa', borderRadius: 10, border: '0.5px solid #e5e7eb' }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>⭐ Featured Product</p>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>Highlight this product in your storefront</p>
        </div>
        <Switch
          checked={formData.is_featured ?? false}
          onCheckedChange={(val) => onChange({ is_featured: val })}
        />
      </div>

      <div>
        <Label>Product Name *</Label>
        <Input
          value={formData.name || ''}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g., Cappuccino, Blue T-Shirt, Haircut"
          className="mt-1.5"
        />
        {errors?.name && (
          <p className="text-xs text-red-500 mt-1">{errors.name}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Label className="text-sm font-medium text-slate-700">SKU</Label>
            {trackInventory && currentStock !== null && currentStock !== undefined && isEditMode && (
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgb(var(--color-primary-50))', color: 'rgb(var(--color-primary-700))' }}
              >
                {currentStock} in stock
              </span>
            )}
          </div>
          {savedSku ? (
            <Input
              value={savedSku}
              readOnly
              className="h-10 cursor-default border-green-400 bg-green-50 text-green-700 font-mono font-medium"
            />
          ) : (
            <Input
              value={formData.sku || ''}
              onChange={(e) => onChange({ sku: e.target.value.toUpperCase() })}
              placeholder="Auto-generated on save"
              className="h-10 font-mono"
            />
          )}
          <div className="mt-1 space-y-0.5">
            <p className="text-[11px] text-slate-400">Leave blank to auto-generate • Editable anytime</p>
            {trackInventory && isEditMode && onAdjustStock && (
              <button type="button" onClick={onAdjustStock}
                className="flex items-center gap-1 text-xs"
                style={{ color: 'rgb(var(--color-primary))' }}>
                <PackagePlus className="w-3.5 h-3.5" style={{ color: 'rgb(var(--color-primary))' }} /> <span className="font-medium" style={{ color: 'rgb(var(--color-primary))' }}>Adjust stock</span>
              </button>
            )}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium text-slate-700 mb-1 block">Category</Label>
          <Select
            key={formData.category_id || 'no-cat'}
            value={formData.category_id || ''}
            onValueChange={(v) => onChange({ category_id: v })}
          >
            <SelectTrigger className="w-full h-10">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-slate-400 mt-1">
            Can't find your category?{' '}
            <span
              className="cursor-pointer underline"
              style={{ color: 'rgb(var(--color-primary))' }}
              onClick={() => navigate(createPageUrl('Categories'))}
            >
              Manage categories
            </span>
          </p>
        </div>
      </div>

      {/* Track Inventory toggle */}
      <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-700">Track Inventory</p>
          <p className="text-xs text-slate-400">Monitor stock levels for this product</p>
        </div>
        <Switch
          checked={trackInventory ?? false}
          onCheckedChange={onTrackInventoryChange}
        />
      </div>

      <div>
        <Label>Description</Label>
        <Textarea
          value={formData.description || ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Describe your product..."
          className="mt-1.5 h-24"
        />
      </div>

      <div>
        <Label>Tags</Label>
        <Input
          value={formData.tags?.join(', ') || ''}
          onChange={(e) => onChange({ 
            tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) 
          })}
          placeholder="e.g., popular, vegan, bestseller (comma-separated)"
          className="mt-1.5"
        />
      </div>
    </div>
  );
}