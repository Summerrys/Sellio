// deno test supabase/functions/findProductImage/index.test.ts
// (from the app root: deno test --no-config --allow-all supabase/functions/findProductImage/index.test.ts)
// findProductImage v25 with stand-ins for Supabase and Pixabay (fetch is replaced: nothing leaves
// the machine). Alvin, 20 Nov 2026: "a classic club sandwich ... returns ... poker card club or
// even motorbikes" (v24 searched "classic club"). The names below are from his menu scan.
import { deepStrictEqual as assertEquals, match as assertMatch, ok as assert } from 'node:assert/strict';

const URL_ = 'https://proj.supabase.co';
Deno.env.set('SUPABASE_URL', URL_);
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
Deno.env.set('PIXABAY_API_KEY', 'pixabay-test-key');

let handler!: (req: Request) => Promise<Response>;
Object.defineProperty(Deno, 'serve', { value: (h: typeof handler) => { handler = h; return { finished: Promise.resolve() }; }, configurable: true });

// The world the function talks to.
const state: any = {};
const hit = (n: number, q: string) => ({
  id: 1000 + n, pageURL: `https://pixabay.com/photos/${q.replace(/\s+/g, '-')}-${1000 + n}/`, tags: `${q}, cup, drink, cafe`,
  previewURL: `https://cdn.pixabay.com/photo/2020/01/01/00/00/x-${1000 + n}_150.jpg`,
  webformatURL: `https://pixabay.com/get/g${n}abc_640.jpg`, largeImageURL: `https://pixabay.com/get/g${n}def_1280.jpg`,
  user_id: 77 + n, user: n === 1 ? 'Mei Lin' : 'kopi_lover',
});
const found = (q: string) => ({ status: 200, body: { total: 2, totalHits: 2, hits: [hit(1, q), hit(2, q)] } });
const nothing = () => ({ status: 200, body: { total: 0, totalHits: 0, hits: [] } });
function reset() {
  Object.assign(state, {
    calls: [] as { method: string; url: string; body?: string; headers: Headers }[],
    user: { id: 'u1', email: 'owner@example.invalid' },
    store: 'store-1',
    quota: true,
    allowance: { allowed: true, limit: 3, used: 1, resets_at: '2026-12-01T00:00:00+08:00' },
    refunds: 0,
    cache: new Map<string, { photos: unknown; fetched_at: string }>(),
    pixabay: (u: URL) => found(u.searchParams.get('q')!),
    images: (u: string) => (u.includes('missing') ? { status: 404 } : { status: 200, type: 'image/jpeg', bytes: new Uint8Array([255, 216, 255, 1, 2, 3]) }),
    uploads: [] as { path: string; type: string | null; size: number }[],
  });
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const standIn = (async (input: Request | URL | string, init?: RequestInit) => {
  const req = input instanceof Request ? input : new Request(String(input), init);
  const url = new URL(req.url);
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.clone().text();
  state.calls.push({ method: req.method, url: req.url, body, headers: req.headers });
  if (url.origin === URL_) {
    if (url.pathname === '/auth/v1/user') {
      return state.user && req.headers.get('Authorization') === 'Bearer user-token' ? json(state.user) : json({ message: 'invalid' }, 401);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.slice('/rest/v1/rpc/'.length);
      if (name === 'ai_authorized_store') return json(state.store);
      if (name === 'ai_quota_take') return json(state.quota);
      if (name === 'ai_monthly_take') return json(state.allowance);
      if (name === 'ai_monthly_refund') { state.refunds++; return json(null); }
    }
    if (url.pathname === '/rest/v1/photo_search_cache') {
      if (req.method === 'GET') {
        const key = decodeURIComponent((url.searchParams.get('key') || '').replace(/^eq\./, ''));
        const row = state.cache.get(key);
        if ((req.headers.get('Accept') || '').includes('vnd.pgrst.object')) return row ? json(row) : json({ code: 'PGRST116' }, 406);
        return json(row ? [row] : []);
      }
      if (req.method === 'POST') {
        const row = JSON.parse(body || '{}');
        state.cache.set(row.key, { photos: row.photos, fetched_at: row.fetched_at });
        return new Response(null, { status: 201 });
      }
      if (req.method === 'DELETE') return new Response(null, { status: 204 });
    }
    if (url.pathname.startsWith('/storage/v1/object/product-images/')) {
      const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/product-images/'.length));
      state.uploads.push({ path, type: req.headers.get('content-type'), size: body ? body.length : 0 });
      return json({ Key: `product-images/${path}`, Id: 'x' });
    }
    return json({ message: `no stand-in for ${req.method} ${url.pathname}` }, 500);
  }
  if (url.origin === 'https://pixabay.com' && url.pathname === '/api/') {
    const answer = state.pixabay(url);
    return answer.status === 200
      ? json(answer.body, 200, { 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '99' })
      : new Response(answer.text || '', { status: answer.status });
  }
  if (/^https:\/\/(cdn\.)?pixabay\.com\/(get|photo)\//.test(req.url)) {
    const image = state.images(req.url);
    return image.status === 200 ? new Response(image.bytes, { status: 200, headers: { 'Content-Type': image.type } }) : new Response('nope', { status: image.status });
  }
  throw new Error(`unexpected fetch ${req.method} ${req.url}`);
}) as typeof fetch;
globalThis.fetch = standIn;

const { searchPlan, MAX_ASKS } = await import('./index.ts');

const call = (body: unknown, token = 'user-token') => handler(new Request('https://fn.example/findProductImage', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
}));
// What Pixabay was asked: the words, and 'food' or 'all'.
const asked = () => state.calls.filter((c: any) => c.url.startsWith('https://pixabay.com/api/')).map((c: any) => {
  const u = new URL(c.url);
  return `${u.searchParams.get('q')} [${u.searchParams.get('category') || 'all'}]`;
});
const plan = (name: string) => searchPlan(name).map((a: any) => `${a.words}${a.lang === 'zh' ? ' (zh)' : ''} [${a.category}]`);
const test = (name: string, fn: () => Promise<void> | void) => Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });

