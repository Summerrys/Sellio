import React from 'react';
import { isIOS, isAndroid, isChromeOnIOS } from '@/lib/pwaInstall';
import { useBackToClose } from '@/lib/useBackToClose';
import { useAppText, N_ } from '@/lib/appText';

const IOS_STEPS = [
  N_('Tap the Share icon in Safari’s toolbar'),
  N_('Scroll down and tap "Add to Home Screen"'),
  N_('Tap "Add" in the top right corner'),
];

// Chrome on an iPhone or iPad: its Share icon sits in the address bar.
const IOS_CHROME_STEPS = [
  N_('Tap the Share icon in the address bar'),
  N_('Scroll down and tap "Add to Home Screen"'),
  N_('Tap "Add"'),
];

const ANDROID_STEPS = [
  N_('Tap the ⋮ menu in the top right of your browser'),
  N_('Tap "Install app" or "Add to Home screen"'),
  N_('Confirm by tapping "Install"'),
];

const DESKTOP_STEPS = [
  N_('Look for the install icon in your browser’s address bar'),
  N_('Or open the browser menu and choose "Install Sellio"'),
  N_('Confirm to add it as an app on your device'),
];

// How to add Sellio to the home screen, for a browser that can't install it with one tap
// (Safari or Chrome on an iPhone or iPad, or a browser that hasn't offered it): opened by
// Install on the "Install Sellio" banner (InstallBanner).
export default function InstallPWAModal({ open, onClose }) {
  const { t } = useAppText();
  useBackToClose(open, onClose); // phone / browser Back closes it

  if (!open) return null;

  const phone = isIOS() || isAndroid();
  const steps = isIOS() ? (isChromeOnIOS() ? IOS_CHROME_STEPS : IOS_STEPS) : isAndroid() ? ANDROID_STEPS : DESKTOP_STEPS;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sellio-install-steps-title"
      style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(15,23,42,0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 440,
          padding: '28px 24px 32px', boxShadow: '0 -8px 30px rgba(0,0,0,0.15)',
          animation: 'slideUpInstall 0.3s ease-out',
        }}
      >
        <style>{`@keyframes slideUpInstall { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        <p id="sellio-install-steps-title" style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 6px', textAlign: 'center' }}>
          {phone ? t('Add Sellio to your Home Screen') : t('Install Sellio on this computer')}
        </p>
        {phone && (
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px', lineHeight: 1.5, textAlign: 'center' }}>
            {t('Get quick access from your home screen — no app store needed. It opens like a real app.')}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: phone ? '0 0 20px' : '12px 0 20px' }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'white' }}>{i + 1}</span>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>{t(step)}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: '#0f172a', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          {t('Got it')}
        </button>
      </div>
    </div>
  );
}
