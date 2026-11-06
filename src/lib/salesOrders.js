// The Dashboard's sales figures (Today's Revenue and the Revenue chart). They follow the
// Reports rule in lib/reportData.js: paid, not cancelled, not deleted, so the Dashboard and
// Reports show the same amounts for the same days.
import { getSupabase } from '@/lib/supabaseClient';
import { isSale } from '@/lib/reportData';

// Supabase returns at most 1,000 rows per request, so the orders are read in pages.
const PAGE_SIZE = 1000;
const MAX_PAGES = 20; // up to 20,000 paid orders

// Sales created from `since` (a Date) onwards, oldest first.
export async function fetchSalesSince(tenantId, since) {
  const supabase = await getSupabase();
  const seen = new Set();
  const sales = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from('orders')
      .select('id,created_date,total_amount,status,payment_status,is_deleted')
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'paid')
      .eq('is_deleted', false)
      .gte('created_date', since.toISOString())
      .order('created_date', { ascending: true })
      .order('id', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    for (const o of data || []) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      if (isSale(o)) sales.push(o);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return sales;
}
