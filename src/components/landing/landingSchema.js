// Sellio's structured data (schema.org JSON-LD) on its start page: who Sellio is (the
// Organization every other page refers to by its @id), the website, the app with its plans, and
// the page's questions. LandingPage renders it into the page itself (StructuredData), so it is in
// the prerendered HTML that crawlers read without running scripts (src/entry-server.jsx) and is
// there once, never twice, once the app has taken over. public/_worker.js names the same
// Organization and WebSite (@id) on the storefront, item and Explore pages: keep them in step.
// Only what the page itself says goes in (Google's rule for structured data).
import { FAQ_ITEMS, PLANS } from './landingData';
import { SETUP_OFFER, sellioWhatsAppUrl } from '@/lib/plans';

export const SITE_URL = 'https://sellio.sg/';
export const LANDING_DESCRIPTION = 'Sellio connects branded storefronts, F&B ordering and merchant operations with an evolving sector-based marketplace world.';

const ORG_ID = `${SITE_URL}#organization`;
const WEBSITE_ID = `${SITE_URL}#website`;
// Sellio's Android app on Google Play (the listing kept from Base44's build).
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.base6985959ce9aaceadb8b7cc41.app';
const APPTELIER = { '@type': 'Organization', name: 'Apptelier', url: 'https://apptelier.sg/' };

export function landingSchemas() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': ORG_ID,
      name: 'Sellio',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}icons/sellio-pwa-512.png`, width: 512, height: 512 },
      image: `${SITE_URL}og/sellio-share.jpg`,
      description: LANDING_DESCRIPTION,
      slogan: 'Your business, beautifully online.',
      email: 'sellio@apptelier.sg',
      address: { '@type': 'PostalAddress', addressCountry: 'SG' },
      areaServed: ['Singapore', 'Malaysia', 'Indonesia'].map((name) => ({ '@type': 'Country', name })),
      contactPoint: [
        { '@type': 'ContactPoint', contactType: 'customer support', email: 'sellio@apptelier.sg' },
        { '@type': 'ContactPoint', contactType: 'sales', telephone: '+65-8222-8103', url: sellioWhatsAppUrl() },
      ],
      parentOrganization: APPTELIER,
      sameAs: [PLAY_STORE_URL],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: 'Sellio',
      url: SITE_URL,
      description: LANDING_DESCRIPTION,
      inLanguage: 'en-SG',
      publisher: { '@id': ORG_ID },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}#app`,
      name: 'Sellio',
      url: SITE_URL,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Android',
      description: LANDING_DESCRIPTION,
      // The Android app on Google Play is this same app.
      installUrl: PLAY_STORE_URL,
      sameAs: [PLAY_STORE_URL],
      offers: [
        ...PLANS.map((plan) => ({
          '@type': 'Offer',
          name: `${plan.name} plan`,
          price: String(plan.monthly),
          priceCurrency: 'SGD',
          url: plan.links.monthly,
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: String(plan.monthly),
            priceCurrency: 'SGD',
            billingDuration: 'P1M',
            unitText: 'month',
          },
        })),
        {
          '@type': 'Offer',
          name: 'Free personal shop',
          price: '0',
          priceCurrency: 'SGD',
          description: 'For selling from home: up to 10 listings and 100 orders a month.',
        },
        {
          '@type': 'Offer',
          name: 'Done-for-you setup',
          price: String(SETUP_OFFER.price),
          priceCurrency: 'SGD',
          description: `One-time: ${SETUP_OFFER.includes}.`,
        },
      ],
      publisher: { '@id': ORG_ID },
      creator: APPTELIER,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': `${SITE_URL}#faq`,
      mainEntity: FAQ_ITEMS.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  ];
}
