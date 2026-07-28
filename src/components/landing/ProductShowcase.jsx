import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  ChefHat,
  Coffee,
  MessageCircle,
  Package,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { PRODUCT_VIEWS } from './landingData';

function StorefrontPreview() {
  const products = [
    { name: 'Signature Latte', price: '$6.80', Icon: Coffee, tone: 'orange' },
    { name: 'Berry Croissant', price: '$7.20', Icon: Sparkles, tone: 'pink' },
    { name: 'Brunch Set', price: '$18.00', Icon: ChefHat, tone: 'purple' },
  ];

  return (
    <div className="sellio-demo-phone">
      <div className="sellio-demo-phone__bar"><span /><span /><span /></div>
      <div className="sellio-demo-storefront-head">
        <div>
          <small>Good morning</small>
          <strong>Cafetelier</strong>
        </div>
        <ShoppingBag aria-hidden="true" />
      </div>
      <div className="sellio-demo-search"><Search aria-hidden="true" /> Search the menu</div>
      <div className="sellio-demo-chips"><span className="is-active">Popular</span><span>Coffee</span><span>Pastries</span></div>
      <div className="sellio-demo-products">
        {products.map(({ name, price, Icon, tone }) => (
          <div key={name} className="sellio-demo-product">
            <div className={'sellio-demo-product__image is-' + tone}><Icon aria-hidden="true" /></div>
            <strong>{name}</strong>
            <div><span>{price}</span><button aria-label={'Add ' + name}>+</button></div>
          </div>
        ))}
      </div>
      <div className="sellio-demo-cart"><span>2 items</span><strong>View order · $14.00</strong></div>
    </div>
  );
}

function OrdersPreview() {
  const orders = [
    { id: '#1048', time: '2 min', items: '2 items', status: 'New', tone: 'pink' },
    { id: '#1047', time: '8 min', items: '4 items', status: 'Preparing', tone: 'orange' },
    { id: '#1046', time: '14 min', items: '1 item', status: 'Ready', tone: 'green' },
  ];

  return (
    <div className="sellio-demo-dashboard">
      <div className="sellio-demo-dashboard__head">
        <div><small>Live operations</small><strong>Orders</strong></div>
        <span><Bell aria-hidden="true" /> 3 active</span>
      </div>
      <div className="sellio-order-columns">
        {orders.map((order) => (
          <div key={order.id} className="sellio-order-card">
            <div><strong>{order.id}</strong><span>{order.time}</span></div>
            <p>{order.items} · Dine in</p>
            <span className={'sellio-order-status is-' + order.tone}>{order.status}</span>
            <div className="sellio-order-progress"><i /><i /><i /></div>
          </div>
        ))}
      </div>
      <div className="sellio-demo-bottom-stat"><ChefHat aria-hidden="true" /><span>Average preparation</span><strong>8m 24s</strong></div>
    </div>
  );
}

function InventoryPreview() {
  const stock = [
    { name: 'Coffee beans', amount: '4.2 kg', width: '68%', tone: 'purple' },
    { name: 'Oat milk', amount: '6 units', width: '34%', tone: 'orange' },
    { name: 'Croissant dough', amount: '3 trays', width: '22%', tone: 'pink' },
  ];

  return (
    <div className="sellio-demo-dashboard">
      <div className="sellio-demo-dashboard__head">
        <div><small>Inventory</small><strong>Stock overview</strong></div>
        <span><Package aria-hidden="true" /> 2 alerts</span>
      </div>
      <div className="sellio-inventory-summary">
        <div><small>Items tracked</small><strong>128</strong></div>
        <div><small>Low stock</small><strong>2</strong></div>
        <div><small>Updated today</small><strong>18</strong></div>
      </div>
      <div className="sellio-stock-list">
        {stock.map((item) => (
          <div key={item.name}>
            <div><strong>{item.name}</strong><span>{item.amount}</span></div>
            <div className="sellio-stock-track"><i className={'is-' + item.tone} style={{ width: item.width }} /></div>
          </div>
        ))}
      </div>
      <button className="sellio-demo-secondary-button">Start stocktake <ArrowUpRight aria-hidden="true" /></button>
    </div>
  );
}

