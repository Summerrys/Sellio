// Referral programme, phase 1 (10 Nov 2026): every rule of the database functions in
// supabase/migrations/20261110090000_referral_programme.sql, on a local Postgres (PGlite, in
// WebAssembly) with stand-ins for Sellio's tables and helpers (referral-programme.stubs.sql). The
// checks are verification/referral-programme.sql, which also runs as-is on the live database: it
// ends by raising its results, so nothing stays.
// Run from the app root after installing PGlite into a temporary directory (with jsdom, so npm
// doesn't prune one when installing the other):
// npm install --prefix /tmp/sellio-verification --no-save --ignore-scripts jsdom@26.1.0 @electric-sql/pglite@0.3.16
// node verification/referral-programme.test.mjs /tmp/sellio-verification
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const read = (file) => readFileSync(path.join(app, file), 'utf8');

const db = new PGlite();
await db.exec(read('verification/referral-programme.stubs.sql'));
await db.exec(read('supabase/migrations/20261110090000_referral_programme.sql'));
let results;
try {
  await db.exec('begin;');
  await db.exec(read('verification/referral-programme.sql'));
  throw new Error('The test should end by raising its results.');
} catch (error) {
  const text = String(error.message || error);
  if (!text.startsWith('TEST RESULTS ')) throw error;
  results = JSON.parse(text.slice('TEST RESULTS '.length));
}
for (const failure of results.failures) console.log(`FAIL ${failure.name}: ${failure.got}`);
console.log(`referral programme: ${results.passed} passed, ${results.failed} failed`);
if (results.failed > 0 || results.passed === 0) process.exit(1);
