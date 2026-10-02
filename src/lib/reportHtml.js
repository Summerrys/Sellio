// The PDF report's page content as a self-contained HTML document (A4 width),
// built from the same report object as the screen and the Excel file. Each
// <section data-block> is captured separately and laid onto PDF pages, so a
// section never splits across pages. The browser draws the text, so Chinese
// and other scripts come out right with the device's own fonts.
import { fmtDay, fmtMoney, fmtPct, fmtQty, fmtPeriod, fmtDateTime, fmtHour, change } from './reportData';

export const PAGE_WIDTH_PX = 760;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeColor = (c, fallback) => (typeof c === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.trim()) ? c.trim() : fallback);

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", sans-serif';

function changeLine(cur, prev, prevCount) {
  const ch = change(cur, prev);
  if (ch == null) return prevCount === 0 ? '<span class="muted">No sales in the previous period</span>' : '<span class="muted">—</span>';
  if (Math.abs(ch) < 0.005) return '<span class="muted">Same as the previous period</span>';
  return `<span class="${ch > 0 ? 'up' : 'down'}">${ch > 0 ? '▲' : '▼'} ${fmtPct(Math.abs(ch))}</span> <span class="muted">vs previous period</span>`;
}

function kpi(label, value, sub) {
  return `<div class="card kpi"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="sub">${sub}</div></div>`;
}

function barChart(rows, { valueKey, labelKey, accent, height = 130, maxLabels = 12 }) {
  const max = Math.max(0, ...rows.map((r) => r[valueKey]));
  const every = Math.max(1, Math.ceil(rows.length / maxLabels));
  const bars = rows.map((r) => {
    const h = max > 0 ? Math.max(r[valueKey] > 0 ? 2 : 0, Math.round((r[valueKey] / max) * height)) : 0;
    return `<div class="col"><div class="bar" style="height:${h}px;background:${accent}"></div></div>`;
  }).join('');
  const labels = rows.map((r, i) => `<div class="col"><span>${i % every === 0 ? esc(r[labelKey]) : ''}</span></div>`).join('');
  return `<div class="chart" style="height:${height}px">${bars}</div><div class="xlabels">${labels}</div>`;
}

function shareCell(share, accent) {
  const w = Math.max(0, Math.min(100, Math.round(share * 100)));
  return `<div class="share"><div class="track"><div class="fill" style="width:${w}%;background:${accent}"></div></div><span>${esc(fmtPct(share))}</span></div>`;
}

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

