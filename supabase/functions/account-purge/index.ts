// Sellio's own removals, run from the database (Alvin, 5 Nov 2026). Not for the apps: the
// caller must send the x-sellio-purge header, whose value is only in Vault (sellio_purge_hook),
// so only SQL run by Sellio's admins can call it, through pg_net.
//   {"action":"remove_shop","tenantId":"…"}                 dry run: what would go (default)
//   {"action":"remove_shop","tenantId":"…","dryRun":false}  ends its Stripe subscriptions,
//                                                           removes its files, deletes its rows
//   {"action":"remove_account","requestId":"…"}             dry run: the closed account's shops
//                                                           and files (default)
//   {"action":"remove_account","requestId":"…","dryRun":false}  deletes the closed account for
//                                                           good, with its shops (account-removal)
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import Stripe from "npm:stripe@22.5.0";
import { removeAccount } from "../_shared/account-removal.ts";
import { previewShopRemoval, removeShop } from "../_shared/shop-removal.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "METHOD" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!url || !serviceKey || !stripeKey) return json({ error: "CONFIG" }, 500);

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: valid, error: hookError } = await admin.rpc("purge_hook_valid", {
    p_secret: req.headers.get("x-sellio-purge") ?? "",
  });
  if (hookError) return json({ error: "FAILED" }, 500);
  if (valid !== true) return json({ error: "FORBIDDEN" }, 403);

  let body: { action?: unknown; tenantId?: unknown; requestId?: unknown; dryRun?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_REQUEST" }, 400);
  }

  if (body?.action === "remove_account") {
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json({ error: "BAD_REQUEST" }, 400);
    try {
      if (body.dryRun !== false) {
        const { data: plan, error } = await admin.rpc("account_removal_plan", { p_request_id: requestId });
        if (error) throw new Error("account_removal_plan failed: " + error.message);
        return json({ ok: Boolean(plan?.found), dryRun: true, plan }, plan?.found ? 200 : 404);
      }
      const stripe = new Stripe(stripeKey, { apiVersion: "2026-06-24.dahlia" as any });
      const result = await removeAccount(admin, stripe as any, requestId);
      console.log("account-purge remove_account", requestId, result.ok ? "done" : result.error);
      return json(result, result.ok ? 200 : result.error === "NOT_FOUND" ? 404 : 409);
    } catch (error) {
      const message = String((error as Error)?.message ?? error).slice(0, 500);
      console.error("account-purge failed", requestId, message);
      return json({ ok: false, error: "FAILED", detail: message }, 500);
    }
  }

  const tenantId = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";
  if (body?.action !== "remove_shop" || !tenantId) return json({ error: "BAD_REQUEST" }, 400);

  try {
    if (body.dryRun !== false) {
      const plan = await previewShopRemoval(admin, tenantId);
      return json({ ok: Boolean(plan?.found), dryRun: true, plan }, plan?.found ? 200 : 404);
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2026-06-24.dahlia" as any });
    const result = await removeShop(admin, stripe as any, tenantId);
    console.log("account-purge remove_shop", tenantId, result.ok ? "done" : result.error);
    return json(result, result.ok ? 200 : result.error === "NOT_FOUND" ? 404 : 409);
  } catch (error) {
    const message = String((error as Error)?.message ?? error).slice(0, 500);
    console.error("account-purge failed", tenantId, message);
    return json({ ok: false, error: "FAILED", detail: message }, 500);
  }
});
