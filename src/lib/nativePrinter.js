// Bluetooth printers in Sellio's Android and iPhone apps. An app's web view has no Web
// Bluetooth, so printerUtils.js (sendViaBluetooth) and PrinterSettings come here instead:
// @capacitor-community/bluetooth-le, loaded only in the apps, the first time a printer is set
// up or used.
// - Permission is asked when the person looks for a printer (Android 12+: "Nearby devices",
//   never used for location; Android 11 and older: location, which they need to scan; iPhone:
//   Bluetooth).
// - The printer is remembered on this phone by its Bluetooth address, so it's found again
//   without a new search, and stays connected between prints.
// - Prints go one at a time, in chunks the connection takes, to the printer's write
//   characteristic: one of the known printer profiles, or else the first one that takes writes.
import { BleClient } from '@capacitor-community/bluetooth-le';
import { BLE_PRINTER_PROFILES } from './printerUtils';

const SAVED_KEY = 'sellio.btPrinters'; // { [printer name]: device id }
// Standard parts of every Bluetooth device, never where prints go.
const NOT_FOR_PRINTS = new Set(['1800', '1801', '180a'].map((s) => `0000${s}-0000-1000-8000-00805f9b34fb`));

let ready = null;
let printing = Promise.resolve();
const connected = new Set();
const targets = new Map(); // device id → { service, characteristic, noResponse }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fullUuid = (uuid) => {
  const u = String(uuid || '').toLowerCase();
  if (/^[0-9a-f]{4}$/.test(u)) return `0000${u}-0000-1000-8000-00805f9b34fb`;
  if (/^[0-9a-f]{8}$/.test(u)) return `${u}-0000-1000-8000-00805f9b34fb`;
  return u;
};

function readSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '{}') || {}; } catch { return {}; }
}
function writeSaved(map) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(map)); } catch { /* storage unavailable */ }
}

// The printer chosen on this phone under that name (for prints that only know the name).
export function savedPrinterId(name) {
  const id = readSaved()[name];
  return typeof id === 'string' && id ? id : null;
}

// What the person can act on, in place of the plugin's wording.
function plain(error, fallback) {
  const text = String(error?.message || error || '');
  if (/permission|not authorized|unauthorized|denied/i.test(text)) {
    return new Error("Sellio needs Bluetooth permission to use your printer. Allow it in your phone's Settings: Apps → Sellio → Permissions (Nearby devices).");
  }
  if (/disabled|not enabled|powered off|turned off/i.test(text)) {
    return new Error('Bluetooth is off. Turn it on and try again.');
  }
  if (/unsupported|not supported|unavailable/i.test(text)) {
    return new Error("This phone doesn't have Bluetooth printing.");
  }
  return new Error(fallback || text || 'Bluetooth printing failed.');
}

// Bluetooth permission (asked the first time) and Bluetooth switched on.
async function bluetoothReady() {
  if (!ready) {
    ready = BleClient.initialize({ androidNeverForLocation: true }).catch((error) => {
      ready = null;
      throw plain(error);
    });
  }
  await ready;
  let on = false;
  try { on = await BleClient.isEnabled(); } catch { on = true; }
  if (on) return;
  try { await BleClient.requestEnable(); } catch { /* iPhone: can't be asked */ }
  try { on = await BleClient.isEnabled(); } catch { on = false; }
  if (!on) throw new Error('Bluetooth is off. Turn it on and try again.');
}

// Looks for nearby Bluetooth devices with a name; onPrinter({ id, name, rssi }) for each.
export async function startPrinterScan(onPrinter) {
  await bluetoothReady();
  const seen = new Set();
  try {
    await BleClient.requestLEScan({ allowDuplicates: false }, (result) => {
      const id = result?.device?.deviceId;
      const name = (result?.localName || result?.device?.name || '').trim();
      if (!id || !name || seen.has(id)) return;
      seen.add(id);
      onPrinter({ id, name, rssi: result.rssi });
    });
  } catch (error) {
    throw plain(error, "Couldn't look for printers.");
  }
}

