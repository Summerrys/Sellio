// Retired 2026-10-03 (Alvin): this old Base44 function needed no login and nothing uses it.
// Onboarding runs through the Supabase complete-onboarding function; Google sign-in is set up in Supabase.
// Every request gets 410 until the endpoint itself is removed.
Deno.serve(() => Response.json({ error: 'This legacy function has been retired', code: 'FUNCTION_RETIRED' }, { status: 410, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } }));
