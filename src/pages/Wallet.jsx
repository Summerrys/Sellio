import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2, RefreshCw } from 'lucide-react';
import { goBack } from '@/lib/goBack';
import { useWorldAccess } from '@/lib/worldAccess';
import { getWallet, todayShare } from '@/lib/wallet';
import { useAppText } from '@/lib/appText';
import ExploreTabBar, { TAB_BAR_SPACE } from '@/components/explore/ExploreTabBar';
import { Coin, WALLET_GRADIENT } from '@/components/wallet/WalletCard';
import { WorldSoon } from '@/pages/World';

// /wallet: My coins (mockup: Wallet page). The signed-in person's Sellio Coins: the balance, what
// they've earned and spent, today's play against the day's limit, the ways to earn, and every coin
// in and out. One wallet per person, not per shop; coins have no cash value. Coins come with
// Sellio World, so it's for those who can go in (admins, until it opens: lib/worldAccess.js).

// A line of the history, in the person's language. A referral says what kind of shop joined, never
// which one. (The World's wallet sheet has the same lines in English: public/assets/world/island.html.)
function walletLine(entry, t) {
  switch (entry?.reason) {
    case 'drop': return t('Coin on Pop-up Street');
    case 'visit': return entry.shop ? t('Visit: {shop}', { shop: entry.shop }) : t('Shop visit');
    case 'referral': return entry.kind === 'merchant' ? t('A business you invited paid') : t('A seller you invited listed their first item');
    case 'cosmetic': return entry.item ? t('Stall item: {item}', { item: entry.item }) : t('Stall item');
    case 'achievement': return entry.badge ? t('Badge: {badge}', { badge: entry.badge }) : t('Badge');
    case 'daily': return t('Daily reward');
    case 'mission':
    case 'missions_all': return t('Mission reward');
    case 'admin': return t('Adjusted by Sellio');
    default: return t('Coins');
  }
}

function Card({ children, label, testId, className = '' }) {
  return <section aria-label={label} data-testid={testId} className={`bg-white border border-slate-200 rounded-[18px] ${className}`}>{children}</section>;
}

