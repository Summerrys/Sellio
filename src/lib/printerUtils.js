// ESC/POS receipt builder utility
import { paymentText } from './tableBill';
import { isCapacitorApp } from './nativeApp.js';
import { currencyDecimals, formatMoney, roundMoney } from './money';

// Known BLE thermal/label printer GATT service+characteristic UUID pairs.
// Different chipsets use different UUIDs — we try each in order until one works.
// (Also used by nativePrinter.js, the apps' Bluetooth.)
export const BLE_PRINTER_PROFILES = [
  // Profile A: XPrinter, GOOJPRT, most Chinese thermal receipt printers
  { service: '000018f0-0000-1000-8000-00805f9b34fb', char: '00002af1-0000-1000-8000-00805f9b34fb' },
  // Profile B: Peripage, NIIMBOT, some label printers
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', char: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
  // Profile C: HM-10 / CC41 BLE chip (many generic Chinese printers)
  { service: '0000ffe0-0000-1000-8000-00805f9b34fb', char: '0000ffe1-0000-1000-8000-00805f9b34fb' },
  // Profile D: 0xFF00 series
  { service: '0000ff00-0000-1000-8000-00805f9b34fb', char: '0000ff02-0000-1000-8000-00805f9b34fb' },
  // Profile E: Microchip RN4020 / BM70
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', char: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
];

export const ALL_BT_SERVICES = BLE_PRINTER_PROFILES.map(p => p.service);

// BT device cache stored on window — survives React re-renders and module re-evaluations
export function setBtDeviceCache(device) {
  window.__sellioBtDevice = device || null;
}

export function getCachedBtDevice() {
  return window.__sellioBtDevice || null;
}

// --- GBK encoding for Chinese-clone ESC/POS printers ---
// The BLE printer chipsets this app targets (XPrinter/GOOJPRT and similar,
// see BLE_PRINTER_PROFILES above) almost universally use the legacy GBK/
// GB18030 codepage for their built-in Chinese font, entered via the ESC/POS
// "FS &" Kanji-mode command — not UTF-8. Sending UTF-8 bytes (which is all
// TextEncoder can ever produce) makes the printer misinterpret them as GBK,
// producing garbled characters. Rather than hand-transcribing a GBK mapping
// table (error-prone and unverifiable without the physical printer), the
// Unicode→GBK reverse map is built at runtime from the browser's own
// standards-compliant TextDecoder('gbk') — every modern browser, including
// iOS Safari, ships one as a baseline Encoding Standard requirement — so
// this is exactly as accurate as the browser's built-in decoder, with zero
// embedded data to get wrong.
let _gbkEncodeMap = null;
function getGbkEncodeMap() {
  if (_gbkEncodeMap) return _gbkEncodeMap;
  const map = new Map();
  const decoder = new TextDecoder('gbk');
  for (let lead = 0x81; lead <= 0xFE; lead++) {
    for (let trail = 0x40; trail <= 0xFE; trail++) {
      if (trail === 0x7F) continue; // not a valid GBK trail byte
      const decoded = decoder.decode(new Uint8Array([lead, trail]));
      // A valid mapping decodes to exactly one character, not the U+FFFD
      // replacement character Decoder uses for unmapped/invalid sequences.
      if (decoded.length === 1 && decoded.charCodeAt(0) !== 0xFFFD && !map.has(decoded)) {
        map.set(decoded, [lead, trail]);
      }
    }
  }
  _gbkEncodeMap = map;
  return map;
}

// Encodes text for the printer: plain ASCII passes through as single bytes;
// anything else is looked up in the GBK map and wrapped in the printer's
// Kanji-mode toggle (FS & ... FS .) so it's interpreted correctly instead of
// as raw UTF-8. Characters with no GBK equivalent fall back to '?' rather
// than being silently mis-rendered as a different, wrong character.
function encodeMixedText(text) {
  const FS_KANJI_ON = [0x1C, 0x26];
  const FS_KANJI_OFF = [0x1C, 0x2E];
  const gbkMap = getGbkEncodeMap();
  const bytes = [];
  let mode = 'ascii'; // 'ascii' | 'kanji'
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code < 0x80) {
      if (mode === 'kanji') { bytes.push(...FS_KANJI_OFF); mode = 'ascii'; }
      bytes.push(code);
    } else {
      if (mode === 'ascii') { bytes.push(...FS_KANJI_ON); mode = 'kanji'; }
      const gbkBytes = gbkMap.get(ch);
      if (gbkBytes) bytes.push(...gbkBytes);
      else bytes.push(0x3F, 0x3F); // '??' placeholder, keeps column alignment close
    }
  }
  if (mode === 'kanji') bytes.push(...FS_KANJI_OFF);
  return bytes;
}

