import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import BottomSheet from '@/components/explore/BottomSheet';
import { useAppUser } from '@/lib/AppUserContext';
import { useAppText } from '@/lib/appText';
import { STAR_WORDS } from '@/lib/ratings';
import { openOutside } from '@/lib/nativeApp';
import {
  ASK_ON_DAY, COMMENT_MAX, FEEDBACK_TOPICS, PLAY_LISTING,
  alreadyAnswered, appDaysSoFar, noteAnswered, noteAppDay, sendAppFeedback,
} from '@/lib/appFeedback';

// "How's Sellio working for you?" (lib/appFeedback.js): asked once in the Android app, on the
// third separate day someone opens Sellio, at a calm moment: 20 seconds after Sellio opens or
// comes back on screen, on a page where nobody is busy taking orders, checking out, chatting or
// signing in, with no other window open and nothing being typed (looked at again every 15
// seconds for a few minutes). In the person's language (useAppText).

const SETTLE_MS = 20000;
const RETRY_MS = 15000;
const RETRIES = 12;

// Pages where the question would get in the way.
const BUSY_PAGES = /^\/(auth|join|onboarding|shopsetup|splash|oauthconsent|orders|kitchendisplay|counter|chats|world|coinshop|admin|store|order|delete-account|explore\/cart|explore\/chats)(\/|$)/i;

export function calmMoment() {
  if (document.visibilityState !== 'visible') return false;
  if (navigator.onLine === false) return false;
  if (BUSY_PAGES.test(window.location.pathname)) return false;
  if (document.documentElement.hasAttribute('data-sellio-launch')) return false; // the launch splash
  if (document.querySelector('[role="dialog"]:not([aria-hidden="true"]), [role="alertdialog"], [aria-modal="true"], [data-sellio-push-prompt]')) return false;
  const active = document.activeElement;
  if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return false;
  return true;
}

const accountOf = (appUser) => String(appUser?.email || '').trim().toLowerCase();

// settleMs, retryMs and retries: for tests.
export default function AppRatingPrompt({ settleMs = SETTLE_MS, retryMs = RETRY_MS, retries = RETRIES }) {
  const { appUser } = useAppUser() || {};
  const account = accountOf(appUser);
  const [askedFor, setAskedFor] = useState(null); // the account it's open for ('' signed out)
  const shown = useRef(false);
  const timer = useRef(null);
  const accountNow = useRef(account);
  accountNow.current = account;

  const look = useCallback(async (triesLeft) => {
    timer.current = null;
    if (shown.current || appDaysSoFar() < ASK_ON_DAY) return;
    const later = () => { if (triesLeft > 0 && !shown.current) timer.current = setTimeout(() => look(triesLeft - 1), retryMs); };
    if (!calmMoment()) { later(); return; }
    const who = accountNow.current;
    if (await alreadyAnswered(who)) return;
    if (shown.current || who !== accountNow.current) return;
    if (!calmMoment()) { later(); return; }
    shown.current = true;
    setAskedFor(who);
  }, [retryMs]);

  const lookSoon = useCallback(() => {
    if (shown.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => look(retries), settleMs);
  }, [look, settleMs, retries]);

  // Each separate day Sellio is opened: started, or back on screen.
  useEffect(() => {
    noteAppDay();
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') { clearTimeout(timer.current); return; }
      noteAppDay();
      lookSoon();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(timer.current);
    };
  }, [lookSoon]);

  // Sellio opened, or someone signed in or out: look in a moment.
  useEffect(() => { lookSoon(); }, [account, lookSoon]);

  if (askedFor == null) return null;
  return <AppRatingSheet open account={askedFor} onClose={() => setAskedFor(null)} />;
}

// Colours (Alvin, 20 Nov 2026): the person's own, from the colour theme they chose in Settings
// (AppUserContext puts it on the page; Sellio's blue to purple without one), and the stars a
// bright golden yellow.
export const THEME = 'rgb(var(--color-primary, 59 130 246))';
export const THEME_FILL = 'var(--color-primary-gradient, linear-gradient(135deg, #3b82f6 0%, #9333ea 100%))';
export const THEME_TINT = 'rgb(var(--color-primary, 59 130 246) / 0.1)';
export const STAR_GOLD = '#FBBC04';
const STAR_PATH = 'M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.47L12 17.46l-5.8 3.06 1.1-6.47-4.7-4.6 6.5-.95L12 2.6z';

