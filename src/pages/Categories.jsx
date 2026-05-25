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
import { Grid3X3, Plus, Pencil, Trash2 } from 'lucide-react';

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
        actions={<Button onClick={() => open(null)} className="bg-slate-900 hover:bg-slate-800 gap-2"><Plus className="w-4 h-4" /> Add Category</Button>}
      />

      {categories.length === 0 ? (
        <Card className="border-0 shadow-sm"><EmptyState icon={Grid3X3} title="No categories" description="Create categories to organize your products." actionLabel="Add Category" onAction={() => open(null)} /></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(cat => {
            const count = products.filter(p => p.category_id === cat.id).length;
            return (
              <Card key={cat.id} className="border-0 shadow-sm p-6 group hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{cat.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">{count} product{count !== 1 ? 's' : ''}</p>
                    {cat.description && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{cat.description}</p>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => open(cat)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteMutation.mutate(cat.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
                {!cat.is_active && <span className="inline-block mt-3 text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded">Inactive</span>}
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