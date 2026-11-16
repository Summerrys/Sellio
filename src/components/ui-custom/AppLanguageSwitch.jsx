import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useAppText, APP_LANGUAGES, N_ } from '@/lib/appText';
import { useBackToClose } from '@/lib/useBackToClose';

// The owner app's language (lib/appText.js): one small button with the language in use (Alvin,
// 16 Nov 2026: EN, 中文, MY, ID, in that order), which opens the others and folds them away again
// once one is picked (Alvin, 16 Nov 2026: "when selected a language, make it collapsible for
// others"). The open list names each language in itself, so MY reads as Bahasa Melayu; the choice
// is remembered on this device. Where it sits: the top corner of the sign-in and sign-up cards,
// the header of /Account and of Me, and the account panel's Language row.
const MENU_NAMES = { en: 'English', zh: '简体中文', ms: 'Bahasa Melayu', id: 'Bahasa Indonesia' };
// The language in use is marked in the Login button's orange (pages/Auth.jsx), the others' codes in
// a lighter tone of it; the button has no pill and the list only a light shadow (Alvin, 16 Nov 2026).
const ORANGE = 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)';

export function LanguagePicker({ up = false }) {
  const { t, language, languages, setLanguage } = useAppText();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const button = useRef(null);
  const menuId = useId();
  // The phone's Back closes the list rather than leaving the page.
  useBackToClose(open, () => setOpen(false));

  // A tap anywhere else folds it away; Escape too, back to the button.
  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => { if (!box.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  // Once open, the language in use has the focus, so arrows and Enter work at once.
  useEffect(() => {
    if (open) box.current?.querySelector('[role="menuitemradio"][aria-checked="true"]')?.focus({ preventScroll: true });
  }, [open]);

  const choices = APP_LANGUAGES.filter(({ code }) => languages.includes(code));
  const current = choices.find(({ code }) => code === language) || APP_LANGUAGES[0];
  const pick = (code) => {
    setOpen(false);
    if (code !== language) setLanguage(code);
    button.current?.focus({ preventScroll: true });
  };
  const arrows = (event) => {
    const items = [...(box.current?.querySelectorAll('[role="menuitemradio"]') || [])];
    const at = items.indexOf(document.activeElement);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[event.key];
    if (to === undefined || !items.length) return;
    event.preventDefault();
    items[(to + items.length) % items.length].focus();
  };

  return (
    <div ref={box} data-testid="app-language-switch" className="relative inline-block text-left">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={current.name}
        onClick={() => setOpen((was) => !was)}
        className={'inline-flex h-9 items-center gap-1.5 rounded-md px-1.5 text-xs font-semibold transition-colors hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 '
          + (open ? 'text-slate-900' : 'text-slate-600')}
      >
        <Globe aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
        {/* Read out as "Language: EN", the words on the button with what they're for. */}
        <span className="sr-only">{t('Language')}: </span>
        <span lang={current.code}>{current.short}</span>
        <ChevronDown aria-hidden="true" className={'h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('Language')}
          onKeyDown={arrows}
          className={'absolute right-0 z-[70] w-52 rounded-xl bg-white p-1 shadow-[0_6px_20px_-6px_rgba(15,23,42,0.14)] animate-in fade-in-0 zoom-in-95 duration-150 '
            + (up ? 'bottom-full mb-2 origin-bottom-right slide-in-from-bottom-1' : 'top-full mt-2 origin-top-right slide-in-from-top-1')}
        >
          {choices.map(({ code, short }) => {
            const chosen = code === language;
            return (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={chosen}
                lang={code}
                onClick={() => pick(code)}
                className={'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors hover:bg-orange-50 focus-visible:bg-orange-50 '
                  + (chosen ? 'font-semibold text-slate-900' : 'text-slate-600')}
              >
                <span aria-hidden="true" className={'w-9 shrink-0 rounded-md py-0.5 text-center text-[11px] font-semibold ' + (chosen ? 'text-white shadow-sm' : 'bg-orange-100 text-orange-700')}
                  style={chosen ? { background: ORANGE } : undefined}>{short}</span>
                <span className="min-w-0 flex-1 truncate">{MENU_NAMES[code]}</span>
                {chosen && <Check aria-hidden="true" className="h-4 w-4 shrink-0" style={{ color: '#e86a1a' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The picker wherever a page places it (className positions it): the corner of the sign-in and
// sign-up cards, the /Account header.
export default function AppLanguageSwitch({ className = '', up = false }) {
  const { available } = useAppText();
  if (!available) return null;
  return <div className={className}><LanguagePicker up={up} /></div>;
}

// A row in the account panel's preferences; near the panel's foot, so the list opens upwards.
export function AppLanguageRow() {
  const { t, available } = useAppText();
  if (!available) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-slate-700">{t('Language')}</p>
      <LanguagePicker up />
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
