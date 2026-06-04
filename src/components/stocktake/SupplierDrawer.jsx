import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { X, Plus, Pencil, Trash2, Upload, Check, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const EMPTY_SUPPLIER = { name: '', phone: '', contact_person: '', notes: '', active: true };

const CSV_TEMPLATE_HEADER = 'name,phone,contact_person,email,notes';

function downloadCSV(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SupplierDrawer({ open, onClose, tenantId }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // null or supplier object
  const [form, setForm] = useState(EMPTY_SUPPLIER);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const handleDownloadTemplate = () => {
    downloadCSV('suppliers_template.csv', CSV_TEMPLATE_HEADER + '\n');
  };

  const handleDownloadAll = (suppliers) => {
    const rows = suppliers.map(s =>
      [s.name, s.phone || '', s.contact_person || '', s.email || '', s.notes || '', s.active ? 'true' : 'false']
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = 'name,phone,contact_person,email,notes,is_active\n' + rows.join('\n');
    downloadCSV('suppliers.csv', csv);
  };

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.from('suppliers').select('*').eq('tenant_id', tenantId).order('name');
      return data || [];
    },
    enabled: !!tenantId && open,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['suppliers', tenantId] });

  const startNew = () => { setEditing('new'); setForm(EMPTY_SUPPLIER); };
  const startEdit = (s) => { setEditing(s.id); setForm({ name: s.name, phone: s.phone || '', contact_person: s.contact_person || '', notes: s.notes || '', active: s.active ?? true }); };
  const cancelEdit = () => { setEditing(null); setForm(EMPTY_SUPPLIER); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Supplier name required'); return; }
    setSaving(true);
    const supabase = await getSupabase();
    const payload = { ...form, tenant_id: tenantId };
    if (editing === 'new') {
      const { error } = await supabase.from('suppliers').insert({ id: crypto.randomUUID(), ...payload, created_date: new Date().toISOString() });
      if (error) toast.error(error.message);
      else { toast.success('Supplier added'); refresh(); cancelEdit(); }
    } else {
      const { error } = await supabase.from('suppliers').update(payload).eq('id', editing).eq('tenant_id', tenantId);
      if (error) toast.error(error.message);
      else { toast.success('Supplier updated'); refresh(); cancelEdit(); }
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    const supabase = await getSupabase();
    const { error } = await supabase.from('suppliers').delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) toast.error(error.message);
    else { toast.success('Supplier deleted'); refresh(); if (editing === id) cancelEdit(); }
  };

  const handleToggleActive = async (supplier) => {
    const supabase = await getSupabase();
    await supabase.from('suppliers').update({ active: !supplier.active }).eq('id', supplier.id);
    refresh();
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(Boolean);
    const header = lines[0].toLowerCase().split(',').map(h => h.trim());
    const nameIdx = header.indexOf('name');
    const phoneIdx = header.indexOf('phone');
    const cpIdx = header.indexOf('contact_person');
    if (nameIdx === -1) { toast.error('CSV must have a "name" column'); return; }
    const rows = lines.slice(1).map(l => {
      const cols = l.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      return {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        name: cols[nameIdx] || '',
        phone: phoneIdx !== -1 ? cols[phoneIdx] || '' : '',
        contact_person: cpIdx !== -1 ? cols[cpIdx] || '' : '',
        active: true,
        created_date: new Date().toISOString(),
      };
    }).filter(r => r.name);
    if (!rows.length) { toast.error('No valid rows found'); return; }
    const supabase = await getSupabase();
    const { error } = await supabase.from('suppliers').insert(rows);
    if (error) toast.error(error.message);
    else { toast.success(`${rows.length} suppliers imported`); refresh(); }
    e.target.value = '';
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full z-[70] w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Manage Suppliers</h3>
          <div className="flex items-center gap-1.5">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-1 h-7 text-xs px-2">
              <Download className="w-3 h-3" /> Template
            </Button>
            {suppliers.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => handleDownloadAll(suppliers)} className="gap-1 h-7 text-xs px-2">
                <Download className="w-3 h-3" /> Download All
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1 h-7 text-xs px-2">
              <Upload className="w-3 h-3" /> Import CSV
            </Button>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400 ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading ? (
            [...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
          ) : suppliers.length === 0 && editing !== 'new' ? (
            <div className="text-center py-12 text-slate-400">
              <p className="font-medium text-slate-500 mb-1">No suppliers yet</p>
              <p className="text-sm">Add your first supplier below</p>
            </div>
          ) : null}

          {suppliers.map(s => (
            <div key={s.id}>
              {editing === s.id ? (
                <SupplierForm form={form} onChange={setForm} onSave={handleSave} onCancel={cancelEdit} saving={saving} />
              ) : (
                <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${s.active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{s.name}</p>
                    {s.phone && <p className="text-xs text-slate-500">{s.phone}</p>}
                    {s.contact_person && <p className="text-xs text-slate-400">{s.contact_person}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Switch checked={s.active ?? true} onCheckedChange={() => handleToggleActive(s)} />
                    <button onClick={() => startEdit(s)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {editing === 'new' && (
            <SupplierForm form={form} onChange={setForm} onSave={handleSave} onCancel={cancelEdit} saving={saving} />
          )}
        </div>

        {/* Footer */}
        {editing === null && (
          <div className="p-4 border-t border-slate-100">
            <Button onClick={startNew} className="w-full gap-2" style={{ background: 'var(--color-primary-gradient)', color: '#fff' }}>
              <Plus className="w-4 h-4" /> Add Supplier
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function SupplierForm({ form, onChange, onSave, onCancel, saving }) {
  return (
    <div className="bg-white border-2 rounded-xl p-4 space-y-3" style={{ borderColor: 'rgb(var(--color-primary))' }}>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-slate-500 mb-1 block">Name *</label>
          <Input value={form.name} onChange={e => onChange(f => ({ ...f, name: e.target.value }))} placeholder="Supplier name" className="h-9" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Phone</label>
          <Input value={form.phone} onChange={e => onChange(f => ({ ...f, phone: e.target.value }))} placeholder="+65..." className="h-9" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Contact Person</label>
          <Input value={form.contact_person} onChange={e => onChange(f => ({ ...f, contact_person: e.target.value }))} placeholder="Name" className="h-9" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500 mb-1 block">Notes</label>
          <Input value={form.notes} onChange={e => onChange(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="h-9" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={saving} style={{ background: 'var(--color-primary-gradient)', color: '#fff' }}>
          {saving ? 'Saving...' : <><Check className="w-3.5 h-3.5 mr-1" />Save</>}
        </Button>
      </div>
    </div>
  );
}