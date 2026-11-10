// Profile photos per sign-in (11 Nov 2026): supabase/migrations/20261111010000_profile_photo_per_sign_in.sql
// on a local Postgres (PGlite, in WebAssembly), after the migration before it
// (20261110021000_profile_photo.sql), with stand-ins for Supabase's tables and helpers
// (profile-photo.stubs.sql). Checks the choices made before are copied to their sign-ins, then
// runs verification/profile-photo.sql, which also runs as-is on the live database: it ends by
// raising its results, so nothing stays.
// Run from the app root after installing PGlite into a temporary directory (with jsdom, so npm
// doesn't prune one when installing the other):
// npm install --prefix /tmp/sellio-verification --no-save --ignore-scripts jsdom@26.1.0 @electric-sql/pglite@0.3.16
// node verification/profile-photo.test.mjs /tmp/sellio-verification
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const read = (file) => readFileSync(path.join(app, file), 'utf8');

const SUMMER = '11111111-1111-4111-8111-111111111111';
const LETTER = '22222222-2222-4222-8222-222222222222';
const NOBODY = '33333333-3333-4333-8333-333333333333';

const db = new PGlite();
await db.exec(read('verification/profile-photo.stubs.sql'));
await db.exec(read('supabase/migrations/20261110021000_profile_photo.sql'));
// Choices made before 11 Nov, on app_users rows (set as set_profile_photo set them).
await db.exec(`
  select set_config('sellio.profile_photo', 'on', false);
  insert into auth.users (id, email) values
    ('${SUMMER}', 'summer@example.com'), ('${LETTER}', 'Letter@Example.com'), ('${NOBODY}', 'nobody-chose@example.com');
  insert into public.app_users (email, role, photo_choice, photo_path, created_date) values
    ('summer@example.com', 'admin', 'upload', '${SUMMER}/1794273360987.webp', now()),
    ('letter@example.com ', 'admin', 'none', null, now() - interval '1 day'),
    ('letter@example.com', 'staff', 'upload', '${LETTER}/1794273360000.webp', now()),
    ('nobody-chose@example.com', 'admin', null, null, now()),
    ('no-sign-in@example.com', 'admin', 'none', null, now());
  select set_config('sellio.profile_photo', '', false);
`);
await db.exec(read('supabase/migrations/20261111010000_profile_photo_per_sign_in.sql'));
const copied = (await db.query('select user_id::text as user_id, choice, path from app.profile_photos order by user_id')).rows;
assert.deepEqual(copied, [
  { user_id: SUMMER, choice: 'upload', path: `${SUMMER}/1794273360987.webp` },
  { user_id: LETTER, choice: 'none', path: null },
], 'each sign-in keeps the choice its earliest app_users row had; no choice, or no sign-in: nothing');
console.log('PASS the choices made before are copied to their sign-ins');

let results;
try {
  await db.exec('begin;');
  await db.exec(read('verification/profile-photo.sql'));
  throw new Error('The test should end by raising its results.');
} catch (error) {
  const text = String(error.message || error);
  if (!text.startsWith('TEST RESULTS ')) throw error;
  results = JSON.parse(text.slice('TEST RESULTS '.length));
}
for (const failure of results.failures) console.log(`FAIL ${failure.name}: ${failure.got}`);
console.log(`profile photos: ${results.passed} passed, ${results.failed} failed`);
if (results.failed > 0 || results.passed === 0) process.exit(1);
