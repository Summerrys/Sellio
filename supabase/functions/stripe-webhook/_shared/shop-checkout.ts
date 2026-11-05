// A checkout started from a shop (its id is the checkout's client_reference_id): the plan
// picker inside a shop, which only offers checkouts without a free trial.
//
// Three rules (Alvin, 5 Nov 2026):
// 1. Only the shop's owner pays for the shop. The shop id is just a parameter of the checkout
//    link, so anyone could put any shop's id there. A payer who isn't the owner (by email,
//    phone, or the shop's own Stripe customer: shop_checkout_check) isn't attached; the Sellio
//    admins get an alert and the subscription is marked in Stripe.
// 2. A shop gets one free trial. Every shop has had it (complete-onboarding marks it when the
//    shop opens), so a trial on a checkout from the shop (an old link or app) ends at once and
//    the plan is charged now.
// 3. The new subscription replaces the shop's previous one, which ends. One that has already
//    ended is fine (before, cancelling it failed the whole event and Stripe kept retrying).
import { mapStripeStatus, retrieveSubscription } from "./billing.ts";

const ENDED = ["canceled", "incomplete_expired"];
export const TRIAL_ENDED_MARK = "already_used";

export async function endPreviousSubscription(stripe: any, id: string) {
  try {
    const previous = await stripe.subscriptions.retrieve(id);
    if (ENDED.includes(previous?.status)) return "already_ended";
    await stripe.subscriptions.cancel(id);
    return "cancelled";
  } catch (error) {
    if ((error as { code?: string })?.code === "resource_missing") return "not_found";
    const again = await stripe.subscriptions.retrieve(id).catch(() => null);
    if (again && ENDED.includes(again.status)) return "already_ended";
    throw error;
  }
}

async function holdCheckout(options: {
  supabase: any;
  stripe: any;
  session: any;
  check: any;
  tenantId: string;
  subscriptionId: string;
  customerId: string | null;
  payerEmail: string | null;
}) {
  const { supabase, stripe, session, check, tenantId, subscriptionId, customerId, payerEmail } = options;
  const reason = check?.found ? "payer_not_owner" : "shop_not_found";
  try {
    await stripe.subscriptions.update(subscriptionId, {
      metadata: { sellio_held: reason, sellio_shop: String(tenantId).slice(0, 100) },
    });
  } catch (error) {
    console.error("Could not mark the held subscription:", subscriptionId, (error as Error)?.message);
  }
  const plan = typeof session?.metadata?.plan === "string" ? session.metadata.plan : null;
  const payer = payerEmail ?? "Someone";
  const message = check?.found
    ? `${payer} paid for ${check.name}${plan ? ` (${plan})` : ""} but isn't its owner (${check.ownerEmail ?? "no owner email"}). ` +
      `The plan wasn't attached to the shop. Stripe subscription ${subscriptionId}.`
    : `${payer} paid${plan ? ` for ${plan}` : ""} from a link naming a shop that doesn't exist. ` +
      `Nothing was attached. Stripe subscription ${subscriptionId}.`;
  const { error } = await supabase.rpc("alert_sellio_admins", {
    p_type: "billing_held",
    p_title: "Payment not attached to a shop",
    p_message: message,
    p_data: {
      reason,
      tenant_id: tenantId,
      subscription_id: subscriptionId,
      customer_id: customerId,
      session_id: session?.id ?? null,
      payer_email: payerEmail,
      plan,
      amount_total: typeof session?.amount_total === "number" ? session.amount_total : null,
      currency: typeof session?.currency === "string" ? session.currency.toUpperCase() : null,
    },
  });
  if (error) throw new Error("Admin alert failed: " + error.message);
  return reason;
}

export async function handleShopCheckout(deps: {
  supabase: any;
  stripe: any;
  sync: (subscription: any) => Promise<unknown>;
}, input: {
  session: any;
  tenantId: string;
  subscriptionId: string;
  customerId: string | null;
}) {
  const { supabase, stripe, sync } = deps;
  const { session, tenantId, subscriptionId, customerId } = input;

  const payerEmail = session?.customer_details?.email ?? session?.customer_email ?? null;
  const payerPhone = session?.customer_details?.phone ?? null;
  const { data: check, error: checkError } = await supabase.rpc("shop_checkout_check", {
    p_tenant_id: tenantId,
    p_email: payerEmail,
    p_phone: payerPhone,
    p_customer_id: customerId,
  });
  if (checkError) throw new Error("Shop checkout check failed: " + checkError.message);
  if (!check?.found || !check?.matched) {
    const reason = await holdCheckout({ supabase, stripe, session, check, tenantId, subscriptionId, customerId, payerEmail });
    return { attached: false, reason };
  }

  const { data: existing, error: existingError } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (existingError) throw new Error("Existing subscription lookup failed: " + existingError.message);

  let current = await retrieveSubscription(stripe, subscriptionId);
  if (current?.status === "trialing" && check.hasUsedTrial) {
    await stripe.subscriptions.update(
      subscriptionId,
      { trial_end: "now", metadata: { sellio_trial_ended: TRIAL_ENDED_MARK } },
      { idempotencyKey: `sellio-trial-end-${subscriptionId}` },
    );
    current = await retrieveSubscription(stripe, subscriptionId);
  }
  const trialEndedHere = current?.metadata?.sellio_trial_ended === TRIAL_ENDED_MARK;
  const status = mapStripeStatus(current?.status);
  // Running, or charged now after its trial was ended here and the payment failed (the owner
  // chose this plan; the shop's banner asks for the payment). Two must never run at once.
  const replaces = ["active", "trial"].includes(status) || (trialEndedHere && status === "past_due");

  let previous: string | null = null;
  if (existing?.stripe_subscription_id && existing.stripe_subscription_id !== subscriptionId && replaces) {
    previous = await endPreviousSubscription(stripe, existing.stripe_subscription_id);
  }

  await sync(current);
  return { attached: true, via: check.via, trialEnded: trialEndedHere, status, previous };
}
