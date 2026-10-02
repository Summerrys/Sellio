// Minimal .xlsx writer, no dependencies. Text (any language, stored as UTF-8),
// numbers and dates; a few cell styles; column widths; a frozen header row;
// filters; merged cells. The zip is deflated with the browser's built-in
// CompressionStream when available, otherwise stored uncompressed (both open
// in Excel, Numbers, Google Sheets and LibreOffice).
//
// await buildXlsx([{ name, columns: [width, ...], rows: [[cell, ...], ...],
//              freezeRows, filterRow, merges: ['A1:D1'], rowHeights: { rowIndex: points } }])
// A cell is null, a string, a number, or { v, s } with s one of STYLES' keys
// (dates: { v: Date, s: 'date' | 'datetime' }).

export const STYLES = {
  default: 0, header: 1, money: 2, int: 3, pct: 4, date: 5, datetime: 6,
  title: 7, bold: 8, wrap: 9, moneyBold: 10, intBold: 11, muted: 12, pctBold: 13, headerNum: 14,
};

const MAX_CELL_TEXT = 32767;

function cleanText(value) {
  let s = String(value);
  // keep surrogate pairs, drop lone halves, then drop characters XML 1.0 forbids
  s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (m) => (m.length === 2 ? m : ''));
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
  if (s.length > MAX_CELL_TEXT) s = s.slice(0, MAX_CELL_TEXT);
  return s;
}
const esc = (s) => cleanText(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function columnName(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Excel stores dates as days since 30 Dec 1899, in the time shown (local time).
export function excelDate(d) {
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds())
    - Date.UTC(1899, 11, 30)) / 86400000;
}

