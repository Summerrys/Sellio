import React from 'react';
import { INDONESIA_PAYMENT_NOTE, MULTI_OUTLET_URL, SETUP_OFFER } from '@/lib/plans';
import { outsideLinkProps } from '@/lib/nativeApp';
import { useAppText } from '@/lib/appText';

// Lines under the plan cards in the app: multi-outlet enquiries and the optional
// done-for-you setup. Both open Sellio's WhatsApp (in the Android app too, see nativeApp.js).
// Indonesia's prices (region 'ID', lib/plans.js): how they're paid, and no setup visit (it's
// done in person in Singapore).
export default function PlanFootnotes({ showSetup = true, region = 'SG' }) {
  const { t } = useAppText();
  const link = { fontWeight: 600, color: '#0f172a', textDecoration: 'underline' };
  const indonesia = region === 'ID';
  return (
    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, lineHeight: 1.5, color: '#64748b', textAlign: 'center' }}>
      {indonesia && <p data-testid="plan-payment-note" style={{ margin: 0 }}>{t(INDONESIA_PAYMENT_NOTE)}</p>}
      <p style={{ margin: 0 }}>
        {t('Multi-outlet?')}{' '}
        <a {...outsideLinkProps(MULTI_OUTLET_URL)} style={link}>{t('Talk to us on WhatsApp')}</a>
      </p>
      {showSetup && !indonesia && (
        <p style={{ margin: 0 }}>
          {t('Want us to set it up for you? Done-for-you setup is SGD {price} one-time: {includes}.', { price: SETUP_OFFER.price, includes: t(SETUP_OFFER.includes) })}{' '}
          <a {...outsideLinkProps(SETUP_OFFER.url)} style={link}>{t('Book on WhatsApp')}</a>
        </p>
      )}
    </div>
  );
}
