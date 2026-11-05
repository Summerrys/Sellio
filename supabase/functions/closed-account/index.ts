// closed-account: the server behind the closed-account screen (Alvin, 5 Nov 2026). Someone
// whose account is closed (its deletion is pending, so its login is locked) proves it's them
// and chooses what happens:
//   { action: 'status' }                           -> { ok: true, closed, email? }
//     (email: only for an emailed sign-in link, so the screen can sign them up again)
//   { action: 'restore' }   Keep my account        -> { ok: true, kind: 'restored' }
//     It opens again straight away (account_restore_now: the shop reopens, its staff and the
//     login are unlocked; Sellio's admins are told), and the shop's paid plan renews again in
//     Stripe (account-restore.ts); a plan that can't is reported to the admins.
//   { action: 'delete', confirmation: 'DELETE' }   -> { ok: true, kind: 'deleted' }
//     Start again: the account, any shop it owns and that shop's staff logins are deleted now,
//     for good (account-removal.ts), so its phone number or email can sign up again.
//   Refusals: { ok: false, code: 'invalid' | 'link_invalid' | 'locked' | 'too_many' |
//               'not_closed' | 'staff' | 'confirm' | 'failed' | 'unavailable', retry_after_minutes? }
// Proof, one of:
//   { phone, password }        as phone sign-in, under its limits (5 wrong passwords per
//                              number, 20 failed attempts per network); the password is
//                              checked in the database, since Supabase Auth refuses a locked
//                              login before it checks the password
//   { googleIdToken, nonce }   the ID token Google gave the app, and the raw nonce whose
//                              SHA-256 Google wrote into it (google-id-token.ts)
//   { emailTokenHash, emailLinkType }  an emailed sign-in link (Join) that Supabase Auth
//                              refused because the login is locked: its token_hash and type
//                              ('magiclink'), checked in the database (closed_account_by_email_link)
//                              under the network limit; a wrong one is 'link_invalid'
// A staff login closed with its shop only sees that ('staff'): its shop's owner decides.
// verify_jwt is off: a closed account has no session. The logic is in handler.ts.
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import Stripe from "npm:stripe@22.5.0";
import { handleClosedAccount } from "./handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "7200",
  "Content-Type": "application/json",
};
const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  const ip = first || req.headers.get("x-real-ip")?.trim() || "";
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ ok: false, code: "unavailable" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return respond({ ok: false, code: "unavailable" }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respond({ ok: false, code: "unavailable" }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const stripe = () => {
    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    return new Stripe(key, { apiVersion: "2026-06-24.dahlia" as any });
  };
  try {
    const result = await handleClosedAccount({ admin, stripe }, body, clientIp(req));
    return respond(result.body, result.status);
  } catch (error) {
    console.error("closed-account error", String((error as Error)?.message ?? error).slice(0, 500));
    return respond({ ok: false, code: "unavailable" }, 500);
  }
});
