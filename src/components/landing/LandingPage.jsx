import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Coffee,
  Gift,
  Menu,
  Package,
  Play,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import ProductShowcase from './ProductShowcase';
import SellioWorld from './SellioWorld';
import { FEATURES, HOW_IT_WORKS, PLANS, ROADMAP } from './landingData';
import './landing.css';

const LOGO_URL = 'https://assets.apptelier.sg/sellio/Logo_Sellio.png';
const ASSISTANT_URL = 'https://assets.apptelier.sg/sellio/Logo_AISellio_Assistant.png';
const DEMO_STORE_URL = '/store/cafetelier?preview=true';

const NAV_ITEMS = [
  { label: 'Features', href: '#features' },
  { label: 'Product', href: '#product' },
  { label: 'Sellio World', href: '#world' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Roadmap', href: '#roadmap' },
];

function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sellio-landing-header">
      <div className="sellio-container sellio-landing-header__inner">
        <a href="/" className="sellio-landing-logo" aria-label="Sellio home">
          <img src={LOGO_URL} alt="Sellio" />
        </a>

        <nav className="sellio-landing-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => <a key={item.label} href={item.href}>{item.label}</a>)}
        </nav>

        <div className="sellio-landing-header__actions">
          <a href="/Auth" className="sellio-login-link">Merchant Login</a>
          <a href="#pricing" className="sellio-button sellio-button--small sellio-button--gradient">
            Start Free Trial <ArrowRight aria-hidden="true" />
          </a>
          <button
            type="button"
            className="sellio-menu-button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="sellio-mobile-nav"
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav id="sellio-mobile-nav" className="sellio-mobile-nav" aria-label="Mobile navigation">
          {NAV_ITEMS.map((item) => (
            <a key={item.label} href={item.href} onClick={() => setMenuOpen(false)}>
              {item.label}<ChevronRight aria-hidden="true" />
            </a>
          ))}
          <a href="/Auth" onClick={() => setMenuOpen(false)}>Merchant Login<ChevronRight aria-hidden="true" /></a>
          <a href="#pricing" className="sellio-button sellio-button--gradient" onClick={() => setMenuOpen(false)}>
            Start Free Trial
          </a>
        </nav>
      )}
    </header>
  );
}

function HeroVisual() {
  const reduceMotion = useReducedMotion();
  const drift = (delay = 0, distance = 8) => reduceMotion ? {} : {
    animate: { y: [0, -distance, 0] },
    transition: { duration: 5.8 + delay, repeat: Infinity, ease: 'easeInOut', delay },
  };

  return (
    <div className="sellio-hero-visual" aria-label="Illustration of Sellio connecting a storefront, orders and business insights">
      <div className="sellio-hero-orbit sellio-hero-orbit--one" aria-hidden="true" />
      <div className="sellio-hero-orbit sellio-hero-orbit--two" aria-hidden="true" />

      <motion.div className="sellio-hero-order-card" {...drift(0.2, 7)}>
        <div className="sellio-mini-card-head">
          <span className="is-pink"><Bell aria-hidden="true" /></span>
          <div><strong>New order</strong><small>Just now</small></div>
          <i />
        </div>
        <div className="sellio-mini-order-row">
          <div className="is-orange"><Coffee aria-hidden="true" /></div>
          <span><strong>Signature Latte</strong><small>2 × $6.80</small></span>
        </div>
        <div className="sellio-mini-success"><Check aria-hidden="true" /> Sent to kitchen</div>
      </motion.div>

      <motion.div className="sellio-hero-insight-card" {...drift(0.7, 10)}>
        <div><span>Today’s sales</span><TrendingUp aria-hidden="true" /></div>
        <strong>$1,842.60</strong>
        <small>+18.4% from yesterday</small>
        <div className="sellio-mini-bars">{[42, 58, 50, 76, 64, 88, 100].map((height, index) => <i key={index} style={{ height }} />)}</div>
      </motion.div>

      <motion.div className="sellio-hero-phone" {...drift(0, 5)}>
        <div className="sellio-hero-phone__top"><span /><span /></div>
        <div className="sellio-hero-phone__brand">
          <div><small>Welcome to</small><strong>Cafetelier</strong></div>
          <ShoppingBag aria-hidden="true" />
        </div>
        <div className="sellio-hero-phone__banner">
          <span>Freshly made</span>
          <strong>Brunch favourites</strong>
          <small>Order in a few taps</small>
        </div>
        <div className="sellio-hero-phone__chips"><span>Popular</span><span>Coffee</span><span>Pastries</span></div>
        <div className="sellio-hero-phone__products">
          <div><i className="is-orange"><Coffee aria-hidden="true" /></i><strong>Latte</strong><small>$6.80</small></div>
          <div><i className="is-pink"><Sparkles aria-hidden="true" /></i><strong>Croissant</strong><small>$7.20</small></div>
        </div>
        <div className="sellio-hero-phone__cart"><span>2 items</span><strong>View order</strong></div>
      </motion.div>

      <motion.div className="sellio-hero-core" {...drift(0.35, 6)}>
        <div className="sellio-hero-core__glow" />
        <div className="sellio-hero-core__disc">
          <img src={ASSISTANT_URL} alt="" />
        </div>
        <span>Sellio AI</span>
      </motion.div>

      <div className="sellio-hero-connection sellio-hero-connection--one" aria-hidden="true" />
      <div className="sellio-hero-connection sellio-hero-connection--two" aria-hidden="true" />
      <div className="sellio-hero-floor" aria-hidden="true" />
    </div>
  );
}

