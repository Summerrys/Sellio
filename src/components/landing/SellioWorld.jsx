import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  Compass,
  MapPin,
  HandPointer,
  MousePointer2,
  Palette,
  ShoppingBag,
  Utensils,
  X,
} from 'lucide-react';
import { SELLIO_IMMERSIVE_ASSETS, SELLIO_IMMERSIVE_MOBILE_ASSETS } from './immersiveAssets';

const SECTORS = [
  {
    key: 'retail',
    name: 'Retail Avenue',
    status: 'Open for onboarding',
    Icon: ShoppingBag,
    pan: .22,
    origin: '39% 40%',
    mobileOrigin: '30% 54%',
    summary: 'Boutiques and product-led merchants receive a recognisable storefront along a dedicated retail route.',
  },
  {
    key: 'fnb',
    name: 'F&B District',
    status: 'Live district',
    Icon: Utensils,
    pan: .48,
    origin: '52% 54%',
    mobileOrigin: '50% 61%',
    summary: 'Restaurants, cafés, bakeries and beverage concepts live around shared discovery and ordering routes.',
  },
  {
    key: 'services',
    name: 'Services Garden',
    status: 'Open for onboarding',
    Icon: BriefcaseBusiness,
    pan: .78,
    origin: '65% 32%',
    mobileOrigin: '72% 50%',
    summary: 'Wellness, studios and professional services occupy a calmer appointment-led neighbourhood.',
  },
];

