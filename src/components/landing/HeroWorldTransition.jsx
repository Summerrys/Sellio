import React from 'react';
import { BarChart3, Bell, Package, QrCode, Store, Users } from 'lucide-react';
import ScrollWorldExperience from './ScrollWorldExperience';
import SellioWorld from './SellioWorld';

function WorldCapabilities() {
  return (
    <div className="sellio-proof-strip sl-world-proof-strip" aria-label="Sellio capabilities">
      <div className="sellio-container">
        <span><Store /> Online storefront</span>
        <span><QrCode /> QR ordering</span>
        <span><Bell /> Live orders</span>
        <span><Package /> Inventory</span>
        <span><BarChart3 /> Reports</span>
        <span><Users /> Staff roles</span>
      </div>
    </div>
  );
}

export default function HeroWorldTransition() {
  return (
    <section id="sellio-entry-sequence" className="sl-entry-pages" aria-label="Sellio introduction and Sellio World">
      <div className="sl-snap-page sl-snap-page--hero">
        <ScrollWorldExperience />
      </div>

      <div className="sl-snap-page sl-snap-page--world sl-page-turn-world">
        <span id="world" className="sl-snap-world-anchor" aria-hidden="true" />
        <SellioWorld />
        <WorldCapabilities />
      </div>
    </section>
  );
}
