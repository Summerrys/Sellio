// The referral programme's part of the Stripe webhook (phase 2, 20 Nov 2026). The database keeps
// the records and does the sums (supabase/migrations/20261110090000_referral_programme.sql,
// section 4); this reads what it needs from Stripe and calls it. Used by stripe-webhook and
// referral-backfill.
import { PRICE_ID_TO_PLAN, toIso } from "./billing.ts";

// A sign-up checkout from a distributor's link has client_reference_id "ref_" and the code. A
// shop's own checkout has the shop's id there, which never starts with "ref" (shop ids are hex).
// The database checks the code (an unknown one is noted as nothing).
export function referralReference(reference: unknown): string | null {
  if (typeof reference !== "string") return null;
  const value = reference.trim();
  return /^ref/i.test(value) ? value : null;
}

// The sign-up's referral (referral_note_checkout): the code, the checkout, and who paid (the
// database voids a distributor signing up their own team by email or phone).
export async function noteReferralCheckout(deps: { supabase: any; stripe: any }, input: {
  session: any;
  code: string;
  customerId: string | null;
  subscriptionId: string | null;
}) {
  const { supabase, stripe } = deps;
  const { session, code, customerId, subscriptionId } = input;
  let trial = session?.amount_total === 0;
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    trial = subscription?.status === "trialing";
  }
  const { data, error } = await supabase.rpc("referral_note_checkout", {
    p_code: code,
    p_session_id: session.id,
    p_customer_id: customerId,
    p_subscription_id: subscriptionId,
    p_email: session?.customer_details?.email ?? session?.customer_email ?? null,
    p_phone: session?.customer_details?.phone ?? null,
    p_trial: trial,
  });
  if (error) throw new Error("Referral sign-up note failed: " + error.message);
  return data;
}

function isSubscriptionLine(line: any) {
  return line?.parent?.type === "subscription_item_details" || line?.type === "subscription";
}

// What an invoice line comes to after its discounts and credits, in cents.
function lineNet(line: any) {
  const credits: any[] = Array.isArray(line?.pretax_credit_amounts)
    ? line.pretax_credit_amounts
    : Array.isArray(line?.discount_amounts) ? line.discount_amounts : [];
  const off = credits.reduce((sum, credit) => sum + (typeof credit?.amount === "number" ? credit.amount : 0), 0);
  return (typeof line?.amount === "number" ? line.amount : 0) - off;
}

function linePriceId(line: any): string | null {
  const price = line?.pricing?.price_details?.price ?? line?.price ?? line?.plan ?? null;
  return typeof price === "string" ? price : price?.id ?? null;
}

// The billing cycle of a price: from Sellio's price list, else from Stripe.
async function priceCycle(stripe: any, priceId: string): Promise<"monthly" | "yearly" | null> {
  const known = PRICE_ID_TO_PLAN[priceId];
  if (known?.endsWith("_monthly")) return "monthly";
  if (known?.endsWith("_yearly")) return "yearly";
  const price = await stripe.prices.retrieve(priceId);
  const interval = price?.recurring?.interval;
  return interval === "year" ? "yearly" : interval === "month" ? "monthly" : null;
}

async function allLines(stripe: any, invoice: any): Promise<any[]> {
  if (!invoice?.lines?.has_more) return invoice?.lines?.data ?? [];
  const lines: any[] = [];
  let startingAfter: string | null = null;
  for (let page = 0; page < 20; page++) {
    const list: any = await stripe.invoices.listLineItems(invoice.id, {
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const data: any[] = list?.data ?? [];
    lines.push(...data);
    if (!list?.has_more || data.length === 0) break;
    startingAfter = data[data.length - 1].id;
  }
  return lines;
}

// The card that paid the invoice: Stripe's fingerprint of it (not the card number), or null
// (Link, PayNow, an invoice paid another way). The database holds a referral for review when a
// distributor's own plan was paid with the same card.
async function paidCardFingerprint(stripe: any, invoice: any): Promise<string | null> {
  const payments: any[] = invoice?.payments?.data ?? [];
  const paid = payments.find((p) => p?.status === "paid") ?? payments.find((p) => p?.is_default) ?? payments[0];
  if (paid?.payment?.type !== "payment_intent") return null;
  const ref = paid.payment.payment_intent;
  const paymentIntentId = typeof ref === "string" ? ref : ref?.id ?? null;
  if (!paymentIntentId) return null;
  let charge = typeof ref === "object" && typeof ref?.latest_charge === "object" ? ref.latest_charge : null;
  if (!charge) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    charge = typeof paymentIntent?.latest_charge === "object" ? paymentIntent.latest_charge : null;
  }
  return charge?.payment_method_details?.card?.fingerprint ?? null;
}

// A paid invoice for the referral programme (referral_record_payment's arguments), or why there's
// nothing to record. Amounts in cents: the whole payment, and its subscription part after
// discounts (the commission base: no setup fee or other one-off item). The billing cycle is that
// of its subscription price (the biggest line's, when a plan change mixes them).
export async function invoicePaymentArgs(stripe: any, invoice: any, ids: {
  tenantId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
}): Promise<{ args: Record<string, unknown> } | { skip: string }> {
  const amountPaid = typeof invoice?.amount_paid === "number" ? invoice.amount_paid : 0;
  if (!invoice?.id || invoice?.status !== "paid" || amountPaid <= 0) return { skip: "nothing paid" };
  const currency = typeof invoice.currency === "string" ? invoice.currency.toUpperCase() : null;
  if (currency !== "SGD") return { skip: "not SGD" };
  const lines = (await allLines(stripe, invoice)).filter(isSubscriptionLine);
  if (lines.length === 0) return { skip: "no subscription in it" };
  const base = Math.max(0, Math.min(amountPaid, lines.reduce((sum, line) => sum + lineNet(line), 0)));
  const main = [...lines].sort((a, b) => lineNet(b) - lineNet(a))[0];
  const priceId = linePriceId(main);
  const cycle = priceId ? await priceCycle(stripe, priceId) : null;
  if (!cycle) return { skip: "billing cycle unknown" };
  const paidAt = invoice?.status_transitions?.paid_at ?? invoice?.effective_at ?? invoice?.created;
  return {
    args: {
      p_invoice_id: invoice.id,
      p_tenant_id: ids.tenantId,
      p_subscription_id: ids.subscriptionId,
      p_customer_id: ids.customerId,
      p_amount_paid_minor: amountPaid,
      p_base_minor: base,
      p_currency: currency,
      p_billing_cycle: cycle,
      p_paid_at: toIso(paidAt),
      p_card_fingerprint: await paidCardFingerprint(stripe, invoice),
    },
  };
}

// Records a paid invoice (every shop's, above zero) and earns on it where a distributor brought
// the shop in. Safe to call again for the same invoice.
export async function recordInvoicePayment(deps: { supabase: any; stripe: any }, invoice: any, ids: {
  tenantId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
}) {
  const record = await invoicePaymentArgs(deps.stripe, invoice, ids);
  if ("skip" in record) return { recorded: false, reason: record.skip };
  const { data, error } = await deps.supabase.rpc("referral_record_payment", record.args);
  if (error) throw new Error("Referral payment record failed: " + error.message);
  return { recorded: true, result: data };
}

// The invoice a payment intent paid, and what it paid of it in the invoice's currency (a charge
// no longer names its invoice: Stripe's invoice payments do).
async function invoicePaidBy(stripe: any, paymentIntentId: string) {
  const list: any = await stripe.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntentId },
    limit: 10,
  });
  const paid = (list?.data ?? []).find((payment: any) => payment?.status === "paid");
  if (!paid?.invoice) return null;
  const invoiceId = typeof paid.invoice === "string" ? paid.invoice : paid.invoice.id;
  let amountPaid = typeof paid.amount_paid === "number" ? paid.amount_paid : null;
  if (amountPaid === null) amountPaid = (await stripe.invoices.retrieve(invoiceId))?.amount_paid ?? 0;
  return { invoiceId, amountPaid: amountPaid as number };
}

