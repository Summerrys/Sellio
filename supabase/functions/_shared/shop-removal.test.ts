// deno test supabase/functions/_shared/shop-removal.test.ts
// (from the app root: DENO_NO_PACKAGE_JSON=1 deno test --no-config --node-modules-dir=none …)
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert/strict";
import { removeShop } from "./shop-removal.ts";

type Call = string;

function fakes(options: {
  plan: any;
  stripe?: Record<string, string | Error>;
  storageFailAt?: number;
  rowsError?: string;
}) {
  const calls: Call[] = [];
  let removeCalls = 0;
  const admin = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${fn}:${args.p_dry_run}`);
      if (args.p_dry_run === true) return Promise.resolve({ data: options.plan, error: null });
      if (options.rowsError) return Promise.resolve({ data: null, error: { message: options.rowsError } });
      return Promise.resolve({ data: { found: true, dryRun: false, deleted: { tenants: 1 } }, error: null });
    },
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          removeCalls++;
          calls.push(`remove:${bucket}:${paths.length}`);
          if (options.storageFailAt === removeCalls) return Promise.resolve({ data: null, error: { message: "boom" } });
          return Promise.resolve({ data: paths.map((name) => ({ name })), error: null });
        },
      }),
    },
  };
  const stripe = {
    subscriptions: {
      retrieve: (id: string) => {
        calls.push(`retrieve:${id}`);
        const status = options.stripe?.[id];
        if (status instanceof Error) return Promise.reject(status);
        return Promise.resolve({ id, status: status ?? "active" });
      },
      cancel: (id: string, params?: Record<string, unknown>) => {
        calls.push(`cancel:${id}:${JSON.stringify(params)}`);
        return Promise.resolve({ id, status: "canceled" });
      },
    },
  };
  return { admin, stripe, calls };
}

const files = [
  ...Array.from({ length: 150 }, (_, i) => ({ bucket: "product-images", name: `shop-1/products/${i}.jpg` })),
  { bucket: "chat-images", name: "user-a/1.webp" },
  { bucket: "chat-images", name: "user-b/2.jpg" },
];

Deno.test("a shop that isn't there: nothing is touched", async () => {
  const { admin, stripe, calls } = fakes({ plan: { found: false } });
  const result = await removeShop(admin, stripe, "shop-x");
  assertEquals(result, { ok: false, error: "NOT_FOUND", tenantId: "shop-x" });
  assertEquals(calls, ["rpc:shop_removal:true"]);
});

Deno.test("subscriptions end, then files go in batches, then the rows", async () => {
  const { admin, stripe, calls } = fakes({
    plan: { found: true, name: "Shop", subscriptions: ["sub_live", "sub_done"], files },
    stripe: { sub_live: "active", sub_done: "canceled" },
  });
  const result: any = await removeShop(admin, stripe, "shop-1");
  assert(result.ok);
  assertEquals(result.stripe.map((r: any) => r.action), ["cancelled", "already_ended"]);
  assertEquals(result.files, { ok: true, listed: 152, removed: 152 });
  assertEquals(calls, [
    "rpc:shop_removal:true",
    "retrieve:sub_live",
    'cancel:sub_live:{"cancellation_details":{"comment":"The shop was removed from Sellio."}}',
    "retrieve:sub_done",
    "remove:product-images:100",
    "remove:product-images:50",
    "remove:chat-images:2",
    "rpc:shop_removal:false",
  ]);
});

Deno.test("a subscription Stripe doesn't know counts as ended", async () => {
  const missing = Object.assign(new Error("No such subscription"), { code: "resource_missing" });
  const { admin, stripe } = fakes({ plan: { found: true, subscriptions: ["sub_gone"], files: [] }, stripe: { sub_gone: missing } });
  const result: any = await removeShop(admin, stripe, "shop-1");
  assert(result.ok);
  assertEquals(result.stripe[0].action, "not_found");
});

Deno.test("Stripe failing stops it before any file or row goes", async () => {
  const { admin, stripe, calls } = fakes({
    plan: { found: true, subscriptions: ["sub_live"], files },
    stripe: { sub_live: new Error("Stripe is down") },
  });
  const result: any = await removeShop(admin, stripe, "shop-1");
  assertEquals(result.error, "STRIPE");
  assert(!calls.some((c) => c.startsWith("remove:") || c === "rpc:shop_removal:false"));
});

Deno.test("a file batch failing stops it before the rows", async () => {
  const { admin, stripe, calls } = fakes({ plan: { found: true, subscriptions: [], files }, storageFailAt: 2 });
  const result: any = await removeShop(admin, stripe, "shop-1");
  assertEquals(result.error, "FILES");
  assertEquals(result.files.removed, 100);
  assert(!calls.includes("rpc:shop_removal:false"));
});

Deno.test("the rows refusing is reported", async () => {
  const { admin, stripe } = fakes({ plan: { found: true, subscriptions: [], files: [] }, rowsError: "The shop still has 1 files." });
  const result: any = await removeShop(admin, stripe, "shop-1");
  assertEquals(result.error, "ROWS");
  assertEquals(result.detail, "The shop still has 1 files.");
});
