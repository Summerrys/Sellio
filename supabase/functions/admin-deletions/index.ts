// admin-deletions: the server behind Admin → Deletion requests (/admin/deletions; Alvin,
// 29 Nov 2026). Only Sellio's admins: the caller's own session must pass am_i_sellio_admin
// (app.sellio_admin_emails) before anything happens; then the service role does the work.
// POST { action: 'delete_now' | 'restore' | 'remove_files', requestId, confirmation? }
// (handler.ts says what each does). 401 without a session, 403 for anyone else.
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import Stripe from "npm:stripe@22.5.0";
import { handleAdminDeletion } from "./handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ ok: false, code: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) return respond({ ok: false, code: "unavailable" }, 500);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return respond({ ok: false, code: "auth_required" }, 401);
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: who, error: whoError } = await asCaller.auth.getUser(token);
  if (whoError || !who?.user) return respond({ ok: false, code: "auth_required" }, 401);
  const { data: isAdmin, error: adminError } = await asCaller.rpc("am_i_sellio_admin");
  if (adminError) return respond({ ok: false, code: "unavailable" }, 500);
  if (isAdmin !== true) return respond({ ok: false, code: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respond({ ok: false, code: "bad_request" }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const stripe = () => {
    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    return new Stripe(key, { apiVersion: "2026-06-24.dahlia" as any });
  };
  try {
    const result = await handleAdminDeletion({ admin, stripe, adminEmail: String(who.user.email ?? "") }, body);
    console.log("admin-deletions", String(body?.action ?? ""), String(body?.requestId ?? ""), result.ok ? "ok" : (result as any).code);
    return respond(result, (result as any).code === "bad_request" ? 400 : 200);
  } catch (error) {
    console.error("admin-deletions error", String((error as Error)?.message ?? error).slice(0, 500));
    return respond({ ok: false, code: "failed" }, 500);
  }
});
