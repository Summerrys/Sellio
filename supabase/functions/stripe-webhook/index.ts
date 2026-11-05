import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  buildSyncArgs,
  computeGracePeriod,
  getFailureDetails,
  getInvoiceSubscriptionId,
  getStripeClient,
  mapStripeStatus,
  resolvePlan,
  retrieveInvoice,
  retrieveSubscription,
  syncBillingState,
} from "./_shared/billing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
  "Content-Type": "application/json",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase service configuration is missing");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function claimEvent(supabase: any, event: any) {
  const row = {
    event_id: event.id,
    event_type: event.type,
    stripe_created_at: new Date(event.created * 1000).toISOString(),
    processing_status: "received",
    error_message: null,
  };
  const { error } = await supabase.from("stripe_webhook_events").insert(row);
  if (!error) return { process: true };
  if (error.code !== "23505") throw new Error("Could not record webhook event: " + error.message);

  const { data: existing, error: lookupError } = await supabase
    .from("stripe_webhook_events")
    .select("processing_status, attempts")
    .eq("event_id", event.id)
    .maybeSingle();
  if (lookupError) throw new Error("Could not inspect duplicate webhook: " + lookupError.message);
  if (existing?.processing_status === "processed" || existing?.processing_status === "skipped") {
    return { process: false };
  }

  const { error: retryError } = await supabase
    .from("stripe_webhook_events")
    .update({
      processing_status: "received",
      error_message: null,
      attempts: (existing?.attempts ?? 1) + 1,
    })
    .eq("event_id", event.id);
  if (retryError) throw new Error("Could not resume webhook event: " + retryError.message);
  return { process: true };
}

async function finishEvent(
  supabase: any,
  eventId: string,
  status: "processed" | "failed" | "skipped",
  details: Record<string, unknown> = {},
) {
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      processing_status: status,
      processed_at: status === "failed" ? null : new Date().toISOString(),
      error_message: status === "failed" ? String(details.error ?? "Unknown processing error").slice(0, 1000) : null,
      tenant_id: details.tenantId ?? null,
      stripe_customer_id: details.customerId ?? null,
      stripe_subscription_id: details.subscriptionId ?? null,
    })
    .eq("event_id", eventId);
  if (error) throw new Error("Could not finalize webhook event: " + error.message);
}

async function findTenantId(
  supabase: any,
  customerId: string | null,
  subscriptionId: string | null,
) {
  if (subscriptionId) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("tenant_id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    if (error) throw new Error("Subscription tenant lookup failed: " + error.message);
    if (data?.tenant_id) return data.tenant_id;
  }
  if (customerId) {
    const { data, error } = await supabase
      .from("tenants")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (error) throw new Error("Customer tenant lookup failed: " + error.message);
    if (data?.id) return data.id;
  }
  return null;
}

async function loadExistingGrace(supabase: any, tenantId: string) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("grace_period_ends_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error("Grace-period lookup failed: " + error.message);
  return data?.grace_period_ends_at ?? null;
}

async function isCurrentSubscription(
  supabase: any,
  tenantId: string,
  subscriptionId: string | null,
) {
  if (!subscriptionId) return true;
  const { data, error } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error("Current subscription lookup failed: " + error.message);
  return !data?.stripe_subscription_id || data.stripe_subscription_id === subscriptionId;
}

