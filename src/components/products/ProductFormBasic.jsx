import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ProductFormBasic({ 
  formData, 
  onChange, 
  categories, 
  errors,
  isEditMode,
  savedSku,
}) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
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
          <Label>SKU</Label>
          {savedSku ? (
            <Input
              value={savedSku}
              readOnly
              className="mt-1.5 cursor-default border-green-400 bg-green-50 text-green-700 font-mono font-medium"
            />
          ) : (
            <Input
              value={formData.sku || ''}
              onChange={(e) => onChange({ sku: e.target.value.toUpperCase() })}
              placeholder="Auto-generated on save"
              className="mt-1.5 font-mono"
            />
          )}
          <p className="text-[11px] text-slate-400 mt-0.5">Leave blank to auto-generate • Editable anytime</p>
        </div>

        <div>
          <Label>Category</Label>
          <Select
            key={formData.category_id || 'no-cat'}
            value={formData.category_id || ''}
            onValueChange={(v) => onChange({ category_id: v })}
          >
            <SelectTrigger className="w-full mt-1.5">
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
              className="text-violet-600 underline cursor-pointer"
              onClick={() => navigate(createPageUrl('Categories'))}
            >
              Manage categories
            </span>
          </p>
        </div>
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