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
  Menu,
  Package,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import ScrollWorldExperience from './ScrollWorldExperience';
import { PLANS } from './landingData';
import './landing.css';
import './phase1b.css';

const LOGO_URL = 'https://assets.apptelier.sg/sellio/Logo_Sellio.png';
const ASSISTANT_URL = 'https://assets.apptelier.sg/sellio/Logo_AISellio_Assistant.png';
const DEMO_STORE_URL = '/store/cafetelier?preview=true';

const NAV_ITEMS = [
  { label: 'How it flows', href: '#journey' },
  { label: 'Product', href: '#product' },
  { label: 'Sellio World', href: '#world' },
  { label: 'Vision', href: '#vision' },
  { label: 'Pricing', href: '#pricing' },
];

function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sellio-landing-header">
      <div className="sellio-container sellio-landing-header__inner">
        <a href="/" className="sellio-landing-logo" aria-label="Sellio home"><img src={LOGO_URL} alt="Sellio" /></a>
        <nav className="sellio-landing-nav" aria-label="Main navigation">{NAV_ITEMS.map((item) => <a key={item.label} href={item.href}>{item.label}</a>)}</nav>
        <div className="sellio-landing-header__actions">
          <a href="/Auth" className="sellio-login-link">Merchant Login</a>
          <a href="#pricing" className="sellio-button sellio-button--small sellio-button--gradient">Start Free Trial <ArrowRight /></a>
          <button type="button" className="sellio-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="sellio-mobile-nav">{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </div>
      {menuOpen && (
        <nav id="sellio-mobile-nav" className="sellio-mobile-nav" aria-label="Mobile navigation">
          {NAV_ITEMS.map((item) => <a key={item.label} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}<ChevronRight /></a>)}
          <a href="/Auth" onClick={() => setMenuOpen(false)}>Merchant Login<ChevronRight /></a>
          <a href="#pricing" className="sellio-button sellio-button--gradient" onClick={() => setMenuOpen(false)}>Start Free Trial</a>
        </nav>
      )}
    </header>
  );
}

function HeroVisual() {
  const reduceMotion = useReducedMotion();
  const drift = (delay = 0, distance = 8) => reduceMotion ? {} : { animate: { y: [0, -distance, 0] }, transition: { duration: 5.8 + delay, repeat: Infinity, ease: 'easeInOut', delay } };

  return (
    <div className="sellio-hero-visual" aria-label="Illustration of Sellio connecting a storefront, orders and business insights">
      <div className="sellio-hero-orbit sellio-hero-orbit--one" aria-hidden="true" /><div className="sellio-hero-orbit sellio-hero-orbit--two" aria-hidden="true" />
      <motion.div className="sellio-hero-order-card" {...drift(.2, 7)}>
        <div className="sellio-mini-card-head"><span className="is-pink"><Bell /></span><div><strong>New order</strong><small>Just now</small></div><i /></div>
        <div className="sellio-mini-order-row"><div className="is-orange"><Coffee /></div><span><strong>Signature Latte</strong><small>2 × $6.80</small></span></div>
        <div className="sellio-mini-success"><Check /> Sent to kitchen</div>
      </motion.div>
      <motion.div className="sellio-hero-insight-card" {...drift(.7, 10)}>
        <div><span>Today’s sales</span><TrendingUp /></div><strong>$1,842.60</strong><small>+18.4% from yesterday</small>
        <div className="sellio-mini-bars">{[42,58,50,76,64,88,100].map((height,index) => <i key={index} style={{ height }} />)}</div>
      </motion.div>
      <motion.div className="sellio-hero-phone" {...drift(0, 5)}>
        <div className="sellio-hero-phone__top"><span /><span /></div>
        <div className="sellio-hero-phone__brand"><div><small>Welcome to</small><strong>Cafetelier</strong></div><ShoppingBag /></div>
        <div className="sellio-hero-phone__banner"><span>Freshly made</span><strong>Brunch favourites</strong><small>Order in a few taps</small></div>
        <div className="sellio-hero-phone__chips"><span>Popular</span><span>Coffee</span><span>Pastries</span></div>
        <div className="sellio-hero-phone__products"><div><i className="is-orange"><Coffee /></i><strong>Latte</strong><small>$6.80</small></div><div><i className="is-pink"><Sparkles /></i><strong>Croissant</strong><small>$7.20</small></div></div>
        <div className="sellio-hero-phone__cart"><span>2 items</span><strong>View order</strong></div>
      </motion.div>
      <motion.div className="sellio-hero-core" {...drift(.35, 6)}><div className="sellio-hero-core__glow" /><div className="sellio-hero-core__disc"><img src={ASSISTANT_URL} alt="" /></div><span>Sellio AI</span></motion.div>
      <div className="sellio-hero-connection sellio-hero-connection--one" aria-hidden="true" /><div className="sellio-hero-connection sellio-hero-connection--two" aria-hidden="true" /><div className="sellio-hero-floor" aria-hidden="true" />
    </div>
  );
}

