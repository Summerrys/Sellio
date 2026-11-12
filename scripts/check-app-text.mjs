// Every phrase the owner app shows must have its Bahasa Indonesia (src/lib/appText.js). The
// first step of `npm run build`: it fails when a phrase has none, so nothing ships half in
// English. Phrases are what the code passes to t(), appT() or N_() as a written string (with
// {name} blanks for values); the Indonesian is in src/locales/id/<group>.json.
//
//   node scripts/check-app-text.mjs            check (exit 1 on a problem)
//   node scripts/check-app-text.mjs --missing  also list each missing phrase with where it is
//   node scripts/check-app-text.mjs --json     the phrases, their files and groups, as JSON
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(root, 'src');
const LOCALES = path.join(SRC, 'locales', 'id');
const args = new Set(process.argv.slice(2));

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'locales') await walk(full, out); }
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// A JavaScript string literal's text.
function unquote(body, quote) {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, esc) => {
    if (esc[0] === 'u') return String.fromCodePoint(parseInt(esc.replace(/[u{}]/g, ''), 16));
    if (esc[0] === 'x') return String.fromCharCode(parseInt(esc.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' }[esc] ?? (esc === '\n' ? '' : esc);
  }).replace(new RegExp(`\\\\${quote}`, 'g'), quote);
}

const USES = /from\s+['"](?:@\/lib\/appText|(?:\.\.?\/)+(?:lib\/)?appText)(?:\.js)?['"]/;
const CALL = /(?<![\w$.])(t|appT|N_)\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|(`))/g;
const blanks = (text) => [...String(text).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort().join(',');

const phrases = new Map(); // phrase -> [{ file, line }]
const problems = [];
for (const file of await walk(SRC)) {
  const code = await readFile(file, 'utf8');
  if (!USES.test(code)) continue;
  const rel = path.relative(root, file);
  // A store page file has the buyers' own t('key') too: only appT() and N_() are the app's there.
  const buyersToo = /\buseLanguage\b/.test(code);
  for (const match of code.matchAll(CALL)) {
    if (buyersToo && match[1] === 't') continue;
    const line = code.slice(0, match.index).split('\n').length;
    if (match[4]) {
      problems.push(`${rel}:${line}: ${match[1]}() takes a written phrase with {blanks}, not a template string`);
      continue;
    }
    const phrase = match[2] != null ? unquote(match[2], "'") : unquote(match[3], '"');
    if (!phrase.trim()) { problems.push(`${rel}:${line}: an empty phrase`); continue; }
    if (!phrases.has(phrase)) phrases.set(phrase, []);
    phrases.get(phrase).push({ file: rel, line });
  }
}

const groups = {};
for (const name of (await readdir(LOCALES)).filter((n) => n.endsWith('.json')).sort()) {
  groups[name.replace(/\.json$/, '')] = JSON.parse(await readFile(path.join(LOCALES, name), 'utf8'));
}
const indexCode = await readFile(path.join(LOCALES, 'index.js'), 'utf8');
for (const group of Object.keys(groups)) {
  if (!new RegExp(`\\b${group}\\b`).test(indexCode)) problems.push(`src/locales/id/${group}.json is not loaded by src/locales/id/index.js`);
}

const translationOf = new Map(); // phrase -> { text, group }
for (const [group, entries] of Object.entries(groups)) {
  for (const [phrase, text] of Object.entries(entries)) {
    if (typeof text !== 'string' || !text.trim()) problems.push(`${group}.json: "${phrase}" has no Indonesian`);
    else if (blanks(text) !== blanks(phrase)) problems.push(`${group}.json: "${phrase}" and its Indonesian have different {blanks}`);
    const before = translationOf.get(phrase);
    if (before && before.text !== text) problems.push(`"${phrase}" is "${before.text}" in ${before.group}.json but "${text}" in ${group}.json`);
    if (!before) translationOf.set(phrase, { text, group });
  }
}

const missing = [...phrases.keys()].filter((phrase) => !translationOf.has(phrase));
const unused = [...translationOf.keys()].filter((phrase) => !phrases.has(phrase));

if (args.has('--json')) {
  console.log(JSON.stringify([...phrases].map(([phrase, where]) => ({
    phrase, id: translationOf.get(phrase)?.text ?? null, group: translationOf.get(phrase)?.group ?? null, where,
  })), null, 2));
  process.exit(0);
}
if (args.has('--missing')) {
  for (const phrase of missing) console.log(`${JSON.stringify(phrase)}  (${phrases.get(phrase).map((w) => `${w.file}:${w.line}`).join(', ')})`);
}
for (const phrase of missing) problems.push(`No Indonesian for ${JSON.stringify(phrase)} (${phrases.get(phrase)[0].file}:${phrases.get(phrase)[0].line})`);
if (unused.length) console.log(`Owner app words: ${unused.length} Indonesian phrase(s) no screen uses any more (fine to remove).`);

if (problems.length) {
  console.error(problems.slice(0, 40).join('\n'));
  if (problems.length > 40) console.error(`…and ${problems.length - 40} more.`);
  console.error(`Owner app words: ${problems.length} problem(s). Every phrase needs its Bahasa Indonesia (src/locales/id/).`);
  process.exit(1);
}
console.log(`Owner app words: all ${phrases.size} phrases have Bahasa Indonesia (${Object.keys(groups).length} groups).`);
