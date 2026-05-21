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
import ProductGrid from '../components/products/ProductGrid';
import ProductFormDialog from '../components/products/ProductFormDialog.jsx';
import ProductImportDialog from '../components/products/ProductImportDialog';
import { ShoppingBag, Plus, Search, LayoutGrid, List, Upload, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Products() {
  const { tenantId, tenant } = useTenant();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingProduct, setEditingProduct] = useState(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Auto-open new product dialog when navigated from Sell button (?new=1)
  const urlParams = new URLSearchParams(window.location.search);
  const [showDialog, setShowDialog] = useState(urlParams.get('new') === '1');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', tenantId],
    queryFn: () => db.entities.Product.filter({ tenant_id: tenantId }, '-created_date'),
    enabled: !!tenantId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', tenantId],
    queryFn: () => db.entities.Category.filter({ tenant_id: tenantId }),
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
      (statusFilter === 'low_stock' && product.stock_quantity <= (product.low_stock_threshold || 5));

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

  const handleExport = () => {
    const csv = [
      ['Name', 'SKU', 'Description', 'Category', 'Price', 'Cost Price', 'Stock', 'Low Stock Threshold', 'Active', 'Image URL'].join(','),
      ...filteredProducts.map(p => [
        p.name,
        p.sku || '',
        p.description || '',
        categories.find(c => c.id === p.category_id)?.name || '',
        p.price,
        p.cost_price || '',
        p.stock_quantity || 0,
        p.low_stock_threshold || 5,
        p.is_active,
        p.image_url || ''
      ].join(','))
    ].join('\n');

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

  return (
    <RequirePermission permission="products.view">
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-6">
        <PageHeader
          title="Products"
          description="Manage your product catalog"
          actions={
            <>
              <Button onClick={() => setImportDialogOpen(true)} variant="outline" size="sm">
                <Download className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Import</span>
              </Button>
              <RequirePermission permission="products.create" silent>
                <Button onClick={handleExport} variant="outline" size="sm">
                  <Upload className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Export</span>
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
            </>
          }
        />

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

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="flex-1 min-w-[110px] h-11">
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
            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode('grid')}
                className={cn("h-8 px-3", viewMode === 'grid' && "bg-white shadow-sm")}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode('list')}
                className={cn("h-8 px-3", viewMode === 'list' && "bg-white shadow-sm")}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Products Display */}
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">Loading products...</div>
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
      </div>
      </PullToRefresh>
    </RequirePermission>
  );
}