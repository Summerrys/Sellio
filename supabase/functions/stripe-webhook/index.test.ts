// The Stripe webhook end to end: a signed Stripe event goes in, the harness answers Supabase
// and Stripe (fetch is replaced), then the test checks what the webhook asked of each.
//   DENO_NO_PACKAGE_JSON=1 deno test -A --no-config --node-modules-dir=none supabase/functions/stripe-webhook/index.test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert/strict";
import {
  DAY,
  deliver,
  event,
  failedCharge,
  invoice,
  loadHandler,
  NOW,
  subscription,
  world,
  type Row,
  type World,
} from "./_test/harness.ts";

const handler = await loadHandler(() => import("./index.ts"));
const send = (w: World, e: Record<string, any>) => deliver(handler, w, e);

function syncArgs(w: World) {
  const calls = w.rpcs.filter((call) => call.fn === "sync_stripe_billing_state");
  assertEquals(calls.length, 1, "one billing sync");
  return calls[0].args;
}

// A shop on starter whose subscription is sub_1; `paid` lists its earlier paid invoices.
function shop(options: { paid: number[]; grace?: string | null; status?: string; latest?: Row }) {
  const latest = options.latest ?? invoice("in_due", "sub_1", failedCharge);
  const paidInvoices = Object.fromEntries(options.paid.map((amount, i) => [
    `in_paid_${i}`,
    invoice(`in_paid_${i}`, "sub_1", { status: "paid", amount_due: amount, amount_paid: amount, amount_remaining: 0 }),
  ]));
  return world({
    tables: {
      subscriptions: [{ tenant_id: "shop_1", stripe_subscription_id: "sub_1", grace_period_ends_at: options.grace ?? null }],
      tenants: [{ id: "shop_1", stripe_customer_id: "cus_1" }],
    },
    stripe: {
      subscriptions: { sub_1: subscription("sub_1", options.status ?? "past_due", latest.id) },
      invoices: { [latest.id]: latest, ...paidInvoices },
    },
  });
}

Deno.test("grace: a trial's first charge fails (never paid) → no grace, the shop locks at once", async () => {
  const w = shop({ paid: [0] }); // only the trial's S$0 invoice
  const result = await send(w, event("invoice.payment_failed", { id: "in_due" }));
  assertEquals(result.status, 200);
  assertEquals(result.event?.processing_status, "processed");
  const args = syncArgs(w);
  assertEquals(args.p_status, "past_due");
  assertEquals(args.p_grace_period_ends_at, null);
  assertEquals(args.p_failure_code, "card_declined");
  assertEquals(args.p_invoice_hosted_url, "https://invoice.stripe.com/i/in_due");
  assert(w.stripeCalls.some((call) => call.startsWith("GET /v1/invoices subscription=sub_1&status=paid")), "asked Stripe for paid invoices");
});

Deno.test("grace: a shop that has paid before → 3 days from the first failure", async () => {
  const w = shop({ paid: [0, 3900] });
  const created = NOW - 3600;
  await send(w, event("invoice.payment_failed", { id: "in_due" }, created));
  assertEquals(syncArgs(w).p_grace_period_ends_at, new Date((created + 3 * DAY) * 1000).toISOString());
});

Deno.test("grace: Stripe retries and fails again → the end doesn't move", async () => {
  const w = shop({ paid: [3900], grace: "2026-11-21T18:31:30+00:00" });
  await send(w, event("invoice.payment_failed", { id: "in_due" }, NOW));
  assertEquals(syncArgs(w).p_grace_period_ends_at, "2026-11-21T18:31:30.000Z");
});

Deno.test("grace: a subscription update while past due (never paid) → still none", async () => {
  const w = shop({ paid: [] });
  await send(w, event("customer.subscription.updated", subscription("sub_1", "past_due", "in_due")));
  const args = syncArgs(w);
  assertEquals(args.p_status, "past_due");
  assertEquals(args.p_grace_period_ends_at, null);
});

Deno.test("grace: the invoice is paid → active, no grace, the failure cleared", async () => {
  const paid = invoice("in_due", "sub_1", { status: "paid", amount_due: 3900, amount_paid: 3900, amount_remaining: 0 });
  const w = shop({ paid: [], status: "active", latest: paid, grace: "2026-11-21T18:31:30+00:00" });
  await send(w, event("invoice.paid", { id: "in_due" }));
  const args = syncArgs(w);
  assertEquals(args.p_status, "active");
  assertEquals(args.p_grace_period_ends_at, null);
  assertEquals(args.p_clear_failure, true);
  assert(!w.stripeCalls.some((call) => call.includes("status=paid")), "no paid-invoice lookup when not past due");
});

