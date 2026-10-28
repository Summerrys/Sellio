import React from 'react';
import { renderToString } from 'react-dom/server';
import LandingPage from '@/components/landing/LandingPage';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';

export const PRERENDER_ROUTES = ['/', '/privacy', '/terms'];

// Link-preview card (public/og/sellio-share.jpg): 1200x630 JPEG, about 50 KB. WhatsApp
// shows no image when the file is over 600 KB, so keep any replacement well under that
// (scripts/check-prerender.mjs checks the size).
const IMAGE = 'https://sellio.apptelier.sg/og/sellio-share.jpg';
const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;
const IMAGE_ALT = 'Sellio: your business, beautifully online.';
const ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

const ROUTES = {
  '/': {
    Component: LandingPage,
    title: 'Sellio — Storefronts, Operations & Marketplace for Modern Commerce',
    description: 'Sellio connects branded storefronts, F&B ordering and merchant operations with an evolving sector-based marketplace world.',
    socialDescription: 'Open your storefront, run daily operations and grow into a sector-based marketplace world with Sellio.',
    canonical: 'https://sellio.apptelier.sg/',
    // The host serves this page at every address (store pages, Explore, the app), so its
    // HTML must not name a canonical or og:url, or every page would claim to be the
    // homepage. LandingPage, Storefront and the legal pages set their own canonical
    // in the browser.
    servedAtEveryAddress: true,
  },
  '/privacy': {
    Component: Privacy,
    title: 'Privacy Policy | Sellio',
    description: "Read Sellio's Privacy Policy for merchants, staff and customers, including accounts, storefronts, orders, cookies, subscriptions and Singapore PDPA rights.",
    socialDescription: "Read Sellio's Privacy Policy for merchants, staff and customers, including accounts, storefronts, orders, cookies, subscriptions and Singapore PDPA rights.",
    canonical: 'https://sellio.apptelier.sg/privacy',
  },
  '/terms': {
    Component: Terms,
    title: 'Terms and Conditions | Sellio',
    description: "Read Sellio's Terms and Conditions for merchant accounts, storefront orders, Stripe subscriptions, AI features, Sellio Coins and platform use.",
    socialDescription: "Read Sellio's Terms and Conditions for merchant accounts, storefront orders, Stripe subscriptions, AI features, Sellio Coins and platform use.",
    canonical: 'https://sellio.apptelier.sg/terms',
  },
};

function escapeAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function headFor(route) {
  const title = escapeAttr(route.title);
  const description = escapeAttr(route.description);
  const socialDescription = escapeAttr(route.socialDescription);
  const canonical = escapeAttr(route.canonical);
  const ownAddress = !route.servedAtEveryAddress;
  const imageAlt = escapeAttr(IMAGE_ALT);

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${ROBOTS}" />`,
    ...(ownAddress ? [`<link rel="canonical" href="${canonical}" />`] : []),
    '<meta property="og:type" content="website" />',
    ...(ownAddress ? [`<meta property="og:url" content="${canonical}" />`] : []),
    '<meta property="og:site_name" content="Sellio" />',
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${socialDescription}" />`,
    `<meta property="og:image" content="${IMAGE}" />`,
    '<meta property="og:image:type" content="image/jpeg" />',
    `<meta property="og:image:width" content="${IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${IMAGE_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${imageAlt}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${socialDescription}" />`,
    `<meta name="twitter:image" content="${IMAGE}" />`,
    `<meta name="twitter:image:alt" content="${imageAlt}" />`,
  ].join('\n');
}

export function renderRoute(path) {
  const route = ROUTES[path];
  if (!route) throw new Error(`Unsupported prerender route: ${path}`);
  const html = renderToString(<route.Component />);
  return { html, head: headFor(route) };
}
