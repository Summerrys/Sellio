// Report rules shared by the Reports screen and its Excel / PDF exports, so the
// numbers on screen and in the files always agree. Plain functions, no React.
//
// Sales = orders that are paid and not cancelled (the Dashboard's revenue also
// counts paid orders). Unpaid open orders and cancelled orders are reported
// separately and never counted as sales. Amounts are order totals (after
// discounts, including tax). Dates use the device's local time.

export const SALES_RULE_TEXT =
  'Sales count paid orders that are not cancelled. Amounts are order totals (after discounts, including tax).';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 24 * 60 * 60 * 1000;

// ── numbers ─────────────────────────────────────────────────────────────────
export function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
export function round2(v) {
  const n = num(v);
  return Math.round((n + (n >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
}
const sumBy = (rows, fn) => rows.reduce((s, r) => s + fn(r), 0);

// ── orders ──────────────────────────────────────────────────────────────────
export const isCancelled = (o) => !!o && o.status === 'cancelled';
export const isSale = (o) => !!o && !o.is_deleted && o.payment_status === 'paid' && o.status !== 'cancelled';
export const isOpenUnpaid = (o) => !!o && !o.is_deleted && o.payment_status !== 'paid' && o.status !== 'cancelled';
export const orderTotal = (o) => num(o?.total_amount);

export function orderItems(o) {
  let items = o?.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  return Array.isArray(items) ? items.filter((i) => i && typeof i === 'object') : [];
}
export const lineTotal = (item) => num(item?.price) * num(item?.quantity);

// ── dates ───────────────────────────────────────────────────────────────────
export function toDate(v) {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? new Date(v.getTime()) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
export function startOfDay(v) { const d = toDate(v); d.setHours(0, 0, 0, 0); return d; }
export function endOfDay(v) { const d = toDate(v); d.setHours(23, 59, 59, 999); return d; }
export function addDays(v, n) { const d = toDate(v); d.setDate(d.getDate() + n); return d; }
const pad2 = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const fmtDay = (d) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;      // Tue 29 Sep
export const fmtShortDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;                        // 29 Sep
export const fmtDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;          // 29 Sep 2026
export const fmtMonth = (d) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;                       // Sep 2026
export const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const fmtDateTime = (d) => `${fmtDate(d)}, ${fmtTime(d)}`;
export function fmtHour(h) {
  const x = ((h % 24) + 24) % 24;
  if (x === 0) return '12am';
  if (x === 12) return '12pm';
  return x < 12 ? `${x}am` : `${x - 12}pm`;
}
export const fmtHourRange = (h) => `${fmtHour(h)}–${fmtHour(h + 1)}`;

export function fmtPeriod(period) {
  const { start, end, days } = period;
  const span = days === 1
    ? fmtDate(start)
    : start.getFullYear() === end.getFullYear()
      ? `${fmtShortDate(start)} – ${fmtDate(end)}`
      : `${fmtDate(start)} – ${fmtDate(end)}`;
  return `${span} (${days} ${days === 1 ? 'day' : 'days'})`;
}

// ── text ────────────────────────────────────────────────────────────────────
export function fmtMoney(v, currency = 'SGD') {
  const n = round2(v);
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}${currency ? `${currency} ` : ''}${s}`;
}
export function fmtQty(v) {
  const n = num(v);
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
export function fmtPct(fraction) {
  const p = num(fraction) * 100;
  if (p > 0 && p < 1) return '<1%';
  return `${Math.round(p)}%`;
}
const plural = (n, word, many = `${word}s`) => `${fmtQty(n)} ${n === 1 ? word : many}`;
const cleanName = (s, fallback) => (typeof s === 'string' && s.trim() ? s.trim().replace(/\s+/g, ' ') : fallback);
const titleCase = (s) => String(s).replace(/[_-]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());

// ── periods ─────────────────────────────────────────────────────────────────
// The selected range as whole local days, plus the previous period of the same
// length (for "up 12% on the previous 30 days").
export function periodOf(range) {
  const from = toDate(range?.from) || new Date();
  const to = toDate(range?.to) || from;
  const a = from <= to ? from : to;
  const b = from <= to ? to : from;
  const start = startOfDay(a);
  const end = endOfDay(b);
  const days = Math.round((startOfDay(b).getTime() - start.getTime()) / DAY_MS) + 1;
  const prevStart = startOfDay(addDays(start, -days));
  const prevEnd = new Date(start.getTime() - 1);
  return { start, end, days, prevStart, prevEnd };
}
export function inPeriod(o, start, end) {
  const d = toDate(o?.created_date);
  return !!d && d >= start && d <= end;
}
export function change(current, previous) {
  const p = num(previous);
  if (p === 0) return null;
  return (num(current) - p) / Math.abs(p);
}

// ── summaries ───────────────────────────────────────────────────────────────
export function summarize(orders) {
  const live = (orders || []).filter((o) => o && !o.is_deleted);
  const sales = live.filter(isSale);
  const cancelled = live.filter(isCancelled);
  const open = live.filter(isOpenUnpaid);
  const salesTotal = round2(sumBy(sales, orderTotal));
  const discounts = sales.map((o) => num(o.discount_amount)).filter((d) => d > 0);
  return {
    orderCount: live.length,
    salesTotal,
    salesCount: sales.length,
    avgOrder: sales.length ? round2(salesTotal / sales.length) : 0,
    itemsSold: sumBy(sales, (o) => sumBy(orderItems(o), (i) => num(i.quantity))),
    subtotal: round2(sumBy(sales, (o) => num(o.subtotal))),
    tax: round2(sumBy(sales, (o) => num(o.tax_amount))),
    discount: round2(sumBy(discounts, (d) => d)),
    discountedOrders: discounts.length,
    cancelledCount: cancelled.length,
    cancelledTotal: round2(sumBy(cancelled, orderTotal)),
    openCount: open.length,
    openTotal: round2(sumBy(open, orderTotal)),
  };
}

// One row per day of the period (days without sales included), oldest first.
export function dailySeries(saleOrders, start, end) {
  const rows = [];
  const byKey = new Map();
  for (let d = startOfDay(start); d <= end; d = addDays(d, 1)) {
    const row = { key: dayKey(d), date: new Date(d.getTime()), label: fmtShortDate(d), orders: 0, sales: 0 };
    rows.push(row);
    byKey.set(row.key, row);
    if (rows.length > 3700) break; // ~10 years; a guard, not a real limit
  }
  for (const o of saleOrders || []) {
    const d = toDate(o.created_date);
    const row = d && byKey.get(dayKey(d));
    if (!row) continue;
    row.orders += 1;
    row.sales += orderTotal(o);
  }
  rows.forEach((r) => { r.sales = round2(r.sales); });
  return rows;
}

// The daily rows grouped for a chart: by day up to 31 days, by week (Monday
// start) up to 92 days, otherwise by month.
export function chartSeries(daily) {
  if (daily.length <= 31) return daily.map((r) => ({ ...r }));
  const weekly = daily.length <= 92;
  const groups = new Map();
  for (const r of daily) {
    let key;
    let label;
    let date;
    if (weekly) {
      const back = (r.date.getDay() + 6) % 7; // days since Monday
      date = addDays(r.date, -back);
      key = dayKey(date);
      label = `Wk ${fmtShortDate(date)}`;
    } else {
      date = new Date(r.date.getFullYear(), r.date.getMonth(), 1);
      key = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
      label = fmtMonth(date);
    }
    const g = groups.get(key) || { key, date, label, orders: 0, sales: 0 };
    g.orders += r.orders;
    g.sales += r.sales;
    groups.set(key, g);
  }
  return Array.from(groups.values()).map((g) => ({ ...g, sales: round2(g.sales) }));
}

export function hourlySeries(saleOrders) {
  const rows = Array.from({ length: 24 }, (_, hour) => ({ hour, label: fmtHourRange(hour), orders: 0, sales: 0 }));
  for (const o of saleOrders || []) {
    const d = toDate(o.created_date);
    if (!d) continue;
    rows[d.getHours()].orders += 1;
    rows[d.getHours()].sales += orderTotal(o);
  }
  rows.forEach((r) => { r.sales = round2(r.sales); });
  return rows;
}

// Items sold, by product (all options of a product together), best first.
// The product's current name is used when it still exists; otherwise the name
// stored on the order line.
export function productStats(saleOrders, products = [], categories = []) {
  const productById = new Map((products || []).map((p) => [p.id, p]));
  const categoryById = new Map((categories || []).map((c) => [c.id, c.name]));
  const rows = new Map();
  const lastOrderOf = new Map(); // row key → id of the last order counted for it
  for (const o of saleOrders || []) {
    for (const item of orderItems(o)) {
      const product = item.product_id ? productById.get(item.product_id) : null;
      const name = cleanName(product?.name, cleanName(item.name || item.product_name, 'Unnamed item'));
      const key = item.product_id || `name:${name.toLowerCase()}`;
      let row = rows.get(key);
      if (!row) {
        row = {
          key,
          product_id: item.product_id || null,
          name,
          category: cleanName(product && categoryById.get(product.category_id), 'Uncategorized'),
          qty: 0,
          sales: 0,
          orders: 0,
        };
        rows.set(key, row);
      }
      row.qty += num(item.quantity);
      row.sales += lineTotal(item);
      if (lastOrderOf.get(key) !== o.id) { row.orders += 1; lastOrderOf.set(key, o.id); }
    }
  }
  const list = Array.from(rows.values());
  const total = sumBy(list, (r) => r.sales);
  return list
    .map((r) => ({ ...r, sales: round2(r.sales), share: total > 0 ? r.sales / total : 0 }))
    .sort((a, b) => b.sales - a.sales || b.qty - a.qty || a.name.localeCompare(b.name));
}

export function categoryStats(productRows) {
  const groups = new Map();
  for (const p of productRows || []) {
    const g = groups.get(p.category) || { category: p.category, qty: 0, sales: 0, items: 0 };
    g.qty += p.qty;
    g.sales += p.sales;
    g.items += 1;
    groups.set(p.category, g);
  }
  const list = Array.from(groups.values());
  const total = sumBy(list, (g) => g.sales);
  return list
    .map((g) => ({ ...g, sales: round2(g.sales), share: total > 0 ? g.sales / total : 0 }))
    .sort((a, b) => b.sales - a.sales || a.category.localeCompare(b.category));
}

const PAYMENT_LABELS = {
  cash: 'Cash',
  card: 'Card',
  digital_wallet: 'Digital wallet',
  paynow: 'PayNow',
  qr: 'QR payment',
  stripe: 'Card (online)',
  online: 'Online',
  not_recorded: 'Not recorded',
};
export function paymentKey(o) {
  const m = typeof o?.payment_method === 'string' ? o.payment_method.trim().toLowerCase() : '';
  return !m || m === 'pending' ? 'not_recorded' : m;
}
export const paymentLabel = (key) => PAYMENT_LABELS[key] || titleCase(key);

const TYPE_LABELS = { dine_in: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery', pickup: 'Pickup', not_set: 'Not set' };
export function orderTypeKey(o) {
  const t = typeof o?.type === 'string' ? o.type.trim().toLowerCase() : '';
  return t || 'not_set';
}
export const orderTypeLabel = (key) => TYPE_LABELS[key] || titleCase(key);

function groupOrders(saleOrders, keyFn, labelFn) {
  const groups = new Map();
  for (const o of saleOrders || []) {
    const key = keyFn(o);
    const g = groups.get(key) || { key, label: labelFn(key), orders: 0, sales: 0 };
    g.orders += 1;
    g.sales += orderTotal(o);
    groups.set(key, g);
  }
  const count = (saleOrders || []).length;
  const last = (g) => (g.key === 'not_recorded' || g.key === 'not_set' ? 1 : 0); // "Not recorded" / "Not set" go last
  return Array.from(groups.values())
    .map((g) => ({ ...g, sales: round2(g.sales), share: count > 0 ? g.orders / count : 0 }))
    .sort((a, b) => last(a) - last(b) || b.orders - a.orders || b.sales - a.sales || a.label.localeCompare(b.label));
}
export const paymentStats = (saleOrders) => groupOrders(saleOrders, paymentKey, paymentLabel);
export const orderTypeStats = (saleOrders) => groupOrders(saleOrders, orderTypeKey, orderTypeLabel);

// Stock, for items that track inventory only ("Unlimited" items are skipped).
// Same rule as the Dashboard: 0 or less = out of stock; above 0 but below the
// item's low-stock level = low.
export function inventoryStatus(products = [], inventoryItems = []) {
  const invByProduct = new Map();
  for (const i of inventoryItems || []) {
    if (i && i.product_id && !invByProduct.has(i.product_id)) invByProduct.set(i.product_id, i);
  }
  const items = (products || [])
    .filter((p) => p && p.track_inventory === true)
    .map((p) => {
      const inv = invByProduct.get(p.id);
      const stock = num(inv ? inv.current_stock : p.stock_quantity);
      const rawThreshold = inv?.low_stock_threshold ?? p.low_stock_threshold;
      const threshold = rawThreshold == null || rawThreshold === '' ? 5 : num(rawThreshold);
      const status = stock <= 0 ? 'out' : stock < threshold ? 'low' : 'ok';
      return {
        product_id: p.id,
        name: cleanName(p.name, 'Unnamed item'),
        stock,
        threshold,
        unit: cleanName(inv?.unit, 'pcs'),
        status,
        active: p.is_active !== false,
      };
    });
  const rank = { out: 0, low: 1, ok: 2 };
  items.sort((a, b) => rank[a.status] - rank[b.status] || a.stock - b.stock || a.name.localeCompare(b.name));
  return {
    trackedCount: items.length,
    items,
    out: items.filter((i) => i.status === 'out'),
    low: items.filter((i) => i.status === 'low'),
  };
}

// Items on sale (switched on) that sold nothing in the period.
export function notSold(products = [], productRows = [], categories = []) {
  const sold = new Set((productRows || []).map((r) => r.product_id).filter(Boolean));
  const categoryById = new Map((categories || []).map((c) => [c.id, c.name]));
  return (products || [])
    .filter((p) => p && p.is_active !== false && !sold.has(p.id))
    .map((p) => ({
      product_id: p.id,
      name: cleanName(p.name, 'Unnamed item'),
      category: cleanName(categoryById.get(p.category_id), 'Uncategorized'),
      price: num(p.price),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Known customers (orders linked to a customer record) in the period.
export function customerSummary(saleOrders, customers, start, end) {
  if (!Array.isArray(customers)) return null;
  const ids = new Set((saleOrders || []).map((o) => o.customer_id).filter(Boolean));
  let newCount = 0;
  for (const c of customers) {
    if (!c || !ids.has(c.id)) continue;
    const first = toDate(c.first_order_at);
    if (first && first >= start && first <= end) newCount += 1;
  }
  return { known: ids.size, newCount, returning: Math.max(0, ids.size - newCount) };
}

// ── insights ────────────────────────────────────────────────────────────────
const wasWere = (n) => (n === 1 ? 'was' : 'were');
const listShares = (rows, limit = 4) => rows.slice(0, limit).map((r) => `${r.label} ${fmtPct(r.share)}`).join(', ');

export function buildInsights(r) {
  const out = [];
  const money = (v) => fmtMoney(v, r.currency);
  const s = r.summary;
  const ps = r.prevSummary;
  const days = r.period.days;
  const prevLabel = days === 1 ? 'the day before' : `the previous ${days} days`;

  if (s.salesCount === 0) {
    out.push('There were no paid orders in this period.');
  } else {
    const ch = change(s.salesTotal, ps.salesTotal);
    let line = `Sales were ${money(s.salesTotal)} from ${plural(s.salesCount, 'paid order')}`;
    if (ch == null) {
      line += ps.salesCount === 0 ? `. There were no sales in ${prevLabel} to compare with.` : '.';
    } else if (Math.abs(ch) < 0.005) {
      line += `, the same as ${prevLabel}.`;
    } else {
      line += `, ${ch > 0 ? 'up' : 'down'} ${fmtPct(Math.abs(ch))} on ${prevLabel} (${money(ps.salesTotal)}).`;
    }
    out.push(line);
    out.push(`Average order: ${money(s.avgOrder)}${ps.salesCount > 0 ? ` (previous period: ${money(ps.avgOrder)})` : ''}.`);

    const daysWithSales = r.daily.filter((d) => d.orders > 0);
    if (daysWithSales.length >= 2) {
      const best = daysWithSales.reduce((a, b) => (b.sales > a.sales ? b : a));
      out.push(`Best day: ${fmtDay(best.date)}, ${money(best.sales)} from ${plural(best.orders, 'order')}.`);
    }
    if (s.salesCount >= 3) {
      const busiest = r.hourly.reduce((a, b) => (b.orders > a.orders ? b : a));
      out.push(`Busiest hour: ${busiest.label}, with ${plural(busiest.orders, 'order')} (${fmtPct(busiest.orders / s.salesCount)} of paid orders).`);
    }
  }

  if (r.products.length > 0) {
    const top = r.products[0];
    out.push(`Top seller: ${top.name}, ${fmtQty(top.qty)} sold for ${money(top.sales)} (${fmtPct(top.share)} of item sales).`);
    if (r.products.length >= 4) {
      const top3 = r.products.slice(0, 3).reduce((a, p) => a + p.share, 0);
      out.push(`The top 3 items make up ${fmtPct(top3)} of item sales.`);
    }
  }
  if (r.categories.length >= 2) {
    const c = r.categories[0];
    out.push(`${c.category} is the biggest category, with ${fmtPct(c.share)} of item sales.`);
  }
  if (r.orderTypes.length >= 2) {
    out.push(`Order types: ${listShares(r.orderTypes)} of paid orders.`);
  }
  if (s.salesCount > 0) {
    const recorded = r.payments.filter((p) => p.key !== 'not_recorded');
    const missing = r.payments.find((p) => p.key === 'not_recorded');
    if (recorded.length === 0) {
      out.push('The payment method was not recorded for any of these orders.');
    } else {
      out.push(`Payment methods: ${listShares(r.payments.filter((p) => p.key !== 'not_recorded'))}${missing ? `; not recorded for ${plural(missing.orders, 'order')}` : ''}.`);
    }
  }
  if (s.discount > 0) {
    out.push(`Discounts given: ${money(s.discount)} on ${plural(s.discountedOrders, 'order')}.`);
  }
  if (s.openCount > 0) {
    out.push(`${plural(s.openCount, 'order')} ${s.openCount === 1 ? 'is' : 'are'} still unpaid (${money(s.openTotal)}) and not counted in sales.`);
  }
  if (s.cancelledCount > 0) {
    out.push(`${plural(s.cancelledCount, 'order')} ${wasWere(s.cancelledCount)} cancelled (${money(s.cancelledTotal)}) and not counted in sales.`);
  }
  if (r.notSold.length > 0 && s.salesCount > 0) {
    out.push(`${plural(r.notSold.length, 'item')} on sale had no sales in this period.`);
  }
  if (r.inventory && r.inventory.trackedCount > 0) {
    const { out: o, low, trackedCount } = r.inventory;
    if (o.length || low.length) {
      const parts = [];
      if (o.length) parts.push(`${plural(o.length, 'item')} out of stock`);
      if (low.length) parts.push(`${plural(low.length, 'item')} running low`);
      out.push(`Stock: ${parts.join(' and ')} (of ${plural(trackedCount, 'item')} that track stock).`);
    } else {
      out.push(trackedCount === 1
        ? 'Stock: the 1 item that tracks stock is above its low-stock level.'
        : `Stock: all ${plural(trackedCount, 'item')} that track stock are above their low-stock level.`);
    }
  }
  if (r.customers && r.customers.known > 0) {
    const { known, newCount } = r.customers;
    if (known === 1) out.push(`1 known customer ordered, ${newCount ? 'for the first time' : 'a returning customer'}.`);
    else if (newCount === 0) out.push(`${plural(known, 'known customer')} ordered, all returning.`);
    else if (newCount === known) out.push(`${plural(known, 'known customer')} ordered, all for the first time.`);
    else out.push(`${plural(known, 'known customer')} ordered; ${fmtQty(newCount)} of them for the first time.`);
  }
  return out;
}

// ── the whole report ────────────────────────────────────────────────────────
// orders: every non-deleted order from the previous period's start to the end
// of the selected period (the screen loads exactly that range).
export function buildReport({
  orders = [],
  products = [],
  categories = [],
  inventoryItems = [],
  customers = null,
  range,
  currency = 'SGD',
  storeName = '',
  generatedAt = new Date(),
  includeAdvanced = true,
}) {
  const period = periodOf(range);
  const live = (orders || []).filter((o) => o && !o.is_deleted);
  const byDate = (a, b) => (toDate(a.created_date)?.getTime() || 0) - (toDate(b.created_date)?.getTime() || 0);
  const current = live.filter((o) => inPeriod(o, period.start, period.end)).sort(byDate);
  const previous = live.filter((o) => inPeriod(o, period.prevStart, period.prevEnd));
  const sales = current.filter(isSale);
  const products_ = productStats(sales, products, categories);

  const report = {
    storeName: cleanName(storeName, 'Store'),
    currency: currency || 'SGD',
    generatedAt,
    period,
    periodLabel: fmtPeriod(period),
    salesRule: SALES_RULE_TEXT,
    summary: summarize(current),
    prevSummary: summarize(previous),
    daily: dailySeries(sales, period.start, period.end),
    hourly: hourlySeries(sales),
    products: products_,
    categories: categoryStats(products_),
    payments: paymentStats(sales),
    orderTypes: orderTypeStats(sales),
    notSold: notSold(products, products_, categories),
    inventory: includeAdvanced ? inventoryStatus(products, inventoryItems) : null,
    customers: includeAdvanced ? customerSummary(sales, customers, period.start, period.end) : null,
    orders: current,
    categoryNameById: Object.fromEntries((categories || []).map((c) => [c.id, c.name])),
    productById: Object.fromEntries((products || []).map((p) => [p.id, p])),
  };
  report.chart = chartSeries(report.daily);
  report.insights = buildInsights(report);
  return report;
}

// File names are kept to plain letters and digits: some browsers and phones save
// a download whose name has other characters as just "download", without the
// extension. "Café 咖啡馆" → "Cafe"; a name with no Latin letters → "Store".
export function reportFileName(report, ext) {
  const store = report.storeName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 _-]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40)
    .replace(/^_+|_+$/g, '') || 'Store';
  const { start, end } = report.period;
  const span = dayKey(start) === dayKey(end) ? dayKey(start) : `${dayKey(start)}_to_${dayKey(end)}`;
  return `${store}_sales_report_${span}.${ext}`;
}
