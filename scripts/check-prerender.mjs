import { access, readFile } from 'node:fs/promises';

const routes = {
  '/': ['Commerce has a place to grow.', 'https://sellio.apptelier.sg/'],
  '/privacy': ['Privacy Policy', 'https://sellio.apptelier.sg/privacy'],
  '/terms': ['Terms and Conditions', 'https://sellio.apptelier.sg/terms'],
};

const failures = [];

for (const [path, [signature, canonical]] of Object.entries(routes)) {
  const file = `dist${path === '/' ? '' : path}/index.html`;
  try {
    await access(file);
  } catch {
    failures.push(`${path}: prerendered HTML missing`);
    continue;
  }

  const html = await readFile(file, 'utf8');
  if (!html.includes('id="sellio-prerender" data-prerendered="true"')) failures.push(`${path}: prerender marker missing`);
  if (!html.includes('<div id="root"></div>')) failures.push(`${path}: SPA root should remain empty`);
  if (!html.includes(signature)) failures.push(`${path}: visible route content missing`);
  if (!html.includes(`rel="canonical" href="${canonical}"`) && !html.includes(`href="${canonical}" rel="canonical"`)) {
    failures.push(`${path}: canonical missing or incorrect`);
  }
  if (!/<h1[\s>]/i.test(html)) failures.push(`${path}: H1 missing`);
  if (!/<a[\s>]/i.test(html)) failures.push(`${path}: outgoing/internal links missing`);
  if (/name="robots"[^>]*content="[^"]*noindex/i.test(html)) failures.push(`${path}: public route is noindex`);
  if (!/<script[^>]+type="module"[^>]+src="\/assets\//i.test(html)) failures.push(`${path}: client bundle missing`);
}

const appShell = await readFile('dist/app.html', 'utf8');
if (!appShell.includes('<div id="root"></div>')) failures.push('app.html: SPA root should stay empty');
if (!/name="robots"[^>]*content="noindex, nofollow"/i.test(appShell)) failures.push('app.html: noindex missing');

const redirects = await readFile('dist/_redirects', 'utf8');
for (const line of ['/ /index.html 200', '/privacy /privacy/index.html 200', '/terms /terms/index.html 200', '/* /app.html 200']) {
  if (!redirects.includes(line)) failures.push(`_redirects: missing ${line}`);
}

if (failures.length) throw new Error('Sellio prerender validation failed:\n' + failures.join('\n'));
console.log('Sellio prerender validation passed for 3 public routes.');
