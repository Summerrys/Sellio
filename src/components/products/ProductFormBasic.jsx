import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function ProductFormBasic({ 
  formData, 
  onChange, 
  categories, 
  errors,
  onCreateCategory,
  isEditMode,
  savedSku,
}) {
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
          ) : isEditMode ? (
            <Input
              value={formData.sku || ''}
              readOnly
              className="mt-1.5 cursor-default bg-slate-50 text-slate-500 font-mono"
            />
          ) : (
            <Input
              value={formData.sku || ''}
              onChange={(e) => onChange({ sku: e.target.value.toUpperCase() })}
              placeholder="Auto-generated on save"
              className="mt-1.5 font-mono"
            />
          )}
        </div>

        <div>
          <Label>Category</Label>
          <div className="flex gap-2 mt-1.5">
            <Select
              key={formData.category_id || 'no-cat'}
              value={formData.category_id || ''}
              onValueChange={(v) => onChange({ category_id: v })}
            >
              <SelectTrigger className="flex-1">
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
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onCreateCategory}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
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