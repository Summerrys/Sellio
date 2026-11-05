// Removing a shop for good (Alvin, 5 Nov 2026). In this order, so nothing is left behind:
// 1. its Stripe subscriptions end now (a removed shop is never charged again);
// 2. its files go through the Storage API (storage.objects rows can't be deleted with SQL);
// 3. shop_removal(id, false) deletes its rows in one transaction, and refuses while any of its
//    files remain. shop_removal(id, true) is the dry run: every change, reported, rolled back.
// Used by account-purge. Each step stops the removal if it fails, so it can simply be run again.

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
export type AdminClient = {
  rpc: Rpc;
  storage: { from: (bucket: string) => { remove: (paths: string[]) => PromiseLike<{ data: any; error: { message: string } | null }> } };
};
export type StripeClient = {
  subscriptions: {
    retrieve: (id: string) => Promise<{ id: string; status: string }>;
    cancel: (id: string, params?: Record<string, unknown>) => Promise<{ id: string; status: string }>;
  };
};

export type ShopFile = { bucket: string; name: string };

const FILE_BATCH = 100;

export async function previewShopRemoval(admin: AdminClient, tenantId: string) {
  const { data, error } = await admin.rpc("shop_removal", { p_tenant_id: tenantId, p_dry_run: true });
  if (error) throw new Error("shop_removal dry run failed: " + error.message);
  return data;
}

// Ended at once, without a refund or a final invoice. Already ended (or unknown to Stripe)
// counts as done.
export async function endShopSubscription(stripe: StripeClient, id: string) {
  try {
    const subscription = await stripe.subscriptions.retrieve(id);
    if (subscription.status === "canceled" || subscription.status === "incomplete_expired") {
      return { id, ok: true, action: "already_ended", status: subscription.status };
    }
    const cancelled = await stripe.subscriptions.cancel(id, {
      cancellation_details: { comment: "The shop was removed from Sellio." },
    });
    return { id, ok: true, action: "cancelled", was: subscription.status, status: cancelled.status };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e?.code === "resource_missing") return { id, ok: true, action: "not_found" };
    return { id, ok: false, error: String(e?.message ?? error).slice(0, 300) };
  }
}

export async function removeShopFiles(admin: AdminClient, files: ShopFile[]) {
  const byBucket = new Map<string, string[]>();
  for (const file of files) {
    if (!file?.bucket || !file?.name) continue;
    const names = byBucket.get(file.bucket) ?? [];
    names.push(file.name);
    byBucket.set(file.bucket, names);
  }
  let removed = 0;
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += FILE_BATCH) {
      const { data, error } = await admin.storage.from(bucket).remove(names.slice(i, i + FILE_BATCH));
      if (error) return { ok: false, listed: files.length, removed, error: `${bucket}: ${error.message}` };
      removed += Array.isArray(data) ? data.length : 0;
    }
  }
  return { ok: true, listed: files.length, removed };
}

export async function removeShop(admin: AdminClient, stripe: StripeClient, tenantId: string) {
  const plan = await previewShopRemoval(admin, tenantId);
  if (!plan?.found) return { ok: false, error: "NOT_FOUND", tenantId };

  const stripeResults = [];
  for (const id of (plan.subscriptions ?? []) as string[]) {
    stripeResults.push(await endShopSubscription(stripe, id));
  }
  if (stripeResults.some((result) => !result.ok)) {
    return { ok: false, error: "STRIPE", tenantId, stripe: stripeResults };
  }

  const files = await removeShopFiles(admin, (plan.files ?? []) as ShopFile[]);
  if (!files.ok) return { ok: false, error: "FILES", tenantId, stripe: stripeResults, files };

  const { data: removed, error } = await admin.rpc("shop_removal", { p_tenant_id: tenantId, p_dry_run: false });
  if (error) {
    return { ok: false, error: "ROWS", detail: error.message, tenantId, stripe: stripeResults, files };
  }
  return { ok: true, tenantId, name: plan.name, stripe: stripeResults, files, removed };
}
