// deno test supabase/functions/closed-account/handler.test.ts
// (from the app root: DENO_NO_PACKAGE_JSON=1 deno test --no-config --node-modules-dir=none …)
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert/strict";
import { handleClosedAccount } from "./handler.ts";
import { removeAccount } from "../_shared/account-removal.ts";

const OWNER_CLOSED = {
  kind: "owner", requestId: "11111111-2222-3333-4444-555555555555", requestedAt: "2026-11-05T09:00:00Z",
  deleteAfter: "2027-05-05T09:00:00Z", shops: ["Kopi Corner"], restoreRequestedAt: null,
};

function world(options: {
  gate?: any;
  check?: any;
  google?: any;
  link?: any;
  verify?: any;
  restore?: any;
  removal?: any;
} = {}) {
  const calls: string[] = [];
  const admin = {
    rpc: (fn: string, args: any) => {
      calls.push(`${fn}:${JSON.stringify(args)}`);
      const data: Record<string, any> = {
        phone_auth_begin: options.gate ?? { allowed: true, email: "owner@kopi.sg" },
        phone_auth_finish: null,
        closed_account_check: options.check ?? { passwordOk: true, locked: true, closed: OWNER_CLOSED },
        closed_account_by_google: options.google ?? { found: true, locked: true, closed: OWNER_CLOSED },
        closed_account_by_email_link: options.link ?? { found: true, locked: true, email: "owner@kopi.sg", userId: "u-1", closed: OWNER_CLOSED },
        account_restore_request: options.restore ?? { ok: true, alreadyAsked: false },
        alert_sellio_admins: 3,
      };
      return Promise.resolve({ data: data[fn], error: null });
    },
  };
  const removed: string[] = [];
  const deps = {
    admin,
    stripe: () => ({ stripe: true }),
    verifyGoogle: (token: string, nonce: string) => {
      calls.push(`verify:${token}:${nonce}`);
      return Promise.resolve(options.verify === undefined ? { sub: "g-1", email: "owner@gmail.com" } : options.verify);
    },
    removeAccount: (_admin: any, stripe: any, requestId: string) => {
      removed.push(requestId);
      assert(stripe.stripe);
      return Promise.resolve(options.removal ?? { ok: true });
    },
  } as any;
  return { deps, calls, removed };
}

const phone = { phone: "+6591234567", password: "right-password" };

Deno.test("status with the right password: what the screen shows, no request id", async () => {
  const w = world();
  const result = await handleClosedAccount(w.deps, { action: "status", ...phone }, "1.2.3.4");
  assertEquals(result, {
    status: 200,
    body: { ok: true, closed: { kind: "owner", deleteAfter: "2027-05-05T09:00:00Z", shops: ["Kopi Corner"], restoreAsked: false } },
  });
  assert(w.calls.includes('phone_auth_begin:{"p_action":"sign_in","p_phone":"+6591234567","p_ip":"1.2.3.4"}'));
  assert(w.calls.includes('closed_account_check:{"p_email":"owner@kopi.sg","p_password":"right-password"}'));
  assert(w.calls.includes('phone_auth_finish:{"p_phone":"+6591234567","p_ip":"1.2.3.4","p_outcome":"ok"}'));
});

Deno.test("a wrong password is just wrong, and counts as a wrong password", async () => {
  const w = world({ check: { passwordOk: false } });
  const result = await handleClosedAccount(w.deps, { action: "delete", confirmation: "DELETE", ...phone }, null);
  assertEquals(result.body, { ok: false, code: "invalid" });
  assert(w.calls.some((c) => c.startsWith("phone_auth_finish") && c.includes('"wrong"')));
  assertEquals(w.removed, []);
});

Deno.test("phone sign-in's limits apply", async () => {
  const w = world({ gate: { allowed: false, reason: "locked", retry_after: 900 } });
  const result = await handleClosedAccount(w.deps, { action: "status", ...phone }, null);
  assertEquals(result.body, { ok: false, code: "locked", retry_after_minutes: 15 });
  assert(!w.calls.some((c) => c.startsWith("closed_account_check")));
});

Deno.test("the right password on an account that isn't closed", async () => {
  const w = world({ check: { passwordOk: true, locked: false, closed: null } });
  assertEquals((await handleClosedAccount(w.deps, { action: "restore", ...phone }, null)).body, { ok: false, code: "not_closed" });
});

Deno.test("Keep my account asks the admins (through account_restore_request)", async () => {
  const w = world();
  const result = await handleClosedAccount(w.deps, { action: "restore", ...phone }, null);
  assertEquals(result.body, { ok: true, kind: "restore_asked", alreadyAsked: false });
  assert(w.calls.includes(`account_restore_request:{"p_request_id":"${OWNER_CLOSED.requestId}"}`));
});

