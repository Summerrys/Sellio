import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import NativeCameraScanControl from '../components/ui-custom/NativeCameraScanControl';
import { getSupabase } from '@/lib/supabaseClient';
import { useBackToClose } from '@/lib/useBackToClose';
import { useTenant } from '../components/tenant/TenantContext';
import { toast } from 'sonner';
import RequirePermission from '../components/auth/RequirePermission';
import EmptyState from '../components/ui-custom/EmptyState';
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
import { ShoppingBag, Plus, Search, LayoutGrid, List, Upload, Download, FileDown, FileSpreadsheet, Package, ScanLine, Trash2, CheckCircle2, AlertCircle, ImageIcon, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SkeletonList } from '@/components/ui-custom/AppLoader';
import { applyCanonicalProductOrder } from '@/lib/storefrontCatalog';
import { useSubscription } from '@/hooks/useSubscription';

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

export function ScanMenuDialog({ open, photo, onPhoto, onOpenChange, tenantId, categories, onSuccess, maxProducts, currentProductCount, onLimitExceeded }) {
  const [imagePreview, setImagePreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('scan');
  const activeScan = useRef({ id: 0, controller: null, reader: null });
  const SUPABASE_URL = 'https://gzktuteedbtnaxfdylyu.supabase.co';
  const primaryGradient = 'var(--color-primary-gradient)';

  const cancelScan = useCallback(() => {
    activeScan.current.id += 1;
    activeScan.current.controller?.abort();
    if (activeScan.current.reader?.readyState === 1) activeScan.current.reader.abort();
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
    setScanning(true); setError(null); setStep('scan'); setImagePreview(null); setScannedItems([]);
    try {
      if (!file.size || (file.type && !file.type.startsWith('image/'))) throw new Error('Please take a clear photo of your menu.');
      const reader = new FileReader();
      activeScan.current.reader = reader;
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read this photo. Please take another one.'));
        reader.onabort = () => reject(new DOMException('Scan cancelled', 'AbortError'));
        reader.readAsDataURL(file);
      });
      if (!current()) return;
      if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) throw new Error('Could not read this photo. Please take another one.');
      setImagePreview(dataUrl);
      const { data: { session } } = await (await getSupabase()).auth.getSession();
      if (!current()) return;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/scanMenu`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ imageBase64: dataUrl.split(',')[1], mediaType: file.type || 'image/jpeg', tenantId }),
      });
      const data = await res.json();
      if (!current()) return;
      if (!res.ok) throw new Error(data.error || 'Scan failed. Please try again.');
      if (!data.items?.length) throw new Error('No items found. Try a clearer photo.');
      setScannedItems(data.items.map((item, i) => ({ ...item, _id: i, _selected: true, image_url: null })));
      setStep('review');
    } catch (err) {
      if (current() && err.name !== 'AbortError') setError(err.message || 'Scan failed. Please try again.');
    } finally {
      if (current()) setScanning(false);
    }
  }, [cancelScan, tenantId]);

  useEffect(() => {
    if (!open) return undefined;
    if (photo) handleScan(photo);
    return cancelScan;
  }, [open, photo, handleScan, cancelScan]);

  const updateItem = (id, field, value) => setScannedItems(prev => prev.map(item => item._id === id ? { ...item, [field]: value } : item));
  const removeItem = (id) => setScannedItems(prev => prev.filter(item => item._id !== id));
  const toggleItem = (id) => setScannedItems(prev => prev.map(item => item._id === id ? { ...item, _selected: !item._selected } : item));

  const handleSave = async () => {
    const selected = scannedItems.filter(i => i._selected);
    if (!selected.length) return;
    // Enforce the plan's product limit — don't let a scan push the merchant over their cap.
    if (maxProducts != null && (currentProductCount + selected.length) > maxProducts) {
      const remaining = Math.max(maxProducts - currentProductCount, 0);
      setError(`Your plan allows up to ${maxProducts} products (${remaining} slot${remaining === 1 ? '' : 's'} left). Deselect some items or upgrade your plan to add all ${selected.length}.`);
      return;
    }
    setSaving(true); setError(null);
    try {
      const { getSupabase } = await import('@/lib/supabaseClient');
      const supabase = await getSupabase();
      const uniqueCats = [...new Set(selected.map(i => i.category).filter(Boolean))];
      const catMap = {};
      categories.forEach(c => { catMap[c.name.toLowerCase()] = c.id; });
      for (const catName of uniqueCats) {
        if (!catMap[catName.toLowerCase()]) {
          const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
          const { data: newCat } = await supabase.from('categories').insert({ tenant_id: tenantId, name: catName, slug, is_active: true }).select().single();
          if (newCat) catMap[catName.toLowerCase()] = newCat.id;
        }
      }
      const productRows = selected.map(item => ({
        tenant_id: tenantId,
        name: item.name,
        price: parseFloat(item.price) || 0,
        description: item.description || null,
        category_id: catMap[item.category?.toLowerCase()] || null,
        image_url: item.image_url || null,
        slug: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now() + Math.random().toString(36).slice(2, 5),
        is_active: true,
        variants: item.variants || [],
      }));
      const { data: insertedProducts, error: prodError } = await supabase.from('products').insert(productRows).select();
      if (prodError) throw prodError;
      if (insertedProducts?.length) {
        await supabase.from('inventory_items').insert(insertedProducts.map(p => ({ tenant_id: tenantId, product_id: p.id, current_stock: 0, low_stock_threshold: 5, par_level: 0, unit: 'pcs' })));
      }
      setStep('done');
      onSuccess?.();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  if (!open) return null;
  const selectedCount = scannedItems.filter(i => i._selected).length;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="scan-menu-title" data-pull-refresh-block onKeyDown={event => { if (event.key === 'Escape') handleClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ width: '100%', maxWidth: 560, background: 'white', borderRadius: '20px 20px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(var(--color-primary), 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ScanLine size={18} color="rgb(var(--color-primary))" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p id="scan-menu-title" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Scan Menu</p>
            <p style={{ margin: '1px 0 0', fontSize: 12, color: '#64748b' }}>
              {step === 'scan' && (scanning ? 'Reading your menu…' : 'Try again or take another photo')}
              {step === 'review' && `${scannedItems.length} items found — review before saving`}
              {step === 'done' && 'Products added successfully!'}
            </p>
          </div>
          <button type="button" aria-label="Close menu scan" disabled={saving} autoFocus onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, display: 'flex', alignItems: 'center' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* Extraction starts as soon as the native camera returns a photo. */}
          {step === 'scan' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {imagePreview && <img src={imagePreview} alt="Menu being scanned" style={{ maxHeight: 220, maxWidth: '100%', borderRadius: 12, objectFit: 'contain', margin: '0 auto' }} />}
              {scanning && <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-8 text-slate-600"><Loader2 size={22} className="animate-spin" /><span>Reading your menu…</span></div>}
              {error && (
                <>
                  <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={16} />{error}</div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleScan(photo)} className="flex-1 rounded-lg px-3 py-3 text-sm font-semibold text-white" style={{ background: primaryGradient }}>Try Again</button>
                    <NativeCameraScanControl label="Retake menu photo" onFile={onPhoto} onError={message => toast.message(message)} className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-600 cursor-pointer"><ScanLine size={16} />Retake</NativeCameraScanControl>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step: Review */}
          {step === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                  {`${selectedCount} of ${scannedItems.length} selected`}
                </p>
                <button onClick={() => setScannedItems(prev => prev.map(i => ({ ...i, _selected: true })))} style={{ fontSize: 12, color: 'rgb(var(--color-primary))', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Select all</button>
              </div>

              {scannedItems.map(item => (
                <div key={item._id} style={{ background: item._selected ? 'rgba(var(--color-primary), 0.04)' : '#f8fafc', border: `1px solid ${item._selected ? 'rgba(var(--color-primary), 0.25)' : '#e2e8f0'}`, borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>

                  {/* Checkbox */}
                  <input type="checkbox" checked={item._selected} onChange={() => toggleItem(item._id)} style={{ width: 16, height: 16, accentColor: 'rgb(var(--color-primary))', flexShrink: 0, marginTop: 3 }} />

                  {/* Product image thumbnail */}
                  <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f1f5f9', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
                    {item.image_url
                      ? <img src={item.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <ImageIcon size={16} color="#cbd5e1" />
                    }
                  </div>

                  {/* Fields */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* Name row */}
                    <input
                      value={item.name}
                      onChange={e => updateItem(item._id, 'name', e.target.value)}
                      style={{ width: '100%', fontWeight: 600, fontSize: 13, color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', outline: 'none', background: 'white', boxSizing: 'border-box' }}
                      placeholder="Product name"
                    />
                    {/* Price + Category row */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 6, background: 'white', overflow: 'hidden', width: 90, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', padding: '0 4px 0 6px', fontWeight: 500 }}>$</span>
                        <input type="number" value={item.price} onChange={e => updateItem(item._id, 'price', e.target.value)} style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'rgb(var(--color-primary))', border: 'none', outline: 'none', padding: '4px 6px 4px 0', background: 'transparent', width: '100%' }} />
                      </div>
                      <input value={item.category || ''} onChange={e => updateItem(item._id, 'category', e.target.value)} placeholder="Category" style={{ flex: 1, fontSize: 11, color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', background: 'white', outline: 'none', minWidth: 0 }} />
                    </div>
                    {/* Description row */}
                    <input value={item.description || ''} onChange={e => updateItem(item._id, 'description', e.target.value)} placeholder="Description (optional)" style={{ width: '100%', fontSize: 11, color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
                  </div>

                  {/* Delete */}
                  <button onClick={() => removeItem(item._id)} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', color: '#ef4444', padding: '4px 6px', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span>{error}</span>
                  {maxProducts != null && (currentProductCount + selectedCount) > maxProducts && (
                    <button
                      onClick={() => { handleClose(); onLimitExceeded?.(); }}
                      style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 8, border: 'none', background: '#dc2626', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Upgrade Plan
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
              <p style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>Products Added!</p>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0, textAlign: 'center' }}>{selectedCount} products have been added to your catalog.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'review' && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, flexShrink: 0 }}>
            <NativeCameraScanControl label="Scan another menu photo" disabled={saving} onFile={onPhoto} onError={message => toast.message(message)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ScanLine size={14} /> Retake
            </NativeCameraScanControl>
            <button onClick={handleSave} disabled={saving || !selectedCount} style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', background: saving || !selectedCount ? '#cbd5e1' : primaryGradient, color: 'white', fontSize: 13, fontWeight: 700, cursor: saving || !selectedCount ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving...' : `Add ${selectedCount} Products`}
            </button>
          </div>
        )}
        {step === 'done' && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
            <button onClick={handleClose} style={{ width: '100%', padding: 11, borderRadius: 10, border: 'none', background: primaryGradient, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Products() {
  const { tenantId, tenant, subscription, hasPermission, canUseFeature } = useTenant();
  // A free personal shop: "Listings", no menu scan, no Inventory page (its plan).
  const words = itemWords(tenant?.seller_type);
  const canScanMenu = !canUseFeature || canUseFeature('can_scan_menu');
  const canUseInventory = !canUseFeature || canUseFeature('can_use_inventory');
  const productsTour = useProductTour('products');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState(
    localStorage.getItem('products_view_mode') || 'list'
  );

  const handleViewToggle = (mode) => {
    setViewMode(mode);
    localStorage.setItem('products_view_mode', mode);
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

  // Auto-open new product dialog when navigated from Sell button (?new=1)
  const urlParams = new URLSearchParams(window.location.search);
  const [showDialog, setShowDialog] = useState(urlParams.get('new') === '1');

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

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesSearch = !searchQuery || 
      product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter;
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && product.is_active) ||
      (statusFilter === 'inactive' && !product.is_active) ||
      (statusFilter === 'low_stock' && product.current_stock <= product.low_stock_threshold);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handleEdit = (product) => {
    // FIX: previously any user who could see the Products page could click into any
    // product regardless of edit permission — Save/Delete were hidden inside the dialog,
    // but the dialog itself still opened, which read as "I can almost edit this" rather
    // than a clean no-access state. Block the click entirely for view-only users instead.
    if (!hasPermission('products.edit')) {
      toast.error("You don't have access to edit products.");
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

  return (
    <RequirePermission permission="products.view">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 mb-6">
          <div data-tour="products-header" className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold text-slate-900">{words.Products}</h1>
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
              <Package className="w-4 h-4" /> Inventory
            </button>
            )}
          </div>
          <p className="text-sm text-slate-500 -mt-3">{tenant?.seller_type === 'individual' ? 'Manage your listings' : 'Manage your product catalog'}</p>
          <div className="flex flex-wrap items-center gap-2">
              <RequirePermission permission="products.create" silent>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleDownloadTemplate}>
                    <FileDown className="w-4 h-4 mr-2" />
                    Download Template
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExport}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export All {words.Products}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={() => setImportDialogOpen(true)} variant="outline" size="sm">
                  <Upload className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Import</span>
                </Button>
                {canScanMenu && (
                <NativeCameraScanControl
                  data-tour="scan-menu-btn"
                  label="Scan menu with camera"
                  onBeforeOpen={canOpenScan}
                  onFile={handleScanPhoto}
                  onError={message => toast.message(message)}
                  className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium cursor-pointer transition-colors ${atProductLimit ? 'gap-1.5 border-slate-300 text-slate-400' : 'gap-1.5 border-orange-300 text-orange-600 hover:bg-orange-50'}`}
                  title={atProductLimit ? `${words.Product} limit reached (${maxProducts}) — upgrade to add more` : undefined}
                >
                  <ScanLine className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Scan Menu</span>
                  <span className="sm:hidden">Scan</span>
                </NativeCameraScanControl>
                )}
                <Button
                  data-tour="add-product-btn"
                  onClick={handleAdd}
                  size="sm"
                  className="text-white gap-1.5"
                  style={{ background: atProductLimit ? '#cbd5e1' : 'var(--color-primary-gradient)' }}
                  title={atProductLimit ? `${words.Product} limit reached (${maxProducts}) — upgrade to add more` : undefined}
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">{atProductLimit ? 'Limit Reached' : `Add ${words.Product}`}</span>
                  <span className="sm:hidden">{atProductLimit ? 'Limit' : 'Add'}</span>
                </Button>
              </RequirePermission>
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
              {selectedIds.size} selected
            </span>
            <button onClick={handleSelectAll} style={{ fontSize: 12, fontWeight: 600, color: 'rgb(var(--color-primary))', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
              Select all ({filteredProducts.length})
            </button>
            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                disabled={!selectedIds.size}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: 'none', background: selectedIds.size ? '#ef4444' : '#cbd5e1', color: 'white', fontSize: 12, fontWeight: 700, cursor: selectedIds.size ? 'pointer' : 'not-allowed' }}
              >
                <Trash2 size={13} /> Delete
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>Delete {selectedIds.size}?</span>
                <button onClick={handleBulkDelete} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#ef4444', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Yes</button>
                <button onClick={() => setDeleteConfirm(false)} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>No</button>
              </div>
            )}
            <button onClick={handleCancelSelection} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
              <X size={18} />
            </button>
            </div>
          </>
        )}

        {/* Filters and View Toggle */}
        <div className="flex flex-col gap-3">
          {/* Search */}
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder={`Search ${words.products}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-11"
            />
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="flex-1 min-w-[120px]" style={{ height: 36, background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="flex-1 min-w-[110px]" style={{ height: 36, background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="low_stock">Low Stock</SelectItem>
              </SelectContent>
            </Select>

            {/* View Toggle */}
            <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 3, marginLeft: 'auto', flexShrink: 0 }}>
              <button
                onClick={() => handleViewToggle('grid')}
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'grid' ? 'white' : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: viewMode === 'grid' ? '#6366f1' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => handleViewToggle('list')}
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'list' ? 'white' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: viewMode === 'list' ? '#6366f1' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Products Display */}
        {isLoading ? (
          <SkeletonList count={5} lines={2} imageSize={64} />
        ) : filteredProducts.length === 0 ? (
          <>
            <EmptyState
              icon={ShoppingBag}
              title={searchQuery || categoryFilter !== 'all' || statusFilter !== 'all' 
                ? `No ${words.products} found`
                : `No ${words.products} yet`}
              description={searchQuery || categoryFilter !== 'all' || statusFilter !== 'all'
                ? "Try adjusting your filters"
                : `Start building your catalog by adding your first ${words.product}`}
              actionLabel={`Add ${words.Product}`}
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
          };
          if (categoryFilter !== 'all' || searchQuery) {
            return <ProductGrid products={filteredProducts} {...gridProps} tourTagFirstCard={productsTour.eligible} />;
          }
          const knownIds = new Set(categories.map(c => c.id));
          const groups = [
            ...categories.map(c => ({ key: c.id, name: c.name, items: filteredProducts.filter(p => p.category_id === c.id) })),
            { key: 'uncategorized', name: 'Uncategorized', items: filteredProducts.filter(p => !p.category_id || !knownIds.has(p.category_id)) },
          ].filter(g => g.items.length > 0);
          return (
            <div className="space-y-6">
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
          hasUsedTrial={tenant?.has_used_trial ?? false}
        />
      </div>
    </RequirePermission>
  );
}