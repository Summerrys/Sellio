import React, { useEffect, useId, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Download, MessageCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import BottomSheet from '@/components/explore/BottomSheet';
import { BRAND_GRADIENT } from '@/components/explore/shared';
import { isNativeApp, outsideLinkProps } from '@/lib/nativeApp';
import { getSupabase } from '@/lib/supabaseClient';
import { whatsAppLink } from '@/lib/referral';
import { useAppText } from '@/lib/appText';

// Refer & earn's share sheet (screen 4): the code's QR to show owners in person, a message with
// the link for WhatsApp, and the QR as a picture. Saving the QR works as on the free shop's share
// card (ShareShop): a browser saves it from the page; Sellio's app puts it online first (it only
// holds the public invite link) and opens it in the phone's browser, which downloads it.
export function inviteMessage(t, shopName, link) {
  return shopName
    ? t('Hi! I run {shop} on Sellio: counter, QR ordering and kitchen display in one app. Try it free for 7 days with my link: {link}', { shop: shopName, link })
    : t('Hi! I run my shop on Sellio: counter, QR ordering and kitchen display in one app. Try it free for 7 days with my link: {link}', { link });
}

export default function ShareSheet({ open, onClose, code, link, shopName, tenantId }) {
  const { t } = useAppText('explore');
  const titleId = useId();
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const inApp = isNativeApp();
  const fileName = `sellio-invite-${code || 'code'}.png`;
  const [appSaveUrl, setAppSaveUrl] = useState(null); // in the app: the QR's download address, '' if it couldn't go online
  const message = inviteMessage(t, shopName, link);

  useEffect(() => {
    if (!open || !link) return undefined;
    let cancelled = false;
    QRCode.toDataURL(link, { width: 480, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } })
      .then((url) => { if (!cancelled) setQr(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, link]);

  useEffect(() => {
    if (!open || !inApp || !qr || !tenantId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const blob = await (await fetch(qr)).blob();
        const supabase = await getSupabase();
        const path = `${tenantId}/share/${fileName}`;
        const { error } = await supabase.storage.from('product-images')
          .upload(path, blob, { upsert: true, contentType: 'image/png', cacheControl: '300' });
        if (error) throw error;
        const { data } = supabase.storage.from('product-images').getPublicUrl(path, { download: fileName });
        if (!cancelled) setAppSaveUrl(data.publicUrl);
      } catch {
        if (!cancelled) setAppSaveUrl('');
      }
    })();
    return () => { cancelled = true; };
  }, [open, inApp, qr, tenantId, fileName]);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('Couldn’t copy. Press and hold the message to copy it.'));
    }
  };

  const saveButton = 'h-11 rounded-xl border border-slate-200 bg-white text-[15px] font-semibold text-slate-900 inline-flex items-center justify-center gap-2';
  let save;
  if (!inApp) {
    save = <a href={qr || undefined} download={fileName} className={saveButton} data-testid="refer-save-qr"><Download className="w-[18px] h-[18px] text-slate-700" />{' '}{t('Save QR image')}</a>;
  } else if (appSaveUrl) {
    save = <a href={appSaveUrl} target="_blank" rel="noreferrer" className={saveButton} data-testid="refer-save-qr"><Download className="w-[18px] h-[18px] text-slate-700" />{' '}{t('Save QR image')}</a>;
  } else if (appSaveUrl === '') {
    save = <span className="text-xs text-slate-500 flex items-center">{t('Couldn’t get the QR code ready to save. Take a screenshot of it instead.')}</span>;
  } else {
    save = <span className={`${saveButton} text-slate-400`}><Download className="w-[18px] h-[18px]" />{' '}{t('Getting your QR code ready…')}</span>;
  }

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy={titleId}>
      <section aria-labelledby={titleId} className="flex flex-col gap-3.5 pb-1" data-testid="refer-share-sheet">
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold text-slate-900">{t('Share your code')}</h2>
          <button type="button" onClick={onClose} aria-label={t('Close')} className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-5 h-5 text-slate-700" />
          </button>
        </div>

        <div className="flex items-center gap-3.5">
          <div className="flex-shrink-0 p-2.5 rounded-2xl border border-slate-200 bg-white">
            {qr
              ? <img src={qr} alt={t('QR code for {link}', { link: String(link || '').replace(/^https?:\/\//, '') })} className="w-[132px] h-[132px] block" data-testid="refer-qr" />
              : <span className="block w-[132px] h-[132px] rounded-lg bg-slate-100" aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex flex-col gap-1">
            <p className="text-[26px] leading-8 font-extrabold tracking-[0.14em] text-slate-900">{code}</p>
            <p className="text-[13px] leading-[19px] text-slate-600">{t('Owners scan this on your phone. It opens your invite page with the code already applied.')}</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-slate-700">{t('Message')}</span>
          <p className="p-3 rounded-xl bg-slate-100 text-sm leading-[21px] text-slate-900 break-words" data-testid="refer-message">{message}</p>
        </div>

        <a
          {...outsideLinkProps(whatsAppLink(message))}
          className="h-12 rounded-xl text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2"
          style={{ background: BRAND_GRADIENT }}
          data-testid="refer-whatsapp"
        >
          <MessageCircle className="w-[18px] h-[18px]" />{' '}{t('Send on WhatsApp')}
        </a>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={copyMessage} className={saveButton}>
            {copied ? <Check className="w-[18px] h-[18px] text-green-600" /> : <Copy className="w-[18px] h-[18px] text-slate-700" />}{' '}{copied ? t('Copied') : t('Copy message')}
          </button>
          {save}
        </div>

        <p className="text-xs leading-[17px] text-slate-500">{t('Owners who sign up within 60 days of opening your link, or who type your code, count as yours.')}</p>
      </section>
    </BottomSheet>
  );
}