// ── Referral programme (phase 2) ──────────────────────────────────────────────────────────────

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

function subscriptionLine(amount: number, priceId: string, extra: Row = {}) {
  return {
    id: `il_sub_${amount}`,
    object: "line_item",
    amount,
    currency: "sgd",
    discount_amounts: [],
    pretax_credit_amounts: [],
    parent: { type: "subscription_item_details", subscription_item_details: { subscription: "sub_1" } },
    pricing: { type: "price_details", price_details: { price: priceId, product: "prod_plan" } },
    ...extra,
  };
}

function oneOffLine(amount: number) {
  return {
    id: `il_fee_${amount}`,
    object: "line_item",
    amount,
    currency: "sgd",
    discount_amounts: [],
    pretax_credit_amounts: [],
    parent: { type: "invoice_item_details", invoice_item_details: { invoice_item: "ii_setup" } },
    pricing: { type: "price_details", price_details: { price: "price_setup", product: "prod_setup" } },
  };
}

function cardPayment(fingerprint: string | null, amount = 3900) {
  return {
    id: "inpay_paid",
    object: "invoice_payment",
    status: "paid",
    amount_paid: amount,
    payment: {
      type: "payment_intent",
      payment_intent: {
        id: "pi_paid",
        object: "payment_intent",
        latest_charge: {
          id: "ch_paid",
          object: "charge",
          amount,
          payment_method_details: fingerprint
            ? { type: "card", card: { fingerprint } }
            : { type: "link", link: {} },
        },
      },
    },
  };
}

function paidInvoice(id: string, subscriptionId: string, fields: Row = {}) {
  return invoice(id, subscriptionId, {
    status: "paid",
    amount_due: 3900,
    amount_paid: 3900,
    amount_remaining: 0,
    status_transitions: { paid_at: NOW - 600 },
    lines: { object: "list", has_more: false, data: [subscriptionLine(3900, "price_1UQssYRF2IZPNHju1F8YxwTm")] },
    payments: { object: "list", data: [cardPayment("fp_owner_card")] },
    ...fields,
  });
}

function referralCalls(w: World, fn: string) {
  return w.rpcs.filter((call) => call.fn === fn).map((call) => call.args);
}

Deno.test("referral: a shop's paid invoice → billing synced, then the payment recorded", async () => {
  const w = shop({ paid: [], status: "active", latest: paidInvoice("in_paid", "sub_1") });
  const result = await send(w, event("invoice.paid", { id: "in_paid" }));
  assertEquals(result.status, 200);
  assertEquals(result.event?.processing_status, "processed");
  assertEquals(w.rpcs.map((call) => call.fn), ["sync_stripe_billing_state", "referral_record_payment"]);
  assertEquals(referralCalls(w, "referral_record_payment"), [{
    p_invoice_id: "in_paid",
    p_tenant_id: "shop_1",
    p_subscription_id: "sub_1",
    p_customer_id: "cus_1",
    p_amount_paid_minor: 3900,
    p_base_minor: 3900,
    p_currency: "SGD",
    p_billing_cycle: "monthly",
    p_paid_at: iso(NOW - 600),
    p_card_fingerprint: "fp_owner_card",
  }]);
});

Deno.test("referral: invoice.payment_succeeded (the same payment's twin event) → not recorded again", async () => {
  const w = shop({ paid: [], status: "active", latest: paidInvoice("in_paid", "sub_1") });
  await send(w, event("invoice.payment_succeeded", { id: "in_paid" }));
  assertEquals(referralCalls(w, "referral_record_payment").length, 0);
});

Deno.test("referral: a setup fee and a discount → the base is the plan after its discount", async () => {
  const discounted = subscriptionLine(3900, "price_1UQssYRF2IZPNHju1F8YxwTm", {
    discount_amounts: [{ amount: 390, discount: "di_1" }],
    pretax_credit_amounts: [{ amount: 390, discount: "di_1", type: "discount" }], // the same discount, newer field
  });
  const latest = paidInvoice("in_first", "sub_1", {
    amount_due: 13410,
    amount_paid: 13410,
    lines: { object: "list", has_more: false, data: [discounted, oneOffLine(9900)] },
    payments: { object: "list", data: [cardPayment("fp_owner_card", 13410)] },
  });
  const w = shop({ paid: [], status: "active", latest });
  await send(w, event("invoice.paid", { id: "in_first" }));
  const [args] = referralCalls(w, "referral_record_payment");
  assertEquals([args.p_amount_paid_minor, args.p_base_minor], [13410, 3510]);
});

