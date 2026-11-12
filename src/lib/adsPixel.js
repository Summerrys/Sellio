// ChatGPT ads (OpenAI Ads) on Sellio's website. The Pixel itself is index.html's
// #sellio-openai-pixel script, which decides where it runs (sellio.sg in a browser, on the public
// and sign-up pages, once the visitor has allowed cookies; never in the apps or on shops' pages)
// and defines window.oaiq only there. main.jsx starts this file, which:
// - starts the Pixel when a visitor presses Allow on the cookie bar, and stops it on Decline;
// - notes a free-trial checkout opened from the website (a trial Stripe link, lib/plans.js);
// - measures trial_started when that checkout comes back from Stripe.
//
// Stripe sends every new-business checkout back to /Auth?token={CHECKOUT_SESSION_ID}, the trial
// links and the no-trial ones alike (checked in Stripe, 12 Nov 2026), and Sellio sends a signed-in
// buyer on to /Account?token=…. So only a checkout this browser opened from a trial link within
// the last day counts as a trial (a Stripe checkout stays open for 24 hours). The checkout's id is
// the event_id: OpenAI keeps the first event per Pixel, event and event_id, so a page that loads
// again (or /Auth then /Account) counts once, and a server event sent later with the same id is
// matched to it. A shop's own trial (its plan window) ends on Stripe's page, so it isn't measured
// here. Tests: verification/openai-pixel.test.mjs and .browser.mjs.
import { BUSINESS_PLANS, INDONESIA_PLANS } from '@/lib/plans';
import { CONSENT_EVENT } from '@/lib/cookieConsent';

export const TRIAL_NOTE = 'sellio-ads-trial-checkout';
const NOTE_LIFE = 24 * 60 * 60 * 1000;
const CHECKOUT_ID = /^cs_(?:live|test)_[A-Za-z0-9]+$/;
// The sign-up trial links of every region (Indonesia's too, lib/plans.js).
const TRIAL_LINKS = new Set([...BUSINESS_PLANS, ...INDONESIA_PLANS].flatMap((plan) => [plan.links.monthly, plan.links.yearly]));

// The Pixel, where it runs on this page.
const pixelOn = (browser) => (typeof browser.oaiq === 'function' ? browser.oaiq : null);

// A trial checkout link, with or without the query Sellio adds (the locked email).
export function isTrialCheckoutLink(href) {
  try {
    const url = new URL(href);
    return TRIAL_LINKS.has(url.origin + url.pathname);
  } catch {
    return false;
  }
}

export function noteTrialCheckout(browser = window) {
  if (!pixelOn(browser)) return false;
  try {
    browser.localStorage.setItem(TRIAL_NOTE, JSON.stringify({ at: Date.now(), checkout: null }));
    return true;
  } catch {
    return false; // no storage: this trial can't be told from a paid plan, so it isn't measured
  }
}

export function measureTrialStarted(browser = window) {
  const oaiq = pixelOn(browser);
  if (!oaiq) return false;
  const path = browser.location.pathname.toLowerCase().replace(/\/+$/, '');
  if (path !== '/auth' && path !== '/account') return false;
  const checkout = new URLSearchParams(browser.location.search).get('token') || '';
  if (!CHECKOUT_ID.test(checkout)) return false;
  let note = null;
  try {
    note = JSON.parse(browser.localStorage.getItem(TRIAL_NOTE) || 'null');
  } catch {
    return false;
  }
  const age = note && Number.isFinite(note.at) ? Date.now() - note.at : -1;
  if (!(age >= 0 && age < NOTE_LIFE)) return false;
  if (note.checkout && note.checkout !== checkout) return false; // the note belongs to another checkout
  try {
    browser.localStorage.setItem(TRIAL_NOTE, JSON.stringify({ at: note.at, checkout }));
  } catch {
    // measured anyway; OpenAI keeps one per checkout
  }
  oaiq('measure', 'trial_started', { type: 'plan_enrollment' }, { event_id: checkout });
  return true;
}

export function startAdsMeasurement(browser = window) {
  // Only the website has the Pixel script (the apps' copy of the page leaves it out).
  if (typeof browser.__sellioOpenAIPixel !== 'function') return false;
  browser.addEventListener(CONSENT_EVENT, (event) => {
    if (event.detail?.analytics === true) browser.__sellioOpenAIPixel(true);
    else pixelOn(browser)?.('consent', false); // stops it and removes its cookies
  });
  const onLink = (event) => {
    const link = event.target?.closest?.('a[href]');
    if (link && isTrialCheckoutLink(link.href)) noteTrialCheckout(browser);
  };
  browser.document.addEventListener('click', onLink, true);
  browser.document.addEventListener('auxclick', onLink, true); // middle click: a new tab
  measureTrialStarted(browser);
  return true;
}
