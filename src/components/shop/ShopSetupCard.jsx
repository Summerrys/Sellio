import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '@/components/tenant/TenantContext';
import { CheckCircle2, Circle, ChevronRight } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { isShopTenant } from '@/lib/shopSelling';
import { toast } from 'sonner';

// Dashboard card for a free shop that hasn't finished its setup steps.
export default function ShopSetupCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenant, tenantId, isOwner } = useTenant();
  const enabled = !!tenantId && isShopTenant(tenant) && isOwner;

  const { data } = useQuery({
    queryKey: ['shop-setup-status', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const [{ data: selling, error }, { count }] = await Promise.all([
        supabase.rpc('my_shop_selling', { p_tenant_id: tenantId }),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      ]);
      if (error) throw error;
      return { selling, listings: count || 0 };
    },
    enabled,
  });

  if (!enabled || !data || data.selling?.setup_finished_at) return null;

  const items = [
    { label: 'Add a logo', done: !!tenant?.logo_url },
    { label: 'Choose how you sell', done: !!data.selling?.saved },
    { label: 'Add your payment QR', done: !!tenant?.payment_qr_url },
    { label: 'Add your first listing', done: data.listings > 0 },
  ];
  const doneCount = items.filter(i => i.done).length;

  const hide = async () => {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.rpc('finish_shop_setup', { p_tenant_id: tenantId });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['shop-setup-status', tenantId] });
    } catch (err) {
      toast.error(err.message || 'Could not hide this card.');
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="shop-setup-card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Finish setting up your shop</p>
          <p className="text-xs text-slate-500">{doneCount} of {items.length} done</p>
        </div>
        <button type="button" onClick={hide} className="text-[11px] text-slate-400 underline flex-shrink-0">Hide</button>
      </div>
      <div className="space-y-1.5 mb-3">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-2 text-sm">
            {item.done ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Circle className="w-4 h-4 text-slate-300" />}
            <span className={item.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{item.label}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => navigate(createPageUrl('ShopSetup'))}
        className="w-full h-10 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-1"
        style={{ background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' }}
        data-testid="shop-setup-continue"
      >
        Continue setup <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
