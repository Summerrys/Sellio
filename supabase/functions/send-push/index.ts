// send-push: sends one Sellio notification to its recipient's phones with Firebase Cloud
// Messaging (FCM HTTP v1 API).
//
// Only the database calls it: app.notification_push (migration
// 20261104090000_sellio_push_alerts.sql) posts {"notification_id": "..."} through pg_net right
// after a notification is saved for someone with a registered phone, with the shared secret
// from Vault in the x-sellio-push header. public.push_notification_payload checks the secret
// and returns the notification and the phones. Deployed with verify_jwt off: the secret is the
// check.
//
// Needs the Firebase project's service account key in the FIREBASE_SERVICE_ACCOUNT secret (the
// JSON file's contents, or that JSON in base64). Without it: 503, nothing sent.
// {"check": true} (with the secret) checks the key and the FCM API without sending anything.
import { createClient } from 'npm:@supabase/supabase-js@2.101.1';

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function serviceAccount(): ServiceAccount | null {
  const raw = (Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? '').trim();
  if (!raw) return null;
  try {
    const text = raw.startsWith('{')
      ? raw
      : new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/\s+/g, '')), (c) => c.charCodeAt(0)));
    const account = JSON.parse(text);
    if (typeof account?.project_id === 'string' && typeof account?.client_email === 'string' &&
        typeof account?.private_key === 'string') {
      return account;
    }
  } catch {
    // not JSON
  }
  return null;
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const base64urlText = (text: string) => base64url(new TextEncoder().encode(text));

