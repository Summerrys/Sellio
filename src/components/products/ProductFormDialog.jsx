import { useState, useEffect, useRef } from 'react';
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
  const filename = `${tenantId}/products/${Date.now()}-${toSlug(productName)}.${ext}`;
  const { error } = await supabase.storage.from('product-images').upload(filename, bytes, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  const { data } = supabase.storage.from('product-images').getPublicUrl(filename);
  return data.publicUrl;
};

const applyCategory = async (suggestedCategoryName, tenantId, setFormData) => {
  if (!suggestedCategoryName?.trim()) return;
  const supabase = await getSupabase();
  
  // Check if category exists
  let { data: existing } = await supabase
    .from('categories')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .ilike('name', suggestedCategoryName)
    .maybeSingle();
  
  if (!existing) {
    // Create it
    const { data: newCat } = await supabase
      .from('categories')
      .insert({ 
        tenant_id: tenantId, 
        name: suggestedCategoryName, 
        slug: toSlug(suggestedCategoryName), 
        is_active: true 
      })
      .select()
      .single();
    existing = newCat;
  }
  
  // Set category in form
  setFormData(prev => ({ ...prev, category_id: existing.id }));
};

import ProductFormBasic from './ProductFormBasic';
import PriceDisplay from './PriceDisplay';
import ProductFormPricing from './ProductFormPricing';
import ProductFormInventory from './ProductFormInventory';
import ProductFormVariants from './ProductFormVariants';
import AIProductAssistant, { cleanupDeletedImages } from './AIProductAssistant';
import { Pencil, Plus } from 'lucide-react';

