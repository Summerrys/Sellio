# Sellio's website on Cloudflare Pages

The website (sellio.sg) is ready to be hosted on Cloudflare Pages, built straight from this
repository: every push to `main` deploys, and every deploy is kept, so a bad one can be rolled
back in a click. The Android and iPhone apps aren't affected: they carry their own copy of the
site.

## How addresses are answered

| Address | Gets |
| --- | --- |
| `/` | the landing page (`index.html`, prerendered) |
| `/privacy`, `/terms` | their prerendered pages |
| `/Privacy`, `/privacy/`, `/Terms`, `/terms/`, `/index.html` | a permanent redirect (301) to `/privacy`, `/terms`, `/` |
| `/store/<shop>` | the storefront (`store.html`) |
| any other address (`/Auth`, `/Orders`, `/explore/…`, `/order/<shop>/<table>`…) | the app (`app.html`) |
| files: `/assets/…`, `/icons/…`, `/branding/…`, `/og/…`, `/.well-known/assetlinks.json`, `/sw.js`, `/manifest.json`, `/robots.txt`, `/sitemap.xml`, `/llms.txt` | the file, or a 404 page if it isn't there |

The files that do this, all in `public/` (so they're in the build, `dist/`):

- `_worker.js` routes the pages, as in the table. Pages runs it for page addresses only.
- `_routes.json` lists the files Pages serves itself, without the worker. Those requests are free
  and unlimited.
- `_headers`: the build's own scripts and styles (`/assets/<name>`, whose names change with every
  build) are kept by browsers for a year. Everything else is checked each time.
- `404.html` is shown for a missing file.

`public/_redirects` and `public/.htaccess` belong to earlier hosts and stay in the repository.
On Pages they would conflict: Pages follows a `_redirects` rule even where a file exists, so the
catch-all would answer every script with the app page. The build therefore leaves both out when
Cloudflare runs it (Cloudflare sets `CF_PAGES=1`; see `scripts/pages-output.mjs`).

## Setting it up (once)

1. In the Cloudflare dashboard: **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
   Give Cloudflare access to the `Summerrys/Sellio` repository and pick it.
2. Set up builds:
   - Project name: `sellio`. The site is then also at `sellio.pages.dev`.
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: leave empty
   - Environment variables: none needed. Node 22 comes from `.nvmrc`, and the Supabase address
     and public key are in the code.
3. **Save and Deploy**. The first build takes a few minutes. Its log ends with
   `Cloudflare Pages: _worker.js routes the pages; _redirects and .htaccess are left out.`
4. Try it at `https://sellio.pages.dev`:
   - `/` shows the landing page.
   - `/privacy` and `/terms` show their pages, and `/Privacy` lands on `/privacy`.
   - `/Auth` shows sign-in, and signing in works.
   - `/store/<a shop's link>` shows the shop.
   - `/.well-known/assetlinks.json` shows the Android app's details. The Android app needs this
     file on sellio.sg to open sign-in and invite links.

## Moving the domains

Keep the current host running until Cloudflare answers for the domains.

- **sellio.sg** is a root domain. Cloudflare Pages can only serve a root domain whose DNS is on
  Cloudflare.
  - If sellio.sg's DNS is already on Cloudflare: in the Pages project, open **Custom domains** →
    **Set up a domain** → `sellio.sg`, and Cloudflare makes the record.
  - If its DNS is elsewhere: first add sellio.sg to Cloudflare (**Add a domain**). Cloudflare
    copies the existing records; check that the email (MX) records came across. Then change the
    nameservers at the domain's registrar to the two Cloudflare gives you, and once Cloudflare
    says the domain is active, add it as a custom domain as above. Also add `www.sellio.sg` if
    people use it.
- **sellio.apptelier.sg**: in the Pages project, **Custom domains** → `sellio.apptelier.sg`.
  Then, wherever apptelier.sg's DNS is, make (or change) the `sellio` record a CNAME to
  `sellio.pages.dev`.

Nothing else changes with the move. The addresses stay the same, so sign-in (Supabase and
Google), Stripe's return pages, emailed links and the Android app's links keep working. After the
move, open `https://sellio.sg/.well-known/assetlinks.json` once to check it.

## Limits on Cloudflare's free plan

- Page requests run the worker. The free plan has 100,000 worker runs a day. Files (scripts,
  pictures and the rest) don't count. If Sellio ever gets near that, Workers Paid ($5 a month)
  raises it to 10 million a month.
- Each file can be at most 25 MiB, and a site can have up to 20,000 files. Sellio's build is
  about 200 files, the largest a few MB. The landing page's videos are on assets.apptelier.sg.

## Trying it on a computer

```
CF_PAGES=1 npm run build
npx wrangler@4.151.3 pages dev dist
```

Then open http://localhost:8788. This is Cloudflare's own local copy of Pages: it serves the site
as Pages would.
