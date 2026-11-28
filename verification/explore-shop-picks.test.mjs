// Shops on Sellio as cards (supabase/migrations/20261128155741_explore_shop_picks.sql), in PGlite on
// stand-in tables shaped like the real ones: explore_shops also brings each shop's currency and its
// three newest listings with a photo (picks), and its first six columns answer exactly as the live
// function (as it was on 28 Nov 2026, from 20261128051007_explore_country.sql) did, called by
// position and by name, with and without a country. One function is left, still security definer
// with an empty search path, run only by anon, authenticated and service_role.
// Run: node verification/explore-shop-picks.test.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();

await db.exec(`
  create schema app;
  create role anon; create role authenticated; create role service_role;
  create table public.tenants (id text primary key, name text, slug text, logo_url text, industry text, seller_type text,
    is_public boolean, currency text, country text);
  create table public.products (id text primary key, tenant_id text, name text, price numeric, compare_at_price numeric,
    image_url text, is_active boolean, created_date timestamptz);
  create table app.no_sell (tenant_id text);
  create function app.can_sell(p_tenant_id text) returns boolean language sql stable
    as $$ select not exists (select 1 from app.no_sell n where n.tenant_id = p_tenant_id) $$;

  -- explore_shops as it is live (28 Nov 2026, 20261128051007_explore_country.sql).
  create function public.explore_shops(p_limit integer default 20, p_country text default null)
   returns table(shop_id text, shop_name text, shop_slug text, shop_logo_url text, shop_type text, item_count bigint)
   language sql
   stable security definer
   set search_path to ''
  as $function$
    select t.id, btrim(t.name), t.slug, t.logo_url, t.seller_type, count(p.id)
      from public.tenants t
      join public.products p on p.tenant_id = t.id and coalesce(p.is_active, true)
     where t.is_public
       and t.slug is not null
       and app.can_sell(t.id)
       and (p_country is null or t.country = p_country)
     group by t.id, t.name, t.slug, t.logo_url, t.seller_type
     order by max(p.created_date) desc nulls last, t.id
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
  $function$;
  revoke all on function public.explore_shops(integer, text) from public;
  grant execute on function public.explore_shops(integer, text) to anon, authenticated, service_role;
`);

await db.exec(`
  insert into public.tenants values
    ('bake',    ' Bake Habit ',  'bake',    'https://img/bake.png', '',    'individual', true,  'SGD', 'Singapore'),
    ('kopi',    'Kopi Corner',   'kopi',    null,                   'f&b', 'merchant',   true,  'MYR', 'Malaysia'),
    ('nophoto', 'No Photos',     'nophoto', null,                   null,  'individual', true,  'SGD', 'Singapore'),
    ('nocur',   'No Currency',   'nocur',   null,                   null,  'individual', true,  null,  'Singapore'),
    ('hidden',  'Hidden Shop',   'hidden',  null,                   null,  'individual', false, 'SGD', 'Singapore'),
    ('blocked', 'Blocked Shop',  'blocked', null,                   null,  'merchant',   true,  'SGD', 'Singapore'),
    ('noslug',  'No Slug',       null,      null,                   null,  'individual', true,  'SGD', 'Singapore');
  insert into app.no_sell values ('blocked');
  insert into public.products values
    -- Bake Habit: five listings with photos; the newest three are picked, newest first.
    ('bake-1', 'bake', ' Lava cake ', 9.00, null, ' https://img/bake-1.jpg ', true, '2026-11-20T10:00:00Z'),
    ('bake-2', 'bake', 'Kaya toast',  3.50, 4.00, 'https://img/bake-2.jpg',   true, '2026-11-24T10:00:00Z'),
    ('bake-3', 'bake', 'Milk tea',    4.20, null, 'https://img/bake-3.jpg',   null, '2026-11-26T10:00:00Z'),
    ('bake-4', 'bake', 'Scone',       2.80, null, 'https://img/bake-4.jpg',   true, '2026-11-01T10:00:00Z'),
    ('bake-5', 'bake', 'Cookie',      1.50, null, 'https://img/bake-5.jpg',   true, null),
    -- Kopi Corner: the newest has no photo, the next a blank one, the next is taken down; two
    -- share a time (then by id); prices in its own currency.
    ('kopi-a', 'kopi', 'Kopi O',      2.20, null, null,                     true,  '2026-11-27T10:00:00Z'),
    ('kopi-b', 'kopi', 'Teh tarik',   2.50, null, '   ',                    true,  '2026-11-27T09:00:00Z'),
    ('kopi-c', 'kopi', 'Old toast',   1.00, null, 'https://img/kopi-c.jpg', false, '2026-11-27T08:00:00Z'),
    ('kopi-e', 'kopi', 'Half-boiled', 3.00, null, 'https://img/kopi-e.jpg', true,  '2026-11-25T10:00:00Z'),
    ('kopi-d', 'kopi', 'Roti bakar',  4.80, null, 'https://img/kopi-d.jpg', true,  '2026-11-25T10:00:00Z'),
    -- No Photos: listed, two items, nothing to pick.
    ('np-1', 'nophoto', 'Mystery box', 10, null, null, true, '2026-11-22T10:00:00Z'),
    ('np-2', 'nophoto', 'Mystery bag', 12, null, '',   true, '2026-11-21T10:00:00Z'),
    -- No Currency: Singapore dollars.
    ('nc-1', 'nocur', 'Ang ku kueh', 1.20, null, 'https://img/nc-1.jpg', true, '2026-11-19T10:00:00Z'),
    -- Never listed.
    ('h-1', 'hidden',  'Hidden item',  5, null, 'https://img/h-1.jpg', true, '2026-11-28T10:00:00Z'),
    ('b-1', 'blocked', 'Blocked item', 5, null, 'https://img/b-1.jpg', true, '2026-11-28T10:00:00Z'),
    ('n-1', 'noslug',  'No slug item', 5, null, 'https://img/n-1.jpg', true, '2026-11-28T10:00:00Z');
`);

