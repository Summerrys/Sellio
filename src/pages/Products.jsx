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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ShoppingBag, Plus, Search, LayoutGrid, List, Upload, Download, FileDown, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';

const CSV_HEADERS = ['Name', 'SKU', 'Description', 'Category', 'Price', 'Cost Price', 'Compare At Price', 'Stock', 'Low Stock Threshold', 'Active', 'Featured', 'Tags', 'Image URL'];
const EXAMPLE_ROW = ['Green Tea Latte', 'GTL-001', 'Creamy matcha blend', 'Beverages', '6.50', '2.50', '8.00', '50', '10', 'true', 'false', 'health,matcha,hot', 'https://example.com/green-tea-latte.jpg'];

export default function Products() {
  const { tenantId, tenant } = useTenant();
  const queryClient = useQueryClient();
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
      (statusFilter === 'low_stock' && product.track_inventory === true && product.stock_quantity !== null && product.stock_quantity > 0 && product.stock_quantity <= (product.low_stock_threshold || 5));

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
    const csv = [CSV_HEADERS.join(','), EXAMPLE_ROW.join(',')].join('\n');
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
      p.name,
      p.sku || '',
      p.description || '',
      categories.find(c => c.id === p.category_id)?.name || '',
      p.price,
      p.cost_price || '',
      p.compare_at_price || '',
      p.stock_quantity ?? 0,
      p.low_stock_threshold ?? 5,
      p.is_active ? 'true' : 'false',
      p.is_featured ? 'true' : 'false',
      Array.isArray(p.tags) ? p.tags.join(',') : (p.tags || ''),
      p.image_url || '',
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

  return (
    <RequirePermission permission="products.view">
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-6">
        <PageHeader
          title="Products"
          description="Manage your product catalog"
          actions={
            <>
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
            <div className="flex gap-1 ml-auto">
              <button
                onClick={() => handleViewToggle('grid')}
                style={{
                  background: viewMode === 'grid' ? '#f3f0ff' : 'transparent',
                  color: viewMode === 'grid' ? '#7c3aed' : '#9ca3af',
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
                  background: viewMode === 'list' ? '#f3f0ff' : 'transparent',
                  color: viewMode === 'list' ? '#7c3aed' : '#9ca3af',
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
        ) : viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {filteredProducts.map(product => (
              <div
                key={product.id}
                onClick={() => handleEdit(product)}
                style={{
                  background: 'white', borderRadius: '12px',
                  border: '0.5px solid #e5e7eb', overflow: 'hidden', cursor: 'pointer',
                }}
              >
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ width: '100%', aspectRatio: '1', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShoppingBag style={{ width: 32, height: 32, color: '#cbd5e1' }} />
                  </div>
                )}
                <div style={{ padding: '8px' }}>
                  <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</p>
                  <p style={{ color: '#7c3aed', fontWeight: '600', fontSize: '13px', margin: 0 }}>{tenant?.currency || 'SGD'} {parseFloat(product.price).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredProducts.map(product => (
              <div
                key={product.id}
                onClick={() => handleEdit(product)}
                style={{
                  display: 'flex', gap: '12px', background: 'white',
                  borderRadius: '12px', border: '0.5px solid #e5e7eb',
                  padding: '12px', cursor: 'pointer',
                }}
              >
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    style={{ width: '72px', height: '72px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{ width: '72px', height: '72px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ShoppingBag style={{ width: 24, height: 24, color: '#cbd5e1' }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: '600', fontSize: '14px', margin: 0 }}>{product.name}</p>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.description}</p>
                  <p style={{ color: '#7c3aed', fontWeight: '600', fontSize: '14px', margin: '4px 0 0' }}>{tenant?.currency || 'SGD'} {parseFloat(product.price).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
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