Deno.test("referral: lines past the first page are read; a price not in Sellio's list → asked of Stripe", async () => {
  const latest = paidInvoice("in_year", "sub_1", {
    amount_due: 39000,
    amount_paid: 39000,
    lines: { object: "list", has_more: true, data: [], all: [subscriptionLine(39000, "price_new_yearly")] },
  });
  const w = shop({ paid: [], status: "active", latest });
  w.stripe.prices = { price_new_yearly: { id: "price_new_yearly", object: "price", recurring: { interval: "year" } } };
  await send(w, event("invoice.paid", { id: "in_year" }));
  const [args] = referralCalls(w, "referral_record_payment");
  assertEquals([args.p_billing_cycle, args.p_base_minor], ["yearly", 39000]);
  assert(w.stripeCalls.some((call) => call.startsWith("GET /v1/invoices/in_year/lines")), "read the lines");
  assert(w.stripeCalls.some((call) => call.startsWith("GET /v1/prices/price_new_yearly")), "asked Stripe for the price");
});

Deno.test("referral: a sign-up's first payment before its shop exists → recorded without a shop", async () => {
  const first = paidInvoice("in_signup", "sub_new", { customer: "cus_new" });
  const w = world({ stripe: { invoices: { in_signup: first } } });
  const result = await send(w, event("invoice.paid", { id: "in_signup" }));
  assertEquals(result.event?.processing_status, "processed");
  assertEquals(w.rpcs.map((call) => call.fn), ["referral_record_payment"]);
  const [args] = referralCalls(w, "referral_record_payment");
  assertEquals([args.p_tenant_id, args.p_subscription_id, args.p_customer_id], [null, "sub_new", "cus_new"]);
});

Deno.test("referral: a trial's S$0 invoice → nothing recorded", async () => {
  const trial = invoice("in_trial", "sub_1", { status: "paid", amount_due: 0, amount_paid: 0, amount_remaining: 0 });
  const w = shop({ paid: [], status: "trialing", latest: trial });
  await send(w, event("invoice.paid", { id: "in_trial" }));
  assertEquals(referralCalls(w, "referral_record_payment").length, 0);
});

Deno.test("referral: paid with Link (no card) → recorded without a fingerprint", async () => {
  const latest = paidInvoice("in_link", "sub_1", { payments: { object: "list", data: [cardPayment(null)] } });
  const w = shop({ paid: [], status: "active", latest });
  await send(w, event("invoice.paid", { id: "in_link" }));
  assertEquals(referralCalls(w, "referral_record_payment")[0].p_card_fingerprint, null);
});

Deno.test("referral: the record failing → the event fails after the billing sync (Stripe retries)", async () => {
  const w = shop({ paid: [], status: "active", latest: paidInvoice("in_paid", "sub_1") });
  w.rpcAnswer = (fn) => fn === "referral_record_payment" ? new Error("boom") : undefined;
  const result = await send(w, event("invoice.paid", { id: "in_paid" }));
  assertEquals(result.status, 500);
  assertEquals(result.event?.processing_status, "failed");
  assertEquals(w.rpcs.map((call) => call.fn), ["sync_stripe_billing_state", "referral_record_payment"]);
});

function signupSession(fields: Row = {}) {
  return {
    id: "cs_signup",
    object: "checkout.session",
    mode: "subscription",
    client_reference_id: "ref_ABC234",
    customer: "cus_new",
    subscription: "sub_new",
    invoice: "in_signup_first",
    currency: "sgd",
    amount_total: 0,
    metadata: { plan: "starter_monthly" },
    customer_details: { email: "New@Shop.com", phone: "+6591234567", name: "New Shop" },
    ...fields,
  };
}