// Display width in printer columns: CJK/GBK characters are double-width,
// everything else is single-width. This is what padLine/itemLine below use
// to right-align prices correctly regardless of how much Chinese text is in
// the item name — String.length would undercount CJK width and misalign.
function displayWidth(text) {
  let w = 0;
  for (const ch of String(text)) w += ch.codePointAt(0) < 0x80 ? 1 : 2;
  return w;
}

function padLine(left, right, width) {
  const gap = Math.max(1, width - displayWidth(left) - displayWidth(right));
  return left + ' '.repeat(gap) + right;
}

// Puts name + price on one right-aligned line when they fit; when they
// don't (long and/or CJK-heavy item names on a narrow 58mm roll), the price
// gets its own right-aligned line below instead of colliding into whatever
// follows — the bug seen on real 80mm prints where the price wrapped mid-
// line and overlapped the next separator.
function itemLine(left, right, width) {
  if (displayWidth(left) + displayWidth(right) + 1 <= width) return [padLine(left, right, width)];
  return [left, padLine('', right, width)];
}

export function buildReceipt(lines) {
  const ESC = 0x1B, GS = 0x1D;
  const INIT = [ESC, 0x40];
  const CENTER = [ESC, 0x61, 0x01];
  const LEFT = [ESC, 0x61, 0x00];
  const BOLD_ON = [ESC, 0x45, 0x01];
  const BOLD_OFF = [ESC, 0x45, 0x00];
  const SIZE_LARGE = [GS, 0x21, 0x11]; // GS ! n — double width + double height
  const SIZE_NORMAL = [GS, 0x21, 0x00];
  // Feed 6 lines then partial cut — more universally supported than GS V 0x00
  const FEED_AND_CUT = [
    ESC, 0x64, 0x06,        // ESC d n — feed 6 lines
    GS,  0x56, 0x42, 0x00,  // GS V m n — partial cut with feed
  ];
  const LF = [0x0A];

  let bytes = [...INIT, ...CENTER];
  lines.forEach(line => {
    const encoded = encodeMixedText(line.text);
    if (line.large) bytes.push(...SIZE_LARGE);
    if (line.bold) bytes.push(...BOLD_ON);
    if (line.align === 'center') bytes.push(...CENTER);
    else bytes.push(...LEFT);
    bytes.push(...encoded, ...LF);
    if (line.bold) bytes.push(...BOLD_OFF);
    if (line.large) bytes.push(...SIZE_NORMAL);
  });
  bytes.push(...LF, ...LF, ...FEED_AND_CUT);
  return new Uint8Array(bytes);
}

// Mirrors the on-screen "Receipt Preview" sheet in Orders.jsx field-for-field
// (same section order, same Subtotal/Tax/TOTAL conditions, same footer text)
// so what prints matches what the merchant already approved on screen. Also
// now paper-width aware like buildTestReceipt already was — previously this
// ignored paperSize entirely and always used a hardcoded 32-char separator,
// which is also part of why long/CJK item lines were overflowing and
// colliding with the next line on an 80mm roll.
export function buildOrderReceipt(order, currency, merchantName, paperSize = 'thermal_80') {
  const wide = paperSize === 'thermal_80' || paperSize === 'a4';
  const width = wide ? 48 : 32;
  const sep = '-'.repeat(width);
  const lines = [
    { text: merchantName || 'Receipt', bold: true, align: 'center' },
    { text: new Date(order.created_date || Date.now()).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' }), align: 'center' },
    { text: sep, align: 'center' },
    { text: `Order: #${order.order_number || order.id?.slice(-6)}`, bold: false, align: 'left' },
  ];
  if (order.table_name) lines.push({ text: `Table: ${order.table_name}`, align: 'left' });
  if (order.customer_name && order.customer_name.toLowerCase() !== 'nil') {
    lines.push({ text: `Customer: ${order.customer_name}`, align: 'left' });
  }
  lines.push({ text: sep, align: 'center' });
  (order.items || []).forEach(item => {
    const lineTotal = (item.price || item.unit_price || 0) * (item.quantity || 1);
    const left = `${item.quantity}x ${item.name || item.product_name}`;
    const right = formatMoney(lineTotal, currency);
    itemLine(left, right, width).forEach(text => lines.push({ text, align: 'left' }));
    if (item.variant) lines.push({ text: `  (${item.variant})`, align: 'left' });
  });
  lines.push({ text: sep, align: 'center' });
  const subtotal = parseFloat(order.subtotal || 0);
  if (subtotal > 0) lines.push({ text: padLine('Subtotal', formatMoney(subtotal, currency), width), align: 'left' });
  const tax = parseFloat(order.tax_amount || 0);
  if (tax > 0) lines.push({ text: padLine('Tax', formatMoney(tax, currency), width), align: 'left' });
  lines.push({ text: padLine('TOTAL', formatMoney(parseFloat(order.total_amount || 0), currency), width), bold: true, align: 'left' });
  lines.push({ text: sep, align: 'center' });
  lines.push({ text: 'Thank you for your visit!', align: 'center' });
  lines.push({ text: 'Powered by Sellio', align: 'center' });
  return buildReceipt(lines);
}

// Breaks text at spaces so it fits the paper width (long lists of order numbers).
function wrapText(text, width) {
  const out = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && displayWidth(next) > width) { out.push(line); line = word; }
    else line = next;
  }
  if (line) out.push(line);
  return out;
}

