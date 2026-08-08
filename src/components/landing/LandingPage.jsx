import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  Menu,
  Package,
  QrCode,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  X,
} from 'lucide-react';
import HeroWorldTransition from './HeroWorldTransition';
import CommerceJourney from './CommerceJourney';
import ConnectedCommerce from './ConnectedCommerce';
import ProductShowcase from './ProductShowcase';
import WorldLayers from './WorldLayers';
import ChapterTransition from './ChapterTransition';
import { PLANS } from './landingData';
import './landing.css';
import './phase1b.css';
import './immersive.css';
import './mobile-pan.css';
import './immersive-fullbleed.css';
import './mobile-native.css';
import './ux-corrections.css';
import './motion-refinement.css';

const LOGO_URL = 'https://assets.apptelier.sg/sellio/Logo_Sellio.png';
const DEMO_STORE_URL = '/store/cafetelier?preview=true';

const NAV_ITEMS = [
  { label: 'Sellio World', href: '#world' },
  { label: 'How it flows', href: '#journey' },
  { label: 'Product', href: '#product' },
  { label: 'Vision', href: '#vision' },
  { label: 'Pricing', href: '#pricing' },
];

const SNAP_PAGE_SELECTORS = ['#sellio-film', '#world-experience', '#journey', '#connected', '#product'];

function useImmersiveReleaseSnap() {
  useEffect(() => {
    const touchLayout = window.matchMedia('(max-width: 900px), (hover: none) and (pointer: coarse)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!touchLayout.matches || reducedMotion.matches) return undefined;

    let points = [];
    let snapFrame;
    let settleTimer;
    let wheelTimer;
    let snapping = false;
    let pending = null;
    let wheelOrigin = null;
    let wheelDelta = 0;
    let touchStart = null;

    const absoluteTop = (node) => window.scrollY + node.getBoundingClientRect().top;

    const measure = () => {
      points = SNAP_PAGE_SELECTORS
        .map((selector) => document.querySelector(selector))
        .filter(Boolean)
        .map((node) => absoluteTop(node));
    };

    const nearestIndex = (y) => {
      if (!points.length) return -1;
      let best = 0;
      let bestDistance = Math.abs(y - points[0]);
      for (let index = 1; index < points.length; index += 1) {
        const distance = Math.abs(y - points[index]);
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      }
      return best;
    };

    const cancelSnap = () => {
      if (snapFrame) window.cancelAnimationFrame(snapFrame);
      snapFrame = undefined;
      snapping = false;
    };

    const animateTo = (targetY) => {
      cancelSnap();
      const startY = window.scrollY;
      const distance = targetY - startY;
      if (Math.abs(distance) < 2) return;

      snapping = true;
      const startedAt = performance.now();
      const duration = Math.min(650, Math.max(430, Math.abs(distance) * .52));

      const step = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress < .5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        window.scrollTo(0, startY + distance * eased);

        if (progress < 1) {
          snapFrame = window.requestAnimationFrame(step);
        } else {
          snapFrame = undefined;
          snapping = false;
        }
      };

      snapFrame = window.requestAnimationFrame(step);
    };

    const settle = () => {
      window.clearTimeout(settleTimer);
      if (!pending || snapping) return;
      measure();
      if (points.length !== SNAP_PAGE_SELECTORS.length) {
        pending = null;
        return;
      }

      const { direction, originIndex, originY } = pending;
      pending = null;
      if (originIndex < 0 || Math.abs(originY - points[originIndex]) > window.innerHeight * .92) return;

      let targetIndex = originIndex;
      if (direction > 0 && originIndex < points.length - 1) {
        targetIndex = originIndex + 1;
      } else if (direction < 0 && originIndex > 0) {
        // Returning from the normal-scrolling content below Merchant Workspace
        // settles on Workspace first instead of skipping straight to Connected Commerce.
        if (originIndex === points.length - 1 && originY > points[originIndex] + window.innerHeight * .15) {
          targetIndex = originIndex;
        } else {
          targetIndex = originIndex - 1;
        }
      } else {
        // Downward scrolling from Merchant Workspace intentionally becomes normal page scrolling.
        return;
      }

      animateTo(points[targetIndex]);
    };

    const scheduleSettle = (delay = 115) => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, delay);
    };

    const onScroll = () => {
      if (pending && !snapping) scheduleSettle(115);
    };

    const onTouchStart = (event) => {
      if (!event.touches?.length) return;
      cancelSnap();
      window.clearTimeout(settleTimer);
      measure();
      touchStart = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        scrollY: window.scrollY,
        originIndex: nearestIndex(window.scrollY),
      };
      pending = null;
    };

    const onTouchEnd = (event) => {
      if (!touchStart) return;
      const touch = event.changedTouches?.[0];
      const deltaX = touch ? touchStart.x - touch.clientX : 0;
      const deltaY = touch ? touchStart.y - touch.clientY : window.scrollY - touchStart.scrollY;
      const scrollDelta = window.scrollY - touchStart.scrollY;
      const verticalTravel = Math.abs(deltaY) > Math.abs(scrollDelta) ? deltaY : scrollDelta;

      if (Math.abs(verticalTravel) > 12 && Math.abs(verticalTravel) > Math.abs(deltaX) * .8) {
        pending = {
          direction: verticalTravel > 0 ? 1 : -1,
          originIndex: touchStart.originIndex,
          originY: touchStart.scrollY,
        };
        scheduleSettle(125);
      }
      touchStart = null;
    };

    const finishWheelGesture = () => {
      if (!wheelOrigin || Math.abs(wheelDelta) < 4) {
        wheelOrigin = null;
        wheelDelta = 0;
        return;
      }
      pending = {
        direction: wheelDelta > 0 ? 1 : -1,
        originIndex: wheelOrigin.originIndex,
        originY: wheelOrigin.scrollY,
      };
      wheelOrigin = null;
      wheelDelta = 0;
      scheduleSettle(115);
    };

    const onWheel = (event) => {
      cancelSnap();
      measure();
      if (!wheelOrigin) {
        wheelOrigin = { scrollY: window.scrollY, originIndex: nearestIndex(window.scrollY) };
        wheelDelta = 0;
      }
      wheelDelta += event.deltaY;
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(finishWheelGesture, 95);
    };

    const onResize = () => measure();

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(wheelTimer);
      cancelSnap();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    };
  }, []);
}