export async function stopPrinterScan() {
  try { await BleClient.stopLEScan(); } catch { /* not scanning */ }
}

async function connect(deviceId) {
  if (connected.has(deviceId)) return;
  await BleClient.connect(deviceId, () => connected.delete(deviceId), { timeout: 15000 });
  connected.add(deviceId);
}

// Where prints go on this device: a known printer profile first, else the first
// characteristic that takes writes.
async function printTarget(deviceId) {
  if (targets.has(deviceId)) return targets.get(deviceId);
  const services = await BleClient.getServices(deviceId);
  const writes = (c) => c?.properties?.writeWithoutResponse || c?.properties?.write;
  const pick = (service, c) => ({
    service: service.uuid,
    characteristic: c.uuid,
    noResponse: !!c.properties.writeWithoutResponse,
  });
  let target = null;
  for (const profile of BLE_PRINTER_PROFILES) {
    const service = services.find((s) => fullUuid(s.uuid) === profile.service);
    const c = service?.characteristics.find((x) => fullUuid(x.uuid) === profile.char);
    if (writes(c)) { target = pick(service, c); break; }
  }
  if (!target) {
    for (const service of services) {
      if (NOT_FOR_PRINTS.has(fullUuid(service.uuid))) continue;
      const c = service.characteristics.find(writes);
      if (c) { target = pick(service, c); break; }
    }
  }
  if (target) targets.set(deviceId, target);
  return target;
}

// The person chose this device as their printer: connect, check it takes prints, remember it.
export async function choosePrinter(deviceId, name) {
  await bluetoothReady();
  try {
    await connect(deviceId);
  } catch (error) {
    throw plain(error, `Couldn't connect to ${name}. Check it's on and nearby, then try again.`);
  }
  if (!(await printTarget(deviceId))) {
    await forgetPrinter(deviceId);
    throw new Error(`${name} doesn't take prints. Choose your receipt printer.`);
  }
  writeSaved({ ...readSaved(), [name]: deviceId });
}

export async function forgetPrinter(deviceId) {
  targets.delete(deviceId);
  connected.delete(deviceId);
  try { await BleClient.disconnect(deviceId); } catch { /* not connected */ }
  const saved = readSaved();
  for (const [name, id] of Object.entries(saved)) if (id === deviceId) delete saved[name];
  writeSaved(saved);
}

async function send(deviceId, bytes) {
  await bluetoothReady();
  try {
    await connect(deviceId);
  } catch (error) {
    throw plain(error, "Couldn't reach the printer. Check it's on and nearby.");
  }
  const target = await printTarget(deviceId);
  if (!target) throw new Error("This Bluetooth device doesn't take prints. Choose your printer in Settings → Receipt → Printer.");
  let mtu = 23;
  try { mtu = await BleClient.getMtu(deviceId); } catch { /* the smallest */ }
  const size = Math.max(20, Math.min(mtu - 3, 180));
  for (let i = 0; i < bytes.length; i += size) {
    const chunk = bytes.slice(i, i + size);
    const value = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    try {
      if (target.noResponse) {
        await BleClient.writeWithoutResponse(deviceId, target.service, target.characteristic, value);
        // The printer prints as it receives: a moment between chunks keeps its buffer from filling.
        if (i + size < bytes.length) await sleep(8);
      } else {
        await BleClient.write(deviceId, target.service, target.characteristic, value);
      }
    } catch (error) {
      connected.delete(deviceId);
      throw plain(error, 'The printer stopped part way. Check it has paper and is on, then print again.');
    }
  }
}

// One print at a time (a chit and a receipt at once would mix their bytes).
export function printNative(deviceId, bytes) {
  const job = printing.then(() => send(deviceId, bytes));
  printing = job.catch(() => {});
  return job;
}
