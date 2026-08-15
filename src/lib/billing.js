import { getSupabase } from '@/lib/supabaseClient';

export async function openBillingPortal(tenantId) {
  if (!tenantId) throw new Error('Tenant is not available');
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke('manage-billing', {
    body: {
      tenantId,
      returnUrl: window.location.href,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error(data?.error || 'Billing portal is unavailable');
  window.location.assign(data.url);
}

export async function reconcileBilling(tenantId) {
  if (!tenantId) throw new Error('Tenant is not available');
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke('reconcile-billing', {
    body: { tenantId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function formatBillingAmount(amountMinor, currency = 'SGD') {
  if (amountMinor == null) return null;
  try {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: currency || 'SGD',
    }).format(Number(amountMinor) / 100);
  } catch {
    return `${currency || 'SGD'} ${(Number(amountMinor) / 100).toFixed(2)}`;
  }
}

export function formatBillingDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore',
  }).format(date);
}