async function syncFromSubscription(options: {
  supabase: any;
  stripe: any;
  tenantId: string;
  subscription: any;
  invoice?: any | null;
  event: any;
  resetOrders?: boolean;
}) {
  const { supabase, stripe, tenantId, event } = options;
  const subscription =
    typeof options.subscription === "string"
      ? await retrieveSubscription(stripe, options.subscription)
      : options.subscription;
  const plan = await resolvePlan(stripe, subscription);
  let invoice = options.invoice ?? null;
  if (!invoice && subscription?.latest_invoice) {
    invoice = await retrieveInvoice(stripe, subscription.latest_invoice);
  } else if (invoice) {
    invoice = await retrieveInvoice(stripe, invoice);
  }

  const status = mapStripeStatus(subscription?.status);
  const existingGrace = await loadExistingGrace(supabase, tenantId);
  let failure = null;
  if (status === "past_due" && invoice) {
    failure = await getFailureDetails(stripe, invoice);
  }
  const gracePeriodEndsAt = computeGracePeriod(
    status,
    invoice?.next_payment_attempt,
    event.created * 1000,
    existingGrace,
  );
  const clearFailure = ["active", "trial"].includes(status) || invoice?.status === "paid";

  const applied = await syncBillingState(
    supabase,
    buildSyncArgs({
      tenantId,
      subscription,
      plan,
      invoice,
      failure,
      gracePeriodEndsAt,
      clearFailure,
      resetOrders: options.resetOrders ?? false,
      eventCreatedAt: new Date(event.created * 1000).toISOString(),
      eventId: event.id,
    }),
  );

  return {
    applied,
    customerId:
      typeof subscription?.customer === "string"
        ? subscription.customer
        : subscription?.customer?.id ?? null,
    subscriptionId: subscription?.id ?? null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const stripe = getStripeClient();
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !webhookSecret) return json({ error: "Webhook signature configuration is missing" }, 400);

  let event: any;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe signature verification failed:", error.message);
    return json({ error: "Invalid Stripe signature" }, 400);
  }

  const supabase = getAdminClient();
  let auditDetails: Record<string, unknown> = {};

  try {
    const claim = await claimEvent(supabase, event);
    if (!claim.process) return json({ received: true, duplicate: true });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // Only subscription checkouts belong to Sellio plans. A one-time payment
      // (e.g. the done-for-you setup fee) must not create a merchant invite.
      if (session.mode !== "subscription") {
        auditDetails = {
          tenantId: session.client_reference_id ?? null,
          customerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
          subscriptionId: null,
        };
        await finishEvent(supabase, event.id, "skipped", auditDetails);
        return json({ received: true, skipped: true, warning: "Not a subscription checkout" });
      }

      const tenantId = session.client_reference_id ?? null;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
      auditDetails = { tenantId, customerId, subscriptionId };

      if (tenantId && subscriptionId) {
        const { data: existing, error: existingError } = await supabase
          .from("subscriptions")
          .select("stripe_subscription_id")
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (existingError) throw new Error("Existing subscription lookup failed: " + existingError.message);

        const current = await retrieveSubscription(stripe, subscriptionId);
        const currentStatus = mapStripeStatus(current.status);
        if (
          existing?.stripe_subscription_id &&
          existing.stripe_subscription_id !== subscriptionId &&
          ["active", "trial"].includes(currentStatus)
        ) {
          await stripe.subscriptions.cancel(existing.stripe_subscription_id);
        }

        await syncFromSubscription({
          supabase,
          stripe,
          tenantId,
          subscription: current,
          event,
        });
      } else if (tenantId) {
        throw new Error("Checkout completed without a subscription ID");
      } else {
        const email = session.customer_details?.email ?? null;
        const { data: existingInvite, error: existingInviteError } = await supabase
          .from("merchant_invites")
          .select("id")
          .eq("stripe_session_id", session.id)
          .maybeSingle();
        if (existingInviteError) throw new Error("Invite lookup failed: " + existingInviteError.message);
        if (!existingInvite) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);
          const fallbackPlan = session.metadata?.plan ?? "starter_monthly";
          const { error: inviteError } = await supabase.from("merchant_invites").insert({
            email,
            phone: session.customer_details?.phone ?? null,
            full_name: session.customer_details?.name ?? null,
            currency: (session.currency ?? "sgd").toUpperCase(),
            stripe_session_id: session.id,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan: fallbackPlan,
            token: session.id,
            status: "pending",
            expires_at: expiresAt.toISOString(),
          });
          if (inviteError) throw new Error("Merchant invite creation failed: " + inviteError.message);
        }
      }
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const eventSubscription = event.data.object;
      const subscriptionId = eventSubscription.id;
      const customerId =
        typeof eventSubscription.customer === "string"
          ? eventSubscription.customer
          : eventSubscription.customer?.id ?? null;
      const tenantId = await findTenantId(supabase, customerId, subscriptionId);
      auditDetails = { tenantId, customerId, subscriptionId };
      if (!tenantId) {
        await finishEvent(supabase, event.id, "skipped", auditDetails);
        return json({ received: true, warning: "Tenant not found yet" });
      }
      if (!await isCurrentSubscription(supabase, tenantId, subscriptionId)) {
        await finishEvent(supabase, event.id, "skipped", auditDetails);
        return json({ received: true, skipped: true, warning: "Obsolete subscription event" });
      }
      await syncFromSubscription({
        supabase,
        stripe,
        tenantId,
        subscription: subscriptionId,
        event,
      });
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const subscriptionId = subscription.id;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id ?? null;
      const tenantId = await findTenantId(supabase, customerId, subscriptionId);
      auditDetails = { tenantId, customerId, subscriptionId };
      if (!tenantId) {
        const { error } = await supabase
          .from("merchant_invites")
          .update({ status: "expired", updated_date: new Date().toISOString() })
          .eq("stripe_customer_id", customerId)
          .eq("status", "pending");
        if (error) throw new Error("Invite expiry failed: " + error.message);
        await finishEvent(supabase, event.id, "skipped", auditDetails);
        return json({ received: true, warning: "Tenant not found; pending invite expired" });
      }
      if (!await isCurrentSubscription(supabase, tenantId, subscriptionId)) {
        await finishEvent(supabase, event.id, "skipped", auditDetails);
        return json({ received: true, skipped: true, warning: "Obsolete subscription deletion" });
      }
      const plan = await resolvePlan(stripe, subscription);
      await syncBillingState(
        supabase,
        buildSyncArgs({
          tenantId,
          subscription,
          plan,
          clearFailure: false,
          eventCreatedAt: new Date(event.created * 1000).toISOString(),
          eventId: event.id,
        }),
      );
    } else if (
      event.type === "invoice.payment_failed" ||
      event.type === "invoice.payment_succeeded" ||
      event.type === "invoice.paid"
    ) {
      const eventInvoice = event.data.object;
      const invoice = await retrieveInvoice(stripe, eventInvoice);
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      const customerId =
        typeof invoice?.customer === "string"
          ? invoice.customer
          : invoice?.customer?.id ?? null;
      const tenantId = await findTenantId(supabase, customerId, subscriptionId);
      auditDetails = { tenantId, customerId, subscriptionId };
      if (!tenantId || !subscriptionId) {
        await finishEvent(supabase, event.id, "skipped", auditDetails);
        return json({ received: true, warning: "Tenant or subscription not found" });
      }
      if (!await isCurrentSubscription(supabase, tenantId, subscriptionId)) {
        await finishEvent(supabase, event.id, "skipped", auditDetails);
        return json({ received: true, skipped: true, warning: "Obsolete invoice event" });
      }
      await syncFromSubscription({
        supabase,
        stripe,
        tenantId,
        subscription: subscriptionId,
        invoice,
        event,
        resetOrders: event.type === "invoice.payment_succeeded",
      });
    } else if (event.type === "customer.subscription.trial_will_end") {
      const subscription = event.data.object;
      auditDetails = {
        customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
        subscriptionId: subscription.id,
      };
    } else {
      await finishEvent(supabase, event.id, "skipped", auditDetails);
      return json({ received: true, skipped: true });
    }

    await finishEvent(supabase, event.id, "processed", auditDetails);
    return json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed:", event?.id, event?.type, error.message);
    try {
      await finishEvent(supabase, event.id, "failed", { ...auditDetails, error: error.message });
    } catch (auditError) {
      console.error("Could not record webhook failure:", auditError.message);
    }
    return json({ error: "Webhook processing failed" }, 500);
  }
});
