import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Coins, LockKeyhole, MapPinned, Sparkles } from 'lucide-react';
import { WORLD_DISTRICTS } from './landingData';

const DEMO_STORE_URL = '/store/cafetelier?preview=true';

function DistrictTile({ district, index }) {
  const reduceMotion = useReducedMotion();
  const { Icon } = district;
  const isLive = district.status === 'live';
  const isInfo = district.status === 'info';
  const interactive = isLive || isInfo;

  const content = (
    <>
      <div className="sellio-world-building" style={{ '--district-color': district.color }}>
        <div className="sellio-world-building__roof">
          <Icon aria-hidden="true" />
        </div>
        <div className="sellio-world-building__body">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="sellio-world-tile__copy">
        <div className="sellio-world-tile__title-row">
          <h3>{district.name}</h3>
          {interactive ? <ArrowUpRight aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
        </div>
        <p>{district.category}</p>
        <span
          className="sellio-world-status"
          data-status={district.status}
        >
          {district.status === 'live' ? 'Open now' : district.status === 'info' ? 'Visit helpdesk' : district.status === 'soon' ? 'Opening next' : 'Future district'}
        </span>
      </div>
    </>
  );

  const animation = reduceMotion ? {} : {
    initial: { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.25 },
    transition: { duration: 0.5, delay: Math.min(index * 0.05, 0.3) },
  };

  if (isLive) {
    return (
      <motion.a
        href={DEMO_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="sellio-world-tile is-live"
        aria-label="Open the Sellio F&B demo storefront"
        {...animation}
      >
        {content}
      </motion.a>
    );
  }

  if (isInfo) {
    return (
      <motion.a
        href="https://apptelier.sg"
        target="_blank"
        rel="noopener noreferrer"
        className="sellio-world-tile is-info"
        aria-label="Visit Apptélier helpdesk"
        {...animation}
      >
        {content}
      </motion.a>
    );
  }

  return (
    <motion.div className="sellio-world-tile is-locked" {...animation}>
      {content}
    </motion.div>
  );
}

export default function SellioWorld() {
  return (
    <section id="world" className="sellio-section sellio-world-section" aria-labelledby="sellio-world-heading">
      <div className="sellio-container">
        <div className="sellio-section-heading sellio-section-heading--center">
          <span className="sellio-eyebrow"><MapPinned aria-hidden="true" /> Sellio World</span>
          <h2 id="sellio-world-heading">A marketplace that can grow into a world.</h2>
          <p>
            Begin in the Restaurant district today. Over time, new districts can bring different industries,
            merchants and communities together under one connected Sellio experience.
          </p>
        </div>

        <div className="sellio-world-shell">
          <div className="sellio-world-toolbar">
            <div>
              <span className="sellio-world-live-dot" />
              <strong>World preview</strong>
              <span>1 district open</span>
            </div>
            <div className="sellio-world-toolbar__future">
              <Coins aria-hidden="true" />
              <span>Coins arriving in a future phase</span>
            </div>
          </div>

          <div className="sellio-world-map">
            <div className="sellio-world-road sellio-world-road--horizontal" aria-hidden="true" />
            <div className="sellio-world-road sellio-world-road--vertical" aria-hidden="true" />
            <div className="sellio-world-orb sellio-world-orb--one" aria-hidden="true" />
            <div className="sellio-world-orb sellio-world-orb--two" aria-hidden="true" />
            <div className="sellio-world-grid">
              {WORLD_DISTRICTS.map((district, index) => (
                <DistrictTile key={district.key} district={district} index={index} />
              ))}
            </div>
          </div>

          <div className="sellio-world-legend">
            <span><i className="is-open" /> Available</span>
            <span><i className="is-next" /> Coming next</span>
            <span><i className="is-future" /> Future roadmap</span>
            <span className="sellio-world-legend__note"><Sparkles aria-hidden="true" /> No merchant is listed without opting in.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
