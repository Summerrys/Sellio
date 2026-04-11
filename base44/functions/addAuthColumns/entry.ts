import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const pat = Deno.env.get('SUPABASE_PERSONAL_ACCESS_TOKEN');

  // Extract project ref from URL (e.g. https://abcdef.supabase.co -> abcdef)
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];

  const queries = [
    `ALTER TABLE app_users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'phone'`,
    `ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`,
    `UPDATE app_users SET auth_provider = 'phone' WHERE auth_provider IS NULL`,
  ];

  const results = [];
  for (const query of queries) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    results.push({ query, status: res.status, data });
  }

  return Response.json({ results });
});