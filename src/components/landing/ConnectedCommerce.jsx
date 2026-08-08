import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  BarChart3,
  BellRing,
  HeartHandshake,
  PackageCheck,
  QrCode,
  ShoppingBag,
  Sparkles,
  Store,
} from 'lucide-react';
import { SELLIO_IMMERSIVE_ASSETS, SELLIO_IMMERSIVE_MOBILE_ASSETS } from './immersiveAssets';

const CUSTOMER_POINTS = [
  { Icon: Store, title: 'Branded discovery', copy: 'The merchant’s identity stays visible from the first browse.' },
  { Icon: QrCode, title: 'Simple ordering', copy: 'Links and table QR codes take customers straight to what matters.' },
  { Icon: ShoppingBag, title: 'Confident checkout', copy: 'A clear path from product choice to completed order.' },
];

const MERCHANT_POINTS = [
  { Icon: BellRing, title: 'Live order flow', copy: 'New, preparing and ready states stay in one operational view.' },
  { Icon: PackageCheck, title: 'Connected stock', copy: 'Product and inventory activity remain part of the same story.' },
  { Icon: BarChart3, title: 'Useful visibility', copy: 'Performance is translated into an understandable daily pulse.' },
];

const CONNECTED_STAGES = [
  {
    key: 'customer',
    number: '01',
    label: 'Customer intent',
    title: 'A customer enters through the merchant’s own brand.',
    description: 'Discovery, product choice and checkout stay simple while the storefront keeps its identity.',
    Icon: Store,
    point: { x: '24%', y: '56%', mobileX: '24%', mobileY: '42%' },
  },
  {
    key: 'sellio',
    number: '02',
    label: 'Sellio sync',
    title: 'Sellio carries the order into one connected flow.',
    description: 'Order details, product context and operational status move together without manual re-entry.',
    Icon: Sparkles,
    point: { x: '50%', y: '49%', mobileX: '55%', mobileY: '57%' },
  },
  {
    key: 'merchant',
    number: '03',
    label: 'Merchant action',
    title: 'The merchant sees what happened and what comes next.',
    description: 'Teams act on live orders, connected stock and useful performance signals from one side of Sellio.',
    Icon: BellRing,
    point: { x: '76%', y: '57%', mobileX: '72%', mobileY: '72%' },
  },
];

function PointList({ title, eyebrow, points, tone, reduceMotion }) {
  const entranceX = tone === 'customer' ? -28 : 28;
  return (
    <motion.article
      className={`sl-connection-panel sl-connection-panel--${tone}`}
      initial={reduceMotion ? false : { opacity: 0, x: entranceX }}
      whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }}
      viewport={{ once: true, amount: .25 }}
      transition={{ duration: .62, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <header>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
      </header>
      <div className="sl-connection-panel__points">
        {points.map(({ Icon, title: itemTitle, copy }) => (
          <div key={itemTitle}>
            <i><Icon aria-hidden="true" /></i>
            <p><strong>{itemTitle}</strong><small>{copy}</small></p>
          </div>
        ))}
      </div>
    </motion.article>
  );
}

export default function ConnectedCommerce() {
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const activeStage = CONNECTED_STAGES[activeIndex];
  const ActiveStageIcon = activeStage.Icon;

  return (
    <section id="connected" className="sellio-section sl-imm-section sl-imm-connected sl-cinematic-section sl-cinematic-connected" aria-labelledby="sellio-connected-heading">
      <div className="sellio-container">
        <header className="sl-immersive-section-heading sl-immersive-section-heading--connected">
          <span className="sellio-eyebrow"><HeartHandshake /> Connected commerce</span>
          <div>
            <h2 id="sellio-connected-heading">Delight in front.<br />Clarity behind the counter.</h2>
            <p>Customers feel the brand while merchants stay in control. Both sides stay connected without becoming the same experience.</p>
          </div>
        </header>

        <div className="sl-imm-connection-stage">
          <div className="sl-pan-scroll sl-pan-scroll--connection" tabIndex="0" aria-label="Connected customer and merchant experience">
            <motion.div
              className="sl-imm-connection-art sl-pan-canvas sl-pan-canvas--connection"
              initial={false}
              whileHover={reduceMotion ? undefined : { scale: 1.004 }}
              transition={{ duration: .55, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <picture className="sl-responsive-art">
                <source media="(max-width: 600px)" srcSet={SELLIO_IMMERSIVE_MOBILE_ASSETS.connected} />
                <img
                  src={SELLIO_IMMERSIVE_ASSETS.connected}
                  alt="A premium connected commerce environment linking a customer storefront to merchant operations"
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <div className="sl-imm-hotspots sl-connection-waypoints" aria-label="Connected commerce stages">
                {CONNECTED_STAGES.map((stage, index) => (
                  <button
                    key={stage.key}
                    type="button"
                    className={index === activeIndex ? 'is-active' : ''}
                    style={{ '--point-x': stage.point.x, '--point-y': stage.point.y, '--point-mobile-x': stage.point.mobileX, '--point-mobile-y': stage.point.mobileY }}
                    onClick={() => setActiveIndex(index)}
                    aria-pressed={index === activeIndex}
                    aria-label={`${stage.number}. ${stage.label}: show this connection stage`}
                  >
                    <span>{stage.number}</span>
                  </button>
                ))}
              </div>

              <div
                className={`sl-waypoint-callout-anchor sl-connected-callout-anchor ${activeIndex === 0 ? 'is-right' : 'is-left'}`}
                style={{
                  '--callout-x': activeStage.point.x,
                  '--callout-y': activeStage.point.y,
                  '--callout-mobile-x': activeStage.point.mobileX,
                  '--callout-mobile-y': activeStage.point.mobileY,
                }}
              >
                <AnimatePresence mode="wait">
                  <motion.article
                    key={activeStage.key}
                    className="sl-waypoint-callout sl-waypoint-callout--connected"
                    initial={reduceMotion ? false : { opacity: 0, rotateY: activeIndex === 0 ? -8 : 8, scale: .96 }}
                    animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0, rotateY: activeIndex === 0 ? 8 : -8, scale: .97 }}
                    transition={{ duration: reduceMotion ? 0 : .3, ease: [0.2, 0.8, 0.2, 1] }}
                    aria-live="polite"
                  >
                    <div className="sl-waypoint-callout__meta">
                      <span><ActiveStageIcon aria-hidden="true" /> Connection {activeStage.number}</span>
                      <strong>{activeStage.label}</strong>
                    </div>
                    <h3>{activeStage.title}</h3>
                    <p>{activeStage.description}</p>
                  </motion.article>
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          <div className="sl-connection-comparison">
            <PointList eyebrow="Customer side" title="Easy to enter. Easy to trust." points={CUSTOMER_POINTS} tone="customer" reduceMotion={reduceMotion} />
            <div className="sl-connection-bridge" aria-hidden="true"><Sparkles /><span>One connected flow</span></div>
            <PointList eyebrow="Merchant side" title="Easy to see. Easy to act." points={MERCHANT_POINTS} tone="merchant" reduceMotion={reduceMotion} />
          </div>
        </div>
      </div>
    </section>
  );
}