test('Words: the dish at the end of the name, without menu words; Food & Drink first, then all photos, then fewer words', () => {
  assertEquals(plan('Classic Club Sandwich'), ['club sandwich [food]', 'club sandwich [all]', 'sandwich [food]', 'sandwich [all]']);
  assertEquals(plan('Mushroom and Swiss Burger'), ['mushroom swiss burger [food]', 'swiss burger [food]', 'mushroom swiss burger [all]', 'swiss burger [all]', 'burger [food]', 'burger [all]']);
  assertEquals(plan('Grilled Chicken Caesar Salad')[0], 'chicken caesar salad [food]');
  assertEquals(plan('BBQ Pulled Pork Sandwich')[0], 'pulled pork sandwich [food]');
  assertEquals(plan('Spinach and Feta Stuffed Chicken').slice(0, 2), ['feta stuffed chicken [food]', 'stuffed chicken [food]']);
  assertEquals(plan('Beef Stir-Fry')[0], 'beef stir fry [food]');
  assertEquals(plan('Freshly Squeezed Lemonade').slice(0, 3), ['squeezed lemonade [food]', 'squeezed lemonade [all]', 'lemonade [food]']);
  assertEquals(plan('Soup of the Day'), ['soup [food]', 'soup [all]']);
  assertEquals(plan('Coffee'), ['coffee [food]', 'coffee [all]']);
  assertEquals(plan('Quiche Lorraine')[0], 'quiche lorraine [food]');
  // Brackets, a side after "with" / "c/w" / "+", sizes and units, accents.
  assertEquals(plan('Char Siew Rice (Large)')[0], 'char siew [food]');
  assertEquals(plan('Chicken Chop c/w Fries')[0], 'chicken chop [food]');
  assertEquals(plan('Grilled Salmon with Mashed Potato')[0], 'grilled salmon [food]');
  assertEquals(plan('Burger + Fries')[0], 'burger [food]');
  assertEquals(plan('Iced Latte 16oz')[0], 'iced latte [food]');
  assertEquals(plan('Foot Reflexology 60 min'), ['foot reflexology [food]', 'foot reflexology [all]', 'reflexology [food]', 'reflexology [all]']);
  assertEquals(plan('Crème Brûlée')[0], 'creme brulee [food]');
  assertEquals(plan("Chef's Special"), [], 'nothing that says what it is: nothing searched');
});

