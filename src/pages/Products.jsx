import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import NativeCameraScanControl from '../components/ui-custom/NativeCameraScanControl';
import { getSupabase } from '@/lib/supabaseClient';
import { useBackToClose } from '@/lib/useBackToClose';
import { useTenant } from '../components/tenant/TenantContext';
import { toast } from 'sonner';
import RequirePermission from '../components/auth/RequirePermission';
import EmptyState from '../components/ui-custom/EmptyState';
import NoMatches, { DidYouMean } from '../components/ui-custom/NoMatches';
import { didYouMean } from '@/lib/searchSuggest';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ProductGrid from '../components/products/ProductGrid';
import ProductFormDialog from '../components/products/ProductFormDialog.jsx';
import ProductImportDialog from '../components/products/ProductImportDialog';
import PricingModal from '../components/subscription/PricingModal';
import { useProductTour } from '@/hooks/useProductTour';
import TourGuide from '@/components/tour/TourGuide';
import { getProductsSteps } from '@/components/tour/tourSteps';
import { itemWords } from '@/lib/planFeatures';
import DummyProductCard from '@/components/tour/DummyProductCard';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ShoppingBag, Plus, Search, LayoutGrid, List, Upload, Download, FileDown, FileSpreadsheet, Package, ScanLine, Trash2, CheckCircle2, AlertCircle, ImageIcon, Loader2, X, Pencil } from 'lucide-react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { isShopTenant } from '@/lib/shopSelling';
import { SkeletonList } from '@/components/ui-custom/AppLoader';
import LoadingShapes from '@/components/ui-custom/LoadingShapes';
import { applyCanonicalProductOrder, nextSortOrder } from '@/lib/storefrontCatalog';
import { useSubscription } from '@/hooks/useSubscription';
import { inAppFiles, saveFileInApp } from '@/lib/appFiles';
import { sellsPlans } from '@/lib/nativeApp';
import { useAppText, appT } from '@/lib/appText';
import { prepareMenuPhoto, fullPhotoRect, cutPicture, typedPrice, cleanScannedOptions, SCAN_REASONS } from '@/lib/menuScan';
import { shrinkImage, PHOTO_MAX_SIDE, LONG_CACHE, UnreadablePhotoError, UNREADABLE_PHOTO_MESSAGE, extFor } from '@/lib/imageShrink';
import { explainError } from '@/lib/plainError';
import ImageEditModal from '@/components/onboarding/ImageEditModal';

const CSV_HEADERS = ['Name', 'SKU', 'Description', 'Category', 'Price', 'Cost Price', 'Compare At Price', 'Stock Quantity', 'Low Stock Threshold', 'Track Inventory', 'Active', 'Featured', 'Tags', 'Variants', 'Image URL', 'Additional Images'];

const variantsToSimpleFormat = (variants) => {
  if (!variants?.length) return '';
  return variants.map(group => {
    const options = (group.options || []).map(o =>
      o.price_modifier > 0
        ? `${o.label}+${o.price_modifier}`
        : o.label
    ).join('|');
    return `${group.name}:${options}`;
  }).join(' | ');
};

const TEMPLATE_ROWS = [
  '# VARIANTS: GroupName:Option1|Option2+Price | GroupName2:Option1|Option2',
  'Latte Coffee,,Rich espresso,Beverages,5.50,3.00,6.50,100,10,true,true,false,"coffee,latte",Size:Regular|Large+1.50 | Add-ons:Extra shot+0.50|Oat milk+1.00,',
  'Cotton T-Shirt,,Cotton tee,Apparel,29.90,15.00,,50,5,true,true,false,"fashion",Size:S|M|L | Color:Black|White|Red,',
  'Simple Snack,,No variants,Food,9.90,5.00,,200,20,false,true,false,"snack",,',
];

// Scan Menu (scanMenu v21, 16 Nov 2026): the photo goes at the size the AI reads it, and
// every item comes back, those without a printed price too (a price must be added before
// they're saved: an item is never saved at $0 by a scan). An item with its own picture on
// the menu gets that picture as its photo, cut from the full photo; tapping a photo opens
// the photo editor on the whole menu with that picture boxed, to move the box, crop another
// part, choose another photo or delete it (a photo chosen instead, or turned, opens on its
// own). Nothing found says why.
// A scanned price as the review shows it: 5.5 → "5.50", 38000 → "38000", none → "".
const priceText = (price) => (typeof price !== 'number' || !Number.isFinite(price) ? '' : Number.isInteger(price) ? String(price) : price.toFixed(2));
// A problem with the photo itself (unreadable, blurry, not a menu…): scanning the same photo
// again gives the same answer, so only Retake is offered.
const photoProblem = (message) => Object.assign(new Error(message), { photo: true });
const slugOf = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';

