// Google sign-in in Sellio's Android app: what each way the account picker can end does
// (Alvin, 14 Nov 2026). On a copy of the app Google doesn't know (the APK from GitHub, signed
// with the upload key), Google refused every account after it was picked; the plugin opened the
// picker a second time, then the page said "Please try again", so tapping Google went round the
// same picker again. Now: the person closing the picker stays quiet; Google refusing the account
// says to use the phone number or email; any other failure says so; success as before.
// Run: node verification/native-google.test.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

// The plugin's own rejections, word for word (GoogleProvider.java, @capgo/capacitor-social-login 8.7.4).
const REAUTH = 'Google Sign-In failed: [16] Account reauth failed. The plugin cleared Credential Manager credential-selection state and retried once. If this affects only some users, check OAuth consent screen (External vs Internal, test users in Testing mode), Family Link accounts (ensure filterByAuthorizedAccounts is not set to true), and whether the user disabled Sign in with Google for your app. See Logcat tag GoogleProvider for package, signingSha1, and webClientId.';
const NOT_CONFIGURED = 'Google Sign-In failed: Google Cloud OAuth is not configured for this installed build ([28444] Developer console is not set up correctly.). Check Logcat tag GoogleProvider for package, signingSha1, and webClientId, then see the Android troubleshooting section in the plugin README.';
const PICKER_CLOSED = () => Object.assign(new Error('Google Sign-In cancelled by user'), { code: 'USER_CANCELLED' });
const COULD_NOT_START = 'Google sign-in could not start. Please try again, or sign in with your email or phone.';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-native-google-'));
const local = path.join(process.cwd(), '.native-google-test.mjs');
const logged = [];
const consoleError = console.error;
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

try {
  const fixtures = {
    social: "export const SocialLogin = { initialize: async () => {}, logout: async () => {}, login: async (args) => { globalThis.logins.push(args); return globalThis.pickerReply(args); } };",
    clients: "export const getSupabase = async () => ({ auth: { signInWithIdToken: async (args) => { globalThis.idTokenCalls.push(args); return { data: { session: { access_token: 'a' } }, error: null }; } } }); export const getMobileOAuthClient = () => null;",
  };
  const plugin = { name: 'native-google-fixtures', setup(builder) {
    builder.onResolve({ filter: /^@capgo\/capacitor-social-login$/ }, () => ({ path: 'social', namespace: 'mock' }));
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'clients', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: fixtures[args.path] }));
  } };
  const outfile = path.join(tmp, 'native.mjs');
  await build({ entryPoints: ['src/lib/nativeGoogle.js'], outfile, bundle: true, packages: 'external', format: 'esm',
    platform: 'node', alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent' });
  await copyFile(outfile, local);
  const native = await import(pathToFileURL(local));

  console.error = (...args) => { logged.push(args); };
  const attempt = async (reply) => {
    globalThis.logins = [];
    globalThis.idTokenCalls = [];
    globalThis.pickerReply = reply;
    logged.length = 0;
    try { return { session: await native.signInWithNativeGoogle() }; } catch (error) { return { error }; }
  };

  // 1. The person closes Google's picker: a quiet cancel (the page stays as it was), nothing logged.
  let result = await attempt(async () => { throw PICKER_CLOSED(); });
  assert.ok(result.error instanceof native.GoogleSignInCancelled, 'Closing the picker is a cancel');
  assert.equal(logged.length, 0);
  passed('Closing the picker stays quiet');

  // 2. Google refuses the picked account ([16] Account reauth failed, after the plugin's one retry).
  result = await attempt(async () => { throw new Error(REAUTH); });
  assert.ok(result.error instanceof native.GoogleSignInRefused, 'Google refusing the account is neither a cancel nor "try again"');
  assert.equal(result.error.name, 'GoogleSignInRefused');
  assert.match(result.error.message, /phone number or email/);
  assert.doesNotMatch(result.error.message, /try again/i, 'Picking the account again cannot help');
  assert.equal(globalThis.idTokenCalls.length, 0, 'Nothing goes to Supabase without an ID token');
  assert.equal(logged.length, 1, "The plugin's own words go to the log (logcat) for diagnosis");
  passed('Google refusing the picked account says to use the phone number or email');

  // 3. This copy of the app isn't one of the Android clients in Google Cloud.
  result = await attempt(async () => { throw new Error(NOT_CONFIGURED); });
  assert.ok(result.error instanceof native.GoogleSignInRefused);
  passed("A copy of the app Google doesn't know says the same");

  // 4. A failure that merely mentions cancelling is a failure, not the person closing the picker.
  result = await attempt(async () => { throw new Error('Google Sign-In failed: The request was cancelled by the system.'); });
  assert.ok(!(result.error instanceof native.GoogleSignInCancelled), 'Not mistaken for a cancel');
  assert.equal(result.error.message, COULD_NOT_START);
  passed('Other failures say so instead of passing as a cancel');

  // 5. A cancel reported in the person's words without the code is still quiet.
  result = await attempt(async () => { throw new Error('The user canceled the sign-in flow.'); });
  assert.ok(result.error instanceof native.GoogleSignInCancelled);
  passed("A cancel in the user's words without the code stays quiet");

  // 6. Success, as before: Supabase gets the ID token and the raw nonce whose SHA-256 Google was given.
  result = await attempt(async () => ({ result: { idToken: 'google-id-token' } }));
  assert.deepEqual(result.session, { access_token: 'a' });
  assert.equal(globalThis.idTokenCalls[0].token, 'google-id-token');
  assert.equal(createHash('sha256').update(globalThis.idTokenCalls[0].nonce).digest('hex'), globalThis.logins[0].options.nonce,
    "Google was given the nonce's SHA-256");
  passed('A successful pick signs in as before');

  console.log(passes + ' native Google checks passed');
} finally {
  console.error = consoleError;
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
}
