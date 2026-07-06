import React, { useState } from 'react';
import { promptInstall, hasNativePrompt, isIOS, isAndroid } from '@/lib/pwaInstall';

const IOS_STEPS = [
  'Tap the Share icon in Safari\u2019s toolbar',
  'Scroll down and tap "Add to Home Screen"',
  'Tap "Add" in the top right corner',
];

const ANDROID_STEPS = [
  'Tap the \u22ee menu in the top right of your browser',
  'Tap "Install app" or "Add to Home screen"',
  'Confirm by tapping "Install"',
];

const DESKTOP_STEPS = [
  'Look for the install icon in your browser\u2019s address bar',
  'Or open the browser menu and choose "Install Sellio"',
  'Confirm to add it as an app on your device',
];

export default function InstallPWAModal({ open, onClose }) {
  const [installing, setInstalling] = useState(false);
  const [showManualSteps, setShowManualSteps] = useState(false);

  if (!open) return null;

  const manualSteps = isIOS() ? IOS_STEPS : isAndroid() ? ANDROID_STEPS : DESKTOP_STEPS;

  const handleInstall = async () => {
    // Re-check at click time — the native prompt may have arrived after this
    // modal first opened, since beforeinstallprompt can fire with a delay.
    if (hasNativePrompt()) {
      setInstalling(true);
      const result = await promptInstall();
      setInstalling(false);
      onClose();
      return;
    }
    // No native prompt available (yet, or ever, e.g. iOS) — show manual steps
    // for whichever platform the visitor is on instead of doing nothing.
    setShowManualSteps(true);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 440,
          padding: '28px 24px 32px', boxShadow: '0 -8px 30px rgba(0,0,0,0.15)',
          animation: 'slideUpInstall 0.3s ease-out',
        }}
      >
        <style>{`@keyframes slideUpInstall { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {!showManualSteps ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 20 }}>
              <img
                src="https://assets.apptelier.sg/sellio/Logo_sellio.png"
                alt="Sellio"
                style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginBottom: 14 }}
              />
              <p style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Install Sellio</p>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                Get quick access from your home screen — no App Store needed. Launch it like a real app, even offline-friendly for quick glances.
              </p>
            </div>

            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              style={{
                width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #fb923c, #e0449a, #8b2fc9)',
                color: 'white', fontSize: 14, fontWeight: 700, cursor: installing ? 'not-allowed' : 'pointer',
                marginBottom: 10,
              }}
            >
              {installing ? 'Installing…' : 'Install Sellio'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Not now
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 14px', textAlign: 'center' }}>Add Sellio to your Home Screen</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {manualSteps.map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'white' }}>{i + 1}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>{step}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: '#0f172a', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Got it
            </button>
          </>
        )}
      </div>
    </div>
  );
}