// A refund or dispute (in the charge's currency) as the same share of what the charge paid of
// its invoice (in the invoice's currency, SGD).
function shareOfInvoice(amount: unknown, chargeAmount: unknown, invoicePaid: number) {
  if (typeof amount !== "number" || typeof chargeAmount !== "number" || chargeAmount <= 0) return 0;
  return Math.round(invoicePaid * Math.min(1, amount / chargeAmount));
}

// A refunded or disputed payment takes back what was earned on its invoice, and a dispute Sellio
// wins (or an inquiry that closes without a chargeback) gives it back (referral_record_reversal;
// safe to call again: one take-back per refund or dispute). A charge that didn't pay an
// invoice (the setup fee) has nothing to take back.
export async function recordChargeReversal(deps: { supabase: any; stripe: any }, event: any) {
  const { supabase, stripe } = deps;
  const object = event?.data?.object ?? {};
  const isRefund = event.type === "charge.refunded";
  let charge: any = isRefund ? object : typeof object.charge === "object" ? object.charge : null;
  if (!charge && typeof object.charge === "string") charge = await stripe.charges.retrieve(object.charge);
  const customerId = typeof charge?.customer === "string" ? charge.customer : charge?.customer?.id ?? null;
  const ref = charge?.payment_intent ?? object.payment_intent ?? null;
  const paymentIntentId = typeof ref === "string" ? ref : ref?.id ?? null;
  if (!paymentIntentId) return { recorded: 0, customerId, reason: "Not an invoice payment" };
  const paid = await invoicePaidBy(stripe, paymentIntentId);
  if (!paid) return { recorded: 0, customerId, reason: "Not an invoice payment" };

  const calls: { ref: string; kind: string; amount: number; at: string | null }[] = [];
  if (isRefund) {
    const refunds: any = await stripe.refunds.list({ charge: charge.id, limit: 100 });
    for (const refund of refunds?.data ?? []) {
      if (refund?.status === "failed" || refund?.status === "canceled") continue;
      calls.push({ ref: refund.id, kind: "refund", amount: shareOfInvoice(refund.amount, charge.amount, paid.amountPaid), at: toIso(refund.created) });
    }
  } else if (event.type === "charge.dispute.created") {
    calls.push({ ref: object.id, kind: "dispute", amount: shareOfInvoice(object.amount, charge?.amount, paid.amountPaid), at: toIso(object.created) });
  } else if (object.status === "won" || object.status === "warning_closed") {
    calls.push({ ref: object.id, kind: "dispute_won", amount: shareOfInvoice(object.amount, charge?.amount, paid.amountPaid), at: toIso(event.created) });
  } else {
    return { recorded: 0, customerId, reason: "Dispute lost: already taken back" };
  }
  if (calls.length === 0) return { recorded: 0, customerId, reason: "No refund to record" };

  const results: unknown[] = [];
  for (const call of calls) {
    const { data, error } = await supabase.rpc("referral_record_reversal", {
      p_invoice_id: paid.invoiceId,
      p_ref: call.ref,
      p_kind: call.kind,
      p_amount_minor: call.amount,
      p_at: call.at,
    });
    if (error) throw new Error("Referral reversal failed: " + error.message);
    results.push(data);
  }
  return { recorded: calls.length, customerId, invoiceId: paid.invoiceId, results };
}
