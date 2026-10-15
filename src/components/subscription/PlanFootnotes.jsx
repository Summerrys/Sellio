import React from 'react';
import { MULTI_OUTLET_URL, SETUP_OFFER } from '@/lib/plans';

// Lines under the plan cards in the app: multi-outlet enquiries and the optional
// done-for-you setup. Both open Sellio's WhatsApp.
export default function PlanFootnotes({ showSetup = true }) {
  const link = { fontWeight: 600, color: '#0f172a', textDecoration: 'underline' };
  return (
    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, lineHeight: 1.5, color: '#64748b', textAlign: 'center' }}>
      <p style={{ margin: 0 }}>
        Multi-outlet?{' '}
        <a href={MULTI_OUTLET_URL} target="_blank" rel="noopener noreferrer" style={link}>Talk to us on WhatsApp</a>
      </p>
      {showSetup && (
        <p style={{ margin: 0 }}>
          Want us to set it up for you? Done-for-you setup is SGD {SETUP_OFFER.price} one-time: {SETUP_OFFER.includes}.{' '}
          <a href={SETUP_OFFER.url} target="_blank" rel="noopener noreferrer" style={link}>Book on WhatsApp</a>
        </p>
      )}
    </div>
  );
}