export default function SellioWorld() {
  const [activeSector, setActiveSector] = useState(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const worldPanRef = useRef(null);
  const storefrontPanRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const [mobileScene, setMobileScene] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches);
  const sector = useMemo(
    () => SECTORS.find((item) => item.key === activeSector) || null,
    [activeSector],
  );

  const selectSector = (key) => {
    if (key === 'fnb') {
      enterStorefront();
      return;
    }
    setActiveSector(key);
    setStoreOpen(false);
  };

  const enterStorefront = () => {
    setActiveSector('fnb');
    setStoreOpen(true);
  };

  const returnToWorld = () => {
    setStoreOpen(false);
    setActiveSector(null);
  };

  useEffect(() => {
    const query = window.matchMedia('(max-width: 600px)');
    const update = () => setMobileScene(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const viewport = storeOpen ? storefrontPanRef.current : worldPanRef.current;
      if (!viewport) return;
      const maxScroll = viewport.scrollWidth - viewport.clientWidth;
      const progress = mobileScene ? 0 : (storeOpen ? .7 : (sector?.pan ?? .25));
      viewport.scrollTo({
        left: Math.max(0, maxScroll * progress),
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mobileScene, reduceMotion, sector?.pan, storeOpen]);

  return (
    <section id="world-experience" className="sellio-section sl-imm-world sl-cinematic-world" aria-labelledby="sellio-world-heading">
      <div className="sl-cinematic-world__stage">
        <AnimatePresence mode="wait">
          {!storeOpen ? (
            <motion.div
              key="world"
              className="sl-world-stage sl-world-stage--map"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: .35 }}
            >
              <div
                ref={worldPanRef}
                className="sl-pan-scroll sl-pan-scroll--world"
                tabIndex="0"
                aria-label="Interactive Sellio World map. Pan horizontally and select a destination."
              >
                <motion.div
                  className={`sl-imm-world-map sl-pan-canvas sl-pan-canvas--world ${sector ? 'has-focus' : ''}`}
                  animate={reduceMotion ? undefined : { scale: sector ? (mobileScene ? 1.055 : 1.065) : 1 }}
                  transition={{ duration: .65, ease: [0.2, 0.8, 0.2, 1] }}
                  style={{ transformOrigin: sector ? (mobileScene ? sector.mobileOrigin : sector.origin) : '50% 50%' }}
                >
                  <picture className="sl-responsive-art">
                    <source media="(max-width: 600px)" srcSet={SELLIO_IMMERSIVE_MOBILE_ASSETS.world} />
                    <img
                      src={SELLIO_IMMERSIVE_ASSETS.world}
                      alt="Sellio World, a bright connected marketplace with food and beverage, retail and services destinations"
                      loading="lazy"
                      decoding="async"
                    />
                  </picture>
                  <div className="sl-imm-world-vignette" aria-hidden="true" />

                  <header className="sl-world-intro-overlay">
                    <span className="sellio-eyebrow sellio-eyebrow--dark"><Compass /> Sellio World</span>
                    <h2 id="sellio-world-heading">A world to explore.<br />A storefront to enter.</h2>
                    <p>Choose a destination, move through its district and enter a merchant-owned storefront.</p>
                  </header>

                  {SECTORS.map(({ key, name, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      className={`sl-map-pin sl-map-pin--${key} ${key === 'fnb' ? 'sl-map-pin--featured' : ''} ${activeSector === key ? 'is-active' : ''}`}
                      onClick={() => selectSector(key)}
                      aria-label={key === 'fnb' ? 'Enter Cafetelier, the featured storefront in F&B District' : `Explore ${name}`}
                      aria-pressed={activeSector === key}
                    >
                      <i><Icon aria-hidden="true" /></i>
                      {key === 'fnb' ? (
                        <span><strong>F&amp;B District</strong><small>Featured · Cafetelier</small></span>
                      ) : (
                        <span>{name}</span>
                      )}
                    </button>
                  ))}
                </motion.div>
              </div>

              <div className="sl-map-instruction"><MousePointer2 aria-hidden="true" /> Tap a destination</div>

              <AnimatePresence>
                {sector && (
                  <motion.aside
                    key={sector.key}
                    className="sl-map-detail-overlay"
                    initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: 12 }}
                    transition={{ duration: .3 }}
                    aria-live="polite"
                  >
                    <button type="button" className="sl-map-detail-overlay__close" onClick={() => setActiveSector(null)} aria-label="Close district details"><X /></button>
                    <span><MapPin /> {sector.status}</span>
                    <h3>{sector.name}</h3>
                    <p>{sector.summary}</p>
                  </motion.aside>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="storefront"
              className="sl-world-stage sl-world-stage--storefront"
              initial={reduceMotion ? false : { opacity: 0, scale: 1.035 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, scale: .99 }}
              transition={{ duration: .55, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div
                ref={storefrontPanRef}
                className="sl-pan-scroll sl-pan-scroll--storefront"
                tabIndex="0"
                aria-label="Cafetelier storefront panorama. Pan horizontally to explore."
              >
                <div className="sl-imm-storefront sl-pan-canvas sl-pan-canvas--storefront">
                  <picture className="sl-responsive-art">
                    <source media="(max-width: 600px)" srcSet={SELLIO_IMMERSIVE_MOBILE_ASSETS.storefront} />
                    <img
                      src={SELLIO_IMMERSIVE_ASSETS.storefront}
                      alt="Cafetelier storefront inside Sellio World"
                      loading="lazy"
                      decoding="async"
                    />
                  </picture>
                  <div className="sl-imm-storefront__shade" aria-hidden="true" />

                  <div className="sl-storefront-door-cue" aria-label="Cafetelier entrance">
                    <button
                      type="button"
                      className="sl-storefront-door-cue__trigger"
                      aria-label="Enter Cafetelier counter experience"
                      title="Counter scene will be connected after the final counter artwork is approved"
                    >
                      <HandPointer aria-hidden="true" />
                    </button>
                    <div className="sl-storefront-door-cue__card">
                      <strong>Step inside Cafetelier</strong>
                      <span>Meet Sellio AI at the counter.</span>
                    </div>
                  </div>
                </div>
              </div>

              <button type="button" className="sl-storefront-back-fixed" onClick={returnToWorld}><ArrowLeft /> Back to Sellio World</button>

              <div className="sl-storefront-feature-dock">
                <span><Check /> Recognisable merchant identity</span>
                <span><Check /> Direct browsing and ordering</span>
                <span><Palette /> Seasonal decoration anchors</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </section>
  );
}
