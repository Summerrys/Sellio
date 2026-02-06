import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import StatusBadge from '../components/ui-custom/StatusBadge';
import EmptyState from '../components/ui-custom/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ShoppingBag, Plus, Search, Pencil, Trash2, DollarSign, Package } from 'lucide-react';

const defaultProduct = { name: '', description: '', price: 0, cost_price: 0, sku: '', stock_quantity: 0, low_stock_threshold: 5, category_id: '', is_active: true, is_featured: false, image_url: '' };

export default function Products() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(defaultProduct);

  const { data: products = [] } = useQuery({
    queryKey: ['products', tenantId],
    queryFn: () => base44.entities.Product.filter({ tenant_id: tenantId }, '-created_date'),
    enabled: !!tenantId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', tenantId],
    queryFn: () => base44.entities.Category.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.Product.update(editing.id, data)
      : base44.entities.Product.create({ ...data, tenant_id: tenantId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const openCreate = () => { setEditing(null); setForm(defaultProduct); setShowForm(true); };
  const openEdit = (p) => { setEditing(p); setForm({ name: p.name, description: p.description || '', price: p.price, cost_price: p.cost_price || 0, sku: p.sku || '', stock_quantity: p.stock_quantity || 0, low_stock_threshold: p.low_stock_threshold || 5, category_id: p.category_id || '', is_active: p.is_active !== false, is_featured: p.is_featured || false, image_url: p.image_url || '' }); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(defaultProduct); };

  const filtered = products.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <RequirePermission permission="products.view">
      <PageHeader
        title="Products"
        description="Manage your menu items and products"
        actions={
          <RequirePermission permission="products.create" silent>
            <Button onClick={openCreate} className="bg-slate-900 hover:bg-slate-800 gap-2">
              <Plus className="w-4 h-4" /> Add Product
            </Button>
          </RequirePermission>
        }
      />

      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="No products yet" description="Add your first product to start selling." actionLabel="Add Product" onAction={openCreate} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-6">
            {filtered.map(p => {
              const cat = categories.find(c => c.id === p.category_id);
              return (
                <div key={p.id} className="group bg-white border border-slate-100 rounded-2xl overflow-hidden hover:shadow-md transition-all duration-200">
                  <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-8 h-8 text-slate-200" />
                      </div>
                    )}
                    {!p.is_active && (
                      <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                        <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded-full">Inactive</span>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="secondary" className="h-7 w-7 rounded-lg" onClick={() => openEdit(p)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="secondary" className="h-7 w-7 rounded-lg text-red-500 hover:text-red-600" onClick={() => deleteMutation.mutate(p.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="p-4">
                    {cat && <p className="text-xs font-medium text-slate-400 mb-1">{cat.name}</p>}
                    <h3 className="text-sm font-semibold text-slate-900 mb-1 truncate">{p.name}</h3>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-slate-900">${p.price?.toFixed(2)}</span>
                      <span className={`text-xs font-medium ${(p.stock_quantity || 0) <= (p.low_stock_threshold || 5) ? 'text-amber-600' : 'text-slate-400'}`}>
                        {p.stock_quantity || 0} in stock
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Product Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Product' : 'New Product'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Price</Label><Input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Cost Price</Label><Input type="number" step="0.01" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <div><Label>Category</Label>
              <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>SKU</Label><Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></div>
              <div><Label>Stock Qty</Label><Input type="number" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div><Label>Image URL</Label><Input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} /></div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_featured} onCheckedChange={v => setForm({ ...form, is_featured: v })} /><Label>Featured</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.name || saveMutation.isPending} className="bg-slate-900 hover:bg-slate-800">
              {saveMutation.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RequirePermission>
  );
}