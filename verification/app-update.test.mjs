// scripts/app-update.mjs: the stamp, the zip and the manifest that live updates come from, and
// the native hashes that keep web code off apps it doesn't fit. Run: node verification/app-update.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  bundleVersion, crc32, nativeHashes, publishAppUpdate, STAMP, zipFiles,
} from '../scripts/app-update.mjs';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-app-update-'));
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${name}`); };
const python = (code, ...args) => execFileSync('python3', ['-c', code, ...args], { encoding: 'utf8' }).trim();

try {
  await check('crc32 matches the standard check value', async () => {
    assert.equal(crc32(Buffer.from('123456789')).toString(16), 'cbf43926');
  });

  await check('The zip opens in standard tools: every file, byte for byte, no errors; same files give the same bytes', async () => {
    const entries = [
      { name: 'index.html', data: Buffer.from('<!doctype html><div id="root"></div>'.repeat(50)) },
      { name: 'assets/app-x1.js', data: Buffer.from('console.log(1)') },
      { name: 'assets/ünïcode name.txt', data: Buffer.from('ok') },
      { name: 'empty.txt', data: Buffer.alloc(0) },
      { name: 'random.bin', data: Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 7919) % 251)) },
    ];
    const zip = zipFiles(entries);
    const file = path.join(tmp, 'a.zip');
    await writeFile(file, zip);
    const report = JSON.parse(python(`
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
print(json.dumps({"bad": z.testzip(), "files": {n: z.read(n).hex() for n in z.namelist()},
  "modes": sorted({oct(i.external_attr >> 16) for i in z.infolist()})}))`, file));
    assert.equal(report.bad, null);
    assert.deepEqual(Object.keys(report.files).sort(), entries.map((e) => e.name).sort());
    for (const e of entries) assert.equal(report.files[e.name], e.data.toString('hex'), e.name);
    assert.deepEqual(report.modes, ['0o100644'], 'regular files');
    assert.ok(zip.length < entries.reduce((n, e) => n + e.data.length, 0), 'compressed');
    assert.equal(zipFiles(entries).equals(zip), true, 'deterministic');
  });

  await check('No names that could write outside the update folder', async () => {
    for (const name of ['../evil.js', '/etc/passwd', 'a/../../b', '']) {
      assert.throws(() => zipFiles([{ name, data: Buffer.from('x') }]), /Bad name/);
    }
  });

  // A small copy of the repository's native inputs to change one at a time.
  const base = path.join(tmp, 'repo');
  const put = async (rel, text) => { await mkdir(path.dirname(path.join(base, rel)), { recursive: true }); await writeFile(path.join(base, rel), text); };
  await put('package.json', JSON.stringify({ dependencies: {
    '@capacitor/core': '8.5.3', '@capacitor/android': '8.5.3', '@capacitor/ios': '8.5.3',
    '@capgo/capacitor-updater': '8.53.1', react: '^18.2.0',
  }, devDependencies: { '@capacitor/cli': '8.5.3' } }));
  await put('capacitor.config.json', '{"appId":"x"}');
  await put('android/app/src/main/AndroidManifest.xml', '<manifest/>');
  await put('android/app/src/main/java/x/MainActivity.java', 'class MainActivity {}');
  await put('android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png', 'icon');
  await put('ios/App/App/Info.plist', '<plist/>');
  await put('ios/App/CapApp-SPM/Package.swift', '// plugins');
  const start = await nativeHashes(base);
  const changed = async (rel, text) => {
    const before = await readFile(path.join(base, rel), 'utf8');
    await put(rel, text);
    const after = await nativeHashes(base);
    await put(rel, before);
    return { android: after.android !== start.android, ios: after.ios !== start.ios };
  };

  await check('Native hashes: one per platform, stable for the same files', async () => {
    assert.match(start.android, /^[0-9a-f]{12}$/);
    assert.match(start.ios, /^[0-9a-f]{12}$/);
    assert.deepEqual(await nativeHashes(base), start);
  });

  await check('An Android-only change holds back Android apps only; an iOS-only change iOS only', async () => {
    assert.deepEqual(await changed('android/app/src/main/AndroidManifest.xml', '<manifest a="1"/>'), { android: true, ios: false });
    assert.deepEqual(await changed('android/app/src/main/java/x/MainActivity.java', 'class MainActivity { int a; }'), { android: true, ios: false });
    assert.deepEqual(await changed('ios/App/App/Info.plist', '<plist a="1"/>'), { android: false, ios: true });
    assert.deepEqual(await changed('ios/App/CapApp-SPM/Package.swift', '// plugins + one'), { android: false, ios: true });
  });

  await check('A plugin version or capacitor.config.json holds back both; the web code, the CLI and icons hold back neither', async () => {
    const pkg = JSON.parse(await readFile(path.join(base, 'package.json'), 'utf8'));
    const withPkg = (fn) => { const p = structuredClone(pkg); fn(p); return JSON.stringify(p); };
    assert.deepEqual(await changed('package.json', withPkg((p) => { p.dependencies['@capgo/capacitor-updater'] = '8.54.0'; })), { android: true, ios: true });
    assert.deepEqual(await changed('package.json', withPkg((p) => { p.dependencies['@capacitor-community/bluetooth-le'] = '8.3.0'; })), { android: true, ios: true });
    assert.deepEqual(await changed('capacitor.config.json', '{"appId":"y"}'), { android: true, ios: true });
    assert.deepEqual(await changed('package.json', withPkg((p) => { p.dependencies.react = '^18.3.0'; })), { android: false, ios: false });
    assert.deepEqual(await changed('package.json', withPkg((p) => { p.devDependencies['@capacitor/cli'] = '8.6.0'; })), { android: false, ios: false });
    assert.deepEqual(await changed('android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png', 'new icon'), { android: false, ios: false });
  });

  await check('Publishing: stamped files, a zip of exactly them and a manifest that names it with its checksum', async () => {
    await mkdir(path.join(base, 'dist-app/assets'), { recursive: true });
    await put('dist-app/index.html', '<!doctype html><div id="root"></div><script src="/assets/a.js"></script>');
    await put('dist-app/assets/a.js', 'console.log("a")');
    const manifest = await publishAppUpdate({ base });
    const stamp = JSON.parse(await readFile(path.join(base, 'dist-app', STAMP), 'utf8'));
    assert.deepEqual(stamp, { version: manifest.version, native: manifest.native });
    assert.deepEqual(manifest.native, start);
    assert.equal(manifest.url, `/app-updates/${manifest.version}.zip`);
    const zip = await readFile(path.join(base, 'dist/app-updates', `${manifest.version}.zip`));
    assert.equal(manifest.sha256, createHash('sha256').update(zip).digest('hex'));
    assert.equal(manifest.size, zip.length);
    const names = python('import sys, zipfile; print(",".join(sorted(zipfile.ZipFile(sys.argv[1]).namelist())))', path.join(base, 'dist/app-updates', `${manifest.version}.zip`));
    assert.equal(names, `assets/a.js,index.html,${STAMP}`);
    const written = JSON.parse(await readFile(path.join(base, 'dist/app-updates/manifest.json'), 'utf8'));
    assert.deepEqual(written, manifest);
  });

  await check('The version follows the files (not the stamp): the same files give the same version again', async () => {
    const dir = path.join(base, 'dist-app');
    const v1 = await bundleVersion(dir);
    await writeFile(path.join(dir, STAMP), '{"version":"changed"}');
    assert.equal(await bundleVersion(dir), v1, 'the stamp is not part of the version');
    await put('dist-app/assets/a.js', 'console.log("b")');
    assert.notEqual(await bundleVersion(dir), v1);
    await put('dist-app/assets/a.js', 'console.log("a")');
    assert.equal(await bundleVersion(dir), v1);
    const again = await publishAppUpdate({ base });
    assert.equal(again.version, v1);
  });

  await check('Publishing without the app files stops the build', async () => {
    const empty = path.join(tmp, 'empty');
    await cp(path.join(base, 'package.json'), path.join(empty, 'package.json'), { recursive: true });
    await assert.rejects(publishAppUpdate({ base: empty }), /index\.html is missing/);
  });
} finally {
  await rm(tmp, { recursive: true, force: true });
}
console.log(`${passed} app update packaging checks passed.`);