function PricingSection() {
  const [annual, setAnnual] = useState(false);
  return (
    <section id="pricing" className="sellio-section sellio-pricing-section sellio-pricing-section--phase1b" aria-labelledby="sellio-pricing-heading">
      <div className="sellio-container">
        <div className="sellio-section-heading sellio-section-heading--center"><span className="sellio-eyebrow"><CircleDollarSign /> Start with operations</span><h2 id="sellio-pricing-heading">Your storefront today.<br />Your place in Sellio World tomorrow.</h2><p>Begin with Sellio’s current F&B platform. Marketplace placement and gamification will extend the same merchant account in future releases.</p></div>
        <div className="sellio-billing-toggle" role="group" aria-label="Billing period"><button type="button" className={!annual ? 'is-active' : ''} onClick={() => setAnnual(false)}>Monthly</button><button type="button" className={annual ? 'is-active' : ''} onClick={() => setAnnual(true)}>Annual <span>2 months free</span></button></div>
        <div className="sellio-pricing-grid">
          {PLANS.map((plan) => {
            const amount = annual ? plan.yearly : plan.monthly;
            const href = annual ? plan.links.annual : plan.links.monthly;
            return (
              <article key={plan.key} className={'sellio-pricing-card ' + (plan.badge ? 'is-featured' : '')} style={{ '--plan-accent': plan.accent }}>
                {plan.badge && <span className="sellio-plan-badge">{plan.badge}</span>}
                <div className="sellio-pricing-card__top"><h3>{plan.name}</h3><p>{plan.description}</p></div>
                <div className="sellio-plan-price"><small>SGD</small><strong>{amount}</strong><span>/{annual ? 'year' : 'month'}</span></div>
                {annual && <p className="sellio-plan-saving">Save SGD {plan.monthly * 12 - plan.yearly} annually</p>}
                <ul>{plan.features.map((feature) => <li key={feature}><Check /> {feature}</li>)}</ul>
                <a href={href} target="_blank" rel="noopener noreferrer" className="sellio-button sellio-button--plan">Start Free Trial <ArrowUpRight /></a>
              </article>
            );
          })}
        </div>
        <p className="sellio-pricing-note">Eligible new merchants receive a three-day trial. Prices exclude applicable taxes. Future marketplace and gamification terms will be introduced separately.</p>
      </div>
    </section>
  );
}

function FAQSection() {
  const items = [
    { question: 'Is Sellio Marketplace already live?', answer: 'Not yet. Phase 1B establishes the customer journey, sector-zone architecture and storefront zoom experience. The existing F&B storefront and merchant operations remain the live product foundation.' },
    { question: 'Must Sellio wait for many merchants before building the world?', answer: 'No. Sellio World can be developed with dedicated F&B, Retail and Services zones from the beginning. New merchants can then be allocated to the appropriate zone as they join.' },
    { question: 'What happens when a customer selects a merchant?', answer: 'The intended experience moves from the world map into the merchant’s neighbourhood, then zooms into its branded storefront. Customers can return to the same map position after browsing.' },
    { question: 'Will every storefront look identical?', answer: 'No. Sellio provides the structure, but merchants retain their own colours, products, content and decorative choices.' },
    { question: 'Are Sellio Coins and decorations available now?', answer: 'Not yet. They are being designed as a progression layer alongside the marketplace so merchants can later earn and use cosmetic rewards without changing today’s subscription or payment behaviour.' },
    { question: 'Can customers order without a marketplace account?', answer: 'Yes. The current merchant storefront allows customers to browse and order without requiring a shared marketplace identity.' },
  ];
  return (
    <section className="sellio-section sellio-faq-section" aria-labelledby="sellio-faq-heading"><div className="sellio-container sellio-faq-layout"><div className="sellio-section-heading"><span className="sellio-eyebrow"><ShieldCheck /> Clear from the start</span><h2 id="sellio-faq-heading">The current product and the world ahead.</h2><p>Phase 1B shows how both fit together without presenting roadmap concepts as already released.</p></div><div className="sellio-faq-list">{items.map((item) => <details key={item.question}><summary>{item.question}<span>+</span></summary><p>{item.answer}</p></details>)}</div></div></section>
  );
}

