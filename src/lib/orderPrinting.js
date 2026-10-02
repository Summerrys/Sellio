import { loadPrinterConfig, buildOrderReceipt, buildOrderChit, sendViaBluetooth, sendViaEpsonEPos } from '@/lib/printerUtils';

let queue = Promise.resolve();
function serialPrint(tenantId, work) {
  const run = () => navigator.locks?.request
    ? navigator.locks.request(`sellio-printer:${tenantId}`, work)
    : work();
  const job = queue.then(run, run);
  queue = job.catch(() => {});
  return job;
}

export function hasKitchenPrinter(config) {
  return !!config && ((config.mode === 'bluetooth' && !!config.deviceName && config.protocol !== 'tspl')
    || (config.mode === 'network' && !!config.ip && (!config.brand || config.brand === 'epson')));
}

async function sendOrder(order, tenant, config, kind) {
  if (!hasKitchenPrinter(config)) throw new Error('Connect a compatible receipt printer in Settings → Business → Receipt Printer.');
  const bytes = kind === 'chit'
    ? buildOrderChit(order, tenant?.name, tenant?.receipt_paper_size)
    : buildOrderReceipt(order, tenant?.currency || 'SGD', tenant?.name, tenant?.receipt_paper_size);
  if (config.mode === 'bluetooth') await sendViaBluetooth(config.deviceName, bytes);
  else await sendViaEpsonEPos(config.ip, bytes, tenant?.name);
}

export function printCounterOrder(order, tenantId, tenant, kind = 'receipt') {
  return serialPrint(tenantId, () => sendOrder(order, tenant, loadPrinterConfig(tenantId), kind));
}

// A printer can accept bytes and then lose its connection. Automatic retries
// would duplicate kitchen tickets, so record attempts before sending and expose
// failures for a deliberate, manual reprint. Keep the ledger across reloads.
export function autoPrintKitchenOrder(order, tenantId, tenant) {
  if (!order?.id || order.tenant_id !== tenantId || order.status !== 'pending') return Promise.resolve('skipped');
  return serialPrint(tenantId, async () => {
    const config = loadPrinterConfig(tenantId);
    if (!config?.autoPrintChit || !hasKitchenPrinter(config)) return 'skipped';
    const key = `sellio_kitchen_prints:${tenantId}`;
    let ledger;
    try {
      ledger = JSON.parse(localStorage.getItem(key) || '{}');
      if (ledger[order.id]) return 'already-attempted';
      const cutoff = Date.now() - 7 * 864e5;
      ledger = Object.fromEntries(Object.entries(ledger).filter(([,entry]) => entry.at > cutoff));
      ledger[order.id] = { at: Date.now(), state: 'attempted' };
      localStorage.setItem(key, JSON.stringify(ledger));
    } catch {
      throw new Error('Device storage is unavailable. Auto-print stopped to prevent duplicate chits.');
    }
    try {
      await sendOrder(order, tenant, config, 'chit');
      ledger[order.id].state = 'sent';
      localStorage.setItem(key, JSON.stringify(ledger));
      return 'sent';
    } catch (error) {
      ledger[order.id].state = 'check-printer';
      try { localStorage.setItem(key, JSON.stringify(ledger)); } catch { /* Keep initial attempt marker. */ }
      throw error;
    }
  });
}
