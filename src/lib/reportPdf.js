// The Reports PDF export. The report is laid out as HTML in a hidden frame
// (reportHtml.js), each section is drawn to an image with html2canvas, and the
// images are placed on A4 pages with jsPDF, starting a new page whenever the
// next section doesn't fit. The text is drawn by the browser, so Chinese and
// other scripts appear exactly as on screen. Both libraries load only when a
// PDF is made.
import { reportHtml, PAGE_WIDTH_PX } from './reportHtml';
import { dayKey, fmtDate } from './reportData';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// html2canvas measures each font's baseline with a hidden 1×1 probe image that it
// adds to the page's own <body>. The app's Tailwind base styles make every <img>
// a block, which throws that measurement off and draws all text a few pixels too
// low. While a PDF is being made, this rule puts just that probe image back inline.
const PROBE_FIX_CSS = 'body > div > img[src^="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP"]{display:inline !important}';
function addProbeFix() {
  const style = document.createElement('style');
  style.setAttribute('data-report-pdf', '');
  style.textContent = PROBE_FIX_CSS;
  document.head.appendChild(style);
  return () => style.remove();
}

async function toDataUrl(url) {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function loadFrame(html) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${PAGE_WIDTH_PX}px;height:1200px;border:0;visibility:visible;pointer-events:none;`;
    const timer = setTimeout(() => reject(new Error('The report layout did not load')), 15000);
    frame.onload = () => { clearTimeout(timer); resolve(frame); };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

async function waitForContent(doc) {
  const images = Array.from(doc.images || []);
  await Promise.all(images.map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
  if (doc.fonts && doc.fonts.ready) {
    try { await doc.fonts.ready; } catch { /* fonts are best effort */ }
  }
  await nextFrame();
  await nextFrame();
}

// Returns a PDF Blob.
export async function buildReportPdf(report, { accent, logoUrl } = {}) {
  const [jspdfModule, html2canvasModule] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const JsPDF = jspdfModule.jsPDF || jspdfModule.default;
  const html2canvas = html2canvasModule.default || html2canvasModule;

  const logo = logoUrl ? await toDataUrl(logoUrl) : null;
  const frame = await loadFrame(reportHtml(report, { accent, logo }));
  const removeProbeFix = addProbeFix();
  try {
    const doc = frame.contentDocument;
    await waitForContent(doc);
    frame.style.height = `${Math.max(1200, doc.documentElement.scrollHeight)}px`;
    await nextFrame();

    const pdf = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 34;
    const footer = 22;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin - footer - margin / 2;
    const ptPerPx = usableW / PAGE_WIDTH_PX;

    const blocks = Array.from(doc.querySelectorAll('section[data-block]'));
    let y = margin;
    for (const el of blocks) {
      const rect = el.getBoundingClientRect();
      if (rect.height < 1) continue;
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        windowWidth: PAGE_WIDTH_PX,
        windowHeight: doc.documentElement.scrollHeight,
      });
      let w = usableW;
      let h = (canvas.height / canvas.width) * usableW;
      if (h > usableH) { w *= usableH / h; h = usableH; } // a section taller than a page is shrunk to fit
      if (y > margin && y + h > margin + usableH) {
        pdf.addPage();
        y = margin;
      }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, y, w, h, undefined, 'FAST');
      y += h + 4 * ptPerPx;
      canvas.width = 0; // free the memory early (matters on phones)
      canvas.height = 0;
    }

    const pages = pdf.getNumberOfPages();
    const { start, end } = report.period;
    const span = dayKey(start) === dayKey(end) ? fmtDate(start) : `${fmtDate(start)} - ${fmtDate(end)}`;
    for (let i = 1; i <= pages; i += 1) {
      pdf.setPage(i);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text(`Sales report, ${span}`, margin, pageH - margin / 2 - 4);
      pdf.text(`Page ${i} of ${pages}`, pageW - margin, pageH - margin / 2 - 4, { align: 'right' });
    }
    pdf.setProperties({ title: `Sales report ${span}`, creator: 'Sellio' });
    return pdf.output('blob');
  } finally {
    removeProbeFix();
    frame.remove();
  }
}
