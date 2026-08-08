import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { PRODUCT_VIEWS } from './landingData';
import { SELLIO_IMMERSIVE_ASSETS, SELLIO_IMMERSIVE_MOBILE_ASSETS } from './immersiveAssets';
import './mobile-pan.css';

const CALLOUT_POSITIONS = [
  { x: '5%', y: '62%', mobileX: '48%', mobileY: '63%' },
  { x: '23%', y: '58%', mobileX: '48%', mobileY: '57%' },
  { x: '43%', y: '59%', mobileX: '48%', mobileY: '52%' },
  // Use the open left-side floor for the upper-right stages so their markers stay unobstructed.
  { x: '59%', y: '57%', mobileX: '4%', mobileY: '54%' },
  { x: '70%', y: '52%', mobileX: '4%', mobileY: '45%' },
];

export default function ProductShowcase() {
  const [activeKey, setActiveKey] = useState('storefront');
  const reduceMotion = useReducedMotion();
  const activeIndex = Math.max(0, PRODUCT_VIEWS.findIndex((view) => view.key === activeKey));
  const active = PRODUCT_VIEWS[activeIndex] || PRODUCT_VIEWS[0];
  const position = CALLOUT_POSITIONS[activeIndex] || CALLOUT_POSITIONS[0];
  const ActiveIcon = active.Icon;

  return (
    <section id="product" className="sellio-section sellio-product-section sl-workspace-section sl-cinematic-section sl-cinematic-workspace" aria-labelledby="sellio-product-heading">
      <div className="sellio-container">
        <div className="sl-workspace-shell">
          <div
            id="sellio-product-preview"
            className="sl-pan-scroll sl-pan-scroll--workspace"
            role="tabpanel"
            tabIndex="0"
            aria-label="Interactive connected Sellio workspace"
          >
            <div className="sl-pan-canvas sl-pan-canvas--workspace">
              <picture className="sl-responsive-art">
                <source media="(max-width: 600px)" srcSet={SELLIO_IMMERSIVE_MOBILE_ASSETS.workspace} />
                <img
                  src={SELLIO_IMMERSIVE_ASSETS.workspace}
                  alt="A bright dimensional Sellio workspace connecting storefront, orders, inventory, analytics and AI"
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <div className="sl-workspace-vignette" aria-hidden="true" />

              <header className="sl-panorama-intro sl-panorama-intro--workspace">
                <span className="sellio-eyebrow"><Sparkles aria-hidden="true" /> Merchant workspace</span>
                <h2 id="sellio-product-heading">See every part of Sellio working together.</h2>
                <p>Select a waypoint to see how storefront, operations, inventory, insights and AI connect.</p>
              </header>

              <div className="sl-workspace-waypoints" aria-label="Workspace waypoints">
                {PRODUCT_VIEWS.map(({ key, label }, index) => (
                  <button
                    key={key}
                    type="button"
                    className={activeKey === key ? 'is-active' : ''}
                    onClick={() => setActiveKey(key)}
                    aria-pressed={activeKey === key}
                    aria-label={`Show ${label}`}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{label}</strong>
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.article
                  key={active.key}
                  className="sl-waypoint-callout sl-waypoint-callout--workspace"
                  style={{
                    '--callout-x': position.x,
                    '--callout-y': position.y,
                    '--callout-mobile-x': position.mobileX,
                    '--callout-mobile-y': position.mobileY,
                  }}
                  initial={reduceMotion ? false : { opacity: 0, rotateY: -8, scale: .96 }}
                  animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, rotateY: 8, scale: .97 }}
                  transition={{ duration: reduceMotion ? 0 : .26, ease: [0.2, 0.8, 0.2, 1] }}
                  aria-live="polite"
                >
                  <div className="sl-waypoint-callout__meta">
                    <span><ActiveIcon aria-hidden="true" /> {String(activeIndex + 1).padStart(2, '0')}</span>
                    <strong>{active.label}</strong>
                  </div>
                  <h3>{active.title}</h3>
                  <p>{active.description}</p>
                  <a href="#pricing">Start free trial <ArrowUpRight aria-hidden="true" /></a>
                </motion.article>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
