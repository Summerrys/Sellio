import { SUPABASE_URL } from './supabaseClient';

// Phone sign-in and forgot password go through the phone-auth server function, which
// keeps an account's email address on the server.
//  - Sent as a plain request (a text body and no extra headers), so the browser sends it
//    straight away instead of making a separate pre-check request first.
//  - Run in Sydney (ap-southeast-2), next to the database and Supabase Auth.
export const PHONE_AUTH_REGION = 'ap-southeast-2';

// The function's reply ({ ok, ... }), or null if it couldn't be reached.
export async function callPhoneAuth(body, fetchImpl = globalThis.fetch) {
  const url = `${SUPABASE_URL}/functions/v1/phone-auth?forceFunctionRegion=${PHONE_AUTH_REGION}`;
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
    });
    const reply = await response.json();
    return reply && typeof reply === 'object' ? reply : null;
  } catch {
    return null;
  }
}
