import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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

function PointList({ title, eyebrow, points, tone }) {
  return (
    <article className={`sl-connection-panel sl-connection-panel--${tone}`}>
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
    </article>
  );
}

export default function ConnectedCommerce() {
  const reduceMotion = useReducedMotion();

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
              <div className="sl-imm-connection-badge sl-imm-connection-badge--customer"><Store /> Customer experience</div>
              <div className="sl-imm-connection-badge sl-imm-connection-badge--merchant"><BarChart3 /> Merchant operations</div>
              <div className="sl-imm-connection-core"><Sparkles /><span>Connected by Sellio</span></div>
            </motion.div>
          </div>

          <div className="sl-connection-comparison">
            <PointList eyebrow="Customer side" title="Easy to enter. Easy to trust." points={CUSTOMER_POINTS} tone="customer" />
            <div className="sl-connection-bridge" aria-hidden="true"><Sparkles /><span>One connected flow</span></div>
            <PointList eyebrow="Merchant side" title="Easy to see. Easy to act." points={MERCHANT_POINTS} tone="merchant" />
          </div>
        </div>
      </div>
    </section>
  );
}