Deno.test("Start again needs DELETE typed, then deletes the account", async () => {
  const w = world();
  assertEquals((await handleClosedAccount(w.deps, { action: "delete", ...phone }, null)).body, { ok: false, code: "confirm" });
  assertEquals(w.removed, []);
  assertEquals((await handleClosedAccount(w.deps, { action: "delete", confirmation: "DELETE", ...phone }, null)).body, { ok: true, kind: "deleted" });
  assertEquals(w.removed, [OWNER_CLOSED.requestId]);
});

Deno.test("a deletion that stops tells the admins and says it failed", async () => {
  const w = world({ removal: { ok: false, error: "STRIPE" } });
  const result = await handleClosedAccount(w.deps, { action: "delete", confirmation: "DELETE", ...phone }, null);
  assertEquals(result.body, { ok: false, code: "failed" });
  assert(w.calls.some((c) => c.startsWith("alert_sellio_admins") && c.includes("account_removal_failed")));
});

Deno.test("a staff login closed with its shop only sees it", async () => {
  const staff = { kind: "staff", deleteAfter: "2027-05-05T09:00:00Z", shops: ["Kopi Corner"] };
  const w = world({ check: { passwordOk: true, locked: true, closed: staff } });
  assertEquals((await handleClosedAccount(w.deps, { action: "status", ...phone }, null)).body.ok, true);
  assertEquals((await handleClosedAccount(w.deps, { action: "restore", ...phone }, null)).body.code, "staff");
  assertEquals((await handleClosedAccount(w.deps, { action: "delete", confirmation: "DELETE", ...phone }, null)).body.code, "staff");
  assertEquals(w.removed, []);
});

Deno.test("Google: the token and nonce are checked, then the login with that Google account", async () => {
  const w = world();
  const result = await handleClosedAccount(w.deps, { action: "status", googleIdToken: "tok", nonce: "raw" }, "1.2.3.4");
  assertEquals(result.body.ok, true);
  assert(w.calls.includes("verify:tok:raw"));
  assert(w.calls.includes('closed_account_by_google:{"p_google_sub":"g-1"}'));
  assert(w.calls.includes('phone_auth_begin:{"p_action":"sign_in","p_phone":null,"p_ip":"1.2.3.4"}'), "Network limit only");
  const bad = world({ verify: null });
  assertEquals((await handleClosedAccount(bad.deps, { action: "status", googleIdToken: "tok", nonce: "raw" }, null)).body, { ok: false, code: "invalid" });
});

const HASH = "0a".repeat(28);
const link = { emailTokenHash: HASH, emailLinkType: "magiclink" };

Deno.test("an emailed link: its token is checked under the network limit; the screen gets the email", async () => {
  const w = world();
  const result = await handleClosedAccount(w.deps, { action: "status", ...link }, "1.2.3.4");
  assertEquals(result, {
    status: 200,
    body: {
      ok: true,
      closed: { kind: "owner", deleteAfter: "2027-05-05T09:00:00Z", shops: ["Kopi Corner"], restoreAsked: false },
      email: "owner@kopi.sg",
    },
  });
  assert(w.calls.includes('phone_auth_begin:{"p_action":"sign_in","p_phone":null,"p_ip":"1.2.3.4"}'), "Network limit only");
  assert(w.calls.includes(`closed_account_by_email_link:{"p_token_hash":"${HASH}","p_type":"magiclink"}`));
  assert(w.calls.includes('phone_auth_finish:{"p_phone":null,"p_ip":"1.2.3.4","p_outcome":"ok"}'));
  assert(!w.calls.some((c) => c.startsWith("closed_account_check") || c.startsWith("verify:")));
});

Deno.test("an emailed link that matches nothing is a failed attempt, and says so", async () => {
  const w = world({ link: { found: false } });
  const result = await handleClosedAccount(w.deps, { action: "delete", confirmation: "DELETE", ...link }, "1.2.3.4");
  assertEquals(result.body, { ok: false, code: "link_invalid" });
  assert(w.calls.includes('phone_auth_finish:{"p_phone":null,"p_ip":"1.2.3.4","p_outcome":"wrong"}'));
  assertEquals(w.removed, []);
});

Deno.test("an emailed link: the network limit, an open account, and the choices", async () => {
  const limited = world({ gate: { allowed: false, reason: "too_many", retry_after: 600 } });
  assertEquals((await handleClosedAccount(limited.deps, { action: "status", ...link }, "1.2.3.4")).body,
    { ok: false, code: "too_many", retry_after_minutes: 10 });
  assert(!limited.calls.some((c) => c.startsWith("closed_account_by_email_link")));

  const open = world({ link: { found: true, locked: false } });
  assertEquals((await handleClosedAccount(open.deps, { action: "status", ...link }, null)).body, { ok: false, code: "not_closed" });

  const w = world();
  assertEquals((await handleClosedAccount(w.deps, { action: "restore", ...link }, null)).body, { ok: true, kind: "restore_asked", alreadyAsked: false });
  assertEquals((await handleClosedAccount(w.deps, { action: "delete", ...link }, null)).body, { ok: false, code: "confirm" });
  assertEquals((await handleClosedAccount(w.deps, { action: "delete", confirmation: "DELETE", ...link }, null)).body, { ok: true, kind: "deleted" });
  assertEquals(w.removed, [OWNER_CLOSED.requestId]);
});