function cellXml(ref, cell) {
  if (cell == null || cell === '') return '';
  const isObj = typeof cell === 'object' && !(cell instanceof Date);
  const v = isObj ? cell.v : cell;
  if (v == null || v === '') {
    const s = isObj && cell.s ? STYLES[cell.s] || 0 : 0;
    return s ? `<c r="${ref}" s="${s}"/>` : '';
  }
  let style = isObj && cell.s ? STYLES[cell.s] || 0 : 0;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    if (!style) style = STYLES.datetime;
    return `<c r="${ref}" s="${style}"><v>${excelDate(v)}</v></c>`;
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`;
  }
  if (typeof v === 'boolean') {
    return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t>${v ? 'Yes' : 'No'}</t></is></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml(sheet, selected) {
  const rows = sheet.rows || [];
  const widthCount = Math.max(1, (sheet.columns || []).length, ...rows.map((r) => (r ? r.length : 0)));
  const lastRef = `${columnName(widthCount - 1)}${Math.max(1, rows.length)}`;
  const freeze = sheet.freezeRows > 0
    ? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sheet.freezeRows + 1}" sqref="A${sheet.freezeRows + 1}"/>`
    : '';
  const cols = (sheet.columns || []).length
    ? `<cols>${sheet.columns.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Number(w) || 10}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const heights = sheet.rowHeights || {};
  const body = rows.map((row, ri) => {
    const r = ri + 1;
    const cells = (row || []).map((cell, ci) => cellXml(`${columnName(ci)}${r}`, cell)).join('');
    const ht = heights[ri] ? ` ht="${heights[ri]}" customHeight="1"` : '';
    return cells || ht ? `<row r="${r}"${ht}>${cells}</row>` : '';
  }).join('');
  let filter = '';
  if (sheet.filterRow != null && sheet.filterLastRow != null) {
    const from = sheet.filterRow + 1;
    const to = Math.max(from, sheet.filterLastRow + 1);
    filter = `<autoFilter ref="A${from}:${columnName(widthCount - 1)}${to}"/>`;
  }
  const merges = (sheet.merges || []).length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<dimension ref="A1:${lastRef}"/>`
    + `<sheetViews><sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ''}>${freeze}</sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + cols
    + `<sheetData>${body}</sheetData>`
    + filter
    + merges
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + '</worksheet>';
}

const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="2"><numFmt numFmtId="164" formatCode="d mmm yyyy"/><numFmt numFmtId="165" formatCode="d mmm yyyy hh:mm"/></numFmts>'
  + '<fonts count="4">'
  + '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'
  + '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>'
  + '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>'
  + '<font><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/><family val="2"/></font>'
  + '</fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
  + '<border><left/><right/><top/><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="15">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'                                                         // 0 default
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' // 1 header
  + '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'                                  // 2 money
  + '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'                                  // 3 int
  + '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'                                  // 4 pct
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>' // 5 date
  + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>' // 6 datetime
  + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                          // 7 title
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                          // 8 bold
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' // 9 wrap
  + '<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'                    // 10 money bold
  + '<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'                    // 11 int bold
  + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' // 12 muted
  + '<xf numFmtId="9" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'                    // 13 pct bold
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>' // 14 header, numbers
  + '</cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

export function safeSheetNames(names) {
  const used = new Set();
  return names.map((raw, i) => {
    let base = cleanText(raw || `Sheet${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || `Sheet${i + 1}`;
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = ` (${n++})`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

// ── zip ─────────────────────────────────────────────────────────────────────
let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Deflate with the browser's built-in CompressionStream when it has one
// (Chrome 103+, Safari 16.4+, Firefox 113+); null means "store uncompressed".
async function deflateRaw(bytes) {
  if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined' || typeof Blob === 'undefined') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

// files: [{ name, data: string | Uint8Array }] → zip bytes (deflated when
// possible, otherwise stored).
export async function zipFiles(files, when = new Date(), { compress = true } = {}) {
  const enc = new TextEncoder();
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2);
  const dosDate = ((Math.max(1980, when.getFullYear()) - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const entries = [];
  for (const f of files) {
    const name = enc.encode(f.name);
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const deflated = compress ? await deflateRaw(raw) : null;
    const useDeflate = !!deflated && deflated.length < raw.length;
    entries.push({ name, crc: crc32(raw), size: raw.length, method: useDeflate ? 8 : 0, data: useDeflate ? deflated : raw });
  }
  const localSize = entries.reduce((s, e) => s + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((s, e) => s + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let p = 0;
  const offsets = [];
  for (const e of entries) {
    offsets.push(p);
    view.setUint32(p, 0x04034b50, true);
    view.setUint16(p + 4, 20, true);
    view.setUint16(p + 6, 0x0800, true); // UTF-8 names
    view.setUint16(p + 8, e.method, true);
    view.setUint16(p + 10, dosTime, true);
    view.setUint16(p + 12, dosDate, true);
    view.setUint32(p + 14, e.crc, true);
    view.setUint32(p + 18, e.data.length, true);
    view.setUint32(p + 22, e.size, true);
    view.setUint16(p + 26, e.name.length, true);
    view.setUint16(p + 28, 0, true);
    out.set(e.name, p + 30);
    out.set(e.data, p + 30 + e.name.length);
    p += 30 + e.name.length + e.data.length;
  }
  const centralStart = p;
  entries.forEach((e, i) => {
    view.setUint32(p, 0x02014b50, true);
    view.setUint16(p + 4, 20, true);
    view.setUint16(p + 6, 20, true);
    view.setUint16(p + 8, 0x0800, true);
    view.setUint16(p + 10, e.method, true);
    view.setUint16(p + 12, dosTime, true);
    view.setUint16(p + 14, dosDate, true);
    view.setUint32(p + 16, e.crc, true);
    view.setUint32(p + 20, e.data.length, true);
    view.setUint32(p + 24, e.size, true);
    view.setUint16(p + 28, e.name.length, true);
    view.setUint16(p + 30, 0, true);
    view.setUint16(p + 32, 0, true);
    view.setUint16(p + 34, 0, true);
    view.setUint16(p + 36, 0, true);
    view.setUint32(p + 38, 0, true);
    view.setUint32(p + 42, offsets[i], true);
    out.set(e.name, p + 46);
    p += 46 + e.name.length;
  });
  view.setUint32(p, 0x06054b50, true);
  view.setUint16(p + 4, 0, true);
  view.setUint16(p + 6, 0, true);
  view.setUint16(p + 8, entries.length, true);
  view.setUint16(p + 10, entries.length, true);
  view.setUint32(p + 12, p - centralStart, true);
  view.setUint32(p + 16, centralStart, true);
  view.setUint16(p + 20, 0, true);
  return out;
}

export async function buildXlsx(sheets, { title = '', when = new Date(), compress = true } = {}) {
  const names = safeSheetNames(sheets.map((s) => s.name));
  const files = [];
  files.push({
    name: '[Content_Types].xml',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + '</Types>',
  });
  files.push({
    name: '_rels/.rels',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
      + '</Relationships>',
  });
  const iso = new Date(when.getTime()).toISOString().replace(/\.\d{3}Z$/, 'Z');
  files.push({
    name: 'docProps/core.xml',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>${esc(title)}</dc:title><dc:creator>Sellio</dc:creator>`
      + `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>`
      + '</cp:coreProperties>',
  });
  files.push({
    name: 'docProps/app.xml',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Sellio</Application></Properties>',
  });
  const defined = sheets
    .map((s, i) => {
      if (s.filterRow == null || s.filterLastRow == null) return '';
      const widthCount = Math.max(1, (s.columns || []).length, ...(s.rows || []).map((r) => (r ? r.length : 0)));
      const quoted = `'${names[i].replace(/'/g, "''")}'`;
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(quoted)}!$A$${s.filterRow + 1}:$${columnName(widthCount - 1)}$${Math.max(s.filterRow + 1, s.filterLastRow + 1)}</definedName>`;
    })
    .join('');
  files.push({
    name: 'xl/workbook.xml',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<bookViews><workbookView activeTab="0"/></bookViews>'
      + `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
      + (defined ? `<definedNames>${defined}</definedNames>` : '')
      + '</workbook>',
  });
  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + '</Relationships>',
  });
  files.push({ name: 'xl/styles.xml', data: STYLES_XML });
  sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s, i === 0) }));
  return zipFiles(files, when, { compress });
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