const deleteImageFromStorage = async (imageUrl) => {
  console.log('deleteImageFromStorage called with:', imageUrl);
  if (!imageUrl || !imageUrl.includes('supabase')) {
    console.log('Skipping - not a supabase URL');
    return;
  }
  const supabase = await getSupabase();
  const path = imageUrl.split('/object/public/product-images/')[1];
  console.log('Extracted path:', path);
  if (!path) {
    console.log('Skipping - no path extracted');
    return;
  }
  const { error } = await supabase.storage.from('product-images').remove([path]);
  console.log('Delete result - error:', error);
};

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
    const aiAssistantRef = useRef(null);
    const uploadedImagesRef = useRef(new Set());
    const [saving, setSaving] = useState(false);
    const [savedSku, setSavedSku] = useState(null); // SKU returned after insert
    const [errors, setErrors] = useState({});
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

  const normalizeLegacyVariants = (variants) => {
    if (!variants?.length) return [];
    if (variants[0]?.options) return variants; // already grouped
    return [{
      name: 'Options',
      type: 'addon',
      options: variants.map(v => ({
        label: v.name || v.label || '',
        price_modifier: v.price_modifier || 0,
      })),
    }];
  };

  useEffect(() => {
    if (!open) return;
    if (product) {
      setFormData({
        ...EMPTY_FORM,
        ...product,
        variants: normalizeLegacyVariants(product.variants),
        track_inventory: product.track_inventory ?? false,
        stock_quantity: product.stock_quantity ?? 0,
        low_stock_threshold: product.low_stock_threshold ?? 5,
      });
      uploadedImagesRef.current = new Set(product.image_url ? [product.image_url] : []);
      if (product.images?.length) {
        product.images.forEach(url => uploadedImagesRef.current.add(url));
      }
    } else {
      setFormData(EMPTY_FORM);
      uploadedImagesRef.current = new Set();
      setSavedSku(null);
    }
    setErrors({});
  }, [open, product]);

  useEffect(() => {
    if (!tenantId || !open) return;
    getSupabase().then(supabase =>
      supabase.from('categories').select('id, name').eq('tenant_id', tenantId).eq('is_active', true).order('name')
    ).then(({ data }) => setCategories(data || [])).catch(() => {});
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
      const supabase = await getSupabase();

      if (product?.id) {
        // Edit: include user-edited SKU
        const { sku, ...rest } = formData;
        const payload = {
          ...rest,
          sku: sku?.trim() ? sku.trim().toUpperCase() : (product.sku || undefined),
          tenant_id: tenantId,
          price: parseFloat(formData.price) || 0,
          cost_price: formData.cost_price ? parseFloat(formData.cost_price) : null,
          compare_at_price: formData.compare_at_price ? parseFloat(formData.compare_at_price) : null,
          track_inventory: formData.track_inventory ?? false,
          stock_quantity: formData.stock_quantity ?? 0,
          low_stock_threshold: formData.low_stock_threshold ?? 5,
        };
        const { error } = await supabase.from('products').update(payload).eq('id', product.id);
        if (error) throw new Error(error.message);

        // Sync inventory_items
        await supabase.from('inventory_items').update({
          current_stock: formData.stock_quantity || 0,
          low_stock_threshold: formData.low_stock_threshold || 5,
        }).eq('product_id', product.id);

        toast.success('Product updated');
        queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
        if (aiAssistantRef.current) await cleanupDeletedImages(aiAssistantRef.current);
        onOpenChange(false);
      } else {
        // Create: include user-typed SKU if provided, else let DB trigger generate it
        const { sku, ...rest } = formData;
        const payload = {
          ...rest,
          tenant_id: tenantId,
          price: parseFloat(formData.price) || 0,
          cost_price: formData.cost_price ? parseFloat(formData.cost_price) : null,
          compare_at_price: formData.compare_at_price ? parseFloat(formData.compare_at_price) : null,
          ...(sku && sku.trim() !== '' ? { sku: sku.trim().toUpperCase() } : {}),
        };
        const { data: inserted, error } = await supabase.from('products').insert(payload).select('id, sku, tenant_id, stock_quantity, low_stock_threshold').single();
        if (error) throw new Error(error.message);

        // Create corresponding inventory_items record
        await supabase.from('inventory_items').insert({
          tenant_id: inserted.tenant_id,
          product_id: inserted.id,
          current_stock: inserted.stock_quantity || 0,
          low_stock_threshold: inserted.low_stock_threshold || 5,
          unit: 'pcs',
        });

        // Show the trigger-generated SKU briefly before closing
        setSavedSku(inserted.sku || '');
        toast.success('Product created');
        queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
        if (aiAssistantRef.current) await cleanupDeletedImages(aiAssistantRef.current);

        // Wait 1.2s so user sees the generated SKU, then close
        await new Promise(res => setTimeout(res, 1200));
        onOpenChange(false);
      }
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
      const supabase = await getSupabase();
      await supabase.from('inventory_items').delete().eq('product_id', product.id);
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

  const handleCancel = async () => {
    // Clean up temp paths from AIProductAssistant
    if (aiAssistantRef.current) {
      const tempPaths = aiAssistantRef.current.getTempUploadedPaths?.() || [];
      if (tempPaths.length > 0) {
        try {
          const supabase = await getSupabase();
          await supabase.storage.from('product-images').remove(tempPaths);
          aiAssistantRef.current.clearTempUploadedPaths?.();
          console.log('Cleaned up temp images:', tempPaths);
        } catch (err) {
          console.error('Failed to cleanup temp images:', err);
        }
      }
    }

    onOpenChange(false);
  };



  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={() => handleCancel()} />

      {/* Sheet — full screen on mobile, centered on desktop */}
      <div className={cn(
        "fixed z-50 bg-white flex flex-col",
        "inset-x-0 bottom-0 rounded-t-2xl max-h-[95vh]",
        "lg:inset-0 lg:m-auto lg:rounded-2xl lg:max-w-2xl lg:max-h-[90vh] lg:h-auto"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {product?.id ? 'Edit Product' : 'New Product'}
            </h2>
            {product?.id && formData.price > 0 && (
              <p className="text-sm mt-0.5">
                <PriceDisplay
                  price={formData.price}
                  compareAtPrice={formData.compare_at_price}
                  currency={tenant?.currency || 'SGD'}
                />
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => update({ is_active: v })}
              />
              <Label className="text-sm text-slate-600">{formData.is_active ? 'Active' : 'Inactive'}</Label>
            </div>
            <button
              onClick={handleCancel}
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
            ref={aiAssistantRef}
            onApply={async (data) => {
              update(data);
              // Track new image URLs
              if (data.image_url) uploadedImagesRef.current.add(data.image_url);
              if (data.images?.length) {
                data.images.forEach(url => uploadedImagesRef.current.add(url));
              }
            }}
            onImageChange={(url) => {
              if (url) uploadedImagesRef.current.add(url);
              update({ image_url: url });
            }}
            onAdditionalImagesChange={(images) => {
              if (images?.length) {
                images.forEach(url => uploadedImagesRef.current.add(url));
              }
              update({ images });
            }}
            onImageDelete={async (url) => {
              if (url) await deleteImageFromStorage(url);
            }}
            onCategoriesRefresh={async () => {
              const updated = await db.entities.Category.filter({ tenant_id: tenantId });
              setCategories(updated);
            }}
            currentImageUrl={formData.image_url}
            additionalImagesOnOpen={product?.images || []}
            tenantId={tenantId}
            businessType={tenant?.business_type}
            currency={tenant?.currency || 'SGD'}
            categories={categories}
          />



          {/* Basic Info */}
          <Section title="Basic Info" defaultOpen={true}>
            <ProductFormBasic
              formData={formData}
              onChange={update}
              categories={categories}
              errors={errors}
              isEditMode={!!product?.id}
              savedSku={savedSku}
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
           <Button variant="outline" className="flex-1" onClick={handleCancel}>
             Cancel
           </Button>
          )}
          {product?.id && (
           <Button variant="outline" className="flex-1" onClick={() => { setConfirmDelete(false); handleCancel(); }}>
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