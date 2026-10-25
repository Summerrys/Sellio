// One bill per table: every round (order) a table places adds to one bill, which is
// shown, settled and printed as a whole. Shared by the Counter, the Orders page and
// the printed receipt, so all three always show the same items and total.

const ROUND_FIELDS = 'id, order_number, status, payment_status, payment_method, created_date, items, subtotal, tax_amount, discount_amount, total_amount, table_id, table_name, is_deleted';
const SESSION_FIELDS = 'id, table_id, table_name, status, order_ids, total_amount, started_at, ended_at';

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

export const PAYMENT_NAMES = { cash: 'Cash', qr: 'QR', card: 'Card', digital_wallet: 'E-wallet' };

// How a round's kitchen status reads to counter staff.
export const ROUND_STATUS = {
  pending: 'New', confirmed: 'Accepted', preparing: 'Preparing', ready: 'Ready',
  served: 'Served', completed: 'Served', cancelled: 'Cancelled',
};

export const itemName = item => item?.name || item?.product_name || 'Item';
export const itemUnitPrice = item => Number(item?.price ?? item?.unit_price ?? 0) || 0;
export const itemQuantity = item => Number(item?.quantity) || 1;

// The same dish with the same options at the same price becomes one line across
// rounds (2x Latte rather than two 1x Latte lines). First-ordered dishes stay first.
export function mergeBillItems(orders) {
  const lines = new Map();
  for (const order of orders || []) {
    for (const item of order?.items || []) {
      const name = itemName(item);
      const variant = item?.variant || '';
      const unitPrice = itemUnitPrice(item);
      const quantity = itemQuantity(item);
      const key = `${name}\u0000${variant}\u0000${unitPrice.toFixed(2)}`;
      const line = lines.get(key) || { name, variant, unitPrice, quantity: 0, total: 0 };
      line.quantity += quantity;
      line.total = round2(line.total + unitPrice * quantity);
      lines.set(key, line);
    }
  }
  return [...lines.values()];
}

// Rounds in the order they were placed; cancelled and deleted rounds never count
// towards the bill (cancelled ones stay listed so staff can see what was voided).
export function summarizeTableBill(session, orders) {
  const ids = Array.isArray(session?.order_ids) ? session.order_ids : [];
  const rounds = (orders || [])
    .filter(o => o && !o.is_deleted && ids.includes(o.id))
    .sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
  const live = rounds.filter(o => o.status !== 'cancelled');
  const sum = field => round2(live.reduce((s, o) => s + (Number(o[field]) || 0), 0));
  const paidMethods = [...new Set(live
    .filter(o => o.payment_status === 'paid')
    .map(o => o.payment_method)
    .filter(m => m && m !== 'pending'))];
  return {
    sessionId: session.id,
    tableId: session.table_id,
    tableName: session.table_name || rounds[0]?.table_name || 'Table',
    open: session.status !== 'completed',
    startedAt: session.started_at || rounds[0]?.created_date || null,
    rounds,
    liveCount: live.length,
    orderNumbers: live.map(o => o.order_number).filter(Boolean),
    items: mergeBillItems(live),
    subtotal: sum('subtotal'),
    tax: sum('tax_amount'),
    discount: sum('discount_amount'),
    total: sum('total_amount'),
    paid: live.length > 0 && live.every(o => o.payment_status === 'paid'),
    paidMethods,
  };
}

export function paymentText(bill) {
  if (!bill?.paid) return 'Not paid yet';
  const how = (bill.paidMethods || []).map(m => PAYMENT_NAMES[m] || m).join(' + ');
  return how ? `Paid by ${how}` : 'Paid';
}

async function loadRounds(supabase, tenantId, session) {
  const ids = Array.isArray(session?.order_ids) ? session.order_ids : [];
  if (!ids.length) return [];
  const { data, error } = await supabase.from('orders').select(ROUND_FIELDS)
    .eq('tenant_id', tenantId).in('id', ids);
  if (error) throw error;
  return data || [];
}

