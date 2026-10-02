import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const projectRef = 'gzktuteedbtnaxfdylyu';
    const accessToken = Deno.env.get('SUPABASE_PERSONAL_ACCESS_TOKEN');

    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        site_url: 'https://sellio.apptelier.sg',
        additional_redirect_urls: [
          'https://selliosg.base44.app',
          'https://selliosg.base44.app/Auth',
          'https://sellio.apptelier.sg',
          'https://sellio.apptelier.sg/Auth',
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return Response.json({ error: data }, { status: response.status });
    }

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});