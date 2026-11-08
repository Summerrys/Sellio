import { explainError } from '@/lib/plainError';

// Why a send to the kitchen didn't go through (lib/mobileCheckout.js), in plain words.
export function counterSendNote(error) {
  const title = 'Couldn’t send the order';
  if (String(error?.message || '').includes('Order limit reached')) {
    return { kind: 'own', title, description: 'This store has reached its monthly order limit. Ask the owner to upgrade the plan.' };
  }
  if (error?.checkoutEarlier) {
    return { kind: 'earlier', title: 'The last send wasn’t confirmed', description: 'A different ticket for this table may already be in Orders. Check Orders first. If it isn’t there, send this ticket anyway.' };
  }
  if (error?.checkoutStorage) {
    return { kind: 'storage', title, description: 'This browser stopped Sellio from keeping track of the order, so nothing was sent. Reload the page, then try again.' };
  }
  if (error?.checkoutUnconfirmed) {
    return { kind: 'unconfirmed', title: 'Couldn’t confirm the order', description: 'The connection dropped while sending, so it may or may not have reached the kitchen. Tap Send to kitchen again: if it got there, it isn’t sent twice.' };
  }
  return explainError(error, { title });
}
