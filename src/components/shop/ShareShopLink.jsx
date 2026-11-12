import React, { useCallback, useState } from 'react';
import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import ShareSheet from '@/components/explore/ShareSheet';
import { storeLink } from '@/components/shop/ShareShop';
import { useTenant } from '@/components/tenant/TenantContext';
import { useAppText } from '@/lib/appText';

// "Share your shop link": the shop's page on Sellio, straight into WhatsApp, Telegram,
// Facebook or an email, or copied (the Share to sheet a listing uses). The one next step
// where a shop has no orders yet: Orders, the Dashboard's Recent Orders and Reports.
const SIZES = {
  md: 'h-11 px-5 text-sm',
  sm: 'h-9 px-4 text-[13px]',
};

export default function ShareShopLinkButton({ size = 'md', className = '' }) {
  const { t } = useAppText();
  const { tenant } = useTenant();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!tenant?.slug) return null;
  const url = storeLink(tenant.slug);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold text-white active:scale-95 transition-transform ${SIZES[size] || SIZES.md} ${className}`}
        style={{ background: 'var(--color-primary-gradient, linear-gradient(135deg, #3b82f6 0%, #9333ea 100%))' }}
      >
        <Share2 className="w-4 h-4" aria-hidden="true" />
        {t('Share your shop link')}
      </button>
      <ShareSheet
        open={open}
        onClose={close}
        url={url}
        title={tenant.name?.trim() || t('My shop')}
        shopName={t('Your shop page')}
        image={tenant.logo_url}
        onCopied={(copied) => (copied ? toast.success(t('Link copied')) : toast.info(url))}
      />
    </>
  );
}
