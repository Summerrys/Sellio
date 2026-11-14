// src/lib/signOutWatch.js with the real supabase-js the app uses, against a stand-in Supabase
// auth server (no network): does the watch see what Supabase itself does when a sign-in ends by
// itself (UX state 8, 14 Nov 2026), and stay quiet offline, on Sign out, and for nobody?
// Run: node verification/sign-out-watch.test.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const repo = process.cwd();
const require = createRequire(path.join(repo, 'package.json'));
const { build } = require('esbuild');
const { createClient } = require('@supabase/supabase-js');
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-sign-out-watch-'));
const out = path.join(tmp, 'watch.mjs');
// supabase-js reports its retries offline on the console: not this test's output.
console.error = () => {};
await build({ entryPoints: [path.join(repo, 'src/lib/signOutWatch.js')], outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /supabaseClient|AppUserContext/ }, () => ({ path: 'stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ loader: 'js', contents: 'export const getSupabase = async () => null; export const cookieUtils = { get: () => null };' }));
  } }] });
const watch = await import(out + '?' + Date.now());

const memory = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const URL_ = 'https://fixture.supabase.co';
const key = 'sb-fixture-auth-token';
const expiredSession = () => JSON.stringify({ access_token: 'a.b.c', refresh_token: 'rt-1', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) - 60, user: { id: 'u-1', email: 'owner@example.com', aud: 'authenticated' } });
const record = { id: 'p-1', email: 'owner@example.com', tenant_id: 't-1' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function scenario(name, { stored, server, record: rec = record, then }) {
  watch.resetSignOutWatchForTests();
  const storage = memory();
  if (stored) storage.setItem(key, stored);
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push(`${init.method || 'GET'} ${new URL(url).pathname}${new URL(url).search}`);
    return server(url, init);
  };
  const client = createClient(URL_, 'anon-key', { auth: { storage, storageKey: key, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch } });
  // Supabase's first word on the sign-in (offline it keeps retrying for about 30 s first).
  const initial = new Promise((resolve) => client.auth.onAuthStateChange((event) => { if (event === 'INITIAL_SESSION') resolve(); }));
  await watch.startSignOutWatch({ loadClient: async () => client, readRecord: () => rec, storage });
  await Promise.race([initial, wait(45000)]);
  await wait(300);
  if (then) await then(client);
  await wait(300);
  const notice = watch.readSignedOutNotice(storage);
  console.log(name, '→', notice ? `notice (${notice.email}, shop ${notice.shop})` : 'nothing', '| session kept:', storage.getItem(key) != null, '|', calls.join(', '));
  return { notice, storage };
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// 1. Sellio opens; the refresh token was revoked meanwhile (a password reset elsewhere).
let r = await scenario('revoked while closed', { stored: expiredSession(),
  server: () => json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }) });
assert.ok(r.notice && r.notice.shop === true);
// 2. Sellio opens offline with an expired access token: the sign-in is kept, nothing said.
r = await scenario('offline at start', { stored: expiredSession(), server: () => { throw new TypeError('Failed to fetch'); } });
assert.equal(r.notice, null);
assert.ok(r.storage.getItem(key));
// 3. A Sign out tapped: nothing said.
r = await scenario('Sign out tapped', { stored: JSON.stringify({ ...JSON.parse(expiredSession()), expires_at: Math.floor(Date.now() / 1000) + 3000 }),
  server: () => new Response(null, { status: 204 }), then: async (client) => { const { error } = await client.auth.signOut({ scope: 'local' }); assert.equal(error, null); } });
assert.equal(r.notice, null);
assert.equal(r.storage.getItem(key), null, 'really signed out');
// 4. Signed in, then a refresh that fails for good while using Sellio.
r = await scenario('refused while in use', { stored: JSON.stringify({ ...JSON.parse(expiredSession()), expires_at: Math.floor(Date.now() / 1000) + 3000 }),
  server: () => json(400, { code: 400, error_code: 'refresh_token_already_used', msg: 'Invalid Refresh Token: Already Used' }),
  then: async (client) => { await client.auth.refreshSession(); } });
assert.ok(r.notice);
// 5. Nobody signed in on this device: nothing.
r = await scenario('nobody signed in', { stored: null, record: null, server: () => json(200, {}) });
assert.equal(r.notice, null);
await rm(tmp, { recursive: true, force: true });
console.log('5 sign-out watch checks passed with the real supabase-js (no network)');
