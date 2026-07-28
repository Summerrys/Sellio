import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  Coffee,
  Coins,
  MapPinned,
  Paintbrush,
  Scissors,
  ShoppingBag,
  Sparkles,
  Store,
  UtensilsCrossed,
  WandSparkles,
} from 'lucide-react';

const DEMO_STORE_URL = '/store/cafetelier?preview=true';

const SECTORS = [
  {
    key: 'fnb',
    label: 'F&B Quarter',
    shortLabel: 'F&B',
    description: 'Restaurants, cafés, bakeries and food merchants.',
    Icon: UtensilsCrossed,
    color: '#fb923c',
    status: 'Marketplace foundation',
    merchants: [
      { key: 'cafetelier', name: 'Cafetelier', type: 'Café · Brunch', Icon: Coffee, featured: true, tone: 'orange' },
      { key: 'noodle', name: 'Noodle House', type: 'Asian · Noodles', Icon: UtensilsCrossed, tone: 'pink' },
      { key: 'bakery', name: 'Daily Bake', type: 'Bakery · Pastries', Icon: Sparkles, tone: 'purple' },
    ],
  },
  {
    key: 'retail',
    label: 'Retail Avenue',
    shortLabel: 'Retail',
    description: 'Fashion, lifestyle, home and speciality retail.',
    Icon: ShoppingBag,
    color: '#9b5de5',
    status: 'Expandable sector',
    merchants: [
      { key: 'atelier-goods', name: 'Atelier Goods', type: 'Lifestyle · Home', Icon: ShoppingBag, tone: 'purple' },
      { key: 'new-retail', name: 'Your retail store', type: 'Next available lot', Icon: Store, placeholder: true, tone: 'pink' },
    ],
  },
  {
    key: 'services',
    label: 'Services Garden',
    shortLabel: 'Services',
    description: 'Beauty, wellness, professional and appointment services.',
    Icon: Scissors,
    color: '#10b981',
    status: 'Expandable sector',
    merchants: [
      { key: 'wellness', name: 'Wellness Studio', type: 'Wellness · Booking', Icon: Sparkles, tone: 'green' },
      { key: 'new-service', name: 'Your service brand', type: 'Next available lot', Icon: Building2, placeholder: true, tone: 'orange' },
    ],
  },
];

function MiniBuilding({ merchant, onSelect, disabled }) {
  const Icon = merchant.Icon;
  const body = (
    <>
      <div className={'sellio-zone-building is-' + merchant.tone}>
        <div className="sellio-zone-building__roof"><Icon aria-hidden="true" /></div>
        <div className="sellio-zone-building__body"><span /><span /><i /></div>
      </div>
      <div className="sellio-zone-merchant__copy"><strong>{merchant.name}</strong><small>{merchant.type}</small></div>
      {merchant.featured && <span className="sellio-zone-featured"><Sparkles /> Explore store</span>}
      {merchant.placeholder && <span className="sellio-zone-open-lot">Auto-allocated lot</span>}
    </>
  );

  if (disabled || merchant.placeholder) return <div className={'sellio-zone-merchant ' + (merchant.placeholder ? 'is-placeholder' : '')}>{body}</div>;
  return <button type="button" className="sellio-zone-merchant" onClick={() => onSelect(merchant)} aria-label={'Zoom into ' + merchant.name + ' storefront'}>{body}<ChevronRight aria-hidden="true" /></button>;
}

function SectorWorld({ sector, onMerchantSelect }) {
  const SectorIcon = sector.Icon;
  return (
    <div className="sellio-sector-world">
      <div className="sellio-sector-horizon" aria-hidden="true"><span /><span /><span /></div>
      <div className="sellio-sector-sign" style={{ '--sector': sector.color }}><SectorIcon /><span><small>Sellio World</small><strong>{sector.label}</strong></span></div>
      <div className="sellio-sector-road sellio-sector-road--one" aria-hidden="true" />
      <div className="sellio-sector-road sellio-sector-road--two" aria-hidden="true" />
      <div className="sellio-sector-merchants">
        {sector.merchants.map((merchant) => <MiniBuilding key={merchant.key} merchant={merchant} onSelect={onMerchantSelect} disabled={sector.key !== 'fnb' && !merchant.placeholder} />)}
        <div className="sellio-zone-next-lot"><span>+</span><strong>Next merchant</strong><small>Placed automatically in {sector.shortLabel}</small></div>
      </div>
      <div className="sellio-sector-edge sellio-sector-edge--retail"><ShoppingBag /><span>Retail Avenue</span></div>
      <div className="sellio-sector-edge sellio-sector-edge--services"><Scissors /><span>Services Garden</span></div>
    </div>
  );
}

