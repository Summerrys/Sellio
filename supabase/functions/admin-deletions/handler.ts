// What Admin → Deletion requests can do (Alvin, 29 Nov 2026). index.ts checks the caller is one
// of Sellio's admins (am_i_sellio_admin, with their own session) before anything here runs.
//   { action: 'delete_now', requestId, confirmation: 'DELETE' }
//       The account, every shop it owns and those shops' staff logins go for good now, as with
//       "Start again" (account-removal.ts): Stripe subscriptions end, files, rows, the login.
//   { action: 'restore', requestId }
//       The account opens again (account_deletion_reinstate: shops reopen, staff and the login
//       are unlocked), then its shops' paid plans renew again in Stripe where they can
//       (account-restore.ts). One that can't is in the answer (needsAHand).
//   { action: 'remove_files', requestId }
//       A deleted account's files still in storage (removeLeftoverFiles).
// Each one is written to the request's admin_log. Answers: { ok: true, ... } or
// { ok: false, code: 'confirm' | 'not_pending' | 'not_found' | 'failed', detail? }.
import { removeAccount as removeAccountDefault, removeLeftoverFiles as removeLeftoverFilesDefault } from "../_shared/account-removal.ts";
import { renewAfterRestore as renewAfterRestoreDefault, renewalsNeedingAHand } from "../_shared/account-restore.ts";

export type Deps = {
  admin: any;
  stripe: () => any;
  adminEmail: string;
  removeAccount?: typeof removeAccountDefault;
  removeLeftoverFiles?: typeof removeLeftoverFilesDefault;
  renewAfterRestore?: typeof renewAfterRestoreDefault;
};

const ACTIONS = new Set(["delete_now", "restore", "remove_files"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function log(deps: Deps, requestId: string, action: string, result: Record<string, unknown>) {
  const { error } = await deps.admin.rpc("account_deletion_admin_log", {
    p_request_id: requestId,
    p_action: action,
    p_admin: deps.adminEmail,
    p_result: result,
  });
  if (error) console.error("admin-deletions: log failed", requestId, error.message);
}

export async function handleAdminDeletion(deps: Deps, body: Record<string, unknown>) {
  const action = String(body?.action ?? "");
  const requestId = String(body?.requestId ?? "").trim();
  if (!ACTIONS.has(action) || !UUID.test(requestId)) return { ok: false, code: "bad_request" };

  if (action === "delete_now") {
    if (body.confirmation !== "DELETE") return { ok: false, code: "confirm" };
    const result = await (deps.removeAccount ?? removeAccountDefault)(deps.admin, deps.stripe(), requestId);
    await log(deps, requestId, "delete_now", result as Record<string, unknown>);
    if (result.ok) return { ok: true, kind: "deleted" };
    if (result.error === "NOT_FOUND") return { ok: false, code: "not_found" };
    if (result.error === "NOT_PENDING") return { ok: false, code: "not_pending", status: (result as any).status };
    return { ok: false, code: "failed", detail: String(result.error) };
  }

  if (action === "restore") {
    const { data, error } = await deps.admin.rpc("account_deletion_reinstate", { p_request_id: requestId });
    if (error) {
      const message = String(error.message ?? "");
      if (/not found/i.test(message)) return { ok: false, code: "not_found" };
      if (/only a pending request|already been deleted/i.test(message)) return { ok: false, code: "not_pending" };
      throw new Error("account_deletion_reinstate failed: " + message);
    }
    const plans = Array.isArray(data?.stripe) ? data.stripe : [];
    let renewals: unknown[] = [];
    let needsAHand: string | null = null;
    if (plans.length > 0) {
      let stripe: any = null;
      try { stripe = deps.stripe(); } catch (err) { console.error("admin-deletions: no Stripe", (err as Error)?.message); }
      const done = await (deps.renewAfterRestore ?? renewAfterRestoreDefault)(stripe, requestId, plans);
      renewals = done;
      needsAHand = renewalsNeedingAHand(done);
    }
    await log(deps, requestId, "restore", { ok: true, renewals, needsAHand });
    return { ok: true, kind: "restored", needsAHand };
  }

  // remove_files
  const result = await (deps.removeLeftoverFiles ?? removeLeftoverFilesDefault)(deps.admin, requestId, false);
  await log(deps, requestId, "remove_files", result as Record<string, unknown>);
  if (result.ok) return { ok: true, kind: "files_removed", removed: (result as any).files?.removed ?? 0 };
  if (result.error === "NOT_FOUND") return { ok: false, code: "not_found" };
  if (result.error === "NOT_COMPLETED") return { ok: false, code: "not_pending" };
  return { ok: false, code: "failed", detail: String(result.error) };
}
