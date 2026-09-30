import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

export function hasRecentVerification(token: string, now = Date.now() / 1000) {
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    return Array.isArray(payload.amr) && payload.amr.some((entry: { method?: string; timestamp?: number }) =>
      ["password", "oauth", "otp", "totp", "webauthn"].includes(entry.method || "") &&
      typeof entry.timestamp === "number" && entry.timestamp <= now + 60 && now - entry.timestamp <= 600
    );
  } catch { return false; }
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer /i, "");
  if (!token) return json({ error: "Sign in to delete your account", code: "AUTH_REQUIRED" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  let requestId: string | null = null;
  let authId: string | null = null;
  try {
    // Verify the token before interpreting its signed authentication-method timestamps.
    const { data: auth, error: authError } = await service.auth.getUser(token);
    if (authError || !auth.user) return json({ error: "Sign in to delete your account", code: "AUTH_REQUIRED" }, 401);
    authId = auth.user.id;
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid request body" }, 400); }
    if (body?.confirmation !== "DELETE") return json({ error: 'Type DELETE to confirm' }, 400);
    if (!hasRecentVerification(token)) return json({ error: "Sign in again to verify your identity, then return to account deletion.", code: "REAUTH_REQUIRED" }, 403);

    const { data: prepared, error: prepareError } = await service.rpc("account_deletion_prepare", { p_auth_user_id: authId });
    if (prepareError) throw prepareError;
    requestId = prepared.requestId;
    if (prepared.status !== "processing") return json(prepared, 202);

    const { error: signOutError } = await service.auth.admin.signOut(token, "global");
    if (signOutError && signOutError.status !== 401 && signOutError.status !== 404) throw signOutError;
    const { error: deleteError } = await service.auth.admin.deleteUser(authId);
    if (deleteError) {
      // A concurrent retry may already have removed the identity.
      const { data: remaining, error: lookupError } = await service.auth.admin.getUserById(authId);
      if (remaining?.user || (lookupError && lookupError.status !== 404)) throw deleteError;
    }
    const { data: completed, error: finishError } = await service.rpc("account_deletion_finish", { p_auth_user_id: authId, p_request_id: requestId });
    if (finishError) throw finishError;
    return json(completed);
  } catch (error) {
    if (authId && requestId) {
      // Restore access only if Auth still exists. A completed Auth deletion must never be undone.
      const { data: remaining, error: lookupError } = await service.auth.admin.getUserById(authId);
      if (remaining?.user) {
        const { error: restoreError } = await service.rpc("account_deletion_restore", { p_auth_user_id: authId, p_request_id: requestId });
        if (restoreError) console.error("Account deletion access restoration failed", { requestId });
      } else if (lookupError?.status === 404) {
        const { data, error: finishError } = await service.rpc("account_deletion_finish", { p_auth_user_id: authId, p_request_id: requestId });
        if (!finishError) return json(data);
      }
    }
    console.error("Account deletion failed", { requestId, message: error instanceof Error ? error.message : "Backend error" });
    return json({ error: "Deletion could not be completed. Sign in again and retry. Shared store data has not been deleted.", requestId }, 500);
  }
});
