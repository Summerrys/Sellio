import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { PackagePlus } from 'lucide-react';
import TagInput from './TagInput';
import CategoryPicker from './CategoryPicker';
import { useAppText } from '@/lib/appText';

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
  listing = false, // a home seller's listing: listing words
  tagDraftRef = null, // a tag still being typed (ProductFormDialog adds it on Save)
  // The category: an existing one (formData.category_id) or a new name, saved with the listing.
  newCategory = '',
  onCategoryPick = (id) => onChange({ category_id: id }),
  onCategoryNew = () => {},
  canCreateCategory = false,
}) {
  const { t } = useAppText();
  return (
    <div className="space-y-4">
      {/* Featured toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#fafafa', borderRadius: 10, border: '0.5px solid #e5e7eb' }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>{listing ? t('⭐ Featured listing') : t('⭐ Featured Product')}</p>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{listing ? t('Show it first in your shop') : t('Highlight this product in your storefront')}</p>
        </div>
        <Switch
          checked={formData.is_featured ?? false}
          onCheckedChange={(val) => onChange({ is_featured: val })}
        />
      </div>

      <div>
        <Label>{listing ? t('Listing name *') : t('Product Name *')}</Label>
        <Input
          value={formData.name || ''}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={listing ? t('e.g., Pandan chiffon cake, Preloved denim jacket') : t('e.g., Cappuccino, Blue T-Shirt, Haircut')}
          className="mt-1.5"
        />
        {errors?.name && (
          <p className="text-xs text-red-500 mt-1">{errors.name}</p>
        )}
      </div>

      <CategoryPicker
        categories={categories}
        value={formData.category_id || ''}
        newName={newCategory}
        onPick={onCategoryPick}
        onNew={onCategoryNew}
        canCreate={canCreateCategory}
        listingName={formData.name || ''}
        error={errors?.category || null}
        skuColumn={
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Label className="text-sm font-medium text-slate-700">{t('SKU')}</Label>
            {trackInventory && currentStock !== null && currentStock !== undefined && isEditMode && (
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgb(var(--color-primary-50))', color: 'rgb(var(--color-primary-700))' }}
              >
                {t('{currentStock} in stock', { currentStock })}
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
              placeholder={t('Auto-generated on save')}
              className="h-10 font-mono"
            />
          )}
          <div className="mt-1 space-y-0.5">
            <p className="text-[11px] text-slate-400">{t('Leave blank to auto-generate • Editable anytime')}</p>
            {trackInventory && isEditMode && onAdjustStock && (
              <button type="button" onClick={onAdjustStock}
                className="flex items-center gap-1 text-xs"
                style={{ color: 'rgb(var(--color-primary))' }}>
                <PackagePlus className="w-3.5 h-3.5" style={{ color: 'rgb(var(--color-primary))' }} /> <span className="font-medium" style={{ color: 'rgb(var(--color-primary))' }}>{t('Adjust stock')}</span>
              </button>
            )}
          </div>
        </div>
        }
      />

      {/* Track Inventory toggle */}
      <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-700">{t('Track Inventory')}</p>
          <p className="text-xs text-slate-400">{listing ? t('Keep count of how many you have') : t('Monitor stock levels for this product')}</p>
        </div>
        <Switch
          checked={trackInventory ?? false}
          onCheckedChange={onTrackInventoryChange}
        />
      </div>

      <div>
        <Label>{t('Description')}</Label>
        <Textarea
          value={formData.description || ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={listing ? t('Describe it: condition, size, what\'s included…') : t('Describe your product...')}
          className="mt-1.5 h-24"
        />
      </div>

      <div>
        <Label htmlFor="product-tags">{t('Tags')}</Label>
        <div className="mt-1.5">
          <TagInput id="product-tags" value={formData.tags} onChange={(tags) => onChange({ tags })} draftRef={tagDraftRef} />
        </div>
      </div>
    </div>
  );
}