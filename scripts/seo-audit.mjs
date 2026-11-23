// A small crawl of the website as a search engine's or an AI tool's crawler sees it: without
// running scripts. It reads robots.txt, llms.txt and the sitemap, then every page in the sitemap
// and every page they link to, and checks what Ahrefs' Site Audit and AI tools look for: status,
// title, description, canonical, robots, one H1, links in and out (orphans and dead ends), the
// structured data each kind of page should carry, word count and speed. Exit code 1 when an error
// is found. Run by .github/workflows/seo-check.yml against sellio.sg; on this computer against a
// local build (wrangler pages dev, with a stand-in database):
//
//   node scripts/seo-audit.mjs                          https://sellio.sg
//   node scripts/seo-audit.mjs http://127.0.0.1:8788    a local build (its pages name sellio.sg)
//   --external   also check where the pages' outside links lead (redirects)
//   --ua <name>  ahrefs (default), google, gptbot, claude, perplexity
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) || 'https://sellio.sg').replace(/\/$/, '');
const SITE = option('--site', 'https://sellio.sg').replace(/\/$/, '');
const AGENTS = {
  ahrefs: 'Mozilla/5.0 (compatible; AhrefsSiteAudit/6.1; +http://ahrefs.com/robot/site-audit)',
  google: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  gptbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  claude: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  perplexity: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
};
const UA = AGENTS[option('--ua', 'ahrefs')] || AGENTS.ahrefs;
const MAX_PAGES = 400;

const errors = [];
const warnings = [];
const notes = [];
const error = (page, text) => errors.push(`${page}: ${text}`);
const warn = (page, text) => warnings.push(`${page}: ${text}`);

// A sellio.sg address as this crawl fetches it (the same path on ORIGIN), and back.
const toOrigin = (address) => (address.startsWith(SITE) ? ORIGIN + address.slice(SITE.length) : address);
const toSite = (address) => (address.startsWith(ORIGIN) ? SITE + address.slice(ORIGIN.length) : address);
const pathOf = (address) => { const u = new URL(address); return u.pathname + u.search; };

