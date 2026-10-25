// One bill per table: merging rounds, totals, payment text, loading a bill, and the
// printed and browser receipts. Run: node verification/table-bill.test.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const tmp = await mkdtemp(path.join(app, '.table-bill-verification-'));
const bundle = async relative => {
  const outfile = path.join(tmp, relative.replace(/[^a-z0-9]/gi, '_') + '.mjs');
  await build({ entryPoints: [path.join(app, relative)], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', alias: { '@': path.join(app, 'src') }, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
};
let passes = 0;
const pass = name => { passes++; console.log('PASS ' + name); };

try {
  const bill = await bundle('src/lib/tableBill.js');
  const printer = await bundle('src/lib/printerUtils.js');
  const at = m => new Date(Date.UTC(2026, 9, 25, 11, m)).toISOString();
  const session = { id: 's1', table_id: 't1', table_name: 'T1', status: 'active', order_ids: ['a', 'b', 'c', 'd'], started_at: at(0) };
  const orders = [
    { id: 'b', order_number: 'ORD-000005', status: 'ready', payment_status: 'unpaid', created_date: at(20),
      items: [{ name: 'Latte', price: 5.5, quantity: 1 }, { name: 'Latte', price: 6, quantity: 1, variant: 'Large' }], subtotal: 11.5, total_amount: 11.5 },
    { id: 'a', order_number: 'ORD-000004', status: 'preparing', payment_status: 'unpaid', created_date: at(5),
      items: [{ name: 'Latte', price: 5.5, quantity: 1 }, { name: 'Toast', price: 2, quantity: 2 }], subtotal: 9.5, total_amount: 9.5 },
    { id: 'c', order_number: 'ORD-000006', status: 'cancelled', payment_status: 'unpaid', created_date: at(25),
      items: [{ name: 'Cake', price: 3, quantity: 1 }], subtotal: 3, total_amount: 3 },
    { id: 'd', order_number: 'ORD-000007', status: 'pending', is_deleted: true, created_date: at(26),
      items: [{ name: 'Tea', price: 2, quantity: 1 }], subtotal: 2, total_amount: 2 },
    { id: 'x', order_number: 'ORD-000099', status: 'pending', created_date: at(1),
      items: [{ name: 'Other table', price: 50, quantity: 1 }], subtotal: 50, total_amount: 50 },
  ];

  const b1 = bill.summarizeTableBill(session, orders);
  assert.deepEqual(b1.rounds.map(o => o.id), ['a', 'b', 'c'], 'Rounds in order placed; deleted and other tables left out');
  assert.equal(b1.liveCount, 2);
  assert.deepEqual(b1.orderNumbers, ['ORD-000004', 'ORD-000005']);
  assert.deepEqual(b1.items, [
    { name: 'Latte', variant: '', unitPrice: 5.5, quantity: 2, total: 11 },
    { name: 'Toast', variant: '', unitPrice: 2, quantity: 2, total: 4 },
    { name: 'Latte', variant: 'Large', unitPrice: 6, quantity: 1, total: 6 },
  ]);
  assert.equal(b1.total, 21);
  assert.equal(b1.subtotal, 21);
  assert.equal(b1.paid, false);
  assert.equal(bill.paymentText(b1), 'Not paid yet');
  assert.equal(b1.open, true);
  pass('Rounds merge by dish, options and price; cancelled and deleted rounds never count');

  const paid = bill.summarizeTableBill({ ...session, status: 'completed' }, orders.map(o => (o.status === 'cancelled' ? o : { ...o, payment_status: 'paid', payment_method: 'qr' })));
  assert.equal(paid.paid, true);
  assert.equal(paid.open, false);
  assert.equal(bill.paymentText(paid), 'Paid by QR');
  const mixed = bill.summarizeTableBill(session, [
    { ...orders[1], payment_status: 'paid', payment_method: 'cash' },
    { ...orders[0], payment_status: 'paid', payment_method: 'qr' },
  ]);
  assert.equal(bill.paymentText(mixed), 'Paid by Cash + QR');
  const half = bill.summarizeTableBill(session, [{ ...orders[0], payment_status: 'paid', payment_method: 'qr' }, orders[1]]);
  assert.equal(half.paid, false);
  const empty = bill.summarizeTableBill({ ...session, order_ids: [] }, orders);
  assert.equal(empty.total, 0);
  assert.equal(empty.paid, false);
  assert.deepEqual(empty.items, []);
  pass('Paid only when every live round is paid; payment methods named');

  const toText = bytes => Buffer.from(bytes).toString('latin1');
  // Printable lines of an ESC/POS receipt, with printer commands removed.
  const visibleLines = bytes => toText(bytes)
    .replace(/\x1b@|\x1ba[\x00-\x02]|\x1bE[\x00\x01]|\x1bd[\s\S]|\x1d![\s\S]|\x1dVB\x00/g, '')
    .split('\n').map(l => l.replace(/[\x00-\x1f]/g, '').trimEnd()).filter(Boolean);
  const receipt = toText(printer.buildTableReceipt(b1, 'SGD', 'Cafetelier', 'thermal_80'));
  for (const expected of ['Cafetelier', 'Table: T1', 'Orders: #ORD-000004, #ORD-000005', '2x Latte', 'SGD 11.00', '2x Toast', 'SGD 4.00', '1x Latte', '(Large)', 'TOTAL', 'SGD 21.00', 'Not paid yet', 'Thank you for your visit!']) {
    assert.ok(receipt.includes(expected), `Receipt shows ${expected}`);
  }
  for (const missing of ['Cake', 'Tea', 'Other table', 'ORD-000006', 'Tax', 'Discount']) {
    assert.ok(!receipt.includes(missing), `Receipt leaves out ${missing}`);
  }
  const paidReceipt = toText(printer.buildTableReceipt(paid, 'SGD', 'Cafetelier', 'thermal_80'));
  assert.ok(paidReceipt.includes('Paid by QR') && !paidReceipt.includes('Not paid yet'));
  const narrow = printer.buildTableReceipt({ ...b1, orderNumbers: ['ORD-000004', 'ORD-000005', 'ORD-000010', 'ORD-000011'] }, 'SGD', 'Cafetelier', 'thermal_58');
  const visible = visibleLines(narrow);
  assert.ok(visible.every(l => l.length <= 32), 'Every 58mm line fits the paper');
  assert.ok(visible.some(l => l.startsWith('Orders: #ORD-000004')) && visible.some(l => l.includes('#ORD-000011')), 'Long order list wraps instead of being cut');
  const taxed = toText(printer.buildTableReceipt({ ...b1, tax: 1.89, discount: 1, total: 21.89 }, 'RM', 'Kedai', 'thermal_80'));
  assert.ok(taxed.includes('RM 1.89') && taxed.includes('-RM 1.00') && taxed.includes('RM 21.89'));
  pass('Printed table receipt: merged lines, one total, paid state, fits 58mm and 80mm paper');

  const html = bill.tableReceiptHtml({ ...b1, items: [{ name: '<img src=x onerror=alert(1)>', variant: '', quantity: 1, total: 1 }] }, 'SGD', 'Cafe & Co');
  assert.ok(!html.includes('<img src=x'), 'Item names are escaped in the browser receipt');
  assert.ok(html.includes('&lt;img src=x') && html.includes('Cafe &amp; Co') && html.includes('#ORD-000004, #ORD-000005') && html.includes('Not paid yet'));
  pass('Browser receipt shows the same bill and escapes shop-entered text');

  const rows = {
    table_sessions: [
      { ...session, id: 'old', status: 'completed', order_ids: ['z'], tenant_id: 'shop' },
      { ...session, tenant_id: 'shop' },
      { ...session, id: 'other-shop', tenant_id: 'elsewhere' },
    ],
    orders: orders.map(o => ({ ...o, tenant_id: 'shop' })),
  };
  const calls = [];
  const client = {
    from: table => {
      const eqs = [], ins = [], q = {};
      q.select = () => q; q.order = (...a) => { calls.push(['order', ...a]); return q; }; q.limit = n => { calls.push(['limit', table, n]); return q; };
      q.eq = (c, v) => { eqs.push([c, v]); return q; };
      q.in = (c, v) => { ins.push([c, v]); return q; };
      q.then = resolve => Promise.resolve({ data: rows[table].filter(r => eqs.every(([c, v]) => r[c] === v) && ins.every(([c, v]) => v.includes(r[c]))), error: null }).then(resolve);
      return q;
    },
  };
  const forOrder = await bill.loadTableBillForOrder(client, 'shop', { id: 'b', table_id: 't1' });
  assert.equal(forOrder.sessionId, 's1');
  assert.equal(forOrder.total, 21);
  assert.equal(await bill.loadTableBillForOrder(client, 'shop', { id: 'takeaway', table_id: null }), null);
  assert.equal(await bill.loadTableBillForOrder(client, 'shop', { id: 'not-on-any-bill', table_id: 't1' }), null);
  const bySession = await bill.loadTableBillBySession(client, 'shop', 's1');
  assert.deepEqual(bySession.orderNumbers, ['ORD-000004', 'ORD-000005']);
  assert.equal(await bill.loadTableBillBySession(client, 'shop', 'other-shop'), null, 'Another shop\'s bill is never loaded');
  assert.equal(await bill.loadTableBillBySession(client, 'shop', null), null);
  const failing = { from: () => { const q = {}; for (const k of ['select', 'eq', 'in', 'order', 'limit']) q[k] = () => q; q.then = r => Promise.resolve({ data: null, error: new Error('offline') }).then(r); return q; } };
  await assert.rejects(() => bill.loadTableBillBySession(failing, 'shop', 's1'), /offline/);
  pass('Loads the bill an order belongs to, scoped to the shop; errors are reported, not hidden');

  console.log(passes + ' table bill checks passed.');
} finally {
  await rm(tmp, { recursive: true, force: true });
}
