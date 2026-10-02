import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const png = 'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
const quiet = { log() {}, warn() {}, error() {} };
function evaluate(path, globals) {
  let handler;
  const source = fs.readFileSync(path, 'utf8').replace(/^import .*;\s*$/gm, '');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  vm.runInNewContext(output, { Deno: { serve(fn) { handler = fn; }, env: { get() { return 'mock-only'; } } },
    Response, Request, Set, Date, Uint8Array, atob, crypto: webcrypto, console: quiet, ...globals });
  return handler;
}
function imageHarness(options = {}) {
  const calls = { creates: 0, auth: [], queries: [], rpc: [], uploads: [], removals: [], ai: 0 };
  const user = { id: 'verified-user', email: 'verified@example.invalid', ...options.user };
  const client = {
    auth: { async getUser(token) { calls.auth.push(token); return { data: { user: options.invalid ? null : user }, error: options.invalid ? Error('invalid') : null }; } },
    from(table) {
      const query = { table, email: null };
      calls.queries.push(query);
      const chain = {
        select() { return chain; }, in(key, value) { query.email = value; return chain; },
        order() { return chain; }, limit() { return chain; },
        async maybeSingle() { return { data: table === 'app_users'
          ? options.profile ?? { is_active: true, onboarding_completed: true, tenant_id: 'store-a' }
          : options.invite ?? null, error: options.queryError ? Error('query failure') : null }; },
      };
      return chain;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (name === 'ai_authorized_store') return { data: options.noStore ? null : 'store-a', error: null };
      return { data: options.quota !== false, error: null };
    },
    storage: { from() { return {
      async upload(path, bytes, settings) { calls.uploads.push({ path, bytes, settings }); return { error: options.uploadError ? Error('upload failed') : null }; },
      getPublicUrl(path) { return { data: { publicUrl: 'https://mock.invalid/' + path } }; },
      async remove(paths) { calls.removals.push(paths); return { error: null }; },
    }; } },
  };
  const handler = evaluate('base44/functions/analyzeProductImage/entry.ts', {
    createClient() { calls.creates++; return client; },
    createClientFromRequest() { return { asServiceRole: { integrations: { Core: {
      async InvokeLLM() { calls.ai++; if (options.aiError) throw Error('provider failed with private details');
        return { name: 'Mock product', price: 3, category: 'Mock', tags: [], confidence: 0.9 }; },
    } } } }; },
  });
  const request = (body = { imageBase64: png, tenantId: 'store-a' }, token = 'verified-token', method = 'POST') =>
    new Request('https://mock.invalid/analyze', { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  return { handler, request, calls };
}
test('anonymous analysis is rejected before any client or database operation', async () => {
  const h = imageHarness(); assert.equal((await h.handler(h.request(undefined, ''))).status, 401); assert.equal(h.calls.creates, 0);
});
test('invalid or public-key bearer is rejected before database access', async () => {
  const h = imageHarness({ invalid: true }); assert.equal((await h.handler(h.request())).status, 401); assert.equal(h.calls.queries.length, 0);
});
test('banned identity is rejected', async () => {
  const h = imageHarness({ user: { banned_until: '2099-01-01T00:00:00Z' } }); assert.equal((await h.handler(h.request())).status, 401);
});
test('inactive profile is rejected without upload or AI', async () => {
  const h = imageHarness({ profile: { is_active: false } }); assert.equal((await h.handler(h.request())).status, 403); assert.equal(h.calls.ai, 0);
});
test('other tenant cannot fall back to paid onboarding eligibility', async () => {
  const h = imageHarness({ noStore: true, profile: { is_active: true }, invite: { status: 'pending', stripe_subscription_id: 'mock-subscription' } });
  assert.equal((await h.handler(h.request())).status, 403); assert.equal(h.calls.queries.length, 1); assert.equal(h.calls.uploads.length, 0);
});
test('authorized photo analysis uses verified email, tenant scope and own temporary path', async () => {
  const h = imageHarness(); assert.equal((await h.handler(h.request({ imageBase64: png, tenantId: 'store-a', ownerEmail: 'spoof@example.invalid' }))).status, 200);
  assert.equal(h.calls.rpc[0].args.p_email, 'verified@example.invalid');
  assert.equal(h.calls.rpc[0].args.p_tenant_id, 'store-a');
  assert.equal(h.calls.rpc[1].args.p_scope, 'store:store-a');
  assert.match(h.calls.uploads[0].path, /^temp\/ai-analysis\/verified-user\//);
  assert.equal(h.calls.uploads[0].settings.upsert, false);
  assert.equal(h.calls.removals[0][0], h.calls.uploads[0].path);
});
test('paid unfinished onboarding is allowed and quota is bound to verified Auth ID', async () => {
  const h = imageHarness({ noStore: true, profile: { is_active: true, onboarding_completed: false, tenant_id: null },
    invite: { status: 'pending', stripe_subscription_id: 'mock-subscription' } });
  assert.equal((await h.handler(h.request({ imageBase64: png }))).status, 200);
  assert.equal(h.calls.rpc[1].args.p_scope, 'onboarding:verified-user');
});
test('buyer without paid invite is rejected', async () => {
  const h = imageHarness({ noStore: true, profile: { is_active: true, onboarding_completed: false, tenant_id: null } });
  assert.equal((await h.handler(h.request({ imageBase64: png }))).status, 403); assert.equal(h.calls.uploads.length, 0);
});
test('existing linked store never falls back to onboarding', async () => {
  const h = imageHarness({ noStore: true, profile: { is_active: true, tenant_id: 'other-store' },
    invite: { status: 'pending', stripe_subscription_id: 'mock-subscription' } });
  assert.equal((await h.handler(h.request({ imageBase64: png }))).status, 403);
});
test('email underscores are compared exactly rather than wildcard matching', async () => {
  const h = imageHarness({ user: { email: 'verified_user@example.invalid' } }); await h.handler(h.request());
  assert.equal(h.calls.queries[0].email[0], 'verified_user@example.invalid');
});
test('quota exhaustion blocks upload and AI', async () => {
  const h = imageHarness({ quota: false }); assert.equal((await h.handler(h.request())).status, 429); assert.equal(h.calls.uploads.length, 0); assert.equal(h.calls.ai, 0);
});
test('provider failure cleans temporary file and hides private error details', async () => {
  const h = imageHarness({ aiError: true }); const r = await h.handler(h.request()); assert.equal(r.status, 500);
  assert.equal(h.calls.removals[0][0], h.calls.uploads[0].path); assert.doesNotMatch(await r.text(), /private details/);
});
test('failed upload also invokes cleanup', async () => {
  const h = imageHarness({ uploadError: true }); assert.equal((await h.handler(h.request())).status, 500); assert.equal(h.calls.ai, 0); assert.equal(h.calls.removals.length, 1);
});
test('invalid image encoding is rejected', async () => {
  const h = imageHarness(); assert.equal((await h.handler(h.request({ imageBase64: 'invalid!' }))).status, 400); assert.equal(h.calls.uploads.length, 0);
});
test('SVG upload is rejected', async () => {
  const h = imageHarness(); assert.equal((await h.handler(h.request({ imageBase64: 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64') }))).status, 400);
});
test('mismatched MIME and file signature is rejected', async () => {
  const h = imageHarness(); assert.equal((await h.handler(h.request({ imageBase64: png.replace('image/png', 'image/jpeg') }))).status, 400);
});
test('oversized photo is rejected before upload', async () => {
  const h = imageHarness(); assert.equal((await h.handler(h.request({ imageBase64: 'A'.repeat(7_100_000) }))).status, 413); assert.equal(h.calls.uploads.length, 0);
});
test('invalid JSON is rejected', async () => {
  const h = imageHarness(); assert.equal((await h.handler(h.request('{'))).status, 400);
});
test('unsupported request method is rejected', async () => {
  const h = imageHarness(); assert.equal((await h.handler(h.request(undefined, 'verified-token', 'GET'))).status, 405); assert.equal(h.calls.creates, 0);
});
test('non-string tenant is rejected', async () => {
  const h = imageHarness(); assert.equal((await h.handler(h.request({ imageBase64: png, tenantId: ['store-a'] }))).status, 400);
});
test('profile lookup fails closed', async () => {
  const h = imageHarness({ queryError: true }); assert.equal((await h.handler(h.request())).status, 500); assert.equal(h.calls.uploads.length, 0);
});

function deletionHarness(user, throwAuth = false) {
  let reads = 0;
  const handler = evaluate('base44/functions/deleteTenantWithCascade/entry.ts', {
    createClientFromRequest() { return { auth: { async me() { if (throwAuth) throw Error('private authentication error'); return user; } },
      asServiceRole: { entities: { Tenant: { async filter() { reads++; return []; } } } } }; },
  });
  return { handler, reads: () => reads };
}
const deleteRequest = (body) => new Request('https://mock.invalid/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test('anonymous tenant deletion rejects before entity access', async () => {
  const h = deletionHarness(null, true); const r = await h.handler(deleteRequest({ tenant_id: 'store-a', confirmation: 'DELETE' }));
  assert.equal(r.status, 401); assert.equal(h.reads(), 0); assert.doesNotMatch(await r.text(), /private authentication error/);
});
test('merchant/non-admin identity cannot use legacy cascade deletion', async () => {
  const h = deletionHarness({ role: 'user' }); assert.equal((await h.handler(deleteRequest({ tenant_id: 'store-a', confirmation: 'DELETE' }))).status, 403); assert.equal(h.reads(), 0);
});
test('admin cannot delete without server-side confirmation', async () => {
  const h = deletionHarness({ role: 'admin' }); assert.equal((await h.handler(deleteRequest({ tenant_id: 'store-a' }))).status, 400); assert.equal(h.reads(), 0);
});
test('invalid deletion target is rejected before any entity access', async () => {
  const h = deletionHarness({ role: 'admin' }); assert.equal((await h.handler(deleteRequest({ tenant_id: [], confirmation: 'DELETE' }))).status, 400); assert.equal(h.reads(), 0);
});
test('confirmed admin call proceeds only to verified target lookup', async () => {
  const h = deletionHarness({ role: 'admin' }); assert.equal((await h.handler(deleteRequest({ tenant_id: 'missing-store', confirmation: 'DELETE' }))).status, 404); assert.equal(h.reads(), 1);
});
test('only the two retained Base44 function directories remain', () => {
  assert.deepEqual(fs.readdirSync('base44/functions').sort(), ['analyzeProductImage', 'deleteTenantWithCascade']);
});
test('both photo clients use authenticated helper', () => {
  for (const path of ['src/components/onboarding/Step3MenuSetup.jsx', 'src/components/products/AIProductAssistant.jsx']) {
    const source = fs.readFileSync(path, 'utf8'); assert.match(source, /requestProductImageAnalysis\(/);
    assert.doesNotMatch(source, /fetch\('https:\/\/selliosg\.base44\.app\/api\/functions\/analyzeProductImage/);
  }
  const helper = fs.readFileSync('src/lib/productImageAnalysis.js', 'utf8'); assert.match(helper, /Authorization:/); assert.match(helper, /getSession\(/);
});
