// A shop's link follows its name; old links keep finding the shop
// (supabase/migrations/20261129030000_shop_link_follows_name.sql), in PGlite on a stand-in tenants
// table shaped like the real one.
// Run: node verification/shop-link.test.mjs /tmp/sellio-verification
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
  create table public.tenants (id text primary key default gen_random_uuid()::text, name text not null, slug text not null,
    owner_email text not null, logo_url text, industry text, currency text, country text, phone text, address text,
    payment_qr_url text, payment_qr_label text, payment_reference text, settings jsonb);
  create unique index tenants_slug_key on public.tenants (slug);
  create function app.can_sell(p_tenant_id text) returns boolean language sql stable as $$ select true $$;
  create function app.entitled(p_tenant_id text, p_key text) returns boolean language sql stable as $$ select true $$;
`);
const here = path.dirname(new URL(import.meta.url).pathname);
await db.exec(await readFile(path.join(here, '../supabase/migrations/20261129030000_shop_link_follows_name.sql'), 'utf8'));

const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const slugOf = async (id) => (await one('select slug from public.tenants where id = $1', [id])).slug;
const rename = (id, name) => db.query('update public.tenants set name = $2 where id = $1', [id, name]);
const store = (slug) => one('select id, slug from public.get_storefront_tenant($1)', [slug]);
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('ok -', name); };

await db.query(`insert into public.tenants (id, name, slug, owner_email) values
  ('t1', 'Lumity', 'lumity', 'a@x.sg'), ('t2', 'Cafe Ana', 'cafe-ana', 'b@x.sg'), ('t3', 'Cafe Ana', 'cafe-ana-2', 'c@x.sg'),
  ('t4', 'Xie Lao Ma 蟹老妈', 'xie-lao-ma', 'd@x.sg')`);

await check('renaming gives the link the new name makes, and the old link still finds the shop', async () => {
  await rename('t1', 'Lumiy');
  assert.equal(await slugOf('t1'), 'lumiy');
  assert.deepEqual(await store('lumity'), { id: 't1', slug: 'lumiy' });
  assert.deepEqual(await store('lumiy'), { id: 't1', slug: 'lumiy' });
});

await check('a link another shop has is skipped: -2, -3 …', async () => {
  await rename('t1', 'Cafe Ana');
  assert.equal(await slugOf('t1'), 'cafe-ana-3');
  assert.deepEqual(await store('lumity'), { id: 't1', slug: 'cafe-ana-3' });
  assert.deepEqual(await store('lumiy'), { id: 't1', slug: 'cafe-ana-3' });
});

await check('a link that already fits the new name stays', async () => {
  await rename('t3', 'CAFE   ana'); // cafe-ana-2 fits "cafe-ana"
  assert.equal(await slugOf('t3'), 'cafe-ana-2');
  await rename('t4', '蟹老妈'); // nothing a link can use
  assert.equal(await slugOf('t4'), 'xie-lao-ma');
  await db.query("update public.tenants set address = 'Blk 1' where id = 't4'");
  assert.equal(await slugOf('t4'), 'xie-lao-ma');
});

await check('going back to an earlier name gets its own old link back', async () => {
  await rename('t1', 'Lumity');
  assert.equal(await slugOf('t1'), 'lumity');
  assert.deepEqual(await store('cafe-ana-3'), { id: 't1', slug: 'lumity' });
  assert.deepEqual(await store('lumiy'), { id: 't1', slug: 'lumity' });
});

await check('no other shop can take an old link, by renaming or as a new shop', async () => {
  await rename('t2', 'Lumiy'); // lumiy was t1's
  assert.equal(await slugOf('t2'), 'lumiy-2');
  assert.deepEqual(await store('lumiy'), { id: 't1', slug: 'lumity' });
  await assert.rejects(
    db.query("insert into public.tenants (id, name, slug, owner_email) values ('t5', 'Lumiy', 'lumiy', 'e@x.sg')"),
    (error) => error.code === '23505',
  );
  await db.query("insert into public.tenants (id, name, slug, owner_email) values ('t5', 'Lumiy', 'lumiy-3', 'e@x.sg')");
  assert.equal(await slugOf('t5'), 'lumiy-3');
});

await check('a link set by hand keeps the old one working too', async () => {
  await db.query("update public.tenants set slug = 'xlm' where id = 't4'");
  assert.deepEqual(await store('xie-lao-ma'), { id: 't4', slug: 'xlm' });
});

await check('a link nobody has had finds nothing; a removed shop takes its old links with it', async () => {
  assert.equal(await store('no-such-shop'), undefined);
  await db.query("delete from public.tenants where id = 't1'");
  assert.equal(await store('lumity'), undefined);
  assert.equal(await store('cafe-ana-3'), undefined);
  assert.equal((await one('select count(*)::int as n from app.shop_link_history where tenant_id = $1', ['t1'])).n, 0);
});

await check('only the definer functions reach the history table', async () => {
  const rows = (await db.query(`select grantee from information_schema.role_table_grants
     where table_schema = 'app' and table_name = 'shop_link_history' and grantee in ('anon', 'authenticated')`)).rows;
  assert.deepEqual(rows, []);
});

console.log(`\n${passed} passed`);
