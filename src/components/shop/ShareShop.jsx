import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Copy, Check, Download, ExternalLink, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { publicSiteUrl } from '@/lib/accountFlow';
import { isNativeApp, outsideLinkProps } from '@/lib/nativeApp';
import { getSupabase } from '@/lib/supabaseClient';
import { useAppText } from '@/lib/appText';

// The free shop's store page link: copy it, share it on WhatsApp, or save a QR code.
// Always Sellio's own address, even inside the Android app (see publicSiteUrl).
// Saving the QR: a browser saves it straight from the page. Sellio's Android app can't
// save files from a page, so there the QR goes online first (it only holds the shop's
// public link) and "Save QR code" opens it in the phone's browser, which downloads it.
export function storeLink(slug) {
  return `${publicSiteUrl(window.location)}/store/${encodeURIComponent(slug || '')}`;
}

export default function ShareShop({ slug, shopName, tenantId }) {
  const { t } = useAppText();
  const link = storeLink(slug);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const inApp = isNativeApp();
  const fileName = `${slug || 'shop'}-qr.png`;
  // In the app: the QR's download address, '' when it couldn't be put online.
  const [appSaveUrl, setAppSaveUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(link, { width: 480, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(url => { if (!cancelled) setQr(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [link]);

  useEffect(() => {
    if (!inApp || !qr || !tenantId) return undefined;
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
  }, [inApp, qr, tenantId, fileName]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('Could not copy. Press and hold the link to copy it.'));
    }
  };

  const shareText = shopName ? t('{shopName}: order from my shop here {link}', { shopName, link }) : t('Order from my shop here {link}', { link });

  return (
    <div className="space-y-4" data-testid="share-shop">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] text-slate-500 mb-1">{t('Your store page')}</p>
        <p className="text-sm font-semibold text-slate-900 break-all" data-testid="share-link">{link}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={copy} className="h-11">
          {copied ? <><Check className="w-4 h-4 mr-1.5" />{' '}{t('Copied')}</> : <><Copy className="w-4 h-4 mr-1.5" />{' '}{t('Copy link')}</>}
        </Button>
        <a
          {...outsideLinkProps(`https://wa.me/?text=${encodeURIComponent(shareText)}`)}
          className="h-11 inline-flex items-center justify-center rounded-md text-sm font-medium text-white"
          style={{ background: '#16a34a' }}
        >
          <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp
        </a>
      </div>
      {qr && (
        <div className="flex flex-col items-center gap-2">
          <img src={qr} alt={t('QR code for your store page')} className="w-44 h-44 rounded-xl border border-slate-200 bg-white p-2" />
          {!inApp ? (
            <a href={qr} download={fileName} className="inline-flex items-center text-sm font-medium text-slate-700 underline">
              <Download className="w-4 h-4 mr-1" />{' '}{t('Save QR code')}
            </a>
          ) : appSaveUrl ? (
            <a href={appSaveUrl} target="_blank" rel="noreferrer" data-testid="save-qr" className="inline-flex items-center text-sm font-medium text-slate-700 underline">
              <Download className="w-4 h-4 mr-1" />{' '}{t('Save QR code')}
            </a>
          ) : appSaveUrl === '' ? (
            <p className="text-xs text-slate-500 text-center">{t('Couldn’t get the QR code ready to save. Take a screenshot of it instead.')}</p>
          ) : (
            <span className="inline-flex items-center text-sm text-slate-400"><Download className="w-4 h-4 mr-1" />{' '}{t('Getting your QR code ready…')}</span>
          )}
        </div>
      )}
      <a href={link} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-sm text-slate-500 underline">
        <ExternalLink className="w-4 h-4" />{' '}{t('Open my store page')}
      </a>
    </div>
  );
}
