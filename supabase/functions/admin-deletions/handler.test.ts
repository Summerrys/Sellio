// deno test supabase/functions/admin-deletions/handler.test.ts
// (from the app root: DENO_NO_PACKAGE_JSON=1 deno test --no-config --node-modules-dir=none …)
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert/strict";
import { handleAdminDeletion } from "./handler.ts";
import { removeLeftoverFiles } from "../_shared/account-removal.ts";

const ID = "11111111-2222-3333-4444-555555555555";

function world(options: { reinstate?: any; reinstateError?: string; leftovers?: any[]; leftoversAfter?: any[]; status?: string } = {}) {
  const calls: { fn: string; args: any }[] = [];
  let leftoverReads = 0;
  const removed: string[] = [];
  const admin = {
    rpc: (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fn === "account_deletion_reinstate") {
        return Promise.resolve(options.reinstateError
          ? { data: null, error: { message: options.reinstateError } }
          : { data: options.reinstate ?? { email: "a@b.c", stripe: [] }, error: null });
      }
      if (fn === "account_leftovers") {
        leftoverReads += 1;
        const files = leftoverReads === 1 ? (options.leftovers ?? []) : (options.leftoversAfter ?? []);
        return Promise.resolve({ data: { found: true, status: options.status ?? "completed", files }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          removed.push(...paths.map((p) => `${bucket}/${p}`));
          return Promise.resolve({ data: paths.map((name) => ({ name })), error: null });
        },
      }),
    },
  };
  return { admin, calls, removed };
}

const logs = (calls: { fn: string; args: any }[]) => calls.filter((c) => c.fn === "account_deletion_admin_log");

Deno.test("refuses anything but the three actions and a request id", async () => {
  const { admin } = world();
  assertEquals(await handleAdminDeletion({ admin, stripe: () => ({}), adminEmail: "x@y.z" }, { action: "drop", requestId: ID }), { ok: false, code: "bad_request" });
  assertEquals(await handleAdminDeletion({ admin, stripe: () => ({}), adminEmail: "x@y.z" }, { action: "restore", requestId: "nope" }), { ok: false, code: "bad_request" });
});

Deno.test("Delete now needs DELETE typed, then removes the account and logs who did it", async () => {
  const { admin, calls } = world();
  let removedFor = "";
  const removeAccount = async (_a: any, _s: any, id: string) => { removedFor = id; return { ok: true, requestId: id } as any; };
  assertEquals(await handleAdminDeletion({ admin, stripe: () => ({}), adminEmail: "Admin@x.y", removeAccount }, { action: "delete_now", requestId: ID }), { ok: false, code: "confirm" });
  assertEquals(removedFor, "");
  assertEquals(await handleAdminDeletion({ admin, stripe: () => ({}), adminEmail: "Admin@x.y", removeAccount }, { action: "delete_now", requestId: ID, confirmation: "DELETE" }), { ok: true, kind: "deleted" });
  assertEquals(removedFor, ID);
  assertEquals(logs(calls).length, 1);
  assertEquals(logs(calls)[0].args.p_action, "delete_now");
  assertEquals(logs(calls)[0].args.p_admin, "Admin@x.y");
});

Deno.test("Delete now on a request that's no longer waiting says so", async () => {
  const { admin } = world();
  const removeAccount = async () => ({ ok: false, error: "NOT_PENDING", status: "reinstated" }) as any;
  assertEquals(await handleAdminDeletion({ admin, stripe: () => ({}), adminEmail: "a@b.c", removeAccount }, { action: "delete_now", requestId: ID, confirmation: "DELETE" }), { ok: false, code: "not_pending", status: "reinstated" });
});

Deno.test("Restore reopens the account and renews its plan; a plan that can't renew is reported", async () => {
  const { admin, calls } = world({ reinstate: { email: "a@b.c", stripe: [{ id: "sub_1", ok: true, action: "stops_renewing" }] } });
  let renewedWith: any = null;
  const renewAfterRestore = async (_s: any, id: string, plans: any) => { renewedWith = { id, plans }; return [{ id: "sub_1", result: "ended" }] as any; };
  const answer = await handleAdminDeletion({ admin, stripe: () => ({}), adminEmail: "a@b.c", renewAfterRestore }, { action: "restore", requestId: ID });
  assertEquals(answer.ok, true);
  assertEquals((answer as any).kind, "restored");
  assert((answer as any).needsAHand, "an ended plan needs a hand");
  assertEquals(renewedWith.id, ID);
  assertEquals(calls.some((c) => c.fn === "account_restore_now"), false); // no "chose Keep my account" alert
  assertEquals(logs(calls)[0].args.p_action, "restore");
});

Deno.test("Restore of a request that isn't pending says so", async () => {
  const { admin } = world({ reinstateError: "Only a pending request can be reinstated (this one is completed)." });
  assertEquals(await handleAdminDeletion({ admin, stripe: () => ({}), adminEmail: "a@b.c" }, { action: "restore", requestId: ID }), { ok: false, code: "not_pending" });
});

Deno.test("Remove files removes what a deleted account left, and checks none are left", async () => {
  const { admin, removed, calls } = world({ leftovers: [{ bucket: "product-images", name: "t1/a.jpg" }, { bucket: "product-images", name: "t1/b.jpg" }] });
  assertEquals(await handleAdminDeletion({ admin, stripe: () => ({}), adminEmail: "a@b.c" }, { action: "remove_files", requestId: ID }), { ok: true, kind: "files_removed", removed: 2 });
  assertEquals(removed, ["product-images/t1/a.jpg", "product-images/t1/b.jpg"]);
  assertEquals(logs(calls)[0].args.p_action, "remove_files");
});

Deno.test("Remove files reports files still there afterwards, and refuses a request still waiting", async () => {
  const stuck = world({ leftovers: [{ bucket: "b", name: "x" }], leftoversAfter: [{ bucket: "b", name: "x" }] });
  assertEquals((await removeLeftoverFiles(stuck.admin as any, ID)).error, "FILES_LEFT");
  const waiting = world({ status: "requested", leftovers: [{ bucket: "b", name: "x" }] });
  assertEquals(await handleAdminDeletion({ admin: waiting.admin, stripe: () => ({}), adminEmail: "a@b.c" }, { action: "remove_files", requestId: ID }), { ok: false, code: "not_pending" });
  assertEquals(waiting.removed, []);
});
