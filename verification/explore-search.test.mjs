// explore_search (supabase/migrations/20261127231518_explore_search.sql) in PGlite, on stand-in
// tables shaped like the real ones: what it lists, its category / deal method / country / price
// filters, its four sorts, total_count and paging. With no search and no filters it must list
// exactly what explore_feed lists, in explore_feed's order (explore_feed's live definition is
// loaded beside it).
// Run: node verification/explore-search.test.mjs /tmp/sellio-verification
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
  create table app.shop_selling (tenant_id text primary key, settings_saved boolean, collection_enabled boolean, delivery_enabled boolean);
  create table public.listing_likes (product_id text, user_id uuid default gen_random_uuid(), created_at timestamptz default now());
  create table app.no_sell (tenant_id text);
  create function app.can_sell(p_tenant_id text) returns boolean language sql stable
    as $$ select not exists (select 1 from app.no_sell n where n.tenant_id = p_tenant_id) $$;

  -- explore_feed as it is live (26 Nov 2026), to compare the default order with.
  CREATE OR REPLACE FUNCTION public.explore_feed(p_search text DEFAULT NULL::text, p_kind text DEFAULT NULL::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
   RETURNS TABLE(product_id text, product_name text, price numeric, compare_at_price numeric, image_url text, listed_at timestamp with time zone, shop_id text, shop_name text, shop_slug text, shop_logo_url text, shop_type text, currency text)
   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
  AS $function$
    with q as (select nullif(lower(btrim(coalesce(p_search, ''))), '') as term),
    items as (
      select p.id, btrim(p.name) as name, p.price, p.compare_at_price,
             btrim(p.image_url) as image_url, p.created_date,
             t.id as shop_id, btrim(t.name) as shop_name, t.slug, t.logo_url,
             t.seller_type, coalesce(t.currency, 'SGD') as currency,
             row_number() over (partition by t.id order by p.created_date desc nulls last, p.id) as shop_rank
        from public.products p
        join public.tenants t on t.id = p.tenant_id
       cross join q
       where t.is_public
         and t.slug is not null
         and app.can_sell(t.id)
         and coalesce(p.is_active, true)
         and nullif(btrim(coalesce(p.image_url, '')), '') is not null
         and (q.term is null
              or strpos(lower(coalesce(p.name, '')), q.term) > 0
              or strpos(lower(coalesce(t.name, '')), q.term) > 0)
         and (case coalesce(p_kind, 'all')
                when 'food'      then coalesce(t.industry, '') = 'f&b'
                when 'goods'     then nullif(btrim(coalesce(t.industry, '')), '') is not null and t.industry <> 'f&b'
                when 'home'      then t.seller_type = 'individual'
                when 'shops'     then t.seller_type = 'merchant'
                when 'merchants' then t.seller_type = 'merchant'
                else true
              end)
    )
    select id, name, price, compare_at_price, image_url, created_date,
           shop_id, shop_name, slug, logo_url, seller_type, currency
      from items
     order by shop_rank, created_date desc nulls last, id
     limit least(greatest(coalesce(p_limit, 24), 1), 60)
    offset greatest(coalesce(p_offset, 0), 0)
  $function$;
`);

// Shops. cafe: a business with no industry set (as Cafelicious is); kopi: a business marked F&B;
// gadget: a retail business; bake: a home shop with self-collection and delivery saved; pandan:
// self-collection only; thrift: no selling settings saved (self-collection by default); kuih: a
// Malaysian home shop, delivery only; hidden / blocked / noslug: never listed.
await db.exec(`
  insert into public.tenants values
    ('cafe',   'Cafe Lumen',    'cafe-lumen', null, null,          'merchant',   true,  'SGD', 'Singapore'),
    ('kopi',   'Kopi Corner',   'kopi',       null, 'f&b',         'merchant',   true,  'SGD', 'Singapore'),
    ('gadget', 'Gadget Bay',    'gadget',     null, 'retail',      'merchant',   true,  'SGD', 'Singapore'),
    ('bake',   'Bake Habit',    'bake',       null, '',            'individual', true,  'SGD', 'Singapore'),
    ('pandan', 'Pandan & Co.',  'pandan',     null, null,          'individual', true,  'SGD', 'Singapore'),
    ('thrift', 'Thrift Lane',   'thrift',     null, '',            'individual', true,  'SGD', 'Singapore'),
    ('kuih',   'Kuih Cik Nah',  'kuih',       null, '',            'individual', true,  'MYR', 'Malaysia'),
    ('hidden', 'Hidden Cakes',  'hidden',     null, '',            'individual', false, 'SGD', 'Singapore'),
    ('blocked','Blocked Cakes', 'blocked',    null, '',            'individual', true,  'SGD', 'Singapore'),
    ('noslug', 'No Slug Cakes', null,         null, '',            'individual', true,  'SGD', 'Singapore');
  insert into app.shop_selling values
    ('bake', true, true, true),
    ('pandan', true, true, false),
    ('kuih', true, false, true),
    ('thrift', false, false, true);  -- not saved: read as the defaults (self-collection on, no delivery)
  insert into app.no_sell values ('blocked');
  insert into public.products values
    ('cafe1',  'cafe',   'Chocolate lava cake',            7.90, null, 'x.jpg', true,  now() - interval '2 days'),
    ('cafe2',  'cafe',   'Kaya toast set',                 4.80, null, 'x.jpg', true,  now() - interval '3 days'),
    ('kopi1',  'kopi',   'Rainbow cake slice',             6.50, null, 'x.jpg', true,  now() - interval '6 days'),
    ('kopi2',  'kopi',   'Kopi C',                         1.80, null, 'x.jpg', true,  now() - interval '1 hour'),
    ('gad1',   'gadget', 'Stand mixer, great for cakes',   120,  159,  'x.jpg', true,  now() - interval '7 days'),
    ('gad2',   'gadget', 'Wireless earbuds',               45,   69,   'x.jpg', true,  now() - interval '2 days'),
    ('bake1',  'bake',   'Burnt Basque cheesecake',        38,   null, 'x.jpg', true,  now() - interval '3 days'),
    ('bake2',  'bake',   'Cake',                           30,   null, 'x.jpg', true,  now() - interval '9 days'),
    ('bake3',  'bake',   'Earl Grey loaf',                 14,   null, 'x.jpg', true,  now() - interval '2 days'),
    ('pan1',   'pandan', 'Pandan chiffon cake',            18,   null, 'x.jpg', true,  now() - interval '1 day'),
    ('pan2',   'pandan', 'Mini cupcakes, box of 12',       16,   null, 'x.jpg', true,  now() - interval '3 hours'),
    ('thr1',   'thrift', 'Glass cake stand with dome',     15,   null, 'x.jpg', true,  now() - interval '6 hours'),
    ('thr2',   'thrift', 'Rattan tote bag',                25,   null, 'x.jpg', true,  now() - interval '1 day'),
    ('kuih1',  'kuih',   'Kek lapis Sarawak',              45,   null, 'x.jpg', true,  now() - interval '2 days'),
    ('kuih2',  'kuih',   'Vintage cake tin set',           28,   null, 'x.jpg', true,  now() - interval '3 days'),
    ('off1',   'bake',   'Old cake (switched off)',        10,   null, 'x.jpg', false, now()),
    ('nopic',  'bake',   'Cake without a photo',           10,   null, '  ',    true,  now()),
    ('hid1',   'hidden', 'Secret cake',                    10,   null, 'x.jpg', true,  now()),
    ('blk1',   'blocked','Blocked cake',                   10,   null, 'x.jpg', true,  now()),
    ('nos1',   'noslug', 'Slugless cake',                  10,   null, 'x.jpg', true,  now());
  insert into public.listing_likes (product_id) values ('pan1'), ('pan1'), ('pan1'), ('thr1'), ('kopi1'), ('kopi1');
`);

await db.exec(await readFile(path.join(process.cwd(), 'supabase/migrations/20261127231518_explore_search.sql'), 'utf8'));

const search = async (args = {}) => {
  const a = { p_search: null, p_kind: null, p_sort: 'best', p_deal: null, p_country: null, p_currency: 'SGD', p_min: null, p_max: null, p_limit: 60, p_offset: 0, ...args };
  const { rows } = await db.query(
    'select * from public.explore_search($1, $2, $3, $4::text[], $5, $6, $7, $8, $9, $10)',
    [a.p_search, a.p_kind, a.p_sort, a.p_deal, a.p_country, a.p_currency, a.p_min, a.p_max, a.p_limit, a.p_offset],
  );
  return rows;
};
const ids = (rows) => rows.map((r) => r.product_id);
const sorted = (list) => [...list].sort();

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${name}`); };