function LandingHeader() {
  const headerRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame;
    const update = () => {
      const world = document.getElementById('world-experience');
      const film = document.getElementById('sellio-film');
      const worldTop = world ? window.scrollY + world.getBoundingClientRect().top : null;
      const revealAt = worldTop !== null
        ? worldTop - 2
        : film ? window.scrollY + film.getBoundingClientRect().bottom - 2 : Number.POSITIVE_INFINITY;
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

  useEffect(() => {
    const header = headerRef.current;
    const landing = header?.closest('.sellio-landing');
    if (!header || !landing) return undefined;

    const measure = () => {
      landing.style.setProperty('--sellio-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(header);
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      landing.style.removeProperty('--sellio-header-height');
    };
  }, []);

  return (
    <header ref={headerRef} className={'sellio-landing-header ' + (visible ? 'is-visible' : '')} aria-hidden={!visible}>
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
                <a href={href} target="_blank" rel="noopener noreferrer" className="sellio-button sellio-button--plan"><span className="sellio-plan-cta-long">Start Free Trial</span><span className="sellio-plan-cta-short" aria-hidden="true">Start</span><ArrowUpRight /></a>
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
        <HeroWorldTransition />
        <section className="sellio-proof-strip sellio-proof-strip--after-world" aria-label="Sellio capabilities"><div className="sellio-container"><span><Store /> Online storefront</span><span><QrCode /> QR ordering</span><span><Bell /> Live orders</span><span><Package /> Inventory</span><span><BarChart3 /> Reports</span><span><Users /> Staff roles</span></div></section>
        <ChapterTransition className="sl-chapter-transition--journey" label="Order journey chapter"><CommerceJourney /></ChapterTransition>
        <ChapterTransition className="sl-chapter-transition--connected" label="Connected commerce chapter"><ConnectedCommerce /></ChapterTransition>
        <ChapterTransition className="sl-chapter-transition--workspace" label="Merchant workspace chapter"><ProductShowcase /></ChapterTransition>
        <ChapterTransition className="sl-chapter-transition--progression" label="Marketplace progression chapter"><WorldLayers /></ChapterTransition>
        <ChapterTransition className="sl-chapter-transition--pricing" label="Pricing chapter"><PricingSection /></ChapterTransition>
        <ChapterTransition className="sl-chapter-transition--faq" label="Frequently asked questions"><FAQSection /></ChapterTransition>
      </main>
      <ChapterTransition className="sl-chapter-transition--footer" label="Sellio footer"><Footer /></ChapterTransition>
    </div>
  );
}
