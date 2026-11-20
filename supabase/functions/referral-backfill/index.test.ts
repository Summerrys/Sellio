// referral-backfill end to end, with Supabase and Stripe answered by the webhook's test harness.
//   DENO_NO_PACKAGE_JSON=1 deno test -A --no-config --node-modules-dir=none supabase/functions/referral-backfill/index.test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert/strict";
import { install, invoice, loadHandler, NOW, world, type Row, type World } from "../stripe-webhook/_test/harness.ts";

const handler = await loadHandler(() => import("./index.ts"));
const SECRET = "a".repeat(64);

async function run(w: World, body: Row = {}, secret = SECRET) {
  install(w);
  const res = await handler(new Request("http://backfill.test/", {
    method: "POST",
    headers: { "content-type": "application/json", "x-sellio-backfill": secret },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json() };
}

const line = (amount: number, subscriptionId: string) => ({
  id: `il_${subscriptionId}_${amount}`,
  object: "line_item",
  amount,
  pretax_credit_amounts: [],
  parent: { type: "subscription_item_details", subscription_item_details: { subscription: subscriptionId } },
  pricing: { type: "price_details", price_details: { price: "price_1UQssYRF2IZPNHju1F8YxwTm" } },
});

function paid(id: string, subscriptionId: string, customer: string, amount: number, currency = "sgd") {
  return invoice(id, subscriptionId, {
    customer,
    currency,
    status: "paid",
    amount_due: amount,
    amount_paid: amount,
    status_transitions: { paid_at: NOW - 3600 },
    lines: { object: "list", has_more: false, data: [line(amount, subscriptionId)] },
    payments: { object: "list", data: [{ id: `inpay_${id}`, status: "paid", payment: { type: "payment_intent", payment_intent: `pi_${id}` } }] },
  });
}

function stripeWorld(rpcAnswer?: World["rpcAnswer"]) {
  return world({
    rpcAnswer: rpcAnswer ?? ((fn, args) => fn === "referral_backfill_allowed" ? args.p_secret === SECRET : undefined),
    tables: {
      subscriptions: [{ tenant_id: "shop_1", stripe_subscription_id: "sub_1" }],
      tenants: [{ id: "shop_1", stripe_customer_id: "cus_1" }, { id: "shop_2", stripe_customer_id: "cus_2" }],
    },
    stripe: {
      invoices: {
        in_a: paid("in_a", "sub_1", "cus_1", 3900),
        in_b: paid("in_b", "sub_old", "cus_2", 7900), // an earlier subscription: found by its customer
        in_trial: paid("in_trial", "sub_1", "cus_1", 0),
        in_usd: paid("in_usd", "sub_1", "cus_1", 2900, "usd"),
      },
      payment_intents: {
        pi_in_a: { id: "pi_in_a", latest_charge: { id: "ch_a", payment_method_details: { card: { fingerprint: "fp_a" } } } },
        pi_in_b: { id: "pi_in_b", latest_charge: { id: "ch_b", payment_method_details: { type: "link" } } },
      },
    },
  });
}

Deno.test("backfill: without the secret → refused before anything is read", async () => {
  for (const secret of ["", "not-hex", "b".repeat(64)]) {
    const w = stripeWorld();
    const result = await run(w, {}, secret);
    assertEquals(result.status, 401);
    assertEquals(w.stripeCalls.length, 0);
    assertEquals(w.rpcs.filter((call) => call.fn === "referral_record_payment").length, 0);
  }
});

Deno.test("backfill: a dry run reads Stripe and records nothing", async () => {
  const w = stripeWorld();
  const result = await run(w, { dryRun: true });
  assertEquals(result.status, 200);
  assertEquals(result.body.wouldRecord, 2);
  assertEquals(result.body.recorded, 0);
  assertEquals(result.body.skipped, { "nothing paid": 1, "not SGD": 1 });
  assertEquals(result.body.rows.map((row: Row) => [row.invoice, row.shop, row.card]), [["in_a", "shop_1", true], ["in_b", "shop_2", false]]);
  assertEquals(w.rpcs.filter((call) => call.fn === "referral_record_payment").length, 0);
  assert(w.stripeCalls.some((call) => call.startsWith("GET /v1/invoices status=paid&limit=40&expand[0]=data.payments")), "listed paid invoices with their payments");
});

Deno.test("backfill: a run records every paid invoice above zero, with its shop", async () => {
  const w = stripeWorld();
  const result = await run(w, {});
  assertEquals(result.body.recorded, 2);
  const recorded = w.rpcs.filter((call) => call.fn === "referral_record_payment").map((call) => call.args);
  assertEquals(recorded.map((args) => [args.p_invoice_id, args.p_tenant_id, args.p_amount_paid_minor, args.p_billing_cycle, args.p_card_fingerprint]), [
    ["in_a", "shop_1", 3900, "monthly", "fp_a"],
    ["in_b", "shop_2", 7900, "monthly", null],
  ]);
  assertEquals(result.body.nextStartingAfter, null);
});

Deno.test("backfill: more invoices than a run takes → where to go on", async () => {
  const w = stripeWorld();
  w.stripeLists = {
    invoices: (params) => params.get("starting_after") === "in_a"
      ? { data: [w.stripe.invoices.in_b], has_more: false }
      : { data: [w.stripe.invoices.in_a], has_more: true },
  };
  const first = await run(w, { limit: 1 });
  assertEquals([first.body.recorded, first.body.nextStartingAfter], [1, "in_a"]);
  const second = await run(w, { limit: 1, startingAfter: "in_a" });
  assertEquals([second.body.recorded, second.body.nextStartingAfter], [1, null]);
});
