// Checking an ID token that Google gave Sellio's app (Android's account picker), for when
// Supabase Auth won't take it because the login is locked (a closed account). Checked:
// Google's signature (its published keys), the issuer, the audience (Sellio's Web client ID,
// the same one the app asks Google for), the expiry, a verified email, and the nonce. The app
// keeps the raw nonce and Google writes its SHA-256 into the token, so a copied token alone is
// not enough (Supabase Auth checks Google sign-ins the same way).
export const GOOGLE_WEB_CLIENT_IDS = ["390618701573-0n3emgl2e2v8redsf2d5dl28fikknl1h.apps.googleusercontent.com"];
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const SKEW_SECONDS = 60;

type Jwk = JsonWebKey & { kid?: string };
type FetchLike = (url: string) => Promise<Response>;
let cache: { keys: Jwk[]; until: number } | null = null;

export function forgetGoogleKeys() {
  cache = null;
}

function b64urlBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function b64urlJson(value: string) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(value)));
}

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

async function googleKeys(fetchImpl: FetchLike, nowMs: number) {
  if (cache && cache.until > nowMs) return cache.keys;
  const response = await fetchImpl(CERTS_URL);
  if (!response.ok) throw new Error(`Google's keys couldn't be loaded (${response.status})`);
  const body = await response.json();
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  cache = { keys: Array.isArray(body?.keys) ? body.keys : [], until: nowMs + Math.min(maxAge, 6 * 3600) * 1000 };
  return cache.keys;
}

// { sub, email } for a good token, otherwise null.
export async function verifyGoogleIdToken(
  token: string,
  rawNonce: string,
  options: { fetchImpl?: FetchLike; nowMs?: number; audiences?: string[] } = {},
) {
  const { fetchImpl = fetch, nowMs = Date.now(), audiences = GOOGLE_WEB_CLIENT_IDS } = options;
  if (typeof token !== "string" || typeof rawNonce !== "string" || !rawNonce || token.length > 8192) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header: any;
  let payload: any;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch {
    return null;
  }
  if (header?.alg !== "RS256" || typeof header.kid !== "string") return null;

  let jwk = (await googleKeys(fetchImpl, nowMs)).find((key) => key.kid === header.kid);
  if (!jwk) {
    // Google has moved to a new key since they were last loaded.
    forgetGoogleKeys();
    jwk = (await googleKeys(fetchImpl, nowMs)).find((key) => key.kid === header.kid);
  }
  if (!jwk?.n || !jwk?.e) return null;

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  const seconds = nowMs / 1000;
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!ISSUERS.has(payload.iss) || !audience.some((aud: unknown) => audiences.includes(String(aud)))) return null;
  if (typeof payload.exp !== "number" || payload.exp < seconds - SKEW_SECONDS) return null;
  if (typeof payload.iat === "number" && payload.iat > seconds + SKEW_SECONDS) return null;
  if (!(payload.email_verified === true || payload.email_verified === "true")) return null;
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  if (typeof payload.nonce !== "string") return null;
  const hashedNonce = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawNonce)));
  if (hashedNonce !== payload.nonce) return null;

  return { sub: payload.sub as string, email: String(payload.email ?? "").toLowerCase() };
}
