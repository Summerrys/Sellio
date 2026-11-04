// delete-account — v5 (Alvin, 5 Nov 2026). Deploy with verify_jwt: true.
//
// Account deletion on request, from inside the app or on sellio.sg/delete-account.
//   POST { confirmation: 'DELETE', reason?: string }   (signed in)
//   -> 200 { requestId, status: 'requested', deleteAfter, shops: [names], alreadyRequested }
//   -> 400 { code: 'CONFIRMATION_REQUIRED' } | 401 { code: 'AUTH_REQUIRED' | 'REAUTH_REQUIRED' }
//   -> 403 { code: 'ADMIN_ACCOUNT' } | 500 { code: 'FAILED' }
//
// public.account_deletion_request (supabase/migrations/20261105023000_account_deletion_requests.sql)
// does the rest at once: closes the person's shops, suspends them and their staff, locks their
// sign-in and signs them out everywhere, records the request (deleted after 6 months for an
// owner, 30 days otherwise) and alerts Sellio's admins. Here, their shops' Stripe subscriptions
// are then stopped, as Stripe has them now:
//   - active or on trial: they stop renewing (cancel_at_period_end). No refund: the paid period
//     simply runs out, and until it does Sellio can turn renewal back on if it reinstates them.
//   - payment overdue (past_due, unpaid, incomplete, paused): cancelled now, which also stops
//     Stripe retrying the unpaid invoice, so no one is charged for a period they can't use.
//   - already ended: nothing to do.
// A subscription that can't be stopped alerts the admins to do it by hand
// (public.account_deletion_stripe_result).
// v4 (switched off, 3 Oct 2026) answered every request with "email us"; v2 deleted at once.
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import Stripe from "npm:stripe@22.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Content-Type": "application/json",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const SUPPORT = "Please try again, or email sellio@apptelier.sg.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed", code: "METHOD" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    console.error("delete-account: Supabase configuration is missing");
    return json({ error: `Your request could not be saved. ${SUPPORT}`, code: "FAILED" }, 500);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return json({ error: "Sign in to request deletion.", code: "AUTH_REQUIRED" }, 401);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* checked below */ }
  if (body?.confirmation !== "DELETE") {
    return json({ error: "Type DELETE to confirm.", code: "CONFIRMATION_REQUIRED" }, 400);
  }
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 1000) || null : null;

  // Who is asking: their own signed-in session, checked with Supabase Auth.
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return json({ error: "Sign in again to request deletion.", code: "REAUTH_REQUIRED" }, 401);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: result, error } = await admin.rpc("account_deletion_request", {
    p_auth_user_id: userId,
    p_reason: reason,
  });
  if (error || !result) {
    console.error("delete-account: account_deletion_request failed", error?.code, error?.message);
    return json({ error: `Your request could not be saved. ${SUPPORT}`, code: "FAILED" }, 500);
  }
  if (result.status === "refused") {
    return json({ error: "Sellio's own admin accounts can't be deleted here.", code: "ADMIN_ACCOUNT" }, 403);
  }

  // Their shops' subscriptions stop.
  const subscriptions: Array<{ tenantId: string; stripeSubscriptionId: string }> =
    Array.isArray(result.subscriptions) ? result.subscriptions : [];
  if (subscriptions.length > 0) {
    const key = Deno.env.get("STRIPE_SECRET_KEY");
    const stripe = key ? new Stripe(key, { apiVersion: "2026-06-24.dahlia" as any }) : null;
    const outcome: Array<Record<string, unknown>> = [];
    for (const sub of subscriptions) {
      const entry = { id: sub.stripeSubscriptionId, tenantId: sub.tenantId };
      try {
        if (!stripe) throw new Error("STRIPE_SECRET_KEY is not configured");
        const current = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        if (current.status === "canceled" || current.status === "incomplete_expired") {
          outcome.push({ ...entry, ok: true, action: "already_ended", stripeStatus: current.status });
        } else if (current.status === "active" || current.status === "trialing") {
          const updated = current.cancel_at_period_end ? current : await stripe.subscriptions.update(sub.stripeSubscriptionId, {
            cancel_at_period_end: true,
            metadata: { sellio_deletion_request: String(result.requestId) },
          });
          outcome.push({ ...entry, ok: true, action: "stops_renewing", stripeStatus: updated.status, cancelAt: updated.cancel_at ?? null });
        } else {
          // past_due, unpaid, incomplete or paused: nothing paid for this period.
          const cancelled = await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
          outcome.push({ ...entry, ok: true, action: "cancelled_now", stripeStatus: cancelled.status, was: current.status });
        }
      } catch (err) {
        console.error("delete-account: Stripe subscription not stopped", sub.stripeSubscriptionId, (err as Error)?.message);
        outcome.push({ ...entry, ok: false, error: String((err as Error)?.message ?? err).slice(0, 300) });
      }
    }
    const { error: noteError } = await admin.rpc("account_deletion_stripe_result", {
      p_request_id: result.requestId,
      p_result: outcome,
    });
    if (noteError) console.error("delete-account: account_deletion_stripe_result failed", noteError.message);
  }

  return json({
    requestId: result.requestId,
    status: "requested",
    deleteAfter: result.deleteAfter,
    shops: Array.isArray(result.shops) ? result.shops : [],
    alreadyRequested: Boolean(result.alreadyRequested),
  });
});
