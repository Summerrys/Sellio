// scanMenu v21 (supabase/functions/scanMenu/index.ts): the AI answers in a fixed format, items
// without a price are kept for the new app only, pictures' boxes and options are checked, the
// reply starts at once, and nothing found says why. The function is bundled with stand-ins
// for Supabase and the AI service, and called as the app calls it.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const app = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const temporary = await mkdtemp(path.join(app, '.scan-menu-verification-'));
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

try {
  let handler;
  globalThis.Deno = {
    env: { get: (name) => ({ SUPABASE_URL: 'https://sb.invalid', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ANTHROPIC_API_KEY: 'ai-key' })[name] },
    serve: (callback) => { handler = callback; },
  };
  const state = { signedIn: true, store: 'store-1', planAllows: true, quota: true, tenant: { currency: 'SGD', country: 'Singapore' }, rpcs: [] };
  globalThis.__scan = {
    createClient(_url, key, options) {
      return {
        auth: { getUser: async () => (state.signedIn && options?.global?.headers?.Authorization === 'Bearer owner'
          ? { data: { user: { email: 'owner@example.com' } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } }) },
        rpc: async (name, params) => {
          state.rpcs.push({ name, params });
          if (name === 'ai_authorized_store') return { data: state.store, error: null };
          if (name === 'ai_plan_allows') return { data: state.planAllows, error: null };
          if (name === 'ai_quota_take') return { data: state.quota, error: null };
          return { data: null, error: null };
        },
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: state.tenant, error: null }) }) }) }),
      };
    },
  };
  const outfile = path.join(temporary, 'scan-menu.mjs');
  await build({
    entryPoints: [path.join(app, 'supabase/functions/scanMenu/index.ts')], outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
    plugins: [{ name: 'stand-ins', setup(b) {
      b.onResolve({ filter: /^npm:@supabase\/supabase-js@/ }, () => ({ path: 'supabase-js', namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ loader: 'js', contents: 'export function createClient(u, k, o) { return globalThis.__scan.createClient(u, k, o); }' }));
    } }],
  });
  const fn = await import(pathToFileURL(outfile).href);

  // The AI service: answers with `ai.reply` (or waits for `ai.release`).
  const ai = { requests: [], reply: null, replies: null, gate: null };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    ai.requests.push({ options, body: JSON.parse(options.body) });
    if (ai.gate) await ai.gate;
    const reply = ai.replies?.length ? ai.replies.shift() : ai.reply;
    if (reply instanceof Error) throw reply;
    const status = reply.status ?? 200;
    return { ok: status < 400, status, json: async () => reply.body ?? reply };
  };
  const toolAnswer = (input, extra = {}) => ({ content: [{ type: 'tool_use', name: 'save_menu', input }], stop_reason: 'tool_use', usage: { input_tokens: 5000, output_tokens: 900 }, ...extra });
  const scan = (body = {}, auth = 'Bearer owner') => handler(new Request('https://fn.invalid/scanMenu', {
    method: 'POST', headers: { ...(auth ? { Authorization: auth } : {}), 'content-type': 'application/json' },
    body: JSON.stringify({ imageBase64: 'cGhvdG8=', mediaType: 'image/jpeg', tenantId: 'store-1', ...body }),
  }));
  const read = async (response) => ({ status: response.status, text: await response.text() });
  const quiet = async (work) => {
    const saved = [console.log, console.error]; const lines = [];
    console.log = console.error = (...args) => lines.push(args.join(' '));
    try { return { result: await work(), lines }; } finally { [console.log, console.error] = saved; }
  };

  const menu = {
    sections: [
      { title: 'Coffee & Tea', items: [
        { name: 'Kopi', price: 1.8, description: '', options: [{ group: 'Hot or iced', addon: false, choices: [{ label: 'Hot', extra: 0 }, { label: 'Iced', extra: '0.40' }] }], photo: [100, 120, 300, 320] },
        { name: 'Teh Tarik', price: null, description: 'Pulled milk tea', options: [{ group: 'Size', choices: [{ label: 'Regular', extra: 0 }] }], photo: [100, 120, 300, 320] },
        { name: 'Milo Dinosaur', price: '4.20', photo: [-50, 900, 2500, 1300] },
        { name: '  ', price: 3 },
      ] },
      { title: 'Toast', items: [
        { name: 'Kaya Toast', price: 2.5, options: [{ group: 'Add-ons', addon: true, choices: [{ label: 'Egg', extra: 1 }, { label: 'egg', extra: 1 }, { label: '', extra: 2 }] }], photo: [10, 10, 20, 20] },
        { name: 'Whole Menu', price: 9, photo: [0, 0, 2000, 1500] },
      ] },
    ],
    nothing_found: null,
    note: 'Teh Tarik had no price.',
  };

  // 1. The new app: every item, prices kept as printed, boxes and options checked.
  ai.reply = toolAnswer(menu);
  let response = await scan({ version: 2, imageWidth: 2236, imageHeight: 1677 });
  assert.equal(response.status, 200);
  let { result: body, lines } = await quiet(async () => (await read(response)).text);
  assert.match(body, /^ /, 'the reply starts with a space (sent at once)');
  let data = JSON.parse(body);
  assert.deepEqual(data.items.map((i) => i.name), ['Kopi', 'Teh Tarik', 'Milo Dinosaur', 'Kaya Toast', 'Whole Menu']);
  assert.deepEqual(data.items.map((i) => i.price), [1.8, null, 4.2, 2.5, 9]);
  assert.deepEqual(data.items.map((i) => i.category), ['Coffee & Tea', 'Coffee & Tea', 'Coffee & Tea', 'Toast', 'Toast']);
  assert.deepEqual(data.items[0].photo, [100, 120, 300, 320]);
  assert.equal(data.items[1].photo, null, 'one picture is never two items\' photo');
  assert.deepEqual(data.items[2].photo, [0, 900, 2236, 1300], 'a box is kept inside the photo');
  assert.equal(data.items[3].photo, null, 'a tiny box is no picture');
  assert.equal(data.items[4].photo, null, 'the whole menu is no item\'s picture');
  assert.deepEqual(data.items[0].variants, [{ name: 'Hot or iced', type: 'other', options: [{ label: 'Hot', price_modifier: 0 }, { label: 'Iced', price_modifier: 0.4 }] }]);
  assert.deepEqual(data.items[1].variants, [], 'a choice of one with one choice is no choice');
  assert.deepEqual(data.items[3].variants, [{ name: 'Add-ons', type: 'addon', options: [{ label: 'Egg', price_modifier: 1 }] }]);
  assert.equal(data.items[1].description, 'Pulled milk tea');
  assert.equal(data.count, 5);
  assert.equal(data.reason, undefined);
  assert.equal(data.imageWidth, 2236);
  assert.ok(lines.some((l) => /5 items \(4 with a price, 2 with a picture, 0 with photo words\)/.test(l)), lines.join('\n')); // v22 also counts photo words
  const sent = ai.requests.at(-1).body;
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.max_tokens, 16000);
  assert.deepEqual(sent.tool_choice, { type: 'tool', name: 'save_menu' });
  assert.equal(sent.tools[0].name, 'save_menu');
  assert.match(sent.messages[0].content[1].text, /The photo is 2236 × 1677 pixels/);
  assert.match(sent.messages[0].content[1].text, /Never guess a price/);
  assert.match(sent.messages[0].content[1].text, /prices are in SGD/);
  assert.equal(sent.messages[0].content[0].source.data, 'cGhvdG8=');
  passed('new app: every item is kept (no printed price: null), section titles become categories, boxes and options are checked');

  // 2. An app from before v21: only items with a price.
  ai.reply = toolAnswer(menu);
  ({ result: body } = await quiet(async () => (await read(await scan({}))).text));
  data = JSON.parse(body);
  assert.deepEqual(data.items.map((i) => i.name), ['Kopi', 'Milo Dinosaur', 'Kaya Toast', 'Whole Menu']);
  assert.ok(data.items.every((i) => i.price > 0));
  assert.equal(data.reason, undefined);
  assert.doesNotMatch(ai.requests.at(-1).body.messages[0].content[1].text, /The photo is/, 'without the photo\'s size the prompt doesn\'t claim one');
  passed('older app: only priced items, as before (it would save an item without a price at $0)');

  // 3. Nothing found says why; a cut-off answer says the menu is too long.
  ai.reply = toolAnswer({ sections: [], nothing_found: 'too_blurry', note: 'Glare over the text.' });
  ({ result: body, lines } = await quiet(async () => (await read(await scan({ version: 2 }))).text));
  data = JSON.parse(body);
  assert.deepEqual(data.items, []);
  assert.equal(data.reason, 'too_blurry');
  assert.ok(lines.some((l) => /nothing found: too_blurry \| note: Glare over the text\. \| answer: \{"sections":\[\]/.test(l)), 'what the AI answered is logged');
  ai.reply = toolAnswer({ sections: [], nothing_found: 'something else' });
  ({ result: body } = await quiet(async () => (await read(await scan({ version: 2 }))).text));
  assert.equal(JSON.parse(body).reason, 'no_items');
  ai.reply = toolAnswer({ sections: [] }, { stop_reason: 'max_tokens' });
  ({ result: body } = await quiet(async () => (await read(await scan({ version: 2 }))).text));
  assert.equal(JSON.parse(body).reason, 'too_long');
  ai.reply = toolAnswer({ sections: [{ title: 'Mains', items: [{ name: 'Nasi Lemak', price: 5 }] }] }, { stop_reason: 'max_tokens' });
  ({ result: body } = await quiet(async () => (await read(await scan({ version: 2 }))).text));
  data = JSON.parse(body);
  assert.equal(data.partial, true);
  assert.equal(data.items.length, 1);
  passed('nothing found says why (not a menu, blurry, cut off, no items, too long); a cut-short answer is marked partial');

  // 4. The reply starts before the AI answers.
  let release;
  ai.gate = new Promise((resolve) => { release = resolve; });
  ai.reply = toolAnswer(menu);
  response = await scan({ version: 2 });
  assert.equal(response.status, 200, 'the reply has started while the AI is still reading');
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), ' ');
  release(); ai.gate = null;
  let rest = '';
  await quiet(async () => {
    for (;;) { const { value, done } = await reader.read(); if (done) break; rest += new TextDecoder().decode(value); }
  });
  assert.equal(JSON.parse(rest).count, 5);
  passed('the reply starts at once (a long menu is never cut off at 150 s)');

  // 5. The AI service failing or too slow.
  ai.reply = { status: 529, body: { error: { type: 'overloaded_error' } } };
  ({ result: body } = await quiet(async () => (await read(await scan({ version: 2 }))).text));
  assert.deepEqual(JSON.parse(body), { error: 'The AI menu scanner is unavailable right now. Please try again.', reason: 'unavailable' });
  ai.reply = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  ({ result: body } = await quiet(async () => (await read(await scan({ version: 2 }))).text));
  assert.equal(JSON.parse(body).reason, 'too_long');
  ai.reply = new Error('network down');
  ({ result: body } = await quiet(async () => (await read(await scan({ version: 2 }))).text));
  assert.equal(JSON.parse(body).reason, 'unavailable');
  passed('the AI failing or taking too long gives a plain reason');

  // 5b. The fixed format refused: asked once more for text, read the same way.
  const textMenu = { sections: [{ title: 'Mains', items: [{ name: 'Nasi Lemak', price: 5.5, photo: [10, 10, 300, 300] }, { name: 'Mee Goreng', price: null }] }], nothing_found: null, note: '' };
  ai.replies = [{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'tools.0.input_schema: something' } } },
    { content: [{ type: 'text', text: '```json\n' + JSON.stringify(textMenu) + '\n```' }], stop_reason: 'end_turn', usage: {} }];
  const sentBefore = ai.requests.length;
  ({ result: body, lines } = await quiet(async () => (await read(await scan({ version: 2, imageWidth: 1000, imageHeight: 800 }))).text));
  data = JSON.parse(body);
  assert.deepEqual(data.items.map((i) => [i.name, i.price, i.category]), [['Nasi Lemak', 5.5, 'Mains'], ['Mee Goreng', null, 'Mains']]);
  assert.deepEqual(data.items[0].photo, [10, 10, 300, 300]);
  const [fixedFormat, asText] = ai.requests.slice(sentBefore).map((request) => request.body);
  assert.ok(fixedFormat.tools && fixedFormat.tool_choice);
  assert.equal(asText.tools, undefined);
  assert.equal(asText.tool_choice, undefined);
  assert.match(asText.messages[0].content[1].text, /Answer with only a JSON object/);
  assert.doesNotMatch(asText.messages[0].content[1].text, /Call save_menu/);
  assert.ok(lines.some((l) => /the fixed format was refused/.test(l)));
  assert.ok(lines.some((l) => /as text$/.test(l)));
  // A text answer without the fixed format (v20's list, each item with its category).
  ai.replies = [{ content: [{ type: 'text', text: 'Here you go: [{"name": "Kopi", "price": 1.8, "category": "Drinks"}, {"name": "Toast", "price": 2, "category": "Food"}, {"name": "Teh", "price": 1.6, "category": "Drinks"}]' }], stop_reason: 'end_turn' }];
  ({ result: body } = await quiet(async () => (await read(await scan({ version: 2 }))).text));
  assert.deepEqual(JSON.parse(body).items.map((i) => [i.name, i.category]), [['Kopi', 'Drinks'], ['Teh', 'Drinks'], ['Toast', 'Food']]);
  ai.replies = [{ status: 400, body: { error: { message: 'bad' } } }, { status: 400, body: { error: { message: 'still bad' } } }];
  ({ result: body } = await quiet(async () => (await read(await scan({ version: 2 }))).text));
  assert.equal(JSON.parse(body).reason, 'unavailable');
  ai.replies = null;
  assert.equal(fn.answerFromText('no json here'), null);
  assert.equal(fn.answerFromText('{"sections": [ broken'), null);
  passed('the fixed format refused: asked once more as text; text answers (object or v20 list) are read too');

  // 6. The checks before the AI are unchanged (and answer at once, not streamed).
  const before = ai.requests.length;
  let r = await read(await scan({ version: 2 }, null));
  assert.equal(r.status, 401);
  state.planAllows = false;
  r = await read(await scan({ version: 2 }));
  assert.equal(r.status, 403);
  assert.match(r.text, /isn't included in this shop's plan/);
  state.planAllows = true; state.quota = false;
  r = await read(await scan({ version: 2 }));
  assert.equal(r.status, 429);
  state.quota = true;
  r = await read(await scan({ version: 2, imageBase64: 'x'.repeat(7_000_001) }));
  assert.equal(r.status, 413);
  r = await read(await scan({ version: 2, imageBase64: undefined, imageUrl: 'http://menu.invalid/a.jpg' }));
  assert.equal(r.status, 400);
  assert.equal(ai.requests.length, before, 'none of these reached the AI');
  passed('sign-in, plan, daily limit, size and https checks are as before');

  // 7. The helpers.
  assert.equal(fn.cleanPrice('S$ 4.50'), 4.5);
  assert.equal(fn.cleanPrice(38000), 38000);
  assert.equal(fn.cleanPrice(-1), null);
  assert.equal(fn.cleanPrice('free'), null);
  assert.equal(fn.cleanPrice(0), 0);
  assert.deepEqual(fn.cleanBox([300, 320, 100, 120], 1000, 1000), [100, 120, 300, 320], 'corners in either order');
  assert.equal(fn.cleanBox([1, 2, 3], 100, 100), null);
  assert.equal(fn.cleanBox([0, 0, 'a', 40], 100, 100), null);
  assert.deepEqual(fn.cleanOptions([{ group: 'Size', choices: [{ label: 'S', extra: 0 }, { label: 'L', extra: '$1' }] }]), [{ name: 'Size', type: 'other', options: [{ label: 'S', price_modifier: 0 }, { label: 'L', price_modifier: 1 }] }]);
  assert.deepEqual(fn.cleanOptions('nope'), []);
  assert.deepEqual(fn.menuItems(null), []);
  passed('price, box and option rules');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log(`\n${passes} checks passed`);
