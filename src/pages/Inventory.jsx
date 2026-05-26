import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PullToRefresh from '../components/ui-custom/PullToRefresh';
import db from '@/lib/db';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import EmptyState from '../components/ui-custom/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StockAdjustmentPanel from '../components/inventory/StockAdjustmentPanel';
import InventoryLogTable from '../components/inventory/InventoryLogTable';
import StockTakeDialog from '../components/inventory/StockTakeDialog';
import { Package, Search, ClipboardCheck } from 'lucide-react';

export default function Inventory() {
  return (
    <RequirePermission permission="inventory.view">
      <InventoryContent />
    </RequirePermission>
  );
}

function InventoryContent() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['inventoryItems', tenantId] });
  }, [queryClient, tenantId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showStockTake, setShowStockTake] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', tenantId],
    queryFn: () => db.entities.Product.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems', tenantId],
    queryFn: async () => {
      const { getSupabase } = await import('@/lib/supabaseClient');
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('inventory_items')
        .select('product_id, current_stock, low_stock_threshold')
        .eq('tenant_id', tenantId);
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Build a lookup map: product_id -> inventory row
  const inventoryMap = Object.fromEntries(inventoryItems.map(i => [i.product_id, i]));

  // Merge inventory_items.current_stock into each product
  const productsWithStock = products.map(p => ({
    ...p,
    current_stock: inventoryMap[p.id]?.current_stock ?? p.stock_quantity ?? 0,
    low_stock_threshold: inventoryMap[p.id]?.low_stock_threshold ?? p.low_stock_threshold ?? 5,
  }));

  const getStockStatus = (product) => {
    if (!product.track_inventory) {
      return { label: 'Unlimited', color: '#6b7280', bg: '#f3f4f6' };
    }
    const stock = product.current_stock;
    const threshold = product.low_stock_threshold;
    if (stock === 0) return { label: 'Out of Stock', color: '#dc2626', bg: '#fee2e2' };
    if (stock <= threshold) return { label: `Low Stock (${stock})`, color: '#92400e', bg: '#fef3c7' };
    return { label: `${stock} in stock`, color: '#166534', bg: '#dcfce7' };
  };

  // All products shown; tracked ones have full status logic
  const trackedProducts = productsWithStock.filter(p => p.track_inventory);

  // Calculate summary stats — only count tracked products
  const totalTracked = trackedProducts.length;
  const outOfStock = trackedProducts.filter(p => p.current_stock === 0).length;
  const lowStock = trackedProducts.filter(p => {
    return p.current_stock > 0 && p.current_stock <= p.low_stock_threshold;
  }).length;
  const inStock = totalTracked - outOfStock - lowStock;
  const unlimitedCount = productsWithStock.filter(p => !p.track_inventory).length;

  // Filter products
  const filteredProducts = productsWithStock.filter(product => {
    const matchesSearch = !searchQuery ||
      product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchQuery.toLowerCase());

    const stock = product.current_stock;
    const threshold = product.low_stock_threshold;
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'unlimited' && !product.track_inventory) ||
      (statusFilter === 'in_stock' && product.track_inventory && stock > 0 && stock > threshold) ||
      (statusFilter === 'low_stock' && product.track_inventory && stock > 0 && stock <= threshold) ||
      (statusFilter === 'out_of_stock' && product.track_inventory && stock === 0);

    return matchesSearch && matchesStatus;
  });

  // Sort: unlimited last, then by stock level ascending
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!a.track_inventory && b.track_inventory) return 1;
    if (a.track_inventory && !b.track_inventory) return -1;
    return a.current_stock - b.current_stock;
  });

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="space-y-6">
        <PageHeader
          title="Inventory Management"
          description="Track and manage your stock levels"
          actions={
            <Button
              onClick={() => setShowStockTake(true)}
              className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))] gap-2"
              disabled={trackedProducts.length === 0}
            >
              <ClipboardCheck className="w-4 h-4" />
              Start Stock Take
            </Button>
          }
        />

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
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-11"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40 h-11">
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
            </div>

            {/* Inventory Table */}
            {isLoading ? (
              <div className="text-center py-12 text-slate-400">Loading inventory...</div>
            ) : sortedProducts.length === 0 ? (
              <EmptyState
                icon={Package}
                title={searchQuery || statusFilter !== 'all' ? "No products found" : "No inventory tracked"}
                description={searchQuery || statusFilter !== 'all' ? "Try adjusting your filters" : "Enable inventory tracking on products to see them here"}
              />
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
                      style={{
                        display: 'flex', gap: '12px', alignItems: 'center',
                        background: 'white',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        padding: '10px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      {product.image_url
                        ? <img src={product.image_url} alt={product.name} style={{ width: '52px', height: '52px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                        : <div style={{ width: '52px', height: '52px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🛍️</div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a' }}>
                          {product.name}
                        </p>
                        <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 5px' }}>
                          {product.sku || 'No SKU'}
                        </p>
                        {product.track_inventory && (
                          <div style={{ height: '3px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', width: '100%' }}>
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
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        {product.track_inventory ? (
                          <>
                            <p style={{ fontWeight: '700', fontSize: '16px', margin: '0 0 3px', color: status.color }}>{stock}</p>
                            <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '999px', background: status.bg, color: status.color, whiteSpace: 'nowrap' }}>
                              {status.label}
                            </span>
                          </>
                        ) : (
                          <>
                            <p style={{ fontWeight: '700', fontSize: '18px', margin: '0 0 3px', color: '#6b7280' }}>∞</p>
                            <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '999px', background: '#f3f4f6', color: '#6b7280' }}>
                              Unlimited
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs">
            <InventoryLogTable tenantId={tenantId} />
          </TabsContent>
        </Tabs>

        {/* Stock Adjustment Panel */}
        <StockAdjustmentPanel
          open={!!selectedProduct}
          onOpenChange={(open) => !open && setSelectedProduct(null)}
          product={selectedProduct}
          tenantId={tenantId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
            queryClient.invalidateQueries({ queryKey: ['inventoryItems', tenantId] });
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