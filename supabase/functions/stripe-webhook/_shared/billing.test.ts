// deno test supabase/functions/stripe-webhook/_shared/billing.test.ts
// (from the app root: DENO_NO_PACKAGE_JSON=1 deno test -A --no-config --node-modules-dir=none …)
import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { computeGracePeriod, hasBeenPaid } from "./billing.ts";

const FAILED_AT = Date.UTC(2026, 10, 15, 19, 31, 0);
const DAY_MS = 86_400_000;

Deno.test("computeGracePeriod: never paid → none", () => {
  assertEquals(computeGracePeriod({ status: "past_due", anchorMs: FAILED_AT, existingGrace: null, everPaid: false }), null);
  // An end the old rule gave isn't carried on (the database keeps what it has when given null).
  assertEquals(computeGracePeriod({ status: "past_due", anchorMs: FAILED_AT, existingGrace: "2026-11-21T18:31:30+00:00", everPaid: false }), null);
});

Deno.test("computeGracePeriod: paid before → 3 days from the first failure, never moved", () => {
  assertEquals(
    computeGracePeriod({ status: "past_due", anchorMs: FAILED_AT, existingGrace: null, everPaid: true }),
    new Date(FAILED_AT + 3 * DAY_MS).toISOString(),
  );
  assertEquals(
    computeGracePeriod({ status: "past_due", anchorMs: FAILED_AT + 2 * DAY_MS, existingGrace: "2026-11-18T19:31:00Z", everPaid: true }),
    "2026-11-18T19:31:00.000Z",
  );
});

Deno.test("computeGracePeriod: not past due → none", () => {
  for (const status of ["trial", "active", "suspended", "cancelled"]) {
    assertEquals(computeGracePeriod({ status, anchorMs: FAILED_AT, existingGrace: "2026-11-18T19:31:00Z", everPaid: true }), null);
  }
});

function fakeStripe(pages: { amount_paid: number }[][]) {
  const asked: Record<string, unknown>[] = [];
  let page = 0;
  return {
    asked,
    invoices: {
      list: (params: Record<string, unknown>) => {
        asked.push(params);
        const data = (pages[page] ?? []).map((invoice, i) => ({ id: `in_${page}_${i}`, ...invoice }));
        page++;
        return Promise.resolve({ object: "list", data, has_more: page < pages.length });
      },
    },
  };
}

Deno.test("hasBeenPaid: only a paid invoice above zero counts", async () => {
  assertEquals(await hasBeenPaid(fakeStripe([[]]), "sub_1"), false);
  assertEquals(await hasBeenPaid(fakeStripe([[{ amount_paid: 0 }]]), "sub_1"), false);
  assertEquals(await hasBeenPaid(fakeStripe([[{ amount_paid: 0 }, { amount_paid: 3900 }]]), "sub_1"), true);
  assertEquals(await hasBeenPaid(fakeStripe([[{ amount_paid: 3900 }]]), null), false);

  const stripe = fakeStripe([[{ amount_paid: 0 }], [{ amount_paid: 1800 }]]);
  assertEquals(await hasBeenPaid(stripe, "sub_1"), true);
  assertEquals(stripe.asked, [
    { subscription: "sub_1", status: "paid", limit: 100 },
    { subscription: "sub_1", status: "paid", limit: 100, starting_after: "in_0_0" },
  ]);
});
