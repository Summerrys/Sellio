// Sellio business plans: the one place for prices, Stripe Payment Links and the
// feature copy shown on every pricing screen (landing page, sign-up modal,
// in-app plan picker and the trial-ended wall). Change plans here only.
//
// The limits themselves are enforced by the database (plan_entitlements) and the
// stripe-webhook edge function (PRICE_ID_TO_PLAN, PLAN_LIMITS). Keep this copy in
// step with those.

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
  includes: 'menu scan, storefront build, printer setup and on-site staff training',
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
      'Everything in Starter',
      '50 products',
      'Up to 1,000 orders/month',
      '5 staff accounts',
      'Advanced reports',
      'Custom editable roles',
      'Email and chat support',
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
      'Everything in Growth',
      'Unlimited products and orders',
      'Unlimited staff accounts',
      'Unlimited tables and QR codes',
      'Custom real-time reports',
      'Unlimited custom roles',
      'Priority support',
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

export const NO_TRIAL_LINKS = Object.fromEntries(BUSINESS_PLANS.map((plan) => [plan.key, plan.noTrialLinks]));
export const SHOP_LINKS = Object.fromEntries(BUSINESS_PLANS.map((plan) => [plan.key, plan.shopLinks]));
export const SHOP_TRIAL_LINKS = Object.fromEntries(BUSINESS_PLANS.map((plan) => [plan.key, plan.shopTrialLinks]));

// A shop's checkout for a plan from inside the shop. The shop's id goes to Stripe so the webhook
// attaches the plan to it; the owner's email starts Stripe's form (only the owner's payment is
// attached). trial: a free home shop that hasn't had its free trial.
export function shopCheckoutLink(planKey, { yearly = false, trial = false, tenantId = '', email = '' } = {}) {
  const set = (trial ? SHOP_TRIAL_LINKS : SHOP_LINKS)[planKey];
  if (!set) return '';
  const base = yearly ? set.yearly : set.monthly;
  const params = new URLSearchParams();
  if (tenantId) params.set('client_reference_id', tenantId);
  if (email) params.set('prefilled_email', email);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
