// deno test supabase/functions/stripe-webhook/_shared/shop-checkout.test.ts
// (from the app root: DENO_NO_PACKAGE_JSON=1 deno test --no-config --node-modules-dir=none …)
import { deepStrictEqual as assertEquals, ok as assert, rejects } from "node:assert/strict";
import { handleShopCheckout, TRIAL_ENDED_MARK } from "./shop-checkout.ts";

type Sub = { id: string; status: string; metadata?: Record<string, string> };

function world(options: {
  check?: any;
  checkError?: string;
  existing?: string | null;
  subs: Record<string, Sub | Error>;
  afterTrialEnd?: Sub;
  cancelError?: Record<string, Error>;
  afterFailedCancel?: Record<string, Sub>;
}) {
  const calls: string[] = [];
  const synced: Sub[] = [];
  const subs = { ...options.subs };
  const supabase = {
    rpc: (fn: string, args: any) => {
      calls.push(`rpc:${fn}`);
      if (fn === "shop_checkout_check") {
        calls.push(`check:${args.p_email}|${args.p_phone}|${args.p_customer_id}`);
        if (options.checkError) return Promise.resolve({ data: null, error: { message: options.checkError } });
        return Promise.resolve({ data: options.check, error: null });
      }
      if (fn === "alert_sellio_admins") {
        calls.push(`alert:${args.p_type}:${args.p_message}`);
        return Promise.resolve({ data: 3, error: null });
      }
      throw new Error("unexpected rpc " + fn);
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            calls.push(`select:${table}`);
            return Promise.resolve({ data: options.existing ? { stripe_subscription_id: options.existing } : null, error: null });
          },
        }),
      }),
    }),
  };
  let failedCancels = 0;
  const stripe = {
    subscriptions: {
      retrieve: (id: string) => {
        calls.push(`retrieve:${id}`);
        const sub = failedCancels && options.afterFailedCancel?.[id] ? options.afterFailedCancel[id] : subs[id];
        if (sub instanceof Error) return Promise.reject(sub);
        if (!sub) return Promise.reject(Object.assign(new Error("No such subscription"), { code: "resource_missing" }));
        return Promise.resolve(sub);
      },
      update: (id: string, params: any, opts?: any) => {
        calls.push(`update:${id}:${JSON.stringify(params)}${opts ? ":" + JSON.stringify(opts) : ""}`);
        if (params.trial_end === "now") subs[id] = options.afterTrialEnd!;
        return Promise.resolve(subs[id]);
      },
      cancel: (id: string) => {
        calls.push(`cancel:${id}`);
        const error = options.cancelError?.[id];
        if (error) {
          failedCancels++;
          return Promise.reject(error);
        }
        subs[id] = { id, status: "canceled" };
        return Promise.resolve(subs[id]);
      },
    },
  };
  const sync = (subscription: Sub) => {
    synced.push(subscription);
    return Promise.resolve(true);
  };
  return { supabase, stripe, sync, calls, synced };
}

const session = (overrides: any = {}) => ({
  id: "cs_1",
  customer_details: { email: "Owner@Shop.SG", phone: null },
  metadata: { plan: "growth_monthly" },
  amount_total: 7900,
  currency: "sgd",
  ...overrides,
});
const input = (s = session()) => ({ session: s, tenantId: "shop-1", subscriptionId: "sub_new", customerId: "cus_new" });
const owner = { found: true, matched: true, via: "email", name: "Kopi Corner", ownerEmail: "owner@shop.sg", hasUsedTrial: true };

Deno.test("a payer who isn't the owner: held, marked in Stripe, admins told, nothing attached", async () => {
  const w = world({
    check: { ...owner, matched: false, via: null },
    existing: "sub_old",
    subs: { sub_new: { id: "sub_new", status: "active" }, sub_old: { id: "sub_old", status: "active" } },
  });
  const result = await handleShopCheckout(w, input(session({ customer_details: { email: "stranger@x.com" } })));
  assertEquals(result, { attached: false, reason: "payer_not_owner" });
  assertEquals(w.synced.length, 0);
  assert(!w.calls.some((c) => c.startsWith("cancel:")), "the shop's own subscription is untouched");
  assert(w.calls.includes('update:sub_new:{"metadata":{"sellio_held":"payer_not_owner","sellio_shop":"shop-1"}}'));
  const alert = w.calls.find((c) => c.startsWith("alert:"))!;
  assert(alert.includes("stranger@x.com paid for Kopi Corner (growth_monthly) but isn't its owner (owner@shop.sg)"), alert);
  assert(alert.includes("sub_new"));
});

Deno.test("a shop that doesn't exist: held, admins told", async () => {
  const w = world({ check: { found: false }, subs: { sub_new: { id: "sub_new", status: "active" } } });
  const result = await handleShopCheckout(w, input());
  assertEquals(result, { attached: false, reason: "shop_not_found" });
  assert(w.calls.some((c) => c.startsWith("alert:billing_held:Owner@Shop.SG paid for growth_monthly from a link naming a shop that doesn't exist")));
  assertEquals(w.synced.length, 0);
});

