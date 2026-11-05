import Stripe from "npm:stripe@22.5.0";

export const PRICE_ID_TO_PLAN: Record<string, string> = {
  "price_1TZ6uJRF2IZPNHjucnNiycve": "starter_monthly",
  "price_1Tc3M0RF2IZPNHjuvCM2g29F": "starter_monthly",
  "price_1TZ70iRF2IZPNHjuPwJKPF9s": "starter_yearly",
  "price_1TZ7M4RF2IZPNHjuZrczw4Zf": "growth_monthly",
  "price_1TZ7M4RF2IZPNHjuPfWgvXtT": "growth_yearly",
  "price_1TZ7gaRF2IZPNHjuhK2WhEdL": "pro_monthly",
  "price_1TZ7gaRF2IZPNHjuIgVEUBgw": "pro_yearly",
  "price_1TsIyfRF2IZPNHjup62o82Aq": "pro_monthly",
  "price_1TtlabRF2IZPNHjuq1Br4hHX": "pro_monthly",
  // October 2026 pricing (S$39 / S$79 / S$119 a month)
  "price_1UQssYRF2IZPNHju1F8YxwTm": "starter_monthly",
  "price_1UQsscRF2IZPNHjuhG43uV9W": "starter_yearly",
  "price_1UQsseRF2IZPNHju3tt9LtKC": "growth_monthly",
  "price_1UQssgRF2IZPNHjuu4HVsuIv": "growth_yearly",
  "price_1UQssiRF2IZPNHjuRjRWx7sP": "pro_monthly",
  "price_1UQssjRF2IZPNHjuQmTzmtEX": "pro_yearly",
};

const PLAN_LIMITS: Record<string, {
  max_users: number | null;
  max_products: number | null;
  max_orders: number | null;
  max_roles: number | null;
}> = {
  starter: { max_users: 3, max_products: 10, max_orders: 100, max_roles: 3 },
  growth: { max_users: 5, max_products: 50, max_orders: 1000, max_roles: 5 },
  pro: { max_users: null, max_products: null, max_orders: null, max_roles: null },
};

export function getStripeClient() {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2026-06-24.dahlia" as any });
}

export function toIso(seconds: unknown): string | null {
  return typeof seconds === "number"
    ? new Date(seconds * 1000).toISOString()
    : null;
}

export function getSubPeriod(subscription: any) {
  const item = subscription?.items?.data?.[0];
  return {
    start: toIso(subscription?.current_period_start ?? item?.current_period_start),
    end: toIso(subscription?.current_period_end ?? item?.current_period_end),
  };
}

export function mapStripeStatus(status: string | null | undefined) {
  switch (status) {
    case "trialing":
      return "trial";
    case "active":
      return "active";
    case "past_due":
    case "incomplete":
      return "past_due";
    case "unpaid":
    case "paused":
      return "suspended";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    default:
      return "suspended";
  }
}

function normalizeTier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "professional") return "pro";
  return ["starter", "growth", "pro"].includes(normalized) ? normalized : null;
}

export async function resolvePlan(stripe: Stripe, subscription: any) {
  const item = subscription?.items?.data?.[0];
  let price: any = item?.price ?? item?.plan ?? null;
  const priceId = typeof price === "string" ? price : price?.id ?? null;

  if ((!price || typeof price === "string" || typeof price?.product === "string") && priceId) {
    price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
  }

  const mappedKey = priceId ? PRICE_ID_TO_PLAN[priceId] : null;
  const mappedTier = mappedKey?.split("_")[0] ?? null;
  const product = typeof price?.product === "object" ? price.product : null;
  const tier =
    normalizeTier(subscription?.metadata?.plan_key) ??
    normalizeTier(subscription?.metadata?.plan) ??
    normalizeTier(price?.metadata?.plan) ??
    normalizeTier(product?.metadata?.plan) ??
    normalizeTier(mappedTier);
  const interval = price?.recurring?.interval ?? price?.interval ?? null;
  const billingCycle = interval === "year" ? "yearly" : interval === "month" ? "monthly" : null;
  const limits = tier ? PLAN_LIMITS[tier] : null;
  const unitAmount = price?.unit_amount ?? price?.amount ?? null;

  return {
    tier,
    billingCycle,
    amount: typeof unitAmount === "number" ? unitAmount / 100 : null,
    currency: typeof price?.currency === "string" ? price.currency.toUpperCase() : null,
    priceId,
    maxUsers: limits?.max_users ?? null,
    maxProducts: limits?.max_products ?? null,
    maxOrders: limits?.max_orders ?? null,
    maxRoles: limits?.max_roles ?? null,
  };
}