test('Local dishes: the local name first, then a few English words, in Food & Drink only', () => {
  assertEquals(plan('Nasi Lemak with Ayam Goreng'), ['nasi lemak [food]', 'coconut rice [food]', 'rice [food]']);
  assertEquals(plan('Kopi-O Kosong'), ['kopi o kosong [food]', 'black coffee [food]', 'coffee [food]']);
  assertEquals(plan('Teh C Peng')[0], 'teh c peng [food]');
  assertEquals(plan('Iced Milo')[0], 'milo [food]');
  assertEquals(plan('Kaya Butter Toast Set'), ['kaya butter toast [food]', 'toast [food]']);
  assertEquals(plan('Char Kway Teow (Large)')[0], 'char kway teow [food]');
  // A local name that's a place or another dish on Pixabay: English only.
  assertEquals(plan('Bandung'), ['rose milk [food]', 'milk [food]']);
  assertEquals(plan('Black Carrot Cake'), ['fried radish cake [food]', 'cake [food]']);
  assertEquals(plan('ABC Juice'), ['beetroot juice [food]', 'juice [food]']);
  // Plain "Carrot Cake" is the cafe's cake, and a local name inside a word isn't matched.
  assertEquals(plan('Carrot Cake')[0], 'carrot cake [food]');
  assertEquals(plan('Teheran Kebab')[0], 'teheran kebab [food]');
});

test('Chinese: searched in Chinese, after the rest of the name', () => {
  assertEquals(plan('炒饭'), ['炒饭 (zh) [food]', '炒饭 (zh) [all]']);
  assertEquals(plan('Kopi O 咖啡乌'), ['kopi o [food]', 'black coffee [food]', 'coffee [food]', '咖啡乌 (zh) [food]', '咖啡乌 (zh) [all]']);
  assertEquals(plan('Fried Rice 炒饭').slice(-2), ['炒饭 (zh) [food]', '炒饭 (zh) [all]']);
});

test('A search: the dish words in Food & Drink, 5 safe photos, the answer as the app takes it, kept a day', async () => {
  reset();
  const res = await call({ query: 'Classic Club Sandwich', page: 1, tenantId: 'store-1' });
  const data = await res.json();
  assertEquals(res.status, 200);
  const calls = state.calls.filter((c: any) => c.url.startsWith('https://pixabay.com/api/')).map((c: any) => Object.fromEntries(new URL(c.url).searchParams));
  assertEquals(calls, [{ key: 'pixabay-test-key', q: 'club sandwich', lang: 'en', image_type: 'photo', safesearch: 'true', per_page: '5', page: '1', category: 'food' }]);
  assertEquals([data.keyword, data.page, data.photos.length], ['club sandwich', 1, 2]);
  assertEquals(data.photos[0], {
    id: 'pixabay-1001', previewUrl: 'https://pixabay.com/get/g1abc_640.jpg', keepUrl: 'https://pixabay.com/get/g1def_1280.jpg', alt: 'club sandwich, cup, drink',
    credit: { source: 'pixabay', name: 'Mei Lin', profile: 'https://pixabay.com/users/Mei%20Lin-78/', photo: 'https://pixabay.com/photos/club-sandwich-1001/' },
  });
  assert(!('url' in data.photos[0]), 'no `url`: an app from before v24 finds no photo to save');
  assert(state.cache.has('pixabay|en|food|1|club sandwich'), 'kept a day, by language, category, set and words');
  assertEquals(state.refunds, 0);
  // Within the day: from the kept answer.
  state.calls = [];
  assertEquals((await call({ query: 'classic club sandwich', page: 1, tenantId: 'store-1' })).status, 200);
  assertEquals(asked(), []);
  // A day later: Pixabay asked again.
  state.cache.set('pixabay|en|food|1|club sandwich', { photos: [], fetched_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() });
  assertEquals((await call({ query: 'Classic Club Sandwich', page: 1, tenantId: 'store-1' })).status, 200);
  assertEquals(asked(), ['club sandwich [food]']);
});

