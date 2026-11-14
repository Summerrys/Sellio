// Browser alerts' settings for the website: dist/web-push.json, which src/lib/webPush.js reads.
// Written by scripts/pages-output.mjs from two settings in Cloudflare Pages (HOSTING.md):
//   FIREBASE_WEB_CONFIG    the firebaseConfig block Firebase shows for the website's web app
//                          (pasted as it is: JavaScript or JSON)
//   FIREBASE_WEB_PUSH_KEY  that Firebase project's Web Push certificate: the public key
// Both are public by design: every visitor's browser gets them. Neither set: no file, and no
// browser is offered alerts. Set but wrong (one missing, a typo, two projects mixed): the build
// stops with what's wrong, so a broken setup can't ship quietly. The apps never carry the file
// (scripts/build-app.mjs leaves it out), so their copy of the website stays the same.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export const WEB_PUSH_FILE = 'web-push.json';

const fail = (problem) => {
  throw new Error(`Browser alerts: ${problem} (Cloudflare Pages settings, HOSTING.md).`);
};

// The values in a pasted firebaseConfig block: key: "value" pairs, quoted or not.
function pairs(text) {
  const found = {};
  for (const match of String(text).matchAll(/["']?([A-Za-z]+)["']?\s*:\s*["']([^"'\n]*)["']/g)) {
    found[match[1]] = match[2].trim();
  }
  return found;
}

// A Web Push public key: base64url of an uncompressed P-256 point (65 bytes, starting 0x04).
function publicKeyOk(key) {
  if (!/^[A-Za-z0-9_-]{86,88}$/.test(key)) return false;
  const bytes = Buffer.from(key.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return bytes.length === 65 && bytes[0] === 4;
}

// The file's contents, or null when neither setting is there. Throws when they're wrong.
export function webPushConfig(env = process.env) {
  const configText = String(env.FIREBASE_WEB_CONFIG ?? '').trim();
  const vapidKey = String(env.FIREBASE_WEB_PUSH_KEY ?? '').trim();
  if (!configText && !vapidKey) return null;
  if (!configText) fail('FIREBASE_WEB_PUSH_KEY is set but FIREBASE_WEB_CONFIG is not');
  if (!vapidKey) fail('FIREBASE_WEB_CONFIG is set but FIREBASE_WEB_PUSH_KEY is not');

  const { apiKey = '', projectId = '', messagingSenderId = '', appId = '' } = pairs(configText);
  if (!/^AIza[0-9A-Za-z_-]{35}$/.test(apiKey)) fail('FIREBASE_WEB_CONFIG has no apiKey like "AIza…"');
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) fail('FIREBASE_WEB_CONFIG has no projectId');
  if (!/^\d{5,20}$/.test(messagingSenderId)) fail('FIREBASE_WEB_CONFIG has no messagingSenderId');
  const app = appId.match(/^1:(\d{5,20}):web:[0-9a-f]{6,40}$/);
  if (!app) fail('FIREBASE_WEB_CONFIG has no web appId like "1:…:web:…" (add a Web app in Firebase)');
  if (app[1] !== messagingSenderId) fail('FIREBASE_WEB_CONFIG\'s appId and messagingSenderId are from different projects');
  if (!publicKeyOk(vapidKey)) fail('FIREBASE_WEB_PUSH_KEY is not a Web Push public key (Firebase: Cloud Messaging → Web Push certificates → Key pair)');

  return { apiKey, projectId, messagingSenderId, appId, vapidKey };
}

export async function writeWebPushConfig(dir = 'dist', env = process.env) {
  const config = webPushConfig(env);
  if (!config) {
    console.log('Browser alerts: off (FIREBASE_WEB_CONFIG and FIREBASE_WEB_PUSH_KEY are not set).');
    return null;
  }
  await writeFile(path.join(dir, WEB_PUSH_FILE), `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Browser alerts: on (Firebase project ${config.projectId}).`);
  return config;
}
