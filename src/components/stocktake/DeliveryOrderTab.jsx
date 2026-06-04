import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../tenant/TenantContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertCircle, Send, Save } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const EMPTY_ITEM = { product_id: '', product_name: '', unit: '', expected_qty: '', received_qty: '', unit_cost: '', notes: '' };

export default function DeliveryOrderTab() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    supplier_id: '',
    supplier_name: '',
    do_number: '',
    invoice_number: '',
    delivery_date: format(new Date(), 'yyyy-MM-dd'),
    received_by: '',
    notes: '',
    items: [{ ...EMPTY_ITEM }],
  });
  const [saving, setSaving] = useState(false);
  const [expandedDO, setExpandedDO] = useState(null);

  // Suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.from('suppliers').select('*').eq('tenant_id', tenantId).eq('active', true).order('name');
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Products
  const { data: products = [] } = useQuery({
    queryKey: ['products-do', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.from('products').select('id, name, unit').eq('tenant_id', tenantId).order('name');
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Past DOs
  const { data: pastDOs = [], isLoading: loadingDOs } = useQuery({
    queryKey: ['delivery-orders', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('delivery_orders')
        .select('*, delivery_order_items(*)')
        .eq('tenant_id', tenantId)
        .order('delivery_date', { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!tenantId,
  });

  const setItem = (idx, field, value) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === 'product_id') {
        const prod = products.find(p => p.id === value);
        if (prod) { items[idx].product_name = prod.name; items[idx].unit = prod.unit || ''; }
      }
      return { ...f, items };
    });
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const handleSave = async (status) => {
    if (!form.delivery_date) { toast.error('Delivery date required'); return; }
    setSaving(true);
    const supabase = await getSupabase();
    const doId = crypto.randomUUID();
    const supplierRec = suppliers.find(s => s.id === form.supplier_id);
    const { error } = await supabase.from('delivery_orders').insert({
      id: doId,
      tenant_id: tenantId,
      supplier_id: form.supplier_id || null,
      supplier_name: supplierRec?.name || form.supplier_name || '',
      do_number: form.do_number,
      invoice_number: form.invoice_number,
      delivery_date: form.delivery_date,
      received_by: form.received_by,
      notes: form.notes,
      status,
      created_date: new Date().toISOString(),
    });
    if (error) { toast.error(error.message); setSaving(false); return; }

    const lineItems = form.items
      .filter(i => i.product_id || i.product_name)
      .map(i => ({
        id: crypto.randomUUID(),
        delivery_order_id: doId,
        tenant_id: tenantId,
        product_id: i.product_id || null,
        product_name: i.product_name,
        unit: i.unit,
        expected_qty: parseFloat(i.expected_qty) || 0,
        received_qty: parseFloat(i.received_qty) || 0,
        unit_cost: parseFloat(i.unit_cost) || 0,
        notes: i.notes,
      }));

    if (lineItems.length > 0) {
      const { error: itemsError } = await supabase.from('delivery_order_items').insert(lineItems);
      if (itemsError) { toast.error(itemsError.message); setSaving(false); return; }
    }

    toast.success(status === 'submitted' ? 'DO submitted!' : 'Draft saved');
    queryClient.invalidateQueries({ queryKey: ['delivery-orders', tenantId] });
    setForm({ supplier_id: '', supplier_name: '', do_number: '', invoice_number: '', delivery_date: format(new Date(), 'yyyy-MM-dd'), received_by: '', notes: '', items: [{ ...EMPTY_ITEM }] });
    setSaving(false);
  };

  const STATUS_COLORS = {
    draft: 'bg-slate-100 text-slate-600',
    submitted: 'bg-blue-100 text-blue-700',
    verified: 'bg-green-100 text-green-700',
  };

  return (
    <div className="p-5 space-y-6">
      {/* New DO Form */}
      <div className="border border-slate-200 rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">New Delivery Order</h3>

        {/* Row 1: Supplier + DO + Invoice */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Supplier</label>
            {suppliers.length > 0 ? (
              <select
                value={form.supplier_id}
                onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value, supplier_name: '' }))}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': 'rgb(var(--color-primary))' }}
              >
                <option value="">Select supplier</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <Input value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} placeholder="Supplier name" className="h-10" />
            )}
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">DO Number</label>
            <Input value={form.do_number} onChange={e => setForm(f => ({ ...f, do_number: e.target.value }))} placeholder="DO-001" className="h-10" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Invoice Number</label>
            <Input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="INV-001" className="h-10" />
          </div>
        </div>

        {/* Row 2: Date + Received By */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Delivery Date</label>
            <input type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))} className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm bg-white focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Received By</label>
            <Input value={form.received_by} onChange={e => setForm(f => ({ ...f, received_by: e.target.value }))} placeholder="Name" className="h-10" />
          </div>
        </div>

        {/* Line items */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-600">Line Items</label>
            <Button variant="outline" size="sm" onClick={addItem} className="gap-1 h-7 text-xs">
              <Plus className="w-3 h-3" /> Add Row
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600">Product</th>
                  <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-16">Unit</th>
                  <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-20">Expected</th>
                  <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-20">Received</th>
                  <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-20">Unit Cost</th>
                  <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-20">Variance</th>
                  <th className="text-center px-2 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {form.items.map((item, idx) => {
                  const variance = (parseFloat(item.received_qty) || 0) - (parseFloat(item.expected_qty) || 0);
                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-2 py-2">
                        <select
                          value={item.product_id}
                          onChange={e => setItem(idx, 'product_id', e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-xs focus:outline-none"
                        >
                          <option value="">Select...</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input value={item.unit} onChange={e => setItem(idx, 'unit', e.target.value)} placeholder="kg" className="w-full text-center border border-slate-200 rounded-lg px-1 py-1.5 text-xs focus:outline-none" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min="0" value={item.expected_qty} onChange={e => setItem(idx, 'expected_qty', e.target.value)} className="w-full text-center border border-slate-200 rounded-lg px-1 py-1.5 text-xs focus:outline-none" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min="0" value={item.received_qty} onChange={e => setItem(idx, 'received_qty', e.target.value)} className="w-full text-center border border-slate-200 rounded-lg px-1 py-1.5 text-xs focus:outline-none" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min="0" step="0.01" value={item.unit_cost} onChange={e => setItem(idx, 'unit_cost', e.target.value)} className="w-full text-center border border-slate-200 rounded-lg px-1 py-1.5 text-xs focus:outline-none" />
                      </td>
                      <td className="px-2 py-2 text-center">
                        {item.expected_qty || item.received_qty ? (
                          <span className={`font-semibold ${variance < 0 ? 'text-red-600' : variance > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                            {variance > 0 ? '+' : ''}{variance || '—'}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {form.items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 p-0.5">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Notes</label>
          <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Overall DO notes..." rows={2} className="text-sm resize-none" />
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={() => handleSave('draft')} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" /> Save Draft
          </Button>
          <Button onClick={() => handleSave('submitted')} disabled={saving} className="gap-2" style={{ background: 'var(--color-primary-gradient)', color: '#fff' }}>
            <Send className="w-4 h-4" /> Submit DO
          </Button>
        </div>
      </div>

      {/* Past DOs */}
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-900">Past Delivery Orders</h3>
        {loadingDOs ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
        ) : pastDOs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <AlertCircle className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">No delivery orders yet</p>
          </div>
        ) : (
          pastDOs.map(doRec => (
            <div key={doRec.id} className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                onClick={() => setExpandedDO(expandedDO === doRec.id ? null : doRec.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 text-sm">{doRec.do_number || 'No DO#'}</span>
                    {doRec.supplier_name && <span className="text-xs text-slate-500">• {doRec.supplier_name}</span>}
                    <Badge className={`text-xs ${STATUS_COLORS[doRec.status] || 'bg-slate-100 text-slate-600'}`}>{doRec.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{doRec.delivery_date} · {doRec.delivery_order_items?.length || 0} items</p>
                </div>
                {expandedDO === doRec.id ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
              </button>
              {expandedDO === doRec.id && (
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
                  {doRec.received_by && <p className="text-xs text-slate-500 mb-2">Received by: {doRec.received_by}</p>}
                  {doRec.delivery_order_items?.length > 0 ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500">
                          <th className="text-left py-1">Product</th>
                          <th className="text-center py-1">Expected</th>
                          <th className="text-center py-1">Received</th>
                          <th className="text-center py-1">Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doRec.delivery_order_items.map(li => {
                          const v = (li.received_qty || 0) - (li.expected_qty || 0);
                          return (
                            <tr key={li.id} className="border-t border-slate-200">
                              <td className="py-1.5 text-slate-700 font-medium">{li.product_name}</td>
                              <td className="text-center text-slate-600">{li.expected_qty}</td>
                              <td className="text-center text-slate-600">{li.received_qty}</td>
                              <td className={`text-center font-semibold ${v < 0 ? 'text-red-600' : v > 0 ? 'text-green-600' : 'text-slate-400'}`}>{v > 0 ? '+' : ''}{v || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : <p className="text-xs text-slate-400">No line items</p>}
                  {doRec.notes && <p className="text-xs text-slate-500 mt-2 italic">{doRec.notes}</p>}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  draft: 'bg-slate-100 text-slate-600',
  submitted: 'bg-blue-100 text-blue-700',
  verified: 'bg-green-100 text-green-700',
};