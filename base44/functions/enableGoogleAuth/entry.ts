import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const personalAccessToken = Deno.env.get("SUPABASE_PERSONAL_ACCESS_TOKEN");
  const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const googleClientSecret = Deno.env.get("google_oauth_client_secret");

  // Extract project ref from supabase URL (e.g. https://xxxx.supabase.co -> xxxx)
  const projectRef = supabaseUrl.replace("https://", "").split(".")[0];

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${personalAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_google_enabled: true,
      external_google_client_id: googleClientId,
      external_google_secret: googleClientSecret,
      additional_redirect_urls: "https://selliosg.base44.app/**",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return Response.json({ error: "Failed to enable Google auth", details: data }, { status: 500 });
  }

  return Response.json({ success: true, message: "Google OAuth enabled successfully", data });
});