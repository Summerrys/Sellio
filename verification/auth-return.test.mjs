// node verification/auth-return.test.mjs
// Sign-in results that Supabase sends to the start page (its Site URL) instead of /Auth go to /Auth
// before the app starts (src/lib/authReturn.js), with the query the sign-in started with.
import assert from 'node:assert/strict';
import { rememberAuthReturn, sendSignInResultToAuth } from '../src/lib/authReturn.js';

function browserAt(address, stored = {}) {
  const url = new URL(address);
  const store = { ...stored };
  const browser = {
    location: { origin: url.origin, pathname: url.pathname, search: url.search, hash: url.hash },
    history: {
      state: { idx: 0 },
      replaceState(state, _title, to) { browser.moved = { state, to }; },
    },
    sessionStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    store,
  };
  return browser;
}

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log('ok -', name); };
const NOW = Date.parse('2026-11-29T03:00:00Z');

check('a closed account refused by Supabase lands on /Auth with the error after the #', () => {
  const b = browserAt('https://sellio.sg/?error=access_denied&error_code=user_banned&error_description=User+is+banned#error=access_denied&error_description=User+is+banned&error_code=user_banned');
  const to = sendSignInResultToAuth(b, NOW);
  assert.equal(to, '/Auth#error=access_denied&error_description=User+is+banned&error_code=user_banned');
  assert.equal(b.moved.to, to);
  assert.deepEqual(b.moved.state, { idx: 0 }, 'the history entry keeps its state');
  assert.equal(new URLSearchParams(to.split('#')[1]).get('error_code'), 'user_banned');
});

check('a Google sign-up keeps join=1 from where it started', () => {
  const start = browserAt('https://sellio.sg/Auth?join=1');
  rememberAuthReturn('https://sellio.sg/Auth?join=1', start);
  const back = browserAt('https://sellio.sg/#access_token=abc&refresh_token=def&token_type=bearer', start.store);
  // what rememberAuthReturn kept is read with the clock it was written by
  const kept = JSON.parse(start.store['sellio:auth-return']);
  assert.equal(sendSignInResultToAuth(back, kept.at + 60_000), '/Auth?join=1#access_token=abc&refresh_token=def&token_type=bearer');
  assert.equal(back.store['sellio:auth-return'], undefined, 'used once');
});

check('an invite token is kept; anything else in the old query is not', () => {
  const back = browserAt('https://sellio.sg/#access_token=abc', { 'sellio:auth-return': JSON.stringify({ search: '?token=inv123&utm=x', at: NOW - 1000 }) });
  assert.equal(sendSignInResultToAuth(back, NOW), '/Auth?token=inv123#access_token=abc');
});

check('a kept query older than 30 minutes is dropped', () => {
  const back = browserAt('https://sellio.sg/#access_token=abc', { 'sellio:auth-return': JSON.stringify({ search: '?join=1', at: NOW - 31 * 60_000 }) });
  assert.equal(sendSignInResultToAuth(back, NOW), '/Auth#access_token=abc');
});

check('a password-reset link goes to the reset screen', () => {
  const back = browserAt('https://sellio.sg/#access_token=abc&type=recovery', { 'sellio:auth-return': JSON.stringify({ search: '?join=1', at: NOW }) });
  assert.equal(sendSignInResultToAuth(back, NOW), '/Auth?type=recovery#access_token=abc&type=recovery');
});

check('an error only in the query is moved after the #', () => {
  const back = browserAt('https://sellio.sg/?error=access_denied&error_code=user_banned&error_description=User+is+banned');
  assert.equal(sendSignInResultToAuth(back, NOW), '/Auth#error=access_denied&error_code=user_banned&error_description=User+is+banned');
});

check('the start page on its own, other pages and other hashes are left alone', () => {
  for (const address of ['https://sellio.sg/', 'https://sellio.sg/#pricing', 'https://sellio.sg/?ref=abc', 'https://sellio.sg/Auth#access_token=abc', 'https://sellio.sg/explore?error=x']) {
    const b = browserAt(address);
    assert.equal(sendSignInResultToAuth(b, NOW), null, address);
    assert.equal(b.moved, undefined, address);
  }
});

check('storage switched off: still moves, without the kept query', () => {
  const b = browserAt('https://sellio.sg/#access_token=abc');
  b.sessionStorage.getItem = () => { throw new Error('SecurityError'); };
  assert.equal(sendSignInResultToAuth(b, NOW), '/Auth#access_token=abc');
  const s = browserAt('https://sellio.sg/Auth');
  s.sessionStorage.setItem = () => { throw new Error('QuotaExceeded'); };
  rememberAuthReturn('https://sellio.sg/Auth?join=1', s); // no throw
});

console.log(`\n${passed} passed`);