// Google's OAuth token for FCM, made from the service account (a JWT signed with its key);
// kept until shortly before it expires.
let cachedToken: { value: string; expires: number; account: string } | null = null;

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.account === account.client_email && cachedToken.expires - 120 > now) {
    return cachedToken.value;
  }
  const pem = account.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const unsigned = `${base64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64urlText(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body?.access_token !== 'string') {
    throw new Error(`Google refused the service account (${res.status} ${body?.error ?? ''})`.trim());
  }
  cachedToken = { value: body.access_token, expires: now + Number(body.expires_in ?? 3600), account: account.client_email };
  return cachedToken.value;
}

type FcmResult = { ok: true } | { ok: false; status: number; code: string; message: string; gone: boolean };

async function fcmSend(account: ServiceAccount, message: Record<string, unknown>, validateOnly = false): Promise<FcmResult> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(account)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(validateOnly ? { validate_only: true, message } : { message }),
  });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  const error = body?.error ?? {};
  const details: Array<Record<string, unknown>> = Array.isArray(error.details) ? error.details : [];
  const code = String(details.find((d) => typeof d?.errorCode === 'string')?.errorCode ?? error.status ?? res.status);
  const text = String(error.message ?? '');
  if (res.status === 401) cachedToken = null;
  // The phone's token is no longer valid (app removed, data cleared, other Firebase project).
  const gone = code === 'UNREGISTERED' || code === 'SENDER_ID_MISMATCH' ||
    (code === 'INVALID_ARGUMENT' && /registration token/i.test(text));
  return { ok: false, status: res.status, code, message: text.slice(0, 300), gone };
}

// The Android app's notification channels (src/lib/pushNotifications.js makes them).
function channelFor(type: string): 'orders' | 'messages' | 'updates' {
  if (type === 'new_order' || type === 'order_cancelled' || type === 'order_status_changed') return 'orders';
  if (type === 'chat_message') return 'messages';
  return 'updates';
}

// Opened in the app when the alert is tapped: Sellio's own pages only.
function safeLink(link: unknown): string {
  const value = typeof link === 'string' ? link.trim() : '';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.length > 300) {
    return '/Notifications';
  }
  return value;
}

const clip = (text: unknown, max: number) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = req.headers.get('x-sellio-push') ?? '';
  if (!/^[0-9a-f]{64}$/.test(secret)) return json({ error: 'Not allowed' }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const check = body?.check === true;
  const notificationId = typeof body?.notification_id === 'string' ? body.notification_id : '';
  if (!check && (!notificationId || notificationId.length > 100)) return json({ error: 'Bad request' }, 400);

  const { data: payload, error: payloadError } = await admin.rpc('push_notification_payload', {
    p_secret: secret,
    p_notification_id: notificationId,
  });
  if (payloadError) {
    console.error('send-push: payload lookup failed', payloadError.message);
    return json({ error: 'Lookup failed' }, 500);
  }
  if (payload?.ok !== true) return json({ error: 'Not allowed' }, 401);

  const account = serviceAccount();
  if (!account) {
    console.error('send-push: FIREBASE_SERVICE_ACCOUNT is not set or not a service account key');
    return json({ error: 'Push is not configured', configured: false }, 503);
  }

  if (check) {
    try {
      await accessToken(account);
    } catch (error) {
      return json({ configured: true, project_id: account.project_id, google_auth: false, error: String((error as Error).message) }, 502);
    }
    // A dry run (validate_only) to a made-up phone: FCM answers "not a valid registration
    // token" when the API is on and the key may use it.
    const result = await fcmSend(account, {
      token: 'sellio-check-not-a-real-registration-token',
      notification: { title: 'Sellio check', body: 'Not sent' },
    }, true);
    const fcm = result.ok || (!result.ok && result.code === 'INVALID_ARGUMENT') ? 'ok'
      : (!result.ok && result.status === 403) ? 'not_allowed_or_api_off'
      : 'error';
    return json({
      configured: true,
      project_id: account.project_id,
      google_auth: true,
      fcm,
      ...(result.ok ? {} : { fcm_status: result.status, fcm_code: result.code, fcm_message: result.message }),
    }, fcm === 'ok' ? 200 : 502);
  }

  if (payload.found !== true) return json({ sent: 0, reason: 'not_found' });
  const n = payload.notification ?? {};
  const devices: Array<{ token: string; platform: string }> = Array.isArray(payload.devices) ? payload.devices : [];
  if (n.is_read) return json({ sent: 0, reason: 'already_read' });
  if (!devices.length) return json({ sent: 0, reason: 'no_devices' });

  const type = String(n.type ?? '');
  const channel = channelFor(type);
  const data = (n.data && typeof n.data === 'object') ? n.data as Record<string, unknown> : {};
  // A newer alert about the same order or chat replaces the older one on the phone.
  const tag = typeof data.order_id === 'string' ? `order:${data.order_id}`
    : typeof data.conversation_id === 'string' ? `chat:${data.conversation_id}`
    : `n:${n.id}`;
  const urgent = channel !== 'updates';
  const message = {
    notification: { title: clip(n.title || 'Sellio', 100), body: clip(n.message, 300) },
    data: { notification_id: String(n.id), type, link: safeLink(n.link) },
    android: {
      priority: urgent ? 'HIGH' : 'NORMAL',
      ttl: type === 'new_order' ? '3600s' : '86400s',
      notification: {
        channel_id: channel,
        tag,
        notification_priority: urgent ? 'PRIORITY_HIGH' : 'PRIORITY_DEFAULT',
        default_sound: true,
        default_vibrate_timings: true,
      },
    },
  };

  const results = await Promise.all(devices.slice(0, 10).map(async (device) => {
    try {
      return { device, result: await fcmSend(account, { ...message, token: device.token }) };
    } catch (error) {
      return { device, result: { ok: false, status: 0, code: 'EXCEPTION', message: String((error as Error).message), gone: false } as FcmResult };
    }
  }));

  const gone = results.filter((r) => !r.result.ok && r.result.gone).map((r) => r.device.token);
  if (gone.length) {
    const { error } = await admin.from('push_devices').delete().in('token', gone);
    if (error) console.error('send-push: could not remove old phones', error.message);
  }
  const sent = results.filter((r) => r.result.ok).length;
  const failures = results.filter((r) => !r.result.ok).map((r) => {
    const f = r.result as Exclude<FcmResult, { ok: true }>;
    return `${f.code}${f.status ? ` (${f.status})` : ''}`;
  });
  console.log('send-push', JSON.stringify({ type, devices: devices.length, sent, failed: failures, removed: gone.length }));
  return json({ sent, failed: failures.length, removed: gone.length });
});
