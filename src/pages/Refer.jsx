import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Coins, Copy, Gift, Info, Loader2, MessageCircle, QrCode, RefreshCw, Share2, Store, HandCoins } from 'lucide-react';
import { toast } from 'sonner';
import { useAppUser } from '@/lib/AppUserContext';
import { useTenant } from '@/components/tenant/TenantContext';
import { rememberReturnPath } from '@/lib/authNavigation';
import { amISellioAdmin } from '@/lib/appFeedback';
import { useWorldAccess } from '@/lib/worldAccess';
import {
  DISTRIBUTOR_TERMS_PATH, joinReferral, ratePercent, referralDashboard, referralErrorMessage, referralOverview, setReferralWhatsapp, whatsAppLink,
} from '@/lib/referral';
import { outsideLinkProps } from '@/lib/nativeApp';
import ExploreTabBar, { TAB_BAR_SPACE } from '@/components/explore/ExploreTabBar';
import { BRAND_GRADIENT, ExploreTabHeader } from '@/components/explore/shared';
import { Switch } from '@/components/ui/switch';
import ShareSheet, { inviteMessage } from '@/components/refer/ShareSheet';
import InfoSheet from '@/components/refer/InfoSheet';
import { useAppText } from '@/lib/appText';

// Refer & earn (/refer, from the Me tab's row).
//
// Alvin, 24 Nov 2026: every shop has a referral code, free home shops too ("Right now my paid
// plan is not showing the referral code"), and it earns Sellio Coins: 50 for each home seller who
// opens a free shop with it, 100 for each business that signs up with it and pays (Sellio's to
// change, Admin → Coins). A free seller's code earns once. The code card and the coins are here
// for every shop's owner (referral_overview).
//
// A business shop can also become a Sellio distributor (cash commission; screens 3a and 3 of the
// build plan), under the same code. Alvin, 20 Nov 2026: only once the shop pays ("make joining
// require a recorded payment and a plan past its trial": referral_join refuses the rest and the
// dashboard says why, joinBlock), and the wallet and payouts wait: no earnings shown yet.

function Card({ children, className = '', testId }) {
  return <section className={`bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4 ${className}`} data-testid={testId}>{children}</section>;
}

function InfoButton({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0" data-testid="refer-info">
      <Info className="w-5 h-5 text-white" />
    </button>
  );
}

// How a distributor earns, in three steps.
function Steps({ t }) {
  const step = (Icon, title, text) => (
    <div className="flex gap-3">
      <span className="w-9 h-9 rounded-[10px] bg-slate-100 flex items-center justify-center flex-shrink-0"><Icon className="w-[18px] h-[18px] text-slate-600" /></span>
      <div className="min-w-0">
        <h3 className="text-[15px] leading-5 font-bold text-slate-900">{title}</h3>
        <p className="text-[13px] leading-[19px] text-slate-600">{text}</p>
      </div>
    </div>
  );
  return (
    <Card className="flex flex-col gap-3.5">
      <h2 className="sr-only">{t('How it works')}</h2>
      {step(Share2, t('Share your code'), t('WhatsApp it, show the QR on your phone, or tell owners the code.'))}
      {step(Store, t('They start a free trial'), t('Any business plan. Your code is saved on their checkout.'))}
      {step(HandCoins, t('You earn when they pay'), t('Every payment, for as long as they stay. Sellio keeps each shop’s details private.'))}
    </Card>
  );
}

// Becoming a distributor: the rates, then the button when the shop can join or a line saying why
// not yet.
function Pitch({ t, rates, locale, onInfo, children }) {
  return (
    <section className="rounded-2xl p-4 text-white flex flex-col gap-2.5" style={{ background: BRAND_GRADIENT }} data-testid="refer-pitch">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[22px] leading-7 font-extrabold">{t('Become a Sellio distributor')}</h2>
        <InfoButton onClick={onInfo} label={t('How Refer & earn works')} />
      </div>
      <p className="text-sm leading-5 text-white/90">
        {t('{monthly} of every monthly payment and {yearly} of every yearly payment from shops that join with your code.', {
          monthly: ratePercent(rates?.monthly, locale), yearly: ratePercent(rates?.yearly, locale),
        })}
      </p>
      {children}
    </section>
  );
}

