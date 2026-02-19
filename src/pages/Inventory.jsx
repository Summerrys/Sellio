import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showStockTake, setShowStockTake] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', tenantId],
    queryFn: () => base44.entities.Product.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  // Filter tracked products only
  const trackedProducts = products.filter(p => 
    p.stock_quantity !== undefined && p.stock_quantity !== null
  );

  // Calculate summary stats
  const totalTracked = trackedProducts.length;
  const inStock = trackedProducts.filter(p => p.stock_quantity > (p.low_stock_threshold || 5)).length;
  const lowStock = trackedProducts.filter(p => 
    p.stock_quantity > 0 && p.stock_quantity <= (p.low_stock_threshold || 5)
  ).length;
  const outOfStock = trackedProducts.filter(p => p.stock_quantity === 0).length;

  // Filter products
  const filteredProducts = trackedProducts.filter(product => {
    const matchesSearch = !searchQuery || 
      product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'in_stock' && product.stock_quantity > (product.low_stock_threshold || 5)) ||
      (statusFilter === 'low_stock' && product.stock_quantity > 0 && product.stock_quantity <= (product.low_stock_threshold || 5)) ||
      (statusFilter === 'out_of_stock' && product.stock_quantity === 0);

    return matchesSearch && matchesStatus;
  });

  // Sort by stock level (ascending)
  const sortedProducts = [...filteredProducts].sort((a, b) => 
    (a.stock_quantity || 0) - (b.stock_quantity || 0)
  );

  const getStatusBadge = (product) => {
    if (product.stock_quantity === 0) {
      return <Badge className="bg-red-100 text-red-700 border-red-300">Out of Stock</Badge>;
    }
    if (product.stock_quantity <= (product.low_stock_threshold || 5)) {
      return <Badge className="bg-amber-100 text-amber-700 border-amber-300">Low Stock</Badge>;
    }
    return <Badge className="bg-green-100 text-green-700 border-green-300">In Stock</Badge>;
  };

  return (
    <RequirePermission permission="inventory.view">
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
                  className="pl-9"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
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
            ) : sortedProducts.length === 0 ? (
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
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                          Product
                        </th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                          SKU
                        </th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                          Stock
                        </th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                          Threshold
                        </th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                          Status
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedProducts.map((product) => (
                        <tr 
                          key={product.id} 
                          className="hover:bg-slate-25 transition-colors cursor-pointer"
                          onClick={() => setSelectedProduct(product)}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  className="w-10 h-10 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                                  <Package className="w-5 h-5 text-slate-400" />
                                </div>
                              )}
                              <p className="font-medium text-slate-900">{product.name}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {product.sku || '-'}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-lg font-bold text-slate-900">
                              {product.stock_quantity || 0}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {product.low_stock_threshold || 5}
                          </td>
                          <td className="px-6 py-4">
                            {getStatusBadge(product)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProduct(product);
                              }}
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
          open={!!selectedProduct}
          onOpenChange={(open) => !open && setSelectedProduct(null)}
          product={selectedProduct}
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
    </RequirePermission>
  );
}