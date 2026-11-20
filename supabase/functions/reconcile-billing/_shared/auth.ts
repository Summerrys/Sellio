import { createClient } from "npm:@supabase/supabase-js@2.112.3";

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase service configuration is missing");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function authorizeTenantOwner(req: Request, tenantId: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization");
  if (!url || !anonKey || !authorization?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
  }

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  const email = authData?.user?.email?.toLowerCase();
  if (authError || !email) {
    throw new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
  }

  const admin = createAdminClient();
  const [{ data: membership, error: membershipError }, { data: superAdmin, error: superAdminError }] =
    await Promise.all([
      admin
        .from("tenant_users")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("user_email", email)
        .eq("status", "active")
        .eq("is_owner", true)
        .maybeSingle(),
      admin
        .from("super_admins")
        .select("id")
        .ilike("email", email)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  if (membershipError) throw new Error("Tenant authorization lookup failed: " + membershipError.message);
  if (superAdminError) throw new Error("Administrator authorization lookup failed: " + superAdminError.message);
  if (!membership && !superAdmin) {
    throw new Response(JSON.stringify({ error: "Only the tenant owner can manage billing" }), { status: 403 });
  }

  return { admin, user: authData.user, email };
}
