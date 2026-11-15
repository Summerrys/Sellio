// Every phrase the owner app shows must have its translation in every language it offers
// (src/lib/appText.js): Bahasa Indonesia, 中文 and Malay, each in src/locales/<language>/. The
// first step of `npm run build`: it fails when a phrase has none, so nothing ships half in
// English. Phrases are what the code passes to t(), appT() or N_() as a written string (with
// {name} blanks for values); a language's words are in src/locales/<language>/<group>.json.
//
//   node scripts/check-app-text.mjs            check (exit 1 on a problem)
//   node scripts/check-app-text.mjs --missing  also list each missing phrase with where it is
//   node scripts/check-app-text.mjs --json     the phrases, their files and groups, as JSON
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(root, 'src');
const LOCALES = path.join(SRC, 'locales');
const NAMES = { id: 'Bahasa Indonesia', zh: '中文 (Chinese)', ms: 'Malay' };
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
const groupsNamed = []; // useAppText('group') calls: { group, file, line }
for (const file of await walk(SRC)) {
  const code = await readFile(file, 'utf8');
  if (!USES.test(code)) continue;
  const rel = path.relative(root, file);
  // A store page file has the buyers' own t('key') too: only appT() and N_() are the app's there.
  const buyersToo = /\buseLanguage\b/.test(code);
  for (const match of code.matchAll(/\buseAppText\(\s*'([^']*)'/g)) {
    groupsNamed.push({ group: match[1], file: rel, line: code.slice(0, match.index).split('\n').length });
  }
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

// The languages: each folder of src/locales with an index.js, which appText.js must load.
const appTextCode = await readFile(path.join(SRC, 'lib', 'appText.js'), 'utf8');
const languages = [];
for (const entry of (await readdir(LOCALES, { withFileTypes: true })).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const dir = path.join(LOCALES, entry.name);
  const files = await readdir(dir);
  if (!files.includes('index.js')) continue;
  const groups = {};
  for (const name of files.filter((n) => n.endsWith('.json')).sort()) {
    groups[name.replace(/\.json$/, '')] = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
  }
  const indexCode = await readFile(path.join(dir, 'index.js'), 'utf8');
  for (const group of Object.keys(groups)) {
    if (!new RegExp(`\\b${group}\\b`).test(indexCode)) problems.push(`src/locales/${entry.name}/${group}.json is not loaded by src/locales/${entry.name}/index.js`);
  }
  if (!/\bGROUPS\b/.test(indexCode)) problems.push(`src/locales/${entry.name}/index.js does not export GROUPS`);
  if (!appTextCode.includes(`locales/${entry.name}/index.js`)) problems.push(`src/lib/appText.js does not load src/locales/${entry.name}/ (LOADERS)`);
  languages.push({ code: entry.name, name: NAMES[entry.name] || entry.name, groups });
}

// Every language has every group, and a screen names only a group that exists.
const allGroups = [...new Set(languages.flatMap((l) => Object.keys(l.groups)))].sort();
for (const language of languages) {
  for (const group of allGroups) {
    if (!language.groups[group]) problems.push(`src/locales/${language.code}/${group}.json is missing (the other languages have it)`);
  }
}
for (const { group, file, line } of groupsNamed) {
  if (!allGroups.includes(group)) problems.push(`${file}:${line}: useAppText('${group}') names no group (src/locales/<language>/${group}.json)`);
}

const unusedCount = {};
for (const language of languages) {
  const translationOf = new Map(); // phrase -> { text, group }
  for (const [group, entries] of Object.entries(language.groups)) {
    for (const [phrase, text] of Object.entries(entries)) {
      const file = `${language.code}/${group}.json`;
      if (typeof text !== 'string' || !text.trim()) problems.push(`${file}: "${phrase}" has no ${language.name}`);
      else if (blanks(text) !== blanks(phrase)) problems.push(`${file}: "${phrase}" and its ${language.name} have different {blanks}`);
      const before = translationOf.get(phrase);
      if (before && before.text !== text) problems.push(`"${phrase}" is "${before.text}" in ${language.code}/${before.group}.json but "${text}" in ${file}`);
      if (!before) translationOf.set(phrase, { text, group });
    }
  }
  language.translationOf = translationOf;
  language.missing = [...phrases.keys()].filter((phrase) => !translationOf.has(phrase));
  unusedCount[language.code] = [...translationOf.keys()].filter((phrase) => !phrases.has(phrase)).length;
}

if (args.has('--json')) {
  const id = languages.find((l) => l.code === 'id');
  console.log(JSON.stringify([...phrases].map(([phrase, where]) => ({
    phrase,
    ...Object.fromEntries(languages.map((l) => [l.code, l.translationOf.get(phrase)?.text ?? null])),
    group: id?.translationOf.get(phrase)?.group ?? null,
    where,
  })), null, 2));
  process.exit(0);
}
for (const language of languages) {
  if (args.has('--missing')) {
    for (const phrase of language.missing) console.log(`[${language.code}] ${JSON.stringify(phrase)}  (${phrases.get(phrase).map((w) => `${w.file}:${w.line}`).join(', ')})`);
  }
  for (const phrase of language.missing) problems.push(`No ${language.name} for ${JSON.stringify(phrase)} (${phrases.get(phrase)[0].file}:${phrases.get(phrase)[0].line})`);
  if (unusedCount[language.code]) console.log(`Owner app words: ${unusedCount[language.code]} ${language.name} phrase(s) no screen uses any more (fine to remove).`);
}

if (problems.length) {
  console.error(problems.slice(0, 40).join('\n'));
  if (problems.length > 40) console.error(`…and ${problems.length - 40} more.`);
  console.error(`Owner app words: ${problems.length} problem(s). Every phrase needs its translation in every language (src/locales/<language>/).`);
  process.exit(1);
}
console.log(`Owner app words: all ${phrases.size} phrases have ${languages.map((l) => l.name).join(', ')} (${allGroups.length} groups).`);
