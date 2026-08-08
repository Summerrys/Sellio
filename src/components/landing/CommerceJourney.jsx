import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  BarChart3,
  BellRing,
  ChefHat,
  PackageCheck,
  QrCode,
  Sparkles,
} from 'lucide-react';
import './immersive.css';
import './mobile-pan.css';
import { SELLIO_IMMERSIVE_ASSETS, SELLIO_IMMERSIVE_MOBILE_ASSETS } from './immersiveAssets';

const STEPS = [
  {
    key: 'discover',
    number: '01',
    label: 'Discover',
    title: 'A storefront that feels like your own.',
    description: 'Customers enter through your link or table QR and browse a polished, mobile-first storefront.',
    Icon: QrCode,
    point: { x: '22%', y: '48%', mobileX: '38%', mobileY: '76%' },
  },
  {
    key: 'order',
    number: '02',
    label: 'Order',
    title: 'Every order arrives in one clear queue.',
    description: 'Products, variants, notes and table details move into operations without manual re-entry.',
    Icon: BellRing,
    point: { x: '35%', y: '51%', mobileX: '57%', mobileY: '66%' },
  },
  {
    key: 'prepare',
    number: '03',
    label: 'Prepare',
    title: 'Service teams see what comes next.',
    description: 'Kitchen and service teams move each order from new to preparing and ready with confidence.',
    Icon: ChefHat,
    point: { x: '49%', y: '48%', mobileX: '39%', mobileY: '54%' },
  },
  {
    key: 'update',
    number: '04',
    label: 'Update',
    title: 'Inventory follows the rhythm of service.',
    description: 'Stock activity stays connected to the products being sold, so the operational picture stays current.',
    Icon: PackageCheck,
    point: { x: '61%', y: '50%', mobileX: '57%', mobileY: '41%' },
  },
  {
    key: 'learn',
    number: '05',
    label: 'Learn',
    title: 'The day becomes useful business insight.',
    description: 'Sales, popular products and operational patterns are ready to review without rebuilding the story.',
    Icon: BarChart3,
    point: { x: '72%', y: '45%', mobileX: '42%', mobileY: '28%' },
  },
];

export default function CommerceJourney() {
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const active = STEPS[activeIndex];
  const ActiveIcon = active.Icon;

  return (
    <section id="journey" className="sellio-section sl-imm-section sl-imm-journey sl-cinematic-section sl-cinematic-journey" aria-labelledby="sellio-journey-heading">
      <div className="sellio-container">
        <div className="sl-imm-scene sl-imm-scene--journey">
          <div
            className="sl-pan-scroll sl-pan-scroll--journey"
            tabIndex="0"
            aria-label="Interactive commerce journey with five selectable stages"
          >
            <div className="sl-pan-canvas sl-pan-canvas--journey">
              <picture className="sl-responsive-art">
                <source media="(max-width: 600px)" srcSet={SELLIO_IMMERSIVE_MOBILE_ASSETS.journey} />
                <img
                  src={SELLIO_IMMERSIVE_ASSETS.journey}
                  alt="A dimensional commerce journey connecting a mobile storefront, order, preparation, inventory and analytics"
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <div className="sl-imm-scene__shade" aria-hidden="true" />

              <header className="sl-panorama-intro sl-panorama-intro--journey">
                <span className="sellio-eyebrow"><Sparkles /> Order journey</span>
                <h2 id="sellio-journey-heading">From first tap to<br />a smarter next move.</h2>
                <p>Select a waypoint to follow the same order from discovery to insight.</p>
              </header>

              <div className="sl-imm-hotspots" aria-label="Commerce journey waypoints">
                {STEPS.map((step, index) => (
                  <button
                    key={step.key}
                    type="button"
                    className={index === activeIndex ? 'is-active' : ''}
                    onClick={() => setActiveIndex(index)}
                    aria-pressed={index === activeIndex}
                    aria-label={`${step.number}. ${step.label}: show this stage`}
                  >
                    <span>{step.number}</span>
                  </button>
                ))}
              </div>

              <div
                className={`sl-waypoint-callout-anchor ${activeIndex % 2 === 0 ? 'is-right' : 'is-left'}`}
                style={{
                  '--callout-x': active.point.x,
                  '--callout-y': active.point.y,
                  '--callout-mobile-x': active.point.mobileX,
                  '--callout-mobile-y': active.point.mobileY,
                }}
              >
                <AnimatePresence mode="wait">
                  <motion.article
                    key={active.key}
                    className="sl-waypoint-callout sl-waypoint-callout--journey"
                    initial={reduceMotion ? false : { opacity: 0, rotateY: activeIndex % 2 === 0 ? -8 : 8, scale: .96 }}
                    animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0, rotateY: activeIndex % 2 === 0 ? 8 : -8, scale: .97 }}
                    transition={{ duration: reduceMotion ? 0 : .28, ease: [0.2, 0.8, 0.2, 1] }}
                    aria-live="polite"
                  >
                    <div className="sl-waypoint-callout__meta">
                      <span><ActiveIcon aria-hidden="true" /> Stage {active.number}</span>
                      <strong>{active.label}</strong>
                    </div>
                    <h3>{active.title}</h3>
                    <p>{active.description}</p>
                  </motion.article>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