Deno.test("a phone number sent with a link is ignored: the link is the proof", async () => {
  const w = world();
  await handleClosedAccount(w.deps, { action: "status", ...link, ...phone }, null);
  assert(w.calls.includes('phone_auth_begin:{"p_action":"sign_in","p_phone":null,"p_ip":null}'));
  assert(!w.calls.some((c) => c.startsWith("closed_account_check")));
});

Deno.test("an unknown action is refused before anything else", async () => {
  const w = world();
  assertEquals((await handleClosedAccount(w.deps, { action: "drop_tables", ...phone }, null)).status, 400);
  assertEquals(w.calls, []);
});

// account-removal.ts: the shops, then the files, then the rest; each failure stops it.
function removalWorld(plan: any, options: { shopFails?: string; filesFail?: boolean; completeError?: string } = {}) {
  const calls: string[] = [];
  const admin = {
    rpc: (fn: string, args: any) => {
      calls.push(`${fn}:${JSON.stringify(args)}`);
      if (fn === "account_removal_plan") return Promise.resolve({ data: plan, error: null });
      if (fn === "shop_removal") {
        if (args.p_dry_run) {
          return Promise.resolve({ data: { found: true, name: args.p_tenant_id, subscriptions: [], files: [] }, error: null });
        }
        if (options.shopFails === args.p_tenant_id) return Promise.resolve({ data: null, error: { message: "boom" } });
        return Promise.resolve({ data: { found: true, deleted: {} }, error: null });
      }
      if (fn === "account_removal_complete") {
        if (options.completeError) return Promise.resolve({ data: null, error: { message: options.completeError } });
        return Promise.resolve({ data: { status: "completed" }, error: null });
      }
      throw new Error("unexpected " + fn);
    },
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          calls.push(`remove:${bucket}:${paths.length}`);
          if (options.filesFail) return Promise.resolve({ data: null, error: { message: "nope" } });
          return Promise.resolve({ data: paths.map((name) => ({ name })), error: null });
        },
      }),
    },
  };
  const stripe = { subscriptions: { retrieve: () => Promise.reject(new Error("unused")), cancel: () => Promise.reject(new Error("unused")) } };
  return { admin, stripe, calls };
}

const plan = (overrides: any = {}) => ({
  found: true, status: "requested", accountExists: true, shops: ["shop-a", "shop-b"],
  files: [{ bucket: "chat-images", name: "u1/a.jpg" }], ...overrides,
});

Deno.test("removing an account: its shops, then its files, then the rest", async () => {
  const w = removalWorld(plan());
  const result: any = await removeAccount(w.admin as any, w.stripe as any, "req-1");
  assert(result.ok);
  const order = w.calls.map((c) => c.replace(/:.*$/, "") + (c.includes('"p_dry_run":false') ? "(real)" : ""));
  assertEquals(order, [
    "account_removal_plan", "shop_removal", "shop_removal(real)", "shop_removal", "shop_removal(real)",
    "remove", "account_removal_complete",
  ]);
});

Deno.test("removing an account stops at a shop that fails, before its own files and rows", async () => {
  const w = removalWorld(plan(), { shopFails: "shop-a" });
  const result: any = await removeAccount(w.admin as any, w.stripe as any, "req-1");
  assertEquals(result.error, "SHOP");
  assert(!w.calls.some((c) => c.startsWith("remove:") || c.startsWith("account_removal_complete")));
});

Deno.test("removing an account stops when its files can't go, before its rows", async () => {
  const w = removalWorld(plan({ shops: [] }), { filesFail: true });
  const result: any = await removeAccount(w.admin as any, w.stripe as any, "req-1");
  assertEquals(result.error, "FILES");
  assert(!w.calls.some((c) => c.startsWith("account_removal_complete")));
});

Deno.test("removing an account only when its deletion is pending", async () => {
  for (const p of [plan({ status: "completed" }), plan({ status: "reinstated" }), plan({ accountExists: false })]) {
    const w = removalWorld(p);
    assertEquals(((await removeAccount(w.admin as any, w.stripe as any, "req-1")) as any).error, "NOT_PENDING");
    assertEquals(w.calls.length, 1);
  }
  const missing = removalWorld({ found: false });
  assertEquals(((await removeAccount(missing.admin as any, missing.stripe as any, "req-1")) as any).error, "NOT_FOUND");
});

Deno.test("the database refusing the last step is reported", async () => {
  const w = removalWorld(plan({ shops: [] }), { completeError: "Remove the account's 1 file(s) first." });
  const result: any = await removeAccount(w.admin as any, w.stripe as any, "req-1");
  assertEquals(result.error, "ROWS");
  assertEquals(result.detail, "Remove the account's 1 file(s) first.");
});
