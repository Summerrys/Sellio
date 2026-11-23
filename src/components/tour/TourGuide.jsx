import { useEffect, useState } from 'react';
import Joyride, { EVENTS, STATUS } from 'react-joyride';
import { AlertTriangle } from 'lucide-react';
import { useAppText } from '@/lib/appText';

const BRAND_GRADIENT = 'linear-gradient(135deg, #fb923c, #e0449a, #8b5cf6)';

// The part of the screen a step's target can be seen in: below the app's header and above the
// tab bar, which both stay put as the page scrolls (data-app-header: Layout's headers and
// Explore's; the tab bar is data-tour="bottom-nav").
function clearArea() {
  const box = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
  let top = 0;
  let bottom = window.innerHeight;
  document.querySelectorAll('[data-app-header]').forEach((el) => {
    const r = box(el);
    if (r && r.top <= 1) top = Math.max(top, r.bottom);
  });
  document.querySelectorAll('[data-tour="bottom-nav"]').forEach((el) => {
    const r = box(el);
    if (r && r.bottom >= window.innerHeight - 1) bottom = Math.min(bottom, r.top);
  });
  return { top, bottom };
}

function inFixedBar(el) {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).position === 'fixed') return true;
  }
  return false;
}

// Joyride can't scroll Sellio's pages itself: it takes the page wrapper (overflow-x hidden, so
// its overflow-y counts as auto) for the thing that scrolls, scrolls that, and nothing moves.
// Its scrolling only ever moved the page for targets in a fixed bar (the Counter button, the tab
// bar, the sidebar), which never needs it, and then left the next step's target off the screen.
// So Joyride's scrolling is off and each step brings its target into the clear area here, by as
// little as it takes. The spotlight and the tooltip are placed on the page, so they move with it.
export function showStepTarget(target) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!(el instanceof HTMLElement) || el === document.body || inFixedBar(el)) return;
  const r = el.getBoundingClientRect();
  const { top, bottom } = clearArea();
  const room = 16; // the spotlight reaches 10px past its target
  let by = 0;
  if (r.top < top + room || r.height > bottom - top - 2 * room) by = r.top - (top + room);
  else if (r.bottom > bottom - room) by = r.bottom - (bottom - room);
  if (Math.abs(by) >= 1) window.scrollBy({ top: by, behavior: 'smooth' });
}

// Shared wrapper around react-joyride, used identically by all 4 stages
// (Dashboard/Products/Orders/Settings). Every step gets a Skip button; tapping
// it opens a confirm modal before actually ending the tour, so a stray tap
// doesn't silently lose someone's place.
export default function TourGuide({ steps, run, onFinish, tour }) {
  const { t } = useAppText();
  // A page slides in as it opens (.sellio-page-enter, 180ms). Measured during that, the first
  // step's spotlight stays a few pixels to the right of its target, so the tour starts after it.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), 250);
    return () => clearTimeout(timer);
  }, []);
  const handleCallback = (data) => {
    const { status, action, type } = data;
    if (type === EVENTS.TOOLTIP) showStepTarget(data.step?.target);
    // Joyride reports "finished" more than once at the end (step:after, then tour:end): the
    // stage is saved once.
    if (status === STATUS.FINISHED && type === EVENTS.TOUR_END) {
      onFinish();
    } else if (action === 'skip') {
      tour.requestSkip();
    }
  };

  // FIX: react-joyride shows a small pulsing "beacon" before the actual tooltip
  // for any step that doesn't explicitly opt out — meaning every single step
  // required an extra tap just to reveal its content. That's what looked like
  // "the tour doesn't launch immediately, there's a pulsing dot you have to tap
  // first" on the Products page. disableBeacon skips straight to the real
  // tooltip on every step.
  const stepsWithoutBeacon = steps.map(step => ({ disableBeacon: true, ...step }));

  return (
    <>
      <Joyride
        steps={stepsWithoutBeacon}
        run={run && settled}
        continuous
        showSkipButton
        showProgress
        // Each step scrolls its own target into view (showStepTarget, from the callback).
        disableScrolling
        // Leaves the page wrapper's overflow alone (Joyride's "fix" sets it to initial).
        disableScrollParentFix
        callback={handleCallback}
        locale={{ back: t('Back'), close: t('Close'), last: t('Done'), next: t('Next'), skip: t('Skip') }}
        // FIX: the gradient border only ever applied to the tooltip box itself —
        // Joyride renders the little triangle pointer as a separate element, so
        // it stayed plain white and created a visible seam where the two met.
        // Hiding it entirely (rather than trying to gradient-border something
        // that small) gives a clean, fully-bordered bubble with no seam.
        floaterProps={{ hideArrow: true }}
        styles={{
          options: {
            primaryColor: '#8b5cf6',
            zIndex: 10000,
            arrowColor: '#fff',
            backgroundColor: '#fff',
            textColor: '#0f172a',
            width: 'min(340px, calc(100vw - 32px))',
          },
          tooltip: {
            borderRadius: 16,
            padding: 18,
            border: '2px solid transparent',
            backgroundImage: `linear-gradient(#fff, #fff), ${BRAND_GRADIENT}`,
            backgroundOrigin: 'border-box',
            backgroundClip: 'padding-box, border-box',
          },
          tooltipContent: { padding: '8px 0', fontSize: 14, lineHeight: 1.5 },
          buttonNext: { borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700 },
          buttonBack: { fontSize: 13, color: '#64748b' },
          buttonSkip: { fontSize: 13, color: '#94a3b8' },
          spotlight: { borderRadius: 12 },
        }}
      />

      {tour.showSkipConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, padding: '24px 22px', maxWidth: 320, width: '100%', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <AlertTriangle className="w-5 h-5" style={{ color: '#d97706' }} />
            </div>
            <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 6px', color: '#0f172a' }}>{t('Skip the tour?')}</p>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px', lineHeight: 1.5 }}>
              {t('You can replay it anytime from Settings.')}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={tour.cancelSkip}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                {t('Cancel')}
              </button>
              <button
                onClick={tour.confirmSkip}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#0f172a', color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                {t('Skip Tour')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
