import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PullToRefresh from '../components/ui-custom/PullToRefresh';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import EmptyState from '../components/ui-custom/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StockAdjustmentPanel from '../components/inventory/StockAdjustmentPanel';
import InventoryLogTable from '../components/inventory/InventoryLogTable';
import StockTakeDialog from '../components/inventory/StockTakeDialog';
import { Package, AlertTriangle, CheckCircle, XCircle, Search, ClipboardCheck } from 'lucide-react';

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
  const handleRefresh = useCallback(() =>
    queryClient.invalidateQueries({ queryKey: ['inventory', tenantId] }), [queryClient, tenantId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showStockTake, setShowStockTake] = useState(false);

  // Fetch inventory_items joined with products — inventory_items is source of truth
  const { data: inventoryItems = [], isLoading } = useQuery({
    queryKey: ['inventory', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*, product:products(id, name, sku, image_url, track_inventory, is_active, low_stock_threshold, stock_quantity)')
        .eq('tenant_id', tenantId);
      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Only show items where track_inventory = true
  const trackedItems = inventoryItems.filter(item => item.product?.track_inventory === true);

  // Stats from inventory_items.current_stock
  const totalTracked = trackedItems.length;
  const inStock = trackedItems.filter(item => item.current_stock > (item.low_stock_threshold ?? item.product?.low_stock_threshold ?? 5)).length;
  const lowStock = trackedItems.filter(item => item.current_stock > 0 && item.current_stock < (item.low_stock_threshold ?? item.product?.low_stock_threshold ?? 5)).length;
  const outOfStock = trackedItems.filter(item => item.current_stock === 0).length;

  // Filter
  const filteredItems = trackedItems.filter(item => {
    const threshold = item.low_stock_threshold ?? item.product?.low_stock_threshold ?? 5;
    const matchesSearch = !searchQuery ||
      item.product?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.product?.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'in_stock' && item.current_stock > threshold) ||
      (statusFilter === 'low_stock' && item.current_stock > 0 && item.current_stock < threshold) ||
      (statusFilter === 'out_of_stock' && item.current_stock === 0);
    return matchesSearch && matchesStatus;
  });

  // Sort by stock level ascending
  const sortedItems = [...filteredItems].sort((a, b) => (a.current_stock || 0) - (b.current_stock || 0));

  const getStatusBadge = (item) => {
    const threshold = item.low_stock_threshold ?? item.product?.low_stock_threshold ?? 5;
    if (item.current_stock === 0) return <Badge className="bg-red-100 text-red-700 border-red-300">Out of Stock</Badge>;
    if (item.current_stock < threshold) return <Badge className="bg-amber-100 text-amber-700 border-amber-300">Low Stock</Badge>;
    return <Badge className="bg-green-100 text-green-700 border-green-300">In Stock</Badge>;
  };

  // Build a product-shaped object for StockAdjustmentPanel (which expects product + inv data)
  const buildProductForPanel = (item) => ({
    ...item.product,
    inventory_item_id: item.id,
    current_stock: item.current_stock,
    low_stock_threshold: item.low_stock_threshold ?? item.product?.low_stock_threshold ?? 5,
  });

  // trackedProducts shape for StockTakeDialog (needs product list)
  const trackedProducts = trackedItems.map(item => ({
    ...item.product,
    inventory_item_id: item.id,
    current_stock: item.current_stock,
  }));

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
              disabled={trackedItems.length === 0}
            >
              <ClipboardCheck className="w-4 h-4" />
              Start Stock Take
            </Button>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-6 border-0 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Total Tracked</p>
                <p className="text-3xl font-bold text-slate-900">{totalTracked}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                <Package className="w-6 h-6 text-slate-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border-0 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">In Stock</p>
                <p className="text-3xl font-bold text-green-600">{inStock}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border-0 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Low Stock</p>
                <p className="text-3xl font-bold text-amber-600">{lowStock}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border-0 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Out of Stock</p>
                <p className="text-3xl font-bold text-red-600">{outOfStock}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </Card>
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
                </SelectContent>
              </Select>
            </div>

            {/* Inventory Table */}
            {isLoading ? (
              <div className="text-center py-12 text-slate-400">Loading inventory...</div>
            ) : sortedItems.length === 0 ? (
              <EmptyState
                icon={Package}
                title={searchQuery || statusFilter !== 'all' ? "No products found" : "No inventory tracked"}
                description={searchQuery || statusFilter !== 'all' ? "Try adjusting your filters" : "Enable inventory tracking on products to see them here"}
              />
            ) : (
              <Card className="border-0 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Product</th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">SKU</th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Stock</th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Threshold</th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Status</th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedItems.map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-25 transition-colors cursor-pointer"
                          onClick={() => setSelectedItem(item)}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {item.product?.image_url ? (
                                <img src={item.product.image_url} alt={item.product.name} className="w-10 h-10 rounded-lg object-cover" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                                  <Package className="w-5 h-5 text-slate-400" />
                                </div>
                              )}
                              <p className="font-medium text-slate-900">{item.product?.name}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.product?.sku || '-'}</td>
                          <td className="px-6 py-4">
                            <p className="text-lg font-bold text-slate-900">{item.current_stock ?? 0}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {item.low_stock_threshold ?? item.product?.low_stock_threshold ?? 5}
                          </td>
                          <td className="px-6 py-4">{getStatusBadge(item)}</td>
                          <td className="px-6 py-4 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}
                            >
                              Adjust
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="logs">
            <InventoryLogTable tenantId={tenantId} />
          </TabsContent>
        </Tabs>

        {/* Stock Adjustment Panel */}
        <StockAdjustmentPanel
          open={!!selectedItem}
          onOpenChange={(open) => !open && setSelectedItem(null)}
          product={selectedItem ? buildProductForPanel(selectedItem) : null}
          tenantId={tenantId}
        />

        {/* Stock Take Dialog */}
        <StockTakeDialog
          open={showStockTake}
          onOpenChange={setShowStockTake}
          products={trackedProducts}
          tenantId={tenantId}
        />
      </div>
    </PullToRefresh>
  );
}