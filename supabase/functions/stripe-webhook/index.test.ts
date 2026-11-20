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
