import React from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  BellRing,
  Bot,
  Boxes,
  Check,
  Palette,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
} from 'lucide-react';

const CUSTOMER_ITEMS = [
  { label: 'Branded storefront', Icon: Store },
  { label: 'QR and table ordering', Icon: QrCode },
  { label: 'Simple mobile checkout', Icon: ShoppingBag },
  { label: 'Merchant discovery', Icon: Sparkles, future: true },
];

const MERCHANT_ITEMS = [
  { label: 'Live orders and kitchen flow', Icon: BellRing },
  { label: 'Products and inventory', Icon: Boxes },
  { label: 'Reports and performance', Icon: BarChart3 },
  { label: 'Staff roles and Sellio AI', Icon: Users },
];

function ExperiencePanel({ title, label, items, type }) {
  return (
    <motion.article className={'sellio-connected-panel is-' + type} initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .5 }}>
      <span className="sellio-connected-panel__label">{label}</span>
      <h3>{title}</h3>
      <div className="sellio-connected-panel__items">
        {items.map(({ label: itemLabel, Icon, future }) => <div key={itemLabel}><span><Icon /></span><strong>{itemLabel}</strong>{future ? <small>Marketplace layer</small> : <Check />}</div>)}
      </div>
      {type === 'customer' ? (
        <div className="sellio-connected-store-card"><span><Palette /></span><div><small>Storefront theme</small><strong>Uniquely yours</strong></div><i /><i /><i /></div>
      ) : (
        <div className="sellio-connected-pulse"><span><Bot /></span><div><small>Sellio AI pulse</small><strong>“Oat milk may run low by Friday.”</strong></div></div>
      )}
    </motion.article>
  );
}

export default function ConnectedCommerce() {
  return (
    <section id="features" className="sellio-section sellio-connected-section" aria-labelledby="sellio-connected-heading">
      <div className="sellio-container">
        <div className="sellio-connected-heading">
          <span className="sellio-eyebrow"><ShieldCheck aria-hidden="true" /> Both sides connected</span>
          <h2 id="sellio-connected-heading">Beautiful for customers.<br />Practical for the people running it.</h2>
          <p>Sellio joins the experience customers see with the operations merchants rely on—without making either side feel like an afterthought.</p>
        </div>

        <div className="sellio-connected-layout">
          <ExperiencePanel title="A storefront customers want to explore." label="Customer experience" items={CUSTOMER_ITEMS} type="customer" />
          <div className="sellio-connected-core" aria-hidden="true"><span /><img src="https://assets.apptelier.sg/sellio/Logo_AISellio_Assistant.png" alt="" /><strong>Sellio</strong><small>One connected platform</small></div>
          <ExperiencePanel title="A workspace that keeps the day moving." label="Merchant operations" items={MERCHANT_ITEMS} type="merchant" />
        </div>
      </div>
    </section>
  );
}
