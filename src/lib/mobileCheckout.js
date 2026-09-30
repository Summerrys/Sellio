// Keep one request key for each logical checkout, including uncertain retries.
const pendingListeners = new Set();
let pending = [];
export const getPendingCheckouts = () => pending;
export const subscribePendingCheckouts = listener => {
  pendingListeners.add(listener);
  return () => pendingListeners.delete(listener);
};
const publish = rows => { pending = rows; pendingListeners.forEach(listener => listener()); };
const knownRejection = error => error?.hint !== 'checkout_actor_changed' && ['22023', 'P0002', '42501', 'P0001', '40001', '23505'].includes(error?.code);

export async function submitCheckout(supabase, parameters, scope) {
  const storageKey = `sellio_checkout_attempt:${scope}`;
  const signature = JSON.stringify(parameters);
  let attempt;
  try {
    const previous = sessionStorage.getItem(storageKey);
    attempt = previous ? JSON.parse(previous) : null;
    if (attempt && attempt.signature !== signature) {
      throw Object.assign(new Error('An earlier submission is unconfirmed. Retry the same cart to recover its result before starting another order.'), { checkoutUnconfirmed: true });
    }
    if (!attempt) {
      attempt = { id: crypto.randomUUID(), signature };
      sessionStorage.setItem(storageKey, JSON.stringify(attempt));
    }
  } catch (error) {
    throw Object.assign(new Error(error?.message || 'App storage is required to safely submit this order.'), { checkoutUnconfirmed: !!error?.checkoutUnconfirmed });
  }
  const record = { requestId: attempt.id, tenantId: parameters.p_tenant_id, count: parameters.p_items.reduce((sum, item) => sum + item.quantity, 0), state: 'sending' };
  publish([...pending.filter(item => item.requestId !== attempt.id), record]);
  try {
    const { data, error } = await supabase.rpc('place_order_once', { ...parameters, p_request_id: attempt.id });
    if (error) throw error;
    if (!data?.id || !data?.order_number) throw new Error('The order response is unconfirmed. Check Orders before trying again.');
    sessionStorage.removeItem(storageKey);
    publish(pending.filter(item => item.requestId !== attempt.id));
    return data;
  } catch (error) {
    if (knownRejection(error)) {
      sessionStorage.removeItem(storageKey);
      publish(pending.filter(item => item.requestId !== attempt.id));
    } else {
      publish(pending.map(item => item.requestId === attempt.id ? { ...item, state: 'unconfirmed' } : item));
      throw Object.assign(new Error('Order submission is unconfirmed. Retry this same cart to recover the result. Your cart has been kept.'), { checkoutUnconfirmed: true, cause: error });
    }
    throw error;
  }
}
