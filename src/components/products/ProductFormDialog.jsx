import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { X, ChevronDown, ChevronUp, ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import db from '@/lib/db';
import { useTenant } from '../tenant/TenantContext';
import { base44 } from '@/api/base44Client';

import ProductFormBasic from './ProductFormBasic';
import ProductFormPricing from './ProductFormPricing';
import ProductFormInventory from './ProductFormInventory';
import ProductFormVariants from './ProductFormVariants';
import AIProductAssistant from './AIProductAssistant';
import ImageEditModal from '../onboarding/ImageEditModal';

const EMPTY_FORM = {
  name: '',
  sku: '',
  description: '',
  tags: [],
  category_id: '',
  price: '',
  cost_price: '',
  compare_at_price: '',
  stock_quantity: null,
  low_stock_threshold: null,
  variants: [],
  is_active: true,
  image_url: '',
};

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-sm font-semibold text-slate-700"
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

export default function ProductFormDialog({ open, onOpenChange, product, tenantId }) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [imageEditSrc, setImageEditSrc] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setFormData({ ...EMPTY_FORM, ...product });
    } else {
      setFormData(EMPTY_FORM);
    }
    setErrors({});
  }, [open, product]);

  useEffect(() => {
    if (!tenantId || !open) return;
    db.entities.Category.filter({ tenant_id: tenantId }).then(setCategories).catch(() => {});
  }, [tenantId, open]);

  const update = (patch) => setFormData(prev => ({ ...prev, ...patch }));

  const validate = () => {
    const errs = {};
    if (!formData.name?.trim()) errs.name = 'Product name is required';
    if (!formData.price && formData.price !== 0) errs.price = 'Price is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...formData,
        tenant_id: tenantId,
        price: parseFloat(formData.price) || 0,
        cost_price: formData.cost_price ? parseFloat(formData.cost_price) : null,
        compare_at_price: formData.compare_at_price ? parseFloat(formData.compare_at_price) : null,
      };
      if (product?.id) {
        await db.entities.Product.update(product.id, payload);
        toast.success('Product updated');
      } else {
        await db.entities.Product.create(payload);
        toast.success('Product created');
      }
      queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  // Image handling
  const handleImageFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setImageEditSrc(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleImageSave = async (base64OrNull) => {
    if (base64OrNull === null) {
      update({ image_url: '' });
      return;
    }
    setUploadingImage(true);
    try {
      const response = await base44.functions.invoke('analyzeProductImage', {
        image_data: base64OrNull,
        image_mime_type: 'image/jpeg',
        tenant_id: tenantId || '',
        upload_only: true,
      });
      const url = response.data?.image_url || '';
      update({ image_url: url });
    } catch {
      // fallback: store base64 directly
      update({ image_url: base64OrNull });
    } finally {
      setUploadingImage(false);
    }
  };

  if (!open) return null;

  const themeColor = `rgb(var(--color-primary, 15 23 42))`;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={() => onOpenChange(false)} />

      {/* Sheet — full screen on mobile, centered on desktop */}
      <div className={cn(
        "fixed z-50 bg-white flex flex-col",
        "inset-x-0 bottom-0 rounded-t-2xl max-h-[95vh]",
        "lg:inset-0 lg:m-auto lg:rounded-2xl lg:max-w-2xl lg:max-h-[90vh] lg:h-auto"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-900">
            {product?.id ? 'Edit Product' : 'New Product'}
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => update({ is_active: v })}
              />
              <Label className="text-sm text-slate-600">{formData.is_active ? 'Active' : 'Inactive'}</Label>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* AI Assistant */}
          <AIProductAssistant
            onApply={(data) => update(data)}
            tenantId={tenantId}
            businessType={tenant?.business_type}
            currency={tenant?.currency || 'SGD'}
            categories={categories}
          />

          {/* Product Image */}
          <Section title="Product Image" defaultOpen={true}>
            <div className="flex items-center gap-4">
              {uploadingImage ? (
                <div className="w-24 h-24 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : formData.image_url ? (
                <button
                  type="button"
                  onClick={() => setImageEditSrc(formData.image_url)}
                  className="w-24 h-24 rounded-xl overflow-hidden border-2 border-slate-200 hover:border-slate-400 transition-colors flex-shrink-0"
                >
                  <img src={formData.image_url} alt="Product" className="w-full h-full object-cover" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors flex-shrink-0"
                >
                  <ImagePlus className="w-6 h-6" />
                  <span className="text-xs">Add Photo</span>
                </button>
              )}
              <div className="text-sm text-slate-500">
                {formData.image_url
                  ? 'Tap the image to crop, rotate, replace or delete.'
                  : 'Add a product photo. You can crop and edit after selecting.'}
              </div>
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageFileSelect}
            />
          </Section>

          {/* Basic Info */}
          <Section title="Basic Info" defaultOpen={true}>
            <ProductFormBasic
              formData={formData}
              onChange={update}
              categories={categories}
              errors={errors}
              onCreateCategory={() => {}}
            />
          </Section>

          {/* Pricing */}
          <Section title="Pricing" defaultOpen={true}>
            <ProductFormPricing
              formData={formData}
              onChange={update}
              currency={tenant?.currency || 'SGD'}
            />
          </Section>

          {/* Inventory */}
          <Section title="Inventory" defaultOpen={false}>
            <ProductFormInventory formData={formData} onChange={update} />
          </Section>

          {/* Variants */}
          <Section title="Variants & Add-ons" defaultOpen={false}>
            <ProductFormVariants formData={formData} onChange={update} />
          </Section>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-4 py-4 border-t border-slate-100 flex-shrink-0">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))] text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (product?.id ? 'Save Changes' : 'Create Product')}
          </Button>
        </div>
      </div>

      {/* Image Edit Modal */}
      {imageEditSrc && (
        <ImageEditModal
          src={imageEditSrc}
          themeColor={themeColor}
          onSave={handleImageSave}
          onClose={() => setImageEditSrc(null)}
        />
      )}
    </>
  );
}