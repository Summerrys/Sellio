import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  BellRing,
  ChefHat,
  PackageCheck,
  QrCode,
  Sparkles,
} from 'lucide-react';
import './immersive.css';

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

export default function CommerceJourney() {
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const active = STEPS[activeIndex];
  const ActiveIcon = active.Icon;

  const selectStep = (index) => setActiveIndex(index);

  return (
    <section id="journey" className="sellio-section sl-imm-section sl-imm-journey" aria-labelledby="sellio-journey-heading">
      <div className="sellio-container">
        <div className="sl-imm-heading">
          <div>
            <span className="sellio-eyebrow"><Sparkles /> One connected commerce journey</span>
            <h2 id="sellio-journey-heading">From first tap to<br />a smarter next move.</h2>
          </div>
          <p>Sellio connects the visible customer experience to the operational work behind it. Select a stage to follow the same order through the system.</p>
        </div>

        <div className="sl-imm-scene sl-imm-scene--journey">
          <motion.img
            src="/assets/immersive/commerce-journey.webp"
            alt="A dimensional commerce journey connecting a mobile storefront, order, preparation, inventory and analytics"
            initial={false}
            animate={reduceMotion ? undefined : { scale: [1.015, 1.035, 1.015] }}
            transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="sl-imm-scene__shade" aria-hidden="true" />
          <div className="sl-imm-hotspots" aria-label="Commerce journey stages">
            {STEPS.map((step, index) => (
              <button
                key={step.key}
                type="button"
                className={index === activeIndex ? 'is-active' : ''}
                onClick={() => selectStep(index)}
                aria-pressed={index === activeIndex}
                aria-label={`${step.number}. ${step.label}`}
              >
                <span>{step.number}</span>
              </button>
            ))}
          </div>
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
                onClick={() => selectStep((activeIndex + 1) % STEPS.length)}
                aria-label="Show next commerce stage"
              >
                <ArrowRight />
              </button>
            </motion.article>
          </AnimatePresence>
        </div>

        <div className="sl-imm-step-rail" aria-label="Select a commerce stage">
          {STEPS.map((step, index) => (
            <button
              key={step.key}
              type="button"
              className={index === activeIndex ? 'is-active' : ''}
              onClick={() => selectStep(index)}
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