// A table bill by its id (open or already settled), or null if it no longer exists.
export async function loadTableBillBySession(supabase, tenantId, sessionId) {
  if (!sessionId) return null;
  const { data, error } = await supabase.from('table_sessions').select(SESSION_FIELDS)
    .eq('tenant_id', tenantId).eq('id', sessionId).limit(1);
  if (error) throw error;
  const session = data?.[0];
  if (!session) return null;
  return summarizeTableBill(session, await loadRounds(supabase, tenantId, session));
}

// The table bill an order belongs to (open or already settled), or null for orders
// that are not on a table bill (takeaway, online, free-shop orders).
export async function loadTableBillForOrder(supabase, tenantId, order) {
  if (!order?.id || !order?.table_id) return null;
  const { data, error } = await supabase.from('table_sessions').select(SESSION_FIELDS)
    .eq('tenant_id', tenantId).eq('table_id', order.table_id)
    .order('started_at', { ascending: false }).limit(200);
  if (error) throw error;
  const session = (data || []).find(s => Array.isArray(s.order_ids) && s.order_ids.includes(order.id));
  if (!session) return null;
  return summarizeTableBill(session, await loadRounds(supabase, tenantId, session));
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

// Browser-print version of the table receipt, for shops without a receipt printer.
export function tableReceiptHtml(bill, currency, merchantName) {
  const money = n => `${escapeHtml(currency)} ${(Number(n) || 0).toFixed(2)}`;
  const rows = (bill.items || []).map(item => `<tr>
      <td style="padding:4px 8px 4px 0">${item.quantity}× ${escapeHtml(item.name)}${item.variant ? ` (${escapeHtml(item.variant)})` : ''}</td>
      <td style="padding:4px 0;text-align:right">${money(item.total)}</td>
    </tr>`).join('');
  const extra = [
    bill.subtotal > 0 ? `<tr><td>Subtotal</td><td style="text-align:right">${money(bill.subtotal)}</td></tr>` : '',
    bill.tax > 0 ? `<tr><td>Tax</td><td style="text-align:right">${money(bill.tax)}</td></tr>` : '',
    bill.discount > 0 ? `<tr><td>Discount</td><td style="text-align:right">-${money(bill.discount)}</td></tr>` : '',
  ].join('');
  const orders = (bill.orderNumbers || []).map(n => `#${escapeHtml(n)}`).join(', ') || '-';
  return `<!DOCTYPE html><html><head><title>Receipt</title>
  <style>
    body{font-family:monospace;font-size:13px;margin:0;padding:16px;max-width:320px}
    h2{margin:0 0 4px;font-size:16px;text-align:center}
    .center{text-align:center} .divider{border-top:1px dashed #000;margin:8px 0}
    table{width:100%;border-collapse:collapse} td{vertical-align:top}
    .total{font-weight:bold;font-size:14px} .small{font-size:11px;color:#555}
    @media print{body{padding:0}button{display:none}}
  </style></head><body>
  <h2>${escapeHtml(merchantName || 'Receipt')}</h2>
  <p class="center small">${escapeHtml(new Date().toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' }))}</p>
  <div class="divider"></div>
  <p><strong>Table:</strong> ${escapeHtml(bill.tableName)}</p>
  <p><strong>Orders:</strong> ${orders}</p>
  <div class="divider"></div>
  <table>${rows}</table>
  <div class="divider"></div>
  <table>${extra}
    <tr class="total"><td>Total</td><td style="text-align:right">${money(bill.total)}</td></tr>
  </table>
  <p><strong>${escapeHtml(paymentText(bill))}</strong></p>
  <div class="divider"></div>
  <p class="center small">Thank you for your visit!</p>
  <p class="center small" style="color:#94a3b8">Powered by Sellio</p>
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`;
}
