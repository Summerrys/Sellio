// deno test supabase/functions/_shared/google-id-token.test.ts
// (from the app root: DENO_NO_PACKAGE_JSON=1 deno test --no-config --node-modules-dir=none …)
import { deepStrictEqual as assertEquals, equal } from "node:assert/strict";
import { forgetGoogleKeys, GOOGLE_WEB_CLIENT_IDS, verifyGoogleIdToken } from "./google-id-token.ts";

const enc = (value: unknown) =>
  btoa(typeof value === "string" ? value : JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const bytesB64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

async function keyPair(kid: string) {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid, use: "sig", alg: "RS256" };
  return { privateKey: pair.privateKey, jwk };
}

async function sign(privateKey: CryptoKey, kid: string, claims: Record<string, unknown>) {
  const head = enc({ alg: "RS256", kid, typ: "JWT" });
  const body = enc(claims);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${bytesB64url(signature)}`;
}

const nowMs = Date.UTC(2026, 10, 5, 10, 0, 0);
const rawNonce = "a1b2c3d4e5f6";
const hashedNonce = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawNonce)));
const good = (overrides: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: GOOGLE_WEB_CLIENT_IDS[0],
  sub: "1234567890",
  email: "Owner@Gmail.com",
  email_verified: true,
  iat: nowMs / 1000 - 10,
  exp: nowMs / 1000 + 3600,
  nonce: hashedNonce,
  ...overrides,
});

const current = await keyPair("key-1");
const rotated = await keyPair("key-2");
let served = [current.jwk];
let fetches = 0;
const fetchImpl = (url: string) => {
  fetches++;
  equal(url, "https://www.googleapis.com/oauth2/v3/certs");
  return Promise.resolve(new Response(JSON.stringify({ keys: served }), { headers: { "cache-control": "public, max-age=20000" } }));
};
const check = (token: string, nonce = rawNonce) => verifyGoogleIdToken(token, nonce, { fetchImpl, nowMs });

Deno.test("a good token from Google gives the account", async () => {
  forgetGoogleKeys();
  assertEquals(await check(await sign(current.privateKey, "key-1", good())), { sub: "1234567890", email: "owner@gmail.com" });
});

Deno.test("Google's keys are loaded once, and again when Google has a new key", async () => {
  forgetGoogleKeys();
  fetches = 0;
  await check(await sign(current.privateKey, "key-1", good()));
  await check(await sign(current.privateKey, "key-1", good()));
  equal(fetches, 1);
  served = [current.jwk, rotated.jwk];
  assertEquals((await check(await sign(rotated.privateKey, "key-2", good())))?.sub, "1234567890");
  equal(fetches, 2);
  served = [current.jwk];
});

Deno.test("refused: another app's token, an expired one, an unverified email, a wrong or missing nonce", async () => {
  forgetGoogleKeys();
  const s = (claims: Record<string, unknown>) => sign(current.privateKey, "key-1", claims);
  equal(await check(await s(good({ aud: "someone-else.apps.googleusercontent.com" }))), null);
  equal(await check(await s(good({ iss: "https://evil.example" }))), null);
  equal(await check(await s(good({ exp: nowMs / 1000 - 120 }))), null);
  equal(await check(await s(good({ email_verified: false }))), null);
  equal(await check(await s(good()), "another-nonce"), null);
  equal(await check(await s(good()), ""), null);
  equal(await check(await s(good({ nonce: undefined }))), null);
});

Deno.test("refused: a token signed by anyone but Google, or altered", async () => {
  forgetGoogleKeys();
  const stranger = await keyPair("key-1");
  equal(await check(await sign(stranger.privateKey, "key-1", good())), null);
  const token = await sign(current.privateKey, "key-1", good());
  const [head, , signature] = token.split(".");
  equal(await check(`${head}.${enc(good({ sub: "someone-else" }))}.${signature}`), null);
  equal(await check(await sign(current.privateKey, "unknown-key", good())), null);
  equal(await check("not-a-token"), null);
});
