import React, { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  Coffee,
  Compass,
  MapPin,
  MoveHorizontal,
  Palette,
  ShoppingBag,
  Store,
  Utensils,
} from 'lucide-react';

const DEMO_STORE_URL = '/store/cafetelier?preview=true';

const SECTORS = [
  {
    key: 'fnb',
    name: 'F&B District',
    status: 'Live district',
    Icon: Utensils,
    pan: .28,
    summary: 'Restaurants, cafés, bakeries and beverage concepts live around shared discovery routes.',
  },
  {
    key: 'retail',
    name: 'Retail Avenue',
    status: 'Open for onboarding',
    Icon: ShoppingBag,
    pan: .04,
    summary: 'Boutiques and product-led merchants receive storefront plots along a dedicated retail route.',
  },
  {
    key: 'services',
    name: 'Services Garden',
    status: 'Open for onboarding',
    Icon: BriefcaseBusiness,
    pan: .96,
    summary: 'Wellness, studios and professional services occupy a calmer appointment-led neighbourhood.',
  },
];

export default function SellioWorld() {
  const [activeSector, setActiveSector] = useState('fnb');
  const [storeOpen, setStoreOpen] = useState(false);
  const worldPanRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const sector = SECTORS.find((item) => item.key === activeSector);

  const selectSector = (key) => {
    const nextSector = SECTORS.find((item) => item.key === key);
    setActiveSector(key);
    setStoreOpen(false);
    const viewport = worldPanRef.current;
    if (!viewport || !nextSector) return;
    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    viewport.scrollTo({
      left: Math.max(0, maxScroll * nextSector.pan),
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <section id="world" className="sellio-section sl-imm-world" aria-labelledby="sellio-world-heading">
      <div className="sellio-container">
        <div className="sl-imm-heading sl-imm-heading--world">
          <div>
            <span className="sellio-eyebrow sellio-eyebrow--dark"><Compass /> Sellio World</span>
            <h2 id="sellio-world-heading">A marketplace designed<br />as a place to explore.</h2>
          </div>
          <p>F&B, Retail and Services each have a place in the live marketplace, so every new merchant can be allocated to the right district from the day they join.</p>
        </div>

        <div className="sl-imm-world-browser">
          <div className="sl-imm-world-toolbar">
            <div className="sl-imm-world-tabs" role="tablist" aria-label="Marketplace districts">
              {SECTORS.map(({ key, name, Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeSector === key}
                  className={activeSector === key ? 'is-active' : ''}
                  onClick={() => selectSector(key)}
                >
                  <Icon /><span>{name}</span>
                </button>
              ))}
            </div>
            <span className="sl-imm-world-status"><i /> Sellio World · Live</span>
          </div>

          <AnimatePresence mode="wait">
            {!storeOpen ? (
              <motion.div
                key="world"
                className="sl-world-stage"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                transition={{ duration: .3 }}
              >
                <div
                  ref={worldPanRef}
                  className="sl-pan-scroll sl-pan-scroll--world"
                  tabIndex="0"
                  aria-label="Swipe horizontally across Sellio World and tap a district waypoint"
                >
                  <div className={`sl-imm-world-map sl-pan-canvas sl-pan-canvas--world is-${activeSector}`}>
                    <img
                      src="/assets/immersive/sector-world.webp"
                      alt="An immersive Sellio marketplace world with connected food and beverage, retail and services districts"
                    />
                    <div className="sl-imm-world-vignette" aria-hidden="true" />
                    <button type="button" className="sl-imm-district-label sl-imm-district-label--fnb" onClick={() => selectSector('fnb')}><Utensils /><span><strong>F&B District</strong><small>Live district</small></span></button>
                    <button type="button" className="sl-imm-district-label sl-imm-district-label--retail" onClick={() => selectSector('retail')}><ShoppingBag /><span><strong>Retail Avenue</strong><small>Open for onboarding</small></span></button>
                    <button type="button" className="sl-imm-district-label sl-imm-district-label--services" onClick={() => selectSector('services')}><BriefcaseBusiness /><span><strong>Services Garden</strong><small>Open for onboarding</small></span></button>

                    <button type="button" className="sl-imm-merchant-pin" onClick={() => setStoreOpen(true)}>
                      <span><Coffee /></span>
                      <span><small>Featured merchant</small><strong>Cafetelier</strong><em>Enter storefront <ArrowRight /></em></span>
                    </button>
                  </div>
                </div>
                <div className="sl-pan-hint"><MoveHorizontal /> Swipe across the world · Tap a district</div>
                <div className="sl-world-copy-panel">
                  <span>{sector.status}</span>
                  <h3>{sector.name}</h3>
                  <p>{sector.summary}</p>
                  <div><MapPin /> New merchants are placed in the sector that matches their business.</div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="storefront"
                className="sl-world-stage"
                initial={reduceMotion ? false : { opacity: 0, scale: 1.015 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: .99 }}
                transition={{ duration: .36 }}
              >
                <div className="sl-pan-scroll sl-pan-scroll--storefront" tabIndex="0" aria-label="Swipe horizontally to explore the merchant storefront">
                  <div className="sl-imm-storefront sl-pan-canvas sl-pan-canvas--storefront">
                    <img
                      src="/assets/immersive/storefront-zoom.webp"
                      alt="A premium close-up of an individual merchant storefront inside Sellio World"
                    />
                    <div className="sl-imm-storefront__shade" aria-hidden="true" />
                  </div>
                </div>
                <button type="button" className="sl-imm-storefront__back sl-storefront-back-fixed" onClick={() => setStoreOpen(false)}><ArrowLeft /> Back to district</button>
                <div className="sl-pan-hint"><MoveHorizontal /> Swipe to explore the storefront</div>
                <div className="sl-storefront-details">
                  <div>
                    <span><Store /> Storefront zoom</span>
                    <h3>Cafetelier</h3>
                    <p>The world moves from district discovery into a merchant-owned space. Brand colours, products, content and future decorative choices remain specific to the merchant.</p>
                  </div>
                  <div className="sl-imm-storefront__features">
                    <span><Check /> Recognisable merchant identity</span>
                    <span><Check /> Direct path into browsing and ordering</span>
                    <span><Palette /> Decoration anchors for future seasonal themes</span>
                  </div>
                  <div className="sl-imm-storefront__actions">
                    <a href={DEMO_STORE_URL} target="_blank" rel="noopener noreferrer">Explore demo store <ArrowRight /></a>
                    <button type="button" onClick={() => setStoreOpen(false)}>Return to world</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="sl-imm-allocation">
            <span><b>1</b><i>Merchant joins</i></span><ArrowRight />
            <span><b>2</b><i>Business sector identified</i></span><ArrowRight />
            <span><b>3</b><i>District plot allocated</i></span><ArrowRight />
            <span><b>4</b><i>Branded storefront opens</i></span>
          </div>
        </div>
      </div>
    </section>
  );
}
