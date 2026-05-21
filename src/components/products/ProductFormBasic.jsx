import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

const toSlug = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function ProductFormBasic({ 
  formData, 
  onChange, 
  categories, 
  onCategoriesChange,
  errors,
  isEditMode,
  savedSku,
  tenantId,
}) {
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    setAddingCategory(true);
    try {
      const supabase = await getSupabase();
      const { data: newCat, error } = await supabase
        .from('categories')
        .insert({
          tenant_id: tenantId,
          name: newCategoryName.trim(),
          slug: toSlug(newCategoryName.trim()),
          is_active: true,
        })
        .select()
        .single();
      if (!error && newCat) {
        onCategoriesChange?.([...categories, newCat]);
        onChange({ category_id: newCat.id });
        setShowAddCategory(false);
        setNewCategoryName('');
      }
    } finally {
      setAddingCategory(false);
    }
  };

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
          <div className="flex gap-2 mt-1.5">
            <Select
              key={formData.category_id || 'no-cat'}
              value={formData.category_id || ''}
              onValueChange={(v) => onChange({ category_id: v })}
            >
              <SelectTrigger className="flex-1 min-w-0">
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
              className="flex-shrink-0"
              onClick={() => setShowAddCategory(v => !v)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {showAddCategory && (
            <div className="flex gap-2 mt-2 items-center">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                placeholder="New category name"
                className="flex-1 min-w-0"
                autoFocus
              />
              <Button
                type="button"
                size="sm"
                className="flex-shrink-0 text-white"
                style={{ background: 'var(--color-primary-gradient)' }}
                onClick={handleAddCategory}
                disabled={addingCategory}
              >
                Add
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="flex-shrink-0"
                onClick={() => { setShowAddCategory(false); setNewCategoryName(''); }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
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