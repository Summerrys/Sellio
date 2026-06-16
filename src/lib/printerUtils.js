// ESC/POS receipt builder utility

// Known BLE thermal/label printer GATT service+characteristic UUID pairs.
// Different chipsets use different UUIDs — we try each in order until one works.
const BLE_PRINTER_PROFILES = [
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

export function buildReceipt(lines) {
  const ESC = 0x1B, GS = 0x1D;
  const INIT = [ESC, 0x40];
  const CENTER = [ESC, 0x61, 0x01];
  const LEFT = [ESC, 0x61, 0x00];
  const BOLD_ON = [ESC, 0x45, 0x01];
  const BOLD_OFF = [ESC, 0x45, 0x00];
  // Feed 6 lines then partial cut — more universally supported than GS V 0x00
  const FEED_AND_CUT = [
    ESC, 0x64, 0x06,        // ESC d n — feed 6 lines
    GS,  0x56, 0x42, 0x00,  // GS V m n — partial cut with feed
  ];
  const LF = [0x0A];

  let bytes = [...INIT, ...CENTER];
  lines.forEach(line => {
    const encoded = new TextEncoder().encode(line.text);
    if (line.bold) bytes.push(...BOLD_ON);
    if (line.align === 'center') bytes.push(...CENTER);
    else bytes.push(...LEFT);
    bytes.push(...encoded, ...LF);
    if (line.bold) bytes.push(...BOLD_OFF);
  });
  bytes.push(...LF, ...LF, ...FEED_AND_CUT);
  return new Uint8Array(bytes);
}

export function buildOrderReceipt(order, currency, merchantName) {
  const lines = [
    { text: merchantName || 'Receipt', bold: true, align: 'center' },
    { text: new Date(order.created_date || Date.now()).toLocaleString(), align: 'center' },
    { text: '--------------------------------', align: 'center' },
    { text: `Order: #${order.order_number || order.id?.slice(-6)}`, bold: false, align: 'left' },
  ];
  if (order.table_name) lines.push({ text: `Table: ${order.table_name}`, align: 'left' });
  if (order.customer_name && order.customer_name.toLowerCase() !== 'nil') {
    lines.push({ text: `Customer: ${order.customer_name}`, align: 'left' });
  }
  lines.push({ text: '--------------------------------', align: 'center' });
  (order.items || []).forEach(item => {
    const lineTotal = ((item.price || 0) * (item.quantity || 1)).toFixed(2);
    lines.push({ text: `${item.quantity}x ${item.name || item.product_name}  ${currency} ${lineTotal}`, align: 'left' });
    if (item.variant) lines.push({ text: `   (${item.variant})`, align: 'left' });
  });
  lines.push({ text: '--------------------------------', align: 'center' });
  lines.push({ text: `Total: ${currency} ${parseFloat(order.total_amount || 0).toFixed(2)}`, bold: true, align: 'left' });
  lines.push({ text: '--------------------------------', align: 'center' });
  lines.push({ text: 'Thank you!', align: 'center' });
  return buildReceipt(lines);
}

export function buildTestReceipt(merchantName, paperSize = 'thermal_80') {
  const wide = paperSize === 'thermal_80' || paperSize === 'a4';
  const sep = '-'.repeat(wide ? 48 : 32);
  const now = new Date().toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
  return buildReceipt([
    { text: merchantName || 'My Store', bold: true, align: 'center' },
    { text: '** TEST PRINT **', bold: false, align: 'center' },
    { text: now, align: 'center' },
    { text: sep, align: 'center' },
    { text: 'Table: T-01', align: 'left' },
    { text: 'Order: ORD-000001', align: 'left' },
    { text: 'Cashier: Staff', align: 'left' },
    { text: sep, align: 'center' },
    { text: '1x Kopi O                   1.50', align: 'left' },
    { text: '2x Nasi Lemak               7.00', align: 'left' },
    { text: '1x Teh Tarik                1.80', align: 'left' },
    { text: sep, align: 'center' },
    { text: 'Subtotal:              SGD 10.30', align: 'left' },
    { text: 'GST (9%):               SGD 0.93', align: 'left' },
    { text: sep, align: 'center' },
    { text: 'TOTAL:                 SGD 11.23', bold: true, align: 'left' },
    { text: sep, align: 'center' },
    { text: 'Payment: Cash', align: 'left' },
    { text: sep, align: 'center' },
    { text: 'Thank you for your visit!', align: 'center' },
    { text: 'Powered by Sellio', align: 'center' },
  ]);
}

// Build TSPL (TSC Printer Language) receipt bytes for label printers
// TSPL uses ASCII text commands — completely different from ESC/POS binary
// Build TSPL receipt bytes for label printers.
// labelWidthMM / labelHeightMM: physical label size (default 76x130mm).
// gapMM: gap between pre-cut labels (0 for continuous roll).
// Font "0" (8x8 dots) at 2x scale is the most universally supported TSPL font.
export function buildTSPLReceipt(lines, labelWidthMM = 76, labelHeightMM = 130, gapMM = 3) {
  // Font "0" at 2x scale: each character is 16x16 dots
  const CHAR_H = 16;        // font "0" height (8 dots) × 2x scale
  const LINE_SPACING = 6;   // dots of spacing between lines
  const LINE_H = CHAR_H + LINE_SPACING; // 22 dots per line
  const MARGIN_LEFT = 10;   // dots from left edge
  const MARGIN_TOP = 15;    // dots from top edge

  let tspl = '';
  tspl += `SIZE ${labelWidthMM} mm, ${labelHeightMM} mm\r\n`;
  tspl += `GAP ${gapMM} mm, 0 mm\r\n`;   // gap between pre-cut labels
  tspl += `DIRECTION 0\r\n`;
  tspl += `DENSITY 8\r\n`;
  tspl += `SPEED 1\r\n`;
  tspl += `CLS\r\n`;

  let y = MARGIN_TOP;
  lines.forEach(line => {
    // Escape double quotes and backslashes — required by TSPL string syntax
    const safe = (line.text || '').replace(/\\/g, '\\\\').replace(/"/g, "'");
    // Font "0" at 2x scale — most universally supported across all TSPL label printers
    tspl += `TEXT ${MARGIN_LEFT}, ${y}, "0", 0, 2, 2, "${safe}"\r\n`;
    y += LINE_H;
  });

  tspl += `PRINT 1\r\n`;
  return new TextEncoder().encode(tspl);
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
export async function sendViaBluetooth(deviceName, bytes) {
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

      // BLE MTU minimum is 20 bytes — use small chunks for maximum compatibility
      const CHUNK = 20;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.slice(i, i + CHUNK);
        try {
          if (characteristic.properties?.writeWithoutResponse) {
            await characteristic.writeValueWithoutResponse(chunk);
          } else {
            await characteristic.writeValue(chunk);
          }
        } catch {
          await characteristic.writeValue(chunk);
        }
        // Small delay between chunks to avoid buffer overflow on slower printers
        if (i + CHUNK < bytes.length) await new Promise(r => setTimeout(r, 10));
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
  });
  if (!res.ok) throw new Error(`ePOS error: ${res.status}`);
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
  localStorage.setItem(`sellio_printer_${tenantId}`, JSON.stringify(config));
}

export function clearPrinterConfig(tenantId) {
  localStorage.removeItem(`sellio_printer_${tenantId}`);
}