function StarRow({ stars, size, onPick, disabled, t }) {
  const box = size + 16;
  return (
    <div role="radiogroup" aria-label={t('Stars')} className="flex justify-center" style={{ gap: size >= 40 ? 4 : 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={stars === n}
          aria-label={n === 1 ? t('1 star: {words}', { words: t(STAR_WORDS[n]) }) : t('{count} stars: {words}', { count: n, words: t(STAR_WORDS[n]) })}
          disabled={disabled}
          onClick={() => onPick(n)}
          className="flex items-center justify-center rounded-[14px] active:bg-slate-100"
          style={{ width: box, height: box, background: 'none', border: 'none', padding: 0, cursor: disabled ? 'default' : 'pointer' }}
        >
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path
              d={STAR_PATH}
              fill={n <= stars ? STAR_GOLD : 'none'}
              stroke={n <= stars ? STAR_GOLD : '#64748b'}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ))}
    </div>
  );
}

const title = 'm-0 text-center text-[21px] leading-7 font-bold text-slate-900';
const lead = 'mt-2 mb-0 text-center text-[15px] leading-[22px] text-slate-600';
const mainButton = 'w-full h-[52px] rounded-[14px] text-white text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-60';
const quietButton = 'w-full h-12 mt-1 rounded-xl bg-transparent text-base font-semibold text-slate-600 active:bg-slate-100';

