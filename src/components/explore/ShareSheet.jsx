import React from 'react';
import { X, MessageCircle, Send, Link2, Mail, MoreHorizontal } from 'lucide-react';
import { isNativeApp } from '@/lib/nativeApp';
import BottomSheet from './BottomSheet';
import { ItemImage } from './shared';

// "Share to": a listing's link straight into WhatsApp, Telegram, Messenger (phones only),
// Facebook or an email, copied, or (where the phone offers it) any other app.
// Links to apps open the app (or its website); this page stays where it is.
// In Sellio's Android app (Base44's web view, version 13) a link that opens a new tab does
// nothing, and web pages get no share menu (so no More). There a website link loads in
// place and the app hands it to the phone, asking "Open External Link?" first: WhatsApp,
// Telegram or Facebook opens. Email links go to the mail app. The app blocks any other
// kind of link (fb-messenger:), so Messenger isn't offered there.

const PHONE = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

function MessengerIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 2.5C6.5 2.5 2.5 6.4 2.5 11.3c0 2.7 1.3 5 3.3 6.6v3.6l3.3-1.8c.9.2 1.9.4 2.9.4 5.5 0 9.5-3.9 9.5-8.8S17.5 2.5 12 2.5z" />
      <path d="m7 13.5 3.2-3.4 2.4 2.1 4.4-3.7-3.2 3.4-2.4-2.1z" />
    </svg>
  );
}

function FacebookIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function Target({ href, newTab = false, onClick, label, color, background, icon: Icon }) {
  const inner = (
    <>
      <span className="w-[54px] h-[54px] rounded-full flex items-center justify-center" style={{ background, color }}>
        <Icon className="w-6 h-6" style={{ width: 24, height: 24 }} />
      </span>
      <span className="text-xs text-slate-700 text-center leading-tight">{label}</span>
    </>
  );
  const className = 'flex flex-col items-center gap-1.5 rounded-xl py-1 active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300';
  if (href) {
    return (
      <a href={href} onClick={onClick} className={className} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {inner}
      </a>
    );
  }
  return <button type="button" onClick={onClick} className={className}>{inner}</button>;
}

export default function ShareSheet({ open, onClose, url, title, priceText, shopName, image, onCopied }) {
  const enc = encodeURIComponent;
  const text = `${title}${priceText ? ` · ${priceText}` : ''} on Sellio`;
  const canShareMore = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const inApp = isNativeApp();

  // A link to another app (mail, Messenger; in the app every link) loads in this window,
  // which the page takes as leaving and then holds its history still. So the sheet closes
  // first, its Back step goes, and then the link opens.
  const openAfterClosing = (event) => {
    event.preventDefault();
    const url = event.currentTarget.href;
    let opened = false;
    let timer = 0;
    const open = () => {
      if (opened) return;
      opened = true;
      window.removeEventListener('popstate', open);
      clearTimeout(timer);
      window.location.href = url;
    };
    window.addEventListener('popstate', open);
    timer = setTimeout(open, 700);
    onClose();
  };

  const copy = async () => {
    let done = false;
    try {
      await navigator.clipboard.writeText(url);
      done = true;
    } catch {
      try {
        const field = document.createElement('textarea');
        field.value = url;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        done = document.execCommand('copy');
        field.remove();
      } catch { /* shown below */ }
    }
    onClose();
    onCopied?.(done);
  };
  // WhatsApp, Telegram, Facebook: a new tab in a browser; in place in the app (see above).
  const site = inApp ? { onClick: openAfterClosing } : { newTab: true, onClick: onClose };

  const more = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch { /* cancelled, or the phone refused: nothing to do */ }
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="share-sheet-title">
      <div className="flex items-center">
        <h2 id="share-sheet-title" className="flex-1 text-base font-bold text-slate-900">Share to</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2.5 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-50">
          <X className="w-[22px] h-[22px]" />
        </button>
      </div>
      <div className="mt-1 flex items-center gap-3 p-2.5 rounded-[14px] border border-slate-200">
        <ItemImage src={image} name={title} className="w-14 h-14 text-xl flex-shrink-0" rounded="rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 truncate">{title}</p>
          <p className="mt-0.5 text-[13px] text-slate-700 truncate">{[priceText, shopName].filter(Boolean).join(' · ')}</p>
          <p className="mt-0.5 text-xs text-slate-500 truncate">{url.replace(/^https?:\/\//, '')}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-4">
        <Target href={`https://wa.me/?text=${enc(`${text}\n${url}`)}`} {...site} label="WhatsApp" background="#16a34a" color="#fff" icon={MessageCircle} />
        <Target href={`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`} {...site} label="Telegram" background="#0284c7" color="#fff" icon={Send} />
        {PHONE && !inApp && (
          <Target href={`fb-messenger://share/?link=${enc(url)}`} onClick={openAfterClosing} label="Messenger" background="#7c3aed" color="#fff" icon={MessengerIcon} />
        )}
        <Target href={`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`} {...site} label="Facebook" background="#1d4ed8" color="#fff" icon={FacebookIcon} />
        <Target onClick={copy} label="Copy link" background="#f1f5f9" color="#334155" icon={Link2} />
        <Target href={`mailto:?subject=${enc(`${title} on Sellio`)}&body=${enc(`${text}\n${url}`)}`} onClick={openAfterClosing} label="Email" background="#f1f5f9" color="#334155" icon={Mail} />
        {canShareMore && <Target onClick={more} label="More" background="#f1f5f9" color="#334155" icon={MoreHorizontal} />}
      </div>
    </BottomSheet>
  );
}
