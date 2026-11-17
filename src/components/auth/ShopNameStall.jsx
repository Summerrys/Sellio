import React, { useId } from 'react';
import { useAppText } from '@/lib/appText';

// "Name your shop" (Alvin, 17 Nov 2026, after "Sell from home"): the sign-up's awning and stall
// again, with the sign in the middle showing the shop's name as it's typed, a steaming bowl and a
// jar on the left of the counter, a cupcake on the right, and an "Opening soon" sticker. Styles:
// index.css (.join-stall… for the awning and the stall, .shop-name-… for the sign). The card
// around it has no top padding, so the awning sits on its top edge.
export default function ShopNameStall({ name }) {
  const { t } = useAppText();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const shown = (name || '').trim();
  return (
    <div className="join-stall -mx-8" data-testid="shop-name-stall">
      <div className="join-stall-awning" aria-hidden="true" />
      <div className="join-stall-scene">
        <svg viewBox="0 0 358 142" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`${id}-brand`} gradientUnits="userSpaceOnUse" x1="54" y1="0" x2="304" y2="0">
              <stop offset="0" stopColor="#fb923c" /><stop offset=".5" stopColor="#e0449a" /><stop offset="1" stopColor="#8b5cf6" />
            </linearGradient>
            <linearGradient id={`${id}-inside`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff1e6" /><stop offset="1" stopColor="#fff7f0" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`${id}-counter`}><rect x="54" y="100" width="250" height="34" rx="9" /></clipPath>
          </defs>
          <rect x="67" y="0" width="224" height="102" fill={`url(#${id}-inside)`} />
          <rect x="60" y="0" width="7" height="104" rx="2" fill="#e2e8f0" />
          <rect x="291" y="0" width="7" height="104" rx="2" fill="#e2e8f0" />
          <ellipse cx="179" cy="138" rx="140" ry="3.5" fill="#0f172a" opacity=".07" />
          <rect x="54" y="100" width="250" height="34" rx="9" fill="#fff" stroke="#eef2f6" strokeWidth="2" />
          <rect x="54" y="122" width="250" height="12" fill={`url(#${id}-brand)`} clipPath={`url(#${id}-counter)`} opacity=".92" />
          <path d="M64 82 a19 14 0 0 0 38 0 z" fill="#fb923c" />
          <ellipse cx="83" cy="82" rx="19" ry="3.8" fill="#fed7aa" />
          <path className="join-stall-steam" d="M76 74 c-5 -6 5 -10 0 -16 c-4 -5 2.5 -7.5 0 -11" />
          <path className="join-stall-steam s2" d="M83 72 c-5 -6 5 -10 0 -16 c-4 -5 2.5 -7.5 0 -11" />
          <path className="join-stall-steam s3" d="M90 74 c-5 -6 5 -10 0 -16 c-4 -5 2.5 -7.5 0 -11" />
          <rect x="108" y="78" width="20" height="22" rx="5" fill="#ddd6fe" />
          <rect x="106" y="73" width="24" height="7" rx="2.5" fill="#8b5cf6" />
          <path d="M256 100 L260 85 L276 85 L280 100 Z" fill="#f472b6" />
          <circle cx="262" cy="81" r="6" fill="#fff" stroke="#fbcfe8" strokeWidth="1.2" />
          <circle cx="274" cy="81" r="6" fill="#fff" stroke="#fbcfe8" strokeWidth="1.2" />
          <circle cx="268" cy="77" r="7.5" fill="#fff" stroke="#fbcfe8" strokeWidth="1.2" />
          <circle cx="268" cy="68.5" r="3.2" fill="#ef4444" />
          <g transform="translate(30 44)"><path className="join-stall-spark" d="M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z" fill="#fbbf24" /></g>
          <g transform="translate(330 36)"><path className="join-stall-spark k2" d="M0 -6 L1.5 -1.5 L6 0 L1.5 1.5 L0 6 L-1.5 1.5 L-6 0 L-1.5 -1.5 Z" fill="#f472b6" /></g>
          <g transform="translate(232 56)"><path className="join-stall-spark k3" d="M0 -5 L1.3 -1.3 L5 0 L1.3 1.3 L0 5 L-1.3 1.3 L-5 0 L-1.3 -1.3 Z" fill="#a78bfa" /></g>
        </svg>
        <div className="shop-name-sign-wrap">
          <div className="shop-name-sign" data-testid="shop-name-sign">
            <svg viewBox="0 0 64 16" aria-hidden="true">
              <path d="M12 16 L32 4 L52 16" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="32" cy="4" r="3.2" fill="#94a3b8" />
            </svg>
            <span className={`shop-name-sign-name${shown ? '' : ' empty'}`}>{shown || t('Your shop')}</span>
            <small>{t('on Sellio')}</small>
          </div>
        </div>
        <span className="shop-name-soon">{t('Opening soon')}</span>
      </div>
    </div>
  );
}
