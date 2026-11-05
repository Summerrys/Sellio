// deno test supabase/functions/_shared/account-restore.test.ts
// (from the app root: DENO_NO_PACKAGE_JSON=1 deno test --no-config --node-modules-dir=none …)
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert/strict";
import { renewAfterRestore, renewalsNeedingAHand } from "./account-restore.ts";

const REQUEST = "11111111-2222-3333-4444-555555555555";

function fakeStripe(subs: Record<string, any>, failOn: string[] = []) {
  const updates: Array<[string, any]> = [];
  return {
    updates,
    stripe: {
      subscriptions: {
        retrieve: (id: string) => failOn.includes(id) ? Promise.reject(new Error("Stripe is down")) : Promise.resolve(subs[id]),
        update: (id: string, params: any) => { updates.push([id, params]); return Promise.resolve({ ...subs[id], ...params }); },
      },
    },
  };
}

Deno.test("a plan delete-account set to end renews again; its Sellio note is cleared", async () => {
  const f = fakeStripe({ sub_a: { status: "active", cancel_at_period_end: true, metadata: { sellio_deletion_request: REQUEST } } });
  const renewals = await renewAfterRestore(f.stripe, REQUEST, [{ id: "sub_a", tenantId: "t1", ok: true, action: "stops_renewing" }]);
  assertEquals(renewals, [{ id: "sub_a", tenantId: "t1", result: "renews_again" }]);
  assertEquals(f.updates, [["sub_a", { cancel_at_period_end: false, metadata: { sellio_deletion_request: "" } }]]);
  assertEquals(renewalsNeedingAHand(renewals), null);
});

Deno.test("a trial set to end by delete-account renews again too", async () => {
  const f = fakeStripe({ sub_t: { status: "trialing", cancel_at_period_end: true, metadata: { sellio_deletion_request: REQUEST } } });
  const renewals = await renewAfterRestore(f.stripe, REQUEST, [{ id: "sub_t", ok: true, action: "stops_renewing" }]);
  assertEquals(renewals[0].result, "renews_again");
  assertEquals(f.updates.length, 1);
});

Deno.test("an owner's own decision to end the plan is left alone", async () => {
  const f = fakeStripe({ sub_o: { status: "active", cancel_at_period_end: true, metadata: {} } });
  const renewals = await renewAfterRestore(f.stripe, REQUEST, [{ id: "sub_o", ok: true, action: "stops_renewing" }]);
  assertEquals(renewals[0].result, "left_as_is");
  assertEquals(f.updates, []);
});

Deno.test("an ended plan can't be resumed and is reported; a renewing one needs nothing", async () => {
  const f = fakeStripe({
    sub_c: { status: "canceled", cancel_at_period_end: false, metadata: {} },
    sub_r: { status: "active", cancel_at_period_end: false, metadata: {} },
  });
  const renewals = await renewAfterRestore(f.stripe, REQUEST, [
    { id: "sub_c", ok: true, action: "cancelled_now" },
    { id: "sub_r", ok: false, error: "timeout" },
    { id: "sub_r", ok: true, action: "stops_renewing" },
    { ok: true, action: "already_ended" },
  ]);
  assertEquals(renewals.map((r) => r.result), ["ended", "renews_again"]);
  assertEquals(f.updates, []);
  assert(/sub_c has ended, so the owner needs to choose a plan again \(cancelled when the deletion was asked for/.test(renewalsNeedingAHand(renewals) ?? ""));
});

Deno.test("Stripe failing, or no Stripe key, is reported to be done by hand", async () => {
  const f = fakeStripe({}, ["sub_x"]);
  const failed = await renewAfterRestore(f.stripe, REQUEST, [{ id: "sub_x", ok: true, action: "stops_renewing" }]);
  assertEquals(failed, [{ id: "sub_x", result: "failed", detail: "Stripe is down" }]);
  const noKey = await renewAfterRestore(null, REQUEST, [{ id: "sub_y", ok: true, action: "stops_renewing" }]);
  assertEquals(noKey[0].result, "failed");
  assert(/do it in Stripe/.test(renewalsNeedingAHand(noKey) ?? ""));
  assertEquals(await renewAfterRestore(null, REQUEST, null), []);
});
