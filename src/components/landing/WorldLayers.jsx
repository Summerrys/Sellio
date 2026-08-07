import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDown,
  Coins,
  Map,
  MoveHorizontal,
  Sparkles,
  Store,
} from 'lucide-react';
import { SELLIO_IMMERSIVE_ASSETS } from './immersiveAssets';

const LAYERS = [
  {
    number: '01',
    eyebrow: 'Marketplace layer',
    title: 'Discover the right district.',
    description: 'Customers enter a coherent sector world rather than a directory grid. F&B starts the network, while Retail and Services already have room to expand.',
    tags: ['Sector discovery', 'Merchant allocation', 'Connected districts'],
    image: SELLIO_IMMERSIVE_ASSETS.world,
    alt: 'A premium dimensional marketplace composed of connected commerce districts',
    Icon: Map,
  },
  {
    number: '02',
    eyebrow: 'Storefront layer',
    title: 'Zoom into a merchant-owned place.',
    description: 'Selecting a merchant brings its neighbourhood forward, then opens a storefront that retains the merchant’s own brand, products and customer journey.',
    tags: ['Branded identity', 'Product browsing', 'Direct ordering'],
    image: SELLIO_IMMERSIVE_ASSETS.storefront,
    alt: 'A dimensional close-up of a merchant-owned storefront in Sellio World',
    Icon: Store,
  },
  {
    number: '03',
    eyebrow: 'Progression layer',
    title: 'Earn ways to make the space yours.',
    description: 'Sellio Coins and cosmetic rewards can evolve alongside the marketplace—supporting seasonal decoration and merchant expression without turning core commerce into a game.',
    tags: ['Sellio Coins', 'Seasonal décor', 'Merchant progression'],
    image: SELLIO_IMMERSIVE_ASSETS.progression,
    alt: 'Premium merchant progression objects leading to an upgraded seasonal storefront',
    Icon: Coins,
  },
];

export default function WorldLayers() {
  const reduceMotion = useReducedMotion();

  return (
    <section id="vision" className="sellio-section sl-imm-layers" aria-labelledby="sellio-layers-heading">
      <div className="sellio-container">
        <div className="sl-imm-heading sl-imm-heading--light">
          <div>
            <span className="sellio-eyebrow sellio-eyebrow--dark"><Sparkles /> Marketplace progression</span>
            <h2 id="sellio-layers-heading">One world.<br />Three meaningful layers.</h2>
          </div>
          <p>The experience remains useful at every depth: discover a district, enter a real storefront, then personalise that place through progression.</p>
        </div>

        <div className="sl-imm-layer-list">
          {LAYERS.map(({ number, eyebrow, title, description, tags, image, alt, Icon }, index) => (
            <React.Fragment key={number}>
              <article className={`sl-imm-layer ${index % 2 ? 'is-reversed' : ''}`}>
                <motion.div
                  className={`sl-imm-layer__art sl-imm-layer__art--${index + 1}`}
                  initial={false}
                  whileHover={reduceMotion ? undefined : { scale: 1.006 }}
                  transition={{ duration: .5, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <div className="sl-pan-scroll sl-pan-scroll--layer" tabIndex="0" aria-label={`Explore ${eyebrow}`}>
                    <div className="sl-pan-canvas sl-pan-canvas--layer">
                      <picture className="sl-responsive-art">
                        <img src={image} alt={alt} loading="lazy" decoding="async" />
                      </picture>
                    </div>
                  </div>
                  <span>{number}</span>
                  <div className="sl-pan-hint sl-pan-hint--layer"><MoveHorizontal /> Drag image</div>
                </motion.div>
                <div className="sl-imm-layer__copy">
                  <span><Icon /> {eyebrow}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <div>{tags.map((tag) => <small key={tag}>{tag}</small>)}</div>
                </div>
              </article>
              {index < LAYERS.length - 1 && <div className="sl-imm-layer-link" aria-hidden="true"><ArrowDown /></div>}
            </React.Fragment>
          ))}
        </div>

      </div>
    </section>
  );
}
