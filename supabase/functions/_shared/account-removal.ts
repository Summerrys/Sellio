// Deleting an account for good: "Start again" on the closed-account screen, or (later) when
// its six months (an owner) or 30 days are up. In this order, each step stopping it if it
// fails, so it can simply be run again:
// 1. every shop it owns goes (shop-removal.ts: its Stripe subscriptions end, its files, its
//    rows, its staff logins);
// 2. its own files go (chat photos it sent and those in its chats as a buyer, setup
//    leftovers, downloads);
// 3. account_removal_complete deletes the rest and the login in one transaction: its ratings,
//    chats as a buyer, notifications, memberships and profile. Orders it placed with other
//    shops stay in those shops' records, as the privacy page says.
import { type AdminClient, removeShop, removeShopFiles, type ShopFile, type StripeClient } from "./shop-removal.ts";

export async function removeAccount(admin: AdminClient, stripe: StripeClient, requestId: string) {
  const { data: plan, error } = await admin.rpc("account_removal_plan", { p_request_id: requestId });
  if (error) throw new Error("account_removal_plan failed: " + error.message);
  if (!plan?.found) return { ok: false, error: "NOT_FOUND", requestId };
  if (!["requested", "failed"].includes(plan.status) || !plan.accountExists) {
    return { ok: false, error: "NOT_PENDING", requestId, status: plan.status };
  }

  const shops: { tenantId: string; ok: boolean; error?: string }[] = [];
  for (const tenantId of (plan.shops ?? []) as string[]) {
    const result = await removeShop(admin, stripe, tenantId);
    shops.push({ tenantId, ok: result.ok, ...(result.ok ? {} : { error: result.error }) });
    if (!result.ok && result.error !== "NOT_FOUND") {
      return { ok: false, error: "SHOP", requestId, shops, shop: result };
    }
  }

  const files = await removeShopFiles(admin, (plan.files ?? []) as ShopFile[]);
  if (!files.ok) return { ok: false, error: "FILES", requestId, shops, files };

  const { data: done, error: completeError } = await admin.rpc("account_removal_complete", { p_request_id: requestId });
  if (completeError) {
    return { ok: false, error: "ROWS", detail: completeError.message, requestId, shops, files };
  }
  return { ok: true, requestId, shops, files, done };
}

// Files a deleted account left in storage (Admin → Deletion requests, "Remove files"; Alvin,
// 29 Nov 2026): those of its shops that no longer exist and its own once its login is gone
// (public.account_leftovers, for a completed request only). Removed through the Storage API,
// then counted again, so ok means none are left.
export async function removeLeftoverFiles(admin: AdminClient, requestId: string, dryRun = false) {
  const read = async () => {
    const { data, error } = await admin.rpc("account_leftovers", { p_request_id: requestId });
    if (error) throw new Error("account_leftovers failed: " + error.message);
    return data;
  };
  const plan = await read();
  if (!plan?.found) return { ok: false, error: "NOT_FOUND", requestId };
  if (plan.status !== "completed") return { ok: false, error: "NOT_COMPLETED", requestId, status: plan.status };
  const listed = (plan.files ?? []) as ShopFile[];
  if (dryRun) return { ok: true, dryRun: true, requestId, files: listed };
  const files = await removeShopFiles(admin, listed);
  if (!files.ok) return { ok: false, error: "FILES", requestId, files };
  const after = await read();
  const left = Array.isArray(after?.files) ? after.files.length : 0;
  return left === 0 ? { ok: true, requestId, files, left } : { ok: false, error: "FILES_LEFT", requestId, files, left };
}
