import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import db from '@/lib/db';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import { toast } from 'sonner';
import { showError } from '@/lib/plainError';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import EmptyState from '../components/ui-custom/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Grid3X3, Plus, Pencil, Trash2, LayoutGrid, List, Loader2, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useAppText } from '@/lib/appText';

// How many items each category has: { [category_id]: count }. Only id and category_id,
// 1,000 rows per request (Supabase's cap per request).
const COUNT_PAGE_SIZE = 1000;
const COUNT_MAX_PAGES = 50;

async function countItemsByCategory(tenantId) {
  const supabase = await getSupabase();
  const seen = new Set();
  const counts = {};
  for (let page = 0; page < COUNT_MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from('products')
      .select('id, category_id')
      .eq('tenant_id', tenantId)
      .order('id', { ascending: true })
      .range(page * COUNT_PAGE_SIZE, page * COUNT_PAGE_SIZE + COUNT_PAGE_SIZE - 1);
    if (error) throw error;
    for (const p of data || []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1;
    }
    if (!data || data.length < COUNT_PAGE_SIZE) break;
  }
  return counts;
}

export default function Categories() {
  return (
    <RequirePermission permission="categories.view">
      <CategoriesContent />
    </RequirePermission>
  );
}

function CategoriesContent() {
  const { t } = useAppText();
  const { tenantId, hasPermission } = useTenant();
  const canCreate = hasPermission('categories.create');
  const canEdit = hasPermission('categories.edit');
  const canDelete = hasPermission('categories.delete');
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', is_active: true, sort_order: 0 });
  const [viewMode, setViewMode] = useState(localStorage.getItem('categories_view_mode') || 'list');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const handleViewToggle = (mode) => { setViewMode(mode); localStorage.setItem('categories_view_mode', mode); };

  // Direct Supabase read (sort_order included); same shape + order as the
  // Products page, which shares this query cache key.
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });
  const sortedCategories = [...categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  // Drag-to-reorder: renumber 1..n in the new order, update the cache right
  // away, then save only the rows whose position actually changed.
  const handleDragEnd = async (result) => {
    if (!result.destination || !canEdit) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    const next = [...sortedCategories];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const renumbered = next.map((c, i) => ({ ...c, sort_order: i + 1 }));
    const before = new Map(categories.map(c => [c.id, c.sort_order]));
    const changed = renumbered.filter(c => before.get(c.id) !== c.sort_order);
    queryClient.setQueryData(['categories', tenantId], renumbered);
    try {
      const supabase = await getSupabase();
      const results = await Promise.all(changed.map(c =>
        supabase.from('categories').update({ sort_order: c.sort_order }).eq('id', c.id).eq('tenant_id', tenantId)
      ));
      const failed = results.find(r => r.error);
      if (failed) throw failed.error;
      toast.success(t('Category order saved'));
    } catch (e) {
      showError(e, t('Couldn’t save the new order of categories'), { t });

    } finally {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    }
  };

  // Its own cache entry. This used to load db.entities.Product.filter() (50 items, no
  // stock) into the Products page's ['products', tenantId], so after a visit here the
  // Products page showed at most 50 items, with wrong stock, for up to 5 minutes; and
  // a shop with more than 50 items got wrong counts here. Under ['products', tenantId]
  // so that refreshing the products list refreshes these counts too.
  const { data: itemCounts = {} } = useQuery({
    queryKey: ['products', tenantId, 'countsByCategory'],
    queryFn: () => countItemsByCategory(tenantId),
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const supabase = await getSupabase();
      if (editing) {
        const { error } = await supabase.from('categories').update(data).eq('id', editing.id).eq('tenant_id', tenantId);
        if (error) throw error;
      } else {
        // New categories go to the end of the menu, not the top.
        const nextOrder = categories.reduce((m, c) => Math.max(m, c.sort_order || 0), 0) + 1;
        const { error } = await supabase.from('categories').insert({ ...data, sort_order: nextOrder, tenant_id: tenantId, slug: data.name.toLowerCase().replace(/\s+/g, '-') });
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

  // Matches the same no-access message used on the Products page for consistency.
  const handleCardClick = (cat) => {
    if (!canEdit) {
      toast.error(t('You don\'t have access to edit categories.'));
      return;
    }
    open(cat);
  };
  const close = () => { setShowForm(false); setEditing(null); setConfirmDelete(false); };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    deleteMutation.mutate(editing.id, { onSuccess: close });
  };

  return (
    <>
      <PageHeader title={t('Categories')} description={t('Organize your products into categories')}
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
            {canCreate && (
              <Button
                onClick={() => open(null)}
                size="sm"
                className="text-white gap-1.5"
                style={{ background: 'var(--color-primary-gradient)' }}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">{t('Add Category')}</span>
                <span className="sm:hidden">{t('Add')}</span>
              </Button>
            )}
          </div>
        }
      />

      {categories.length === 0 ? (
        <Card className="border-0 shadow-sm"><EmptyState icon={Grid3X3} title={t('No categories')} description={t('Create categories to organize your products.')} actionLabel={canCreate ? t('Add Category') : undefined} onAction={canCreate ? () => open(null) : undefined} /></Card>
      ) : viewMode === 'grid' ? (
        <>
        {canEdit && sortedCategories.length > 1 && (
          <p className="text-xs text-slate-400 mb-2">{t('Switch to list view to drag categories into the order your menu shows.')}</p>
        )}
        <div className="grid grid-cols-2 gap-4">
          {sortedCategories.map(cat => {
            const count = itemCounts[cat.id] || 0;
            return (
              <Card key={cat.id} onClick={() => handleCardClick(cat)} className={`border-0 shadow-sm p-4 hover:shadow-md hover:border-slate-300 transition-all active:scale-[0.99] ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800 leading-tight">{cat.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">{count === 1 ? t('1 product') : t('{count} products', { count })}</p>
                    {cat.description && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{cat.description}</p>}
                    {!cat.is_active && <span className="inline-block mt-2 text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{t('Inactive')}</span>}
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      {canEdit && (
                        <button onClick={(e) => { e.stopPropagation(); open(cat); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
                          style={{ color: 'rgb(var(--color-primary))' }}>
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(cat.id); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors text-red-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        </>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
        {canEdit && sortedCategories.length > 1 && (
          <p className="text-xs text-slate-400 mb-2">{t('Drag the handle to set the order staff and customers see on the menu.')}</p>
        )}
        <Droppable droppableId="categories-list">
        {(dropProvided) => (
        <div className="space-y-2" ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
          {sortedCategories.map((cat, index) => {
            const count = itemCounts[cat.id] || 0;
            return (
              <Draggable key={cat.id} draggableId={String(cat.id)} index={index} isDragDisabled={!canEdit}>
              {(dragProvided, snapshot) => (
              <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
              <Card onClick={() => handleCardClick(cat)} className={`border-0 px-4 py-3 transition-shadow ${snapshot.isDragging ? 'shadow-lg ring-2 ring-slate-200' : 'shadow-sm hover:shadow-md'} ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span
                    {...dragProvided.dragHandleProps}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t('Drag to reorder {name}', { name: cat.name })}
                    className={canEdit ? 'w-8 h-8 -ml-2 rounded-lg flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-50 cursor-grab active:cursor-grabbing flex-shrink-0' : 'hidden'}
                  >
                    <GripVertical className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-800 leading-tight">{cat.name}</h3>
                    <p className="text-xs text-slate-400">{count === 1 ? t('1 product') : t('{count} products', { count })}{!cat.is_active ? ' ' + t('· Inactive') : ''}</p>
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canEdit && (
                        <button onClick={(e) => { e.stopPropagation(); open(cat); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
                          style={{ color: 'rgb(var(--color-primary))' }}>
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(cat.id); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors text-red-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
              </div>
              )}
              </Draggable>
            );
          })}
          {dropProvided.placeholder}
        </div>
        )}
        </Droppable>
        </DragDropContext>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? t('Edit Category') : t('New Category')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>{t('Name')}</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>{t('Description')}</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>{t('Active')}</Label></div>
          </div>
          <DialogFooter className="flex flex-row items-center gap-3 pt-2">
            {editing && canDelete && (
              <Button
                variant="outline"
                className={`flex-shrink-0 transition-all ${confirmDelete ? 'border-red-500 bg-red-50 text-red-600 hover:bg-red-100' : 'text-red-500 border-red-200 hover:bg-red-50'}`}
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {confirmDelete ? t('Confirm?') : ''}
              </Button>
            )}
            <div className="flex flex-1 gap-3">
              <Button variant="outline" className="flex-1" onClick={close}>{(editing ? canEdit : canCreate) ? t('Cancel') : t('Close')}</Button>
              {(editing ? canEdit : canCreate) && (
                <Button
                  className="flex-1 text-white"
                  style={{ background: 'var(--color-primary-gradient)' }}
                  onClick={() => saveMutation.mutate(form)}
                  disabled={!form.name || saveMutation.isPending}
                >
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? t('Save Changes') : t('Create')}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}