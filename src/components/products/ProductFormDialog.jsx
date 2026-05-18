import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { X, ChevronDown, ChevronUp, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import db from '@/lib/db';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../tenant/TenantContext';

const toSlug = (str) => (str || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const uploadImageIfBase64 = async (imageData, tenantId, productName) => {
  if (!imageData || !imageData.startsWith('data:image')) return imageData;
  const supabase = await getSupabase();
  const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match?.[1] || 'image/jpeg';
  const base64Data = match?.[2] || imageData.split(',')[1];
  const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const ext = mimeType.split('/')[1] || 'jpg';
  const filename = `${tenantId}/${Date.now()}-${toSlug(productName)}.${ext}`;
  const { error } = await supabase.storage.from('product-images').upload(filename, bytes, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  const { data } = supabase.storage.from('product-images').getPublicUrl(filename);
  return data.publicUrl;
};

import ProductFormBasic from './ProductFormBasic';
import ProductFormPricing from './ProductFormPricing';
import ProductFormInventory from './ProductFormInventory';
import ProductFormVariants from './ProductFormVariants';
import AIProductAssistant from './AIProductAssistant';
import { Pencil, Plus } from 'lucide-react';

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
   const [imagePreviews, setImagePreviews] = useState([]);
   const [categories, setCategories] = useState([]);
   const [saving, setSaving] = useState(false);
   const [errors, setErrors] = useState({});
   const [confirmDelete, setConfirmDelete] = useState(false);
   const [deleting, setDeleting] = useState(false);
   const [editingImageIdx, setEditingImageIdx] = useState(null);
   const [uploadingImageIdx, setUploadingImageIdx] = useState(null);
   const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setFormData({ ...EMPTY_FORM, ...product });
      // Load all images: cover first, then additional images
      const all = [];
      if (product.image_url) all.push(product.image_url);
      if (product.images?.length) {
        product.images.forEach(u => {
          if (u && u !== product.image_url) all.push(u);
        });
      }
      setImagePreviews(all);
    } else {
      setFormData(EMPTY_FORM);
      setImagePreviews([]);
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

  const handleReplaceImage = (idx) => {
    setEditingImageIdx(idx);
    fileInputRef.current?.click();
  };

  const handleImageFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || editingImageIdx === null) return;

    e.target.value = '';
    setUploadingImageIdx(editingImageIdx);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result;
        // Show base64 preview immediately
        setImagePreviews(prev => {
          const updated = [...prev];
          updated[editingImageIdx] = base64;
          return updated;
        });
      };
      reader.readAsDataURL(file);
    } finally {
      setEditingImageIdx(null);
      setUploadingImageIdx(null);
    }
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Split imagePreviews into cover + additional
      const coverUrl = imagePreviews[0] ? await uploadImageIfBase64(imagePreviews[0], tenantId, formData.name) : formData.image_url;
      const additionalUrls = imagePreviews.length > 1
        ? await Promise.all(imagePreviews.slice(1).map(u => uploadImageIfBase64(u, tenantId, formData.name)))
        : [];
      const payload = {
        ...formData,
        image_url: coverUrl,
        images: additionalUrls,
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

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await db.entities.Product.delete(product.id);
      toast.success('Product deleted');
      queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || 'Failed to delete product');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };



  if (!open) return null;

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
            onImageChange={(url) => {
              update({ image_url: url });
              setImagePreviews(prev => {
                const updated = [...prev];
                updated[0] = url;
                return updated;
              });
            }}
            currentImageUrl={formData.image_url}
            tenantId={tenantId}
            businessType={tenant?.business_type}
            currency={tenant?.currency || 'SGD'}
            categories={categories}
          />

          {/* Unified Images Gallery */}
          {imagePreviews.length > 0 && (
            <Section title="Images" defaultOpen={true}>
              <div className="grid grid-cols-4 gap-3">
                {imagePreviews.map((src, idx) => (
                  <div
                    key={`img-${idx}`}
                    className="relative w-full aspect-square rounded-lg overflow-hidden border-2 group"
                    style={{ borderColor: idx === 0 ? 'rgb(var(--color-primary))' : '#e2e8f0' }}
                  >
                    <img src={src} alt={`preview-${idx}`} className="w-full h-full object-cover" />
                    {idx === 0 && (
                      <div className="absolute bottom-0 left-0 right-0 text-white text-[9px] text-center py-0.5 font-medium" style={{ background: 'var(--color-primary-gradient)' }}>Cover</div>
                    )}
                    {/* Edit overlay on hover */}
                    <div 
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                      onClick={() => handleReplaceImage(idx)}
                    >
                      <Pencil className="w-4 h-4 text-white" />
                    </div>
                    {/* Delete button for non-cover images */}
                    {idx > 0 && (
                      <button
                        type="button"
                        className="absolute top-0.5 right-0.5 bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImagePreviews(prev => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    )}
                  </div>
                ))}
                {imagePreviews.length < 5 && (
                  <label className="w-full aspect-square rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center hover:border-slate-400 transition-colors cursor-pointer">
                    <Plus className="w-5 h-5 text-slate-400" />
                    <input type="file" accept="image/*" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = '';
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setImagePreviews(prev => [...prev, reader.result]);
                      };
                      reader.readAsDataURL(file);
                    }} className="hidden" />
                  </label>
                )}
              </div>
            </Section>
          )}

          {/* Hidden file input for pencil edit */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageFileSelect}
            className="hidden"
          />

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
          {product?.id ? (
            <Button
              variant="outline"
              className={cn("flex-shrink-0 transition-all", confirmDelete ? "border-red-500 bg-red-50 text-red-600 hover:bg-red-100" : "text-red-500 border-red-200 hover:bg-red-50")}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {confirmDelete ? 'Confirm?' : ''}
            </Button>
          ) : (
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {product?.id && (
            <Button variant="outline" className="flex-1" onClick={() => { setConfirmDelete(false); onOpenChange(false); }}>
              Cancel
            </Button>
          )}
          <Button
            className="flex-1 text-white"
            style={{ background: 'var(--color-primary-gradient)' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (product?.id ? 'Save Changes' : 'Create Product')}
          </Button>
        </div>
      </div>


    </>
  );
}