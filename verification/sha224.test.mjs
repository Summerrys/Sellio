// The login page's SHA-224 (src/lib/sha224.js) against Node's own: every length around the
// 64-byte blocks, accents and emoji, random texts, and an email code's token_hash the way
// Supabase Auth makes it (sha224 of the lower-case address and the code, hex).
// Run: node verification/sha224.test.mjs
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { sha224Hex, emailCodeTokenHash } from '../src/lib/sha224.js';

const node = (text) => createHash('sha224').update(Buffer.from(text, 'utf8')).digest('hex');
let passes = 0;
const passed = (name) => { passes++; console.log(`PASS ${name}`); };

assert.equal(sha224Hex(''), 'd14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f');
assert.equal(sha224Hex('abc'), '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7');
passed('the standard test values');

for (let n = 0; n <= 200; n++) assert.equal(sha224Hex('x'.repeat(n)), node('x'.repeat(n)), `length ${n}`);
for (const text of ['mei@kopi.sg482731', 'Bánh mì · 面包 · roti 🍞', '\u0000ÿ', 'a'.repeat(1000)]) assert.equal(sha224Hex(text), node(text));
for (let i = 0; i < 300; i++) {
  const text = randomBytes(1 + (i % 150)).toString('base64');
  assert.equal(sha224Hex(text), node(text));
}
passed('the same as Node for every length up to 200, accents, emoji and 300 random texts');

assert.equal(emailCodeTokenHash('  Mei.Ling@Gmail.com ', ' 482731 '), node('mei.ling@gmail.com482731'));
assert.match(emailCodeTokenHash('mei@kopi.sg', '000000'), /^[0-9a-f]{56}$/, 'what closed_account_by_email_link accepts');
passed('an email code\'s token_hash: the address in lower case, then the code; 56 hex characters');

console.log(`\n${passes} sha224 checks passed`);
