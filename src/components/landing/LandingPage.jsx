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
import CommerceJourney from './CommerceJourney';
import ConnectedCommerce from './ConnectedCommerce';
import ProductShowcase from './ProductShowcase';
import SellioWorld from './SellioWorld';
import WorldLayers from './WorldLayers';
import { PLANS } from './landingData';
import './landing.css';
import './phase1b.css';
import './immersive.css';
import './mobile-pan.css';
import './immersive-fullbleed.css';

const LOGO_URL = 'https://assets.apptelier.sg/sellio/Logo_Sellio.png';
const ASSISTANT_URL = 'https://assets.apptelier.sg/sellio/Logo_AISellio_Assistant.png';
const DEMO_STORE_URL = '/store/cafetelier?preview=true';

const NAV_ITEMS = [
  { label: 'Sellio World', href: '#world' },
  { label: 'How it flows', href: '#journey' },
  { label: 'Product', href: '#product' },
  { label: 'Vision', href: '#vision' },
  { label: 'Pricing', href: '#pricing' },
];

function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame;
    const update = () => {
      const film = document.getElementById('sellio-film');
      const revealAt = film ? film.offsetTop + film.offsetHeight - 2 : Number.POSITIVE_INFINITY;
      setVisible(window.scrollY >= revealAt);
    };
    const requestUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
    };
  }, []);

  useEffect(() => {
    if (!visible) setMenuOpen(false);
  }, [visible]);

  return (
    <header className={'sellio-landing-header ' + (visible ? 'is-visible' : '')} aria-hidden={!visible}>
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
        <div className="sellio-section-heading sellio-section-heading--center"><span className="sellio-eyebrow"><CircleDollarSign /> Start your next chapter</span><h2 id="sellio-pricing-heading">Launch your storefront.<br />Claim your place in Sellio World.</h2><p>Choose the operations plan that fits your business, enter the right merchant district and start building your presence in the connected marketplace.</p></div>
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
        <p className="sellio-pricing-note">Eligible new merchants receive a three-day trial. Prices exclude applicable taxes. Every active merchant can establish a presence in Sellio World.</p>
      </div>
    </section>
  );
}

function FAQSection() {
  const items = [
    { question: 'How does my business join Sellio World?', answer: 'Start a Sellio merchant plan and complete your storefront setup. Your business is then placed in the most relevant F&B, Retail or Services district so customers can discover it naturally.' },
    { question: 'What happens when a customer selects my storefront?', answer: 'Sellio moves the customer from the district view into your branded storefront, where they can browse products or services and complete the relevant ordering journey.' },
    { question: 'Can my storefront keep its own branding?', answer: 'Yes. Sellio supplies the connected world and commerce structure while your storefront keeps its own colours, products, imagery, content and decorative style.' },
    { question: 'How do Sellio Coins work?', answer: 'Merchants earn Sellio Coins through eligible marketplace activity and milestones. Coins can be used for cosmetic storefront upgrades, seasonal decorations and selected world customisations.' },
    { question: 'Are seasonal decorations available?', answer: 'Yes. Merchants can personalise their storefront for occasions such as Chinese New Year and Christmas while keeping the core shopping and ordering experience consistent.' },
    { question: 'Which merchant districts are available?', answer: 'Sellio World supports dedicated F&B, Retail and Services districts. Merchants are allocated according to their primary business category, with room for new districts as the marketplace grows.' },
    { question: 'Do customers need an account to browse?', answer: 'No. Customers can explore participating storefronts and browse available products or services without creating a marketplace account. Account features can be introduced only when they add useful continuity or rewards.' },
  ];
  return (
    <section className="sellio-section sellio-faq-section" aria-labelledby="sellio-faq-heading"><div className="sellio-container sellio-faq-layout"><div className="sellio-section-heading"><span className="sellio-eyebrow"><ShieldCheck /> Join with confidence</span><h2 id="sellio-faq-heading">Your business in Sellio World.</h2><p>How merchant placement, storefront identity, Sellio Coins and customer discovery work together.</p></div><div className="sellio-faq-list">{items.map((item) => <details key={item.question}><summary>{item.question}<span>+</span></summary><p>{item.answer}</p></details>)}</div></div></section>
  );
}

function Footer() {
  return (
    <footer className="sellio-landing-footer">
      <div className="sellio-container">
        <section className="sellio-footer-launch" aria-labelledby="sellio-footer-launch-heading">
          <div className="sellio-footer-launch__copy">
            <span className="sellio-eyebrow"><Sparkles /> Now onboarding merchants</span>
            <h2 id="sellio-footer-launch-heading">Build your storefront.<br />Enter Sellio World.</h2>
            <p>Bring your business online, join the right merchant district and create a storefront customers can discover, remember and return to.</p>
          </div>
          <div className="sellio-footer-launch__actions">
            <a href="#pricing" className="sellio-button sellio-button--gradient">View Plans <ArrowRight /></a>
            <a href="/Auth" className="sellio-button sellio-button--footer-ghost">Merchant Login</a>
          </div>
        </section>

        <div className="sellio-footer-main">
          <div className="sellio-footer-brand">
            <div className="sellio-footer-brand__top"><img src={LOGO_URL} alt="Sellio" /><span>Commerce, connected.</span></div>
            <h3>Your storefront today.<br />Your place in Sellio World.</h3>
            <p>Bring storefronts, orders, operations and merchant progression together in one bright, connected commerce platform.</p>
            <a className="sellio-footer-brand__credit" href="https://apptelier.sg" target="_blank" rel="noopener noreferrer">Crafted in Singapore by Apptélier <ArrowUpRight /></a>
            <div className="sellio-footer-live" aria-label="Sellio World availability"><span><i /> Sellio World live</span><span><i /> Onboarding open</span><span><i /> Sellio Coins active</span></div>
          </div>
          <div className="sellio-footer-navigation">
            <span className="sellio-footer-navigation__label">Explore the platform</span>
            <div className="sellio-footer-links">
              <div><strong>Explore</strong><a href="#journey">Order journey</a><a href="#product">Merchant workspace</a><a href="#world">Sellio World</a><a href="#vision">Coins & progression</a></div>
              <div><strong>Merchants</strong><a href="#pricing">Plans & pricing</a><a href="/Auth">Merchant Login</a><a href={DEMO_STORE_URL} target="_blank" rel="noopener noreferrer">Explore Demo Store</a></div>
              <div><strong>Support</strong><a href="https://apptelier.sg" target="_blank" rel="noopener noreferrer">Apptélier Helpdesk</a><a href="mailto:hello@apptelier.sg">Contact Sellio</a></div>
            </div>
          </div>
        </div>
        <div className="sellio-footer-bottom"><span>© 2026 Sellio by Apptélier.</span><span>Built in Singapore · Ready for the world</span></div>
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
        <SellioWorld />
        <CommerceJourney />
        <ConnectedCommerce />
        <ProductShowcase />
        <WorldLayers />
        <PricingSection />
        <FAQSection />
      </main>
      <Footer />
    </div>
  );
}
