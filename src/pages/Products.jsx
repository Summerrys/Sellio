import React, { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PullToRefresh from '../components/ui-custom/PullToRefresh';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import EmptyState from '../components/ui-custom/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ProductGrid from '../components/products/ProductGrid';
import ProductFormDialog from '../components/products/ProductFormDialog.jsx';
import ProductImportDialog from '../components/products/ProductImportDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ShoppingBag, Plus, Search, LayoutGrid, List, Upload, Download, FileDown, FileSpreadsheet, Package, ScanLine, Trash2, CheckCircle2, AlertCircle, ImageIcon, Lightbulb, Loader2, X, CheckSquare } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { SkeletonList } from '@/components/ui-custom/AppLoader';

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

function ScanMenuDialog({ open, onOpenChange, tenantId, categories, onSuccess }) {
  const { tenant } = useTenant();
  const [image, setImage] = React.useState(null);
  const [imagePreview, setImagePreview] = React.useState(null);
  const [scanning, setScanning] = React.useState(false);
  const [analyzingImages, setAnalyzingImages] = React.useState(false);
  const [scannedItems, setScannedItems] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [step, setStep] = React.useState('upload');
  const fileInputRef = React.useRef(null);
  const SUPABASE_URL = 'https://gzktuteedbtnaxfdylyu.supabase.co';
  const primaryGradient = 'var(--color-primary-gradient)';

  const reset = () => { setImage(null); setImagePreview(null); setScanning(false); setAnalyzingImages(false); setScannedItems([]); setSaving(false); setError(null); setStep('upload'); };
  const handleClose = () => { reset(); onOpenChange(false); };

  const handleFile = (file) => {
    if (!file) return;
    setImage(file);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
    setError(null);
  };

  const analyzeItemImages = async (items, base64, mediaType) => {
    setAnalyzingImages(true);
    try {
      const analyzed = await Promise.all(items.map(async (item) => {
        try {
          const res = await fetch('https://selliosg.base44.app/api/functions/analyzeProductImage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64, productName: item.name }),
          });
          const data = await res.json();
          return { ...item, image_url: data?.imageUrl || null, _aiAnalyzed: true };
        } catch {
          return { ...item, image_url: null };
        }
      }));
      return analyzed;
    } finally {
      setAnalyzingImages(false);
    }
  };

  const handleScan = async () => {
    if (!image) return;
    setScanning(true); setError(null);
    try {
      const reader = new FileReader();
      const base64 = await new Promise((res, rej) => { reader.onload = e => res(e.target.result.split(',')[1]); reader.onerror = rej; reader.readAsDataURL(image); });
      const mediaType = image.type || 'image/jpeg';
      const res = await fetch(`${SUPABASE_URL}/functions/v1/scanMenu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType, tenantId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      if (!data.items?.length) throw new Error('No items found. Try a clearer photo.');
      const rawItems = data.items.map((item, i) => ({ ...item, _id: i, _selected: true, image_url: null }));
      setScanning(false);
      setScannedItems(rawItems);
      setStep('review');
      const analyzed = await analyzeItemImages(rawItems, base64, mediaType);
      setScannedItems(analyzed.map((item, i) => ({ ...item, _id: i, _selected: true })));
    } catch (e) { setError(e.message); setScanning(false); }
  };

  const updateItem = (id, field, value) => setScannedItems(prev => prev.map(item => item._id === id ? { ...item, [field]: value } : item));
  const removeItem = (id) => setScannedItems(prev => prev.filter(item => item._id !== id));
  const toggleItem = (id) => setScannedItems(prev => prev.map(item => item._id === id ? { ...item, _selected: !item._selected } : item));

  const handleSave = async () => {
    const selected = scannedItems.filter(i => i._selected);
    if (!selected.length) return;
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ width: '100%', maxWidth: 560, background: 'white', borderRadius: '20px 20px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(var(--color-primary), 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ScanLine size={18} color="rgb(var(--color-primary))" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Scan Menu</p>
            <p style={{ margin: '1px 0 0', fontSize: 12, color: '#64748b' }}>
              {step === 'upload' && 'Upload a photo of your menu'}
              {step === 'review' && `${scannedItems.length} items found — review before saving`}
              {step === 'done' && 'Products added successfully!'}
            </p>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, display: 'flex', alignItems: 'center' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* Step: Upload */}
          {step === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                style={{ border: `2px dashed ${image ? 'rgb(var(--color-primary))' : '#e2e8f0'}`, borderRadius: 14, padding: imagePreview ? 16 : 32, textAlign: 'center', cursor: 'pointer', background: image ? 'rgba(var(--color-primary), 0.04)' : '#f8fafc', transition: 'all 0.2s' }}
              >
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
                {imagePreview ? (
                  <img src={imagePreview} style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 10, objectFit: 'contain', margin: '0 auto', display: 'block' }} />
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                      <ImageIcon size={40} color="#94a3b8" />
                    </div>
                    <p style={{ fontWeight: 600, fontSize: 14, color: '#374151', margin: '0 0 4px' }}>Tap to upload menu photo</p>
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>JPG, PNG supported · Clear photos work best</p>
                  </>
                )}
              </div>

              {imagePreview && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setImage(null); setImagePreview(null); }} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>
                    Change Photo
                  </button>
                  <button onClick={handleScan} disabled={scanning} style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: scanning ? '#cbd5e1' : primaryGradient, color: 'white', fontSize: 13, fontWeight: 700, cursor: scanning ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {scanning ? <><Loader2 size={14} className="animate-spin" /> Scanning...</> : <><ScanLine size={14} /> Scan Menu</>}
                  </button>
                </div>
              )}

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Lightbulb size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span><strong>Tips:</strong> Use a clear, well-lit photo. Ensure text is readable. Works best with printed menus.</span>
              </div>
            </div>
          )}

          {/* Step: Review */}
          {step === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                  {analyzingImages ? '✨ Fetching product images...' : `${selectedCount} of ${scannedItems.length} selected`}
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
                      : analyzingImages ? <Loader2 size={14} color="#94a3b8" className="animate-spin" /> : <ImageIcon size={16} color="#cbd5e1" />
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
                  <button onClick={() => removeItem(item._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 2, flexShrink: 0, marginTop: 2 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>{error}</div>}
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
            <button onClick={() => setStep('upload')} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ScanLine size={14} /> Rescan
            </button>
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
  const { tenantId, tenant } = useTenant();
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
        supabase.from('products').select('*').eq('tenant_id', tenantId).order('created_date', { ascending: false }),
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
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('categories')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .order('name');
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
    setEditingProduct(product);
    setShowDialog(true);
  };

  const handleAdd = () => {
    setEditingProduct(null);
    setShowDialog(true);
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

  const handleRefresh = useCallback(() =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['products', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['categories', tenantId] }),
    ]), [queryClient, tenantId]);

  const handleLongPress = (productId) => {
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
    if (!selectedIds.size) return;
    try {
      const supabase = await getSupabase();
      const ids = [...selectedIds];
      await supabase.from('inventory_items').delete().in('product_id', ids);
      await supabase.from('products').delete().in('id', ids);
      await queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      handleCancelSelection();
    } catch (e) {
      console.error('Bulk delete failed:', e);
    }
  };

  return (
    <RequirePermission permission="products.view">
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold text-slate-900">Products</h1>
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
          </div>
          <p className="text-sm text-slate-500 -mt-3">Manage your product catalog</p>
          <div className="flex flex-wrap items-center gap-2">
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
                    Export All Products
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <RequirePermission permission="products.create" silent>
                <Button onClick={() => setImportDialogOpen(true)} variant="outline" size="sm">
                  <Upload className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Import</span>
                </Button>
                <Button
                  onClick={() => setScanMenuOpen(true)}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-orange-300 text-orange-600 hover:bg-orange-50"
                >
                  <ScanLine className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Scan Menu</span>
                  <span className="sm:hidden">Scan</span>
                </Button>
                <Button
                  onClick={handleAdd}
                  size="sm"
                  className="text-white gap-1.5"
                  style={{ background: 'var(--color-primary-gradient)' }}
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Product</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </RequirePermission>
          </div>
        </div>

        {/* Selection toolbar */}
        {selectionMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(var(--color-primary), 0.06)', borderRadius: 12, border: '1px solid rgba(var(--color-primary), 0.2)', marginBottom: 4 }}>
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
        )}

        {/* Filters and View Toggle */}
        <div className="flex flex-col gap-3">
          {/* Search */}
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search products..."
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
          <EmptyState
            icon={ShoppingBag}
            title={searchQuery || categoryFilter !== 'all' || statusFilter !== 'all' 
              ? "No products found" 
              : "No products yet"}
            description={searchQuery || categoryFilter !== 'all' || statusFilter !== 'all'
              ? "Try adjusting your filters"
              : "Start building your catalog by adding your first product"}
            actionLabel="Add Product"
            onAction={handleAdd}
          />
        ) : (
          <ProductGrid
            products={filteredProducts}
            onEdit={handleEdit}
            currency={tenant?.currency || 'SGD'}
            viewMode={viewMode}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onLongPress={handleLongPress}
            onToggleSelect={handleToggleSelect}
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
          onOpenChange={setScanMenuOpen}
          tenantId={tenantId}
          categories={categories}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
            queryClient.invalidateQueries({ queryKey: ['categories', tenantId] });
          }}
        />
      </div>
      </PullToRefresh>
    </RequirePermission>
  );
}