await check('No search, no filters: exactly explore_feed, in its order', async () => {
  const feed = (await db.query('select * from public.explore_feed(null, null, 60, 0)')).rows;
  const rows = await search();
  assert.deepEqual(ids(rows), ids(feed));
  assert.equal(rows.length, 15);
  for (const kind of ['food', 'goods', 'home', 'merchants', 'shops']) {
    const f = (await db.query('select * from public.explore_feed(null, $1, 60, 0)', [kind])).rows;
    assert.deepEqual(ids(await search({ p_kind: kind })), ids(f), `kind ${kind}`);
  }
});

await check('Never lists hidden shops, shops that cannot sell, shops with no address, items switched off or without a photo', async () => {
  const all = ids(await search({ p_search: 'cake' }));
  for (const id of ['off1', 'nopic', 'hid1', 'blk1', 'nos1']) assert.ok(!all.includes(id), id);
});

await check('Best match for "cake": whole name, whole word, word start, inside a word; ties by likes, then newest', async () => {
  const rows = await search({ p_search: 'Cake', p_currency: 'SGD' });
  assert.deepEqual(ids(rows), [
    'bake2',            // "Cake": the whole name
    'pan1', 'kopi1',    // "cake" as a word: 3 likes, then 2 likes
    'thr1',             // a word, 1 like
    'cafe1',            // a word, no likes
    'kuih2',            // a word, no likes, older
    'gad1',             // "cakes": a word starting with it
    'pan2', 'bake1',    // inside a word ("cupcakes", newer; "cheesecake")
  ]);
  assert.ok(rows.every((r) => Number(r.total_count) === 9));
});

