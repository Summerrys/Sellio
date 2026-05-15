/**
 * Platform-agnostic backend function invoker.
 * Works on Base44 hosting AND self-hosted (Hostinger, etc.)
 *
 * On Base44: uses the SDK proxy (relative URL, no CORS issues).
 * On self-hosted: calls the Base44 Deno function endpoints directly via absolute URL.
 */

import { base44 } from '@/api/base44Client';

// The Base44 app ID — hardcoded so it works without env vars on self-hosted.
const APP_ID = '67ecc0c5898d614f2d03b35b';
const FUNCTIONS_BASE_URL = `https://api.base44.com/api/apps/${APP_ID}/functions`;

/**
 * Invoke a backend function. Returns { data }.
 * Mirrors the shape of base44.functions.invoke(name, payload).
 */
export async function invokeFunction(name, payload = {}) {
  // On Base44 hosting the SDK works perfectly.
  // On self-hosted the SDK will fail (no app token / wrong base URL),
  // so we fall back to a direct absolute fetch to the function endpoint.
  try {
    const res = await base44.functions.invoke(name, payload);
    return res;
  } catch {
    // Direct call — works from any host since it's an absolute URL.
    const url = `${FUNCTIONS_BASE_URL}/${name}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      const err = new Error(data?.error || `Function "${name}" returned ${response.status}`);
      err.response = { data, status: response.status };
      throw err;
    }
    return { data };
  }
}