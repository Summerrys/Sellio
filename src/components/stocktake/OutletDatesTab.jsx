import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../tenant/TenantContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, Users, AlertCircle } from 'lucide-react';
import SupplierDrawer from './SupplierDrawer';
import SupplierPickerModal from './SupplierPickerModal';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function OutletDatesTab() {
  const { tenantId, tenant } = useTenant();
  const queryClient = useQueryClient();
  const [businessDate, setBusinessDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showSupplierDrawer, setShowSupplierDrawer] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);

  const branchName = tenant?.settings?.branch_name || tenant?.name || '—';

  // Load inventory items joined with products
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['stocktake-outlet', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('inventory_items')
        .select('id, product_id, current_stock, par_level, unit, products(id, name, slug)')
        .eq('tenant_id', tenantId);
      return (data || []).map(i => ({
        ...i,
        product_name: i.products?.name || '',
      }));
    },
    enabled: !!tenantId,
  });

  // Load suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.from('suppliers').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!tenantId,
  });

  const handleParLevelBlur = useCallback(async (itemId, value) => {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return;
    const supabase = await getSupabase();
    const { error } = await supabase
      .from('inventory_items')
      .update({ par_level: parsed })
      .eq('id', itemId)
      .eq('tenant_id', tenantId);
    if (error) toast.error('Failed to save PAR level');
    else queryClient.invalidateQueries({ queryKey: ['stocktake-outlet', tenantId] });
  }, [tenantId, queryClient]);

  const productsNeedingOrder = items.filter(i => {
    const parLevel = i.par_level ?? 0;
    const needed = Math.max(0, parLevel - (i.current_stock ?? 0));
    return needed > 0;
  });

  const handleWhatsApp = (supplier) => {
    const lines = productsNeedingOrder.map(i => {
      const needed = Math.max(0, (i.par_level ?? 0) - (i.current_stock ?? 0));
      return `• ${i.product_name}: ${needed} ${i.unit || 'unit(s)'}`;
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
    if (suppliers.length === 0) {
      handleWhatsApp(null);
    } else if (suppliers.length === 1) {
      handleWhatsApp(suppliers[0]);
    } else {
      setShowSupplierPicker(true);
    }
  };

  if (isLoading) {
    return (
      <div className="p-5 space-y-3">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5">
      {/* Header info */}
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

      {/* Products table */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-slate-600 font-medium">No products tracked yet</p>
          <p className="text-sm text-slate-400 mt-1">Enable tracking in Inventory to see products here</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Product</th>
                <th className="text-center px-3 py-3 font-medium text-slate-600 w-28">PAR Level</th>
                <th className="text-center px-3 py-3 font-medium text-slate-600 w-28">Current Stock</th>
                <th className="text-center px-3 py-3 font-medium text-slate-600 w-28">Order Needed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(item => {
                const parLevel = item.par_level ?? 0;
                const stock = item.current_stock ?? 0;
                const needed = Math.max(0, parLevel - stock);
                const stockOk = stock >= parLevel;
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {item.product_name}
                      {item.unit && <span className="ml-1.5 text-xs text-slate-400">({item.unit})</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <ParInput
                        defaultValue={parLevel}
                        onBlur={(v) => handleParLevelBlur(item.id, v)}
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`font-semibold ${stockOk ? 'text-green-600' : 'text-red-600'}`}>
                        {stock}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {needed > 0 ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold text-xs">
                          {needed}
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

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 pt-2">
        <Button
          variant="outline"
          onClick={() => setShowSupplierDrawer(true)}
          className="flex items-center gap-2"
        >
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

      {/* Supplier Drawer */}
      <SupplierDrawer
        open={showSupplierDrawer}
        onClose={() => setShowSupplierDrawer(false)}
        tenantId={tenantId}
      />

      {/* Supplier Picker for WhatsApp */}
      <SupplierPickerModal
        open={showSupplierPicker}
        onClose={() => setShowSupplierPicker(false)}
        suppliers={suppliers}
        onSelect={(supplier) => {
          setShowSupplierPicker(false);
          handleWhatsApp(supplier);
        }}
      />
    </div>
  );
}

// Inline editable PAR input
function ParInput({ defaultValue, onBlur }) {
  const [value, setValue] = useState(defaultValue ?? 0);
  return (
    <input
      type="number"
      min="0"
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={e => onBlur(e.target.value)}
      className="w-20 text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
      style={{ '--tw-ring-color': 'rgb(var(--color-primary))' }}
    />
  );
}