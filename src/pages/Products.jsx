import React, { useState, useCallback } from 'react';
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
import { ShoppingBag, Plus, Search, LayoutGrid, List, Upload, Download, FileDown, FileSpreadsheet, Package } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

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

  return (
    <RequirePermission permission="products.view">
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold text-slate-900">Products</h1>
            <button
              onClick={() => navigate('/Inventory')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-full text-slate-600 hover:border-purple-400 hover:text-purple-600 transition-colors"
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
        ) : (
          <ProductGrid 
            products={filteredProducts} 
            onEdit={handleEdit}
            currency={tenant?.currency || 'SGD'}
            viewMode={viewMode}
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