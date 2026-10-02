// The Reports Excel export: one .xlsx with a sheet per section, built from the
// same report object as the screen and the PDF (see reportData.js).
import { buildXlsx } from './xlsxWriter';
import {
  SALES_RULE_TEXT, change, fmtPeriod, isSale, lineTotal, num, orderItems, orderTypeKey,
  orderTypeLabel, paymentKey, paymentLabel, round2, toDate,
} from './reportData';

const H = (v) => ({ v, s: 'header' });
const HN = (v) => ({ v, s: 'headerNum' }); // header over a number column (right-aligned)
const money = (v) => ({ v: round2(v), s: 'money' });
const int = (v) => ({ v: num(v), s: 'int' });
const pct = (v) => (v == null ? null : { v, s: 'pct' });
const bold = (v) => ({ v, s: 'bold' });
const totalMoney = (v) => ({ v: round2(v), s: 'moneyBold' });
const totalInt = (v) => ({ v: num(v), s: 'intBold' });
const yesNo = (b) => (b ? 'Yes' : 'No');
const titleCase = (s) => String(s || '').replace(/[_-]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());

// Row height (points) for wrapped text across `chars` columns of width.
function wrappedHeight(text, chars) {
  let units = 0;
  for (const ch of String(text)) units += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1;
  const lines = Math.max(1, Math.ceil(units / Math.max(10, chars - 4)));
  return lines * 15 + 3;
}

// A table sheet: header row, data rows, optional total row; frozen header + filter.
// Headers starting with '#' sit over number columns (right-aligned, '#' dropped).
function tableSheet(name, columns, headers, rows, totals) {
  const all = [headers.map((h) => (h.startsWith('#') ? HN(h.slice(1)) : H(h))), ...rows];
  if (totals) all.push(totals);
  return {
    name,
    columns,
    rows: all,
    freezeRows: 1,
    filterRow: 0,
    filterLastRow: Math.max(1, rows.length), // the data rows, not the total row
  };
}

function itemsText(o) {
  return orderItems(o)
    .map((i) => `${num(i.quantity)}× ${String(i.name || i.product_name || 'Item').trim()}${i.variant ? ` (${String(i.variant).trim()})` : ''}`)
    .join('; ');
}

