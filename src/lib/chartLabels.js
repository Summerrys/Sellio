// Axis labels for the Reports charts. An axis label that runs past the chart's left
// edge is cut off by the chart itself, so the charts keep their axes on the chart
// (no negative left margin) and these keep the labels inside their axis.

// Money and counts on a narrow axis: 850, 1.2K, 12.5K.
const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const compactTick = (v) => compactNumber.format(v);

// A name on a bar chart's label column, shortened with "…" so it fits `maxWidth`
// pixels. Measured in the page's own font, so it works for Chinese names too
// (they have no spaces for the chart to wrap at).
let measureCtx = null;
export function fitLabel(text, maxWidth, fontSize = 10) {
  const label = String(text ?? '');
  if (typeof document === 'undefined') return label;
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return label;
  measureCtx.font = `${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
  const fits = (s) => measureCtx.measureText(s).width <= maxWidth;
  if (fits(label)) return label;
  const chars = Array.from(label);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(`${chars.slice(0, mid).join('').trimEnd()}…`)) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join('').trimEnd()}…`;
}

// tickFormatter for a category axis `axisWidth` pixels wide. The label ends 8 px
// short of the bars (Recharts' tick size and margin); 2 px more to spare.
export const fitTick = (axisWidth) => (v) => fitLabel(v, axisWidth - 10);
