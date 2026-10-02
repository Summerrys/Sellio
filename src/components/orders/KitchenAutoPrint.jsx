import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTenant } from '@/components/tenant/TenantContext';
import { getSupabase } from '@/lib/supabaseClient';
import { autoPrintKitchenOrder } from '@/lib/orderPrinting';
import { loadPrinterConfig } from '@/lib/printerUtils';
import { useAppReloadGuard } from '@/lib/AppRefreshContext';

// Lives with the merchant workspace, rather than the Orders/Kitchen page.
// The toggle belongs to this device's saved printer connection.
export default function KitchenAutoPrint() {
  const { tenantId, tenant, hasPermission } = useTenant();
  const tenantRef = useRef(tenant); tenantRef.current = tenant;
  const jobs = useRef(0);
  const canPrint = hasPermission('orders.print_chit');
  useAppReloadGuard(() => ({ busy: jobs.current > 0 }));
  useEffect(() => {
    if (!tenantId || !canPrint) return undefined;
    let cancelled = false, client, channel, polling = false;
    const errors = new Set();
    const since = new Date().toISOString();
    const handle = async order => {
      if (cancelled || !loadPrinterConfig(tenantId)?.autoPrintChit) return;
      jobs.current += 1;
      try { await autoPrintKitchenOrder(order, tenantId, tenantRef.current); }
      catch (error) {
        if (!errors.has(order.id)) {
          errors.add(order.id);
          toast.error(`Kitchen print needs attention: ${order.order_number || order.id}. Check the printer before manually reprinting. ${error.message}`, { duration: 10000 });
        }
      } finally { jobs.current -= 1; }
    };
    const catchUp = async () => {
      if (cancelled || polling || !client || !loadPrinterConfig(tenantId)?.autoPrintChit) return;
      polling = true;
      try {
        const enabledSince = loadPrinterConfig(tenantId)?.autoPrintSince || since;
        const { data, error } = await client.from('orders').select('*')
          .eq('tenant_id', tenantId).eq('status', 'pending').eq('is_deleted', false)
          .gte('created_date', enabledSince).order('created_date', { ascending: true }).limit(200);
        if (!error) for (const order of data || []) { if (cancelled) break; await handle(order); }
      } finally { polling = false; }
    };
    getSupabase().then(sc => {
      if (cancelled) return;
      client = sc;
      channel = sc.channel(`kitchen-autoprint-${tenantId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` }, payload => handle(payload.new))
        .subscribe(status => { if (status === 'SUBSCRIBED') catchUp(); });
    }).catch(() => {});
    const timer = setInterval(catchUp, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') catchUp(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('sellio:printer-config', catchUp);
    return () => {
      cancelled = true; clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('sellio:printer-config', catchUp);
      if (channel) client.removeChannel(channel);
    };
  }, [tenantId, canPrint]);
  return null;
}
