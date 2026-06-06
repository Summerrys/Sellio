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
import { Grid3X3, Plus, Pencil, Trash2, LayoutGrid, List, Loader2 } from 'lucide-react';

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
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const open = (cat) => { setEditing(cat || null); setForm(cat ? { name: cat.name, description: cat.description || '', is_active: cat.is_active !== false, sort_order: cat.sort_order || 0 } : { name: '', description: '', is_active: true, sort_order: 0 }); setConfirmDelete(false); setShowForm(true); };
  const close = () => { setShowForm(false); setEditing(null); setConfirmDelete(false); };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    deleteMutation.mutate(editing.id, { onSuccess: close });
  };

  return (
    <PermissionGate permission="categories.view">
      <PageHeader title="Categories" description="Organize your products into categories"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
              <button onClick={() => handleViewToggle('grid')} style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'grid' ? 'white' : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: viewMode === 'grid' ? '#6366f1' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LayoutGrid size={16} />
              </button>
              <button onClick={() => handleViewToggle('list')} style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'list' ? 'white' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: viewMode === 'list' ? '#6366f1' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <List size={16} />
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
              <Card key={cat.id} onClick={() => open(cat)} className="border-0 shadow-sm p-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer active:scale-[0.99]">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800 leading-tight">{cat.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">{count} product{count !== 1 ? 's' : ''}</p>
                    {cat.description && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{cat.description}</p>}
                    {!cat.is_active && <span className="inline-block mt-2 text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded">Inactive</span>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <button onClick={(e) => { e.stopPropagation(); open(cat); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
                      style={{ color: 'rgb(var(--color-primary))' }}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(cat.id); }}
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
              <Card key={cat.id} onClick={() => open(cat)} className="border-0 shadow-sm px-4 py-3 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer active:scale-[0.99]">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800 leading-tight">{cat.name}</h3>
                    <p className="text-xs text-slate-400">{count} product{count !== 1 ? 's' : ''}{!cat.is_active ? ' · Inactive' : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); open(cat); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
                      style={{ color: 'rgb(var(--color-primary))' }}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(cat.id); }}
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
          <DialogFooter className="flex flex-row items-center gap-3 pt-2">
            {editing && (
              <Button
                variant="outline"
                className={`flex-shrink-0 transition-all ${confirmDelete ? 'border-red-500 bg-red-50 text-red-600 hover:bg-red-100' : 'text-red-500 border-red-200 hover:bg-red-50'}`}
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {confirmDelete ? 'Confirm?' : ''}
              </Button>
            )}
            <div className="flex flex-1 gap-3">
              <Button variant="outline" className="flex-1" onClick={close}>Cancel</Button>
              <Button
                className="flex-1 text-white"
                style={{ background: 'var(--color-primary-gradient)' }}
                onClick={() => saveMutation.mutate(form)}
                disabled={!form.name || saveMutation.isPending}
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Save Changes' : 'Create'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}