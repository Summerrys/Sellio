// Explore's location pin on the server (supabase/migrations/20261128051007_explore_country.sql), in
// PGlite on stand-in tables shaped like the real ones: explore_shops and explore_merchants take a
// country (tenants.country), and without one answer exactly as their live versions (loaded here as
// they were on 28 Nov 2026) did. Calls by name (the API's) and by position (explore_complete's and
// explore_suggest's, from a plpgsql function whose plan was made before the change) still work, one
// function of each name is left, and only anon, authenticated and service_role may run them.
// Run: node verification/explore-country.test.mjs /tmp/sellio-verification
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

  -- explore_shops and explore_merchants as they are live (28 Nov 2026).
  CREATE OR REPLACE FUNCTION public.explore_shops(p_limit integer DEFAULT 20)
   RETURNS TABLE(shop_id text, shop_name text, shop_slug text, shop_logo_url text, shop_type text, item_count bigint)
   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
  AS $function$
    select t.id, btrim(t.name), t.slug, t.logo_url, t.seller_type, count(p.id)
      from public.tenants t
      join public.products p on p.tenant_id = t.id and coalesce(p.is_active, true)
     where t.is_public
       and t.slug is not null
       and app.can_sell(t.id)
     group by t.id, t.name, t.slug, t.logo_url, t.seller_type
     order by max(p.created_date) desc nulls last, t.id
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
  $function$;
  CREATE OR REPLACE FUNCTION public.explore_merchants(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
   RETURNS TABLE(shop_id text, shop_name text, shop_slug text, shop_logo_url text, industry text, item_count bigint, preview_images text[], last_listed_at timestamp with time zone)
   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
  AS $function$
    with q as (select nullif(lower(btrim(coalesce(p_search, ''))), '') as term)
    select t.id,
           btrim(t.name),
           t.slug,
           t.logo_url,
           t.industry,
           count(p.id),
           (array_agg(btrim(p.image_url) order by p.created_date desc nulls last, p.id)
              filter (where nullif(btrim(coalesce(p.image_url, '')), '') is not null))[1:4],
           max(p.created_date)
      from public.tenants t
      join public.products p on p.tenant_id = t.id and coalesce(p.is_active, true)
     cross join q
     where t.is_public
       and t.slug is not null
       and t.seller_type = 'merchant'
       and app.can_sell(t.id)
       and (q.term is null or strpos(lower(coalesce(t.name, '')), q.term) > 0)
     group by t.id, t.name, t.slug, t.logo_url, t.industry
     order by max(p.created_date) desc nulls last, t.id
     limit least(greatest(coalesce(p_limit, 24), 1), 60)
    offset greatest(coalesce(p_offset, 0), 0)
  $function$;
  revoke all on function public.explore_shops(integer) from public;
  grant execute on function public.explore_shops(integer) to anon, authenticated, service_role;
  revoke all on function public.explore_merchants(text, integer, integer) from public;
  grant execute on function public.explore_merchants(text, integer, integer) to anon, authenticated, service_role;

  -- Like explore_complete / explore_suggest: plpgsql calling explore_merchants by position.
  create function public.merchant_names(p_search text) returns text[] language plpgsql stable as $$
  begin
    return (select array_agg(x.shop_name order by x.shop_name) from public.explore_merchants(p_search, 60, 0) x);
  end $$;
`);

// Shops: Singapore and Malaysia, home shops and businesses; hidden / blocked / no address never
// listed; one shop with no country (only "every country" lists it).
await db.exec(`
  insert into public.tenants values
    ('cafe',   'Cafe Lumen',     'cafe-lumen', null, 'f&b',  'merchant',   true,  'SGD', 'Singapore'),
    ('kopi',   'Kopi Corner',    'kopi',       null, 'f&b',  'merchant',   true,  'MYR', 'Malaysia'),
    ('gadget', 'Gadget Bay',     'gadget',     null, 'retail','merchant',  true,  'SGD', 'Singapore'),
    ('bake',   'Bake Habit',     'bake',       null, '',     'individual', true,  'SGD', 'Singapore'),
    ('kuih',   'Kuih Mak Teh',   'kuih',       null, null,   'individual', true,  'MYR', 'Malaysia'),
    ('nocty',  'No Country',     'nocty',      null, null,   'individual', true,  'SGD', null),
    ('hidden', 'Hidden Shop',    'hidden',     null, null,   'individual', false, 'SGD', 'Singapore'),
    ('blocked','Blocked Shop',   'blocked',    null, null,   'merchant',   true,  'SGD', 'Singapore'),
    ('noslug', 'No Slug',        null,         null, null,   'individual', true,  'SGD', 'Singapore');
  insert into app.no_sell values ('blocked');
`);
const products = [];
const shops = ['cafe', 'kopi', 'gadget', 'bake', 'kuih', 'nocty', 'hidden', 'blocked', 'noslug'];
shops.forEach((shop, s) => {
  for (let i = 0; i < 3 + (s % 3); i += 1) {
    const day = String(1 + ((s * 7 + i * 3) % 27)).padStart(2, '0');
    products.push(`('${shop}-${i}', '${shop}', '${shop} item ${i}', ${5 + i}, null, ${i === 1 ? 'null' : `'https://img/${shop}-${i}.jpg'`}, ${i === 2 && s % 2 ? 'false' : 'true'}, '2026-11-${day}T10:00:00Z')`);
  }
});
await db.exec(`insert into public.products values ${products.join(',\n')};`);

const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const before = {
  shops: await rows('select * from public.explore_shops(20)'),
  shops2: await rows('select * from public.explore_shops(2)'),
  merchants: await rows('select * from public.explore_merchants(null, 24, 0)'),
  merchantsSearch: await rows("select * from public.explore_merchants('o', 24, 0)"),
  merchantsPage: await rows('select * from public.explore_merchants(null, 1, 1)'),
  names: (await rows("select public.merchant_names('') as n"))[0].n, // the plpgsql plan is made now
};
assert.ok(before.shops.length >= 5 && before.merchants.length === 3, 'the stand-in shops list as expected before the change');

await db.exec(await readFile(path.join(process.cwd(), 'supabase/migrations/20261128051007_explore_country.sql'), 'utf8'));

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${name}`); };

