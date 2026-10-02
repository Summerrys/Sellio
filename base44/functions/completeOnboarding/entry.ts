// Retired: onboarding is handled by the authenticated Supabase complete-onboarding function.
// Keep this response inert until deletion of the deployed legacy endpoint is verified.
Deno.serve(() => Response.json({ error: 'This legacy function has been retired', code: 'FUNCTION_RETIRED' }, { status: 410, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } }));