function StorefrontZoom({ merchant, onBack }) {
  const Icon = merchant.Icon;
  return (
    <div className="sellio-store-zoom">
      <div className="sellio-store-zoom__bar">
        <button type="button" onClick={onBack}><ArrowLeft /> Back to world</button>
        <div><span>World</span><ChevronRight /><span>F&B Quarter</span><ChevronRight /><strong>{merchant.name}</strong></div>
        <span><MapPinned /> Storefront view</span>
      </div>

      <div className="sellio-store-zoom__scene">
        <div className="sellio-storefront-building">
          <div className="sellio-storefront-awning"><i /><i /><i /><i /><i /></div>
          <div className="sellio-storefront-sign"><Icon /><span><small>Welcome to</small><strong>{merchant.name}</strong></span></div>
          <div className="sellio-storefront-window"><span><Coffee /><small>Signature Latte</small><b>$6.80</b></span><span><Sparkles /><small>Berry Croissant</small><b>$7.20</b></span></div>
          <div className="sellio-storefront-door"><span>Open</span></div>
          <div className="sellio-storefront-decor"><i /><i /><i /></div>
        </div>

        <div className="sellio-store-panel">
          <span className="sellio-store-panel__label">Merchant storefront</span>
          <h3>{merchant.name}</h3>
          <p>Every merchant keeps its own identity while living inside the appropriate Sellio World neighbourhood.</p>
          <div className="sellio-store-panel__actions"><a href={DEMO_STORE_URL} target="_blank" rel="noopener noreferrer">Enter demo store <ArrowRight /></a><button type="button"><Coins /> 240 coins</button></div>
          <div className="sellio-store-panel__features"><span><Check /> Own colours and products</span><span><Check /> Seasonal decorations</span><span><Check /> Marketplace discovery</span></div>
        </div>
      </div>
    </div>
  );
}

export default function SellioWorld() {
  const [activeSectorKey, setActiveSectorKey] = useState('fnb');
  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const reduceMotion = useReducedMotion();
  const activeSector = SECTORS.find((sector) => sector.key === activeSectorKey) || SECTORS[0];

  const selectSector = (sectorKey) => {
    setSelectedMerchant(null);
    setActiveSectorKey(sectorKey);
  };

  return (
    <section id="world" className="sellio-section sellio-world-section sellio-world-section--phase1b" aria-labelledby="sellio-world-heading">
      <div className="sellio-container">
        <div className="sellio-world-heading-layout">
          <div className="sellio-section-heading">
            <span className="sellio-eyebrow"><MapPinned aria-hidden="true" /> Sellio World</span>
            <h2 id="sellio-world-heading">A marketplace designed as a world from day one.</h2>
          </div>
          <div className="sellio-world-heading-copy"><p>Sellio World grows by sector, not by waiting. Every new merchant is allocated to the right neighbourhood, while each storefront remains distinctly theirs.</p><span><WandSparkles /> Marketplace and gamification evolve together</span></div>
        </div>

        <div className="sellio-world-browser">
          <div className="sellio-sector-tabs" role="tablist" aria-label="Sellio World sectors">
            {SECTORS.map((sector) => {
              const Icon = sector.Icon;
              return <button key={sector.key} type="button" role="tab" aria-selected={sector.key === activeSectorKey} className={sector.key === activeSectorKey ? 'is-active' : ''} onClick={() => selectSector(sector.key)} style={{ '--sector': sector.color }}><Icon /><span><strong>{sector.label}</strong><small>{sector.status}</small></span></button>;
            })}
            <div className="sellio-world-browser__coins"><Coins /><span><strong>Sellio Coins</strong><small>Progression layer</small></span></div>
          </div>

          <div className="sellio-world-viewport">
            <AnimatePresence mode="wait">
              <motion.div key={selectedMerchant ? 'merchant-' + selectedMerchant.key : 'sector-' + activeSector.key} initial={reduceMotion ? false : { opacity: 0, scale: selectedMerchant ? .94 : 1.025 }} animate={{ opacity: 1, scale: 1 }} exit={reduceMotion ? undefined : { opacity: 0, scale: selectedMerchant ? 1.03 : .97 }} transition={{ duration: reduceMotion ? 0 : .42, ease: [0.22, 1, 0.36, 1] }}>
                {selectedMerchant ? <StorefrontZoom merchant={selectedMerchant} onBack={() => setSelectedMerchant(null)} /> : <SectorWorld sector={activeSector} onMerchantSelect={setSelectedMerchant} />}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="sellio-world-browser__footer">
            <span><i className="is-sector" /> Sector zone</span><span><i className="is-merchant" /> Merchant lot</span><span><i className="is-progress" /> Progression layer</span><p><Paintbrush /> Storefront identity stays with the merchant.</p>
          </div>
        </div>

        <div className="sellio-world-allocation">
          <div><span>01</span><strong>Merchant selects a sector</strong><small>F&B, Retail or Services</small></div><ArrowRight />
          <div><span>02</span><strong>Sellio allocates a neighbourhood lot</strong><small>The world expands without empty districts</small></div><ArrowRight />
          <div><span>03</span><strong>The merchant decorates its storefront</strong><small>Brand, products and seasonal cosmetics</small></div><ArrowRight />
          <div><span>04</span><strong>Customers zoom in and shop</strong><small>From discovery to the existing storefront</small></div>
        </div>
      </div>
    </section>
  );
}