export default function Wallet() {
  const { t, locale } = useAppText('explore');
  const navigate = useNavigate();
  const access = useWorldAccess();
  const [wallet, setWallet] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error

  const load = useCallback(async () => {
    setState('loading');
    try {
      setWallet(await getWallet({ limit: 40 }));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);
  useEffect(() => { if (access === 'yes') load(); }, [access, load]);

  if (access === 'no') return <WorldSoon />;

  const share = wallet ? todayShare(wallet.today) : null;
  const when = (at) => {
    const d = new Date(at);
    const sameDay = d.toDateString() === new Date().toDateString();
    try {
      return sameDay
        ? t('Today, {time}', { time: d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) })
        : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    } catch {
      return d.toDateString();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="wallet-page">
      <header data-app-header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-xl mx-auto h-14 px-2 flex items-center gap-1">
          <button type="button" onClick={() => goBack(navigate, '/explore/me')} aria-label={t('Back')} className="w-11 h-11 flex items-center justify-center text-slate-900">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="m-0 text-lg font-bold text-slate-900">{t('My coins')}</h1>
        </div>
      </header>
      <main className="max-w-xl mx-auto p-4 flex flex-col gap-3.5" style={{ paddingBottom: TAB_BAR_SPACE }}>
        {(access === 'checking' || state === 'loading') && (
          <Card className="p-8 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></Card>
        )}
        {access === 'yes' && state === 'error' && (
          <Card className="p-8 text-center">
            <p className="m-0 text-sm text-slate-600">{t('We couldn’t load your coins just now.')}</p>
            <button type="button" onClick={load} className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" />{' '}{t('Try again')}
            </button>
          </Card>
        )}
        {access === 'yes' && state === 'ready' && wallet && (
          <>
            <section aria-label={t('Balance')} className="rounded-[22px] px-5 py-[22px] text-white flex flex-col items-center gap-2" style={{ background: WALLET_GRADIENT }}>
              <Coin size={64} />
              <span className="text-[50px] leading-[52px] font-semibold" data-testid="wallet-balance">{Number(wallet.balance) || 0}</span>
              <span className="text-sm text-violet-100">{t('coins in your wallet')}</span>
              <span className="text-xs text-violet-200" data-testid="wallet-totals">{t('Earned so far {earned} · Spent {spent}', { earned: Number(wallet.earned) || 0, spent: Number(wallet.spent) || 0 })}</span>
            </section>

            {share !== null && (
              <Card label={t('Today')} testId="wallet-today" className="p-4 flex flex-col gap-2.5">
                <div className="flex justify-between items-baseline">
                  <b className="text-base">{t('Today')}</b>
                  <span className="text-sm text-slate-700">{t('{earned} of {cap} from playing', { earned: Number(wallet.today.earned) || 0, cap: wallet.today.cap })}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-2.5 rounded-full bg-amber-500" style={{ width: `${Math.round(share * 100)}%` }} /></div>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-full bg-orange-50 text-orange-800 text-xs font-semibold">{t('Street coins {coins}', { coins: Number(wallet.today.drops) || 0 })}</span>
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-semibold">{t('Shop visits {coins}', { coins: Number(wallet.today.visits) || 0 })}</span>
                </div>
                <span className="text-xs text-slate-600">{t('Starts again at midnight. Referral coins don’t count toward it.')}</span>
              </Card>
            )}

            <Card label={t('Ways to earn')} className="px-4 py-1.5 flex flex-col">
              <h2 className="mt-2.5 mb-1 text-base font-extrabold">{t('Ways to earn')}</h2>
              {[
                [t('Coins on Pop-up Street'), Number(wallet.dropMax) > 1 ? t('1 to {max} each', { max: wallet.dropMax }) : t('1 each')],
                [t('Visit a shop'), `+${Number(wallet.visitReward) || 0}`],
                [t('Bring a home seller'), `+${Number(wallet.referralCoins?.free) || 0}`],
                [t('Bring a business'), `+${Number(wallet.referralCoins?.merchant) || 0}`],
              ].map(([label, value]) => (
                <div key={label} className="min-h-11 flex justify-between items-center text-sm border-b border-slate-100 last:border-b-0"><span>{label}</span><b>{value}</b></div>
              ))}
              <Link to="/refer" className="mt-1 mb-2.5 h-11 rounded-xl bg-violet-100 text-violet-800 text-sm font-bold flex items-center justify-center">{t('Share my referral code')}</Link>
            </Card>

            <Card label={t('Style your stall')} className="px-4 py-3.5 flex flex-col gap-2.5">
              <h2 className="m-0 text-base font-extrabold">{t('Style your stall')}</h2>
              <p className="m-0 text-sm text-slate-600">{t('Spend coins on a signboard, lights and decor for your stall in Sellio World.')}</p>
              <Link to="/World" className="h-11 rounded-xl text-white text-[15px] font-bold flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #7e22ce 100%)' }}>{t('Open Sellio World')}</Link>
            </Card>

            <Card label={t('History')} testId="wallet-history" className="px-4 pt-1.5 pb-2 flex flex-col">
              <h2 className="mt-2.5 mb-1 text-base font-extrabold">{t('History')}</h2>
              {(wallet.history || []).length === 0 && <p className="my-3 text-sm text-slate-600">{t('No coins yet. Walk Pop-up Street to find some.')}</p>}
              {(wallet.history || []).map((e) => (
                <div key={`${e.at}-${e.reason}-${e.delta}-${e.shop || e.item || e.badge || e.kind || ''}`} className="min-h-[52px] flex items-center gap-3 border-b border-slate-100 last:border-b-0" data-testid="wallet-line">
                  <span className="flex-1 flex flex-col min-w-0">
                    <span className="text-sm truncate">{walletLine(e, t)}</span>
                    <span className="text-xs text-slate-600">{when(e.at)}</span>
                  </span>
                  <b className={`text-[15px] ${e.delta < 0 ? 'text-orange-700' : 'text-blue-700'}`}>{e.delta > 0 ? `+${e.delta}` : `−${Math.abs(e.delta)}`}</b>
                </div>
              ))}
            </Card>
            <p className="m-0 text-center text-xs text-slate-600">{t('Coins have no cash value and stay in Sellio.')}</p>
          </>
        )}
      </main>
      <ExploreTabBar active="me" />
    </div>
  );
}
