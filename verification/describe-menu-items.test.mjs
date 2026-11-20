// describeMenuItems (20 Nov 2026): short descriptions for scanned menu items, a few at a time.
// The edge runtime, Supabase and the AI service are stand-ins:
//   • who may ask (signed in; a member with products.create of the store; the plan includes
//     menu scanning; a daily limit per store), and what's refused before the AI is asked;
//   • what the AI is asked (Haiku, the fixed format, the items numbered with their section,
//     options and printed words; Rewrite gives the description now and asks for other words);
//   • the answer: one text or null per item, in the order asked, tidied; a failed AI call says
//     so without details.
// Run from the app root: node verification/describe-menu-items.test.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const temporary = await mkdtemp(path.join(app, '.describe-menu-items-verification-'));
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

const standIns = { name: 'stand-ins', setup(b) {
  b.onResolve({ filter: /^npm:@supabase\/supabase-js@/ }, () => ({ path: 'supabase-js', namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ loader: 'js', contents: 'export function createClient(url, key, options) { return globalThis.__edge.createClient(url, key, options); }' }));
} };

try {
  let handler;
  const env = { SUPABASE_URL: 'https://sb.invalid', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key', ANTHROPIC_API_KEY: 'ai-key' };
  globalThis.Deno = { env: { get: (name) => env[name] }, serve: (callback) => { handler = callback; } };
  const edge = {
    calls: [],
    user: { data: { user: { email: 'owner@cafe.invalid' } }, error: null },
    rpc: { ai_authorized_store: { data: 'shop-1', error: null }, ai_plan_allows: { data: true, error: null }, ai_quota_take: { data: true, error: null } },
    createClient(url, key, options) {
      return {
        auth: { getUser: async () => { edge.calls.push({ kind: 'getUser', key, authorization: options?.global?.headers?.Authorization }); return edge.user; } },
        rpc: async (name, params) => { edge.calls.push({ kind: 'rpc', key, name, params }); return edge.rpc[name]; },
        from: (table) => ({ select: (columns) => ({ eq: (column, value) => ({ single: async () => { edge.calls.push({ kind: 'read', table, columns, column, value }); return { data: { country: 'Singapore' }, error: null }; } }) }) }),
      };
    },
  };
  globalThis.__edge = edge;
  let ai = null; // what the AI service answers: { status, body } or a function throwing
  const aiRequests = [];
  globalThis.fetch = async (url, options) => {
    aiRequests.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    if (typeof ai === 'function') return ai();
    return { ok: (ai.status ?? 200) < 300, status: ai.status ?? 200, json: async () => ai.body };
  };
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  console.log = ((log) => (...args) => { if (!String(args[0]).startsWith('describeMenuItems v1')) log(...args); })(console.log);

  const outfile = path.join(temporary, 'describe.mjs');
  await build({ entryPoints: [path.join(app, 'supabase/functions/describeMenuItems/index.ts')], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', plugins: [standIns], logLevel: 'silent' });
  const fn = await import(pathToFileURL(outfile).href);
  assert.equal(typeof handler, 'function', 'Deno.serve was called');
  const call = async (body, { auth = 'Bearer user-token', method = 'POST' } = {}) => {
    const headers = new Headers({ 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) });
    const res = await handler(new Request('https://fn.invalid/describeMenuItems', { method, headers, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }));
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  const reset = () => { edge.calls.length = 0; aiRequests.length = 0; errors.length = 0; };
  const toolAnswer = (descriptions) => ({ body: { content: [{ type: 'tool_use', name: 'save_descriptions', input: { descriptions } }], usage: { input_tokens: 400, output_tokens: 90 } } });
  const items = [
    { name: 'Grilled Chicken Caesar Salad', section: 'Menu and Prices' },
    { name: 'Soup of the Day', section: 'Menu and Prices', printed: 'changes daily' },
    { name: 'Teh Tarik 拉茶', section: 'Drinks', options: 'Hot or iced: Hot / Iced +0.40' },
  ];

  // ── 1. Refused before the AI is asked ──────────────────────────────────────────────────
  assert.equal((await call(null, { method: 'OPTIONS' })).text, 'ok');
  reset();
  for (const [body, status, words] of [
    [{ items }, 400, /tenantId required/],
    [{ tenantId: 'shop-1', items: [] }, 400, /Send 1 to 8 items/],
    [{ tenantId: 'shop-1', items: Array.from({ length: 9 }, (_, i) => ({ name: `Item ${i}` })) }, 400, /Send 1 to 8 items/],
    [{ tenantId: 'shop-1', items: [{ name: 'Kopi' }, { name: '   ' }] }, 400, /each with a name/],
    [{ tenantId: 'shop-1', items: 'Kopi' }, 400, /Send 1 to 8 items/],
  ]) {
    const res = await call(body);
    assert.equal(res.status, status, JSON.stringify(body).slice(0, 60));
    assert.match(res.json.error, words);
  }
  assert.equal(edge.calls.length + aiRequests.length, 0, 'a bad ask goes no further');
  assert.equal((await call({ tenantId: 'shop-1', items }, { auth: null })).status, 401);
  edge.user = { data: { user: null }, error: { message: 'invalid JWT' } };
  assert.deepEqual(await call({ tenantId: 'shop-1', items }).then((r) => [r.status, r.json.error]), [401, 'Please sign in again.']);
  edge.user = { data: { user: { email: 'owner@cafe.invalid' } }, error: null };
  reset();
  edge.rpc.ai_authorized_store = { data: null, error: null };
  assert.equal((await call({ tenantId: 'shop-2', items })).status, 403, 'not a member of that store (or without products.create)');
  assert.deepEqual(edge.calls.filter((c) => c.kind === 'rpc').map((c) => [c.key, c.name, c.params]), [['service-key', 'ai_authorized_store', { p_email: 'owner@cafe.invalid', p_tenant_id: 'shop-2', p_permissions: ['products.create'] }]]);
  edge.rpc.ai_authorized_store = { data: 'shop-1', error: null };
  edge.rpc.ai_plan_allows = { data: false, error: null };
  assert.deepEqual(await call({ tenantId: 'shop-1', items }).then((r) => [r.status, r.json.error]), [403, 'Menu scan isn’t included in this shop’s plan.']);
  edge.rpc.ai_plan_allows = { data: true, error: null };
  reset();
  edge.rpc.ai_quota_take = { data: false, error: null };
  assert.equal((await call({ tenantId: 'shop-1', items })).status, 429, 'over the day\'s limit');
  assert.deepEqual(edge.calls.filter((c) => c.kind === 'rpc').map((c) => [c.name, c.params]), [
    ['ai_authorized_store', { p_email: 'owner@cafe.invalid', p_tenant_id: 'shop-1', p_permissions: ['products.create'] }],
    ['ai_plan_allows', { p_tenant_id: 'shop-1', p_key: 'can_scan_menu' }],
    ['ai_quota_take', { p_feature: 'describeMenuItems', p_scope: 'store:shop-1', p_window_seconds: 86400, p_limit: 300 }],
  ]);
  edge.rpc.ai_quota_take = { data: true, error: null };
  assert.equal(aiRequests.length, 0, 'the AI is never asked for a refused call');
  passed('refused before the AI is asked: bad asks, not signed in, not a member, a plan without menu scan, over the day\'s limit');

  // ── 2. What the AI is asked, and the answer ─────────────────────────────────────────────
  reset();
  ai = toolAnswer([
    { item: 3, text: '  Pulled milk tea, hot or iced. ' },
    { item: 1, text: '“Grilled chicken over crisp romaine, tossed in Caesar dressing.”' },
    { item: 1, text: 'A second one for the same item.' },
    { item: 7, text: 'Not an item.' },
    { item: 2, text: '' },
  ]);
  // The store as ai_authorized_store names it is the one used from here on.
  edge.rpc.ai_authorized_store = { data: 'shop-1-as-stored', error: null };
  const res = await call({ tenantId: 'shop-1', items: [...items.slice(0, 2), { ...items[2], now: 'ignored without rewrite' }] });
  edge.rpc.ai_authorized_store = { data: 'shop-1', error: null };
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { descriptions: ['Grilled chicken over crisp romaine, tossed in Caesar dressing.', null, 'Pulled milk tea, hot or iced.'] },
    'one per item in the order asked (by its number), tidied; none when missing or empty');
  assert.equal(aiRequests.length, 1);
  const asked = aiRequests[0];
  assert.equal(asked.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(asked.headers['x-api-key'], 'ai-key');
  assert.equal(asked.body.model, 'claude-haiku-5-5');
  assert.deepEqual(asked.body.tool_choice, { type: 'tool', name: 'save_descriptions' });
  assert.equal(asked.body.tools[0].name, 'save_descriptions');
  const prompt = asked.body.messages[0].content;
  assert.match(prompt, /for a shop in Singapore/);
  assert.match(prompt, /\n1\. Grilled Chicken Caesar Salad — section: Menu and Prices\n2\. Soup of the Day — section: Menu and Prices — printed on the menu: "changes daily"\n3\. Teh Tarik 拉茶 — section: Drinks — options: Hot or iced: Hot \/ Iced \+0\.40$/);
  assert.doesNotMatch(prompt, /now:|other words/, 'not a rewrite: no description now');
  assert.deepEqual(edge.calls.find((c) => c.kind === 'read'), { kind: 'read', table: 'tenants', columns: 'country', column: 'id', value: 'shop-1-as-stored' }, 'the store\'s country, by the store allowed');
  assert.deepEqual(edge.calls.filter((c) => c.kind === 'rpc').slice(1).map((c) => c.params.p_tenant_id ?? c.params.p_scope), ['shop-1-as-stored', 'store:shop-1-as-stored'], 'plan and limit of the store allowed');
  // Rewrite: the description now, and other words asked for.
  reset();
  ai = toolAnswer([{ item: 1, text: 'Romaine, grilled chicken and parmesan in a creamy Caesar dressing.' }]);
  const again = await call({ tenantId: 'shop-1', rewrite: true, items: [{ name: 'Grilled Chicken Caesar Salad', section: 'Menu and Prices', now: 'Grilled chicken over crisp romaine.' }] });
  assert.deepEqual(again.json, { descriptions: ['Romaine, grilled chicken and parmesan in a creamy Caesar dressing.'] });
  assert.match(aiRequests[0].body.messages[0].content, /1\. Grilled Chicken Caesar Salad — section: Menu and Prices — now: "Grilled chicken over crisp romaine\."$/);
  assert.match(aiRequests[0].body.messages[0].content, /write a different one, in other words/);
  // Long words are cut to size.
  reset();
  ai = toolAnswer([{ item: 1, text: 'x'.repeat(400) }]);
  assert.equal((await call({ tenantId: 'shop-1', items: [{ name: 'Kopi' }] })).json.descriptions[0].length, fn.MAX_DESCRIPTION);
  passed('asks Haiku in the fixed format with the items numbered (section, options, printed words); Rewrite gives the description now; answers one per item in order, tidied');

  // ── 3. When the AI can't answer ────────────────────────────────────────────────────────
  for (const [what, answer] of [
    ['overloaded', { status: 529, body: { error: { type: 'overloaded_error', message: 'Overloaded' } } }],
    ['no answer in time', () => { throw Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' }); }],
  ]) {
    reset();
    ai = answer;
    const failed = await call({ tenantId: 'shop-1', items });
    assert.deepEqual([failed.status, failed.json], [502, { error: 'Descriptions can’t be written right now. Please try again.', reason: 'unavailable' }], what);
    assert.ok(errors.some((e) => e.startsWith('describeMenuItems')), `${what}: logged`);
  }
  reset();
  edge.rpc.ai_plan_allows = { data: null, error: { message: 'relation "app.secret_table" does not exist' } };
  const broken = await call({ tenantId: 'shop-1', items });
  assert.deepEqual([broken.status, broken.json], [500, { error: 'Descriptions can’t be written right now. Please try again.' }], 'a failure inside says nothing of how Sellio works');
  edge.rpc.ai_plan_allows = { data: true, error: null };
  passed('the AI overloaded or too slow: "can\'t be written right now" (502); a failure inside: the same words, no details');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.info(`\n${passes} describeMenuItems checks passed`);
