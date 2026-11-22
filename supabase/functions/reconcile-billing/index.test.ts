// reconcile-billing end to end, with Supabase and Stripe answered by the webhook's test harness.
//   DENO_NO_PACKAGE_JSON=1 deno test -A --no-config --node-modules-dir=none supabase/functions/reconcile-billing/index.test.ts
import { deepStrictEqual as assertEquals } from "node:assert/strict";
import {
  DAY,
  failedCharge,
  install,
  invoice,
  loadHandler,
  NOW,
  subscription,
  world,
  type World,
} from "../stripe-webhook/_test/harness.ts";

const handler = await loadHandler(() => import("./index.ts"));

async function reconcile(w: World) {
  install(w);
  const res = await handler(new Request("http://reconcile.test/", {
    method: "POST",
    headers: { Authorization: "Bearer owner-session", "content-type": "application/json" },
    body: JSON.stringify({ tenantId: "shop_1" }),
  }));
  return { status: res.status, body: await res.json() };
}

const INVOICE_CREATED = NOW - DAY;

// shop_1, owned by owner@example.com, on sub_1, past due; `paid` lists its earlier paid invoices.
function pastDueShop(options: { paid: number[]; grace?: string | null; signedIn?: string }) {
  const due = invoice("in_due", "sub_1", { ...failedCharge, created: INVOICE_CREATED });
  const paid = Object.fromEntries(options.paid.map((amount, i) => [
    `in_paid_${i}`,
    invoice(`in_paid_${i}`, "sub_1", { status: "paid", amount_due: amount, amount_paid: amount, amount_remaining: 0 }),
  ]));
  return world({
    authEmail: options.signedIn ?? "owner@example.com",
    tables: {
      subscriptions: [{ tenant_id: "shop_1", stripe_subscription_id: "sub_1", grace_period_ends_at: options.grace ?? null }],
      tenant_users: [{ id: "tu_1", tenant_id: "shop_1", user_email: "Owner@Example.com", status: "active", is_owner: true }],
      super_admins: [],
    },
    stripe: {
      subscriptions: { sub_1: { ...subscription("sub_1", "past_due", "in_due"), default_payment_method: "pm_1" } },
      invoices: { in_due: due, ...paid },
    },
  });
}

function graceSent(w: World) {
  const calls = w.rpcs.filter((call) => call.fn === "sync_stripe_billing_state");
  assertEquals(calls.length, 1, "one billing sync");
  assertEquals(calls[0].args.p_status, "past_due");
  return calls[0].args.p_grace_period_ends_at;
}

Deno.test("reconcile: never paid (a trial's first charge failed) → no grace", async () => {
  const w = pastDueShop({ paid: [0] });
  const result = await reconcile(w);
  assertEquals(result.status, 200);
  assertEquals(graceSent(w), null);
});

Deno.test("reconcile: paid before → 3 days from the unpaid invoice", async () => {
  const w = pastDueShop({ paid: [3900] });
  await reconcile(w);
  assertEquals(graceSent(w), new Date((INVOICE_CREATED + 3 * DAY) * 1000).toISOString());
});

Deno.test("reconcile: paid before, a grace already running → it doesn't move", async () => {
  const w = pastDueShop({ paid: [3900], grace: "2026-11-21T18:31:30+00:00" });
  await reconcile(w);
  assertEquals(graceSent(w), "2026-11-21T18:31:30.000Z");
});

Deno.test("reconcile: someone who isn't the owner → 403, nothing saved", async () => {
  const w = pastDueShop({ paid: [3900], signedIn: "staff@example.com" });
  const result = await reconcile(w);
  assertEquals(result.status, 403);
  assertEquals(w.rpcs.length, 0);
});

// The trial reminder (src/lib/trialReminder.js) shows only when no plan starts as the trial ends.
// Newer ("flexible") subscriptions record a cancellation as cancel_at, not cancel_at_period_end.
const TRIAL_END = NOW + DAY / 4;
function trialShop(fields: Record<string, unknown>, status = "trialing") {
  return world({
    authEmail: "owner@example.com",
    tables: {
      subscriptions: [{ tenant_id: "shop_1", stripe_subscription_id: "sub_1", grace_period_ends_at: null }],
      tenant_users: [{ id: "tu_1", tenant_id: "shop_1", user_email: "owner@example.com", status: "active", is_owner: true }],
      super_admins: [],
    },
    stripe: {
      subscriptions: {
        sub_1: {
          ...subscription("sub_1", status, null),
          trial_end: status === "trialing" ? TRIAL_END : null,
          cancel_at_period_end: false,
          cancel_at: null,
          default_payment_method: "pm_1",
          ...fields,
        },
      },
      invoices: {},
    },
  });
}

Deno.test("reconcile: a trial that carries on → not ending with the trial, renews", async () => {
  const { status, body } = await reconcile(trialShop({}));
  assertEquals(status, 200);
  assertEquals([body.endsWithTrial, body.willAutoRenew, body.cancelAt], [false, true, null]);
});

Deno.test("reconcile: a trial cancelled with a cancel date (flexible) → ends with the trial", async () => {
  const { body } = await reconcile(trialShop({ cancel_at: TRIAL_END }));
  assertEquals([body.endsWithTrial, body.willAutoRenew, body.cancelAtPeriodEnd], [true, false, false]);
  assertEquals(body.cancelAt, new Date(TRIAL_END * 1000).toISOString());
});

Deno.test("reconcile: a trial cancelled at period end (classic) → ends with the trial", async () => {
  const { body } = await reconcile(trialShop({ cancel_at_period_end: true, cancel_at: TRIAL_END }));
  assertEquals([body.endsWithTrial, body.willAutoRenew], [true, false]);
});

Deno.test("reconcile: a trial set to end months later → the plan still starts", async () => {
  const { body } = await reconcile(trialShop({ cancel_at: TRIAL_END + 90 * DAY }));
  assertEquals([body.endsWithTrial, body.willAutoRenew], [false, false]);
});

Deno.test("reconcile: an active plan with a cancel date → cancelled, not a trial", async () => {
  const { body } = await reconcile(trialShop({ cancel_at: NOW + 20 * DAY }, "active"));
  assertEquals([body.endsWithTrial, body.willAutoRenew], [false, false]);
});