Deno.test("referral: a sign-up from a distributor's link → the invite as usual, the referral noted", async () => {
  const w = world({
    stripe: {
      subscriptions: { sub_new: { ...subscription("sub_new", "trialing", "in_signup_first", "cus_new") } },
      invoices: { in_signup_first: invoice("in_signup_first", "sub_new", { status: "paid", amount_due: 0, amount_paid: 0 }) },
    },
  });
  const result = await send(w, event("checkout.session.completed", signupSession()));
  assertEquals(result.status, 200);
  assertEquals(w.tables.merchant_invites.length, 1);
  assertEquals(w.tables.merchant_invites[0].stripe_session_id, "cs_signup");
  assertEquals(referralCalls(w, "referral_note_checkout"), [{
    p_code: "ref_ABC234",
    p_session_id: "cs_signup",
    p_customer_id: "cus_new",
    p_subscription_id: "sub_new",
    p_email: "New@Shop.com",
    p_phone: "+6591234567",
    p_trial: true,
  }]);
  assertEquals(referralCalls(w, "shop_checkout_check").length, 0, "not taken for a shop's id");
  assertEquals(referralCalls(w, "referral_record_payment").length, 0, "the trial's S$0 invoice");
});

Deno.test("referral: a code typed at sign-up (reft_) → signed up the same way, passed on as it is", async () => {
  // The sign-up page sends a typed code as reft_CODE (20 Nov 2026); referral_note_checkout records
  // it as typed. Here: it is a referral, not a shop's id, and reaches the database unchanged.
  const w = world({
    stripe: {
      subscriptions: { sub_new: { ...subscription("sub_new", "trialing", "in_signup_first", "cus_new") } },
      invoices: { in_signup_first: invoice("in_signup_first", "sub_new", { status: "paid", amount_due: 0, amount_paid: 0 }) },
    },
  });
  const result = await send(w, event("checkout.session.completed", signupSession({ client_reference_id: "reft_ABC234" })));
  assertEquals(result.status, 200);
  assertEquals(w.tables.merchant_invites.length, 1, "the invite as usual");
  assertEquals(referralCalls(w, "referral_note_checkout").map((args) => args.p_code), ["reft_ABC234"]);
  assertEquals(referralCalls(w, "shop_checkout_check").length, 0, "not taken for a shop's id");
});

Deno.test("referral: a sign-up paid at checkout (no trial) → its first payment recorded too", async () => {
  const first = paidInvoice("in_signup_first", "sub_new", { customer: "cus_new" });
  const w = world({
    stripe: {
      subscriptions: { sub_new: { ...subscription("sub_new", "active", "in_signup_first", "cus_new") } },
      invoices: { in_signup_first: first },
    },
  });
  await send(w, event("checkout.session.completed", signupSession({ amount_total: 3900 })));
  assertEquals(referralCalls(w, "referral_note_checkout")[0].p_trial, false);
  const [args] = referralCalls(w, "referral_record_payment");
  assertEquals([args.p_invoice_id, args.p_tenant_id, args.p_subscription_id], ["in_signup_first", null, "sub_new"]);
  assertEquals(w.rpcs.map((call) => call.fn), ["referral_note_checkout", "referral_record_payment"]);
});

Deno.test("referral: a shop's own checkout (its id) → the shop check as before, no referral", async () => {
  const w = world({
    rpcAnswer: (fn) => fn === "shop_checkout_check" ? { found: false } : undefined,
    stripe: { subscriptions: { sub_x: subscription("sub_x", "active", null) } },
  });
  await send(w, event("checkout.session.completed", signupSession({ client_reference_id: "e106c9a3-5d56-4562-8748-872df9220972", subscription: "sub_x" })));
  assertEquals(referralCalls(w, "shop_checkout_check").length, 1);
  assertEquals(referralCalls(w, "referral_note_checkout").length, 0);
  assertEquals(w.tables.merchant_invites.length, 0);
});

Deno.test("referral: a sign-up without a code → the invite, no referral", async () => {
  const w = world();
  await send(w, event("checkout.session.completed", signupSession({ client_reference_id: null })));
  assertEquals(w.tables.merchant_invites.length, 1);
  assertEquals(w.rpcs.length, 0);
});

// The invoice payment that pi_paid made: S$39 of in_paid.
const paidByPi = (params: URLSearchParams) =>
  params.get("payment[type]") === "payment_intent" && params.get("payment[payment_intent]") === "pi_paid"
    ? [{ id: "inpay_paid", object: "invoice_payment", status: "paid", amount_paid: 3900, invoice: "in_paid", payment: { type: "payment_intent", payment_intent: "pi_paid" } }]
    : [];