export function reportHtml(report, { accent: accentIn, logo = null } = {}) {
  const accent = safeColor(accentIn, '#3b82f6');
  const r = report;
  const s = r.summary;
  const ps = r.prevSummary;
  const money = (v) => fmtMoney(v, r.currency);
  const blocks = [];

  // ── header ──
  const prevPeriod = { start: r.period.prevStart, end: r.period.prevEnd, days: r.period.days };
  blocks.push(`
    <div class="head">
      <div>
        <div class="store">${esc(r.storeName)}</div>
        <div class="title">Sales report · ${esc(r.periodLabel)}</div>
      </div>
      ${logo ? `<img class="logo" src="${esc(logo)}" alt="">` : ''}
    </div>
    <div class="rule" style="background:${accent}"></div>
    <div class="meta">Generated ${esc(fmtDateTime(r.generatedAt))} · Amounts in ${esc(r.currency)} · Compared with ${esc(fmtPeriod(prevPeriod))}</div>
    <div class="meta">${esc(r.salesRule)}</div>`);

  // ── key figures ──
  blocks.push(`
    <div class="kpis">
      ${kpi('Sales', money(s.salesTotal), changeLine(s.salesTotal, ps.salesTotal, ps.salesCount))}
      ${kpi('Paid orders', fmtQty(s.salesCount), changeLine(s.salesCount, ps.salesCount, ps.salesCount))}
      ${kpi('Average order', money(s.avgOrder), changeLine(s.avgOrder, ps.avgOrder, ps.salesCount))}
      ${kpi('Items sold', fmtQty(s.itemsSold), changeLine(s.itemsSold, ps.itemsSold, ps.salesCount))}
      ${kpi('Unpaid (open)', money(s.openTotal), `<span class="muted">${esc(fmtQty(s.openCount))} ${s.openCount === 1 ? 'order' : 'orders'}, not in sales</span>`)}
      ${kpi('Cancelled', money(s.cancelledTotal), `<span class="muted">${esc(fmtQty(s.cancelledCount))} ${s.cancelledCount === 1 ? 'order' : 'orders'}, not in sales</span>`)}
    </div>`);

  // ── insights ──
  blocks.push(`
    <h2>Key insights</h2>
    <div class="insights">${r.insights.map((t, i) => `<div class="ins"><span class="n">${i + 1}.</span><span class="t">${esc(t)}</span></div>`).join('')}</div>`);

  // ── sales chart ──
  const unit = r.chart.length === r.daily.length ? 'day' : r.chart[0] && String(r.chart[0].label).startsWith('Wk ') ? 'week' : 'month';
  if (s.salesCount > 0 && r.chart.length > 1) {
    const best = r.chart.reduce((a, b) => (b.sales > a.sales ? b : a), r.chart[0]);
    blocks.push(`
      <h2>Sales by ${unit}</h2>
      <div class="note">Highest: ${esc(unit === 'day' ? fmtDay(best.date) : best.label)} · ${esc(money(best.sales))} from ${esc(fmtQty(best.orders))} ${best.orders === 1 ? 'order' : 'orders'}</div>
      ${barChart(r.chart, { valueKey: 'sales', labelKey: 'label', accent })}`);
  }

  // ── top items ──
  if (r.products.length > 0) {
    const top = r.products.slice(0, 10);
    blocks.push(`
      <h2>Top items${r.products.length > 10 ? ` <span class="muted small">(top 10 of ${r.products.length}; all items are in the Excel export)</span>` : ''}</h2>
      <table>
        <thead><tr><th class="rank">#</th><th>Item</th><th>Category</th><th class="num">Qty</th><th class="num">Item sales</th><th class="sharecol">Share of item sales</th></tr></thead>
        <tbody>${top.map((p, i) => `<tr><td class="rank">${i + 1}</td><td>${esc(p.name)}</td><td class="muted">${esc(p.category)}</td><td class="num">${esc(fmtQty(p.qty))}</td><td class="num">${esc(money(p.sales))}</td><td>${shareCell(p.share, accent)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="note">Item sales are line prices × quantity, before order discounts.</div>`);
  }

  // ── categories · payments · order types ──
  if (s.salesCount > 0) {
    const small = (title, head, rows) => `
      <div class="card">
        <h3>${title}</h3>
        <table class="compact"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    const cats = small('By category', '<th>Category</th><th class="num">Item sales</th><th class="num">Share</th>',
      r.categories.slice(0, 8).map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${esc(money(c.sales))}</td><td class="num">${esc(fmtPct(c.share))}</td></tr>`).join(''));
    const pays = small('Payment methods', '<th>Method</th><th class="num">Orders</th><th class="num">Share</th>',
      r.payments.map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${esc(fmtQty(p.orders))}</td><td class="num">${esc(fmtPct(p.share))}</td></tr>`).join(''));
    const types = small('Order types', '<th>Type</th><th class="num">Orders</th><th class="num">Share</th>',
      r.orderTypes.map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${esc(fmtQty(p.orders))}</td><td class="num">${esc(fmtPct(p.share))}</td></tr>`).join(''));
    blocks.push(`<div class="grid3">${cats}${pays}${types}</div>`);
  }

  // ── busiest hours ──
  if (s.salesCount > 0) {
    const active = r.hourly.filter((h) => h.orders > 0);
    const first = active[0].hour;
    const last = active[active.length - 1].hour;
    const rows = r.hourly.slice(first, last + 1).map((h) => ({ ...h, short: fmtHour(h.hour) }));
    blocks.push(`
      <h2>Paid orders by hour</h2>
      ${barChart(rows, { valueKey: 'orders', labelKey: 'short', accent, height: 90, maxLabels: 24 })}`);
  }

  // ── sales table (same rows as the chart) ──
  if (s.salesCount > 0) {
    const head = `<thead><tr><th>${unit === 'day' ? 'Date' : unit === 'week' ? 'Week starting' : 'Month'}</th><th class="num">Paid orders</th><th class="num">Sales</th><th class="num">Average order</th></tr></thead>`;
    const parts = chunk(r.chart, 18);
    parts.forEach((rows, i) => {
      blocks.push(`
        <h2>Figures by ${unit}${i > 0 ? ' <span class="muted small">(continued)</span>' : ''}</h2>
        <table>${head}<tbody>${rows.map((d) => `<tr><td>${esc(unit === 'day' ? fmtDay(d.date) : d.label.replace(/^Wk /, ''))}</td><td class="num">${esc(fmtQty(d.orders))}</td><td class="num">${esc(money(d.sales))}</td><td class="num">${esc(money(d.orders ? d.sales / d.orders : 0))}</td></tr>`).join('')}
        ${i === parts.length - 1 ? `<tr class="total"><td>Total</td><td class="num">${esc(fmtQty(s.salesCount))}</td><td class="num">${esc(money(s.salesTotal))}</td><td class="num">${esc(money(s.avgOrder))}</td></tr>` : ''}</tbody></table>`);
    });
  }

  // ── stock ──
  if (r.inventory && r.inventory.trackedCount > 0) {
    const alerts = [...r.inventory.out, ...r.inventory.low];
    if (alerts.length === 0) {
      const n = r.inventory.trackedCount;
      blocks.push(`<h2>Stock</h2><div class="note">${n === 1 ? 'The 1 item that tracks stock is above its low-stock level.' : `All ${esc(fmtQty(n))} items that track stock are above their low-stock level.`}</div>`);
    } else {
      chunk(alerts, 18).forEach((rows, i) => {
        blocks.push(`
          <h2>Stock alerts${i > 0 ? ' <span class="muted small">(continued)</span>' : ''}</h2>
          <table><thead><tr><th>Item</th><th>Status</th><th class="num">In stock</th><th class="num">Low-stock level</th></tr></thead>
          <tbody>${rows.map((a) => `<tr><td>${esc(a.name)}${a.active ? '' : ' <span class="muted small">(switched off)</span>'}</td><td class="${a.status === 'out' ? 'down' : 'warn'}">${a.status === 'out' ? 'Out of stock' : 'Low'}</td><td class="num">${esc(fmtQty(a.stock))} ${esc(a.unit)}</td><td class="num">${esc(fmtQty(a.threshold))}</td></tr>`).join('')}</tbody></table>
          ${i === 0 ? `<div class="note">Only items with "Track Inventory" switched on are checked (${esc(fmtQty(r.inventory.trackedCount))} items).</div>` : ''}`);
      });
    }
  }

  // ── not sold ──
  if (r.notSold.length > 0 && s.salesCount > 0) {
    const shown = r.notSold.slice(0, 45);
    blocks.push(`
      <h2>On sale but not sold in this period (${esc(fmtQty(r.notSold.length))})</h2>
      <div class="names">${shown.map((p) => `<span>${esc(p.name)}</span>`).join('')}${r.notSold.length > shown.length ? `<span class="muted">+${r.notSold.length - shown.length} more (see the Excel export)</span>` : ''}</div>`);
  }

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{background:#fff}
    body{width:${PAGE_WIDTH_PX}px;color:#0f172a;font-family:${FONT};font-size:12px;line-height:1.45;-webkit-font-smoothing:antialiased}
    section{padding:2px 2px 14px;background:#fff}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
    .store{font-size:22px;font-weight:700;line-height:1.25}
    .title{font-size:13px;color:#334155;margin-top:2px}
    .logo{width:52px;height:52px;object-fit:contain;border-radius:10px}
    .rule{height:3px;border-radius:2px;margin:10px 0 8px}
    .meta{font-size:10.5px;color:#64748b;margin-top:2px}
    h2{font-size:14px;font-weight:700;margin:0 0 8px}
    h3{font-size:12px;font-weight:700;margin:0 0 6px}
    .muted{color:#64748b}.small{font-size:10.5px;font-weight:400}
    .up{color:#059669}.down{color:#dc2626}.warn{color:#d97706}
    .note{font-size:10.5px;color:#64748b;margin-top:6px}
    .card{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#fff}
    .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .kpi .label{font-size:11px;color:#64748b}
    .kpi .value{font-size:18px;font-weight:700;margin-top:2px;white-space:nowrap}
    .kpi .sub{font-size:10.5px;margin-top:3px}
    .insights .ins{display:flex;gap:6px;margin:0 0 4px}
    .insights .n{flex:none;width:20px;text-align:right;color:#64748b}
    .insights .t{flex:1 1 auto;min-width:0}
    .chart{display:flex;align-items:flex-end;gap:2px;border-bottom:1px solid #cbd5e1;margin-top:8px}
    .chart .col,.xlabels .col{flex:1 1 0;min-width:0;display:flex;align-items:flex-end;justify-content:center}
    .chart .bar{width:100%;max-width:28px;border-radius:3px 3px 0 0}
    .xlabels{display:flex;gap:2px;margin-top:3px;height:14px}
    .xlabels span{font-size:9px;color:#94a3b8;white-space:nowrap}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:10.5px;color:#64748b;font-weight:600;padding:5px 6px;border-bottom:1px solid #e2e8f0}
    td{padding:5px 6px;border-bottom:1px solid #f1f5f9;vertical-align:top}
    .num{text-align:right;white-space:nowrap}
    .rank{width:22px;color:#94a3b8}
    .sharecol{width:150px}
    tr.total td{font-weight:700;border-bottom:none;border-top:1px solid #cbd5e1}
    table.compact th,table.compact td{padding:3px 4px;font-size:11px}
    .share{display:flex;align-items:center;gap:6px}
    .share .track{flex:1;height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden}
    .share .fill{height:6px;border-radius:3px}
    .share span{width:34px;text-align:right;font-size:11px}
    .grid3{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:8px;align-items:start}
    .names{display:flex;flex-wrap:wrap;gap:4px 6px}
    .names span{border:1px solid #e2e8f0;border-radius:6px;padding:2px 6px;font-size:11px}`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${blocks.map((b) => `<section data-block>${b}</section>`).join('')}</body></html>`;
}