function Notice({ children, testId }) {
  return <p className="rounded-xl bg-white/15 px-3 py-2.5 text-sm leading-5 font-semibold" data-testid={testId}>{children}</p>;
}

function FooterLinks({ t, onInfo }) {
  return (
    <p className="flex justify-center gap-4 text-[13px]">
      <button type="button" onClick={onInfo} className="min-h-8 font-semibold text-blue-600 hover:text-blue-700">{t('How it works')}</button>
      <Link to={DISTRIBUTOR_TERMS_PATH} className="min-h-8 inline-flex items-center font-semibold text-blue-600 hover:text-blue-700">{t('Distributor terms')}</Link>
    </p>
  );
}

// What the code has earned: who joined with it, and the coins.
function CoinsCard({ t, overview, worldOpen }) {
  const invited = overview.invited || {};
  const tile = (label, value, testId) => (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5" data-testid={testId}>
      <p className="text-[22px] leading-7 font-extrabold text-slate-900">{Number(value) || 0}</p>
      <p className="text-xs leading-4 text-slate-500">{label}</p>
    </div>
  );
  return (
    <Card className="flex flex-col gap-3" testId="refer-coins">
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-[10px] bg-amber-100 flex items-center justify-center flex-shrink-0"><Coins className="w-[18px] h-[18px] text-amber-600" /></span>
        <h2 className="text-[17px] leading-6 font-extrabold text-slate-900">{t('Earn Sellio Coins')}</h2>
      </div>
      <ul className="flex flex-col gap-2 text-[14px] leading-5 text-slate-700">
        <li data-testid="refer-coins-free">{t('{coins} coins when a home seller opens a free shop with your code and lists their first item.', { coins: <b>{overview.coins?.free}</b> })}</li>
        <li data-testid="refer-coins-merchant">{t('{coins} coins when a business signs up with your code and makes its first payment.', { coins: <b>{overview.coins?.merchant}</b> })}</li>
      </ul>
      <div className="grid grid-cols-2 gap-2">
        {tile(t('Home sellers'), invited.sellers, 'refer-count-sellers')}
        {tile(t('Businesses'), invited.businesses, 'refer-count-businesses')}
        {tile(t('Still to list or pay'), invited.waiting, 'refer-count-waiting')}
        {tile(t('Coins earned'), invited.coins, 'refer-count-coins')}
      </div>
      {/* Sellio World is admins-only until it opens (lib/worldAccess.js). */}
      <p className="text-[13px] leading-[19px] text-slate-600" data-testid="refer-balance">
        {worldOpen
          ? t('You have {coins} coins. {link}', {
            coins: <b>{Number(overview.balance) || 0}</b>,
            link: <Link to="/World" className="font-semibold text-blue-600 hover:text-blue-700">{t('Spend them on your stall in Sellio World')}</Link>,
          })
          : t('You have {coins} coins to spend when Sellio World opens.', { coins: <b>{Number(overview.balance) || 0}</b> })}
      </p>
    </Card>
  );
}

