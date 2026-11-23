// IndexNow (indexnow.org): tells the search engines that take it (Bing, which ChatGPT search and
// Copilot draw on, Yandex, Naver, Seznam and Yep) which sellio.sg pages changed, so they read
// them again soon rather than on their own schedule. One submission reaches them all. The pages
// and their dates come from sellio.sg/sitemap.xml (public/_worker.js); the key is public by
// design: search engines check it in the key file, public/<KEY>.txt. Run by
// .github/workflows/indexnow.yml.
//
//   node scripts/indexnow.mjs              the pages whose sitemap date is in the last 7 hours
//   node scripts/indexnow.mjs --hours 24   ... in the last 24 hours
//   node scripts/indexnow.mjs --all        every page in the sitemap (after a change to every page)
//   --wait-for-key   first wait (up to 20 minutes) until the key file is live (a new deploy)
//   --dry-run        list the pages, send nothing
import { pathToFileURL } from 'node:url';

export const SITE = 'https://sellio.sg';
export const KEY = '1f3882ad422aa7f69880e733ef9d710f';
export const KEY_LOCATION = `${SITE}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const BATCH = 10000; // IndexNow takes at most 10,000 addresses a request

const unxml = (text) => text.replace(/&(lt|gt|quot|apos|amp);/g, (_, name) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[name]);

// The sitemap's pages: [{ loc, lastmod (a Date, or null) }], sellio.sg addresses only.
export function parseSitemap(xml) {
  const pages = [];
  for (const [, entry] of String(xml).matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = unxml((entry.match(/<loc>([^<]*)<\/loc>/) || [])[1] || '').trim();
    if (!loc.startsWith(`${SITE}/`) && loc !== SITE) continue;
    const when = (entry.match(/<lastmod>([^<]*)<\/lastmod>/) || [])[1];
    const lastmod = when ? new Date(when) : null;
    pages.push({ loc, lastmod: lastmod && !Number.isNaN(lastmod.getTime()) ? lastmod : null });
  }
  return pages;
}

// Every page, or those changed since `since` (pages with no date only with `all`).
export function pick(pages, { all = false, since = null } = {}) {
  const picked = all ? pages : pages.filter((p) => p.lastmod && since && p.lastmod >= since);
  return [...new Set(picked.map((p) => p.loc))];
}

export const body = (urlList) => ({ host: 'sellio.sg', key: KEY, keyLocation: KEY_LOCATION, urlList });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function keyIsLive() {
  try {
    const answer = await fetch(`${KEY_LOCATION}?check=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
    return answer.ok && (await answer.text()).trim() === KEY;
  } catch {
    return false;
  }
}

async function main(argv) {
  const args = new Set(argv.filter((a) => a.startsWith('--')));
  const hoursAt = argv.indexOf('--hours');
  const hours = hoursAt >= 0 ? Number(argv[hoursAt + 1]) : 7;
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('--hours takes a number of hours');

  if (args.has('--wait-for-key')) {
    const until = Date.now() + 20 * 60 * 1000;
    while (!(await keyIsLive())) {
      if (Date.now() > until) throw new Error(`${KEY_LOCATION} is still not live after 20 minutes.`);
      console.log(`Waiting for ${KEY_LOCATION} to be live (the new deploy)…`);
      await sleep(20000);
    }
  } else if (!(await keyIsLive())) {
    throw new Error(`${KEY_LOCATION} doesn't answer with the key, so search engines would refuse the list.`);
  }

  const sitemap = await fetch(`${SITE}/sitemap.xml`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!sitemap.ok) throw new Error(`sitemap.xml answered ${sitemap.status}`);
  const pages = parseSitemap(await sitemap.text());
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const urls = pick(pages, { all: args.has('--all'), since });
  console.log(`${pages.length} pages in the sitemap; ${urls.length} to send${args.has('--all') ? ' (all)' : ` (changed since ${since.toISOString()})`}.`);
  for (const url of urls) console.log(`  ${url}`);
  if (!urls.length || args.has('--dry-run')) return;

  for (let i = 0; i < urls.length; i += BATCH) {
    const list = urls.slice(i, i + BATCH);
    const answer = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body(list)),
    });
    const text = (await answer.text()).slice(0, 300);
    // 200: received. 202: received, the key is still being checked.
    if (answer.status !== 200 && answer.status !== 202) {
      throw new Error(`IndexNow answered ${answer.status} for ${list.length} pages: ${text || '(no message)'}`);
    }
    console.log(`IndexNow answered ${answer.status} for ${list.length} pages.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`IndexNow: ${error.message}`);
    process.exit(1);
  });
}
