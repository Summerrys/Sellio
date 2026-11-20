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
import { ShoppingBag, Plus, Search, LayoutGrid, List, Upload, Download, FileDown, FileSpreadsheet, Package, ScanLine, Trash2, AlertCircle, Loader2, X, GripVertical } from 'lucide-react';
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
import { explainError, showError } from '@/lib/plainError';
import ImageEditModal from '@/components/onboarding/ImageEditModal';
import DeleteProductsSheet from '../components/products/DeleteProductsSheet';
import { planMove, withSortOrders } from '@/lib/productOrder';
import Celebrate from '@/components/ui-custom/Celebrate';
import { ScanReviewList, ScanItemSheet, DescriptionsStrip, PhotosStrip, groupScanItems, SCAN_REVIEW_CSS } from '@/components/products/ScanReview';
import { useSamplePhotoFinder, samplePicture, findSamplePhotos, reportUsedPhotos, SEARCH_FAILED } from '@/lib/samplePhotos';
import useDescriptionWriter from '@/lib/useDescriptionWriter';
import { describeItems, CANT_WRITE } from '@/lib/menuDescriptions';

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

export function ScanMenuDialog({ open, photo, onPhoto, onOpenChange, tenantId, categories, onSuccess, maxProducts, currentProductCount, onLimitExceeded, currency = 'SGD' }) {
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
  // The item open in its editor ({ id, focus }), and the photo editor ({ id, mode }: 'menu' opens
  // on the menu photo whatever the item's picture is).
  const [sheet, setSheet] = useState(null);
  const [photoEditor, setPhotoEditor] = useState(null);
  const [rewritingId, setRewritingId] = useState(null);
  // What the last save added: how many, and each section with its count, in the menu's order.
  const [saved, setSaved] = useState({ count: 0, sections: [] });
  const writer = useDescriptionWriter({ tenantId, setItems: setScannedItems });
  // A sample photo (Unsplash, credited) for each item without a picture, found one by one.
  const photoFinder = useSamplePhotoFinder({ tenantId, setItems: setScannedItems });
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

  const resetWriter = writer.reset;
  const resetPhotos = photoFinder.reset;
  const cancelScan = useCallback(() => {
    activeScan.current.id += 1;
    activeScan.current.controller?.abort();
    resetWriter();
    resetPhotos();
  }, [resetWriter, resetPhotos]);
  const handleClose = () => {
    if (saving) return;
    cancelScan();
    onOpenChange(false);
  };
  useBackToClose(open, handleClose);

  const startWriter = writer.start;
  const startPhotos = photoFinder.start;
  const handleScan = useCallback(async file => {
    if (!file) return;
    cancelScan();
    const id = activeScan.current.id;
    const controller = new AbortController();
    activeScan.current.controller = controller;
    const current = () => activeScan.current.id === id && !controller.signal.aborted;
    setScanning(true); setError(null); setRetakeOnly(false); setStep('scan'); setImagePreview(null); setScannedItems([]);
    setPartial(false); setPricesAsked(false); setSheet(null); setPhotoEditor(null);
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
        description: String(item.description || '').trim(),
      }));
      setScannedItems(items);
      setPartial(!!data.partial);
      setStep('review');
      // Descriptions for the items the menu printed none for, written one by one in the menu's
      // order (describeMenuItems).
      startWriter(groupScanItems(items).flatMap((section) => section.items).filter((item) => !item.description));
      // Each item's own picture, cut from the full photo.
      const cut = new Set();
      if (prepared.full) {
        for (const item of items) {
          const rect = fullPhotoRect(item.photo, prepared, prepared.full);
          if (!rect) continue;
          const picture = await cutPicture(prepared.full.img, rect);
          if (picture) keepUrl(picture.url);
          if (!current()) return;
          if (picture) {
            cut.add(item._id);
            setScannedItems(prev => prev.map(p => (p._id === item._id && !p.picture ? { ...p, picture: { ...picture, rect, sized: true } } : p)));
          }
        }
      }
      // Then a sample photo for each item the menu had no picture of, in the menu's order.
      startPhotos(groupScanItems(items).flatMap((section) => section.items).filter((item) => !cut.has(item._id)));
    } catch (err) {
      if (current() && err.name !== 'AbortError') { setError(err.message || t('Scan failed. Please try again.')); setRetakeOnly(!!err.photo); }
    } finally {
      if (current()) setScanning(false);
    }
  }, [cancelScan, releasePhotos, startWriter, startPhotos, tenantId]);

  useEffect(() => {
    if (!open) return undefined;
    if (photo) handleScan(photo);
    return () => { cancelScan(); releasePhotos(); };
  }, [open, photo, handleScan, cancelScan, releasePhotos]);

  const updateItem = (id, field, value) => setScannedItems(prev => prev.map(item => item._id === id ? { ...item, [field]: value } : item));
  const removeItem = (id) => {
    writer.release(id);
    setScannedItems(prev => prev.filter(item => item._id !== id));
  };
  const toggleItem = (id) => setScannedItems(prev => prev.map(item => item._id === id ? { ...item, _selected: !item._selected } : item));
  // The shop's own words: never written over by the AI.
  const ownDescription = (id, value) => {
    writer.release(id);
    setScannedItems(prev => prev.map(item => item._id === id ? { ...item, description: value, _desc: 'own', _typed: undefined } : item));
  };
  const renameSection = (key, name) => setScannedItems(prev => prev.map(item => (String(item.category || '').trim().toLowerCase() === key ? { ...item, category: name } : item)));

  // Still the same scan? Items are numbered from 0 in each scan, so an answer that comes after
  // the scan was closed or taken again must not land on another scan's item.
  const sameScan = () => { const id = activeScan.current.id; return () => activeScan.current.id === id; };

  // Rewrite (or write one) in an item's editor: asked for on its own, an AI draft again.
  const rewrite = async (id) => {
    const item = scannedItems.find(i => i._id === id);
    if (!item?.name?.trim() || rewritingId != null) return;
    const still = sameScan();
    writer.release(id);
    setRewritingId(id);
    try {
      const [text] = await describeItems({ tenantId, items: [item], rewrite: !!item.description?.trim() });
      if (!still()) return;
      if (text) setScannedItems(prev => prev.map(i => (i._id === id ? { ...i, description: text, _desc: 'done', _typed: undefined } : i)));
      else toast.message(t('No description came back. Please try again.'));
    } catch (e) {
      if (still()) showError(e, t('Couldn’t write a description'), { t, fallback: appT(CANT_WRITE) });
    } finally {
      setRewritingId(null);
    }
  };

  // A sample photo chosen in the item's editor; removing one keeps the finder from putting another.
  const chooseSample = (id, photo) => setScannedItems(prev => prev.map(i => (i._id === id ? { ...i, picture: samplePicture(photo), _noSample: false } : i)));
  const removePhoto = (id) => setScannedItems(prev => prev.map(i => (i._id === id ? { ...i, picture: null, _noSample: true } : i)));
  const findSamples = async (id) => {
    const item = scannedItems.find(i => i._id === id);
    if (!item?.name?.trim()) return;
    const still = sameScan();
    updateItem(id, '_photo', 'waiting');
    try {
      const photos = await findSamplePhotos({ tenantId, query: item.name });
      if (!still()) return;
      setScannedItems(prev => prev.map(i => (i._id === id
        ? { ...i, _photo: undefined, samples: photos, ...(photos.length && !i.picture ? { picture: samplePicture(photos[0]), _noSample: false } : {}) }
        : i)));
      if (!photos.length) toast.message(t('No sample photos found for this name.'));
    } catch (e) {
      if (!still()) return;
      updateItem(id, '_photo', undefined);
      showError(e, t('Couldn’t find sample photos'), { t, fallback: appT(SEARCH_FAILED) });
    }
  };

  // From the photo editor: the new picture (a data URL), or null to have none. A part boxed on
  // the menu photo (onMenu, crop) keeps its place, for the editor to open there next time.
  const savePicture = async (id, dataUrl, onMenu, info) => {
    if (!dataUrl) { updateItem(id, 'picture', null); return; }
    const still = sameScan();
    try {
      const blob = await (await fetch(dataUrl)).blob();
      if (!still()) return;
      const url = keepUrl(URL.createObjectURL(blob));
      updateItem(id, 'picture', { blob, url, type: blob.type, ext: extFor(blob.type), rect: (onMenu && info?.crop) || null });
    } catch {
      toast.error(t('Couldn’t keep that photo. Please try again.'));
    }
  };
  // A photo taken or chosen in the item's editor, at item-photo size.
  const pictureFromFile = async (id, file) => {
    const still = sameScan();
    try {
      const shrunk = await shrinkImage(file, { maxSide: PHOTO_MAX_SIDE });
      if (!still()) return;
      const url = keepUrl(URL.createObjectURL(shrunk.blob));
      updateItem(id, 'picture', { blob: shrunk.blob, url, type: shrunk.type, ext: shrunk.ext, rect: null, sized: true });
    } catch (err) {
      toast.error(err instanceof UnreadablePhotoError ? appT(UNREADABLE_PHOTO_MESSAGE) : t('Couldn’t keep that photo. Please try again.'));
    }
  };

  const handleSave = async () => {
    if (!scannedItems.some(i => i._selected)) return;
    const noPrice = scannedItems.filter(i => i._selected && typedPrice(i.price) == null).length;
    if (noPrice) {
      setPricesAsked(true);
      setError(noPrice === 1
        ? appT('Add a price for 1 selected item, or deselect it.')
        : appT('Add a price for {count} selected items, or deselect them.', { count: noPrice }));
      return;
    }
    const selectedTotal = scannedItems.filter(i => i._selected).length;
    // Enforce the plan's product limit — don't let a scan push the merchant over their cap.
    if (maxProducts != null && (currentProductCount + selectedTotal) > maxProducts) {
      const remaining = Math.max(maxProducts - currentProductCount, 0);
      setError(remaining === 1
        ? appT('Your plan allows up to {max} products (1 slot left). Deselect some items or upgrade your plan to add all {count}.', { max: maxProducts, count: selectedTotal })
        : appT('Your plan allows up to {max} products ({remaining} slots left). Deselect some items or upgrade your plan to add all {count}.', { max: maxProducts, remaining, count: selectedTotal }));
      return;
    }
    // Descriptions still being written stop here: the one being typed is kept whole, those
    // still waiting stay blank.
    const finished = writer.stop();
    photoFinder.stop();
    const items = scannedItems.map(item => (finished && item._id === finished.id && item._desc !== 'own' ? { ...item, description: finished.text } : item));
    // In the order shown: sections in the menu's order, each with its items.
    const selected = groupScanItems(items.filter(i => i._selected)).flatMap(section => section.items);
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
        // A picture cut from the menu, or taken or chosen in the item's editor, is made at
        // item-photo size; one saved from the photo editor (up to 2400 px) is shrunk now.
        const shrunk = item.picture.sized
          ? { blob: item.picture.blob, type: item.picture.type, ext: item.picture.ext }
          : await shrinkImage(item.picture.blob, { maxSide: PHOTO_MAX_SIDE });
        const path = `${tenantId}/products/${Date.now()}-${slugOf(item.name)}-${item._id}.${shrunk.ext}`;
        const { error: uploadError } = await supabase.storage.from('product-images').upload(path, shrunk.blob, { contentType: shrunk.type, upsert: true, cacheControl: LONG_CACHE });
        if (uploadError) throw uploadError;
        uploaded.push(path);
        photoUrls[item._id] = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
      }
      const uniqueCats = [...new Set(selected.map(i => String(i.category || '').trim()).filter(Boolean))];
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
        description: String(item.description || '').trim() || null,
        category_id: catMap[String(item.category || '').trim().toLowerCase()] || null,
        // A sample photo is shown from Unsplash, with its photographer's credit (never copied).
        image_url: photoUrls[item._id] || item.picture?.sample?.url || item.image_url || null,
        image_credits: !photoUrls[item._id] && item.picture?.sample ? { [item.picture.sample.url]: item.picture.sample.credit } : null,
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
      reportUsedPhotos({ tenantId, photos: selected.map(i => i.picture?.sample).filter(Boolean) });
      const sections = groupScanItems(selected).filter(section => section.name).map(section => ({ name: section.name, count: section.items.length }));
      setSaved({ count: selected.length, sections });
      setSheet(null);
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
  const allSelected = scannedItems.length > 0 && selectedCount === scannedItems.length;
  const needPrice = scannedItems.filter(i => i._selected && typedPrice(i.price) == null).length;
  const hasPictures = scannedItems.some(i => i.picture);
  const drafts = scannedItems.filter(i => i._desc === 'done').length;
  const sectionCount = groupScanItems(scannedItems).length;
  const sheetItem = sheet ? scannedItems.find(i => i._id === sheet.id) || null : null;
  const editing = photoEditor ? scannedItems.find(i => i._id === photoEditor.id) || null : null;
  const fullPhoto = scanPhoto.current?.full || null;
  // The editor opens on the whole menu with the item's picture boxed (where it was cut, or where
  // the AI saw it), or nothing boxed; a photo chosen instead, or turned, opens on its own, unless
  // Box it on the menu photo was asked for.
  const editorOnMenu = !!(editing && fullPhoto && (photoEditor.mode === 'menu' || !editing.picture || editing.picture.rect));
  const editorBox = editorOnMenu ? (editing.picture?.rect || fullPhotoRect(editing.photo, scanPhoto.current, fullPhoto)) : null;
  const reviewSubtitle = scannedItems.length === 1
    ? t('1 item, in your menu’s order')
    : sectionCount <= 1
      ? t('{count} items in 1 section, in your menu’s order', { count: scannedItems.length })
      : t('{count} items in {sections} sections, in your menu’s order', { count: scannedItems.length, sections: sectionCount });
  const restartWriter = () => startWriter(groupScanItems(scannedItems).flatMap(section => section.items).filter(item => !String(item.description || '').trim() && item._desc !== 'own'));

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="scan-menu-title" data-pull-refresh-block onKeyDown={event => { if (event.key === 'Escape' && !editing && !sheetItem) handleClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <style>{SCAN_REVIEW_CSS}</style>
      <div style={{ width: '100%', maxWidth: 560, background: 'white', borderRadius: '20px 20px 0 0', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 12px 14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(var(--color-primary), 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ScanLine size={18} color="rgb(var(--color-primary))" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p id="scan-menu-title" style={{ margin: 0, fontSize: 16, lineHeight: '20px', fontWeight: 700, color: '#0f172a' }}>{t('Scan Menu')}</p>
            <p data-testid="scan-subtitle" style={{ margin: '2px 0 0', fontSize: 12.5, lineHeight: '17px', color: '#64748b' }}>
              {step === 'scan' && (scanning ? t('Reading your menu…') : retakeOnly ? t('Take another photo') : t('Try again or take another photo'))}
              {step === 'review' && reviewSubtitle}
              {step === 'done' && t('Products added successfully!')}
            </p>
          </div>
          <button type="button" aria-label={t('Close menu scan')} disabled={saving} autoFocus onClick={handleClose} style={{ width: 44, height: 44, background: 'none', border: 'none', borderRadius: 10, cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>

        {step === 'review' && <DescriptionsStrip progress={writer.progress} drafts={drafts} onStop={writer.stop} onRetry={restartWriter} />}
        {step === 'review' && <PhotosStrip progress={photoFinder.progress} samples={scannedItems.filter(i => i.picture?.sample).length} onStop={photoFinder.stop} />}

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: step === 'review' ? 0 : 20 }}>

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

          {/* Step: Review, in the menu's order (Alvin, 20 Nov 2026) */}
          {step === 'review' && (
            <>
              {(partial || needPrice > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px 0' }}>
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
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 12px 4px 20px' }}>
                <p style={{ fontSize: 12.5, color: '#64748b', margin: 0 }}>
                  {t('{selectedCount} of {count} selected', { selectedCount, count: scannedItems.length })}
                  {hasPictures && <span data-testid="scan-photo-hint"> · {t('Tap a photo to change it')}</span>}
                </p>
                <button type="button" onClick={() => setScannedItems(prev => prev.map(i => ({ ...i, _selected: !allSelected })))} style={{ padding: '10px 4px', fontSize: 13, color: 'rgb(var(--color-primary))', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                  {allSelected ? t('Select none') : t('Select all')}
                </button>
              </div>
              <ScanReviewList
                items={scannedItems}
                currency={currency}
                pricesAsked={pricesAsked}
                canEditPhoto={item => !!(fullPhoto || item.picture)}
                onToggle={toggleItem}
                onOpen={(id, focus) => setSheet({ id, focus: focus || 'name' })}
                onPhoto={id => (scannedItems.find(i => i._id === id)?.picture?.sample ? setSheet({ id, focus: 'name' }) : setPhotoEditor({ id, mode: 'auto' }))}
                onRename={renameSection}
              />
            </>
          )}

          {/* Step: Done, with a tick and one burst of confetti (Alvin, 20 Nov 2026) */}
          {step === 'done' && (
            <div data-testid="scan-done" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0 12px', gap: 8 }}>
              <Celebrate />
              <p role="status" style={{ fontSize: 22, lineHeight: '28px', fontWeight: 800, color: '#0f172a', margin: 0, textAlign: 'center' }}>
                {saved.count === 1 ? t('1 product added') : t('{count} products added', { count: saved.count })}
              </p>
              {saved.sections.length > 0 && (
                <p data-testid="scan-done-sections" style={{ fontSize: 14.5, lineHeight: '21px', color: '#475569', margin: 0, textAlign: 'center' }}>
                  {t('In your menu’s order: {sections}.', { sections: saved.sections.map((sec) => `${sec.name} (${sec.count})`).join(', ') })}
                </p>
              )}
            </div>
          )}
        </div>

        {/* A problem saving: above the buttons, where it's seen */}
        {step === 'review' && error && (
          <div role="alert" style={{ margin: '0 16px 4px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
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

        {/* Footer */}
        {step === 'review' && (
          <div style={{ padding: '12px 16px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, flexShrink: 0 }}>
            <NativeCameraScanControl label={t('Scan another menu photo')} disabled={saving} onFile={onPhoto} onError={message => toast.message(message)} style={{ flex: 1, height: 48, boxSizing: 'border-box', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', fontSize: 14, fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ScanLine size={16} />{' '}{t('Retake')}
            </NativeCameraScanControl>
            <button onClick={handleSave} disabled={saving || !selectedCount} style={{ flex: 2, height: 48, borderRadius: 12, border: 'none', background: saving || !selectedCount ? '#cbd5e1' : primaryGradient, color: 'white', fontSize: 15, fontWeight: 700, cursor: saving || !selectedCount ? 'not-allowed' : 'pointer' }}>
              {saving ? t('Saving...') : selectedCount === 1 ? t('Add 1 product') : t('Add {count} products', { count: selectedCount })}
            </button>
          </div>
        )}
        {step === 'done' && (
          <div style={{ padding: '12px 20px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
            <button onClick={handleClose} style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: primaryGradient, color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{t('See my products')}</button>
          </div>
        )}
      </div>

      {/* One item's editor */}
      {step === 'review' && sheetItem && (
        <ScanItemSheet
          item={sheetItem}
          items={scannedItems}
          currency={currency}
          pricesAsked={pricesAsked}
          focus={sheet.focus}
          hasMenuPhoto={!!fullPhoto}
          rewriting={rewritingId === sheetItem._id}
          onChange={(field, value) => updateItem(sheetItem._id, field, value)}
          onDescription={value => ownDescription(sheetItem._id, value)}
          onRewrite={() => rewrite(sheetItem._id)}
          onPhotoFile={file => pictureFromFile(sheetItem._id, file)}
          onEditPhoto={() => setPhotoEditor({ id: sheetItem._id, mode: 'auto' })}
          onBoxOnMenu={() => setPhotoEditor({ id: sheetItem._id, mode: 'menu' })}
          onRemovePhoto={() => removePhoto(sheetItem._id)}
          onUseSample={photo => chooseSample(sheetItem._id, photo)}
          onFindSamples={() => findSamples(sheetItem._id)}
          onRemove={() => { removeItem(sheetItem._id); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      )}

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
          onClose={() => setPhotoEditor(null)}
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
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [selectionBusy, setSelectionBusy] = useState(false);

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

  // Hold an item and let go to select it, for deleting (Alvin, 20 Nov 2026: hold to select and
  // Select all stay, beside holding and dragging to move). In select mode it adds the item.
  const handleLongPress = (productId) => {
    // FIX: long-press multi-select only exists to enable bulk delete — with no
    // products.delete permission there's nothing useful it can do, so don't let it
    // open at all (previously it opened regardless, and only the toolbar's Delete
    // button itself was ever meant to be the gate — except that button wasn't gated
    // either, so a view/edit-only Manager could still bulk-delete products).
    if (!hasPermission('products.delete')) return;
    if (selectionMode) {
      setSelectedIds(prev => new Set(prev).add(productId));
      return;
    }
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

  const allSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id));
  const handleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(filteredProducts.map(p => p.id)));
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setDeleteSheetOpen(false);
  };

  const selectedProducts = products.filter(p => selectedIds.has(p.id));
  const selectionDone = async () => {
    await queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
    await queryClient.invalidateQueries({ queryKey: ['productCount', tenantId] });
    handleCancelSelection();
  };

  // Deleting takes each item's stock count with it; past orders keep their own copy of its name
  // and price. A failure says so (it used to fail in silence).
  const handleBulkDelete = async () => {
    if (!selectedIds.size || !hasPermission('products.delete') || selectionBusy) return;
    const ids = [...selectedIds];
    const first = selectedProducts[0]?.name || '';
    setSelectionBusy(true);
    try {
      const supabase = await getSupabase();
      const { error: stockError } = await supabase.from('inventory_items').delete().in('product_id', ids);
      if (stockError) throw stockError;
      const { error } = await supabase.from('products').delete().in('id', ids).eq('tenant_id', tenantId);
      if (error) throw error;
      toast.success(ids.length === 1 ? t('{name} deleted', { name: first }) : t('{count} {products} deleted', { count: ids.length, products: words.products }));
      await selectionDone();
    } catch (e) {
      showError(e, t('Couldn’t delete'), { t });
      await queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
    } finally {
      setSelectionBusy(false);
    }
  };

  // Hide instead: off the menu, still in Products (is_active false).
  const handleBulkHide = async () => {
    if (!selectedIds.size || !hasPermission('products.edit') || selectionBusy) return;
    const ids = [...selectedIds];
    const first = selectedProducts[0]?.name || '';
    setSelectionBusy(true);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.from('products').update({ is_active: false }).in('id', ids).eq('tenant_id', tenantId);
      if (error) throw error;
      toast.success(ids.length === 1 ? t('{name} is hidden', { name: first }) : t('{count} {products} hidden', { count: ids.length, products: words.products }));
      await selectionDone();
    } catch (e) {
      showError(e, t('Couldn’t hide them'), { t });
    } finally {
      setSelectionBusy(false);
    }
  };

  // Hold an item and drag it within its section (Alvin, 20 Nov 2026): the new order is saved at
  // once (products.sort_order, lib/productOrder.js), with Undo. Only a whole section can be
  // rearranged: not while searching (even spaces show one flat list, mixing sections) or showing
  // one status (part of a section). A category filter shows one whole section.
  const canMove = hasPermission('products.edit') && !searchQuery && statusFilter === 'all';
  // `items`: the section as shown (a category, or those without one).
  const handleMove = (items, from, to) => {
    const known = new Set(categories.map((c) => c.id));
    const sections = [
      ...categories.map((c) => products.filter((p) => p.category_id === c.id)),
      products.filter((p) => !p.category_id || !known.has(p.category_id)),
    ];
    const index = sections.findIndex((section) => section.some((p) => p.id === items[from]?.id));
    if (index < 0) return;
    sections[index] = items;
    const changes = planMove(sections, index, from, to);
    if (!changes.length) return;
    const key = ['products', tenantId];
    const apply = (rows) => queryClient.setQueryData(key, (old) => (Array.isArray(old) ? withSortOrders(old, rows) : old));
    const save = async (rows) => {
      const supabase = await getSupabase();
      // Ten at a time: numbering a whole shop can change every row.
      for (let i = 0; i < rows.length; i += 10) {
        const results = await Promise.all(rows.slice(i, i + 10).map((row) => supabase.from('products').update({ sort_order: row.sort_order }).eq('id', row.id).eq('tenant_id', tenantId)));
        const failed = results.find((result) => result?.error);
        if (failed) throw failed.error;
      }
    };
    const notSaved = (e) => {
      showError(e, t('Couldn’t save the new order'), { t });
      queryClient.invalidateQueries({ queryKey: key });
    };
    apply(changes);
    save(changes).catch(notSaved);
    toast(t('Moved {name}', { name: items[from]?.name || '' }), {
      action: {
        label: t('Undo'),
        onClick: () => {
          const back = changes.map((c) => ({ id: c.id, sort_order: c.before }));
          apply(back);
          save(back).catch(notSaved);
        },
      },
    });
  };

  // Back (the phone's button or swipe) ends select mode, after closing the delete window.
  useBackToClose(selectionMode && !deleteSheetOpen, handleCancelSelection);

  if (toMyListings) return <Navigate to={`/explore/listings${location.search}`} replace />;

  return (
    <RequirePermission permission="products.view">
      <div className={embedded ? 'space-y-4' : 'space-y-6'}>
        {!selectionMode && (
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
        )}

        {/* Select mode (Alvin, 20 Nov 2026): a bar under the header with ✕, how many are selected
            and Select all, and Delete at the bottom in place of the tab bar (it covers the tab bar,
            the raised Counter button too). The page's title and buttons step aside meanwhile, so
            nothing sits under the bar. Fixed on phones: position: sticky would need <main>'s
            overflow-x-hidden loosened, which once made the whole page scroll sideways. margin: 0
            because the page's space-y would push a fixed bar 24px down, off the header. */}
        {selectionMode && (
          <>
            <div className="lg:hidden" style={{ height: 48 }} aria-hidden="true" />
            <div
              data-testid="select-bar"
              className="fixed left-0 right-0 z-30 lg:static lg:rounded-xl lg:border lg:border-slate-200"
              style={{ top: 'calc(56px + env(safe-area-inset-top, 0px))', margin: 0, height: 56, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 0 6px', background: 'white', borderBottom: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)' }}
            >
              <button type="button" onClick={handleCancelSelection} aria-label={t('Stop selecting')} style={{ width: 44, height: 44, border: 'none', background: 'none', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', cursor: 'pointer', flexShrink: 0 }}>
                <X size={22} aria-hidden="true" />
              </button>
              <p role="status" aria-live="polite" style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 17, lineHeight: '22px', fontWeight: 700, color: '#0f172a' }}>
                {t('{size} selected', { size: selectedIds.size })}
              </p>
              <button type="button" onClick={handleSelectAll} style={{ height: 44, border: 'none', background: 'none', borderRadius: 10, padding: '0 10px', fontSize: 14, fontWeight: 600, color: 'rgb(var(--color-primary))', cursor: 'pointer', flexShrink: 0 }}>
                {allSelected ? t('Select none') : t('Select all')}
              </button>
            </div>
            {canMove && (
              <div data-testid="move-tip" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: '#eef2f7' }}>
                <GripVertical size={16} color="#475569" aria-hidden="true" />
                <p style={{ margin: 0, fontSize: 13, lineHeight: '18px', color: '#334155' }}>{t('Drag the dots to change the order.')}</p>
              </div>
            )}
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
            canMove,
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
            return <>{count}<ProductGrid products={filteredProducts} {...gridProps} onMove={(from, to) => handleMove(filteredProducts, from, to)} tourTagFirstCard={productsTour.eligible} /></>;
          }
          const knownIds = new Set(categories.map(c => c.id));
          const groups = [
            ...categories.map(c => ({ key: c.id, name: c.name, items: filteredProducts.filter(p => p.category_id === c.id) })),
            { key: 'uncategorized', name: t('Uncategorized'), items: filteredProducts.filter(p => !p.category_id || !knownIds.has(p.category_id)) },
          ].filter(g => g.items.length > 0);
          // Nothing grouped (a shop without categories): one plain list in My listings.
          if (embedded && groups.length === 1 && groups[0].key === 'uncategorized') {
            return <>{count}<ProductGrid products={filteredProducts} {...gridProps} onMove={(from, to) => handleMove(filteredProducts, from, to)} tourTagFirstCard={productsTour.eligible} /></>;
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
                  <ProductGrid products={g.items} {...gridProps} onMove={(from, to) => handleMove(g.items, from, to)} tourTagFirstCard={productsTour.eligible && i === 0} />
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

        {selectionMode && (
          <>
            <div aria-hidden="true" style={{ height: 24 }} />
            <div
              data-testid="delete-bar"
              data-pull-refresh-block
              className="fixed left-0 right-0 bottom-0 z-40 lg:left-[var(--sidebar-width)]"
              style={{ margin: 0, minHeight: 88, boxSizing: 'border-box', padding: '16px 16px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', background: 'white', borderTop: '1px solid #e2e8f0', boxShadow: '0 -4px 14px rgba(15, 23, 42, 0.06)' }}
            >
              <button
                type="button"
                disabled={!selectedIds.size}
                onClick={() => setDeleteSheetOpen(true)}
                style={{ width: '100%', maxWidth: 560, margin: '0 auto', height: 50, borderRadius: 12, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 700, background: selectedIds.size ? '#dc2626' : '#e2e8f0', color: selectedIds.size ? 'white' : '#475569', cursor: selectedIds.size ? 'pointer' : 'default' }}
              >
                {selectedIds.size ? <Trash2 size={18} aria-hidden="true" /> : null}
                {!selectedIds.size ? t('Select items to delete')
                  : selectedIds.size === 1 ? t('Delete 1 {product}', { product: words.product })
                  : t('Delete {count} {products}', { count: selectedIds.size, products: words.products })}
              </button>
            </div>
          </>
        )}
        <DeleteProductsSheet
          open={deleteSheetOpen}
          products={selectedProducts}
          isListings={isListings}
          words={words}
          canHide={hasPermission('products.edit')}
          busy={selectionBusy}
          onCancel={() => setDeleteSheetOpen(false)}
          onDelete={handleBulkDelete}
          onHide={handleBulkHide}
        />

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
          currency={tenant?.currency || 'SGD'}
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