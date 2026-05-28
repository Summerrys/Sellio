import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PullToRefresh from '../components/ui-custom/PullToRefresh';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import EmptyState from '../components/ui-custom/EmptyState';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StockAdjustmentPanel from '../components/inventory/StockAdjustmentPanel';
import InventoryLogTable from '../components/inventory/InventoryLogTable';
import StockHistoryList from '../components/inventory/StockHistoryList';
import StockTakeDialog from '../components/inventory/StockTakeDialog';
import { Package, Search, ClipboardList, LayoutGrid, List, Activity, ChevronRight } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { Switch } from '@/components/ui/switch';

export default function Inventory() {
  return (
    <RequirePermission permission="inventory.view">
      <InventoryContent />
    </RequirePermission>
  );
}

function InventoryContent() {
  const { tenantId, tenant } = useTenant();
  const queryClient = useQueryClient();
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['inventoryMerged', tenantId] });
  }, [queryClient, tenantId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showStockTake, setShowStockTake] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('inventory_view_mode') || 'list');

  const handleViewToggle = (mode) => {
    setViewMode(mode);
    localStorage.setItem('inventory_view_mode', mode);
  };

  // Fetch products + inventory merged
  const { data: mergedProducts = [], isLoading } = useQuery({
    queryKey: ['inventoryMerged', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const [{ data: products }, { data: inventoryItems }] = await Promise.all([
        supabase.from('products').select('id, name, sku, image_url, category_id, track_inventory').eq('tenant_id', tenantId),
        supabase.from('inventory_items').select('product_id, current_stock, low_stock_threshold').eq('tenant_id', tenantId),
      ]);
      const invMap = Object.fromEntries((inventoryItems || []).map(i => [i.product_id, i]));
      return (products || []).map(p => ({
        ...p,
        current_stock: invMap[p.id]?.current_stock ?? 0,
        low_stock_threshold: invMap[p.id]?.low_stock_threshold ?? 5,
      }));
    },
    enabled: !!tenantId,
  });

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.from('categories').select('id, name').eq('tenant_id', tenantId);
      return data || [];
    },
    enabled: !!tenantId,
  });

  const getStockStatus = (product) => {
    if (!product.track_inventory) return { label: 'Unlimited', color: '#6b7280', bg: '#f3f4f6' };
    const stock = product.current_stock;
    const threshold = product.low_stock_threshold;
    if (stock === 0) return { label: 'Out of Stock', color: '#dc2626', bg: '#fee2e2' };
    if (stock > 0 && stock < threshold) return { label: `Low Stock (${stock})`, color: '#92400e', bg: '#fef3c7' };
    return { label: `${stock} in stock`, color: '#166534', bg: '#dcfce7' };
  };

  const trackedProducts = mergedProducts.filter(p => p.track_inventory);
  const outOfStock = mergedProducts.filter(p => p.track_inventory && p.current_stock === 0).length;
  const lowStock = mergedProducts.filter(p => p.track_inventory && p.current_stock > 0 && p.current_stock < p.low_stock_threshold).length;
  const unlimitedCount = mergedProducts.filter(p => !p.track_inventory).length;

  const filteredProducts = mergedProducts.filter(product => {
    const matchesSearch = !searchQuery ||
      product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchQuery.toLowerCase());

    const stock = product.current_stock;
    const threshold = product.low_stock_threshold;
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'unlimited' && !product.track_inventory) ||
      (statusFilter === 'in_stock' && product.track_inventory && stock > 0 && stock > threshold) ||
      (statusFilter === 'low_stock' && product.track_inventory && stock > 0 && stock < threshold) ||
      (statusFilter === 'out_of_stock' && product.track_inventory && stock === 0);

    const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!a.track_inventory && b.track_inventory) return 1;
    if (a.track_inventory && !b.track_inventory) return -1;
    return a.current_stock - b.current_stock;
  });

  const handleToggleTracking = async (productId, newValue) => {
    const supabase = await getSupabase();
    await supabase.from('products').update({
      track_inventory: newValue,
      updated_date: new Date().toISOString(),
    }).eq('id', productId).eq('tenant_id', tenantId);
    queryClient.invalidateQueries({ queryKey: ['inventoryMerged', tenantId] });
  };

  const handleStartStockTake = () => setShowStockTake(true);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
            <p className="text-sm text-slate-500">Track and manage your stock levels</p>
          </div>
          <button
            onClick={handleStartStockTake}
            disabled={trackedProducts.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
            <ClipboardList className="w-4 h-4" /> Stock Take
          </button>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <div style={{ background: 'var(--color-background-secondary, #f1f5f9)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
            <p style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 2px', color: '#dc2626' }}>{outOfStock}</p>
            <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>Out of stock</p>
          </div>
          <div style={{ background: 'var(--color-background-secondary, #f1f5f9)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
            <p style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 2px', color: '#92400e' }}>{lowStock}</p>
            <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>Low stock</p>
          </div>
          <div style={{ background: 'var(--color-background-secondary, #f1f5f9)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
            <p style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 2px', color: '#6b7280' }}>{unlimitedCount}</p>
            <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>Unlimited</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="inventory" className="space-y-4">
          <TabsList>
            <TabsTrigger value="inventory">Current Stock</TabsTrigger>
            <TabsTrigger value="logs">History</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-11"
              />
            </div>

            {/* Filters + View toggle */}
            <div className="flex gap-2 items-center flex-wrap">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="flex-1 min-w-[120px] h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="flex-1 min-w-[110px] h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in_stock">In Stock</SelectItem>
                  <SelectItem value="low_stock">Low Stock</SelectItem>
                  <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                  <SelectItem value="unlimited">Unlimited</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex gap-1 ml-auto">
                <button
                  onClick={() => handleViewToggle('grid')}
                  style={{
                    background: viewMode === 'grid' ? 'rgba(var(--color-primary), 0.08)' : 'transparent',
                    color: viewMode === 'grid' ? 'rgb(var(--color-primary))' : '#9ca3af',
                    border: '0.5px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    cursor: 'pointer',
                  }}
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => handleViewToggle('list')}
                  style={{
                    background: viewMode === 'list' ? 'rgba(var(--color-primary), 0.08)' : 'transparent',
                    color: viewMode === 'list' ? 'rgb(var(--color-primary))' : '#9ca3af',
                    border: '0.5px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    cursor: 'pointer',
                  }}
                >
                  <List size={18} />
                </button>
              </div>
            </div>

            {/* Inventory List/Grid */}
            {isLoading ? (
              <div className="text-center py-12 text-slate-400">Loading inventory...</div>
            ) : sortedProducts.length === 0 ? (
              <EmptyState
                icon={Package}
                title={searchQuery || statusFilter !== 'all' || categoryFilter !== 'all' ? "No products found" : "No inventory tracked"}
                description={searchQuery || statusFilter !== 'all' || categoryFilter !== 'all' ? "Try adjusting your filters" : "Enable inventory tracking on products to see them here"}
              />
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-3">
                {sortedProducts.map((product) => {
                  const status = getStockStatus(product);
                  const stock = product.current_stock;
                  const threshold = product.low_stock_threshold;
                  return (
                    <div
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className="bg-white border border-slate-200 rounded-xl overflow-hidden cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all active:scale-[0.99]"
                      style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}
                    >
                      {product.image_url
                        ? <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '80px', borderRadius: '8px', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '80px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🛍️</div>
                      }
                      <div>
                        <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a' }}>{product.name}</p>
                        <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>{product.sku || 'No SKU'}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        {product.track_inventory ? (
                          <div style={{ flex: 1 }}>
                            <div style={{ height: '3px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', marginBottom: '4px' }}>
                              <div style={{ height: '100%', width: `${Math.min((stock / Math.max(threshold * 2, 1)) * 100, 100)}%`, background: stock === 0 ? '#dc2626' : stock < threshold ? '#f59e0b' : '#16a34a', borderRadius: '999px' }} />
                            </div>
                            <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '999px', background: status.bg, color: status.color }}>{status.label}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '999px', background: '#f3f4f6', color: '#6b7280' }}>Unlimited</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between px-1 mt-2" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5" style={{ color: 'rgb(var(--color-primary))' }} />
                          <span className="text-xs font-medium" style={{ color: 'rgb(var(--color-primary))' }}>Track stock</span>
                        </div>
                        <Switch
                          checked={!!product.track_inventory}
                          onCheckedChange={(v) => handleToggleTracking(product.id, v)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sortedProducts.map((product) => {
                  const status = getStockStatus(product);
                  const stock = product.current_stock;
                  const threshold = product.low_stock_threshold;
                  return (
                    <div
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className="bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all active:scale-[0.99]"
                      style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px 12px' }}
                    >
                      {product.image_url
                        ? <img src={product.image_url} alt={product.name} style={{ width: '52px', height: '52px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                        : <div style={{ width: '52px', height: '52px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🛍️</div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a' }}>
                          {product.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-400">{product.sku || 'No SKU'}</span>
                          {product.track_inventory ? (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              stock === 0 ? 'bg-red-100 text-red-600' :
                              stock < threshold ? 'bg-amber-100 text-amber-600' :
                              'bg-green-100 text-green-600'
                            }`}>
                              {stock === 0 ? 'Out of stock' :
                               stock < threshold ? `Low (${stock})` :
                               `${stock} in stock`}
                            </span>
                          ) : (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Unlimited</span>
                          )}
                        </div>
                        {product.track_inventory && (
                          <div style={{ height: '3px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', width: '100%', marginTop: '6px' }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min((stock / Math.max(threshold * 2, 1)) * 100, 100)}%`,
                              background: stock === 0 ? '#dc2626' : stock < threshold ? '#f59e0b' : '#16a34a',
                              borderRadius: '999px',
                              transition: 'width 0.3s ease'
                            }} />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <ChevronRight className="w-4 h-4" style={{ color: 'rgb(var(--color-primary))' }} />
                        <div onClick={e => e.stopPropagation()}>
                          <Switch
                            checked={!!product.track_inventory}
                            onCheckedChange={(v) => handleToggleTracking(product.id, v)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs">
            <StockHistoryList tenantId={tenantId} />
          </TabsContent>
        </Tabs>

        {/* Stock Adjustment Panel */}
        <StockAdjustmentPanel
          open={!!selectedProduct}
          onOpenChange={(open) => !open && setSelectedProduct(null)}
          product={selectedProduct}
          tenantId={tenantId}
          initialThreshold={selectedProduct?.low_stock_threshold}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['inventoryMerged', tenantId] });
          }}
        />

        {/* Stock Take Dialog */}
        <StockTakeDialog
          open={showStockTake}
          onOpenChange={setShowStockTake}
          products={trackedProducts.map(p => ({ ...p, stock_quantity: p.current_stock }))}
          tenantId={tenantId}
        />
      </div>
    </PullToRefresh>
  );
}