// ESC/POS receipt builder utility

export function buildReceipt(lines) {
  const ESC = 0x1B, GS = 0x1D;
  const INIT = [ESC, 0x40];
  const CENTER = [ESC, 0x61, 0x01];
  const LEFT = [ESC, 0x61, 0x00];
  const BOLD_ON = [ESC, 0x45, 0x01];
  const BOLD_OFF = [ESC, 0x45, 0x00];
  const CUT = [GS, 0x56, 0x00];
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
  bytes.push(...LF, ...LF, ...CUT);
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

export function buildTestReceipt(merchantName) {
  return buildReceipt([
    { text: merchantName || 'My Store', bold: true, align: 'center' },
    { text: 'Test Print', bold: false, align: 'center' },
    { text: new Date().toLocaleString(), align: 'center' },
    { text: '--------------------------------', align: 'center' },
    { text: '--- Thank you ---', align: 'center' },
  ]);
}

// Send ESC/POS bytes via Bluetooth GATT
export async function sendViaBluetooth(deviceName, bytes) {
  if (!navigator.bluetooth) throw new Error('Web Bluetooth not supported');
  // Request device by name hint (user must select from browser dialog)
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ name: deviceName }],
    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
  }).catch(() =>
    navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
    })
  );
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
  const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
  // Write in 512-byte chunks
  const CHUNK = 512;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await characteristic.writeValue(bytes.slice(i, i + CHUNK));
  }
  await device.gatt.disconnect();
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