await check('A search that only matches a shop\'s name comes after every name match', async () => {
  const rows = await search({ p_search: 'pandan' });
  assert.deepEqual(ids(rows), ['pan1', 'pan2']);   // "Pandan chiffon cake" (a word), then the shop's other item
});

await check('Deal method: meet-up is home self-collection (on unless saved off) and a business\'s takeaway', async () => {
  const meet = sorted(ids(await search({ p_deal: ['meetup'] })));
  assert.deepEqual(meet, sorted(['cafe1', 'cafe2', 'kopi1', 'kopi2', 'gad1', 'gad2', 'bake1', 'bake2', 'bake3', 'pan1', 'pan2', 'thr1', 'thr2']));
  assert.ok(!meet.includes('kuih1'), 'Kuih Cik Nah saved self-collection off');
});

await check('Deal method: delivery is a home shop that saved delivery on (unsaved settings mean no delivery)', async () => {
  assert.deepEqual(sorted(ids(await search({ p_deal: ['delivery'] }))), sorted(['bake1', 'bake2', 'bake3', 'kuih1', 'kuih2']));
});

await check('Deal method: both, or none picked, lists everything', async () => {
  assert.equal((await search({ p_deal: ['meetup', 'delivery'] })).length, 15);
  assert.equal((await search({ p_deal: [] })).length, 15);
});