const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const CALLS = [
  'select * from public.explore_shops(20)',
  'select * from public.explore_shops(2)',
  'select * from public.explore_shops(p_limit := 20)',
  "select * from public.explore_shops(20, 'Singapore')",
  "select * from public.explore_shops(p_limit := 20, p_country := 'Malaysia')",
  "select * from public.explore_shops(20, 'Indonesia')",
];
const before = [];
for (const sql of CALLS) before.push(await rows(sql));
assert.ok(before[0].length === 4, 'four stand-in shops are listed before the change');

await db.exec(await readFile(path.join(process.cwd(), 'supabase/migrations/20261128155741_explore_shop_picks.sql'), 'utf8'));

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${name}`); };
const firstSix = ({ shop_id, shop_name, shop_slug, shop_logo_url, shop_type, item_count }) => ({ shop_id, shop_name, shop_slug, shop_logo_url, shop_type, item_count });
const shop = async (id) => (await rows('select * from public.explore_shops(50)')).find((r) => r.shop_id === id);

await check('The first six columns answer exactly as before, by position and by name, with and without a country', async () => {
  for (const [i, sql] of CALLS.entries()) {
    assert.deepEqual((await rows(sql)).map(firstSix), before[i], sql);
  }
});

await check('Each shop brings its currency (Singapore dollars when none is set)', async () => {
  assert.equal((await shop('bake')).currency, 'SGD');
  assert.equal((await shop('kopi')).currency, 'MYR');
  assert.equal((await shop('nocur')).currency, 'SGD');
});

await check('Picks: the three newest listings with a photo, newest first, names and photo links trimmed', async () => {
  assert.deepEqual((await shop('bake')).picks, [
    { id: 'bake-3', name: 'Milk tea', price: 4.2, image_url: 'https://img/bake-3.jpg' },
    { id: 'bake-2', name: 'Kaya toast', price: 3.5, image_url: 'https://img/bake-2.jpg' },
    { id: 'bake-1', name: 'Lava cake', price: 9, image_url: 'https://img/bake-1.jpg' },
  ]);
});

await check('Picks skip listings with no photo or a blank one and taken-down listings; a tie goes by id', async () => {
  assert.deepEqual((await shop('kopi')).picks.map((p) => p.id), ['kopi-d', 'kopi-e']);
  assert.equal((await shop('kopi')).item_count, 4, 'item_count still counts every active listing');
});

await check('A shop whose listings have no photos is still listed, with no picks', async () => {
  const s = await shop('nophoto');
  assert.ok(s, 'listed');
  assert.deepEqual(s.picks, []);
  assert.equal(s.item_count, 2);
});

await check("Picks come only from the shop's own listings, never a hidden, blocked or address-less shop's", async () => {
  const all = await rows('select * from public.explore_shops(50)');
  for (const s of all) assert.ok(s.picks.every((p) => p.id.startsWith(s.shop_id === 'nophoto' ? 'np' : s.shop_id === 'nocur' ? 'nc' : s.shop_id)), s.shop_id);
  const ids = all.flatMap((s) => s.picks.map((p) => p.id));
  for (const never of ['h-1', 'b-1', 'n-1']) assert.ok(!ids.includes(never), never);
});

await check('One explore_shops is left: security definer, empty search path, run only by anon, authenticated and service_role', async () => {
  const fns = await rows(`select pg_get_function_identity_arguments(p.oid) as args, p.prosecdef, p.proconfig, p.provolatile
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'explore_shops'`);
  assert.deepEqual(fns.map((f) => f.args), ['p_limit integer, p_country text']);
  assert.equal(fns[0].prosecdef, true);
  assert.equal(fns[0].provolatile, 's');
  assert.deepEqual(fns[0].proconfig, ['search_path=""']);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await rows(`select has_function_privilege('${role}', 'public.explore_shops(integer, text)', 'execute') as ok`))[0].ok, true, role);
  }
  const acl = (await rows("select proacl::text as acl from pg_proc where oid = 'public.explore_shops(integer, text)'::regprocedure"))[0].acl;
  assert.doesNotMatch(acl, /(^|[{,])=X/, `PUBLIC may not run explore_shops: ${acl}`);
});

console.log(`${passed} checks passed`);
