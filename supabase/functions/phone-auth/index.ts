// phone-auth: phone-number sign-in and forgot-password, done on the server so an
// account's email address never reaches the browser.
//
//   { action: 'sign_in', phone, password }
//     -> { ok: true, session: { access_token, refresh_token } }
//     -> { ok: false, code: 'invalid' | 'locked' | 'too_many' | 'busy' | 'unavailable', retry_after_minutes? }
//   { action: 'reset', phone, redirect_to }
//     -> { ok: true, kind: 'email', masked_email, priority_support }
//     -> { ok: true, kind: 'staff' }
//     -> { ok: false, code: 'not_found' | 'too_many', retry_after_minutes? }
//
// Limits (5 wrong passwords per number, failed attempts per network, forgot-password
// requests) are kept in the database by public.phone_auth_begin / phone_auth_finish.
//
// The sign-in page calls this with a plain request (no separate browser pre-check) and
// asks for it to run in ap-southeast-2 (Sydney), next to the database and Supabase Auth.
// It talks to them directly over HTTP rather than loading the Supabase library, so a
// fresh copy of the function starts quickly.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '7200',
  'Content-Type': 'application/json',
};
const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const PHONE_RE = /^\+[0-9]{6,15}$/;
const MAX_PASSWORD_LENGTH = 200;
const DEFAULT_RECOVERY_URL = 'https://sellio.sg/Auth?type=recovery';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// The visitor's network address, used only to count failed attempts per network.
function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  const ip = first || req.headers.get('x-real-ip')?.trim() || '';
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

// al•••@gmail.com
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '•••';
  const shown = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${shown}•••@${domain}`;
}

// Reset links only ever go back to a Sellio address (Supabase checks its own list too):
// Sellio's own domains and Sellio's Base44 address, never any other Base44 app. A reset
// asked for from anywhere else (an editor preview, say) goes to sellio.sg.
const SELLIO_HOSTS = new Set(['sellio.apptelier.sg', 'sellio.sg', 'www.sellio.sg', 'selliosg.base44.app']);
export function recoveryUrl(value: unknown): string {
  try {
    const url = new URL(String(value));
    const host = url.hostname;
    if (host === 'localhost' && (url.protocol === 'http:' || url.protocol === 'https:')) return `${url.origin}/Auth?type=recovery`;
    if (SELLIO_HOSTS.has(host) && url.protocol === 'https:') return `${url.origin}/Auth?type=recovery`;
  } catch { /* fall through */ }
  return DEFAULT_RECOVERY_URL;
}

const minutes = (seconds: unknown) => Math.max(1, Math.ceil((Number(seconds) || 60) / 60));

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

// Work that finishes after the reply has been sent.
const afterReply = (promise: Promise<unknown>) => {
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(promise);
  else promise.catch(() => {});
};

// A database function, called as the server (service role).
async function rpc(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) {
    throw Object.assign(new Error(`${name} failed (${res.status})`), { code: String(res.status) });
  }
  return text ? JSON.parse(text) : null;
}

// Supabase Auth, called exactly as the browser library would (public key).
async function authRequest(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'X-Supabase-Api-Version': '2024-01-01',
    },
    body: JSON.stringify(body),
  });
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  return { status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return respond({ ok: false, code: 'unavailable' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respond({ ok: false, code: 'unavailable' }, 400);
  }

  const action = body.action;
  const rawPhone = String(body.phone ?? '').trim();
  const phone = PHONE_RE.test(rawPhone) ? rawPhone : null;
  const ip = clientIp(req);

  try {
    if (action === 'sign_in') {
      const password = typeof body.password === 'string' ? body.password : '';
      const gate = await rpc('phone_auth_begin', { p_action: 'sign_in', p_phone: phone, p_ip: ip });
      if (!gate?.allowed) {
        return respond({ ok: false, code: gate?.reason === 'locked' ? 'locked' : 'too_many', retry_after_minutes: minutes(gate?.retry_after) });
      }

      // Recorded after the reply, so nobody waits on it. The limits don't depend on it
      // finishing first: phone_auth_begin has already counted this attempt.
      const finish = (outcome: 'ok' | 'wrong' | 'error') => afterReply(
        rpc('phone_auth_finish', { p_phone: phone, p_ip: ip, p_outcome: outcome })
          .catch((err) => console.error('phone_auth_finish failed', (err as Error)?.message)),
      );

      if (!gate.email || !password || password.length > MAX_PASSWORD_LENGTH) {
        finish('wrong');
        return respond({ ok: false, code: 'invalid' });
      }

      const { status, data } = await authRequest('token?grant_type=password', {
        email: gate.email, password, gotrue_meta_security: {},
      });
      if (status === 200 && typeof data.access_token === 'string' && typeof data.refresh_token === 'string') {
        finish('ok');
        return respond({ ok: true, session: { access_token: data.access_token, refresh_token: data.refresh_token } });
      }

      const code = String(data.code ?? data.error_code ?? data.error ?? '');
      const message = String(data.msg ?? data.message ?? data.error_description ?? '');
      const wrongPassword = code === 'invalid_credentials'
        || (status === 400 && (code === 'invalid_grant' || /invalid login credentials/i.test(message)));
      if (wrongPassword) {
        finish('wrong');
        return respond({ ok: false, code: 'invalid' });
      }
      finish('error');
      console.error('sign_in failed', status, code);
      return respond({ ok: false, code: status === 429 ? 'busy' : 'unavailable' });
    }

    if (action === 'reset') {
      const gate = await rpc('phone_auth_begin', { p_action: 'reset', p_phone: phone, p_ip: ip });
      if (!gate?.allowed) return respond({ ok: false, code: 'too_many', retry_after_minutes: minutes(gate?.retry_after) });
      if (!gate.email) return respond({ ok: false, code: 'not_found' });

      const email = String(gate.email);
      if (email.toLowerCase().endsWith('@sellio.app')) return respond({ ok: true, kind: 'staff' });

      // Sent after the reply, as before: the page doesn't wait for the email to go out.
      const redirect = encodeURIComponent(recoveryUrl(body.redirect_to));
      afterReply(
        authRequest(`recover?redirect_to=${redirect}`, { email, gotrue_meta_security: {} })
          .then(({ status, data }) => {
            if (status >= 300) console.error('reset email failed', status, String(data.code ?? data.error_code ?? ''));
          })
          .catch((err) => console.error('reset email failed', (err as Error)?.message)),
      );

      return respond({ ok: true, kind: 'email', masked_email: maskEmail(email), priority_support: gate.plan === 'pro' });
    }

    return respond({ ok: false, code: 'unavailable' }, 400);
  } catch (err) {
    console.error('phone-auth error', (err as { code?: string })?.code, (err as Error)?.message);
    return respond({ ok: false, code: 'unavailable' }, 500);
  }
});
