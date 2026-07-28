import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Check,
  ChefHat,
  Coffee,
  PackageCheck,
  QrCode,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';

const STEPS = [
  {
    key: 'discover',
    number: '01',
    label: 'Discover',
    title: 'Your storefront welcomes the customer.',
    description: 'Customers browse a branded, mobile-first menu from a link or table QR code.',
    Icon: QrCode,
  },
  {
    key: 'order',
    number: '02',
    label: 'Order',
    title: 'The order arrives without friction.',
    description: 'Items, variants, notes and table details enter one organised order queue.',
    Icon: BellRing,
  },
  {
    key: 'prepare',
    number: '03',
    label: 'Prepare',
    title: 'Your team always knows what comes next.',
    description: 'Kitchen and service teams move each order from new to preparing and ready.',
    Icon: ChefHat,
  },
  {
    key: 'update',
    number: '04',
    label: 'Update',
    title: 'Stock follows the rhythm of service.',
    description: 'Inventory activity stays connected to the products your team is selling.',
    Icon: PackageCheck,
  },
  {
    key: 'learn',
    number: '05',
    label: 'Learn',
    title: 'The day becomes useful business insight.',
    description: 'Review sales, popular products and operations without rebuilding the story in spreadsheets.',
    Icon: BarChart3,
  },
];

function StoryVisual({ activeKey }) {
  if (activeKey === 'discover') {
    return (
      <div className="sellio-story-phone">
        <div className="sellio-story-phone__bar" />
        <div className="sellio-story-phone__header"><span><small>Welcome to</small><strong>Cafetelier</strong></span><ShoppingBag /></div>
        <div className="sellio-story-phone__hero"><small>Made fresh today</small><strong>Good food, beautifully served.</strong><span>Explore menu <ArrowRight /></span></div>
        <div className="sellio-story-phone__chips"><i>Popular</i><i>Coffee</i><i>Brunch</i></div>
        <div className="sellio-story-products"><article><Coffee /><b>Signature Latte</b><small>$6.80</small></article><article><Sparkles /><b>Berry Croissant</b><small>$7.20</small></article></div>
      </div>
    );
  }

  if (activeKey === 'order') {
    return (
      <div className="sellio-story-board">
        <header><span><small>Live service</small><strong>Order queue</strong></span><i><BellRing /> 3 active</i></header>
        <div className="sellio-story-order is-new"><span><b>#1048</b><small>Table 05 · just now</small></span><strong>2 items</strong><i>New</i></div>
        <div className="sellio-story-order"><span><b>#1047</b><small>Pickup · 6 min</small></span><strong>4 items</strong><i>Preparing</i></div>
        <div className="sellio-story-order is-ready"><span><b>#1046</b><small>Table 02 · 12 min</small></span><strong>1 item</strong><i>Ready</i></div>
      </div>
    );
  }

  if (activeKey === 'prepare') {
    return (
      <div className="sellio-story-kitchen">
        <header><ChefHat /><span><small>Kitchen display</small><strong>Order #1048</strong></span><i>02:14</i></header>
        <div><span><b>2×</b><strong>Signature Latte</strong></span><Check /><span><b>1×</b><strong>Berry Croissant</strong><small>Warm before serving</small></span></div>
        <button type="button">Mark ready <ArrowRight /></button>
      </div>
    );
  }

  if (activeKey === 'update') {
    return (
      <div className="sellio-story-stock">
        <header><span><small>Inventory</small><strong>Stock movement</strong></span><PackageCheck /></header>
        {[['Coffee beans','4.2 kg','68%'],['Oat milk','6 units','34%'],['Croissant dough','3 trays','22%']].map(([name,amount,width]) => <div key={name}><span><b>{name}</b><small>{amount}</small></span><i><em style={{ width }} /></i></div>)}
        <p><Check /> Order activity recorded</p>
      </div>
    );
  }

  return (
    <div className="sellio-story-insight">
      <header><span><small>Today</small><strong>Business pulse</strong></span><i><BarChart3 /> +18.4%</i></header>
      <div className="sellio-story-revenue"><small>Gross sales</small><strong>SGD 1,842.60</strong><span>86 orders</span></div>
      <div className="sellio-story-bars">{[38,52,45,68,61,83,74,96,88,100].map((height,index) => <i key={index} style={{ height: height + '%' }} />)}</div>
      <div className="sellio-story-insight__footer"><span><small>Top product</small><b>Signature Latte</b></span><span><small>Average order</small><b>$21.43</b></span></div>
    </div>
  );
}

export default function CommerceJourney() {
  const [activeKey, setActiveKey] = useState('discover');
  const reduceMotion = useReducedMotion();
  const active = STEPS.find((step) => step.key === activeKey) || STEPS[0];

  return (
    <section id="journey" className="sellio-section sellio-journey-section" aria-labelledby="sellio-journey-heading">
      <div className="sellio-container">
        <div className="sellio-journey-intro">
          <span className="sellio-eyebrow"><Sparkles aria-hidden="true" /> One connected flow</span>
          <h2 id="sellio-journey-heading">One order tells the whole Sellio story.</h2>
          <p>Follow what happens from the customer’s first tap to the insight you use at the end of the day.</p>
        </div>

        <div className="sellio-journey-shell">
          <div className="sellio-journey-steps" role="tablist" aria-label="Order journey">
            {STEPS.map((step) => (
              <button key={step.key} type="button" role="tab" aria-selected={step.key === activeKey} onClick={() => setActiveKey(step.key)} className={step.key === activeKey ? 'is-active' : ''}>
                <span>{step.number}</span><step.Icon aria-hidden="true" /><strong>{step.label}</strong><small>{step.description}</small>
              </button>
            ))}
          </div>

          <div className="sellio-journey-stage" role="tabpanel">
            <div className="sellio-journey-stage__copy"><span>{active.number} · {active.label}</span><h3>{active.title}</h3><p>{active.description}</p></div>
            <AnimatePresence mode="wait">
              <motion.div key={active.key} className="sellio-journey-stage__visual" initial={reduceMotion ? false : { opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduceMotion ? undefined : { opacity: 0, y: -12 }} transition={{ duration: reduceMotion ? 0 : .32 }}>
                <StoryVisual activeKey={active.key} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
