import { SUPABASE_URL } from './supabaseClient';
import { PHONE_AUTH_REGION } from './phoneAuth';
import { appT } from './appText';

// The closed-account server function (Keep my account / Start again on a closed account).
// Proof: { phone, password }, { googleIdToken, nonce } (the Android app), or an emailed sign-in
// link's { emailTokenHash, emailLinkType } (Join).
// Sent like phone sign-in: a plain request (no separate browser pre-check), in Sydney next to
// the database. Its reply ({ ok, ... }), or null if it couldn't be reached.
export async function callClosedAccount(body, fetchImpl = globalThis.fetch) {
  const url = `${SUPABASE_URL}/functions/v1/closed-account?forceFunctionRegion=${PHONE_AUTH_REGION}`;
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

const waitText = (minutes) => {
  const n = Math.max(1, Math.round(Number(minutes) || 1));
  return n === 1 ? appT('1 minute') : appT('{count} minutes', { count: n });
};

// What to show when the server says no.
export function closedAccountMessage(reply) {
  switch (reply?.code) {
    case 'invalid': return appT('Phone number or password is incorrect. Please sign in again.');
    case 'link_invalid': return appT('This link has expired or was already used. Ask for a new one.');
    case 'locked': return appT('Too many wrong passwords for this number. Try again in {wait}.', { wait: waitText(reply.retry_after_minutes) });
    case 'too_many': return appT('Too many attempts from this network. Try again in {wait}.', { wait: waitText(reply.retry_after_minutes) });
    case 'not_closed': return appT('This account is not closed any more. Please sign in again.');
    case 'failed': return appT("We couldn't finish deleting it, and Sellio has been told. Please try again later, or email sellio@apptelier.sg.");
    default: return appT('Something went wrong. Please try again.');
  }
}
