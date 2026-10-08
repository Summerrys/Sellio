import React from 'react';
import { renderToString } from 'react-dom/server';
import LandingPage from '@/components/landing/LandingPage';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';

export const PRERENDER_ROUTES = ['/', '/privacy', '/terms'];

const IMAGE = 'https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png';
const ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

const ROUTES = {
  '/': {
    Component: LandingPage,
    title: 'Sellio — Storefronts, Operations & Marketplace for Modern Commerce',
    description: 'Sellio connects branded storefronts, F&B ordering and merchant operations with an evolving sector-based marketplace world.',
    socialDescription: 'Open your storefront, run daily operations and grow into a sector-based marketplace world with Sellio.',
    canonical: 'https://sellio.apptelier.sg/',
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

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${ROBOTS}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:url" content="${canonical}" />`,
    '<meta property="og:site_name" content="Sellio" />',
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${socialDescription}" />`,
    `<meta property="og:image" content="${IMAGE}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${socialDescription}" />`,
    `<meta name="twitter:image" content="${IMAGE}" />`,
  ].join('\n');
}

export function renderRoute(path) {
  const route = ROUTES[path];
  if (!route) throw new Error(`Unsupported prerender route: ${path}`);
  const html = renderToString(<route.Component />);
  return { html, head: headFor(route) };
}