test('Nothing in Food & Drink: all photos for the same words (a non-food item), before fewer words', async () => {
  reset();
  state.pixabay = (u: URL) => (u.searchParams.get('q') === 'aromatherapy oil' && !u.searchParams.get('category') ? found('aromatherapy oil') : nothing());
  const res = await call({ query: 'Aromatherapy Oil', page: 1, tenantId: 'store-1' });
  const data = await res.json();
  assertEquals([res.status, data.keyword], [200, 'aromatherapy oil']);
  assertEquals(asked(), ['aromatherapy oil [food]', 'aromatherapy oil [all]'], 'never "oil" in Food & Drink first');
});

test('Nothing for the whole name: fewer words, ending with the dish word, never the first word', async () => {
  reset();
  state.pixabay = (u: URL) => (u.searchParams.get('q') === 'burger' && u.searchParams.get('category') === 'food' ? found('burger') : nothing());
  const res = await call({ query: 'Mushroom and Swiss Burger', page: 1, tenantId: 'store-1' });
  const data = await res.json();
  assertEquals([res.status, data.keyword], [200, 'burger']);
  assertEquals(asked(), ['mushroom swiss burger [food]', 'swiss burger [food]', 'mushroom swiss burger [all]', 'swiss burger [all]', 'burger [food]']);
});

test('Local dish: the local name, then English words; Chinese in Chinese', async () => {
  reset();
  state.pixabay = (u: URL) => (u.searchParams.get('q') === 'coconut rice' ? found('coconut rice') : nothing());
  let res = await call({ query: 'Nasi Lemak with Ayam Goreng', page: 1, tenantId: 'store-1' });
  let data = await res.json();
  assertEquals([res.status, data.keyword], [200, 'coconut rice']);
  assertEquals(asked(), ['nasi lemak [food]', 'coconut rice [food]']);
  reset();
  res = await call({ query: '咖啡 乌', page: 1, tenantId: 'store-1' });
  data = await res.json();
  const first = new URL(state.calls.find((c: any) => c.url.startsWith('https://pixabay.com/api/')).url);
  assertEquals([res.status, first.searchParams.get('q'), first.searchParams.get('lang'), first.searchParams.get('category')], [200, '咖啡 乌', 'zh', 'food']);
});

test(`At most ${MAX_ASKS} requests to Pixabay a search (answers kept from the day are free), then "No images found"`, async () => {
  reset();
  state.pixabay = nothing;
  let res = await call({ query: 'Grilled Chicken Caesar Salad 沙拉', page: 1, tenantId: 'store-1' });
  assertEquals(res.status, 404);
  assertEquals(asked().length, MAX_ASKS);
  assertEquals(state.refunds, 0, 'a search that found nothing is still a search');
  // The same again within the day: answered from what was kept; the rest are asked for.
  state.calls = [];
  res = await call({ query: 'Grilled Chicken Caesar Salad 沙拉', page: 1, tenantId: 'store-1' });
  assertEquals(res.status, 404);
  assertEquals(asked(), ['沙拉 [food]', '沙拉 [all]']);
  // "Chef's Special": nothing to search for.
  reset();
  res = await call({ query: "Chef's Special", page: 1, tenantId: 'store-1' });
  assertEquals(res.status, 404);
  assertEquals(asked(), []);
});

test('A later set with nothing: set 1', async () => {
  reset();
  state.pixabay = (u: URL) => (u.searchParams.get('page') === '1' ? { status: 200, body: { totalHits: 1, hits: [hit(1, u.searchParams.get('q')!)] } } : { status: 400, text: '[ERROR 400] "page" is out of valid range.' });
  const res = await call({ query: 'chicken rice', page: 3, tenantId: 'store-1' });
  const data = await res.json();
  assertEquals([res.status, data.page, data.photos.length, data.keyword], [200, 1, 1, 'chicken rice']);
});