// The question and what follows it. account: whose answer it is ('' when signed out). Every way
// out counts as the answer (Maybe later, Skip, or closing it with Back or a tap outside), so it
// isn't asked again. preview: an admin trying it from Admin → Feedback; nothing is sent or kept.
export function AppRatingSheet({ open, account = '', onClose, preview = false }) {
  const { t, language } = useAppText('explore');
  const signedIn = !!account;
  const [step, setStep] = useState('ask'); // ask | low | five | sent
  const [stars, setStars] = useState(0);
  const [topics, setTopics] = useState([]);
  const [comment, setComment] = useState('');
  const [contactOk, setContactOk] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const answered = useRef(false);

  // The answer, sent once (a failed Send feedback can be sent again).
  const answer = useCallback((what) => {
    if (answered.current || preview) return Promise.resolve(null);
    answered.current = true;
    noteAnswered(account);
    return sendAppFeedback({ ...what, language });
  }, [account, language, preview]);
  const answerQuietly = (what) => { answer(what).catch(() => {}); };

  const pick = (n) => {
    if (sending) return;
    setStars(n);
    setError('');
    setStep(n === 5 ? 'five' : 'low');
  };

  const close = () => {
    if (sending) return;
    if (step === 'ask') answerQuietly({ outcome: 'dismissed' });
    else if (step === 'low') answerQuietly({ outcome: 'rated', stars });
    else if (step === 'five') answerQuietly({ outcome: 'rated', stars: 5 });
    onClose();
  };

  const sendFeedback = async () => {
    if (sending) return;
    setSending(true);
    setError('');
    try {
      await answer({ outcome: 'rated', stars, topics, comment, contactOk: signedIn && contactOk });
      setStep('sent');
    } catch {
      answered.current = false;
      setError(t("Couldn't send that. Check your connection and try again."));
    } finally {
      setSending(false);
    }
  };

  const rateOnPlay = () => {
    answerQuietly({ outcome: 'rated', stars: 5, openedPlay: true });
    openOutside(PLAY_LISTING);
    onClose();
  };

  const toggle = (key) => setTopics((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));

  return (
    <BottomSheet open={open} onClose={close} labelledBy="app-rating-title" zIndex={1000}>
      <div className="px-1 pt-3 pb-1 flex flex-col" data-testid="app-rating" data-step={step}>
        {step === 'ask' && (
          <>
            <h2 id="app-rating-title" className={title}>{t('How’s Sellio working for you?')}</h2>
            <p className={lead}>{t('Tap a star. Your rating goes straight to the Sellio team.')}</p>
            <div className="mt-5">
              <StarRow stars={stars} size={40} onPick={pick} t={t} />
            </div>
            <div className="mx-auto mt-1.5 flex justify-between text-xs text-slate-500" style={{ width: 296, maxWidth: '100%' }}>
              <span>{t('Not good')}</span>
              <span>{t('Love it')}</span>
            </div>
            <button type="button" onClick={close} className={`${quietButton} mt-5`}>{t('Maybe later')}</button>
          </>
        )}

        {step === 'low' && (
          <>
            <StarRow stars={stars} size={32} onPick={pick} disabled={sending} t={t} />
            <h2 id="app-rating-title" className={`${title} mt-4`}>{t('Thanks. What could be better?')}</h2>
            <p className={`${lead} mt-1.5`}>{t('Pick anything that applies.')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {FEEDBACK_TOPICS.map(([key, label]) => {
                const on = topics.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(key)}
                    className="h-11 rounded-full border text-sm flex items-center gap-1.5"
                    style={on
                      ? { padding: '0 16px 0 12px', borderColor: THEME, background: THEME_TINT, color: '#0f172a', fontWeight: 600 }
                      : { padding: '0 16px', borderColor: '#cbd5e1', background: '#fff', color: '#334155', fontWeight: 500 }}
                  >
                    {on && <Check className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" style={{ color: THEME }} />}
                    {t(label)}
                  </button>
                );
              })}
            </div>
            <label htmlFor="app-rating-more" className="mt-5 text-sm font-semibold text-slate-900">
              {t('Tell us more')}{' '}<span className="font-normal text-slate-500">{t('(optional)')}</span>
            </label>
            <textarea
              id="app-rating-more"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={COMMENT_MAX}
              rows={3}
              placeholder={t('What happened, and what would help?')}
              className="mt-2 w-full h-24 rounded-xl border border-slate-300 px-3.5 py-3 text-[15px] leading-[22px] text-slate-900 resize-none focus:outline-none focus:border-transparent focus:ring-2 focus:ring-[rgb(var(--color-primary))]"
            />
            {signedIn && (
              <label className="mt-4 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={contactOk}
                  onChange={(e) => setContactOk(e.target.checked)}
                  className="mt-0.5 w-5 h-5 flex-shrink-0"
                  style={{ accentColor: THEME }}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] leading-[22px] font-semibold text-slate-900">{t('You can contact me about this')}</span>
                  <span className="text-[13px] leading-[18px] text-slate-500">{t('We’ll use your account’s phone number or email.')}</span>
                </span>
              </label>
            )}
            {error && <p role="alert" className="mt-3 mb-0 text-sm text-red-600">{error}</p>}
            <button type="button" onClick={sendFeedback} disabled={sending} className={`${mainButton} mt-5`} style={{ background: THEME_FILL }}>
              {t('Send feedback')}
            </button>
            <button type="button" onClick={close} disabled={sending} className={quietButton}>{t('Skip')}</button>
          </>
        )}

        {step === 'five' && (
          <>
            <StarRow stars={stars} size={36} onPick={pick} t={t} />
            <h2 id="app-rating-title" className={`${title} mt-4`}>{t('Glad it’s working for you!')}</h2>
            <p className={`${lead} mx-auto`} style={{ maxWidth: 320 }}>{t('Would you leave that rating on Google Play too? It helps other shops find Sellio.')}</p>
            <button type="button" onClick={rateOnPlay} className={`${mainButton} mt-6`} style={{ background: THEME_FILL }}>
              {t('Rate on Google Play')}
              <ExternalLink className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
            <button type="button" onClick={close} className={quietButton}>{t('Maybe later')}</button>
          </>
        )}

        {step === 'sent' && (
          <>
            <div aria-hidden="true" className="mx-auto mt-3 w-16 h-16 rounded-full flex items-center justify-center" style={{ background: THEME_FILL }}>
              <Check className="w-[30px] h-[30px] text-white" strokeWidth={2.5} />
            </div>
            <h2 id="app-rating-title" className={`${title} mt-[18px]`}>{t('Thanks, that really helps')}</h2>
            <p className={`${lead} mx-auto`} style={{ maxWidth: 310 }}>{t('The Sellio team reads every message. If you said we can contact you, we’ll get back to you.')}</p>
            <button type="button" onClick={onClose} className={`${mainButton} mt-6`} style={{ background: THEME_FILL }}>{t('Done')}</button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
