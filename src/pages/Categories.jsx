import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import db from '@/lib/db';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PermissionGate from '../components/tenant/PermissionGate';
import PageHeader from '../components/ui-custom/PageHeader';
import EmptyState from '../components/ui-custom/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Grid3X3, Plus, Pencil, Trash2, LayoutGrid, List } from 'lucide-react';

export default function Categories() {
  return (
    <RequirePermission permission="categories.view">
      <CategoriesContent />
    </RequirePermission>
  );
}

function CategoriesContent() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', is_active: true, sort_order: 0 });
  const [viewMode, setViewMode] = useState(localStorage.getItem('categories_view_mode') || 'grid');
  const handleViewToggle = (mode) => { setViewMode(mode); localStorage.setItem('categories_view_mode', mode); };

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', tenantId],
    queryFn: () => db.entities.Category.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products', tenantId],
    queryFn: () => db.entities.Product.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const supabase = await getSupabase();
      if (editing) {
        const { error } = await supabase.from('categories').update(data).eq('id', editing.id).eq('tenant_id', tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('categories').insert({ ...data, tenant_id: tenantId, slug: data.name.toLowerCase().replace(/\s+/g, '-') });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); close(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.entities.Category.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  const open = (cat) => { setEditing(cat || null); setForm(cat ? { name: cat.name, description: cat.description || '', is_active: cat.is_active !== false, sort_order: cat.sort_order || 0 } : { name: '', description: '', is_active: true, sort_order: 0 }); setShowForm(true); };
  const close = () => { setShowForm(false); setEditing(null); };

  return (
    <PermissionGate permission="categories.read">
      <PageHeader title="Categories" description="Organize your products into categories"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              <button onClick={() => handleViewToggle('grid')} style={{ background: viewMode === 'grid' ? 'rgba(var(--color-primary), 0.08)' : 'transparent', color: viewMode === 'grid' ? 'rgb(var(--color-primary))' : '#9ca3af', border: '0.5px solid #e5e7eb', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer' }}>
                <LayoutGrid size={18} />
              </button>
              <button onClick={() => handleViewToggle('list')} style={{ background: viewMode === 'list' ? 'rgba(var(--color-primary), 0.08)' : 'transparent', color: viewMode === 'list' ? 'rgb(var(--color-primary))' : '#9ca3af', border: '0.5px solid #e5e7eb', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer' }}>
                <List size={18} />
              </button>
            </div>
            <Button
              onClick={() => open(null)}
              size="sm"
              className="text-white gap-1.5"
              style={{ background: 'var(--color-primary-gradient)' }}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Category</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        }
      />

      {categories.length === 0 ? (
        <Card className="border-0 shadow-sm"><EmptyState icon={Grid3X3} title="No categories" description="Create categories to organize your products." actionLabel="Add Category" onAction={() => open(null)} /></Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-4">
          {categories.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(cat => {
            const count = products.filter(p => p.category_id === cat.id).length;
            return (
              <Card key={cat.id} className="border-0 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">{cat.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">{count} product{count !== 1 ? 's' : ''}</p>
                    {cat.description && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{cat.description}</p>}
                    {!cat.is_active && <span className="inline-block mt-2 text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded">Inactive</span>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <button onClick={() => open(cat)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
                      style={{ color: 'rgb(var(--color-primary))' }}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(cat.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors text-red-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {categories.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(cat => {
            const count = products.filter(p => p.category_id === cat.id).length;
            return (
              <Card key={cat.id} className="border-0 shadow-sm px-4 py-3 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">{cat.name}</h3>
                    <p className="text-xs text-slate-400">{count} product{count !== 1 ? 's' : ''}{!cat.is_active ? ' · Inactive' : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => open(cat)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
                      style={{ color: 'rgb(var(--color-primary))' }}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(cat.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors text-red-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Category' : 'New Category'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.name || saveMutation.isPending} className="bg-slate-900 hover:bg-slate-800">
              {saveMutation.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}