test('Pixabay refusing, or no key: the month\'s search given back, 500 with the reason (for the logs)', async () => {
  reset();
  state.pixabay = () => ({ status: 429, text: 'Too many requests' });
  let res = await call({ query: 'laksa', page: 1, tenantId: 'store-1' });
  let data = await res.json();
  assertEquals(res.status, 500);
  assertMatch(data.error, /Pixabay API error: 429/);
  assertEquals(state.refunds, 1);
  reset();
  Deno.env.delete('PIXABAY_API_KEY');
  res = await call({ query: 'laksa', page: 1, tenantId: 'store-1' });
  data = await res.json();
  Deno.env.set('PIXABAY_API_KEY', 'pixabay-test-key');
  assertEquals(res.status, 500);
  assertMatch(data.error, /PIXABAY_API_KEY/);
  assertEquals(state.refunds, 1);
  assertEquals(asked(), [], 'not asked without a key');
});

test('Keep: the photo copied into the store\'s product photos; one that can\'t be fetched left out; no search used', async () => {
  reset();
  const res = await call({ action: 'keep', tenantId: 'store-1', photos: [
    { id: 'pixabay-1001', url: 'https://pixabay.com/get/g1def_1280.jpg' },
    { id: 'pixabay-1002', url: 'https://pixabay.com/get/missing_1280.jpg' },
  ] });
  const data = await res.json();
  assertEquals(res.status, 200);
  assertEquals(data.kept.length, 1);
  assertEquals(data.kept[0].from, 'https://pixabay.com/get/g1def_1280.jpg');
  assertMatch(data.kept[0].url, /^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/public\/product-images\/store-1\/products\/pixabay-1001-\d+-[0-9a-f]{6}\.jpg$/);
  assertEquals(state.uploads.length, 1);
  assert(!state.calls.some((c: any) => c.url.includes('/rpc/ai_monthly_take')), 'keeping uses no search');
  assert(state.calls.some((c: any) => c.url.includes('/rpc/ai_quota_take') && c.body.includes('photoKeep')), 'its own hourly cap');
});

test('Keep refuses an address that isn\'t Pixabay\'s, a wrong id, more than 8 or none (400), and someone without access (403)', async () => {
  reset();
  for (const photos of [
    [{ id: 'pixabay-1', url: 'https://evil.example/get/x.jpg' }],
    [{ id: 'x-1', url: 'https://pixabay.com/get/g1def_1280.jpg' }],
    Array.from({ length: 9 }, (_, i) => ({ id: `pixabay-${i}`, url: `https://pixabay.com/get/g${i}_1280.jpg` })),
    [],
  ]) {
    assertEquals((await call({ action: 'keep', tenantId: 'store-1', photos })).status, 400);
  }
  assertEquals(state.uploads.length, 0);
  state.store = null;
  assertEquals((await call({ action: 'keep', tenantId: 'store-1', photos: [{ id: 'pixabay-1001', url: 'https://pixabay.com/get/g1def_1280.jpg' }] })).status, 403);
});

test('Unknown actions, not signed in, too long, over the hour, the month used: refused, Pixabay not asked', async () => {
  reset();
  assertEquals((await call({ action: 'use', tenantId: 'store-1', downloadLocations: ['https://api.unsplash.com/photos/x/download'] })).status, 400);
  assertEquals((await call({ query: 'kopi', page: 1 }, '')).status, 401);
  assertEquals((await call({ query: 'x'.repeat(101), page: 1 })).status, 400);
  state.quota = false;
  assertEquals((await call({ query: 'kopi', page: 1 })).status, 429);
  state.quota = true;
  state.allowance = { allowed: false, limit: 3, resets_at: '2026-12-01T00:00:00+08:00' };
  const res = await call({ query: 'kopi', page: 1 });
  const data = await res.json();
  assertEquals([res.status, data.code], [429, 'allowance_used']);
  assertEquals(asked(), []);
});

test('Without its store of searches, a search still works (it just isn\'t kept)', async () => {
  reset();
  globalThis.fetch = (async (input: any, init?: any) => {
    const u = String(input instanceof Request ? input.url : input);
    if (u.includes('/rest/v1/photo_search_cache')) return new Response(JSON.stringify({ message: 'relation does not exist' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return standIn(input, init);
  }) as typeof fetch;
  try {
    const res = await call({ query: 'satay', page: 1, tenantId: 'store-1' });
    const data = await res.json();
    assertEquals([res.status, data.photos.length, data.keyword], [200, 2, 'satay']);
  } finally {
    globalThis.fetch = standIn;
  }
});
