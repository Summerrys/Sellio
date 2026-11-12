import React from 'react';
import { Globe } from 'lucide-react';
import { useAppText } from '@/lib/appText';

// The owner app's language (lib/appText.js). Shown only once Bahasa Indonesia can be picked: a
// group of screens is signed off, or this is a reviewer's preview. Each language is named in
// itself, so anyone can find theirs; the choice is remembered on this device.
const CHOICES = [['en', 'English'], ['id', 'Bahasa Indonesia']];

function Choices({ label }) {
  const { language, setLanguage } = useAppText();
  return (
    <div role="group" aria-label={label} data-testid="app-language-switch"
      className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5 text-xs">
      <Globe aria-hidden="true" className="ml-1.5 mr-0.5 h-3.5 w-3.5 text-slate-400" />
      {CHOICES.map(([code, name]) => (
        <button key={code} type="button" lang={code} aria-pressed={language === code} onClick={() => setLanguage(code)}
          className={'rounded-full px-2.5 py-1 font-medium transition-colors ' + (language === code ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}>
          {name}
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

// A reviewer's preview (any app page opened with ?preview_language=id): a small badge so they
// know it's on, and a way to end it. Nobody else sees it.
export function AppLanguagePreviewBadge() {
  const { t, preview, endPreview } = useAppText();
  if (!preview) return null;
  return (
    <div data-testid="app-language-preview"
      className="fixed left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50/95 px-3 py-0.5 text-[11px] text-amber-900 shadow-sm"
      style={{ top: 'max(env(safe-area-inset-top), 4px)' }}>
      <span>{t('Indonesian preview')}</span>
      <button type="button" onClick={endPreview} className="font-semibold underline underline-offset-2">{t('End preview')}</button>
    </div>
  );
}
