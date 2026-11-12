// Sellio business plans: the one place for prices, Stripe Payment Links and the
// feature copy shown on every pricing screen (landing page, sign-up modal,
// in-app plan picker and the trial-ended wall). Change plans here only.
//
// The limits themselves are enforced by the database (plan_entitlements) and the
// stripe-webhook edge function (PRICE_ID_TO_PLAN, PLAN_LIMITS). Keep this copy in
// step with those.

import { formatMoney } from './money';
import { N_ } from './appText';

// Sales and setup enquiries go to Sellio's WhatsApp.
export const SELLIO_WHATSAPP = '6582228103';

export function sellioWhatsAppUrl(text = '') {
  return `https://wa.me/${SELLIO_WHATSAPP}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export const MULTI_OUTLET_URL = sellioWhatsAppUrl('Hi, I run more than one outlet and would like to talk about Sellio.');

// Optional, booked over WhatsApp; Stripe link for the one-time payment is sent
// once the visit is scheduled.
export const SETUP_OFFER = {
  price: 149,
  includes: N_('menu scan, storefront build, printer setup and on-site staff training'),
  url: sellioWhatsAppUrl("Hi, I would like to book the Sellio done-for-you setup (SGD 149)."),
};

// October 2026 pricing. Four sets of Stripe Payment Links per plan:
// - links: a new business sign-up, with the 7-day free trial. After paying, Stripe sends them to
//   the sign-up page (sellio.sg/Auth?token=…) to set up the business.
// - noTrialLinks: the same without the trial (and back to the sign-up page), for links already
//   given to returning merchants.
// - shopLinks: a shop that exists choosing a plan from inside it (the plan window, the locked-shop
//   wall): no trial. Stripe's own page then says to go back to Sellio, where the plan shows; the
//   sign-up page would only confuse them (in the app, Stripe opens in the phone's browser, which
//   isn't signed in). stripe-webhook attaches the plan to the shop (client_reference_id).
// - shopTrialLinks: a free home shop's first business plan, with the 7-day free trial (one per
//   shop: Alvin, 9 Nov 2026). Otherwise as shopLinks.
export const BUSINESS_PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    monthly: 39,
    yearly: 390,
    features: [
      N_('10 products'),
      N_('Up to 100 orders/month'),
      N_('3 staff accounts'),
      N_('5 tables and QR codes'),
      N_('POS counter, QR ordering and storefront'),
      N_('Kitchen display and receipt printing'),
      N_('Basic reports'),
      N_('Sellio AI tools'),
    ],
    links: {
      monthly: 'https://buy.stripe.com/14A28t1Qd2or6i72t27bW0r',
      yearly: 'https://buy.stripe.com/9B6dRb1Qdgfh8qf7Nm7bW0s',
    },
    noTrialLinks: {
      monthly: 'https://buy.stripe.com/00w9AVfH30gj6i7d7G7bW0k',
      yearly: 'https://buy.stripe.com/cNicN7bqN5ADcGv4Ba7bW0l',
    },
    shopLinks: {
      monthly: 'https://buy.stripe.com/14A7sN1Qd2ordKzebK7bW0x',
      yearly: 'https://buy.stripe.com/6oU8wR3Yle799ujaZy7bW0y',
    },
    shopTrialLinks: {
      monthly: 'https://buy.stripe.com/3cI28t1Qd2orbCrebK7bW0D',
      yearly: 'https://buy.stripe.com/4gM28teCZ4wz5e33x67bW0E',
    },
  },
  {
    key: 'growth',
    name: 'Growth',
    monthly: 79,
    yearly: 790,
    features: [
      N_('Everything in Starter'),
      N_('50 products'),
      N_('Up to 1,000 orders/month'),
      N_('5 staff accounts'),
      N_('Advanced reports'),
      N_('Custom editable roles'),
      N_('Email and chat support'),
    ],
    links: {
      monthly: 'https://buy.stripe.com/6oU8wRgL77ILbCr7Nm7bW0t',
      yearly: 'https://buy.stripe.com/fZudRbgL7e79ayn5Fe7bW0u',
    },
    noTrialLinks: {
      monthly: 'https://buy.stripe.com/4gM14p2Uhe79fSH3x67bW0m',
      yearly: 'https://buy.stripe.com/7sY00lfH39QT49Z3x67bW0n',
    },
    shopLinks: {
      monthly: 'https://buy.stripe.com/28E00l2UhbZ18qf9Vu7bW0z',
      yearly: 'https://buy.stripe.com/7sYcN7dyVfbddKz9Vu7bW0A',
    },
    shopTrialLinks: {
      monthly: 'https://buy.stripe.com/fZufZj0M9e7921R7Nm7bW0F',
      yearly: 'https://buy.stripe.com/9B63cx1Qd0gj49Z6Ji7bW0G',
    },
  },
  {
    key: 'pro',
    name: 'Professional',
    monthly: 119,
    yearly: 1190,
    features: [
      N_('Everything in Growth'),
      N_('Unlimited products and orders'),
      N_('Unlimited staff accounts'),
      N_('Unlimited tables and QR codes'),
      N_('Custom real-time reports'),
      N_('Unlimited custom roles'),
      N_('Priority support'),
    ],
    links: {
      monthly: 'https://buy.stripe.com/dRm3cxeCZ0gj9uj9Vu7bW0v',
      yearly: 'https://buy.stripe.com/28EaEZ1QdaUXfSH2t27bW0w',
    },
    noTrialLinks: {
      monthly: 'https://buy.stripe.com/4gM4gBcuR5ADayn0kU7bW0o',
      yearly: 'https://buy.stripe.com/4gM14pbqN2or21RffO7bW0p',
    },
    shopLinks: {
      monthly: 'https://buy.stripe.com/fZu14p8eBe798qf5Fe7bW0B',
      yearly: 'https://buy.stripe.com/28E9AV52pe7949Z6Ji7bW0C',
    },
    shopTrialLinks: {
      monthly: 'https://buy.stripe.com/eVqbJ33Yl6EH7mbd7G7bW0H',
      yearly: 'https://buy.stripe.com/28EeVf0M9e7935Vc3C7bW0I',
    },
  },
];

// Indonesia (Alvin, 12 Nov 2026): lower prices on their own Stripe Payment Links, still in SGD:
// S$18, S$35 and S$56 a month, a year at 10 months' price. Stripe's Adaptive Pricing shows and
// charges Indonesian owners Rupiah (by card only, plus Stripe's 2–4% conversion fee) and pays
// Sellio SGD, so the referral programme counts these bills like any other. The same four link
// sets as above, each set up as its Singapore twin (checked in Stripe, 12 Nov 2026); the links
// and their prices are marked region: ID, and each price's metadata.plan is what stripe-webhook
// reads first, so they unlock the right plan.
const INDONESIA = {
  starter: {
    monthly: 18,
    yearly: 180,
    links: {
      monthly: 'https://buy.stripe.com/4gM00l8eB0gj5e32t27bW0J',
      yearly: 'https://buy.stripe.com/7sYdRbcuRd35dKz5Fe7bW0K',
    },
    noTrialLinks: {
      monthly: 'https://buy.stripe.com/4gM00lamJe795e32t27bW0P',
      yearly: 'https://buy.stripe.com/fZu28t8eB5ADgWL6Ji7bW0Q',
    },
    shopLinks: {
      monthly: 'https://buy.stripe.com/8x2eVfamJbZ149Z3x67bW0V',
      yearly: 'https://buy.stripe.com/eVq3cxamJ1kncGv2t27bW0W',
    },
    shopTrialLinks: {
      monthly: 'https://buy.stripe.com/28EfZj1Qd9QTayn7Nm7bW11',
      yearly: 'https://buy.stripe.com/cNi3cxdyV4wzgWLaZy7bW12',
    },
  },
  growth: {
    monthly: 35,
    yearly: 350,
    links: {
      monthly: 'https://buy.stripe.com/8x228t2Uh4wz35Vd7G7bW0L',
      yearly: 'https://buy.stripe.com/bJedRbfH30gjdKzgjS7bW0M',
    },
    noTrialLinks: {
      monthly: 'https://buy.stripe.com/eVq14p1Qde79dKzebK7bW0R',
      yearly: 'https://buy.stripe.com/dRmfZjbqN4wz7mbebK7bW0S',
    },
    shopLinks: {
      monthly: 'https://buy.stripe.com/dRmcN7gL75AD35Vd7G7bW0X',
      yearly: 'https://buy.stripe.com/aFa14p7ax6EH9uj0kU7bW0Y',
    },
    shopTrialLinks: {
      monthly: 'https://buy.stripe.com/8x2bJ3eCZ0gj49Z2t27bW13',
      yearly: 'https://buy.stripe.com/6oU7sNeCZfbdeODebK7bW14',
    },
  },
  pro: {
    monthly: 56,
    yearly: 560,
    links: {
      monthly: 'https://buy.stripe.com/9B65kFbqN3sv9ujd7G7bW0N',
      yearly: 'https://buy.stripe.com/28E14peCZ6EH8qfc3C7bW0O',
    },
    noTrialLinks: {
      monthly: 'https://buy.stripe.com/dRm7sNamJ7ILaynaZy7bW0T',
      yearly: 'https://buy.stripe.com/14A7sN3Yl3svcGvebK7bW0U',
    },
    shopLinks: {
      monthly: 'https://buy.stripe.com/5kQ8wR9iF9QT6i71oY7bW0Z',
      yearly: 'https://buy.stripe.com/6oU8wR8eB8MP0XNd7G7bW10',
    },
    shopTrialLinks: {
      monthly: 'https://buy.stripe.com/aFa8wR7ax3svcGvffO7bW15',
      yearly: 'https://buy.stripe.com/bJe14pfH3d35dKzc3C7bW16',
    },
  },
};

export const INDONESIA_PLANS = BUSINESS_PLANS.map((plan) => ({ ...plan, ...INDONESIA[plan.key] }));

// Which prices a shop or a visitor gets: 'ID' for Indonesia (the shop's country, or rupiah as its
// currency), else 'SG' (Singapore and Malaysia pay the same SGD prices).
export function planRegionFor(place) {
  return place?.country === 'Indonesia' || place?.currency === 'IDR' ? 'ID' : 'SG';
}

export function plansFor(region) {
  return region === 'ID' ? INDONESIA_PLANS : BUSINESS_PLANS;
}

// About what a price in SGD comes to in rupiah, to the nearest Rp1.000, for Indonesian owners.
// Stripe charges the rate of the day plus its fee, so this is a guide: Pluang's mid-market rate
// on 12 Nov 2026 (1 SGD = Rp14.162,84). Update it if the rate moves a lot.
export const SGD_TO_IDR = 14163;

export function approxRupiah(sgd) {
  return Math.round((Number(sgd) * SGD_TO_IDR) / 1000) * 1000;
}

// "about Rp255.000, charged in Rupiah" under an Indonesian price. A translated screen shows
// t(RUPIAH_NOTE, { amount: rupiahAmount(price) }); rupiahNote(price) is the English, for the
// landing page and screens not translated yet, so no sentence mixes two languages.
export const RUPIAH_NOTE = N_('about {amount}, charged in Rupiah');
export function rupiahAmount(sgd) {
  return formatMoney(approxRupiah(sgd), 'IDR');
}
export function rupiahNote(sgd) {
  return RUPIAH_NOTE.replace('{amount}', rupiahAmount(sgd));
}

// How Indonesian owners pay, under the plans.
export const INDONESIA_PAYMENT_NOTE = N_("Paid by card, in Rupiah: Stripe converts at the day's rate and adds a 2–4% conversion fee. Prices are before PPN (VAT).");

export const NO_TRIAL_LINKS = Object.fromEntries(BUSINESS_PLANS.map((plan) => [plan.key, plan.noTrialLinks]));
export const SHOP_LINKS = Object.fromEntries(BUSINESS_PLANS.map((plan) => [plan.key, plan.shopLinks]));
export const SHOP_TRIAL_LINKS = Object.fromEntries(BUSINESS_PLANS.map((plan) => [plan.key, plan.shopTrialLinks]));

// A shop's checkout for a plan from inside the shop. The shop's id goes to Stripe so the webhook
// attaches the plan to it; the owner's email starts Stripe's form (only the owner's payment is
// attached). trial: a free home shop that hasn't had its free trial. region: the shop's prices
// (planRegionFor).
export function shopCheckoutLink(planKey, { yearly = false, trial = false, tenantId = '', email = '', region = 'SG' } = {}) {
  const plan = plansFor(region).find((p) => p.key === planKey);
  const set = plan && (trial ? plan.shopTrialLinks : plan.shopLinks);
  if (!set) return '';
  const base = yearly ? set.yearly : set.monthly;
  const params = new URLSearchParams();
  if (tenantId) params.set('client_reference_id', tenantId);
  if (email) params.set('prefilled_email', email);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
