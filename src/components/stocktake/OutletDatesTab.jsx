import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../tenant/TenantContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, Users, AlertCircle, Check, X, Loader2 } from 'lucide-react';
import SupplierDrawer from './SupplierDrawer';
import SupplierPickerModal from './SupplierPickerModal';
import { format, parseISO } from 'date-fns';

export default function OutletDatesTab() {
  const { tenantId, tenant } = useTenant();
  const queryClient = useQueryClient();
  const [businessDate, setBusinessDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showSupplierDrawer, setShowSupplierDrawer] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const branchName = tenant?.settings?.branch_name || tenant?.name || '—';

  const fetchItems = async () => {
    if (!tenantId) return;
    setLoadingItems(true);
    const supabase = await getSupabase();

    const { data: invItems, error: invError } = await supabase
      .from('inventory_items')
      .select('id, product_id, current_stock, low_stock_threshold, par_level, unit, last_restock_date')
      .eq('tenant_id', tenantId);

    console.log('[OutletDatesTab] invItems:', invItems, 'error:', invError);

    if (!invItems || invItems.length === 0) {
      setItems([]);
      setLoadingItems(false);
      return;
    }

    const productIds = invItems.map(i => i.product_id).filter(Boolean);
    const { data: prods, error: prodsError } = await supabase
      .from('products')
      .select('id, name')
      .in('id', productIds);

    console.log('[OutletDatesTab] prods:', prods, 'error:', prodsError);

    const rows = invItems.map(item => ({
      ...item,
      product_name: prods?.find(p => p.id === item.product_id)?.name ?? 'Unknown',
    }));

    setItems(rows);
    setLoadingItems(false);
  };

  // Load inventory items via useEffect with direct Supabase call
  useEffect(() => {
    fetchItems();
  }, [tenantId]);

  const refreshItems = () => fetchItems();

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.from('suppliers').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!tenantId,
  });

  const productsNeedingOrder = items.filter(i =>
    Math.max(0, (i.par_level ?? 0) - (i.current_stock ?? 0)) > 0
  );

  const handleWhatsApp = (supplier) => {
    const lines = productsNeedingOrder.map(i => {
      const needed = Math.max(0, (i.par_level ?? 0) - (i.current_stock ?? 0));
      const unit = i.unit ? ` ${i.unit}` : '';
      return `- ${i.product_name}: ${needed}${unit} needed`;
    });
    const msg = [
      `Hello${supplier ? ` ${supplier.name}` : ''},`,
      ``,
      `We'd like to place an order for the following items (Business Date: ${businessDate}):`,
      ``,
      ...lines,
      ``,
      `Please confirm availability. Thank you!`,
    ].join('\n');
    const phone = supplier?.phone?.replace(/\D/g, '') || '';
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const onWhatsAppClick = () => {
    if (suppliers.length === 0) handleWhatsApp(null);
    else if (suppliers.length === 1) handleWhatsApp(suppliers[0]);
    else setShowSupplierPicker(true);
  };

  if (loadingItems) {
    return (
      <div className="p-5 space-y-3">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-slate-50 rounded-xl p-3.5">
          <p className="text-xs text-slate-500 mb-1">Branch</p>
          <p className="font-semibold text-slate-900">{branchName}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3.5">
          <p className="text-xs text-slate-500 mb-1">Business Date</p>
          <input
            type="date"
            value={businessDate}
            onChange={e => setBusinessDate(e.target.value)}
            className="font-semibold text-slate-900 bg-transparent border-none outline-none w-full text-sm"
          />
        </div>
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-slate-600 font-medium">No inventory items found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Product</th>
                <th className="text-center px-3 py-3 font-medium text-slate-600 w-24">Unit</th>
                <th className="text-center px-3 py-3 font-medium text-slate-600 w-28">PAR Level</th>
                <th className="text-center px-3 py-3 font-medium text-slate-600 w-28">Alert Below</th>
                <th className="text-center px-3 py-3 font-medium text-slate-600 w-28">Current Stock</th>
                <th className="text-center px-3 py-3 font-medium text-slate-600 w-32">Last Restocked</th>
                <th className="text-center px-3 py-3 font-medium text-slate-600 w-32">Orders Needed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(item => {
                const parLevel = item.par_level ?? 0;
                const stock = item.current_stock ?? 0;
                const needed = Math.max(0, parLevel - stock);
                const stockOk = stock >= parLevel;
                const lastRestocked = item.last_restock_date
                  ? (() => { try { return format(parseISO(item.last_restock_date), 'dd MMM yyyy'); } catch { return '—'; } })()
                  : '—';
                return (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{item.product_name}</td>
                    <td className="px-3 py-2 text-center">
                      <InlineTextInput
                        value={item.unit || ''}
                        placeholder="pcs"
                        itemId={item.id}
                        field="unit"
                        tenantId={tenantId}
                        onSaved={refreshItems}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <InlineNumberInput
                        value={item.par_level ?? ''}
                        placeholder="0"
                        itemId={item.id}
                        field="par_level"
                        tenantId={tenantId}
                        onSaved={refreshItems}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <InlineNumberInput
                        value={item.low_stock_threshold ?? ''}
                        placeholder="0"
                        itemId={item.id}
                        field="low_stock_threshold"
                        tenantId={tenantId}
                        onSaved={refreshItems}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-semibold ${stockOk ? 'text-green-600' : 'text-red-600'}`}>
                        {stock}{item.unit ? ` ${item.unit}` : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-500 text-xs">
                      {lastRestocked}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {needed > 0 ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold text-xs">
                          {needed}{item.unit ? ` ${item.unit}` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-2">
        <Button variant="outline" onClick={() => setShowSupplierDrawer(true)} className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          Manage Suppliers
        </Button>
        <Button
          disabled={productsNeedingOrder.length === 0}
          onClick={onWhatsAppClick}
          className="flex items-center gap-2"
          style={{ background: '#25D366', color: '#fff', border: 'none' }}
        >
          <MessageCircle className="w-4 h-4" />
          Contact Supplier via WhatsApp
          {productsNeedingOrder.length > 0 && (
            <span className="ml-1 bg-white/20 text-white text-xs rounded-full px-1.5">{productsNeedingOrder.length}</span>
          )}
        </Button>
      </div>

      <SupplierDrawer open={showSupplierDrawer} onClose={() => setShowSupplierDrawer(false)} tenantId={tenantId} />
      <SupplierPickerModal
        open={showSupplierPicker}
        onClose={() => setShowSupplierPicker(false)}
        suppliers={suppliers}
        onSelect={(supplier) => { setShowSupplierPicker(false); handleWhatsApp(supplier); }}
      />
    </div>
  );
}

async function saveField(itemId, tenantId, field, value) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('inventory_items')
    .update({ [field]: value })
    .eq('id', itemId)
    .eq('tenant_id', tenantId);
  if (error) throw error;
}

function InlineNumberInput({ value, placeholder, itemId, field, tenantId, onSaved }) {
  const [localVal, setLocalVal] = useState(value === '' || value == null ? '' : String(value));
  const [status, setStatus] = useState(null);
  const timerRef = useRef(null);

  const handleBlur = async () => {
    const trimmed = localVal.trim();
    const parsed = trimmed === '' ? null : parseInt(trimmed, 10);
    if (trimmed !== '' && isNaN(parsed)) return;
    setStatus('saving');
    try {
      await saveField(itemId, tenantId, field, parsed);
      setStatus('saved');
      onSaved();
      timerRef.current = setTimeout(() => setStatus(null), 1500);
    } catch {
      setStatus('error');
      timerRef.current = setTimeout(() => setStatus(null), 2000);
    }
  };

  return (
    <div className="inline-flex items-center gap-1 justify-center">
      <input
        type="number"
        min="0"
        value={localVal}
        placeholder={placeholder}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={handleBlur}
        className="w-20 text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent placeholder:text-slate-300"
        style={{ '--tw-ring-color': 'rgb(var(--color-primary))' }}
      />
      {status === 'saved' && <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
      {status === 'error' && <X className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
    </div>
  );
}

function InlineTextInput({ value, placeholder, itemId, field, tenantId, onSaved }) {
  const [localVal, setLocalVal] = useState(value || '');
  const [status, setStatus] = useState(null);
  const timerRef = useRef(null);

  const handleBlur = async () => {
    const trimmed = localVal.trim();
    setStatus('saving');
    try {
      await saveField(itemId, tenantId, field, trimmed || null);
      setStatus('saved');
      onSaved();
      timerRef.current = setTimeout(() => setStatus(null), 1500);
    } catch {
      setStatus('error');
      timerRef.current = setTimeout(() => setStatus(null), 2000);
    }
  };

  return (
    <div className="inline-flex items-center gap-1 justify-center">
      <input
        type="text"
        value={localVal}
        placeholder={placeholder}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={handleBlur}
        className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent placeholder:text-slate-300"
        style={{ '--tw-ring-color': 'rgb(var(--color-primary))' }}
      />
      {status === 'saved' && <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
      {status === 'error' && <X className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
    </div>
  );
}