# Sellio

**Your business, beautifully online.**

Sellio is a place to sell in Singapore, Malaysia and Indonesia. Home-based sellers open a
free shop and list what they make. Businesses run their counter, kitchen and online orders in
one place. Shoppers find all of them on Sellio Explore.

[sellio.sg](https://sellio.sg) ·
[Android app on Google Play](https://play.google.com/store/apps/details?id=com.base6985959ce9aaceadb8b7cc41.app) ·
[sellio@apptelier.sg](mailto:sellio@apptelier.sg)

## Who Sellio is for

### Home-based sellers: free

Bake, cook or make things at home? Open a Sellio shop for free and start selling to people
nearby.

- Your own shop page, with your logo and colours, and a link to share anywhere.
- Up to 10 listings and 100 orders a month. No card needed.
- Buyers pay you directly with your own payment QR: PayNow, DuitNow or QRIS.
- Self-collection, delivery, or both, with your own delivery fee.
- Your listings go on Sellio Explore straight away, under **Home sellers**.
- Buyers can chat with you about a listing before they order.

[Guide: sell from home for free →](docs/guides/home-sellers.md)

### Businesses: F&B, retail and services

Everything a small shop or restaurant needs to take orders, in person and online.

- A POS counter, QR ordering at your tables, and a branded online storefront.
- A kitchen display, kitchen chits and receipts on Bluetooth thermal printers.
- Staff logins with roles, inventory and reports.
- Sellio AI tools, like turning a photo of your menu into products.
- New-order alerts with sound, and push alerts in the Android app.
- New businesses start with a 7-day free trial.

[Guide: run your business on Sellio →](docs/guides/merchants.md)

### Shoppers

- Browse Sellio Explore and any shop's page without an account.
- Order for self-collection or delivery, or scan the QR code at a table to order there.
- Chat with sellers, like listings, follow your orders in **My purchases** and rate the shop.

[Guide: shop on Sellio →](docs/guides/shoppers.md)

## Get seen without spending on marketing

New sellers don't need an advertising budget to be found.

- **Sellio Explore.** A public feed of items from Sellio shops that anyone can browse, no
  account needed. Every shop is listed by default, home sellers and businesses alike, and
  shoppers can filter by **Food & drinks**, **Goods**, **Home sellers** or **Merchants**.
- **Google.** Every public shop page and listing is in Sellio's sitemap, so search engines
  can find and list them.
- **Your own link and QR codes.** Share your shop and your listings on WhatsApp, Telegram,
  Facebook or anywhere else, and put QR codes on your tables, packaging or flyers.
- **Ratings.** Buyers rate the shop from 1 to 5 stars after ordering, and a shop's rating
  shows on its listings.
- **Sellio World (coming soon).** An island map of Sellio's shops to walk around, with a
  Pop-up Street for home sellers and districts for F&B, retail and services.

## Built for Singapore, Malaysia and Indonesia

A shop's country sets its currency, payment QR, phone number format, time zone and tax, so
nothing assumes you're in Singapore.

| | Singapore | Malaysia | Indonesia |
| --- | --- | --- | --- |
| Currency | S$ (SGD) | RM (MYR) | Rp (IDR) |
| Payment QR | PayNow | DuitNow | QRIS |
| Tax preset | GST 9% | SST 6% | None by default; PBJT 10% or PPN 11% in one tap |
| Time zone | Singapore time | Malaysia time | WIB, WITA or WIT |
| Plan prices | SGD | SGD (same as Singapore) | Lower prices, paid by card in Rupiah |

The shop owner's app can be switched between **English, 中文, Bahasa Melayu and Bahasa
Indonesia**.

## Plans

| Plan | Price a month (Singapore and Malaysia) | Indonesia | What you get |
| --- | --- | --- | --- |
| **Sell from home** | Free | Free | Your shop page, up to 10 listings, 100 orders a month |
| **Starter** | S$39 | S$18 | 10 products, 100 orders a month, 3 staff, 5 tables, POS, QR ordering, kitchen display, printing, Sellio AI tools |
| **Growth** | S$79 | S$35 | 50 products, 1,000 orders a month, 5 staff, advanced reports, custom roles |
| **Professional** | S$119 | S$56 | Unlimited products, orders, staff and tables, custom real-time reports, priority support |

- Paying yearly costs 10 months' price: you get 2 months free.
- Indonesian owners are charged in Rupiah by card. Stripe converts at the day's rate and adds a
  2–4% conversion fee. Prices are before PPN.
- A free shop can move up to a business plan at any time and keeps its link, listings and
  orders. Its first business plan comes with the 7-day free trial.
- In Singapore and Malaysia, an optional done-for-you setup, S$149 once: menu scan, storefront
  build, printer setup and on-site staff training.
- More than one outlet? [Talk to us on WhatsApp](https://wa.me/6582228103).

## Get the app

- **Android:** [Sellio on Google Play](https://play.google.com/store/apps/details?id=com.base6985959ce9aaceadb8b7cc41.app).
- **iPhone:** the app is coming. Meanwhile, use [sellio.sg](https://sellio.sg) in Safari;
  you can add it to your Home Screen.
- **Computer:** [sellio.sg](https://sellio.sg) in any browser.

## Help

- Email [sellio@apptelier.sg](mailto:sellio@apptelier.sg).
- WhatsApp [+65 8222 8103](https://wa.me/6582228103) for sales, setup and multi-outlet
  questions.

---

## For developers

### The stack

- **Web app:** React 18 and Vite 6, with Tailwind. One codebase serves the website, the
  storefronts and the apps.
- **Backend:** Supabase: Postgres with row-level security, Auth, Storage, Realtime, and the
  edge functions in `supabase/functions/`.
- **Payments:** Stripe Payment Links for plans; `stripe-webhook` attaches a plan to its shop.
- **Apps:** Capacitor 8 builds for Android and iPhone, made by GitHub Actions. Their web code
  updates itself from sellio.sg between store releases (live updates).
- **Website hosting:** Cloudflare Pages, deployed from every push to `main`. See
  [HOSTING.md](HOSTING.md).

### Run it locally

You need Node 22 (see `.nvmrc`).

```bash
npm install
npm run dev
```

The app talks to Sellio's Supabase project. `.env` holds its URL and public anon key; both
are public by design (the anon key only gets what row-level security allows). Never put a
secret in this repository: it is public, so treat everything in it, history included, as
public. Secrets live in GitHub and Supabase secrets.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Checks every phrase has its translations, builds the site, prerenders the public pages, and writes `dist/` (website), `dist-app/` (the apps' copy) and the live update in `dist/app-updates/` |
| `npm run build:app` | `build`, then `npx cap sync` into `android/` and `ios/` |
| `npm run lint` | ESLint. Older files have known errors, so lint the files you changed. |

### Where things are

| Folder | What's in it |
| --- | --- |
| `src/pages/` | One file per screen (`pages.config.js` names them) |
| `src/components/` | Screens' parts, grouped by area (explore, storefront, orders, …) |
| `src/lib/` | Shared logic: Supabase client, plans, money, countries, translations, the apps' native code |
| `src/locales/` | Translations: `zh`, `ms`, `id` |
| `supabase/` | Database migrations, edge functions and email templates |
| `android/`, `ios/` | The Capacitor apps |
| `scripts/` | Build steps: prerendering, the apps' copy, live updates, the translation check |
| `public/` | Static files, plus Cloudflare Pages' `_worker.js`, `_routes.json` and `_headers` |
| `verification/` | Tests |

### Tests

The tests run with Node from the repository and load their tools from outside it:

```bash
npm install --prefix /tmp/sellio-verification --no-save --ignore-scripts jsdom@26.1.0 @electric-sql/pglite@0.3.16 playwright
node verification/<file> /tmp/sellio-verification
```

- `*.test.mjs` and `*.dom.mjs` run in Node (jsdom for screens).
- `*.browser.mjs` drive Chromium as a phone through Playwright.
- `*.sql` are database checks written to roll back when they finish.

### Builds and checks on GitHub

- **`android.yml`**, on every push to `main`: the signed Android App Bundle and APK, a check
  of the APK, and an emulator run that opens the app and tests Back, sign-in links, alerts,
  pull to refresh and live updates.
- **`ios.yml`**, run by hand: a simulator build of the iPhone app.
- **`site-check.yml`**, run by hand: asks the live website every address in HOSTING.md.
- **`account-deletion-check.yml`**, run by hand: an end-to-end check of account deletion.

The Android app keeps the package name `com.base6985959ce9aaceadb8b7cc41.app` and the launcher
name `com.wix.MainActivity` from its first build, so Google Play updates the same listing and
icons people already placed keep working. Don't change either.
