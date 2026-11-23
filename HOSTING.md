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
| `/store/<shop>` | the storefront (`store.html`), with the shop written in (**Pages written at the edge** below); 404 if there's no such shop |
| `/explore`, `/listing/<item>` | Explore and an item's page (`explore.html`), written in the same way; 404 for an item that isn't listed |
| `/store/<shop>/`, `/listing/<item>/`, `/explore/` | a permanent redirect (301) to the same address without the last `/` |
| `/sitemap.xml` | every public page, shop and item, from the database (the fixed file if it can't be reached) |
| `/llms.txt` | the file, with the shops on Explore added |
| any other address (`/Auth`, `/Orders`, `/explore/…`, `/order/<shop>/<table>`…) | the app (`app.html`) |
| files: `/assets/…`, `/icons/…`, `/branding/…`, `/og/…`, `/.well-known/assetlinks.json`, `/sw.js`, `/manifest.json`, `/robots.txt`, IndexNow's key file | the file, or a 404 page if it isn't there |

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
   It must be a **Pages** project, not a Worker. Cloudflare's Create screen leads with Workers,
   and a Worker made from this repository would ignore `_worker.js` and `_routes.json`, so
   `/Auth` and the other app addresses wouldn't load.
2. Set up builds:
   - Project name: `sellio`. The site is then also at `<project>.pages.dev`, shown at the top
     of the project. Another Cloudflare account already has `sellio.pages.dev`, so Cloudflare
     added a few letters: Sellio's project is at **`sellio-f1t.pages.dev`**.
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: leave empty
   - Environment variables: none needed. Node 22 comes from `.nvmrc`, and the Supabase address
     and public key are in the code.
3. **Save and Deploy**. The first build takes a few minutes. Its log ends with
   `Cloudflare Pages: _worker.js routes the pages; _redirects and .htaccess are left out.`
4. Try it at `https://sellio-f1t.pages.dev` (or run **Actions → Website check**, which tries
   every row of the table above there and on sellio.sg):
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
    **Set up a domain** → `sellio.sg`, and Cloudflare makes the record. Do the same for
    `www.sellio.sg` (the worker sends it on to sellio.sg). Let this screen make the DNS records:
    a record typed in by hand that points at a `pages.dev` address answers Cloudflare's
    error 1014 or 522 until the domain is added here, and 1014 for good if that `pages.dev`
    address is another account's project.
  - If its DNS is elsewhere: first add sellio.sg to Cloudflare (**Add a domain**). Cloudflare
    copies the existing records; check that the email (MX) records came across. Then change the
    nameservers at the domain's registrar to the two Cloudflare gives you, and once Cloudflare
    says the domain is active, add it as a custom domain as above. Also add `www.sellio.sg` if
    people use it.
- **sellio.apptelier.sg**: in the Pages project, **Custom domains** → `sellio.apptelier.sg`.
  Then, wherever apptelier.sg's DNS is, make (or change) the `sellio` record a CNAME to
  `sellio-f1t.pages.dev`.

Nothing else changes with the move. Sign-in (Supabase and Google), Stripe's return pages,
emailed links and the Android app's links keep working. After the move, open
`https://sellio.sg/.well-known/assetlinks.json` once to check it.

## sellio.sg is the address search engines list

Since 6 Nov 2026 the worker moves every page on sellio.apptelier.sg and on
sellio-f1t.pages.dev permanently (301) to the same page on sellio.sg, query included. Old links,
bookmarks and QR codes land on the right page, and search engines swap the old address for
sellio.sg. For sellio.apptelier.sg this needs that address to point at the Pages project
(**Moving the domains** above): on 6 Nov 2026 its DNS still pointed at Base44, which served the
old app there (the landing page at every address, open to search engines). Not moved:

- files (`_routes.json`): Pages serves them on every address as they are;
- preview deployments (`<id>.sellio-f1t.pages.dev`).

Keep the move for at least 180 days, as Google asks. Every public page names its sellio.sg
address as canonical in the HTML (the start page, `/privacy` and `/terms` from the prerender;
storefronts, items and Explore from the worker), and `/sitemap.xml` lists them.

In Google Search Console (same Google account for both):

1. Add `sellio.sg` as a **Domain** property and verify it (a TXT record in Cloudflare's DNS).
2. Under **Sitemaps**, submit `https://sellio.sg/sitemap.xml`.
3. Add `https://sellio.apptelier.sg/` as a **URL prefix** property and verify it. Not the
   `apptelier.sg` Domain property: a change of address there would move Apptelier's own site.
4. In the sellio.apptelier.sg property: **Settings** → **Change of address** → sellio.sg.
5. **URL inspection** → `https://sellio.sg/` → **Request indexing**.

## Pages written at the edge (search engines and AI tools)

Storefronts, items and Explore are drawn by the app in the visitor's browser. Search engines'
and AI tools' crawlers mostly don't run it, so until 23 Nov 2026 they found an empty page at
each of those addresses: no heading, no text, no links, no canonical. Ahrefs' Site Audit scored
the site 29 for it (every shop and item page an orphan and a dead end; "machine readability" 0).
Since then `_worker.js` writes each one as the page is asked for:

- **In the head:** the page's own title, description, canonical address, robots rule, Open Graph
  and Twitter tags, and schema.org structured data (JSON-LD): a storefront is a `CollectionPage`
  about the shop (`FoodEstablishment`, `Store` or `LocalBusiness` when it has a street address,
  else `OnlineStore`) with its items as an `ItemList` of offers; an item is an `ItemPage` with a
  `Product` and its `Offer` (price, currency, in stock or not, the shop as seller); Explore is a
  `CollectionPage` with the shops and the latest items as `ItemList`s. Every page has its
  breadcrumbs and names Sellio's `WebSite` and `Organization`, which the start page describes in
  full (`src/components/landing/landingSchema.js`).
- **In the page:** a block before the app's root with the page's one H1, its text (the shop's
  location, prices, hours, how it sells, rating; an item's price, photos, description, options)
  and links: shop → its items and other shops, item → its shop and more of its items, Explore →
  every shop and the latest items. Browsers never show it: `index.html` hides it before it is
  drawn and `src/main.jsx` removes it, then the app draws the page.
- **Kept out of search results:** a shop that isn't taking orders, one with no items yet (the
  sitemap leaves it out too, until it has some), previews and staff orders (`?preview=true`,
  `?staff=true`); a shop or item that isn't there answers 404.
- **Never written:** phone numbers, payment details, sellers' notes or collection addresses. Only
  what the storefront and Explore show anyone already, read with the public key.
- **Fast:** what is read is kept per Cloudflare location for 10 minutes, then still answered
  with (for up to a day) while it is read again behind the answer. A shop or item that isn't
  there is asked about again after a minute.
- **If the database can't be reached** (and nothing is kept): the page goes out as before, with
  its own address as canonical. The response header `X-Sellio-Edge` says `written` or `fallback`.
- **The app and the written head:** the head tags carry `data-sellio-edge`. While the visitor is
  on that page the app leaves them as they are (`hasEdgeHead`, `src/lib/pageMeta.js`); once the
  visitor moves on in the app they go (`App.jsx` RouteIndexingGuard) and each page sets its own.
- **Shells:** `scripts/prerender-routes.mjs` makes `store.html` and `explore.html` with
  `<!-- SELLIO_EDGE_HEAD -->` markers around the title, where the head is written;
  `scripts/check-prerender.mjs` checks they're there.
- **Tests:** `verification/edge-pages.test.mjs` (the worker, with stand-ins);
  `verification/edge-pages.browser.mjs` (the built site through the worker in Chrome, with the
  app taking over).
- **Checking the live site:** **Actions → SEO check** crawls sellio.sg as Ahrefs does
  (`scripts/seo-audit.mjs`) and fails on what Ahrefs counts as errors.
- **Limits:** Explore lists at most 50 shops (`explore_shops`). Past that, the shops beyond 50
  are still in the sitemap but need another page linking them (a shop directory, say).

## Telling search engines what changed (IndexNow)

**Actions → IndexNow** (`scripts/indexnow.mjs`) sends the pages whose sitemap date changed in the
last 7 hours, every 6 hours, to IndexNow, which passes them to Bing (whose index ChatGPT search
and Copilot draw on), Yandex, Naver, Seznam and Yep. Run it by hand with **all** after a change
to every page. The key is `public/1f3882ad422aa7f69880e733ef9d710f.txt`: public by design,
search engines check it there. In Bing Webmaster Tools (bing.com/webmasters), **Import** the site
from Google Search Console to see what Bing has.

## Live updates for the apps

Every build also publishes the web files Sellio's Android and iPhone apps carry, so the apps can
take web-only changes without a store release (`scripts/app-update.mjs`,
`src/lib/liveUpdates.js`):

- `https://sellio.sg/app-updates/manifest.json`: the newest version, its address, size and
  checksum, and per platform a hash of the app's native code (`native`).
- `https://sellio.sg/app-updates/<version>.zip`: those files.

An installed app checks a few seconds after it starts, when it comes back after a few hours, and
on pull to refresh. It downloads a newer version in the background and uses it from the next
start, or straight away from **Update available → Reload**. It takes a version only when the
manifest's `native` hash for its platform matches its own: a change to native code (plugins,
`capacitor.config.json`, the Android or iOS project files) waits for the store build. A version
that doesn't get its first screen up within 15 seconds is undone by the app itself, and that
phone never downloads it again.

- **Checking:** open the manifest. Its `version` is the one apps move to. In a debug build the
  app logs each step with `Sellio update:` (Android Studio's Logcat, or Safari's Web
  Inspector for the iPhone app).
- **Going back:** rolling back the Pages deployment also moves the apps back: the older
  version becomes the newest one in the manifest.
- **iPhone:** Apple's rule 2.5.2 bars downloaded code that adds or changes features, and Apple
  restated in October 2026 that an app may not add features after review that the reviewed
  version didn't have. Use live updates on iPhone for fixes and small changes, and send new
  features through App Store review. Google Play allows web code in a web view to update this
  way.
- **Testing a debug build:** opening `https://sellio.sg/Auth?sellio_update_manifest=<address>`
  in the app makes a debug build use another manifest (https, or plain http on localhost);
  an empty value goes back to sellio.sg. Release builds ignore it. The Android emulator check
  (`.github/scripts/android-emulator-check.sh`, step 7) tests a good and a broken update this
  way on every build.

## Browser alerts

The website can send Sellio's alerts (new orders, chat messages, order updates) to browsers that
allow them, even with the Sellio tab closed: `src/lib/webPush.js` registers the browser,
`supabase/functions/send-push` sends through Firebase Cloud Messaging, and `public/sw.js` shows
them. It needs two settings in Cloudflare Pages (**Settings → Variables and Secrets**,
Production), both from the same Firebase project as the Android app:

- `FIREBASE_WEB_CONFIG`: Firebase console → **Project settings → General → Your apps → Web
  app** (add one, e.g. "Sellio website", without Hosting) → **SDK setup and configuration →
  Config**: paste the whole `firebaseConfig` block.
- `FIREBASE_WEB_PUSH_KEY`: **Project settings → Cloud Messaging → Web configuration → Web Push
  certificates → Generate key pair**: the public key it shows.

Both are public by design (every visitor's browser gets them). Settings take effect from the next
build: retry the latest deployment, or push a commit. The build writes them to
`/web-push.json` (`scripts/web-push-config.mjs`; it logs `Browser alerts: on (Firebase project
…)`, and stops with what's wrong when a value is). Without them, no browser is offered alerts. The
apps never carry that file. Firebase's web SDK also needs the **FCM Registration API** on in the
project's Google Cloud console (APIs & Services); a browser that can't get a token logs `Sellio
browser alerts: no token from Firebase` in its console.

- **Who gets them:** a browser is offered alerts after its person sends a chat message, places an
  order, or (a shop's people) opens their workspace; the account panel and an empty notifications
  list have **Turn on browser alerts** too. iPhones and iPads get them only for Sellio added to
  the Home Screen (iOS 16.4 and later): Apple gives Safari tabs none.
- **No doubles:** while the person is on Sellio (a chat's "Online"), their browsers get nothing:
  the page they have open shows the alert. Every push a browser gets is shown, because Safari
  stops a site's alerts after three it doesn't show.

## Limits on Cloudflare's free plan

- Page requests run the worker. The free plan has 100,000 worker runs a day. Files (scripts,
  pictures and the rest) don't count. If Sellio ever gets near that, Workers Paid ($5 a month)
  raises it to 10 million a month.
- A storefront written at the edge reads the database at most every 10 minutes per Cloudflare
  location, with up to 9 reads at once; the free plan allows 50 per run.
- Each file can be at most 25 MiB, and a site can have up to 20,000 files. Sellio's build is
  about 200 files, the largest a few MB (the apps' update zip). The landing page's videos are
  on assets.apptelier.sg.

## Trying it on a computer

```
CF_PAGES=1 npm run build
npx wrangler@4.151.3 pages dev dist
```

Then open http://localhost:8788. This is Cloudflare's own local copy of Pages: it serves the site
as Pages would. Storefronts, items and Explore read Sellio's database from there. To use a
stand-in on your computer instead, add `--binding SELLIO_SUPABASE_URL=http://127.0.0.1:<port>`
(the worker accepts only a local address there), then crawl it as a search engine would:
`node scripts/seo-audit.mjs http://127.0.0.1:8788`. Delete the `.wrangler/` folder it leaves.
