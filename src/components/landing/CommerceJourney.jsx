import React, { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  BellRing,
  ChefHat,
  MoveHorizontal,
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
  },
  {
    key: 'order',
    number: '02',
    label: 'Order',
    title: 'Every order arrives in one clear queue.',
    description: 'Products, variants, notes and table details move into operations without manual re-entry.',
    Icon: BellRing,
  },
  {
    key: 'prepare',
    number: '03',
    label: 'Prepare',
    title: 'Service teams see what comes next.',
    description: 'Kitchen and service teams move each order from new to preparing and ready with confidence.',
    Icon: ChefHat,
  },
  {
    key: 'update',
    number: '04',
    label: 'Update',
    title: 'Inventory follows the rhythm of service.',
    description: 'Stock activity stays connected to the products being sold, so the operational picture stays current.',
    Icon: PackageCheck,
  },
  {
    key: 'learn',
    number: '05',
    label: 'Learn',
    title: 'The day becomes useful business insight.',
    description: 'Sales, popular products and operational patterns are ready to review without rebuilding the story.',
    Icon: BarChart3,
  },
];

const STEP_POSITIONS = [0.02, 0.26, 0.5, 0.74, 0.98];

export default function CommerceJourney() {
  const [activeIndex, setActiveIndex] = useState(0);
  const panRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const active = STEPS[activeIndex];
  const ActiveIcon = active.Icon;

  const panToStep = (index) => {
    setActiveIndex(index);
    const viewport = panRef.current;
    if (!viewport) return;
    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    viewport.scrollTo({
      left: Math.max(0, maxScroll * STEP_POSITIONS[index]),
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <section id="journey" className="sellio-section sl-imm-section sl-imm-journey sl-cinematic-section sl-cinematic-journey" aria-labelledby="sellio-journey-heading">
      <div className="sellio-container">
        <div className="sl-imm-scene sl-imm-scene--journey">
          <div
            ref={panRef}
            className="sl-pan-scroll sl-pan-scroll--journey"
            tabIndex="0"
            aria-label="Interactive commerce journey with five selectable stages"
          >
            <div className="sl-pan-canvas sl-pan-canvas--journey">
              <motion.picture
                className="sl-responsive-art"
                initial={false}
                animate={reduceMotion ? undefined : { scale: [1.006, 1.014, 1.006] }}
                transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
              >
                <source media="(max-width: 600px)" srcSet={SELLIO_IMMERSIVE_MOBILE_ASSETS.journey} />
                <img
                  src={SELLIO_IMMERSIVE_ASSETS.journey}
                  alt="A dimensional commerce journey connecting a mobile storefront, order, preparation, inventory and analytics"
                  loading="lazy"
                  decoding="async"
                />
              </motion.picture>
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
                    onClick={() => panToStep(index)}
                    aria-pressed={index === activeIndex}
                    aria-label={`${step.number}. ${step.label}: show this stage`}
                  >
                    <span>{step.number}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="sl-pan-hint"><MoveHorizontal /> Drag to explore · Tap a waypoint</div>

          <AnimatePresence mode="wait">
            <motion.article
              key={active.key}
              className="sl-imm-story-card"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: .28 }}
            >
              <div className="sl-imm-story-card__icon"><ActiveIcon /></div>
              <div>
                <span>{active.number} · {active.label}</span>
                <h3>{active.title}</h3>
                <p>{active.description}</p>
              </div>
              <button
                type="button"
                onClick={() => panToStep((activeIndex + 1) % STEPS.length)}
                aria-label="Show and centre the next commerce stage"
              >
                <ArrowRight />
              </button>
            </motion.article>
          </AnimatePresence>
        </div>

        <div className="sl-imm-step-rail" aria-label="Select and centre a commerce stage">
          {STEPS.map((step, index) => (
            <button
              key={step.key}
              type="button"
              className={index === activeIndex ? 'is-active' : ''}
              onClick={() => panToStep(index)}
              aria-pressed={index === activeIndex}
            >
              <span>{step.number}</span>
              <strong>{step.label}</strong>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
