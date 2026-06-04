import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../tenant/TenantContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, AlertCircle, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';

const SHIFTS = ['Opening', 'Mid-Day', 'Closing'];

export default function DailyReportTab() {
  const { tenantId, user } = useTenant();
  const queryClient = useQueryClient();
  const [businessDate, setBusinessDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [shift, setShift] = useState('Closing');
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedMeta, setSubmittedMeta] = useState(null);

  // Tracked products
  const { data: trackedProducts = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['tracked-products', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const [{ data: products }, { data: invItems }] = await Promise.all([
        supabase.from('products').select('id, name, unit').eq('tenant_id', tenantId).eq('track_inventory', true).order('name'),
        supabase.from('inventory_items').select('product_id, current_stock').eq('tenant_id', tenantId),
      ]);
      const stockMap = Object.fromEntries((invItems || []).map(i => [i.product_id, i.current_stock ?? 0]));
      return (products || []).map(p => ({ ...p, current_stock: stockMap[p.id] ?? 0 }));
    },
    enabled: !!tenantId,
  });

  // Load stock take record + delivery totals + POS sales when date/shift changes
  useEffect(() => {
    if (!tenantId || trackedProducts.length === 0) return;
    loadData();
  }, [tenantId, businessDate, shift, trackedProducts.length]);

  const loadData = async () => {
    const supabase = await getSupabase();

    // 1. Check existing stock_takes record
    const { data: existing } = await supabase
      .from('stock_takes')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('business_date', businessDate)
      .eq('shift', shift)
      .maybeSingle();

    // 2. Previous closing count (for Opening Balance pre-fill)
    const prevDate = format(subDays(new Date(businessDate), 1), 'yyyy-MM-dd');
    const { data: prevTake } = await supabase
      .from('stock_takes')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('business_date', prevDate)
      .eq('shift', 'Closing')
      .maybeSingle();

    let prevCountsMap = {};
    if (prevTake?.id) {
      const { data: prevItems } = await supabase
        .from('stock_take_items')
        .select('product_id, physical_count')
        .eq('stock_take_id', prevTake.id);
      prevCountsMap = Object.fromEntries((prevItems || []).map(i => [i.product_id, i.physical_count ?? 0]));
    }

    // 3. Delivery totals for today
    const { data: doItems } = await supabase
      .from('delivery_order_items')
      .select('product_id, received_qty, delivery_orders!inner(delivery_date, status, tenant_id)')
      .eq('delivery_orders.tenant_id', tenantId)
      .eq('delivery_orders.delivery_date', businessDate)
      .eq('delivery_orders.status', 'submitted');
    const deliveryMap = {};
    (doItems || []).forEach(di => {
      deliveryMap[di.product_id] = (deliveryMap[di.product_id] || 0) + (di.received_qty || 0);
    });

    // 4. POS sold today from orders
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('product_id, quantity, orders!inner(tenant_id, created_date, status)')
      .eq('orders.tenant_id', tenantId)
      .eq('orders.status', 'completed')
      .gte('orders.created_date', `${businessDate}T00:00:00`)
      .lte('orders.created_date', `${businessDate}T23:59:59`);
    const soldMap = {};
    (orderItems || []).forEach(oi => {
      soldMap[oi.product_id] = (soldMap[oi.product_id] || 0) + (oi.quantity || 0);
    });

    if (existing) {
      setExistingId(existing.id);
      setIsSubmitted(existing.status === 'submitted');
      setSubmittedMeta(existing.status === 'submitted' ? { by: existing.submitted_by, at: existing.submitted_at } : null);

      // Load existing items
      const { data: existingItems } = await supabase
        .from('stock_take_items')
        .select('*')
        .eq('stock_take_id', existing.id);
      const itemsMap = Object.fromEntries((existingItems || []).map(i => [i.product_id, i]));

      setRows(trackedProducts.map(p => {
        const ei = itemsMap[p.id];
        const opening = ei?.opening_balance ?? prevCountsMap[p.id] ?? 0;
        const received = ei?.received_today ?? deliveryMap[p.id] ?? 0;
        const sold = ei?.pos_sold ?? soldMap[p.id] ?? 0;
        const physical = ei?.physical_count ?? '';
        const expected = opening + received - sold;
        const variance = physical !== '' ? parseFloat(physical) - expected : '';
        return {
          product_id: p.id,
          product_name: p.name,
          unit: p.unit || '',
          opening_balance: opening,
          received_today: received,
          pos_sold: sold,
          physical_count: physical,
          variance_reason: ei?.variance_reason || '',
          notes: ei?.notes || '',
          _expected: expected,
          _variance: variance,
        };
      }));
    } else {
      setExistingId(null);
      setIsSubmitted(false);
      setSubmittedMeta(null);
      setRows(trackedProducts.map(p => {
        const opening = prevCountsMap[p.id] ?? 0;
        const received = deliveryMap[p.id] ?? 0;
        const sold = soldMap[p.id] ?? 0;
        return {
          product_id: p.id,
          product_name: p.name,
          unit: p.unit || '',
          opening_balance: opening,
          received_today: received,
          pos_sold: sold,
          physical_count: '',
          variance_reason: '',
          notes: '',
          _expected: opening + received - sold,
          _variance: '',
        };
      }));
    }
  };

  const updateRow = (idx, field, value) => {
    setRows(prev => {
      const next = [...prev];
      const row = { ...next[idx], [field]: value };
      const expected = (row.opening_balance || 0) + (row.received_today || 0) - (row.pos_sold || 0);
      row._expected = expected;
      row._variance = row.physical_count !== '' && row.physical_count !== undefined
        ? parseFloat(row.physical_count) - expected
        : '';
      next[idx] = row;
      return next;
    });
  };

  const handleSave = async (submitStatus) => {
    // Validate: variance_reason required if variance != 0
    for (const row of rows) {
      if (row._variance !== '' && row._variance !== 0 && !row.variance_reason?.trim()) {
        toast.error(`"${row.product_name}" has a variance — please enter a reason`);
        return;
      }
    }
    setSaving(true);
    const supabase = await getSupabase();
    let takeId = existingId;

    if (!takeId) {
      const { data: newTake, error } = await supabase
        .from('stock_takes')
        .insert({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          business_date: businessDate,
          shift,
          status: submitStatus,
          submitted_by: submitStatus === 'submitted' ? (user?.full_name || user?.email || '') : null,
          submitted_at: submitStatus === 'submitted' ? new Date().toISOString() : null,
          created_date: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      takeId = newTake.id;
      setExistingId(takeId);
    } else {
      await supabase.from('stock_takes').update({
        status: submitStatus,
        submitted_by: submitStatus === 'submitted' ? (user?.full_name || user?.email || '') : null,
        submitted_at: submitStatus === 'submitted' ? new Date().toISOString() : null,
      }).eq('id', takeId);
    }

    // Upsert items
    const itemPayloads = rows.map(row => ({
      id: crypto.randomUUID(),
      stock_take_id: takeId,
      tenant_id: tenantId,
      product_id: row.product_id,
      product_name: row.product_name,
      opening_balance: parseFloat(row.opening_balance) || 0,
      received_today: parseFloat(row.received_today) || 0,
      pos_sold: parseFloat(row.pos_sold) || 0,
      expected_closing: row._expected,
      physical_count: row.physical_count !== '' ? parseFloat(row.physical_count) : null,
      variance: row._variance !== '' ? row._variance : null,
      variance_reason: row.variance_reason || null,
      notes: row.notes || null,
    }));

    // Delete existing items then re-insert
    await supabase.from('stock_take_items').delete().eq('stock_take_id', takeId);
    if (itemPayloads.length > 0) {
      const { error: itemErr } = await supabase.from('stock_take_items').insert(itemPayloads);
      if (itemErr) { toast.error(itemErr.message); setSaving(false); return; }
    }

    if (submitStatus === 'submitted') {
      setIsSubmitted(true);
      setSubmittedMeta({ by: user?.full_name || user?.email, at: new Date().toISOString() });
      toast.success('Daily report submitted!');
    } else {
      toast.success('Draft saved');
    }
    setSaving(false);
  };

  const isLoading = loadingProducts;

  return (
    <div className="p-5 space-y-5">
      {/* Header controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Business Date</label>
          <input
            type="date"
            value={businessDate}
            onChange={e => setBusinessDate(e.target.value)}
            disabled={isSubmitted}
            className="h-10 border border-slate-200 rounded-lg px-3 text-sm bg-white focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Shift</label>
          <div className="flex border border-slate-200 rounded-lg overflow-hidden">
            {SHIFTS.map(s => (
              <button
                key={s}
                disabled={isSubmitted}
                onClick={() => setShift(s)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${shift === s ? 'text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                style={shift === s ? { background: 'var(--color-primary-gradient)' } : {}}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Submitted banner */}
      {isSubmitted && submittedMeta && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">Report Submitted</p>
            <p className="text-xs text-green-600">
              By {submittedMeta.by || 'Unknown'} · {submittedMeta.at ? format(new Date(submittedMeta.at), 'dd MMM yyyy HH:mm') : ''}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        [...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)
      ) : trackedProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-slate-600 font-medium">No products tracked yet</p>
          <p className="text-sm text-slate-400 mt-1">Enable tracking in Inventory to see products here</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs">
                <th className="text-left px-3 py-3 font-medium text-slate-600">Product</th>
                <th className="text-center px-2 py-3 font-medium text-slate-600 w-20">Opening</th>
                <th className="text-center px-2 py-3 font-medium text-slate-600 w-20">Received</th>
                <th className="text-center px-2 py-3 font-medium text-slate-600 w-20">POS Sold</th>
                <th className="text-center px-2 py-3 font-medium text-slate-600 w-24">Expected</th>
                <th className="text-center px-2 py-3 font-medium text-slate-600 w-24">Physical</th>
                <th className="text-center px-2 py-3 font-medium text-slate-600 w-20">Variance</th>
                <th className="text-left px-2 py-3 font-medium text-slate-600 w-36">Reason</th>
                <th className="text-left px-2 py-3 font-medium text-slate-600 w-28">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => {
                const v = row._variance;
                const varianceColor = v === '' ? '' : v < 0 ? 'text-red-600 font-semibold' : v > 0 ? 'text-amber-600 font-semibold' : 'text-green-600 font-semibold';
                return (
                  <tr key={row.product_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      {row.product_name}
                      {row.unit && <span className="ml-1 text-xs text-slate-400">({row.unit})</span>}
                    </td>
                    <td className="px-2 py-2">
                      <NumberCell value={row.opening_balance} readOnly={isSubmitted} onChange={v => updateRow(idx, 'opening_balance', v)} />
                    </td>
                    <td className="px-2 py-2">
                      <NumberCell value={row.received_today} readOnly={isSubmitted} onChange={v => updateRow(idx, 'received_today', v)} />
                    </td>
                    <td className="px-2 py-2">
                      <NumberCell value={row.pos_sold} readOnly={isSubmitted} onChange={v => updateRow(idx, 'pos_sold', v)} />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className="font-medium text-slate-700">{row._expected}</span>
                    </td>
                    <td className="px-2 py-2">
                      <NumberCell value={row.physical_count} readOnly={isSubmitted} onChange={v => updateRow(idx, 'physical_count', v)} placeholder="Count" highlight />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={varianceColor}>
                        {v === '' ? '—' : `${v > 0 ? '+' : ''}${v}`}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      {!isSubmitted ? (
                        <input
                          value={row.variance_reason}
                          onChange={e => updateRow(idx, 'variance_reason', e.target.value)}
                          placeholder={v !== '' && v !== 0 ? 'Required' : ''}
                          className={`w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none ${v !== '' && v !== 0 && !row.variance_reason ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}
                        />
                      ) : (
                        <span className="text-xs text-slate-600">{row.variance_reason || '—'}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {!isSubmitted ? (
                        <input
                          value={row.notes}
                          onChange={e => updateRow(idx, 'notes', e.target.value)}
                          placeholder="Notes"
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">{row.notes || '—'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer buttons */}
      {!isSubmitted && rows.length > 0 && (
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={() => handleSave('draft')} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" /> Save Draft
          </Button>
          <Button onClick={() => handleSave('submitted')} disabled={saving} className="gap-2" style={{ background: 'var(--color-primary-gradient)', color: '#fff' }}>
            <Send className="w-4 h-4" /> Submit Report
          </Button>
        </div>
      )}
    </div>
  );
}

function NumberCell({ value, onChange, readOnly, placeholder, highlight }) {
  if (readOnly) {
    return <span className="block text-center text-sm text-slate-700">{value !== '' && value !== null && value !== undefined ? value : '—'}</span>;
  }
  return (
    <input
      type="number"
      min="0"
      step="any"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full text-center border rounded-lg px-1.5 py-1.5 text-xs focus:outline-none ${highlight ? 'border-slate-300 bg-slate-50 font-medium' : 'border-slate-200'}`}
    />
  );
}