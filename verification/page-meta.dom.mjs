// src/lib/pageMeta.js (node verification/page-meta.dom.mjs /tmp/sellio-verification): a public
// page's title, description, canonical and robots rule are set while it's shown and put back as
// they were when it goes; item descriptions are cut to one search-result line.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const deps = process.argv[2] || '/tmp/sellio-verification';
const require = createRequire(path.join(deps, 'package.json'));
const { JSDOM } = require('jsdom');
const { applyPageMeta, snippet, SITE, hasEdgeHead, dropEdgeHead, jsonLdText } = await import(pathToFileURL(path.resolve('src/lib/pageMeta.js')).href);

const passed = (name) => console.log(`PASS ${name}`);
const head = (doc) => ({
  title: doc.title,
  description: doc.head.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
  ogTitle: doc.head.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? null,
  ogUrl: doc.head.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? null,
  canonical: doc.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
  robots: doc.head.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
  count: doc.head.querySelectorAll('link[rel="canonical"], meta[name="description"], meta[name="robots"]').length,
});

// An app shell (app.html): a title and a robots rule, nothing else.
{
  const { document } = new JSDOM('<!doctype html><html><head><title>Sellio</title><meta name="robots" content="noindex, nofollow"></head><body></body></html>').window;
  const before = head(document);
  const undo = applyPageMeta({
    title: 'Explore shops and items · Sellio',
    description: 'Browse shops and home sellers on Sellio, and order from them directly.',
    canonical: `${SITE}/explore`,
    robots: 'index, follow',
  }, document);
  assert.deepEqual(head(document), {
    title: 'Explore shops and items · Sellio',
    description: 'Browse shops and home sellers on Sellio, and order from them directly.',
    ogTitle: 'Explore shops and items · Sellio',
    ogUrl: 'https://sellio.sg/explore',
    canonical: 'https://sellio.sg/explore',
    robots: 'index, follow',
    count: 3,
  });
  undo();
  assert.deepEqual(head(document), before, 'Everything goes back as it was: created tags removed, the robots rule restored');
  passed('pageMeta: set while shown, put back after (app shell)');
}

// A page that already has its own tags (the start page's prerendered head): changed, then restored.
{
  const { document } = new JSDOM('<!doctype html><html><head><title>Sellio</title><meta name="description" content="Start"><link rel="canonical" href="https://sellio.sg/"><meta property="og:url" content="https://sellio.sg/"></head><body></body></html>').window;
  const before = head(document);
  const undo = applyPageMeta({ title: 'Kaya toast · Kopi Corner', description: 'Toast', canonical: 'https://sellio.sg/listing/abc' }, document);
  assert.equal(head(document).canonical, 'https://sellio.sg/listing/abc');
  assert.equal(document.head.querySelectorAll('link[rel="canonical"]').length, 1, 'One canonical, never two');
  undo();
  assert.deepEqual(head(document), before);
  // Only a robots rule (an item that's gone): nothing else is touched.
  const undoRobots = applyPageMeta({ robots: 'noindex, nofollow' }, document);
  assert.deepEqual({ ...head(document), robots: before.robots, count: before.count }, before);
  assert.equal(head(document).robots, 'noindex, nofollow');
  undoRobots();
  assert.deepEqual(head(document), before);
  passed('pageMeta: an existing head is restored exactly; a robots-only call touches nothing else');
}

// Search-result lines.
assert.equal(snippet('  Fresh   kaya,\nmade daily.  '), 'Fresh kaya, made daily.');
assert.equal(snippet(''), '');
assert.equal(snippet(null), '');
const long = 'Hand-made pandan chiffon cake baked fresh every morning with real pandan juice, coconut milk and free-range eggs, sliced or whole, for pick-up or delivery across the island.';
const line = snippet(long);
assert.ok(line.length <= 155, `at most 155 characters (${line.length})`);
assert.ok(line.endsWith('…') && !line.endsWith(' …') && !/[,.]…$/.test(line), line);
assert.ok(long.startsWith(line.slice(0, -1)), 'cut at a word, from the start');
passed('pageMeta: item descriptions become one search-result line');

// The head the website writes for a storefront, an item or Explore (public/_worker.js, each tag
// data-sellio-edge): seen while there, removed on moving on; nothing else in the head goes.
{
  const { document } = new JSDOM('<!doctype html><html><head><meta charset="utf-8"><title>Shop | Sellio</title>'
    + '<meta name="description" content="Written" data-sellio-edge><link rel="canonical" href="https://sellio.sg/store/a" data-sellio-edge>'
    + '<script type="application/ld+json" data-sellio-edge>{}</script><link rel="manifest" href="/manifest.json"></head><body></body></html>').window;
  assert.equal(hasEdgeHead(document), true);
  dropEdgeHead(document);
  assert.equal(hasEdgeHead(document), false);
  assert.equal(document.head.querySelectorAll('meta[name="description"], link[rel="canonical"], script').length, 0);
  assert.ok(document.head.querySelector('link[rel="manifest"]'), 'The page\'s own tags stay');
  assert.ok(document.head.querySelector('meta[charset]'));
  const { document: plain } = new JSDOM('<!doctype html><html><head><title>Sellio</title></head><body></body></html>').window;
  assert.equal(hasEdgeHead(plain), false);
  dropEdgeHead(plain);
  passed('pageMeta: the website-written head is seen while there and removed on moving on');
}

// Structured data as script text: "</script>" can't end the script; the JSON is unchanged.
{
  const data = { name: 'Bun </script><script>alert(1)</script>', note: 'a\u2028b' };
  const text = jsonLdText(data);
  assert.doesNotMatch(text, /<\/script/i);
  assert.deepEqual(JSON.parse(text), data);
  passed('pageMeta: structured data text can\'t end its script and parses back the same');
}
