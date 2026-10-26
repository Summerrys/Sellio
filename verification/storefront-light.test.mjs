// A store without a saved design looks the same in Design Store and on the live store
// (home shops: Grid; businesses: Split), and Sellio stays light whatever the phone's
// appearance setting. Run after `npm run build`: node verification/storefront-light.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { storefrontLayout, DEFAULT_BANNER_COLOR } from '../src/lib/storefrontDefaults.js';

let passes = 0;
const passed = name => { passes++; console.log('PASS ' + name); };
const read = file => readFile(file, 'utf8');

try {
  assert.equal(storefrontLayout(null, true), 'grid');
  assert.equal(storefrontLayout(undefined, false), 'split');
  assert.equal(storefrontLayout({ product_layout: null }, true), 'grid');
  assert.equal(storefrontLayout({}, false), 'split');
  assert.equal(storefrontLayout({ product_layout: 'split' }, true), 'split');
  assert.equal(storefrontLayout({ product_layout: 'list' }, false), 'list');
  passed('No saved layout: home shop -> Grid, business -> Split; a saved layout always wins');

  const designer = await read('src/components/storefront/StorefrontDesigner.jsx');
  assert.match(designer, /select\('name, logo_url, currency, address, settings, seller_type'\)/);
  assert.match(designer, /product_layout: storefrontLayout\(saved, isShopTenant\(tenantRes\.data\)\)/);
  assert.match(designer, /banner_bg_color: saved\.banner_bg_color \|\| tenantPrimaryColor \|\| DEFAULT_BANNER_COLOR/);
  const view = await read('src/components/storefront/StorefrontView.jsx');
  assert.match(view, /const productLayout = storefrontLayout\(storefrontConfig, homeShop\);/);
  assert.match(view, new RegExp(`\\|\\| '${DEFAULT_BANNER_COLOR}'`), 'live banner falls back to the same colour');
  const live = await read('src/pages/Storefront.jsx');
  assert.match(live, /homeShop=\{!!shopSelling\}/);
  passed('Design Store and the live store use the same defaults (layout and banner colour)');

  const provider = await read('src/components/theme/ThemeProvider.jsx');
  assert.doesNotMatch(provider, /prefers-color-scheme/);
  assert.doesNotMatch(provider, /classList\.(toggle|add)\(['"]dark/);
  const sources = [];
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(full);
      else if (/\.(jsx?|tsx?)$/.test(entry.name)) sources.push(full);
    }
  };
  await walk('src');
  for (const file of sources) {
    assert.doesNotMatch(await read(file), /classList\.(toggle|add)\(\s*['"]dark['"]/, `${file} turns on dark mode`);
  }
  const css = await read('src/index.css');
  assert.match(css, /html \{ color-scheme: only light; \}/);
  assert.doesNotMatch(css, /\.dark \[data-sellio-workspace\]/);
  assert.match(await read('index.html'), /<meta name="color-scheme" content="only light" \/>/);
  passed('Nothing switches the app to dark; pages, fields and scrollbars are declared light-only');

  const bell = await read('src/components/notifications/NotificationBell.jsx');
  assert.match(bell, /className="relative min-h-\[44px\] min-w-\[44px\] text-slate-700"/);
  passed('The bell has its own colour, like the icons beside it');

  const built = await read('dist/index.html').catch(() => null);
  if (built) {
    assert.match(built, /<meta name="color-scheme" content="only light"/);
    const cssFiles = (await readdir('dist/assets')).filter(f => f.endsWith('.css'));
    const builtCss = (await Promise.all(cssFiles.map(f => read(`dist/assets/${f}`)))).join('\n');
    assert.match(builtCss, /color-scheme:\s*only light/);
    for (const page of ['privacy', 'terms']) assert.match(await read(`dist/${page}/index.html`), /<meta name="color-scheme" content="only light"/);
    passed('The built app (including the prerendered Privacy and Terms pages) carries the light-only setting');
  }

  console.log(`\n${passes} store-layout and light-appearance checks passed.`);
} catch (err) {
  console.error('FAIL', err);
  process.exitCode = 1;
}
