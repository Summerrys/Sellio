// Live updates for Sellio's apps (src/lib/liveUpdates.js). The last step of `npm run build`,
// after scripts/build-app.mjs has made dist-app/ (the web files the apps carry):
//
// 1. Stamps dist-app/sellio-bundle.json with
//    - version: a hash of every file in dist-app/ (the same files give the same version);
//    - native: per platform, a hash of what that app's native code is made from (its plugins
//      and their versions, capacitor.config.json, the Android or iOS project files).
// 2. Packs dist-app/ into dist/app-updates/<version>.zip and writes
//    dist/app-updates/manifest.json: { version, native, url, sha256, size }.
//    Cloudflare Pages publishes both with the website: https://sellio.sg/app-updates/…
//
// An installed app takes a newer version only when the manifest's native hash for its platform
// equals the one in the files it is running. The files an app runs always come from a build
// with its own native code (the ones it shipped with, or an update that passed this check), so
// web code that needs a plugin or permission the installed app lacks never reaches it: those
// apps wait for the store update. A change to the native inputs below changes the hash.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

export const APP_DIR = 'dist-app';
export const OUT_DIR = 'dist/app-updates';
export const STAMP = 'sellio-bundle.json';

// What each app's native code is made from. Resources (icons, colours, the splash picture) are
// left out: they change how the app looks, not what its web code can call.
export const NATIVE_INPUTS = {
  common: ['capacitor.config.json'],
  android: [
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/java',
    'android/app/src/main/res/layout', // the screen's layout (pull to refresh around the web view)
    'android/app/build.gradle',
    'android/app/capacitor.build.gradle',
    'android/build.gradle',
    'android/capacitor.settings.gradle',
    'android/variables.gradle',
  ],
  ios: [
    'ios/App/App/Info.plist',
    'ios/App/App/App.entitlements',
    'ios/App/App/AppDelegate.swift',
    'ios/App/App/SceneDelegate.swift',
    'ios/App/CapApp-SPM/Package.swift',
    'ios/App/App.xcodeproj/project.pbxproj',
  ],
};
// The packages with native code (not the Capacitor command-line tool).
export const NATIVE_PACKAGE = /^@capacitor\/(?!cli$)|^@capacitor-community\/|^@capacitor-firebase\/|^@capgo\//;

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

async function filesUnder(root, dir = root) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(root, full));
    else if (entry.isFile()) out.push(posix(path.relative(root, full)));
  }
  return out.sort();
}

// A hash of named files and folders (a missing one counts as missing).
async function hashPaths(base, paths) {
  const hash = createHash('sha256');
  for (const rel of paths) {
    const full = path.join(base, rel);
    const info = await stat(full).catch(() => null);
    if (!info) { hash.update(`${rel}\0missing\n`); continue; }
    const files = info.isDirectory() ? (await filesUnder(full)).map((f) => `${rel}/${f}`) : [rel];
    for (const file of files) hash.update(`${file}\0${sha256(await readFile(path.join(base, file)))}\n`);
  }
  return hash;
}

export async function nativeHashes(base = '.') {
  const pkg = JSON.parse(await readFile(path.join(base, 'package.json'), 'utf8'));
  const plugins = Object.entries({ ...pkg.dependencies })
    .filter(([name]) => NATIVE_PACKAGE.test(name))
    .map(([name, version]) => `${name}@${version}`)
    .sort()
    .join('\n');
  const out = {};
  for (const platform of ['android', 'ios']) {
    const hash = await hashPaths(base, [...NATIVE_INPUTS.common, ...NATIVE_INPUTS[platform]]);
    hash.update(`plugins\0${plugins}\n`);
    out[platform] = hash.digest('hex').slice(0, 12);
  }
  return out;
}

export async function bundleVersion(dir) {
  const hash = createHash('sha256');
  for (const file of await filesUnder(dir)) {
    if (file === STAMP) continue;
    hash.update(`${file}\0${sha256(await readFile(path.join(dir, file)))}\n`);
  }
  return hash.digest('hex').slice(0, 12);
}

// ── A zip with the same bytes for the same files: sorted names, a fixed date ────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
export function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipFiles(entries) {
  const DOS_TIME = 0; // 00:00
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1 January 1980
  const MADE_BY = (3 << 8) | 20; // Unix, zip 2.0
  const REGULAR_FILE = (0o100644 << 16) >>> 0;
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    if (!name || name.startsWith('/') || name.split('/').includes('..')) throw new Error(`Bad name in zip: ${name}`);
    const nameBytes = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // names in UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBytes, body);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(MADE_BY, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(method, 10);
    head.writeUInt16LE(DOS_TIME, 12);
    head.writeUInt16LE(DOS_DATE, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(body.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(nameBytes.length, 28);
    head.writeUInt16LE(0, 30);
    head.writeUInt16LE(0, 32);
    head.writeUInt16LE(0, 34);
    head.writeUInt16LE(0, 36);
    head.writeUInt32LE(REGULAR_FILE, 38);
    head.writeUInt32LE(offset, 42);
    central.push(head, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  if (entries.length > 0xffff || offset > 0xffffffff) throw new Error('The app files are too many or too large for a zip.');
  return Buffer.concat([...parts, ...central, end]);
}

// Stamps the app's files and publishes them as an update. Returns the manifest.
export async function publishAppUpdate({ base = '.', appDir = APP_DIR, outDir = OUT_DIR } = {}) {
  const dir = path.join(base, appDir);
  const index = await stat(path.join(dir, 'index.html')).catch(() => null);
  if (!index) throw new Error(`${appDir}/index.html is missing. Run scripts/build-app.mjs first.`);
  const native = await nativeHashes(base);
  const version = await bundleVersion(dir);
  await writeFile(path.join(dir, STAMP), `${JSON.stringify({ version, native })}\n`);
  const names = await filesUnder(dir);
  const entries = [];
  for (const name of names) entries.push({ name, data: await readFile(path.join(dir, name)) });
  const zip = zipFiles(entries);
  const out = path.join(base, outDir);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, `${version}.zip`), zip);
  const manifest = { version, native, url: `/app-updates/${version}.zip`, sha256: sha256(zip), size: zip.length };
  await writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = await publishAppUpdate();
  console.log(`App update ${manifest.version} (native android ${manifest.native.android}, ios ${manifest.native.ios}): `
    + `${manifest.url}, ${(manifest.size / 1048576).toFixed(1)} MB.`);
}
