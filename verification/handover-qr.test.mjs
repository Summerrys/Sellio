// Handover QR (23 Nov 2026): supabase/migrations/20261123094152_handover_qr.sql on a local Postgres
// (PGlite, in WebAssembly), with stand-ins for Supabase's tables and helpers
// (handover-qr.stubs.sql). Checks that the migration gives open orders from before it their QR
// (for the buyer who placed them), then runs verification/handover-qr.sql, which also runs as-is on the live database: it ends by
// raising its results, so nothing stays.
// Run from the app root after installing PGlite into a temporary directory (with jsdom, so npm
// doesn't prune one when installing the other):
// npm install --prefix /tmp/sellio-verification --no-save --ignore-scripts jsdom@26.1.0 @electric-sql/pglite@0.3.16
// node verification/handover-qr.test.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const read = (file) => readFileSync(path.join(app, file), 'utf8');

const db = new PGlite();
await db.exec(read('verification/handover-qr.stubs.sql'));
// Orders from before the migration: open and done, a home seller's and a business store's.
await db.exec(`
  insert into public.tenants (id, name, slug, owner_email, seller_type) values
    ('home', 'Home', 'home', 'h@example.com', 'individual'), ('biz', 'Biz', 'biz', 'b@example.com', 'merchant');
  insert into public.orders (id, tenant_id, order_number, status, total_amount, buyer_id) values
    ('before-open', 'home', 'A1', 'ready', 5, '00000000-0000-4000-8000-000000000001'),
    ('before-pending', 'home', 'A2', 'pending', 5, null),
    ('before-done', 'home', 'A3', 'completed', 5, '00000000-0000-4000-8000-000000000001'),
    ('before-cancelled', 'home', 'A4', 'cancelled', 5, null),
    ('before-biz', 'biz', 'B1', 'ready', 5, null);
`);
await db.exec(read('supabase/migrations/20261123094152_handover_qr.sql'));
const { rows } = await db.query('select order_id, holder_uid from app.order_handovers order by order_id');
assert.deepEqual(rows, [{ order_id: 'before-open', holder_uid: '00000000-0000-4000-8000-000000000001' }],
  'only the open home-seller order with a signed-in buyer gets a QR');
// The shop can no longer mark that one collected itself; the one with no buyer still can.
const asShop = async (sql) => {
  await db.exec(`
    begin;
    select set_config('request.jwt.claims',
      '{"sub": "00000000-0000-4000-8000-0000000000aa", "email": "h@example.com", "role": "authenticated"}', true);
    set local role authenticated;
    ${sql};
    commit;
  `);
};
await db.exec(`insert into public.tenant_users (tenant_id, user_email, status, is_owner, user_name)
               values ('home', 'h@example.com', 'active', true, 'Hana')`);
await assert.rejects(asShop(`update public.orders set status = 'completed' where id = 'before-open'`),
  /Scan the buyer’s QR to hand over this order\./, 'an open order from before is now handed over only by a scan');
await db.exec('rollback');
await asShop(`update public.orders set status = 'completed' where id = 'before-pending'`);
const states = await db.query(`select id, status::text as status from public.orders where id in ('before-open', 'before-pending') order by id`);
assert.deepEqual(states.rows, [{ id: 'before-open', status: 'ready' }, { id: 'before-pending', status: 'completed' }]);
console.log('PASS The migration gives open home-seller orders from before it their QR (for their buyer): they\'re handed over only by a scan; not done ones, ones with no buyer or business stores\'');

let results;
try {
  await db.exec('begin;');
  await db.exec(read('verification/handover-qr.sql'));
  throw new Error('The test should end by raising its results.');
} catch (error) {
  const text = String(error.message || error);
  if (!text.startsWith('TEST RESULTS ')) throw error;
  results = JSON.parse(text.slice('TEST RESULTS '.length));
}
for (const failure of results.failures) console.log(`FAIL ${failure.name}: ${failure.got}`);
console.log(`handover QR: ${results.passed + 1} passed, ${results.failed} failed`);
if (results.failed > 0 || results.passed === 0) process.exit(1);