function FeatureSection() {
  return (
    <section id="features" className="sellio-section sellio-features-section" aria-labelledby="sellio-features-heading">
      <div className="sellio-container">
        <div className="sellio-section-heading sellio-section-heading--center">
          <span className="sellio-eyebrow"><Zap aria-hidden="true" /> Built for real operations</span>
          <h2 id="sellio-features-heading">Everything you need to sell beautifully.</h2>
          <p>From the first product to the hundredth order, Sellio keeps the customer experience and daily operations connected.</p>
        </div>

        <div className="sellio-feature-grid">
          {FEATURES.map(({ title, description, Icon, tone }, index) => (
            <motion.article
              key={title}
              className={'sellio-feature-card is-' + tone}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45, delay: Math.min(index * 0.04, 0.24) }}
            >
              <span><Icon aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="sellio-section sellio-how-section" aria-labelledby="sellio-how-heading">
      <div className="sellio-container">
        <div className="sellio-section-heading">
          <span className="sellio-eyebrow"><QrCode aria-hidden="true" /> From setup to first order</span>
          <h2 id="sellio-how-heading">Start without a complicated rollout.</h2>
          <p>Sellio guides merchants from account creation to a working storefront and day-to-day operations.</p>
        </div>
        <ol className="sellio-steps">
          {HOW_IT_WORKS.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <div><h3>{step.title}</h3><p>{step.description}</p></div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function PricingSection() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="sellio-section sellio-pricing-section" aria-labelledby="sellio-pricing-heading">
      <div className="sellio-container">
        <div className="sellio-section-heading sellio-section-heading--center">
          <span className="sellio-eyebrow"><CircleDollarSign aria-hidden="true" /> Simple plans</span>
          <h2 id="sellio-pricing-heading">Choose the room your business needs.</h2>
          <p>Eligible new merchants receive a three-day trial. No charge until the trial ends.</p>
        </div>

        <div className="sellio-billing-toggle" role="group" aria-label="Billing period">
          <button type="button" className={!annual ? 'is-active' : ''} onClick={() => setAnnual(false)}>Monthly</button>
          <button type="button" className={annual ? 'is-active' : ''} onClick={() => setAnnual(true)}>Annual <span>2 months free</span></button>
        </div>

        <div className="sellio-pricing-grid">
          {PLANS.map((plan) => {
            const amount = annual ? plan.yearly : plan.monthly;
            const href = annual ? plan.links.annual : plan.links.monthly;
            return (
              <article key={plan.key} className={'sellio-pricing-card ' + (plan.badge ? 'is-featured' : '')} style={{ '--plan-accent': plan.accent }}>
                {plan.badge && <span className="sellio-plan-badge">{plan.badge}</span>}
                <div className="sellio-pricing-card__top">
                  <h3>{plan.name}</h3>
                  <p>{plan.description}</p>
                </div>
                <div className="sellio-plan-price">
                  <small>SGD</small><strong>{amount}</strong><span>/{annual ? 'year' : 'month'}</span>
                </div>
                {annual && <p className="sellio-plan-saving">Save SGD {plan.monthly * 12 - plan.yearly} annually</p>}
                <ul>
                  {plan.features.map((feature) => <li key={feature}><Check aria-hidden="true" /> {feature}</li>)}
                </ul>
                <a href={href} target="_blank" rel="noopener noreferrer" className="sellio-button sellio-button--plan">
                  Start Free Trial <ArrowUpRight aria-hidden="true" />
                </a>
              </article>
            );
          })}
        </div>
        <p className="sellio-pricing-note">Prices exclude applicable taxes. Trial eligibility and plan limits follow Sellio’s current subscription terms.</p>
      </div>
    </section>
  );
}

function RoadmapSection() {
  return (
    <section id="roadmap" className="sellio-section sellio-roadmap-section" aria-labelledby="sellio-roadmap-heading">
      <div className="sellio-container">
        <div className="sellio-roadmap-shell">
          <div className="sellio-roadmap-copy">
            <span className="sellio-eyebrow sellio-eyebrow--dark"><Gift aria-hidden="true" /> Future roadmap</span>
            <h2 id="sellio-roadmap-heading">Commerce can be useful—and still feel rewarding.</h2>
            <p>Once more merchants join Sellio, the platform can grow into a connected marketplace with optional game-like progression.</p>
            <div className="sellio-season-card">
              <div className="sellio-season-card__art"><Sparkles aria-hidden="true" /><Gift aria-hidden="true" /></div>
              <div><span>Seasonal preview</span><strong>Festive storefront decorations</strong><small>Chinese New Year · Christmas · Community events</small></div>
            </div>
          </div>
          <div className="sellio-roadmap-grid">
            {ROADMAP.map(({ title, description, Icon }) => (
              <article key={title}><span><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p><small>Future phase</small></article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const items = [
    {
      question: 'Is Sellio only for restaurants?',
      answer: 'Sellio is currently focused on F&B operations. Retail and other Sellio World districts are roadmap directions and are not presented as available yet.',
    },
    {
      question: 'Do customers need an account to place an order?',
      answer: 'No. Customers can currently browse and order through an individual merchant storefront without creating a shared marketplace account.',
    },
    {
      question: 'Can I use my own colours and branding?',
      answer: 'Yes. Merchants can customise their storefront theme and business profile from Sellio.',
    },
    {
      question: 'Does Sellio support QR table ordering?',
      answer: 'Yes. F&B merchants can create tables and generate QR codes that take customers directly into the correct ordering experience.',
    },
    {
      question: 'Are Sellio Coins and seasonal decorations available now?',
      answer: 'Not yet. They are shown as future roadmap concepts so the platform can be prepared for gamification without misrepresenting today’s product.',
    },
  ];

  return (
    <section className="sellio-section sellio-faq-section" aria-labelledby="sellio-faq-heading">
      <div className="sellio-container sellio-faq-layout">
        <div className="sellio-section-heading">
          <span className="sellio-eyebrow"><ShieldCheck aria-hidden="true" /> Clear from the start</span>
          <h2 id="sellio-faq-heading">Questions before you begin?</h2>
          <p>Start with Sellio’s current F&B capabilities, then grow with the platform as new districts are introduced.</p>
        </div>
        <div className="sellio-faq-list">
          {items.map((item) => (
            <details key={item.question}>
              <summary>{item.question}<span>+</span></summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="sellio-landing-footer">
      <div className="sellio-container">
        <div className="sellio-footer-cta">
          <div>
            <span className="sellio-eyebrow sellio-eyebrow--dark"><Sparkles aria-hidden="true" /> Ready when you are</span>
            <h2>Bring your business beautifully online.</h2>
            <p>Start your Sellio trial and build a storefront customers can order from.</p>
          </div>
          <div>
            <a href="#pricing" className="sellio-button sellio-button--light">View Plans <ArrowRight aria-hidden="true" /></a>
            <a href="/Auth" className="sellio-button sellio-button--ghost-light">Merchant Login</a>
          </div>
        </div>

        <div className="sellio-footer-main">
          <div className="sellio-footer-brand">
            <img src={LOGO_URL} alt="Sellio" />
            <p>Online ordering, POS and business operations—beautifully connected.</p>
            <span>Sellio, crafted by <a href="https://apptelier.sg" target="_blank" rel="noopener noreferrer">Apptélier</a>.</span>
          </div>
          <div className="sellio-footer-links">
            <div><strong>Explore</strong><a href="#features">Features</a><a href="#product">Product</a><a href="#world">Sellio World</a></div>
            <div><strong>Merchants</strong><a href="#pricing">Pricing</a><a href="/Auth">Merchant Login</a><a href={DEMO_STORE_URL} target="_blank" rel="noopener noreferrer">Demo Store</a></div>
            <div><strong>Support</strong><a href="https://apptelier.sg" target="_blank" rel="noopener noreferrer">Apptélier Helpdesk</a><a href="mailto:hello@apptelier.sg">Contact</a></div>
          </div>
        </div>
        <div className="sellio-footer-bottom"><span>© 2026 Sellio by Apptélier.</span><span>Singapore</span></div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector('meta[name="description"]');
    const previousDescription = description?.getAttribute('content');

    document.title = 'Sellio — Online Ordering, POS & Storefronts for F&B';
    description?.setAttribute('content', 'Sellio helps F&B businesses launch an online storefront, manage QR and table ordering, organise orders, track inventory and understand performance from one platform.');

    return () => {
      document.title = previousTitle;
      if (description && previousDescription) description.setAttribute('content', previousDescription);
    };
  }, []);

  return (
    <div className="sellio-landing">
      <a className="sellio-skip-link" href="#sellio-main">Skip to content</a>
      <LandingHeader />

      <main id="sellio-main">
        <section className="sellio-hero" aria-labelledby="sellio-hero-heading">
          <div className="sellio-hero-blob sellio-hero-blob--one" aria-hidden="true" />
          <div className="sellio-hero-blob sellio-hero-blob--two" aria-hidden="true" />
          <div className="sellio-container sellio-hero__grid">
            <div className="sellio-hero__copy">
              <span className="sellio-eyebrow"><span className="sellio-live-dot" /> Built for Singapore F&B</span>
              <h1 id="sellio-hero-heading">Your business,<br /><span>beautifully online.</span></h1>
              <p>Sell, manage orders and grow your storefront—from one simple platform built for the rhythm of everyday business.</p>
              <div className="sellio-hero__actions">
                <a href="#pricing" className="sellio-button sellio-button--gradient">Start Your 3-Day Free Trial <ArrowRight aria-hidden="true" /></a>
                <a href={DEMO_STORE_URL} target="_blank" rel="noopener noreferrer" className="sellio-button sellio-button--outline"><Play aria-hidden="true" /> Explore a Demo Store</a>
              </div>
              <div className="sellio-hero__trust">
                <span><Check aria-hidden="true" /> No charge until trial ends</span>
                <span><Clock3 aria-hidden="true" /> Set up at your own pace</span>
                <span><ShieldCheck aria-hidden="true" /> Merchant data stays private</span>
              </div>
            </div>
            <HeroVisual />
          </div>
        </section>

        <section className="sellio-proof-strip" aria-label="Sellio capabilities">
          <div className="sellio-container">
            <span><Store aria-hidden="true" /> Online storefront</span>
            <span><QrCode aria-hidden="true" /> QR ordering</span>
            <span><Bell aria-hidden="true" /> Live orders</span>
            <span><Package aria-hidden="true" /> Inventory</span>
            <span><BarChart3 aria-hidden="true" /> Reports</span>
            <span><Users aria-hidden="true" /> Staff roles</span>
          </div>
        </section>

        <FeatureSection />
        <ProductShowcase />
        <SellioWorld />
        <HowItWorks />
        <PricingSection />
        <RoadmapSection />
        <FAQSection />
      </main>

      <Footer />
    </div>
  );
}