Deno.test("the payer's email and phone and the customer go to the check", async () => {
  const w = world({ check: owner, subs: { sub_new: { id: "sub_new", status: "active" } } });
  await handleShopCheckout(w, input(session({ customer_details: { email: "a@b.c", phone: "+6591234567" } })));
  assert(w.calls.includes("check:a@b.c|+6591234567|cus_new"));
});

Deno.test("a second trial ends at once; the plan is charged and replaces the old one", async () => {
  const w = world({
    check: owner,
    existing: "sub_old",
    subs: { sub_new: { id: "sub_new", status: "trialing" }, sub_old: { id: "sub_old", status: "active" } },
    afterTrialEnd: { id: "sub_new", status: "active", metadata: { sellio_trial_ended: TRIAL_ENDED_MARK } },
  });
  const result = await handleShopCheckout(w, input());
  assertEquals(result, { attached: true, via: "email", trialEnded: true, status: "active", previous: "cancelled" });
  assert(w.calls.includes(
    'update:sub_new:{"trial_end":"now","metadata":{"sellio_trial_ended":"already_used"}}:{"idempotencyKey":"sellio-trial-end-sub_new"}',
  ));
  assertEquals(w.synced.map((s) => s.status), ["active"]);
});

Deno.test("a second trial ended here whose payment failed still replaces the old one", async () => {
  const w = world({
    check: owner,
    existing: "sub_old",
    subs: { sub_new: { id: "sub_new", status: "trialing" }, sub_old: { id: "sub_old", status: "active" } },
    afterTrialEnd: { id: "sub_new", status: "past_due", metadata: { sellio_trial_ended: TRIAL_ENDED_MARK } },
  });
  const result: any = await handleShopCheckout(w, input());
  assertEquals(result.previous, "cancelled");
  assertEquals(result.status, "past_due");
  assertEquals(w.synced.map((s) => s.status), ["past_due"]);
});

Deno.test("a shop that never had its trial keeps the trial", async () => {
  const w = world({
    check: { ...owner, hasUsedTrial: false },
    subs: { sub_new: { id: "sub_new", status: "trialing" } },
  });
  const result: any = await handleShopCheckout(w, input());
  assertEquals(result.trialEnded, false);
  assert(!w.calls.some((c) => c.includes("trial_end")));
  assertEquals(w.synced.map((s) => s.status), ["trialing"]);
});

Deno.test("a previous subscription that already ended is fine", async () => {
  const w = world({
    check: owner,
    existing: "sub_old",
    subs: { sub_new: { id: "sub_new", status: "active" }, sub_old: { id: "sub_old", status: "canceled" } },
  });
  const result: any = await handleShopCheckout(w, input());
  assertEquals(result.previous, "already_ended");
  assert(!w.calls.includes("cancel:sub_old"));
  assertEquals(w.synced.length, 1);
});

Deno.test("a previous subscription Stripe doesn't know is fine", async () => {
  const w = world({ check: owner, existing: "sub_gone", subs: { sub_new: { id: "sub_new", status: "active" } } });
  const result: any = await handleShopCheckout(w, input());
  assertEquals(result.previous, "not_found");
  assertEquals(w.synced.length, 1);
});

Deno.test("a previous subscription that ended while being cancelled is fine", async () => {
  const w = world({
    check: owner,
    existing: "sub_old",
    subs: { sub_new: { id: "sub_new", status: "active" }, sub_old: { id: "sub_old", status: "active" } },
    cancelError: { sub_old: new Error("This subscription is already canceled") },
    afterFailedCancel: { sub_old: { id: "sub_old", status: "canceled" } },
  });
  const result: any = await handleShopCheckout(w, input());
  assertEquals(result.previous, "already_ended");
  assertEquals(w.synced.length, 1);
});

Deno.test("a cancel that really failed fails the event (Stripe retries it)", async () => {
  const w = world({
    check: owner,
    existing: "sub_old",
    subs: { sub_new: { id: "sub_new", status: "active" }, sub_old: { id: "sub_old", status: "active" } },
    cancelError: { sub_old: new Error("Stripe is down") },
  });
  await rejects(() => handleShopCheckout(w, input()), /Stripe is down/);
  assertEquals(w.synced.length, 0);
});

Deno.test("a new subscription that isn't running doesn't end the old one", async () => {
  const w = world({
    check: owner,
    existing: "sub_old",
    subs: { sub_new: { id: "sub_new", status: "incomplete" }, sub_old: { id: "sub_old", status: "active" } },
  });
  const result: any = await handleShopCheckout(w, input());
  assertEquals(result.previous, null);
  assert(!w.calls.includes("cancel:sub_old"));
});

Deno.test("the check failing fails the event", async () => {
  const w = world({ checkError: "boom", subs: {} });
  await rejects(() => handleShopCheckout(w, input()), /Shop checkout check failed: boom/);
});