Deno.test("referral: a charge refunded in parts → each refund taken back as its share of the invoice", async () => {
  // The charge in Rupiah (Rp430.000 for S$39): the shares still come out in the invoice's SGD.
  const charge = { id: "ch_paid", object: "charge", amount: 430000, currency: "idr", payment_intent: "pi_paid", customer: "cus_1" };
  const w = world({
    stripeLists: {
      invoice_payments: paidByPi,
      refunds: (params) => params.get("charge") === "ch_paid"
        ? [
          { id: "re_1", amount: 215000, status: "succeeded", created: NOW - 100 },
          { id: "re_2", amount: 107500, status: "pending", created: NOW - 50 },
          { id: "re_3", amount: 107500, status: "failed", created: NOW - 10 },
        ]
        : [],
    },
  });
  const result = await send(w, event("charge.refunded", charge));
  assertEquals(result.event?.processing_status, "processed");
  assertEquals(referralCalls(w, "referral_record_reversal"), [
    { p_invoice_id: "in_paid", p_ref: "re_1", p_kind: "refund", p_amount_minor: 1950, p_at: iso(NOW - 100) },
    { p_invoice_id: "in_paid", p_ref: "re_2", p_kind: "refund", p_amount_minor: 975, p_at: iso(NOW - 50) },
  ]);
});

Deno.test("referral: a charge that paid no invoice (the setup fee) → nothing to take back", async () => {
  const w = world({ stripeLists: { invoice_payments: () => [] } });
  const result = await send(w, event("charge.refunded", { id: "ch_fee", object: "charge", amount: 9900, payment_intent: "pi_fee" }));
  assertEquals(result.event?.processing_status, "skipped");
  assertEquals(w.rpcs.length, 0);
});

Deno.test("referral: a dispute → taken back; won → given back; lost → nothing more", async () => {
  const charges = { ch_paid: { id: "ch_paid", object: "charge", amount: 3900, payment_intent: "pi_paid", customer: "cus_1" } };
  const dispute = (status: string) => ({ id: "dp_1", object: "dispute", amount: 3900, charge: "ch_paid", payment_intent: "pi_paid", status, created: NOW - 100 });

  const opened = world({ stripe: { charges }, stripeLists: { invoice_payments: paidByPi } });
  await send(opened, event("charge.dispute.created", dispute("needs_response")));
  assertEquals(referralCalls(opened, "referral_record_reversal"), [
    { p_invoice_id: "in_paid", p_ref: "dp_1", p_kind: "dispute", p_amount_minor: 3900, p_at: iso(NOW - 100) },
  ]);

  const won = world({ stripe: { charges }, stripeLists: { invoice_payments: paidByPi } });
  await send(won, event("charge.dispute.closed", dispute("won"), NOW));
  assertEquals(referralCalls(won, "referral_record_reversal"), [
    { p_invoice_id: "in_paid", p_ref: "dp_1", p_kind: "dispute_won", p_amount_minor: 3900, p_at: iso(NOW) },
  ]);

  const lost = world({ stripe: { charges }, stripeLists: { invoice_payments: paidByPi } });
  const result = await send(lost, event("charge.dispute.closed", dispute("lost")));
  assertEquals(result.event?.processing_status, "skipped");
  assertEquals(lost.rpcs.length, 0);
});

Deno.test("referral: Stripe delivers the same invoice.paid twice → recorded once", async () => {
  const w = shop({ paid: [], status: "active", latest: paidInvoice("in_paid", "sub_1") });
  const paidEvent = event("invoice.paid", { id: "in_paid" });
  const first = await send(w, paidEvent);
  const again = await send(w, paidEvent);
  assertEquals([first.status, again.status], [200, 200]);
  assertEquals(again.body, { received: true, duplicate: true });
  assertEquals(referralCalls(w, "referral_record_payment").length, 1);
  assertEquals(referralCalls(w, "sync_stripe_billing_state").length, 1);
});

Deno.test("referral: an invoice of the shop's replaced subscription → recorded with the shop, billing untouched", async () => {
  const old = paidInvoice("in_old", "sub_old");
  const w = shop({ paid: [], status: "active", latest: paidInvoice("in_paid", "sub_1") });
  w.stripe.invoices.in_old = old;
  const result = await send(w, event("invoice.paid", { id: "in_old" }));
  assertEquals(result.event?.processing_status, "processed");
  assertEquals(result.body.warning, "Obsolete invoice event");
  assertEquals(w.rpcs.map((call) => call.fn), ["referral_record_payment"]);
  const [args] = referralCalls(w, "referral_record_payment");
  assertEquals([args.p_tenant_id, args.p_subscription_id], ["shop_1", "sub_old"]);
});
