// Sellio Coins and Refer & earn for every shop (24 Nov 2026): the rules of
// supabase/migrations/20261124185818_coins_and_referral_coins.sql, on a local Postgres (PGlite, in
// WebAssembly). It builds the referral programme from this repository's migrations, adds Sellio
// World's coin tables and functions as they are in production (verification/coins.stubs.sql),
// applies the migration, and runs verification/coins-referrals.sql. The referral programme's own
// checks run again afterwards, so the distributor rules are shown unchanged.
// Run from the app root after installing PGlite into a temporary directory (with jsdom, so npm
// doesn't prune one when installing the other):
// npm install --prefix /tmp/sellio-verification --no-save --ignore-scripts jsdom@26.1.0 @electric-sql/pglite@0.3.16
// node verification/coins-referrals.test.mjs /tmp/sellio-verification
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const read = (file) => readFileSync(path.join(app, file), 'utf8');
const MIGRATION = 'supabase/migrations/20261124185818_coins_and_referral_coins.sql';

const db = new PGlite();
await db.exec(read('verification/referral-programme.stubs.sql'));
await db.exec(read('supabase/migrations/20261110090000_referral_programme.sql'));
await db.exec(read('supabase/migrations/20261120135956_referral_events_and_typed_codes.sql'));
await db.exec(read('supabase/migrations/20261120141926_referral_join_paying_shops.sql'));
await db.exec(read('verification/coins.stubs.sql'));

// The migration checks each function it replaces against production's definition (md5). The
// referral functions here come from this repository's migrations, so they must match exactly; the
// World functions are local copies (coins.stubs.sql), so their checks are pointed at the copies.
let migration = read(MIGRATION);
const guards = [...migration.matchAll(/\('([a-z_.]+\([^)]*\))', '([0-9a-f]{32})'\)/g)];
let mismatched = 0;
for (const [, fn, expected] of guards) {
  const { rows } = await db.query(`select md5(pg_get_functiondef($1::regprocedure)) as md5`, [fn]);
  const local = rows[0].md5;
  if (local === expected) continue;
  if (/^(app|public)\.world_/.test(fn)) {
    migration = migration.replace(`'${expected}'`, `'${local}'`);
  } else {
    console.log(`FAIL ${fn} differs from production (local md5 ${local}, production ${expected})`);
    mismatched += 1;
  }
}
if (guards.length !== 12) { console.log(`FAIL expected 12 guarded functions, found ${guards.length}`); mismatched += 1; }
await db.exec(read('supabase/migrations/20261124185500_coin_ledger_referral_reason.sql'));
await db.exec(migration);
await db.exec(read('supabase/migrations/20261125040000_world_wallet.sql'));

async function run(file) {
  try {
    await db.exec('begin;');
    await db.exec(read(file));
    throw new Error('The test should end by raising its results.');
  } catch (error) {
    await db.exec('rollback;').catch(() => {});
    const text = String(error.message || error);
    if (!text.startsWith('TEST RESULTS ')) throw error;
    return JSON.parse(text.slice('TEST RESULTS '.length));
  }
}

let failed = mismatched;
for (const file of [
  'verification/coins-referrals.sql',
  'verification/wallet.sql',
  'verification/referral-programme.sql',
  'verification/referral-events.sql',
  'verification/referral-joining.sql',
]) {
  const results = await run(file);
  for (const failure of results.failures) console.log(`FAIL ${path.basename(file)} ${failure.name}: ${failure.got}`);
  console.log(`${path.basename(file)}: ${results.passed} passed, ${results.failed} failed`);
  failed += results.failed + (results.passed === 0 ? 1 : 0);
}
if (failed > 0) process.exit(1);