// One receipt for a whole table bill (from tableBill.js): every round merged, so the
// same dish shows once (2x Latte), cancelled rounds left out, one total, and whether
// the bill is paid. Same layout and paper widths as buildOrderReceipt above.
export function buildTableReceipt(bill, currency, merchantName, paperSize = 'thermal_80') {
  const wide = paperSize === 'thermal_80' || paperSize === 'a4';
  const width = wide ? 48 : 32;
  const sep = '-'.repeat(width);
  const money = n => formatMoney(Number(n) || 0, currency);
  const lines = [
    { text: merchantName || 'Receipt', bold: true, align: 'center' },
    { text: new Date().toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' }), align: 'center' },
    { text: sep, align: 'center' },
    { text: `Table: ${bill.tableName || 'Table'}`, bold: true, align: 'left' },
  ];
  const orders = (bill.orderNumbers || []).map(n => `#${n}`).join(', ') || '-';
  wrapText(`Orders: ${orders}`, width).forEach(text => lines.push({ text, align: 'left' }));
  lines.push({ text: sep, align: 'center' });
  (bill.items || []).forEach(item => {
    itemLine(`${item.quantity}x ${item.name}`, money(item.total), width).forEach(text => lines.push({ text, align: 'left' }));
    if (item.variant) lines.push({ text: `  (${item.variant})`, align: 'left' });
  });
  lines.push({ text: sep, align: 'center' });
  if (bill.subtotal > 0) lines.push({ text: padLine('Subtotal', money(bill.subtotal), width), align: 'left' });
  if (bill.tax > 0) lines.push({ text: padLine('Tax', money(bill.tax), width), align: 'left' });
  if (bill.discount > 0) lines.push({ text: padLine('Discount', `-${money(bill.discount)}`, width), align: 'left' });
  lines.push({ text: padLine('TOTAL', money(bill.total), width), bold: true, align: 'left' });
  lines.push({ text: paymentText(bill), bold: !bill.paid, align: 'left' });
  lines.push({ text: sep, align: 'center' });
  lines.push({ text: 'Thank you for your visit!', align: 'center' });
  lines.push({ text: 'Powered by Sellio', align: 'center' });
  return buildReceipt(lines);
}

// Kitchen/staff order chit — deliberately different from the customer
// receipt above: no pricing or totals at all, large order # / table / time
// so it reads at a glance, and item notes emphasized since that's the
// detail staff are most likely to miss when moving fast (allergies, special
// requests). Reuses the same buildReceipt byte-builder and GBK/width helpers
// as the receipt, so Chinese item names print correctly here too.
export function buildOrderChit(order, merchantName, paperSize = 'thermal_80') {
  const wide = paperSize === 'thermal_80' || paperSize === 'a4';
  const width = wide ? 48 : 32;
  const sep = '-'.repeat(width);
  // orders rows store this as order_type (order.type was never set, so the
  // DINE IN / TAKEAWAY line silently never printed); keep .type as fallback.
  const orderType = order.order_type || order.type;
  const orderTypeLabel = {
    dine_in: 'DINE IN',
    takeaway: 'TAKEAWAY',
    delivery: 'DELIVERY',
    pickup: 'PICKUP',
  }[orderType] || (orderType ? String(orderType).toUpperCase() : '');

  const lines = [
    { text: merchantName || 'Order Chit', align: 'center' },
    { text: sep, align: 'center' },
    { text: `#${order.order_number || order.id?.slice(-6)}`, bold: true, large: true, align: 'center' },
  ];
  if (order.table_name) lines.push({ text: order.table_name.toUpperCase(), bold: true, large: true, align: 'center' });
  if (orderTypeLabel) lines.push({ text: orderTypeLabel, bold: true, align: 'center' });
  lines.push({ text: new Date(order.created_date || Date.now()).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' }), large: true, align: 'center' });
  lines.push({ text: sep, align: 'center' });

  (order.items || []).forEach(item => {
    lines.push({ text: `${item.quantity}x ${item.name || item.product_name}`, bold: true, align: 'left' });
    if (item.variant) lines.push({ text: `   (${item.variant})`, align: 'left' });
    if (item.notes) lines.push({ text: `   *** ${item.notes} ***`, bold: true, align: 'left' });
    lines.push({ text: ' ', align: 'left' });
  });

  if (order.notes) {
    lines.push({ text: sep, align: 'center' });
    lines.push({ text: 'ORDER NOTE:', bold: true, align: 'left' });
    lines.push({ text: order.notes, bold: true, align: 'left' });
  }

  lines.push({ text: sep, align: 'center' });
  return buildReceipt(lines);
}

// A sample receipt in the shop's own money and tax (tax: { name, rate }, e.g. GST 9%, SST 6%,
// none in Indonesia by default). Rupiah samples are 10,000 times the dollar ones.
export function buildTestReceipt(merchantName, paperSize = 'thermal_80', { currency = 'SGD', tax = { name: 'GST', rate: 9 } } = {}) {
  const wide = paperSize === 'thermal_80' || paperSize === 'a4';
  const width = wide ? 48 : 32;
  const sep = '-'.repeat(width);
  const now = new Date().toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
  const scale = currencyDecimals(currency) === 0 ? 10000 : 1;
  const items = [[1, 'Kopi O', 1.5], [2, 'Nasi Lemak', 3.5], [1, 'Teh Tarik', 1.8]];
  const subtotal = roundMoney(items.reduce((sum, [qty, , price]) => sum + qty * price * scale, 0), currency);
  const rate = Number(tax?.rate) || 0;
  const taxAmount = roundMoney(subtotal * rate / 100, currency);
  return buildReceipt([
    { text: merchantName || 'My Store', bold: true, align: 'center' },
    { text: '** TEST PRINT **', bold: false, align: 'center' },
    { text: now, align: 'center' },
    { text: sep, align: 'center' },
    { text: 'Table: T-01', align: 'left' },
    { text: 'Order: ORD-000001', align: 'left' },
    { text: 'Cashier: Staff', align: 'left' },
    { text: sep, align: 'center' },
    ...items.map(([qty, name, price]) => ({ text: padLine(`${qty}x ${name}`, formatMoney(qty * price * scale, currency), width), align: 'left' })),
    { text: sep, align: 'center' },
    { text: padLine('Subtotal:', formatMoney(subtotal, currency), width), align: 'left' },
    ...(rate > 0 ? [{ text: padLine(`${tax.name || 'Tax'} (${rate}%):`, formatMoney(taxAmount, currency), width), align: 'left' }] : []),
    { text: sep, align: 'center' },
    { text: padLine('TOTAL:', formatMoney(subtotal + taxAmount, currency), width), bold: true, align: 'left' },
    { text: sep, align: 'center' },
    { text: 'Payment: Cash', align: 'left' },
    { text: sep, align: 'center' },
    { text: 'Thank you for your visit!', align: 'center' },
    { text: 'Powered by Sellio', align: 'center' },
  ]);
}

// Build TSPL receipt using BITMAP command — renders text to canvas as 1-bit pixel data.
// Bypasses TSPL font support entirely. Works on all TSPL-compatible BLE label printers.
export function buildTSPLReceipt(lines, labelWidthMM = 76, labelHeightMM = 130, gapMM = 3) {
  const DPI = 203; // Standard label printer DPI
  const dotWidth = Math.round(labelWidthMM * DPI / 25.4); // 608 dots for 76mm
  const widthBytes = Math.ceil(dotWidth / 8);              // 76 bytes per row
  const maxDotHeight = Math.round(labelHeightMM * DPI / 25.4); // max dots for label height

  // Text rendering sizes (canvas pixels = printer dots at 203 DPI)
  const FONT_BODY = 22;
  const FONT_BOLD = 26;
  const LINE_H = 32;     // dots between baselines
  const MARGIN_TOP = 20;
  const MARGIN_LEFT = 10;

  // Calculate actual canvas height needed (don't render empty space)
  const dotHeight = Math.min(
    MARGIN_TOP + lines.length * LINE_H + 30,
    maxDotHeight
  );

  // Render receipt onto an offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = dotWidth;
  canvas.height = dotHeight;
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  let y = MARGIN_TOP;
  lines.forEach(line => {
    const text = line.text || '';
    const fs = line.bold ? FONT_BOLD : FONT_BODY;
    ctx.font = line.bold
      ? `bold ${fs}px "Courier New", Courier, monospace`
      : `${fs}px "Courier New", Courier, monospace`;

    if (line.align === 'center') {
      const textWidth = ctx.measureText(text).width;
      const x = Math.max(MARGIN_LEFT, (canvas.width - textWidth) / 2);
      ctx.fillText(text, x, y);
    } else {
      ctx.fillText(text, MARGIN_LEFT, y);
    }
    y += LINE_H;
  });

  // Convert canvas pixels → 1-bit per pixel bitmap
  // Dark pixel (gray < 128) → bit 1 (print ink); light → bit 0 (no ink)
  const imageData = ctx.getImageData(0, 0, dotWidth, dotHeight);
  const px = imageData.data; // RGBA flat array
  const bitmapData = new Uint8Array(widthBytes * dotHeight);

  for (let row = 0; row < dotHeight; row++) {
    for (let col = 0; col < dotWidth; col++) {
      const i = (row * dotWidth + col) * 4;
      const gray = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      if (gray < 128) {
        // Set the corresponding bit in the bitmap (MSB first)
        bitmapData[row * widthBytes + Math.floor(col / 8)] |= (0x80 >> (col % 8));
      }
    }
  }

  // Build TSPL byte sequence:
  // [ASCII header] + [raw binary bitmap] + [ASCII footer]
  // No separator between the last comma and bitmap data — printer reads widthBytes×height bytes
  const header = [
    `SIZE ${labelWidthMM} mm, ${labelHeightMM} mm`,
    `GAP ${gapMM} mm, 0 mm`,
    `DIRECTION 0`,
    `CLS`,
    `BITMAP 0, 0, ${widthBytes}, ${dotHeight}, 0,`,
  ].join('\r\n') + ''; // last line has no \r\n — bitmap data follows immediately

  const footer = `\r\nPRINT 1\r\n`;

  const hBytes = new TextEncoder().encode(header);
  const fBytes = new TextEncoder().encode(footer);

  const result = new Uint8Array(hBytes.length + bitmapData.length + fBytes.length);
  result.set(hBytes, 0);
  result.set(bitmapData, hBytes.length);
  result.set(fBytes, hBytes.length + bitmapData.length);

  return result;
}

export function buildTSPLTestReceipt(merchantName) {
  const now = new Date().toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' });
  const sep = '--------------------------------';
  return buildTSPLReceipt([
    { text: merchantName || 'My Store' },
    { text: '** TEST PRINT **' },
    { text: now },
    { text: sep },
    { text: 'Table: T-01' },
    { text: 'Order: ORD-000001' },
    { text: sep },
    { text: '1x Kopi O              SGD 1.50' },
    { text: '2x Nasi Lemak          SGD 7.00' },
    { text: '1x Teh Tarik           SGD 1.80' },
    { text: sep },
    { text: 'TOTAL:         SGD 10.30' },
    { text: sep },
    { text: 'Thank you for your visit!' },
    { text: 'Powered by Sellio' },
  ]);
}

// Send bytes via Bluetooth GATT — NEVER calls requestDevice() (no pairing dialog)
// Call setBtDeviceCache(device) from PrinterSettings after initial pairing
// In Sellio's apps (no Web Bluetooth in their web views): through the phone's Bluetooth
// (nativePrinter.js), to the printer chosen on this phone (deviceId, from the saved printer).
export async function sendViaBluetooth(deviceName, bytes, deviceId = null) {
  if (isCapacitorApp()) {
    const { printNative, savedPrinterId } = await import('./nativePrinter');
    const id = deviceId || savedPrinterId(deviceName);
    if (!id) throw new Error('Printer not connected. Please go to Settings → Receipt → Printer and reconnect.');
    return printNative(id, bytes);
  }
  if (!navigator.bluetooth) throw new Error('Web Bluetooth not supported');

  let device = window.__sellioBtDevice;

  // Try getDevices() — returns previously-permitted devices without a dialog (Chrome 85+)
  if (!device) {
    try {
      const devices = await navigator.bluetooth.getDevices();
      device = devices.find(d => d.name === deviceName) || null;
      if (device) window.__sellioBtDevice = device;
    } catch {}
  }

  if (!device) {
    throw new Error('Printer not connected. Please go to Settings → Receipt → Printer and reconnect.');
  }

  const server = await device.gatt.connect();
  let lastError;

  for (const profile of BLE_PRINTER_PROFILES) {
    try {
      const service = await server.getPrimaryService(profile.service);
      const characteristic = await service.getCharacteristic(profile.char);

      // 200-byte chunks: fast for both ESC/POS (<2KB) and TSPL bitmap (~35KB).
      // 5ms delay between chunks prevents BLE stack overflow on slower printers.
      const CHUNK = 200;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.slice(i, i + CHUNK);
        try {
          if (characteristic.properties?.writeWithoutResponse) {
            await characteristic.writeValueWithoutResponse(chunk);
          } else {
            await characteristic.writeValue(chunk);
          }
        } catch {
          // If 200-byte chunk fails (small MTU printer), retry with 20-byte chunk
          const SMALL = 20;
          for (let j = 0; j < chunk.length; j += SMALL) {
            await characteristic.writeValue(chunk.slice(j, j + SMALL));
            if (j + SMALL < chunk.length) await new Promise(r => setTimeout(r, 10));
          }
        }
        if (i + CHUNK < bytes.length) await new Promise(r => setTimeout(r, 5));
      }
      // Keep connection alive — don't disconnect so next print is instant
      return;
    } catch (e) {
      lastError = e;
    }
  }

  throw new Error(
    `No compatible printer service found. Tried ${BLE_PRINTER_PROFILES.length} profiles. ` +
    `Last error: ${lastError?.message}. Try Network/IP mode if issue persists.`
  );
}

// Send ESC/POS via Epson ePOS HTTP
export async function sendViaEpsonEPos(ip, bytes, merchantName) {
  const b64 = btoa(String.fromCharCode(...bytes));
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
      <raw>${b64}</raw>
    </epos-print>
  </s:Body>
</s:Envelope>`;
  const res = await fetch(`http://${ip}/cgi-bin/epos/service.cgi`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
    body: xml,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`ePOS error: ${res.status}`);
  const response = await res.text();
  const success = new DOMParser().parseFromString(response, 'application/xml').getElementsByTagNameNS('*', 'response')[0];
  if (!success || success.getAttribute('success') !== 'true') {
    throw new Error(`Printer did not confirm the print${success?.getAttribute('code') ? ': ' + success.getAttribute('code') : ''}`);
  }
}

// Test connection for network printers
export async function testNetworkPrinter(ip, port, brand) {
  if (brand === 'epson') {
    const res = await fetch(`http://${ip}/cgi-bin/epos/service.cgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
      body: `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"><pulse drawer="drawer_1" time="t100"/></epos-print></s:Body></s:Envelope>`,
      signal: AbortSignal.timeout(5000),
    });
    return res.ok || res.status === 500; // 500 is still "reachable"
  } else {
    // Generic/Star: try WebSocket
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://${ip}:${port}`);
      const timer = setTimeout(() => { ws.close(); resolve(false); }, 5000);
      ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(true); };
      ws.onerror = () => { clearTimeout(timer); resolve(false); };
    });
  }
}

export function loadPrinterConfig(tenantId) {
  try {
    const raw = localStorage.getItem(`sellio_printer_${tenantId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function savePrinterConfig(tenantId, config) {
  localStorage.setItem(`sellio_printer_${tenantId}`, JSON.stringify({ ...(loadPrinterConfig(tenantId) || {}), ...config }));
  window.dispatchEvent(new Event('sellio:printer-config'));
}

export function clearPrinterConfig(tenantId) {
  localStorage.removeItem(`sellio_printer_${tenantId}`);
  window.dispatchEvent(new Event('sellio:printer-config'));
}