function Footer() {
  return (
    <footer className="sellio-landing-footer">
      <div className="sellio-container">
        <section className="sl-ready-shell" aria-labelledby="sl-ready-heading">
          <div className="sl-ready-copy">
            <img className="sl-ready-logo" src={LOGO_URL} alt="Sellio" />
            <span className="sellio-eyebrow"><Sparkles /> Ready when you are</span>
            <h2 id="sl-ready-heading">Open your storefront.<br />Take your place in the world.</h2>
            <p>Start with Sellio’s F&B platform today, then grow into the connected marketplace experience as Sellio World expands.</p>
            <div className="sl-ready-actions">
              <a href="#pricing" className="sellio-button sellio-button--gradient">View Plans <ArrowRight /></a>
              <a href="/Auth" className="sellio-button sellio-button--ready-ghost">Merchant Login</a>
            </div>
            <div className="sl-ready-proof">
              <span><Check /> Three-day free trial</span>
              <span><Clock3 /> Set up at your pace</span>
            </div>
          </div>

          <div className="sl-ready-visual">
            <div className="sl-pan-scroll sl-pan-scroll--ready" tabIndex="0" aria-label="Swipe horizontally to explore the Sellio storefront scene">
              <div className="sl-pan-canvas sl-pan-canvas--ready">
                <img src="/assets/immersive/ready-world.webp" alt="A bright premium merchant storefront connected to the expanding Sellio marketplace world" />
              </div>
            </div>
            <div className="sl-ready-visual__badge"><Store /><span><small>Your next step</small><strong>A storefront built to grow</strong></span></div>
            <div className="sl-pan-hint sl-pan-hint--ready">Swipe the scene <ArrowRight /></div>
          </div>
        </section>

        <div className="sellio-footer-main"><div className="sellio-footer-brand"><img src={LOGO_URL} alt="Sellio" /><p>Online ordering, business operations and a marketplace world—designed to grow together.</p><span>Sellio, crafted by <a href="https://apptelier.sg" target="_blank" rel="noopener noreferrer">Apptélier</a>.</span></div><div className="sellio-footer-links"><div><strong>Explore</strong><a href="#journey">How it flows</a><a href="#product">Product</a><a href="#world">Sellio World</a></div><div><strong>Merchants</strong><a href="#pricing">Pricing</a><a href="/Auth">Merchant Login</a><a href={DEMO_STORE_URL} target="_blank" rel="noopener noreferrer">Demo Store</a></div><div><strong>Support</strong><a href="https://apptelier.sg" target="_blank" rel="noopener noreferrer">Apptélier Helpdesk</a><a href="mailto:hello@apptelier.sg">Contact</a></div></div></div>
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
    document.title = 'Sellio — Storefronts, Operations & Marketplace for Modern Commerce';
    description?.setAttribute('content', 'Sellio connects branded storefronts, F&B ordering and merchant operations with an evolving sector-based marketplace world.');
    return () => { document.title = previousTitle; if (description && previousDescription) description.setAttribute('content', previousDescription); };
  }, []);

  return (
    <div className="sellio-landing sellio-landing--phase1b sellio-landing--scrollworld">
      <a className="sellio-skip-link" href="#sellio-main">Skip to content</a><LandingHeader />
      <main id="sellio-main">
        <ScrollWorldExperience />
        <section className="sellio-proof-strip" aria-label="Sellio capabilities"><div className="sellio-container"><span><Store /> Online storefront</span><span><QrCode /> QR ordering</span><span><Bell /> Live orders</span><span><Package /> Inventory</span><span><BarChart3 /> Reports</span><span><Users /> Staff roles</span></div></section>
        <PricingSection />
        <FAQSection />
      </main>
      <Footer />
    </div>
  );
}