export default function Refer() {
  const { t, textKey, locale } = useAppText('explore');
  const { appUser } = useAppUser() || {};
  const { tenant, isOwner, subscription, noStore, isLoading: tenantLoading } = useTenant();
  const hasShop = !!appUser?.tenant_id && !noStore && !!tenant?.id;
  const owner = hasShop && !!isOwner;
  const business = owner && tenant.seller_type !== 'individual';
  const tenantId = tenant?.id;
  const worldOpen = useWorldAccess() === 'yes';

  const [overview, setOverview] = useState(null); // referral_overview: the shop's code and coins
  const [data, setData] = useState(null); // referral_dashboard: becoming a distributor (business shops)
  const [state, setState] = useState('loading'); // loading | ready | error
  const [admin, setAdmin] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!owner || !tenantId) return;
    if (!quiet) setState('loading');
    try {
      const [shopCode, answer] = await Promise.all([
        referralOverview(tenantId),
        business ? referralDashboard(tenantId) : Promise.resolve(null),
      ]);
      // Joining closed: only Sellio's admins can become distributors (to try it out before it opens).
      const isAdmin = answer && !answer.joined && !answer.joiningOpen ? await amISellioAdmin() : false;
      setAdmin(!!isAdmin);
      setOverview(shopCode || null);
      setData(answer || null);
      setState('ready');
    } catch {
      if (!quiet) setState('error');
    }
  }, [owner, business, tenantId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const previous = document.title;
    document.title = `${t('Refer & earn')} · Sellio`;
    return () => { document.title = previous; };
  }, [textKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async () => {
    if (joining || !data) return;
    setJoining(true);
    setJoinError('');
    try {
      await joinReferral(tenantId, data.termsVersion);
      await load({ quiet: true });
      toast.success(t('You’re a Sellio distributor now.'));
    } catch (error) {
      setJoinError(referralErrorMessage(error, t));
      // New terms since the page opened: read them again, then the next tap accepts those.
      if (error?.message === 'The distributor terms have changed. Please read them again.') load({ quiet: true });
    } finally {
      setJoining(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(overview.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('Could not copy. Press and hold the link to copy it.'));
    }
  };

  const showWhatsapp = async (show) => {
    const before = !!data?.showWhatsapp;
    setData((d) => ({ ...d, showWhatsapp: show }));
    setSavingWhatsapp(true);
    try {
      await setReferralWhatsapp(tenantId, show);
    } catch (error) {
      setData((d) => ({ ...d, showWhatsapp: before }));
      toast.error(referralErrorMessage(error, t, t('Couldn’t save that. Check your connection and try again.')));
    } finally {
      setSavingWhatsapp(false);
    }
  };

  // Which screen: who's asking, then what Sellio says.
  let view;
  if (!appUser) view = 'signin';
  else if (tenantLoading && !tenant) view = 'loading';
  else if (!hasShop) view = 'no-shop';
  else if (!owner) view = 'owner-only';
  else if (state !== 'ready' || !overview) view = state === 'error' ? 'error' : 'loading';
  else view = 'ready';

  // Becoming a distributor (business shops): where it stands.
  let distributor = null;
  if (view === 'ready' && business && data) {
    if (data.joined) distributor = 'joined';
    else if (!data.joiningOpen && !admin) distributor = 'soon';
    else if (data.joinBlock === 'trial' || data.joinBlock === 'no payment'
      || (data.joinBlock === undefined && subscription?.status === 'trial')) distributor = 'trial';
    else if (!data.canJoin) distributor = 'inactive';
    else distributor = 'join';
  }

  const rates = data?.rates;
  const openInfo = () => setInfoOpen(true);
  const homeShop = !!overview?.homeShop;
  const canShare = !!overview?.canShare;
  const usedUp = !!overview?.uses && Number(overview.uses.left) <= 0;
  const message = overview ? inviteMessage(t, tenant?.name, overview.link, { homeShop }) : '';
  let notEarning = null;
  if (distributor === 'joined') {
    if (data.status === 'paused') notEarning = t('Sellio has paused your code. Sign-ups with it don’t count while it’s paused.');
    else if (data.status === 'closed') notEarning = t('Refer & earn is closed for this shop.');
    else if (data.notEarningReason === 'own plan not active') notEarning = t('Your plan isn’t active, so shops you brought in don’t earn for you until it is.');
    else if (data.notEarningReason === 'shop closed' || data.notEarningReason === 'shop removed') notEarning = t('Your shop is closed, so shops you brought in don’t earn for you.');
  }

  return (
    <div className="min-h-screen bg-slate-50" data-testid="refer-page">
      <ExploreTabHeader title={t('Refer & earn')} />
      <main className="max-w-xl mx-auto px-4 pt-4 flex flex-col gap-3" style={{ paddingBottom: TAB_BAR_SPACE }}>
        {view === 'signin' && (
          <Card className="p-6 text-center">
            <Gift className="w-8 h-8 mx-auto text-slate-300" />
            <p className="mt-3 text-base font-bold text-slate-900">{t('Refer & earn')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('Log in to your shop to see your referral code.')}</p>
            <Link to="/Auth" onClick={() => rememberReturnPath('/explore/me')} className="mt-4 h-10 px-5 rounded-full text-sm font-semibold text-white inline-flex items-center" style={{ background: BRAND_GRADIENT }}>
              {t('Log in')}
            </Link>
          </Card>
        )}

        {(view === 'no-shop' || view === 'owner-only') && (
          <Card className="p-6 text-center">
            <Gift className="w-8 h-8 mx-auto text-slate-300" />
            <p className="mt-3 text-sm text-slate-600" data-testid="refer-not-for-you">
              {view === 'owner-only' ? t("Only the shop's owner can see this.") : t('Every Sellio shop has a referral code. Open a free home shop to get yours.')}
            </p>
            {view === 'no-shop'
              ? <Link to="/Join" className="mt-4 h-10 px-5 rounded-full text-sm font-semibold text-white inline-flex items-center" style={{ background: BRAND_GRADIENT }} data-testid="refer-open-shop">{t('Open a free home shop')}</Link>
              : <Link to="/explore/me" className="mt-4 h-10 px-5 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center">{t('Back to Me')}</Link>}
          </Card>
        )}

        {view === 'loading' && (
          <Card className="p-8 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></Card>
        )}

        {view === 'error' && (
          <Card className="p-8 text-center">
            <p className="text-sm text-slate-600">{t('We couldn’t load Refer & earn just now.')}</p>
            <button type="button" onClick={() => load()} className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" />{' '}{t('Try again')}
            </button>
          </Card>
        )}

        {view === 'ready' && (
          <>
            {notEarning && (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900" data-testid="refer-not-earning">{notEarning}</p>
            )}
            <section className="rounded-2xl p-4 text-white flex flex-col gap-2.5" style={{ background: BRAND_GRADIENT }} data-testid="refer-code-card">
              <div className="flex items-center justify-between gap-2 min-h-11">
                <span className="text-[13px] leading-[18px] font-semibold">{t('Your referral code')}</span>
                {business && <InfoButton onClick={openInfo} label={t('How Refer & earn works')} />}
              </div>
              <p className={`text-[34px] leading-10 font-extrabold tracking-[0.14em] ${canShare ? '' : 'opacity-60'}`} data-testid="refer-code">{overview.code}</p>
              <p className="text-sm leading-5 break-all">{String(overview.link || '').replace(/^https?:\/\//, '')}</p>
              {overview.uses && (
                <p className="rounded-xl bg-white/15 px-3 py-2 text-[13px] leading-[19px] font-semibold" data-testid={usedUp ? 'refer-code-used' : 'refer-code-once'}>
                  {usedUp
                    ? t('Your code has earned its coins. Thank you for bringing someone to Sellio!')
                    : t('A home shop’s code earns once: for the first shop that joins with it.')}
                </p>
              )}
              {canShare && (
                <div className="mt-0.5 grid grid-cols-3 gap-2">
                  <a {...outsideLinkProps(whatsAppLink(message))} className="h-11 rounded-xl bg-white/20 text-sm font-semibold inline-flex items-center justify-center gap-1.5" data-testid="refer-card-whatsapp">
                    <MessageCircle className="w-4 h-4" />{' '}WhatsApp
                  </a>
                  <button type="button" onClick={copyLink} className="h-11 rounded-xl bg-white/20 text-sm font-semibold inline-flex items-center justify-center gap-1.5" data-testid="refer-copy">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{' '}{copied ? t('Copied') : t('Copy')}
                  </button>
                  <button type="button" onClick={() => setShareOpen(true)} className="h-11 rounded-xl bg-white/20 text-sm font-semibold inline-flex items-center justify-center gap-1.5" data-testid="refer-qr-button">
                    <QrCode className="w-4 h-4" />{' '}{t('QR code')}
                  </button>
                </div>
              )}
            </section>

            <CoinsCard t={t} overview={overview} worldOpen={worldOpen} />

            {distributor === 'join' && (
              <Pitch t={t} rates={rates} locale={locale} onInfo={openInfo}>
                <button
                  type="button"
                  onClick={join}
                  disabled={joining}
                  className="mt-1 h-12 rounded-xl bg-white text-[15px] font-bold text-blue-900 inline-flex items-center justify-center gap-2 disabled:opacity-70"
                  data-testid="refer-join"
                >
                  {joining ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <HandCoins className="w-[18px] h-[18px]" />}{' '}{t('Become a distributor')}
                </button>
                {joinError && <p role="alert" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-rose-700" data-testid="refer-join-error">{joinError}</p>}
                <p className="text-xs leading-[17px] text-white/85">
                  {t('By tapping, you agree to the {terms}.', {
                    terms: <Link to={DISTRIBUTOR_TERMS_PATH} className="underline underline-offset-2 font-semibold text-white">{t('Sellio Distributor Terms')}</Link>,
                  })}
                </p>
                {!data.joiningOpen && admin && (
                  <p className="text-xs leading-[17px] text-white/85" data-testid="refer-admin-only">{t('Joining is closed for now. You can join because you’re a Sellio admin.')}</p>
                )}
              </Pitch>
            )}

            {(distributor === 'soon' || distributor === 'trial' || distributor === 'inactive') && (
              <Pitch t={t} rates={rates} locale={locale} onInfo={openInfo}>
                <Notice testId={`refer-${distributor}`}>
                  {distributor === 'soon' && t('Distributor earnings aren’t open yet. Your code earns coins in the meantime.')}
                  {distributor === 'trial' && t('You can become a distributor after your shop’s first payment.')}
                  {distributor === 'inactive' && t('You can become a distributor when your business plan is active.')}
                </Notice>
              </Pitch>
            )}

            {distributor === 'joined' && (
              <Card className="flex flex-col gap-3" testId="refer-distributor">
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-[10px] bg-purple-50 flex items-center justify-center flex-shrink-0"><HandCoins className="w-[18px] h-[18px] text-purple-700" /></span>
                  <p className="min-w-0 text-[14px] leading-5 text-slate-700">
                    <b className="block text-[15px] text-slate-900">{t('You’re a Sellio distributor')}</b>
                    {t('{monthly} of every monthly payment and {yearly} of every yearly payment from shops that join with your code.', {
                      monthly: ratePercent(rates?.monthly, locale), yearly: ratePercent(rates?.yearly, locale),
                    })}
                  </p>
                </div>
                {data.status === 'active' && (
                  <div className="flex items-start gap-3 border-t border-slate-100 pt-3">
                    <span className="min-w-0 flex-1">
                      <label htmlFor="refer-whatsapp-switch" className="block text-[15px] leading-5 font-bold text-slate-900">{t('Show my WhatsApp on my invite page')}</label>
                      <span className="block mt-0.5 text-[13px] leading-[19px] text-slate-600">
                        {appUser?.phone
                          ? t('Owners who open your link can message you for help with setting up.')
                          : t('Owners who open your link can message you for help with setting up. Add your mobile number to your profile first.')}
                      </span>
                    </span>
                    <Switch
                      id="refer-whatsapp-switch"
                      checked={!!data.showWhatsapp}
                      onCheckedChange={showWhatsapp}
                      disabled={savingWhatsapp}
                      data-testid="refer-whatsapp-switch"
                    />
                  </div>
                )}
              </Card>
            )}

            {business && (
              <>
                <Steps t={t} />
                <FooterLinks t={t} onInfo={openInfo} />
              </>
            )}
          </>
        )}
      </main>
      <ExploreTabBar active="me" />

      {business && <InfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} rates={rates} />}
      {overview && canShare && (
        <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} code={overview.code} link={overview.link} shopName={tenant?.name} tenantId={tenantId} homeShop={homeShop} />
      )}
    </div>
  );
}
