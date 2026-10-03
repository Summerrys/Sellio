import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Copy, Check, Download, ExternalLink, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

// The free shop's store page link: copy it, share it on WhatsApp, or save a QR code.
export function storeLink(slug) {
  return `${window.location.origin}/store/${encodeURIComponent(slug || '')}`;
}

export default function ShareShop({ slug, shopName }) {
  const link = storeLink(slug);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(link, { width: 480, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(url => { if (!cancelled) setQr(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Press and hold the link to copy it.');
    }
  };

  const shareText = `${shopName ? `${shopName}: ` : ''}order from my shop here ${link}`;

  return (
    <div className="space-y-4" data-testid="share-shop">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] text-slate-500 mb-1">Your store page</p>
        <p className="text-sm font-semibold text-slate-900 break-all" data-testid="share-link">{link}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={copy} className="h-11">
          {copied ? <><Check className="w-4 h-4 mr-1.5" /> Copied</> : <><Copy className="w-4 h-4 mr-1.5" /> Copy link</>}
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noreferrer"
          className="h-11 inline-flex items-center justify-center rounded-md text-sm font-medium text-white"
          style={{ background: '#16a34a' }}
        >
          <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp
        </a>
      </div>
      {qr && (
        <div className="flex flex-col items-center gap-2">
          <img src={qr} alt="QR code for your store page" className="w-44 h-44 rounded-xl border border-slate-200 bg-white p-2" />
          <a href={qr} download={`${slug || 'shop'}-qr.png`} className="inline-flex items-center text-sm font-medium text-slate-700 underline">
            <Download className="w-4 h-4 mr-1" /> Save QR code
          </a>
        </div>
      )}
      <a href={link} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-sm text-slate-500 underline">
        <ExternalLink className="w-4 h-4" /> Open my store page
      </a>
    </div>
  );
}
