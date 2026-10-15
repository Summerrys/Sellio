// Sellio business plans: the one place for prices, Stripe Payment Links and the
// feature copy shown on every pricing screen (landing page, sign-up modal,
// in-app plan picker and the trial-ended wall). Change plans here only.
//
// The limits themselves are enforced by the database (plan_entitlements) and the
// stripe-webhook edge function (PRICE_ID_TO_PLAN, PLAN_LIMITS). Keep this copy in
// step with those.

// Sales and setup enquiries go to Sellio's WhatsApp.
export const SELLIO_WHATSAPP = '6565805411';

export function sellioWhatsAppUrl(text = '') {
  return `https://wa.me/${SELLIO_WHATSAPP}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export const MULTI_OUTLET_URL = sellioWhatsAppUrl('Hi, I run more than one outlet and would like to talk about Sellio.');

// Optional, booked over WhatsApp; Stripe link for the one-time payment is sent
// once the visit is scheduled.
export const SETUP_OFFER = {
  price: 149,
  includes: 'menu scan, storefront build, printer setup and on-site staff training',
  url: sellioWhatsAppUrl("Hi, I'd like to book Sellio's done-for-you setup (SGD 149)."),
};

// October 2026 pricing. links = with the 7-day free trial; noTrialLinks = for
// returning merchants and anyone who has already used a trial.
export const BUSINESS_PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    monthly: 39,
    yearly: 390,
    features: [
      '10 products',
      'Up to 100 orders/month',
      '3 staff accounts',
      '5 tables and QR codes',
      'POS counter, QR ordering and storefront',
      'Kitchen display and receipt printing',
      'Basic reports',
      'Sellio AI tools',
    ],
    links: {
      monthly: 'https://buy.stripe.com/28EfZjeCZ6EH35V1oY7bW0e',
      yearly: 'https://buy.stripe.com/cNi00l1Qd4wzdKz4Ba7bW0f',
    },
    noTrialLinks: {
      monthly: 'https://buy.stripe.com/00w9AVfH30gj6i7d7G7bW0k',
      yearly: 'https://buy.stripe.com/cNicN7bqN5ADcGv4Ba7bW0l',
    },
  },
  {
    key: 'growth',
    name: 'Growth',
    monthly: 79,
    yearly: 790,
    features: [
      'Everything in Starter',
      '50 products',
      'Up to 1,000 orders/month',
      '5 staff accounts',
      'Advanced reports',
      'Custom editable roles',
      'Email and chat support',
    ],
    links: {
      monthly: 'https://buy.stripe.com/aFabJ3bqN4wz35V8Rq7bW0g',
      yearly: 'https://buy.stripe.com/4gMfZj52p1kn7mb8Rq7bW0h',
    },
    noTrialLinks: {
      monthly: 'https://buy.stripe.com/4gM14p2Uhe79fSH3x67bW0m',
      yearly: 'https://buy.stripe.com/7sY00lfH39QT49Z3x67bW0n',
    },
  },
  {
    key: 'pro',
    name: 'Professional',
    monthly: 119,
    yearly: 1190,
    features: [
      'Everything in Growth',
      'Unlimited products and orders',
      'Unlimited staff accounts',
      'Unlimited tables and QR codes',
      'Custom real-time reports',
      'Unlimited custom roles',
      'Priority support',
    ],
    links: {
      monthly: 'https://buy.stripe.com/4gM9AV7ax9QTdKz0kU7bW0i',
      yearly: 'https://buy.stripe.com/5kQ28tamJ6EHbCr9Vu7bW0j',
    },
    noTrialLinks: {
      monthly: 'https://buy.stripe.com/4gM4gBcuR5ADayn0kU7bW0o',
      yearly: 'https://buy.stripe.com/4gM14pbqN2or21RffO7bW0p',
    },
  },
];

export const NO_TRIAL_LINKS = Object.fromEntries(BUSINESS_PLANS.map((plan) => [plan.key, plan.noTrialLinks]));
