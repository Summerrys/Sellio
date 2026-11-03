// Checks src/lib/nativePrinter.js (Bluetooth printers in Sellio's apps) with a stand-in for the
// Bluetooth plugin: no phone, no printer. Run: node verification/native-printer.test.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';

const hooks = `
export async function resolve(specifier, context, next) {
  if (specifier === '@capacitor-community/bluetooth-le') return { url: 'mock:ble', shortCircuit: true };
  if (specifier === './printerUtils' && context.parentURL?.includes('/src/lib/nativePrinter')) {
    return { url: 'mock:printerUtils', shortCircuit: true };
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url === 'mock:ble') return { format: 'module', source: 'export const BleClient = globalThis.__ble;', shortCircuit: true };
  if (url === 'mock:printerUtils') {
    return { format: 'module', shortCircuit: true, source: \`export const BLE_PRINTER_PROFILES = [
      { service: '000018f0-0000-1000-8000-00805f9b34fb', char: '00002af1-0000-1000-8000-00805f9b34fb' },
      { service: '0000ffe0-0000-1000-8000-00805f9b34fb', char: '0000ffe1-0000-1000-8000-00805f9b34fb' },
    ];\` };
  }
  return next(url, context);
}`;
register('data:text/javascript,' + encodeURIComponent(hooks), import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const props = (p) => ({ broadcast: false, read: false, write: false, writeWithoutResponse: false, notify: false, indicate: false, authenticatedSignedWrites: false, ...p });
const devices = {
  // A receipt printer with the common profile (and a standard service listed first).
  'AA:01': [
    { uuid: '00001800-0000-1000-8000-00805f9b34fb', characteristics: [{ uuid: '00002a00-0000-1000-8000-00805f9b34fb', properties: props({ write: true }) }] },
    { uuid: '000018f0-0000-1000-8000-00805f9b34fb', characteristics: [{ uuid: '00002af1-0000-1000-8000-00805f9b34fb', properties: props({ write: true, writeWithoutResponse: true }) }] },
  ],
  // An unknown printer: only a vendor service that takes writes (with response).
  'AA:02': [
    { uuid: '0000180a-0000-1000-8000-00805f9b34fb', characteristics: [{ uuid: '00002a29-0000-1000-8000-00805f9b34fb', properties: props({ write: true }) }] },
    { uuid: '12345678-1234-1234-1234-1234567890ab', characteristics: [{ uuid: '87654321-4321-4321-4321-ba0987654321', properties: props({ write: true }) }] },
  ],
  // Headphones: nothing takes writes.
  'AA:03': [{ uuid: '0000180f-0000-1000-8000-00805f9b34fb', characteristics: [{ uuid: '00002a19-0000-1000-8000-00805f9b34fb', properties: props({ read: true, notify: true }) }] }],
};
const ble = {
  calls: [],
  writes: [],
  enabled: true,
  permission: true,
  mtu: 185,
  failWriteAt: -1,
  onDisconnect: {},
  async initialize(options) { this.calls.push(['initialize', options]); if (!this.permission) throw new Error('Permission denied.'); },
  async isEnabled() { return this.enabled; },
  async requestEnable() { this.calls.push(['requestEnable']); },
  async requestLEScan(options, cb) {
    this.calls.push(['scan', options]);
    cb({ device: { deviceId: 'AA:01', name: 'XP-58' }, localName: 'XP-58', rssi: -55 });
    cb({ device: { deviceId: 'AA:01', name: 'XP-58' }, localName: 'XP-58', rssi: -50 });
    cb({ device: { deviceId: 'BB:00' }, rssi: -70 }); // no name
    cb({ device: { deviceId: 'AA:02', name: 'Kitchen' }, rssi: -65 });
  },
  async stopLEScan() { this.calls.push(['stopScan']); },
  async connect(id, onDisconnect) { this.calls.push(['connect', id]); if (!devices[id]) throw new Error('Connection timeout'); this.onDisconnect[id] = onDisconnect; },
  async getServices(id) { return devices[id]; },
  async getMtu() { return this.mtu; },
  async disconnect(id) { this.calls.push(['disconnect', id]); },
  async write(id, s, c, v) { this.record('write', id, s, c, v); },
  async writeWithoutResponse(id, s, c, v) { this.record('noResponse', id, s, c, v); },
  record(kind, id, s, c, v) {
    const n = this.writes.length;
    if (n === this.failWriteAt) throw new Error('GATT error 133');
    this.writes.push({ kind, id, s, c, bytes: [...new Uint8Array(v.buffer, v.byteOffset, v.byteLength)] });
  },
};
globalThis.__ble = ble;

const printer = await import('../src/lib/nativePrinter.js');
const bytes = (n, start = 0) => Uint8Array.from({ length: n }, (_, i) => (start + i) % 256);
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${name}`); };

await check('Looking for printers: permission first (never for location), each named device once', async () => {
  const found = [];
  await printer.startPrinterScan((d) => found.push(d));
  assert.deepEqual(ble.calls[0], ['initialize', { androidNeverForLocation: true }]);
  assert.deepEqual(found.map((d) => d.id), ['AA:01', 'AA:02']);
  assert.equal(found[0].name, 'XP-58');
});

await check('Choosing a printer: connects, finds where prints go, remembers it by name', async () => {
  await printer.choosePrinter('AA:01', 'XP-58');
  assert.equal(printer.savedPrinterId('XP-58'), 'AA:01');
});

await check('A receipt goes to the known profile, in chunks the connection takes (MTU 185 → 180)', async () => {
  ble.writes = [];
  await printer.printNative('AA:01', bytes(400));
  assert.deepEqual(ble.writes.map((w) => w.bytes.length), [180, 180, 40]);
  assert.ok(ble.writes.every((w) => w.kind === 'noResponse' && w.c === '00002af1-0000-1000-8000-00805f9b34fb'));
  assert.deepEqual(ble.writes.flatMap((w) => w.bytes), [...bytes(400)]);
});

await check('Small connection (MTU 23): 20-byte chunks', async () => {
  ble.writes = [];
  ble.mtu = 23;
  await printer.printNative('AA:01', bytes(50));
  assert.deepEqual(ble.writes.map((w) => w.bytes.length), [20, 20, 10]);
  ble.mtu = 185;
});

await check('Two prints at once come out one after the other, not mixed', async () => {
  ble.writes = [];
  await Promise.all([printer.printNative('AA:01', bytes(360, 0)), printer.printNative('AA:01', bytes(360, 100))]);
  assert.deepEqual(ble.writes.flatMap((w) => w.bytes), [...bytes(360, 0), ...bytes(360, 100)]);
});

await check('An unknown printer: its own service that takes writes (not a standard one), with response', async () => {
  await printer.choosePrinter('AA:02', 'Kitchen');
  ble.writes = [];
  await printer.printNative('AA:02', bytes(10));
  assert.equal(ble.writes[0].kind, 'write');
  assert.equal(ble.writes[0].s, '12345678-1234-1234-1234-1234567890ab');
});

await check("A device that doesn't take prints is refused and not remembered", async () => {
  await assert.rejects(printer.choosePrinter('AA:03', 'Headphones'), /doesn't take prints/);
  assert.equal(printer.savedPrinterId('Headphones'), null);
});

await check('Printer gone after a disconnect: connects again for the next print', async () => {
  const connects = () => ble.calls.filter((c) => c[0] === 'connect' && c[1] === 'AA:01').length;
  const before = connects();
  await printer.printNative('AA:01', bytes(5));
  assert.equal(connects(), before, 'still connected: no new connection');
  ble.onDisconnect['AA:01']('AA:01');
  await printer.printNative('AA:01', bytes(5));
  assert.equal(connects(), before + 1);
});

await check('A write fails part way: the print fails with what to check, and the next one still runs', async () => {
  ble.writes = [];
  ble.failWriteAt = 1;
  await assert.rejects(printer.printNative('AA:01', bytes(400)), /paper/);
  ble.failWriteAt = -1;
  ble.writes = [];
  await printer.printNative('AA:01', bytes(30));
  assert.equal(ble.writes.length, 1);
});

await check('Bluetooth off: asked to turn on (Android), then a plain message', async () => {
  ble.enabled = false;
  await assert.rejects(printer.printNative('AA:01', bytes(5)), /Bluetooth is off/);
  assert.ok(ble.calls.some((c) => c[0] === 'requestEnable'));
  ble.enabled = true;
});

await check('Forgetting the printer: disconnected and no longer remembered', async () => {
  await printer.forgetPrinter('AA:01');
  assert.equal(printer.savedPrinterId('XP-58'), null);
  assert.ok(ble.calls.some((c) => c[0] === 'disconnect' && c[1] === 'AA:01'));
  assert.equal(printer.savedPrinterId('Kitchen'), 'AA:02');
});

await check('Permission refused: says where to allow it, and asks again next time', async () => {
  const fresh = await import('../src/lib/nativePrinter.js?fresh');
  ble.permission = false;
  await assert.rejects(fresh.startPrinterScan(() => {}), /Settings: Apps → Sellio → Permissions/);
  ble.permission = true;
  await fresh.startPrinterScan(() => {});
});

console.log(`${passed} app Bluetooth printer checks passed (no phone, no printer).`);