export function ScanMenuDialog({ open, photo, onPhoto, onOpenChange, tenantId, categories, onSuccess, maxProducts, currentProductCount, onLimitExceeded }) {
  const { t } = useAppText();
  const [imagePreview, setImagePreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [retakeOnly, setRetakeOnly] = useState(false);
  const [step, setStep] = useState('scan');
  const [partial, setPartial] = useState(false);
  const [pricesAsked, setPricesAsked] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const activeScan = useRef({ id: 0, controller: null });
  // The photo as sent and the full photo (for cutting pictures and the editor).
  const scanPhoto = useRef(null);
  const pictureUrls = useRef(new Set());
  const SUPABASE_URL = 'https://gzktuteedbtnaxfdylyu.supabase.co';
  const primaryGradient = 'var(--color-primary-gradient)';

  const keepUrl = (url) => { pictureUrls.current.add(url); return url; };
  const releasePhotos = useCallback(() => {
    pictureUrls.current.forEach((url) => URL.revokeObjectURL(url));
    pictureUrls.current.clear();
    scanPhoto.current = null;
  }, []);

  const cancelScan = useCallback(() => {
    activeScan.current.id += 1;
    activeScan.current.controller?.abort();
  }, []);
  const handleClose = () => {
    if (saving) return;
    cancelScan();
    onOpenChange(false);
  };
  useBackToClose(open, handleClose);

  const handleScan = useCallback(async file => {
    if (!file) return;
    cancelScan();
    const id = activeScan.current.id;
    const controller = new AbortController();
    activeScan.current.controller = controller;
    const current = () => activeScan.current.id === id && !controller.signal.aborted;
    setScanning(true); setError(null); setRetakeOnly(false); setStep('scan'); setImagePreview(null); setScannedItems([]);
    setPartial(false); setPricesAsked(false); setEditingId(null);
    releasePhotos();
    try {
      if (!file.size || (file.type && !file.type.startsWith('image/'))) throw photoProblem(appT('Please take a clear photo of your menu.'));
      let prepared;
      try {
        prepared = await prepareMenuPhoto(file);
      } catch (err) {
        throw photoProblem(err instanceof UnreadablePhotoError ? appT(UNREADABLE_PHOTO_MESSAGE) : appT('Could not read this photo. Please take another one.'));
      }
      if (prepared.full) keepUrl(prepared.full.url);
      if (!current()) return;
      scanPhoto.current = prepared;
      setImagePreview(prepared.full?.url || `data:${prepared.mediaType};base64,${prepared.base64}`);
      const { data: { session } } = await (await getSupabase()).auth.getSession();
      if (!current()) return;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/scanMenu`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          imageBase64: prepared.base64, mediaType: prepared.mediaType, tenantId,
          imageWidth: prepared.width, imageHeight: prepared.height, version: 2,
        }),
      });
      // The reply starts at once and ends with the answer (scanMenu v21).
      const text = await res.text();
      if (!current()) return;
      let data = {};
      try { data = JSON.parse(text); } catch { data = {}; }
      if (!res.ok || data.error) throw new Error(data.error || appT('Scan failed. Please try again.'));
      if (!data.items?.length) throw photoProblem(SCAN_REASONS[data.reason] ? appT(SCAN_REASONS[data.reason]) : appT('No items found. Try a clearer photo.'));
      const items = data.items.map((item, i) => ({
        ...item, _id: i, _selected: true, price: priceText(item.price), picture: null, image_url: null,
      }));
      setScannedItems(items);
      setPartial(!!data.partial);
      setStep('review');
      // Each item's own picture, cut from the full photo.
      if (prepared.full) {
        for (const item of items) {
          const rect = fullPhotoRect(item.photo, prepared, prepared.full);
          if (!rect) continue;
          const picture = await cutPicture(prepared.full.img, rect);
          if (picture) keepUrl(picture.url);
          if (!current()) return;
          if (picture) setScannedItems(prev => prev.map(p => (p._id === item._id && !p.picture ? { ...p, picture: { ...picture, rect, sized: true } } : p)));
        }
      }
    } catch (err) {
      if (current() && err.name !== 'AbortError') { setError(err.message || t('Scan failed. Please try again.')); setRetakeOnly(!!err.photo); }
    } finally {
      if (current()) setScanning(false);
    }
  }, [cancelScan, releasePhotos, tenantId]);

  useEffect(() => {
    if (!open) return undefined;
    if (photo) handleScan(photo);
    return () => { cancelScan(); releasePhotos(); };
  }, [open, photo, handleScan, cancelScan, releasePhotos]);

  const updateItem = (id, field, value) => setScannedItems(prev => prev.map(item => item._id === id ? { ...item, [field]: value } : item));
  const removeItem = (id) => setScannedItems(prev => prev.filter(item => item._id !== id));
  const toggleItem = (id) => setScannedItems(prev => prev.map(item => item._id === id ? { ...item, _selected: !item._selected } : item));

  // From the photo editor: the new picture (a data URL), or null to have none. A part boxed on
  // the menu photo (onMenu, crop) keeps its place, for the editor to open there next time.
  const savePicture = async (id, dataUrl, onMenu, info) => {
    if (!dataUrl) { updateItem(id, 'picture', null); return; }
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const url = keepUrl(URL.createObjectURL(blob));
      updateItem(id, 'picture', { blob, url, type: blob.type, ext: extFor(blob.type), rect: (onMenu && info?.crop) || null });
    } catch {
      toast.error(t('Couldn’t keep that photo. Please try again.'));
    }
  };

  const handleSave = async () => {
    const selected = scannedItems.filter(i => i._selected);
    if (!selected.length) return;
    const noPrice = selected.filter(i => typedPrice(i.price) == null).length;
    if (noPrice) {
      setPricesAsked(true);
      setError(noPrice === 1
        ? appT('Add a price for 1 selected item, or deselect it.')
        : appT('Add a price for {count} selected items, or deselect them.', { count: noPrice }));
      return;
    }
    // Enforce the plan's product limit — don't let a scan push the merchant over their cap.
    if (maxProducts != null && (currentProductCount + selected.length) > maxProducts) {
      const remaining = Math.max(maxProducts - currentProductCount, 0);
      setError(remaining === 1
        ? appT('Your plan allows up to {max} products (1 slot left). Deselect some items or upgrade your plan to add all {count}.', { max: maxProducts, count: selected.length })
        : appT('Your plan allows up to {max} products ({remaining} slots left). Deselect some items or upgrade your plan to add all {count}.', { max: maxProducts, remaining, count: selected.length }));
      return;
    }
    setSaving(true); setError(null);
    const uploaded = [];
    try {
      const supabase = await getSupabase();
      // Items in the menu's order: numbered after the shop's highest number, so a second photo
      // of a long menu follows the first. Saved in one go they all have the same time, so the
      // lists showed them in a random order (20 Nov 2026).
      const { data: lastItem, error: orderError } = await supabase.from('products').select('sort_order')
        .eq('tenant_id', tenantId).order('sort_order', { ascending: false }).limit(1);
      if (orderError) throw orderError;
      const firstItemOrder = nextSortOrder(lastItem);
      // The photos first: a product is only saved with its photo in place.
      const photoUrls = {};
      for (const item of selected) {
        if (!item.picture?.blob) continue;
        // A picture cut from the menu is made at item-photo size; one saved from the editor
        // (up to 2400 px) is shrunk like any item photo.
        const shrunk = item.picture.sized
          ? { blob: item.picture.blob, type: item.picture.type, ext: item.picture.ext }
          : await shrinkImage(item.picture.blob, { maxSide: PHOTO_MAX_SIDE });
        const path = `${tenantId}/products/${Date.now()}-${slugOf(item.name)}-${item._id}.${shrunk.ext}`;
        const { error: uploadError } = await supabase.storage.from('product-images').upload(path, shrunk.blob, { contentType: shrunk.type, upsert: true, cacheControl: LONG_CACHE });
        if (uploadError) throw uploadError;
        uploaded.push(path);
        photoUrls[item._id] = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
      }
      const uniqueCats = [...new Set(selected.map(i => i.category).filter(Boolean))];
      const catMap = {};
      categories.forEach(c => { catMap[c.name.toLowerCase()] = c.id; });
      // New sections go after the shop's own, in the menu's order (as the Categories page adds
      // one). They used to be saved at 0, so the lists sorted them by name: "Beverages" above
      // the mains printed before it (20 Nov 2026).
      let nextCategoryOrder = nextSortOrder(categories);
      for (const catName of uniqueCats) {
        if (!catMap[catName.toLowerCase()]) {
          const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
          const { data: newCat } = await supabase.from('categories').insert({ tenant_id: tenantId, name: catName, slug, is_active: true, sort_order: nextCategoryOrder++ }).select().single();
          if (newCat) catMap[catName.toLowerCase()] = newCat.id;
        }
      }
      const productRows = selected.map((item, index) => ({
        tenant_id: tenantId,
        name: item.name,
        price: typedPrice(item.price),
        description: item.description || null,
        category_id: catMap[item.category?.toLowerCase()] || null,
        image_url: photoUrls[item._id] || item.image_url || null,
        slug: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now() + Math.random().toString(36).slice(2, 5),
        is_active: true,
        variants: cleanScannedOptions(item.variants),
        sort_order: firstItemOrder + index,
      }));
      const { data: insertedProducts, error: prodError } = await supabase.from('products').insert(productRows).select();
      if (prodError) throw prodError;
      if (insertedProducts?.length) {
        await supabase.from('inventory_items').insert(insertedProducts.map(p => ({ tenant_id: tenantId, product_id: p.id, current_stock: 0, low_stock_threshold: 5, par_level: 0, unit: 'pcs' })));
      }
      setStep('done');
      onSuccess?.();
    } catch (e) {
      // Nothing was added: the photos uploaded for it go too.
      if (uploaded.length) {
        try { await (await getSupabase()).storage.from('product-images').remove(uploaded); } catch { /* best effort */ }
      }
      setError(explainError(e, { t }).description);
    } finally { setSaving(false); }
  };

  if (!open) return null;
  const selectedCount = scannedItems.filter(i => i._selected).length;
  const needPrice = scannedItems.filter(i => i._selected && typedPrice(i.price) == null).length;
  const hasPictures = scannedItems.some(i => i.picture);
  const editing = scannedItems.find(i => i._id === editingId) || null;
  const fullPhoto = scanPhoto.current?.full || null;
  // The editor opens on the whole menu with the item's picture boxed (where it was cut, or where
  // the AI saw it), or nothing boxed; a photo chosen instead, or turned, opens on its own.
  const editorOnMenu = !!(editing && fullPhoto && (!editing.picture || editing.picture.rect));
  const editorBox = editorOnMenu ? (editing.picture?.rect || fullPhotoRect(editing.photo, scanPhoto.current, fullPhoto)) : null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="scan-menu-title" data-pull-refresh-block onKeyDown={event => { if (event.key === 'Escape' && !editing) handleClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ width: '100%', maxWidth: 560, background: 'white', borderRadius: '20px 20px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(var(--color-primary), 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ScanLine size={18} color="rgb(var(--color-primary))" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p id="scan-menu-title" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{t('Scan Menu')}</p>
            <p style={{ margin: '1px 0 0', fontSize: 12, color: '#64748b' }}>
              {step === 'scan' && (scanning ? t('Reading your menu…') : retakeOnly ? t('Take another photo') : t('Try again or take another photo'))}
              {step === 'review' && t('{count} items found — review before saving', { count: scannedItems.length })}
              {step === 'done' && t('Products added successfully!')}
            </p>
          </div>
          <button type="button" aria-label={t('Close menu scan')} disabled={saving} autoFocus onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, display: 'flex', alignItems: 'center' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* Extraction starts as soon as the native camera returns a photo. */}
          {step === 'scan' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {imagePreview && <img src={imagePreview} alt={t('Menu being scanned')} style={{ maxHeight: 220, maxWidth: '100%', borderRadius: 12, objectFit: 'contain', margin: '0 auto' }} />}
              {scanning && <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-8 text-slate-600"><Loader2 size={22} className="animate-spin" /><span>{t('Reading your menu…')}</span></div>}
              {error && (
                <>
                  <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={16} style={{ flexShrink: 0 }} />{error}</div>
                  <div className="flex gap-2">
                    {!retakeOnly && <button type="button" onClick={() => handleScan(photo)} className="flex-1 rounded-lg px-3 py-3 text-sm font-semibold text-white" style={{ background: primaryGradient }}>{t('Try Again')}</button>}
                    <NativeCameraScanControl label={t('Retake menu photo')} onFile={onPhoto} onError={message => toast.message(message)}
                      className={retakeOnly
                        ? 'flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold text-white cursor-pointer'
                        : 'flex-1 flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-600 cursor-pointer'}
                      style={retakeOnly ? { background: primaryGradient } : undefined}><ScanLine size={16} />{t('Retake')}</NativeCameraScanControl>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step: Review */}
          {step === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {partial && (
                <div data-testid="scan-partial" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: '#92400e' }}>
                  {t('This menu is long, so only part of it was read. Scan the rest in another photo.')}
                </div>
              )}
              {needPrice > 0 && (
                <div data-testid="scan-need-price" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: '#92400e' }}>
                  {needPrice === 1 ? t('1 item has no price on the menu. Add it below, or deselect it.') : t('{count} items have no price on the menu. Add them below, or deselect them.', { count: needPrice })}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                  {t('{selectedCount} of {count} selected', { selectedCount, count: scannedItems.length })}
                  {hasPictures && <span data-testid="scan-photo-hint"> · {t('Tap a photo to change it')}</span>}
                </p>
                <button onClick={() => setScannedItems(prev => prev.map(i => ({ ...i, _selected: true })))} style={{ fontSize: 12, color: 'rgb(var(--color-primary))', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>{t('Select all')}</button>
              </div>

              {scannedItems.map(item => {
                const missing = item._selected && typedPrice(item.price) == null;
                const canEditPhoto = !!(fullPhoto || item.picture);
                const photoLabel = t('Photo for {name}', { name: item.name || t('this item') });
                return (
                  <div key={item._id} data-testid="scan-item" style={{ background: item._selected ? 'rgba(var(--color-primary), 0.04)' : '#f8fafc', border: `1px solid ${item._selected ? 'rgba(var(--color-primary), 0.25)' : '#e2e8f0'}`, borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>

                    {/* Checkbox */}
                    <input type="checkbox" checked={item._selected} onChange={() => toggleItem(item._id)} aria-label={item.name} style={{ width: 16, height: 16, accentColor: 'rgb(var(--color-primary))', flexShrink: 0, marginTop: 3 }} />

                    {/* Its photo: tap to change it */}
                    <button type="button" data-testid="scan-item-photo" aria-label={photoLabel} disabled={!canEditPhoto} onClick={() => setEditingId(item._id)}
                      style={{ position: 'relative', width: 52, height: 52, borderRadius: 8, background: '#f1f5f9', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', padding: 0, cursor: canEditPhoto ? 'pointer' : 'default' }}>
                      {item.picture
                        ? <img src={item.picture.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <ImageIcon size={16} color="#cbd5e1" />}
                      {canEditPhoto && (
                        <span aria-hidden="true" style={{ position: 'absolute', right: 2, bottom: 2, width: 16, height: 16, borderRadius: 999, background: 'rgba(15,23,42,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {item.picture ? <Pencil size={9} color="white" /> : <Plus size={10} color="white" />}
                        </span>
                      )}
                    </button>

                    {/* Fields */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* Name row */}
                      <input
                        value={item.name}
                        onChange={e => updateItem(item._id, 'name', e.target.value)}
                        style={{ width: '100%', fontWeight: 600, fontSize: 13, color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', outline: 'none', background: 'white', boxSizing: 'border-box' }}
                        placeholder={t('Product name')}
                      />
                      {/* Price + Category row */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div data-testid="scan-item-price" data-missing={missing ? 'yes' : 'no'} style={{ display: 'flex', alignItems: 'center', border: missing ? `1.5px ${pricesAsked ? 'solid #ef4444' : 'dashed #f59e0b'}` : '1px solid #e2e8f0', borderRadius: 6, background: missing ? '#fffbeb' : 'white', overflow: 'hidden', width: 96, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', padding: '0 4px 0 6px', fontWeight: 500 }}>$</span>
                          <input type="number" inputMode="decimal" min="0" step="0.01" value={item.price} placeholder={t('Add price')} aria-label={t('Price')} aria-invalid={missing && pricesAsked ? 'true' : undefined}
                            onChange={e => updateItem(item._id, 'price', e.target.value)}
                            style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'rgb(var(--color-primary))', border: 'none', outline: 'none', padding: '4px 6px 4px 0', background: 'transparent', width: '100%', minWidth: 0 }} />
                        </div>
                        <input value={item.category || ''} onChange={e => updateItem(item._id, 'category', e.target.value)} placeholder={t('Category')} style={{ flex: 1, fontSize: 11, color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', background: 'white', outline: 'none', minWidth: 0 }} />
                      </div>
                      {/* Description row */}
                      <input value={item.description || ''} onChange={e => updateItem(item._id, 'description', e.target.value)} placeholder={t('Description (optional)')} style={{ width: '100%', fontSize: 11, color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
                      {item.variants?.length > 0 && (
                        <p data-testid="scan-item-options" style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                          {item.variants.map(group => `${group.name}: ${group.options.map(o => (o.price_modifier > 0 ? `${o.label} +${priceText(Number(o.price_modifier))}` : o.label)).join(' / ')}`).join(' · ')}
                        </p>
                      )}
                    </div>

                    {/* Delete */}
                    <button onClick={() => removeItem(item._id)} aria-label={t('Remove {name}', { name: item.name || t('this item') })} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', color: '#ef4444', padding: '4px 6px', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}

              {error && (
                <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span>{error}</span>
                  {maxProducts != null && (currentProductCount + selectedCount) > maxProducts && sellsPlans() && (
                    <button
                      onClick={() => { handleClose(); onLimitExceeded?.(); }}
                      style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 8, border: 'none', background: '#dc2626', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      {t('Upgrade Plan')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 16 }}>
              <CheckCircle2 size={56} color="#10b981" />
              <p style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>{t('Products Added!')}</p>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0, textAlign: 'center' }}>{t('{selectedCount} products have been added to your catalog.', { selectedCount })}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'review' && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, flexShrink: 0 }}>
            <NativeCameraScanControl label={t('Scan another menu photo')} disabled={saving} onFile={onPhoto} onError={message => toast.message(message)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ScanLine size={14} />{' '}{t('Retake')}
            </NativeCameraScanControl>
            <button onClick={handleSave} disabled={saving || !selectedCount} style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', background: saving || !selectedCount ? '#cbd5e1' : primaryGradient, color: 'white', fontSize: 13, fontWeight: 700, cursor: saving || !selectedCount ? 'not-allowed' : 'pointer' }}>
              {saving ? t('Saving...') : t('Add {selectedCount} Products', { selectedCount })}
            </button>
          </div>
        )}
        {step === 'done' && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
            <button onClick={handleClose} style={{ width: '100%', padding: 11, borderRadius: 10, border: 'none', background: primaryGradient, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{t('Done')}</button>
          </div>
        )}
      </div>

      {/* The photo editor on the whole menu, with this item's picture boxed. */}
      {editing && (
        <ImageEditModal
          src={editorOnMenu ? fullPhoto.url : editing.picture?.url}
          initialCrop={editorBox}
          canvasMaxHeight={typeof window !== 'undefined' ? Math.round(Math.min(window.innerHeight * 0.55, 560)) : 300}
          themeColor="rgb(var(--color-primary))"
          title={t('Photo for {name}', { name: editing.name || t('this item') })}
          recommendation={editorOnMenu ? (editorBox
            ? t('Move the box onto its picture, then tap Apply and Save.')
            : t('Tap Crop to box its picture on the menu, or Replace to choose a photo.')) : ''}
          onSave={(dataUrl, info) => savePicture(editing._id, dataUrl, editorOnMenu, info)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

// embedded: inside My listings (Explore), which has its own title, Orders and bell.
// A free shop has only My listings: its old Manage listings address opens it.
export default function Products({ embedded = false } = {}) {
  const { t } = useAppText();
  const { tenantId, tenant, subscription, hasPermission, canUseFeature } = useTenant();
  const toMyListings = !embedded && isShopTenant(tenant);
  const isListings = tenant?.seller_type === 'individual';
  // A free personal shop: "Listings" and no menu scan (its plan); Inventory when its plan has it.
  const words = itemWords(tenant?.seller_type, t);
  const canScanMenu = !canUseFeature || canUseFeature('can_scan_menu');
  const canUseInventory = !canUseFeature || canUseFeature('can_use_inventory');
  const productsTour = useProductTour('products');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // My listings opens as a grid of cards; Manage products as a list (each remembered).
  const viewKey = embedded ? 'listings_view_mode' : 'products_view_mode';
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem(viewKey) || (embedded ? 'grid' : 'list'); } catch { return embedded ? 'grid' : 'list'; }
  });

  const handleViewToggle = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem(viewKey, mode); } catch { /* storage unavailable */ }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingProduct, setEditingProduct] = useState(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [scanMenuOpen, setScanMenuOpen] = useState(false);
  const [scanPhoto, setScanPhoto] = useState(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [showDialog, setShowDialog] = useState(false);
  useBackToClose(showDialog, () => setShowDialog(false));

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const [{ data: rawProducts, error }, { data: inventoryItems }] = await Promise.all([
        applyCanonicalProductOrder(
          supabase.from('products').select('*').eq('tenant_id', tenantId)
        ),
        supabase.from('inventory_items').select('product_id, current_stock, low_stock_threshold').eq('tenant_id', tenantId),
      ]);
      if (error) throw error;
      return (rawProducts || []).map(p => {
        const inv = inventoryItems?.find(i => i.product_id === p.id);
        return {
          ...p,
          current_stock: inv?.current_stock ?? 0,
          low_stock_threshold: inv?.low_stock_threshold ?? 10,
        };
      });
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      // Same shape + order as the Categories page (shared query cache key).
      const { data } = await supabase
        .from('categories')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Filter products. A search finds names and descriptions; spaces either side don't count
  // (phone keyboards add one after a word).
  const searchText = searchQuery.trim();
  const productFound = (product, text) => {
    const q = text.trim().toLowerCase();
    return !!(product.name?.toLowerCase().includes(q) || product.description?.toLowerCase().includes(q));
  };
  const filtersOn = categoryFilter !== 'all' || statusFilter !== 'all';
  const passesFilters = (product) => {
    const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter;
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && product.is_active) ||
      (statusFilter === 'inactive' && !product.is_active) ||
      (statusFilter === 'low_stock' && product.current_stock <= product.low_stock_threshold);
    return matchesCategory && matchesStatus;
  };
  const filteredProducts = products.filter(product => (!searchText || productFound(product, searchText)) && passesFilters(product));
  // A search that finds nothing (UX state 6): say if the filters hide what it finds, else
  // offer the likely spelling of a name.
  const searchMissed = !!searchText && filteredProducts.length === 0 && products.length > 0;
  const hiddenByFilters = searchMissed && filtersOn ? products.filter(p => productFound(p, searchText)).length : 0;
  const searchSuggestion = searchMissed && !hiddenByFilters
    ? didYouMean(
        searchText,
        products.filter(passesFilters).map(p => p.name).filter(Boolean),
        text => products.some(p => passesFilters(p) && productFound(p, text)),
      )
    : null;
  const showAllProducts = () => { setCategoryFilter('all'); setStatusFilter('all'); };

  const handleEdit = (product) => {
    // FIX: previously any user who could see the Products page could click into any
    // product regardless of edit permission — Save/Delete were hidden inside the dialog,
    // but the dialog itself still opened, which read as "I can almost edit this" rather
    // than a clean no-access state. Block the click entirely for view-only users instead.
    if (!hasPermission('products.edit')) {
      toast.error(t('You don\'t have access to edit products.'));
      return;
    }
    setEditingProduct(product);
    setShowDialog(true);
  };

  // null max_products = unlimited (Pro plan). From the store's entitlements once
  // they load (plan defaults + per-store overrides), else the subscription row.
  const { maxProducts: entitlementMaxProducts } = useSubscription();
  const maxProducts = entitlementMaxProducts !== undefined ? entitlementMaxProducts : (subscription?.max_products ?? null);
  const atProductLimit = maxProducts != null && products.length >= maxProducts;

  const handleAdd = () => {
    if (atProductLimit) { setUpgradeModalOpen(true); return; }
    setEditingProduct(null);
    setShowDialog(true);
  };

  // "Sell" (bottom bar, Explore) opens Products?new=1: once the list has loaded (so
  // the plan's listing limit applies), start a new listing and drop the flag.
  // "Edit listing" on an Explore listing page opens Products?edit=<id> the same way.
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editId = params.get('edit');
    const wantsNew = params.get('new') === '1';
    if (toMyListings || !tenantId || isLoading || (!wantsNew && !editId)) return;
    params.delete('new');
    params.delete('edit');
    const query = params.toString();
    navigate({ search: query ? `?${query}` : '' }, { replace: true });
    if (wantsNew) {
      if (hasPermission('products.create')) handleAdd();
    } else {
      const product = products.find((p) => String(p.id) === editId);
      if (product) handleEdit(product);
    }
  }, [location.search, isLoading, tenantId, toMyListings]); // eslint-disable-line react-hooks/exhaustive-deps

  const canOpenScan = () => {
    if (atProductLimit) { setUpgradeModalOpen(true); return false; }
    return true;
  };
  const handleScanPhoto = file => {
    if (!canOpenScan()) return;
    setScanPhoto(file);
    setScanMenuOpen(true);
  };
  const handleScanOpenChange = open => {
    setScanMenuOpen(open);
    if (!open) setScanPhoto(null);
  };

  const csvEscape = (val) => {
    const s = val == null ? '' : String(val);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const handleDownloadTemplate = () => {
    const csv = [CSV_HEADERS.join(','), ...TEMPLATE_ROWS].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    if (inAppFiles()) {
      saveFileInApp(blob, 'product_import_template.csv', { tenantId, label: t('Template') });
      return;
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const rows = products.map(p => [
      p.name || '',
      p.sku || '',
      p.description || '',
      categories.find(c => c.id === p.category_id)?.name || '',
      p.price ?? '',
      p.cost_price ?? '',
      p.compare_at_price ?? '',
      p.stock_quantity !== null && p.stock_quantity !== undefined ? p.stock_quantity : '',
      p.low_stock_threshold ?? '',
      String(p.track_inventory ?? false),
      String(p.is_active ?? true),
      String(p.is_featured ?? false),
      Array.isArray(p.tags) ? p.tags.join(',') : (p.tags || ''),
      variantsToSimpleFormat(p.variants),
      p.image_url || '',
      Array.isArray(p.images) && p.images.length > 0 ? p.images.join(';') : '',
    ].map(csvEscape).join(','));

    const csv = [CSV_HEADERS.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    if (inAppFiles()) {
      saveFileInApp(blob, `products_export_${new Date().toISOString().split('T')[0]}.csv`, { tenantId, label: t('Product list') });
      return;
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleLongPress = (productId) => {
    // FIX: long-press multi-select only exists to enable bulk delete — with no
    // products.delete permission there's nothing useful it can do, so don't let it
    // open at all (previously it opened regardless, and only the toolbar's Delete
    // button itself was ever meant to be the gate — except that button wasn't gated
    // either, so a view/edit-only Manager could still bulk-delete products).
    if (!hasPermission('products.delete')) return;
    setSelectionMode(true);
    setSelectedIds(new Set([productId]));
  };

  const handleToggleSelect = (productId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(filteredProducts.map(p => p.id)));
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setDeleteConfirm(false);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size || !hasPermission('products.delete')) return;
    try {
      const supabase = await getSupabase();
      const ids = [...selectedIds];
      await supabase.from('inventory_items').delete().in('product_id', ids);
      await supabase.from('products').delete().in('id', ids);
      await queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      await queryClient.invalidateQueries({ queryKey: ['productCount', tenantId] });
      handleCancelSelection();
    } catch (e) {
      console.error('Bulk delete failed:', e);
    }
  };

  if (toMyListings) return <Navigate to={`/explore/listings${location.search}`} replace />;

  return (
    <RequirePermission permission="products.view">
      <div className={embedded ? 'space-y-4' : 'space-y-6'}>
        <div className={embedded ? 'flex flex-col gap-3' : 'flex flex-col gap-3 mb-6'}>
          {!embedded && (<>
          <div data-tour="products-header" className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold text-slate-900">{tenant?.seller_type === 'individual' ? t('Manage listings') : words.Products}</h1>
            {canUseInventory && (
            <button
              onClick={() => navigate('/Inventory')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors"
              style={{ border: '1.5px solid rgb(var(--color-primary))', color: 'rgb(var(--color-primary))', background: 'rgba(var(--color-primary), 0.08)' }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--color-primary-gradient)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(var(--color-primary), 0.08)';
                e.currentTarget.style.color = 'rgb(var(--color-primary))';
              }}
            >
              <Package className="w-4 h-4" />{' '}{t('Inventory')}
            </button>
            )}
          </div>
          <p className="text-sm text-slate-500 -mt-3">{tenant?.seller_type === 'individual' ? t('Add, edit and hide what you sell') : t('Manage your product catalog')}</p>
          </>)}
          <div {...(embedded ? { 'data-tour': 'products-header' } : {})} className="flex flex-wrap items-center gap-2">
              <RequirePermission permission="products.create" silent>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {/* My listings: icons only. Manage products: icons on phones, words on wider screens. */}
                  <Button variant="outline" size="sm" aria-label={t('Download {products}', { products: words.products })} title={t('Download {products}', { products: words.products })} className={embedded ? 'w-9 px-0' : undefined}>
                    <Download className={embedded ? 'w-4 h-4' : 'w-4 h-4 sm:mr-2'} />
                    {!embedded && <span className="hidden sm:inline">{t('Download')}</span>}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleDownloadTemplate}>
                    <FileDown className="w-4 h-4 mr-2" />
                    {t('Download Template')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExport}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    {t('Export All {Products}', { Products: words.Products })}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={() => setImportDialogOpen(true)} variant="outline" size="sm" aria-label={t('Import {products}', { products: words.products })} title={t('Import {products}', { products: words.products })} className={embedded ? 'w-9 px-0' : undefined}>
                  <Upload className={embedded ? 'w-4 h-4' : 'w-4 h-4 sm:mr-2'} />
                  {!embedded && <span className="hidden sm:inline">{t('Import')}</span>}
                </Button>
                {canScanMenu && (
                <NativeCameraScanControl
                  data-tour="scan-menu-btn"
                  label={t('Scan menu with camera')}
                  onBeforeOpen={canOpenScan}
                  onFile={handleScanPhoto}
                  onError={message => toast.message(message)}
                  className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium cursor-pointer transition-colors ${atProductLimit ? 'gap-1.5 border-slate-300 text-slate-400' : 'gap-1.5 border-orange-300 text-orange-600 hover:bg-orange-50'}`}
                  title={atProductLimit ? t('{Product} limit reached ({maxProducts}) — upgrade to add more', { Product: words.Product, maxProducts }) : undefined}
                >
                  <ScanLine className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{t('Scan Menu')}</span>
                  <span className="sm:hidden">{t('Scan')}</span>
                </NativeCameraScanControl>
                )}
                {/* My listings: Download · Upload · + Add, with Inventory on the right. */}
                <Button
                  data-tour="add-product-btn"
                  onClick={handleAdd}
                  size="sm"
                  aria-label={embedded && !atProductLimit ? t('Add {product}', { product: words.product }) : undefined}
                  className="text-white gap-1.5"
                  style={{ background: atProductLimit ? '#cbd5e1' : 'var(--color-primary-gradient)' }}
                  title={atProductLimit ? t('{Product} limit reached ({maxProducts}) — upgrade to add more', { Product: words.Product, maxProducts }) : undefined}
                >
                  <Plus className="w-4 h-4" />
                  {embedded ? (
                    <span>{atProductLimit ? t('Limit reached') : t('Add')}</span>
                  ) : (<>
                  <span className="hidden sm:inline">{atProductLimit ? t('Limit Reached') : t('Add {Product}', { Product: words.Product })}</span>
                  <span className="sm:hidden">{atProductLimit ? t('Limit') : t('Add')}</span>
                  </>)}
                </Button>
              </RequirePermission>
              {embedded && canUseInventory && hasPermission('inventory.view') && (
                <Button onClick={() => navigate('/Inventory')} variant="outline" size="sm" className="ml-auto">
                  <Package className="w-4 h-4 mr-1.5" />{' '}{t('Inventory')}
                </Button>
              )}
          </div>
        </div>

        {/* Selection toolbar — fixed on mobile so it stays reachable while scrolling a long
            product list, without touching any shared/global layout CSS (position:sticky
            here previously required loosening overflow-x-hidden on <main>, which caused a
            page-wide horizontal-overflow regression elsewhere — position:fixed avoids that
            entirely since it isn't affected by an ancestor's overflow property). On desktop
            it stays in normal flow like before, since the product list rarely needs scrolling
            past the toolbar there. */}
        {selectionMode && (
          <>
            {window.innerWidth < 1024 && <div style={{ height: 60 }} />}
            <div
              style={
                window.innerWidth < 1024
                  ? { position: 'fixed', top: 'calc(56px + env(safe-area-inset-top, 0px) + 8px)', left: 8, right: 8, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'white', borderRadius: 12, border: '1px solid rgba(var(--color-primary), 0.25)', boxShadow: '0 4px 16px rgba(15, 23, 42, 0.12)' }
                  : { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(var(--color-primary), 0.06)', borderRadius: 12, border: '1px solid rgba(var(--color-primary), 0.2)', marginBottom: 4 }
              }
            >
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'rgb(var(--color-primary))' }}>
              {t('{size} selected', { size: selectedIds.size })}
            </span>
            <button onClick={handleSelectAll} style={{ fontSize: 12, fontWeight: 600, color: 'rgb(var(--color-primary))', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
              {t('Select all ({count})', { count: filteredProducts.length })}
            </button>
            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                disabled={!selectedIds.size}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: 'none', background: selectedIds.size ? '#ef4444' : '#cbd5e1', color: 'white', fontSize: 12, fontWeight: 700, cursor: selectedIds.size ? 'pointer' : 'not-allowed' }}
              >
                <Trash2 size={13} />{' '}{t('Delete')}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>{t('Delete {size}?', { size: selectedIds.size })}</span>
                <button onClick={handleBulkDelete} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#ef4444', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{t('Yes')}</button>
                <button onClick={() => setDeleteConfirm(false)} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>{t('No')}</button>
              </div>
            )}
            <button onClick={handleCancelSelection} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
              <X size={18} />
            </button>
            </div>
          </>
        )}

        {/* Filters and View Toggle (fits a narrow phone: the grid/list switch sits beside
            the search, the two filters share the row below) */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder={t('Search {products}...', { products: words.products })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-11"
            />
          </div>
            {/* View Toggle */}
            <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 3, flexShrink: 0 }}>
              <button
                onClick={() => handleViewToggle('grid')}
                aria-label={t('Show as a grid')}
                aria-pressed={viewMode === 'grid'}
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'grid' ? 'white' : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: viewMode === 'grid' ? '#6366f1' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => handleViewToggle('list')}
                aria-label={t('Show as a list')}
                aria-pressed={viewMode === 'list'}
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'list' ? 'white' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: viewMode === 'list' ? '#6366f1' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <List size={16} />
              </button>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            {/* Category Filter */}
            {!(embedded && categories.length === 0) && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="flex-1 min-w-0" style={{ height: 36, background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('All Categories')}</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            )}

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="flex-1 min-w-0" style={{ height: 36, background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isListings ? t('All listings') : t('All Status')}</SelectItem>
                <SelectItem value="active">{isListings ? t('Showing') : t('Active')}</SelectItem>
                <SelectItem value="inactive">{isListings ? t('Hidden') : t('Inactive')}</SelectItem>
                <SelectItem value="low_stock">{isListings ? t('Low stock') : t('Low Stock')}</SelectItem>
              </SelectContent>
            </Select>

          </div>
        </div>

        {/* Products Display */}
        {isLoading ? (
          <LoadingShapes label={t('Loading products')} t={t}><SkeletonList count={5} lines={2} imageSize={64} /></LoadingShapes>
        ) : filteredProducts.length === 0 && products.length > 0 && searchText ? (
          hiddenByFilters > 0 ? (
            <NoMatches
              title={t('No {products} match “{searchText}”', { products: words.products, searchText })}
              text={hiddenByFilters === 1 ? t('Your filters hide one {product} that matches.', { product: words.product }) : t('Your filters hide {count} {products} that match.', { count: hiddenByFilters, products: words.products })}
              actionLabel={t('Show all {products}', { products: words.products })}
              onAction={showAllProducts}
            />
          ) : searchSuggestion ? (
            <NoMatches
              title={t('No {products} match “{searchText}”', { products: words.products, searchText })}
              text={<DidYouMean suggestion={searchSuggestion} onPick={setSearchQuery} t={t} />}
              actionLabel={t('Search “{searchSuggestion}”', { searchSuggestion })}
              onAction={() => setSearchQuery(searchSuggestion)}
            />
          ) : (
            <NoMatches
              title={t('No {products} match “{searchText}”', { products: words.products, searchText })}
              text={t('Search looks at names and descriptions.')}
              actionLabel={t('Clear search')}
              onAction={() => setSearchQuery('')}
            />
          )
        ) : filteredProducts.length === 0 && products.length > 0 && filtersOn ? (
          <NoMatches
            title={t('No {products} match these filters', { products: words.products })}
            text={t('Try another category or status.')}
            actionLabel={t('Show all {products}', { products: words.products })}
            onAction={showAllProducts}
          />
        ) : filteredProducts.length === 0 ? (
          <>
            <EmptyState
              icon={ShoppingBag}
              title={t('No {products} yet', { products: words.products })}
              description={isListings ? t('Add a photo, a name and a price. It shows on Explore straight away.')
                : t('Start building your catalog by adding your first {product}', { product: words.product })}
              actionLabel={t('Add {Product}', { Product: words.Product })}
              onAction={handleAdd}
            />
            {/* Tour needs a card to point at even with zero real products yet */}
            {productsTour.eligible && (
              <div className="max-w-[220px] mt-4">
                <DummyProductCard currency={tenant?.currency || 'SGD'} />
              </div>
            )}
          </>
        ) : (() => {
          // Group by category in menu order (same order staff and customers see),
          // unless the user is filtering or searching, which stays a flat list.
          const gridProps = {
            onEdit: handleEdit,
            currency: tenant?.currency || 'SGD',
            viewMode,
            selectionMode,
            selectedIds,
            onLongPress: handleLongPress,
            onToggleSelect: handleToggleSelect,
            variant: embedded ? 'listing' : 'product',
          };
          // My listings: how many, like before.
          const count = embedded ? (
            <p className="text-sm text-slate-500 -mb-1">
              {filteredProducts.length === products.length
                ? (products.length === 1 ? t('1 {product}', { product: words.product }) : t('{count} {products}', { count: products.length, products: words.products }))
                : t('{count} of {count2} {products}', { count: filteredProducts.length, count2: products.length, products: words.products })}
            </p>
          ) : null;
          if (categoryFilter !== 'all' || searchQuery) {
            return <>{count}<ProductGrid products={filteredProducts} {...gridProps} tourTagFirstCard={productsTour.eligible} /></>;
          }
          const knownIds = new Set(categories.map(c => c.id));
          const groups = [
            ...categories.map(c => ({ key: c.id, name: c.name, items: filteredProducts.filter(p => p.category_id === c.id) })),
            { key: 'uncategorized', name: t('Uncategorized'), items: filteredProducts.filter(p => !p.category_id || !knownIds.has(p.category_id)) },
          ].filter(g => g.items.length > 0);
          // Nothing grouped (a shop without categories): one plain list in My listings.
          if (embedded && groups.length === 1 && groups[0].key === 'uncategorized') {
            return <>{count}<ProductGrid products={filteredProducts} {...gridProps} tourTagFirstCard={productsTour.eligible} /></>;
          }
          return (
            <div className={embedded ? 'space-y-5' : 'space-y-6'}>
              {count}
              {groups.map((g, i) => (
                <section key={g.key}>
                  <div className="flex items-baseline gap-2 mb-3">
                    <h2 className="text-sm font-semibold text-slate-700">{g.name}</h2>
                    <span className="text-xs text-slate-400">{g.items.length}</span>
                  </div>
                  <ProductGrid products={g.items} {...gridProps} tourTagFirstCard={productsTour.eligible && i === 0} />
                </section>
              ))}
            </div>
          );
        })()}

        {productsTour.eligible && (
          <TourGuide
            steps={getProductsSteps({ tier: subscription?.tier, listings: tenant?.seller_type === 'individual' })}
            run={productsTour.eligible}
            onFinish={productsTour.completeStage}
            tour={productsTour}
          />
        )}

        {/* Product Form Dialog */}
        <ProductFormDialog
          open={showDialog}
          onOpenChange={setShowDialog}
          product={editingProduct}
          tenantId={tenantId}
        />

        {/* Product Import Dialog */}
        <ProductImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          tenantId={tenantId}
          categories={categories}
        />

        {/* Scan Menu Dialog */}
        <ScanMenuDialog
          open={scanMenuOpen}
          onOpenChange={handleScanOpenChange}
          photo={scanPhoto}
          onPhoto={handleScanPhoto}
          tenantId={tenantId}
          categories={categories}
          maxProducts={maxProducts}
          currentProductCount={products.length}
          onLimitExceeded={() => setUpgradeModalOpen(true)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
            queryClient.invalidateQueries({ queryKey: ['categories', tenantId] });
            queryClient.invalidateQueries({ queryKey: ['productCount', tenantId] });
          }}
        />

        {/* Plan upgrade prompt — shown when the merchant hits their plan's product limit */}
        <PricingModal
          open={upgradeModalOpen}
          onOpenChange={setUpgradeModalOpen}
          tenantId={tenantId}
          currentTier={subscription?.tier ?? null}
        />
      </div>
    </RequirePermission>
  );
}