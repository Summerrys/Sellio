import { getSupabase } from '@/lib/supabaseClient';
import { isNativeApp } from '@/lib/nativeApp';
import { appLocale } from '@/lib/appText';

// Where Stripe's billing page sends its "Return" link. In Sellio's app that page opens in the
// phone's browser, where the app's own address (https://localhost) isn't Sellio: the same page
// on sellio.sg is.
export function billingReturnUrl(where = window.location) {
  return isNativeApp() ? `https://sellio.sg${where.pathname}${where.search}` : where.href;
}

export async function openBillingPortal(tenantId) {
  if (!tenantId) throw new Error('Tenant is not available');
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke('manage-billing', {
    body: {
      tenantId,
      returnUrl: billingReturnUrl(),
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error(data?.error || 'Billing portal is unavailable');
  // A browser goes to Stripe in this tab; Sellio's app hands the address to the phone, which
  // opens it in the browser (as openOutside does) while the app stays on this page: true then,
  // so the button stops spinning.
  window.location.assign(data.url);
  return isNativeApp();
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
  // In the app's language (14 Nov 2026, 2:30 pm / 14 Nov 2026, 14.30); Stripe bills in Singapore time.
  return new Intl.DateTimeFormat(appLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore',
  }).format(date);
}
