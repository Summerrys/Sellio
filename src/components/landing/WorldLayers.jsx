import React from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  Coins,
  Gift,
  Map,
  Paintbrush,
  Sparkles,
  Store,
  Trophy,
  Users,
} from 'lucide-react';

const LAYERS = [
  {
    number: '01',
    label: 'Marketplace layer',
    title: 'Discover by sector, neighbourhood and merchant.',
    description: 'The marketplace can launch with structured F&B, Retail and Services zones. Every new merchant makes its own area richer.',
    Icon: Map,
    className: 'marketplace',
    tags: ['Sector search', 'Merchant lots', 'Customer discovery'],
  },
  {
    number: '02',
    label: 'Storefront layer',
    title: 'Zoom from the map into a merchant’s own world.',
    description: 'The camera journey ends at a branded storefront using the merchant’s colours, products, content and seasonal decorations.',
    Icon: Store,
    className: 'storefront',
    tags: ['Own identity', 'Products', 'Seasonal décor'],
  },
  {
    number: '03',
    label: 'Progression layer',
    title: 'Useful activity unlocks expressive rewards.',
    description: 'Coins, quests and achievements sit across every sector so marketplace participation and gamification can evolve together.',
    Icon: Trophy,
    className: 'progression',
    tags: ['Sellio Coins', 'Quests', 'Achievements'],
  },
];

function LayerVisual({ layer }) {
  if (layer.className === 'marketplace') return <div className="sellio-layer-map"><span><Building2 /></span><span><Store /></span><span><Users /></span><i /><i /></div>;
  if (layer.className === 'storefront') return <div className="sellio-layer-store"><div><i /><i /><i /><i /></div><span><Paintbrush /></span><small>Merchant identity</small></div>;
  return <div className="sellio-layer-coins"><span><Coins /></span><span><Gift /></span><span><Trophy /></span><i>+25</i></div>;
}

export default function WorldLayers() {
  return (
    <section id="vision" className="sellio-section sellio-layers-section" aria-labelledby="sellio-layers-heading">
      <div className="sellio-container">
        <div className="sellio-layers-intro">
          <div><span className="sellio-eyebrow"><Sparkles aria-hidden="true" /> Built in parallel</span><h2 id="sellio-layers-heading">Marketplace, storefronts and play—one system.</h2></div>
          <p>These are not three unrelated future products. They are layers of the same Sellio experience and can be developed together in deliberate releases.</p>
        </div>

        <div className="sellio-layers-list">
          {LAYERS.map((layer, index) => {
            const Icon = layer.Icon;
            return (
              <motion.article key={layer.number} className={'sellio-layer-row is-' + layer.className} initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .25 }} transition={{ duration: .5, delay: index * .08 }}>
                <div className="sellio-layer-row__number">{layer.number}</div>
                <div className="sellio-layer-row__visual"><LayerVisual layer={layer} /></div>
                <div className="sellio-layer-row__copy"><span><Icon /> {layer.label}</span><h3>{layer.title}</h3><p>{layer.description}</p><div>{layer.tags.map((tag) => <small key={tag}>{tag}</small>)}</div></div>
                {index < LAYERS.length - 1 && <ArrowRight className="sellio-layer-row__arrow" aria-hidden="true" />}
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