function InsightsPreview() {
  const bars = [42, 58, 50, 74, 62, 86, 78, 94, 88, 100, 92, 112];
  return (
    <div className="sellio-demo-dashboard">
      <div className="sellio-demo-dashboard__head">
        <div><small>This month</small><strong>Business insights</strong></div>
        <span><TrendingUp aria-hidden="true" /> +18.4%</span>
      </div>
      <div className="sellio-insight-total"><small>Gross sales</small><strong>SGD 18,420.60</strong><span>Compared with last month</span></div>
      <div className="sellio-chart" aria-label="Illustrative sales chart">
        {bars.map((height, index) => <i key={index} style={{ height }} />)}
      </div>
      <div className="sellio-insight-cards">
        <div><BarChart3 aria-hidden="true" /><span>Top product</span><strong>Signature Latte</strong></div>
        <div><ShoppingBag aria-hidden="true" /><span>Orders</span><strong>486</strong></div>
      </div>
    </div>
  );
}

function AssistantPreview() {
  return (
    <div className="sellio-demo-assistant">
      <div className="sellio-demo-assistant__head">
        <img src="https://assets.apptelier.sg/sellio/Logo_AISellio_Assistant.png" alt="" />
        <div><strong>Sellio AI</strong><span>Ready to help</span></div>
        <Sparkles aria-hidden="true" />
      </div>
      <div className="sellio-chat-message is-user">What should I restock before the weekend?</div>
      <div className="sellio-chat-message is-assistant">
        <p>Based on recent sales and current stock, I would prioritise:</p>
        <ul>
          <li><Check aria-hidden="true" /> Oat milk — around 14 units</li>
          <li><Check aria-hidden="true" /> Croissant dough — 5 trays</li>
          <li><Check aria-hidden="true" /> Takeaway cups — 2 cartons</li>
        </ul>
      </div>
      <div className="sellio-chat-suggestions"><span>Show low stock</span><span>Compare weekends</span></div>
      <div className="sellio-chat-input"><span>Ask about your business…</span><MessageCircle aria-hidden="true" /></div>
    </div>
  );
}

const PREVIEWS = {
  storefront: StorefrontPreview,
  orders: OrdersPreview,
  inventory: InventoryPreview,
  insights: InsightsPreview,
  assistant: AssistantPreview,
};

export default function ProductShowcase() {
  const [activeKey, setActiveKey] = useState('storefront');
  const reduceMotion = useReducedMotion();
  const active = PRODUCT_VIEWS.find((view) => view.key === activeKey) || PRODUCT_VIEWS[0];
  const Preview = PREVIEWS[active.key];

  return (
    <section id="product" className="sellio-section sellio-product-section" aria-labelledby="sellio-product-heading">
      <div className="sellio-container">
        <div className="sellio-section-heading">
          <span className="sellio-eyebrow"><Sparkles aria-hidden="true" /> One connected workspace</span>
          <h2 id="sellio-product-heading">See Sellio from both sides of the counter.</h2>
          <p>Give customers a smooth ordering experience while your team manages the business behind it.</p>
        </div>

        <div className="sellio-product-tabs" role="tablist" aria-label="Sellio product views">
          {PRODUCT_VIEWS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeKey === key}
              aria-controls="sellio-product-preview"
              className={activeKey === key ? 'is-active' : ''}
              onClick={() => setActiveKey(key)}
            >
              <Icon aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        <div className="sellio-showcase-shell">
          <div className="sellio-showcase-copy">
            <span className="sellio-showcase-copy__icon"><active.Icon aria-hidden="true" /></span>
            <h3>{active.title}</h3>
            <p>{active.description}</p>
            <a href="#pricing">Start your free trial <ArrowUpRight aria-hidden="true" /></a>
          </div>

          <div id="sellio-product-preview" className="sellio-showcase-preview" role="tabpanel">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.key}
                initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.99 }}
                transition={{ duration: reduceMotion ? 0 : 0.28 }}
              >
                <Preview />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
