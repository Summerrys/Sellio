// The emulator check's two test live updates (android-emulator-check.sh, step 7), made from
// copies of dist-app/ in <dir>/good and <dir>/broken: each gets its own version (and this
// build's native hashes, so the app accepts it), is zipped with scripts/app-update.mjs's zip
// writer into <dir>/www/<version>.zip, and gets a manifest <dir>/<good|broken>.json.
// Run: node .github/scripts/live-update-test-bundles.mjs <dir> <good version> <broken version>
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zipFiles } from '../../scripts/app-update.mjs';

const [dir, good, broken] = process.argv.slice(2);
const { native } = JSON.parse(await readFile('dist-app/sellio-bundle.json', 'utf8'));

async function files(root, sub = '') {
  const out = [];
  for (const entry of await readdir(path.join(root, sub), { withFileTypes: true })) {
    const rel = sub ? `${sub}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await files(root, rel));
    else out.push(rel);
  }
  return out.sort();
}

for (const [name, version] of [['good', good], ['broken', broken]]) {
  const root = path.join(dir, name);
  await writeFile(path.join(root, 'sellio-bundle.json'), `${JSON.stringify({ version, native })}\n`);
  const entries = [];
  for (const file of await files(root)) entries.push({ name: file, data: await readFile(path.join(root, file)) });
  const zip = zipFiles(entries);
  await writeFile(path.join(dir, 'www', `${version}.zip`), zip);
  const manifest = {
    version, native, url: `/${version}.zip`,
    sha256: createHash('sha256').update(zip).digest('hex'), size: zip.length,
  };
  await writeFile(path.join(dir, `${name}.json`), JSON.stringify(manifest));
  console.log(`test update ${version}: ${zip.length} bytes`);
}