await check('Country: one country, or every country when none is picked', async () => {
  assert.deepEqual(sorted(ids(await search({ p_country: 'Malaysia' }))), ['kuih1', 'kuih2']);
  assert.equal((await search({ p_country: 'Singapore' })).length, 13);
  assert.equal((await search({ p_country: 'Indonesia' })).length, 0);
  assert.equal((await search({ p_country: null })).length, 15);
});

await check('Price range: in the buyer\'s currency only (S$10 and RM10 are not the same money)', async () => {
  const sgd = await search({ p_min: 10, p_max: 30, p_currency: 'SGD' });
  assert.deepEqual(sorted(ids(sgd)), sorted(['bake2', 'bake3', 'pan1', 'pan2', 'thr1', 'thr2']));
  assert.ok(sgd.every((r) => r.currency === 'SGD'));
  assert.deepEqual(sorted(ids(await search({ p_max: 30, p_currency: 'myr' }))), ['kuih2']);
  assert.deepEqual(sorted(ids(await search({ p_min: 100, p_currency: 'SGD' }))), ['gad1']);
});

await check('Price sorts: the buyer\'s currency first, each by its own price; then newest', async () => {
  const up = await search({ p_sort: 'price_asc', p_currency: 'SGD' });
  const sgdUp = up.filter((r) => r.currency === 'SGD').map((r) => Number(r.price));
  assert.deepEqual(sgdUp, [...sgdUp].sort((a, b) => a - b));
  assert.deepEqual(up.slice(-2).map((r) => r.currency), ['MYR', 'MYR']);
  assert.deepEqual(ids(up.slice(-2)), ['kuih2', 'kuih1']);        // RM28, then RM45
  const down = await search({ p_sort: 'price_desc', p_currency: 'MYR' });
  assert.deepEqual(ids(down.slice(0, 2)), ['kuih1', 'kuih2']);    // RM45, RM28 first for a Malaysian buyer
  assert.equal(ids(down)[2], 'gad1');                             // then S$120 …
  assert.equal(Number(down.at(-1).price), 1.8);                   // … down to S$1.80
});

await check('Recent: newest first', async () => {
  const rows = await search({ p_sort: 'recent' });
  const times = rows.map((r) => new Date(r.listed_at).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  assert.equal(rows[0].product_id, 'kopi2');
});

await check('An unknown sort is best match; filters combine', async () => {
  assert.deepEqual(ids(await search({ p_search: 'cake', p_sort: 'nearby' })), ids(await search({ p_search: 'cake' })));
  const rows = await search({ p_search: 'cake', p_kind: 'home', p_deal: ['delivery'], p_country: 'Singapore', p_max: 35 });
  assert.deepEqual(ids(rows), ['bake2']);
});

await check('total_count is every match, whatever the page; the page size stays 1–60', async () => {
  const one = await search({ p_search: 'cake', p_limit: 1 });
  assert.equal(one.length, 1);
  assert.equal(Number(one[0].total_count), 9);
  const page2 = await search({ p_search: 'cake', p_limit: 4, p_offset: 4 });
  assert.deepEqual(ids(page2), ids(await search({ p_search: 'cake' })).slice(4, 8));
  assert.equal((await search({ p_limit: 0 })).length, 1);
  assert.equal((await search({ p_limit: 500 })).length, 15);
  assert.equal((await search({ p_offset: -5 })).length, 15);
  assert.deepEqual(await search({ p_search: 'no such thing' }), []);
});

await check('Searches are taken literally (no wildcards), any case and spacing', async () => {
  assert.deepEqual(await search({ p_search: '%' }), []);
  assert.deepEqual(await search({ p_search: '_' }), []);
  assert.deepEqual(ids(await search({ p_search: '  CHIFFON  ' })), ['pan1']);
  assert.deepEqual(ids(await search({ p_search: 'box of 12' })), ['pan2']);
});

console.log(`\n${passed} explore_search checks passed`);