async function get(address, { method = 'GET' } = {}) {
  const started = performance.now();
  try {
    const response = await fetch(address, { method, redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' }, signal: AbortSignal.timeout(20000) });
    const firstByte = performance.now() - started;
    const text = method === 'HEAD' ? '' : await response.text();
    return { status: response.status, headers: response.headers, text, ms: Math.round(firstByte), total: Math.round(performance.now() - started) };
  } catch (e) {
    return { status: 0, headers: new Headers(), text: '', ms: 0, total: 0, failure: String(e?.cause?.code || e?.message || e) };
  }
}

const decode = (text) => text.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const tagAttr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i')); return m ? decode(m[1]) : null; };

function readPage(html) {
  const headHtml = (html.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [])[1] || '';
  const metas = [...headHtml.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const metaNamed = (name) => metas.filter((t) => (tagAttr(t, 'name') || tagAttr(t, 'property') || '').toLowerCase() === name).map((t) => tagAttr(t, 'content'));
  const canonicals = [...headHtml.matchAll(/<link\b[^>]*rel="canonical"[^>]*>/gi)].map((m) => tagAttr(m[0], 'href'));
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [])[1] || '';
  const visible = body.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ');
  const words = decode(visible.replace(/<[^>]+>/g, ' ')).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const links = [...visible.matchAll(/<a\b[^>]*>/gi)].map((m) => ({ href: tagAttr(m[0], 'href'), nofollow: /\bnofollow\b/i.test(tagAttr(m[0], 'rel') || '') }))
    .filter((l) => l.href && !/^(#|mailto:|tel:|javascript:)/i.test(l.href));
  const ld = [];
  const ldErrors = [];
  for (const m of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      for (const node of data['@graph'] || (Array.isArray(data) ? data : [data])) ld.push(node);
    } catch (e) {
      ldErrors.push(e.message);
    }
  }
  return {
    title: decode((headHtml.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim(),
    titles: (headHtml.match(/<title>/gi) || []).length,
    description: metaNamed('description')[0] ?? null,
    descriptions: metaNamed('description').length,
    robots: (metaNamed('robots')[0] || 'index, follow').toLowerCase(),
    canonicals,
    h1: [...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decode(m[1].replace(/<[^>]+>/g, '')).trim()),
    words: words.length,
    links,
    ld,
    ldErrors,
    imagesWithoutAlt: [...visible.matchAll(/<img\b[^>]*>/gi)].filter((m) => tagAttr(m[0], 'alt') == null).length,
  };
}

// ── robots.txt, llms.txt, sitemap.xml ──
console.log(`Crawling ${ORIGIN} as ${UA.match(/\b(\w+Bot|AhrefsSiteAudit|Googlebot)\b/)?.[0] || 'a crawler'} (pages named as ${SITE}).\n`);
const robots = await get(`${ORIGIN}/robots.txt`);
console.log(`robots.txt: ${robots.status}\n${robots.text.trim().split('\n').map((l) => `  | ${l}`).join('\n')}\n`);
if (robots.status !== 200) error('/robots.txt', `answered ${robots.status}`);
if (!/^Sitemap:\s*\S+/m.test(robots.text)) error('/robots.txt', 'no Sitemap line');
for (const [agent, rules] of robots.text.split(/^(?=User-agent:)/im).map((group) => [group.match(/^User-agent:\s*(.+)$/im)?.[1]?.trim(), group])) {
  if (agent && /^Disallow:\s*\/\s*$/im.test(rules)) error('/robots.txt', `shuts out ${agent}`);
}
const llms = await get(`${ORIGIN}/llms.txt`);
console.log(`llms.txt: ${llms.status}, ${llms.text.length} characters, ${llms.text.includes('## Shops on Sellio') ? 'with' : 'WITHOUT'} the shops list`);
if (llms.status !== 200) error('/llms.txt', `answered ${llms.status}`);

const sitemap = await get(`${ORIGIN}/sitemap.xml`);
const listed = [...sitemap.text.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => decode(m[1]));
console.log(`sitemap.xml: ${sitemap.status}, ${listed.length} pages (${sitemap.ms} ms)\n`);
if (sitemap.status !== 200 || !listed.length) error('/sitemap.xml', `answered ${sitemap.status} with ${listed.length} pages`);

// ── The crawl ──
const pages = new Map(); // site address -> result
const queue = [`${SITE}/`, ...listed];
const incoming = new Map(); // site address -> set of pages linking to it (followed links)
const redirectLinks = new Map(); // page -> links to addresses that redirect
const external = new Map(); // outside address -> pages linking to it
const isInternal = (address) => address.startsWith(SITE) || address.startsWith(ORIGIN);
const isPage = (address) => { const p = new URL(address).pathname; const last = p.slice(p.lastIndexOf('/') + 1); return !last.includes('.') || last.endsWith('.html'); };

while (queue.length && pages.size < MAX_PAGES) {
  const address = queue.shift();
  if (pages.has(address)) continue;
  const answer = await get(toOrigin(address));
  const page = { address, status: answer.status, ms: answer.ms, location: answer.headers.get('location'), type: answer.headers.get('content-type') || '', failure: answer.failure };
  pages.set(address, page);
  if (answer.status !== 200 || !page.type.includes('text/html')) continue;
  Object.assign(page, readPage(answer.text));
  const follow = !/nofollow/.test(page.robots);
  for (const link of page.links) {
    let target;
    try { target = new URL(link.href, toOrigin(address)).href; } catch { continue; }
    if (!isInternal(target)) {
      if (!external.has(target)) external.set(target, new Set());
      external.get(target).add(pathOf(address));
      continue;
    }
    const site = toSite(target).replace(/#.*$/, '');
    if (!isPage(site)) continue;
    if (follow && !link.nofollow) {
      if (!incoming.has(site)) incoming.set(site, new Set());
      if (site !== address) incoming.get(site).add(address);
    }
    if (!pages.has(site) && !queue.includes(site)) queue.push(site);
  }
}

// Where links lead that redirect (an internal address answering 3xx).
for (const [address, page] of pages) {
  for (const link of page.links || []) {
    let target;
    try { target = toSite(new URL(link.href, toOrigin(address)).href).replace(/#.*$/, ''); } catch { continue; }
    const hit = pages.get(target);
    if (hit && hit.status >= 300 && hit.status < 400) {
      if (!redirectLinks.has(address)) redirectLinks.set(address, new Set());
      redirectLinks.get(address).add(`${pathOf(target)} → ${hit.location}`);
    }
  }
}

// ── Checks ──
const indexable = (page) => page.status === 200 && page.type?.includes('text/html') && !/noindex/.test(page.robots || '');
const kindOf = (address) => {
  const p = new URL(address).pathname;
  if (p === '/') return 'home';
  if (p === '/explore') return 'explore';
  if (p.startsWith('/store/')) return 'store';
  if (p.startsWith('/listing/')) return 'listing';
  return 'page';
};
const NEEDS = { home: ['Organization', 'WebSite'], explore: ['ItemList'], store: ['ItemList'], listing: ['Product'] };
const titles = new Map();
console.log('status  ms    words links h1 ld  page');
for (const [address, page] of pages) {
  const label = pathOf(address);
  const types = (page.ld || []).flatMap((n) => [].concat(n['@type']));
  console.log(`${String(page.status).padEnd(7)} ${String(page.ms).padEnd(5)} ${String(page.words ?? '-').padEnd(5)} ${String(page.links?.length ?? '-').padEnd(5)} ${String(page.h1?.length ?? '-').padEnd(2)} ${String(types.length).padEnd(3)} ${label}${page.location ? ` → ${page.location}` : ''}${page.robots && /noindex/.test(page.robots) ? '  [noindex]' : ''}${page.failure ? `  (${page.failure})` : ''}`);
  if (page.status === 0) { error(label, `no answer (${page.failure})`); continue; }
  if (page.status >= 500) error(label, `answered ${page.status}`);
  if (page.ms > 1500) warn(label, `slow first byte: ${page.ms} ms`);
  if (listed.includes(address)) {
    if (page.status !== 200) error(label, `in the sitemap but answered ${page.status}`);
    else if (!indexable(page)) error(label, 'in the sitemap but noindex');
    else if (page.canonicals[0] !== address) error(label, `in the sitemap but its canonical is ${page.canonicals[0] || 'missing'}`);
  }
  for (const message of page.ldErrors || []) error(label, `structured data is not valid JSON: ${message}`);
  if (!indexable(page)) continue;
  if (page.titles !== 1 || !page.title) error(label, `${page.titles} titles`);
  if (page.canonicals.length !== 1) error(label, `${page.canonicals.length} canonical tags`);
  if (!page.links.some((l) => isInternal(new URL(l.href, toOrigin(address)).href))) error(label, 'no outgoing internal links (a dead end)');
  if (address !== `${SITE}/` && !(incoming.get(address)?.size)) error(label, 'orphan: no page links to it');
  if (page.h1.length !== 1) error(label, `${page.h1.length} H1 headings`);
  for (const type of NEEDS[kindOf(address)] || []) if (!types.includes(type)) error(label, `no ${type} structured data`);
  if (!page.description) warn(label, 'no meta description');
  else if (page.description.length > 165 || page.description.length < 50) warn(label, `meta description is ${page.description.length} characters`);
  if (page.descriptions > 1) error(label, `${page.descriptions} meta descriptions`);
  if (page.title.length > 70) warn(label, `title is ${page.title.length} characters`);
  if (page.words < 150) notes.push(`${label}: ${page.words} words`);
  if (page.imagesWithoutAlt) warn(label, `${page.imagesWithoutAlt} images without alt text`);
  if (titles.has(page.title)) error(label, `same title as ${titles.get(page.title)}`);
  else titles.set(page.title, label);
}
for (const [address, links] of redirectLinks) warn(pathOf(address), `links to addresses that redirect: ${[...links].join(', ')}`);

if (flag('--external')) {
  console.log(`\nOutside links (${external.size}):`);
  for (const [address, from] of external) {
    const answer = await get(address);
    const where = answer.headers.get('location');
    console.log(`  ${answer.status} ${address}${where ? ` → ${where}` : ''}  (from ${[...from].join(', ')})`);
    if (answer.status >= 300 && answer.status < 400) warn([...from].join(', '), `links to ${address}, which redirects to ${where}`);
    if (answer.status >= 400 && answer.status !== 403 && answer.status !== 405 && answer.status !== 429) warn([...from].join(', '), `links to ${address}, which answers ${answer.status}`);
  }
}

// The edge-written pages again, straight after: the second answer should come from what Cloudflare
// kept (X-Sellio-Edge-Cache: kept), as fast as a plain file. cf-ray ends with the Cloudflare
// location that answered.
const again = [...pages.keys()].filter((a) => ['store', 'listing', 'explore'].includes(kindOf(a)) && pages.get(a).status === 200);
const sample = [...new Set([again.find((a) => kindOf(a) === 'store'), again.find((a) => kindOf(a) === 'listing'), again.find((a) => kindOf(a) === 'explore')].filter(Boolean))];
if (sample.length) {
  console.log('\nEdge pages asked for again (first byte, Cloudflare location, data):');
  for (const address of sample) {
    for (const round of [1, 2]) {
      const answer = await get(toOrigin(address));
      const location = (answer.headers.get('cf-ray') || '').split('-').pop() || '?';
      console.log(`  ${round === 1 ? 'again' : 'again²'} ${String(answer.ms).padStart(5)} ms  ${location.padEnd(4)} ${answer.headers.get('x-sellio-edge') || '-'} / ${answer.headers.get('x-sellio-edge-cache') || '-'}  ${pathOf(address)}`);
      if (round === 2 && answer.headers.get('x-sellio-edge-cache') === 'read') warn(pathOf(address), 'asked for twice in a row, the database was read both times: Cloudflare\'s cache isn\'t keeping it');
    }
  }
}

const crawled = [...pages.values()];
console.log(`\n${crawled.length} pages: ${crawled.filter(indexable).length} indexable, ${crawled.filter((p) => p.status === 200 && !indexable(p)).length} noindex, `
  + `${crawled.filter((p) => p.status >= 300 && p.status < 400).length} redirects, ${crawled.filter((p) => p.status >= 400).length} errors. `
  + `Slowest first byte: ${Math.max(0, ...crawled.map((p) => p.ms))} ms.`);
if (notes.length) console.log(`\nLow word count (notes):\n  ${notes.join('\n  ')}`);
if (warnings.length) console.log(`\nWarnings (${warnings.length}):\n  ${warnings.join('\n  ')}`);
if (errors.length) {
  console.log(`\nErrors (${errors.length}):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log('\nNo errors.');