await check('Without a country: exactly the answers the live functions gave (shops, merchants, search, paging)', async () => {
  assert.deepEqual(await rows('select * from public.explore_shops(20)'), before.shops);
  assert.deepEqual(await rows('select * from public.explore_shops(2)'), before.shops2);
  assert.deepEqual(await rows('select * from public.explore_merchants(null, 24, 0)'), before.merchants);
  assert.deepEqual(await rows("select * from public.explore_merchants('o', 24, 0)"), before.merchantsSearch);
  assert.deepEqual(await rows('select * from public.explore_merchants(null, 1, 1)'), before.merchantsPage);
  assert.deepEqual(await rows('select * from public.explore_shops(20, null)'), before.shops);
});

await check('Called by name as the API does (p_limit := 20, no country) and by position from plpgsql made before the change', async () => {
  assert.deepEqual(await rows('select * from public.explore_shops(p_limit := 20)'), before.shops);
  assert.deepEqual(await rows('select * from public.explore_merchants(p_search := null, p_limit := 24, p_offset := 0)'), before.merchants);
  assert.deepEqual((await rows("select public.merchant_names('') as n"))[0].n, before.names);
});

await check('A country: only its shops, in the same order, for shops and merchants', async () => {
  const sg = await rows("select * from public.explore_shops(p_limit := 20, p_country := 'Singapore')");
  assert.deepEqual(sg.map((r) => r.shop_id), before.shops.filter((r) => ['cafe', 'gadget', 'bake'].includes(r.shop_id)).map((r) => r.shop_id));
  assert.deepEqual(sg, before.shops.filter((r) => ['cafe', 'gadget', 'bake'].includes(r.shop_id)), 'the same rows, just fewer');
  const my = await rows("select * from public.explore_shops(20, 'Malaysia')");
  assert.deepEqual(my.map((r) => r.shop_id).sort(), ['kopi', 'kuih']);
  assert.deepEqual(await rows("select * from public.explore_shops(20, 'Indonesia')"), [], 'no shops there yet');
  const mySellers = await rows("select * from public.explore_merchants(p_country := 'Malaysia')");
  assert.deepEqual(mySellers.map((r) => r.shop_id), ['kopi']);
  const sgSellers = await rows("select * from public.explore_merchants(null, 24, 0, 'Singapore')");
  assert.deepEqual(sgSellers, before.merchants.filter((r) => r.shop_id !== 'kopi'));
  assert.deepEqual(await rows("select * from public.explore_merchants('gadget', 24, 0, 'Singapore')").then((r) => r.map((x) => x.shop_id)), ['gadget']);
  assert.deepEqual(await rows("select * from public.explore_merchants('gadget', 24, 0, 'Malaysia')"), [], 'search and country together');
});

await check('A shop with no country shows only for every country; hidden, blocked and address-less shops never', async () => {
  assert.ok(before.shops.some((r) => r.shop_id === 'nocty'));
  for (const c of ['Singapore', 'Malaysia', 'Indonesia']) {
    const ids = (await rows('select shop_id from public.explore_shops(50, $1)', [c])).map((r) => r.shop_id);
    assert.ok(!ids.includes('nocty') && !ids.includes('hidden') && !ids.includes('blocked') && !ids.includes('noslug'), c);
  }
});

await check('One function of each name is left, run only by anon, authenticated and service_role (not everyone)', async () => {
  const fns = await rows(`select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('explore_shops', 'explore_merchants') order by 1`);
  assert.deepEqual(fns.map((f) => `${f.proname}(${f.args})`), [
    'explore_merchants(p_search text, p_limit integer, p_offset integer, p_country text)',
    'explore_shops(p_limit integer, p_country text)',
  ]);
  assert.ok(fns.every((f) => f.prosecdef), 'still security definer');
  for (const sig of ['public.explore_shops(integer, text)', 'public.explore_merchants(text, integer, integer, text)']) {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await rows(`select has_function_privilege('${role}', '${sig}', 'execute') as ok`))[0].ok, true, `${role} ${sig}`);
    }
    const acl = (await rows(`select proacl::text as acl from pg_proc where oid = '${sig}'::regprocedure`))[0].acl;
    assert.doesNotMatch(acl, /(^|[{,])=X/, `PUBLIC may not run ${sig}: ${acl}`);
  }
});

console.log(`${passed} checks passed`);