export function buildReportSheets(report) {
  const { summary: s, prevSummary: ps, period, currency } = report;
  const sheets = [];

  // ── Summary ──
  const prevPeriod = { start: period.prevStart, end: period.prevEnd, days: period.days };
  const rows = [
    [{ v: `${report.storeName} · Sales report`, s: 'title' }],
    ['Period', report.periodLabel],
    ['Compared with', fmtPeriod(prevPeriod)],
    ['Generated', { v: report.generatedAt, s: 'datetime' }],
    ['Currency', currency],
    [{ v: 'Sales rule', s: 'wrap' }, { v: SALES_RULE_TEXT, s: 'muted' }],
    [],
    [H('Measure'), HN('This period'), HN('Previous period'), HN('Change')],
    ['Sales', money(s.salesTotal), money(ps.salesTotal), pct(change(s.salesTotal, ps.salesTotal))],
    ['Paid orders', int(s.salesCount), int(ps.salesCount), pct(change(s.salesCount, ps.salesCount))],
    ['Average order', money(s.avgOrder), money(ps.avgOrder), pct(change(s.avgOrder, ps.avgOrder))],
    ['Items sold', int(s.itemsSold), int(ps.itemsSold), pct(change(s.itemsSold, ps.itemsSold))],
    ['Discounts', money(s.discount), money(ps.discount), null],
    ['Tax', money(s.tax), money(ps.tax), null],
    ['Unpaid open orders', int(s.openCount), int(ps.openCount), null],
    ['Unpaid amount', money(s.openTotal), money(ps.openTotal), null],
    ['Cancelled orders', int(s.cancelledCount), int(ps.cancelledCount), null],
    ['Cancelled amount', money(s.cancelledTotal), money(ps.cancelledTotal), null],
    [],
    [H('Insights'), H(''), H(''), H('')],
  ];
  const merges = ['B6:D6', `A${rows.length}:D${rows.length}`];
  const rowHeights = { 5: wrappedHeight(SALES_RULE_TEXT, 62) };
  report.insights.forEach((text, i) => {
    const line = `${i + 1}. ${text}`;
    rows.push([{ v: line, s: 'wrap' }]);
    merges.push(`A${rows.length}:D${rows.length}`);
    rowHeights[rows.length - 1] = wrappedHeight(line, 88);
  });
  sheets.push({ name: 'Summary', columns: [24, 20, 20, 16], rows, merges, rowHeights });

  // ── Daily sales ──
  const dailyRows = report.daily.map((d) => [
    { v: d.date, s: 'date' },
    d.date.toLocaleDateString('en-US', { weekday: 'short' }),
    int(d.orders),
    money(d.sales),
    money(d.orders ? d.sales / d.orders : 0),
  ]);
  sheets.push(tableSheet('Daily sales', [14, 8, 13, 14, 15], ['Date', 'Day', '#Paid orders', '#Sales', '#Average order'], dailyRows,
    [bold('Total'), null, totalInt(s.salesCount), totalMoney(s.salesTotal), totalMoney(s.avgOrder)]));

  // ── By hour ──
  sheets.push(tableSheet('By hour', [14, 13, 14, 16], ['Hour', '#Paid orders', '#Sales', '#% of paid orders'],
    report.hourly.map((h) => [h.label, int(h.orders), money(h.sales), pct(s.salesCount ? h.orders / s.salesCount : 0)]),
    [bold('Total'), totalInt(s.salesCount), totalMoney(s.salesTotal), null]));

  // ── Items ──
  const itemTotalQty = report.products.reduce((a, p) => a + p.qty, 0);
  const itemTotalSales = report.products.reduce((a, p) => a + p.sales, 0);
  sheets.push(tableSheet('Items', [7, 34, 20, 10, 16, 16, 10], ['#Rank', 'Item', 'Category', '#Qty sold', '#Item sales (before discounts)', '#% of item sales', '#Orders'],
    report.products.map((p, i) => [int(i + 1), p.name, p.category, int(p.qty), money(p.sales), pct(p.share), int(p.orders)]),
    [null, bold('Total'), null, totalInt(itemTotalQty), totalMoney(itemTotalSales), null, null]));

  // ── Categories ──
  sheets.push(tableSheet('Categories', [26, 8, 10, 16, 16], ['Category', '#Items', '#Qty sold', '#Item sales (before discounts)', '#% of item sales'],
    report.categories.map((c) => [c.category, int(c.items), int(c.qty), money(c.sales), pct(c.share)]),
    [bold('Total'), null, totalInt(itemTotalQty), totalMoney(itemTotalSales), null]));

  // ── Payments / Order types ──
  const groupRows = (list) => list.map((g) => [g.label, int(g.orders), money(g.sales), pct(g.share)]);
  sheets.push(tableSheet('Payments', [18, 13, 14, 16], ['Method', '#Paid orders', '#Sales', '#% of paid orders'], groupRows(report.payments),
    [bold('Total'), totalInt(s.salesCount), totalMoney(s.salesTotal), null]));
  sheets.push(tableSheet('Order types', [18, 13, 14, 16], ['Type', '#Paid orders', '#Sales', '#% of paid orders'], groupRows(report.orderTypes),
    [bold('Total'), totalInt(s.salesCount), totalMoney(s.salesTotal), null]));

  // ── Orders (every order in the period, with whether it counts as a sale) ──
  const orderRows = report.orders.map((o) => {
    const d = toDate(o.created_date);
    const paid = o.payment_status === 'paid';
    return [
      o.order_number || '',
      d ? { v: d, s: 'datetime' } : null,
      orderTypeLabel(orderTypeKey(o)),
      o.table_name || '',
      o.customer_name || '',
      titleCase(o.status),
      paid ? 'Paid' : titleCase(o.payment_status || 'unpaid'),
      paid ? paymentLabel(paymentKey(o)) : '',
      yesNo(isSale(o)),
      money(o.subtotal),
      money(o.discount_amount),
      money(o.tax_amount),
      money(o.total_amount),
      itemsText(o),
      o.notes || '',
    ];
  });
  sheets.push(tableSheet('Orders', [12, 18, 11, 10, 18, 12, 10, 14, 10, 11, 10, 10, 11, 48, 30],
    ['Order no.', 'Date & time', 'Type', 'Table', 'Customer', 'Status', 'Payment', 'Method', 'Counted in sales', '#Subtotal', '#Discount', '#Tax', '#Total', 'Items', 'Notes'],
    orderRows, null));

  // ── Order lines (one row per item line, for pivot tables) ──
  const lineRows = [];
  for (const o of report.orders) {
    const d = toDate(o.created_date);
    const counted = yesNo(isSale(o));
    for (const i of orderItems(o)) {
      const product = i.product_id ? report.productById[i.product_id] : null;
      const category = product ? report.categoryNameById[product.category_id] || 'Uncategorized' : '';
      lineRows.push([
        o.order_number || '',
        d ? { v: d, s: 'datetime' } : null,
        counted,
        String(i.name || i.product_name || 'Item').trim(),
        i.variant ? String(i.variant).trim() : '',
        int(i.quantity),
        money(i.price),
        money(lineTotal(i)),
        category,
        i.notes || '',
      ]);
    }
  }
  sheets.push(tableSheet('Order lines', [12, 18, 10, 30, 18, 7, 11, 11, 18, 24],
    ['Order no.', 'Date & time', 'Counted in sales', 'Item', 'Option', '#Qty', '#Unit price', '#Line total', 'Category', 'Line note'],
    lineRows, null));

  // ── Not sold ──
  sheets.push(tableSheet('Not sold', [34, 20, 11], ['Item (on sale, no sales in this period)', 'Category', '#Price'],
    report.notSold.map((p) => [p.name, p.category, money(p.price)]), null));

  // ── Stock (plans with advanced reports; items that track stock only) ──
  if (report.inventory) {
    const label = { out: 'Out of stock', low: 'Low', ok: 'OK' };
    sheets.push(tableSheet('Stock', [34, 13, 10, 15, 8, 9], ['Item (tracks stock)', 'Status', '#In stock', '#Low-stock level', 'Unit', 'On sale'],
      report.inventory.items.map((i) => [i.name, label[i.status], int(i.stock), int(i.threshold), i.unit, yesNo(i.active)]), null));
  }

  return sheets;
}

export async function buildReportWorkbook(report, options) {
  return buildXlsx(buildReportSheets(report), { title: `${report.storeName} sales report`, when: report.generatedAt, ...options });
}