export function getInvoiceSubscriptionId(invoice: any): string | null {
  const value =
    invoice?.parent?.subscription_details?.subscription ??
    invoice?.subscription ??
    null;
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function retrieveSubscription(stripe: Stripe, subscriptionId: string) {
  return await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price.product", "latest_invoice"],
  });
}

export async function retrieveInvoice(stripe: Stripe, invoiceOrId: any) {
  const invoiceId = typeof invoiceOrId === "string" ? invoiceOrId : invoiceOrId?.id;
  if (!invoiceId) return null;
  return await stripe.invoices.retrieve(invoiceId, {
    expand: ["payments.data.payment.payment_intent"],
  } as any);
}

export async function getFailureDetails(stripe: Stripe, invoice: any) {
  const payment = invoice?.payments?.data?.[0]?.payment;
  let paymentIntent: any =
    payment?.type === "payment_intent" ? payment.payment_intent : null;

  if (typeof paymentIntent === "string") {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent, {
      expand: ["latest_charge"],
    });
  } else if (paymentIntent?.id && typeof paymentIntent?.latest_charge === "string") {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id, {
      expand: ["latest_charge"],
    });
  }

  const charge =
    typeof paymentIntent?.latest_charge === "object"
      ? paymentIntent.latest_charge
      : null;
  return {
    code:
      paymentIntent?.last_payment_error?.code ??
      charge?.failure_code ??
      null,
    message:
      paymentIntent?.last_payment_error?.message ??
      charge?.failure_message ??
      null,
  };
}

export function computeGracePeriod(
  status: string,
  nextPaymentAttempt: unknown,
  anchorMs: number,
  existingGrace?: string | null,
) {
  if (status !== "past_due") return null;
  const threeDaysAfterFailure = anchorMs + (3 * 24 * 60 * 60 * 1000);
  const retryPlusOneDay =
    typeof nextPaymentAttempt === "number"
      ? (nextPaymentAttempt * 1000) + (24 * 60 * 60 * 1000)
      : 0;
  const existing = existingGrace ? new Date(existingGrace).getTime() : 0;
  return new Date(Math.max(threeDaysAfterFailure, retryPlusOneDay, existing)).toISOString();
}

export function buildSyncArgs(options: {
  tenantId: string;
  subscription: any;
  plan: any;
  invoice?: any | null;
  failure?: { code: string | null; message: string | null } | null;
  gracePeriodEndsAt?: string | null;
  clearFailure?: boolean;
  resetOrders?: boolean;
  eventCreatedAt?: string | null;
  eventId?: string | null;
}) {
  const period = getSubPeriod(options.subscription);
  const status = mapStripeStatus(options.subscription?.status);
  const invoice = options.invoice ?? null;

  return {
    p_tenant_id: options.tenantId,
    p_status: status,
    p_tier: options.plan?.tier ?? null,
    p_billing_cycle: options.plan?.billingCycle ?? null,
    p_amount: options.plan?.amount ?? null,
    p_currency: options.plan?.currency ?? options.subscription?.currency?.toUpperCase?.() ?? null,
    p_max_users: options.plan?.maxUsers ?? null,
    p_max_products: options.plan?.maxProducts ?? null,
    p_max_orders: options.plan?.maxOrders ?? null,
    p_max_roles: options.plan?.maxRoles ?? null,
    p_stripe_customer_id:
      typeof options.subscription?.customer === "string"
        ? options.subscription.customer
        : options.subscription?.customer?.id ?? null,
    p_stripe_subscription_id: options.subscription?.id ?? null,
    p_stripe_price_id: options.plan?.priceId ?? null,
    p_period_start: period.start,
    p_period_end: period.end,
    p_invoice_present: Boolean(invoice),
    p_invoice_id: invoice?.id ?? null,
    p_invoice_status: invoice?.status ?? null,
    p_invoice_amount_due_minor: invoice?.amount_remaining ?? invoice?.amount_due ?? null,
    p_invoice_currency: invoice?.currency?.toUpperCase?.() ?? null,
    p_invoice_hosted_url: invoice?.hosted_invoice_url ?? null,
    p_next_payment_attempt: toIso(invoice?.next_payment_attempt),
    p_failure_code: options.failure?.code ?? null,
    p_failure_message: options.failure?.message ?? null,
    p_grace_period_ends_at: options.gracePeriodEndsAt ?? null,
    p_clear_failure: options.clearFailure ?? false,
    p_reset_orders: options.resetOrders ?? false,
    p_event_created_at: options.eventCreatedAt ?? null,
    p_event_id: options.eventId ?? null,
  };
}

export async function syncBillingState(supabase: any, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("sync_stripe_billing_state", args);
  if (error) throw new Error("Atomic billing sync failed: " + error.message);
  return data === true;
}
