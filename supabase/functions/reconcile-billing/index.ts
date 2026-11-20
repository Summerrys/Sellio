// Reads the shop's subscription from Stripe and saves it (the app calls this when an owner
// comes back from Stripe's billing page, and in a trial's last day). Owner or Sellio admin only.
// The same code is also deployed as checkSubscriptionStatus (an older name).
// Deploy with the paths from supabase/functions/: reconcile-billing/index.ts,
// reconcile-billing/_shared/auth.ts and stripe-webhook/_shared/billing.ts (the webhook's billing
// code, so both follow one grace rule), entrypoint reconcile-billing/index.ts, verify_jwt on.
import { authorizeTenantOwner } from "./_shared/auth.ts";
import {
  buildSyncArgs,
  computeGracePeriod,
  getFailureDetails,
  getStripeClient,
  hasBeenPaid,
  mapStripeStatus,
  resolvePlan,
  retrieveInvoice,
  retrieveSubscription,
  syncBillingState,
} from "../stripe-webhook/_shared/billing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const tenantId = body?.tenantId;
    if (typeof tenantId !== "string" || !tenantId) return json({ error: "tenantId is required" }, 400);

    const { admin } = await authorizeTenantOwner(req, tenantId);
    const { data: local, error: localError } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id, grace_period_ends_at")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (localError) throw new Error("Subscription lookup failed: " + localError.message);
    if (!local?.stripe_subscription_id) {
      return json({
        status: "no_subscription",
        isActive: false,
        willAutoRenew: false,
        subscription: null,
      });
    }

    const stripe = getStripeClient();
    const subscription = await retrieveSubscription(stripe, local.stripe_subscription_id);
    const plan = await resolvePlan(stripe, subscription);
    const invoice = subscription.latest_invoice
      ? await retrieveInvoice(stripe, subscription.latest_invoice)
      : null;
    const status = mapStripeStatus(subscription.status);
    const failure = status === "past_due" && invoice
      ? await getFailureDetails(stripe, invoice)
      : null;
    // The webhook's rule (see computeGracePeriod): 3 days from the unpaid invoice if the
    // subscription has been paid before, none if it never has, and never moved later.
    const gracePeriodEndsAt = computeGracePeriod({
      status,
      anchorMs: typeof invoice?.created === "number" ? invoice.created * 1000 : Date.now(),
      existingGrace: local.grace_period_ends_at,
      everPaid: status === "past_due" ? await hasBeenPaid(stripe, subscription.id) : false,
    });

    await syncBillingState(
      admin,
      buildSyncArgs({
        tenantId,
        subscription,
        plan,
        invoice,
        failure,
        gracePeriodEndsAt,
        clearFailure: ["active", "trial"].includes(status) || invoice?.status === "paid",
        resetOrders: false,
        eventCreatedAt: null,
        eventId: null,
      }),
    );

    const { data: synced, error: syncedError } = await admin
      .from("subscriptions")
      .select("tier, billing_cycle, status, amount, currency, current_period_start, current_period_end, last_invoice_id, invoice_status, invoice_amount_due_minor, invoice_currency, invoice_hosted_url, next_payment_attempt, last_payment_error_code, last_payment_error_message, grace_period_ends_at")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (syncedError) throw new Error("Synced subscription lookup failed: " + syncedError.message);

    const isActive = ["active", "trial"].includes(status);
    let customerHasPayment = Boolean(subscription.default_payment_method);
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id ?? null;
    if (!customerHasPayment && customerId) {
      const customer: any = await stripe.customers.retrieve(customerId, {
        expand: ["invoice_settings.default_payment_method"],
      });
      customerHasPayment =
        !customer?.deleted &&
        Boolean(customer?.invoice_settings?.default_payment_method);
    }
    const willAutoRenew =
      isActive &&
      !subscription.cancel_at_period_end &&
      customerHasPayment;

    return json({
      status: subscription.status,
      isActive,
      willAutoRenew,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      customerHasPayment,
      subscription: synced,
    });
  } catch (error: any) {
    if (error instanceof Response) {
      return new Response(await error.text(), {
        status: error.status,
        headers: corsHeaders,
      });
    }
    console.error("reconcile-billing failed:", error.message);
    return json({ error: "Could not refresh billing status" }, 500);
  }
});
