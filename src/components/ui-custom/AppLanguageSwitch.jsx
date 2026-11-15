import React from 'react';
import { Globe } from 'lucide-react';
import { useAppText, APP_LANGUAGES, N_ } from '@/lib/appText';

// The owner app's language (lib/appText.js). Shown once there is something to switch to: a
// language with a group of screens signed off, a reviewer's preview, or a shop that has a
// language first. Short labels in the store page's order (Alvin, 16 Nov 2026: EN, 中文, MY, ID),
// each named in full in its own language for screen readers; the choice is remembered on this
// device. A language joins the switch once the app has it.
function Choices({ label }) {
  const { language, languages, setLanguage } = useAppText();
  const choices = APP_LANGUAGES.filter(({ code }) => languages.includes(code)).map(({ code, short, name }) => [code, short, name]);
  return (
    <div role="group" aria-label={label} data-testid="app-language-switch"
      className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5 text-xs">
      <Globe aria-hidden="true" className="ml-1.5 mr-0.5 h-3.5 w-3.5 text-slate-400" />
      {choices.map(([code, short, name]) => (
        <button key={code} type="button" lang={code} aria-pressed={language === code} onClick={() => setLanguage(code)} aria-label={name} title={name}
          className={'rounded-full px-2.5 py-1 font-semibold transition-colors ' + (language === code ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}>
          {short}
        </button>
      ))}
    </div>
  );
}

// Centred under a form: the sign-in, sign-up and /Account pages.
export default function AppLanguageSwitch({ className = '' }) {
  const { t, available } = useAppText();
  if (!available) return null;
  return <div className={'flex justify-center ' + className}><Choices label={t('Language')} /></div>;
}

// A row in the account panel's preferences.
export function AppLanguageRow() {
  const { t, available } = useAppText();
  if (!available) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-slate-700">{t('Language')}</p>
      <Choices label={t('Language')} />
    </div>
  );
}

// A reviewer's preview (any app page opened with ?preview_language=zh, ms or id): a small badge
// so they know it's on, and a way to end it. Nobody else sees it.
const PREVIEW_WORDS = { zh: N_('Chinese preview'), ms: N_('Malay preview'), id: N_('Indonesian preview') };
export function AppLanguagePreviewBadge() {
  const { t, preview, endPreview } = useAppText();
  if (!preview || !PREVIEW_WORDS[preview]) return null;
  return (
    <div data-testid="app-language-preview"
      className="fixed left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50/95 px-3 py-0.5 text-[11px] text-amber-900 shadow-sm"
      style={{ top: 'max(env(safe-area-inset-top), 4px)' }}>
      <span>{t(PREVIEW_WORDS[preview])}</span>
      <button type="button" onClick={endPreview} className="font-semibold underline underline-offset-2">{t('End preview')}</button>
    </div>
  );
}
