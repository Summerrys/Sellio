import React, { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, MoveHorizontal, Sparkles } from 'lucide-react';
import { PRODUCT_VIEWS } from './landingData';
import './mobile-pan.css';

const VIEW_POSITIONS = [0.02, 0.25, 0.5, 0.75, 0.98];

export default function ProductShowcase() {
  const [activeKey, setActiveKey] = useState('storefront');
  const panRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const activeIndex = Math.max(0, PRODUCT_VIEWS.findIndex((view) => view.key === activeKey));
  const active = PRODUCT_VIEWS[activeIndex] || PRODUCT_VIEWS[0];
  const ActiveIcon = active.Icon;

  const selectView = (key, index) => {
    setActiveKey(key);
    const viewport = panRef.current;
    if (!viewport) return;
    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    viewport.scrollTo({
      left: Math.max(0, maxScroll * VIEW_POSITIONS[index]),
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <section id="product" className="sellio-section sellio-product-section sl-workspace-section" aria-labelledby="sellio-product-heading">
      <div className="sellio-container">
        <div className="sellio-section-heading sl-workspace-heading">
          <span className="sellio-eyebrow"><Sparkles aria-hidden="true" /> Film stage 04 · Merchant workspace</span>
          <h2 id="sellio-product-heading">See every part of Sellio working together.</h2>
          <p>Move from the customer storefront to live operations, inventory, insights and AI—without leaving the same connected workspace.</p>
        </div>

        <div className="sellio-product-tabs sl-workspace-tabs" role="tablist" aria-label="Sellio workspace areas">
          {PRODUCT_VIEWS.map(({ key, label, Icon }, index) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeKey === key}
              aria-controls="sellio-product-preview"
              className={activeKey === key ? 'is-active' : ''}
              onClick={() => selectView(key, index)}
            >
              <Icon aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        <div className="sl-workspace-shell">
          <div
            id="sellio-product-preview"
            ref={panRef}
            className="sl-pan-scroll sl-pan-scroll--workspace"
            role="tabpanel"
            tabIndex="0"
            aria-label="Swipe horizontally to explore the connected Sellio workspace"
          >
            <div className="sl-pan-canvas sl-pan-canvas--workspace">
              <img
                src="/assets/immersive/connected-workspace.webp"
                alt="A bright dimensional Sellio workspace connecting storefront, orders, inventory, analytics and AI"
              />
              <div className="sl-workspace-vignette" aria-hidden="true" />
              <div className="sl-workspace-waypoints" aria-label="Workspace waypoints">
                {PRODUCT_VIEWS.map(({ key, label }, index) => (
                  <button
                    key={key}
                    type="button"
                    className={activeKey === key ? 'is-active' : ''}
                    onClick={() => selectView(key, index)}
                    aria-pressed={activeKey === key}
                    aria-label={`Open and centre ${label}`}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{label}</strong>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="sl-pan-hint sl-pan-hint--workspace"><MoveHorizontal /> Swipe to explore · Tap a waypoint</div>

          <AnimatePresence mode="wait">
            <motion.article
              key={active.key}
              className="sl-workspace-card"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : .26 }}
            >
              <span className="sl-workspace-card__icon"><ActiveIcon aria-hidden="true" /></span>
              <div>
                <small>{String(activeIndex + 1).padStart(2, '0')} · {active.label}</small>
                <h3>{active.title}</h3>
                <p>{active.description}</p>
              </div>
              <a href="#pricing">Start your free trial <ArrowUpRight aria-hidden="true" /></a>
            </motion.article>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
