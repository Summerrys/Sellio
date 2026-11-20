// The note Google sign-in in Sellio's Android app leaves for the sign-in page
// (src/lib/mobileOAuth.js): Auth.jsx finishes the sign-in only for a fresh note from its own
// address. Run: node verification/google-signin.test.mjs
import assert from 'node:assert/strict';
import { COMPLETE_KEY, hasMobileGoogleCompletion } from '../src/lib/mobileOAuth.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key) };
};
const browserAt = (origin, note) => {
  const sessionStorage = memoryStorage();
  if (note !== undefined) sessionStorage.setItem(COMPLETE_KEY, typeof note === 'string' ? note : JSON.stringify(note));
  return { location: { origin }, sessionStorage };
};
let passes = 0;
const passed = message => { passes++; console.log('PASS ' + message); };

assert.equal(COMPLETE_KEY, 'sellio-mobile-google-complete', 'the key the apps already write');
assert.equal(hasMobileGoogleCompletion(browserAt('https://localhost', { origin: 'https://localhost', createdAt: Date.now() })), true);
assert.equal(hasMobileGoogleCompletion(browserAt('https://localhost', { origin: 'https://localhost', createdAt: Date.now() - 29000 })), true);
passed('A note from this address in the last 30 seconds finishes the sign-in');

assert.equal(hasMobileGoogleCompletion(browserAt('https://localhost')), false, 'no note');
assert.equal(hasMobileGoogleCompletion(browserAt('https://localhost', { origin: 'https://sellio.sg', createdAt: Date.now() })), false, 'another address');
assert.equal(hasMobileGoogleCompletion(browserAt('https://localhost', { origin: 'https://localhost', createdAt: Date.now() - 31000 })), false, 'too old');
assert.equal(hasMobileGoogleCompletion(browserAt('https://localhost', { origin: 'https://localhost', createdAt: Date.now() + 5000 })), false, 'from the future');
assert.equal(hasMobileGoogleCompletion(browserAt('https://localhost', '{not json')), false, 'malformed');
assert.equal(hasMobileGoogleCompletion({ location: { origin: 'https://localhost' }, sessionStorage: { getItem() { throw new Error('blocked'); } } }), false, 'storage blocked');
passed('No note, another address, an old or future note, a malformed note or blocked storage: no sign-in');

console.log(passes + ' Google sign-in note checks passed');
