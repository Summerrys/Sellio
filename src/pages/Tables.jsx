import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import PermissionGate from '../components/tenant/PermissionGate';
import PageHeader from '../components/ui-custom/PageHeader';
import StatusBadge from '../components/ui-custom/StatusBadge';
import EmptyState from '../components/ui-custom/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { QrCode, Plus, Pencil, Trash2, Users, Copy } from 'lucide-react';
import { toast } from 'sonner';

export default function Tables() {
  const { tenantId, tenant } = useTenant();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', zone: '', capacity: 4, status: 'available' });

  const { data: tables = [] } = useQuery({
    queryKey: ['tables', tenantId],
    queryFn: () => base44.entities.TableEntity.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.TableEntity.update(editing.id, data)
      : base44.entities.TableEntity.create({ ...data, tenant_id: tenantId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tables'] }); close(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TableEntity.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tables'] }),
  });

  const open = (t) => { setEditing(t || null); setForm(t ? { name: t.name, zone: t.zone || '', capacity: t.capacity || 4, status: t.status || 'available' } : { name: '', zone: '', capacity: 4, status: 'available' }); setShowForm(true); };
  const close = () => { setShowForm(false); setEditing(null); };

  const generateQRUrl = (tableId) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/CustomerMenu?tenant=${tenant?.slug || tenantId}&table=${tableId}`;
  };

  const copyQR = (tableId) => {
    navigator.clipboard.writeText(generateQRUrl(tableId));
    toast.success('QR link copied!');
  };

  const statusColors = { available: 'bg-emerald-500', occupied: 'bg-red-500', reserved: 'bg-blue-500', maintenance: 'bg-slate-400' };
  const zones = [...new Set(tables.map(t => t.zone).filter(Boolean))];

  return (
    <PermissionGate permission="tables.read">
      <PageHeader title="Tables & QR Codes" description="Manage table layout and generate QR codes for ordering"
        actions={<Button onClick={() => open(null)} className="bg-slate-900 hover:bg-slate-800 gap-2"><Plus className="w-4 h-4" /> Add Table</Button>}
      />

      {/* Summary */}
      <div className="flex gap-6 mb-6 flex-wrap">
        {['available', 'occupied', 'reserved', 'maintenance'].map(s => {
          const count = tables.filter(t => t.status === s).length;
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${statusColors[s]}`} />
              <span className="text-xs text-slate-500 capitalize">{s} ({count})</span>
            </div>
          );
        })}
      </div>

      {tables.length === 0 ? (
        <Card className="border-0 shadow-sm"><EmptyState icon={QrCode} title="No tables" description="Add tables and generate QR codes for dine-in ordering." actionLabel="Add Table" onAction={() => open(null)} /></Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {tables.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(t => (
            <Card key={t.id} className="border-0 shadow-sm p-4 group hover:shadow-md transition-shadow text-center relative">
              <div className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${statusColors[t.status]}`} />
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3">
                <span className="text-lg font-bold text-slate-900">{t.name}</span>
              </div>
              {t.zone && <p className="text-xs text-slate-400 mb-1">{t.zone}</p>}
              <div className="flex items-center justify-center gap-1 text-xs text-slate-400 mb-3">
                <Users className="w-3 h-3" /> {t.capacity}
              </div>
              <div className="flex gap-1 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyQR(t.id)} title="Copy QR link">
                  <Copy className="w-3 h-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => open(t)}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteMutation.mutate(t.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Table' : 'New Table'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Table Name / Number</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="T1, A-01, etc." /></div>
            <div><Label>Zone / Section</Label><Input value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })} placeholder="Indoor, Outdoor, VIP" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Capacity</Label><Input type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 1 })} /></div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['available', 'occupied', 'reserved', 'maintenance'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
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