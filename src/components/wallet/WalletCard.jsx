import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorldAccess } from '@/lib/worldAccess';
import { getWallet, todayShare } from '@/lib/wallet';
import { useAppText } from '@/lib/appText';

// The Me tab's "My Sellio Coins" card (mockup: Me, your wallet card): the balance, today's play
// against the limit, the wallet and the World. Coins come with Sellio World, so the card shows
// only to those who can go in (admins, until it opens: lib/worldAccess.js).
export const WALLET_GRADIENT = 'linear-gradient(135deg, #1e3a8a 0%, #6b21a8 100%)';
export const COIN_STYLE = {
  background: 'radial-gradient(circle at 35% 30%, #fff3b0 0 16%, #ffc23d 46%, #d88e0c 100%)',
  boxShadow: 'inset 0 0 0 3px rgba(150, 90, 0, 0.35)',
  color: '#6b3f00',
};

export function Coin({ size = 44, className = '' }) {
  return (
    <span aria-hidden="true" className={`rounded-full flex items-center justify-center font-bold flex-shrink-0 ${className}`}
      style={{ ...COIN_STYLE, width: size, height: size, fontSize: Math.round(size * 0.52) }}>S</span>
  );
}

export default function WalletCard() {
  const { t } = useAppText('explore');
  const access = useWorldAccess();
  const [wallet, setWallet] = useState(null);
  useEffect(() => {
    if (access !== 'yes') return undefined;
    let gone = false;
    getWallet({ limit: 1 }).then((w) => { if (!gone) setWallet(w); }).catch(() => {});
    return () => { gone = true; };
  }, [access]);
  if (access !== 'yes' || !wallet) return null;
  const share = todayShare(wallet.today);
  return (
    <section className="mt-4 rounded-[22px] p-[18px] text-white flex flex-col gap-3.5 shadow-[0_10px_24px_rgba(30,20,90,0.28)]"
      style={{ background: WALLET_GRADIENT }} aria-label={t('My Sellio Coins')} data-testid="wallet-card">
      <span className="text-[13px] font-bold tracking-[0.02em]">{t('My Sellio Coins')}</span>
      <div className="flex items-center gap-3">
        <Coin size={44} />
        <span className="text-[44px] leading-[48px] font-semibold" data-testid="wallet-card-balance">{Number(wallet.balance) || 0}</span>
        <span className="self-end pb-1.5 text-[15px] text-violet-100">{t('coins')}</span>
      </div>
      {share !== null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[13px]">
            <span className="text-violet-100">{t('Today from playing')}</span>
            <b data-testid="wallet-card-today">{t('{earned} of {cap}', { earned: Number(wallet.today.earned) || 0, cap: wallet.today.cap })}</b>
          </div>
          <div className="h-2 rounded-full bg-white/20 overflow-hidden"><div className="h-2 rounded-full bg-[#ffc23d]" style={{ width: `${Math.round(share * 100)}%` }} /></div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <Link to="/wallet" className="h-11 rounded-xl bg-white text-indigo-900 text-[15px] font-bold flex items-center justify-center">{t('Open wallet')}</Link>
        <Link to="/World" className="h-11 rounded-xl bg-white/15 text-white text-[15px] font-bold flex items-center justify-center">{t('Spend in World')}</Link>
      </div>
    </section>
  );
}
