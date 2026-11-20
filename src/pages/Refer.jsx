import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Gift, Info, Loader2, MessageCircle, QrCode, RefreshCw, Share2, Store, HandCoins } from 'lucide-react';
import { toast } from 'sonner';
import { useAppUser } from '@/lib/AppUserContext';
import { useTenant } from '@/components/tenant/TenantContext';
import { rememberReturnPath } from '@/lib/authNavigation';
import { amISellioAdmin } from '@/lib/appFeedback';
import {
  DISTRIBUTOR_TERMS_PATH, joinReferral, ratePercent, referralDashboard, referralErrorMessage, setReferralWhatsapp, whatsAppLink,
} from '@/lib/referral';
import { outsideLinkProps } from '@/lib/nativeApp';
import ExploreTabBar, { TAB_BAR_SPACE } from '@/components/explore/ExploreTabBar';
import { BRAND_GRADIENT, ExploreTabHeader } from '@/components/explore/shared';
import { Switch } from '@/components/ui/switch';
import ShareSheet, { inviteMessage } from '@/components/refer/ShareSheet';
import InfoSheet from '@/components/refer/InfoSheet';
import { useAppText } from '@/lib/appText';

// Refer & earn (/refer, from the Me tab's row; screens 3a and 3 of the build plan). The owner of
// a business shop gets a code here with one tap ("Get my referral code" records the distributor
// terms), then shares it: WhatsApp, the link, or the QR on their phone.
//
// Alvin, 20 Nov 2026:
// - "this referral program will only start when the merchant is actually a paying merchant", then
//   "make joining require a recorded payment and a plan past its trial": Sellio refuses the rest
//   (referral_join), and the dashboard says why (joinBlock); a shop on its free trial, or with no
//   payment recorded, sees that Refer & earn opens after its first payment.
// - "for the wallet and also how the distributor actually earns the money, where does it go
//   to, etc. Put them aside first": no wallet, pending earnings or plan-fee-back progress here
//   yet; the database keeps counting them from the first sign-up.

function Card({ children, className = '' }) {
  return <section className={`bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4 ${className}`}>{children}</section>;
}

function InfoButton({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0" data-testid="refer-info">
      <Info className="w-5 h-5 text-white" />
    </button>
  );
}

// The three steps, under the first visit and the code.
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

// "Earn on every shop you bring to Sellio": the first visit, with the button when the shop can
// join, or a line saying why not yet.
function Pitch({ t, rates, locale, onInfo, children }) {
  return (
    <section className="rounded-2xl p-4 text-white flex flex-col gap-2.5" style={{ background: BRAND_GRADIENT }} data-testid="refer-pitch">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[22px] leading-7 font-extrabold">{t('Earn on every shop you bring to Sellio')}</h2>
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

export default function Refer() {
  const { t, textKey, locale } = useAppText('explore');
  const { appUser } = useAppUser() || {};
  const { tenant, isOwner, subscription, noStore, isLoading: tenantLoading } = useTenant();
  const hasShop = !!appUser?.tenant_id && !noStore && !!tenant?.id;
  const business = hasShop && tenant.seller_type !== 'individual';
  const owner = business && !!isOwner;
  const tenantId = tenant?.id;

  const [data, setData] = useState(null); // referral_dashboard's answer
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
      const answer = await referralDashboard(tenantId);
      // Joining closed: only Sellio's admins can join (to try it out before it opens).
      const isAdmin = !answer?.joined && !answer?.joiningOpen ? await amISellioAdmin() : false;
      setAdmin(!!isAdmin);
      setData(answer || null);
      setState('ready');
    } catch {
      if (!quiet) setState('error');
    }
  }, [owner, tenantId]);
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
      toast.success(t('Your referral code is ready.'));
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
      await navigator.clipboard.writeText(data.link);
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
  else if (!business) view = 'business-only';
  else if (!owner) view = 'owner-only';
  else if (state !== 'ready' || !data) view = state === 'error' ? 'error' : 'loading';
  else if (data.joined) view = 'joined';
  else if (!data.joiningOpen && !admin) view = 'soon';
  else if (data.joinBlock === 'trial' || data.joinBlock === 'no payment'
    || (data.joinBlock === undefined && subscription?.status === 'trial')) view = 'trial';
  else if (!data.canJoin) view = 'inactive';
  else view = 'join';

  const rates = data?.rates;
  const openInfo = () => setInfoOpen(true);
  const message = data?.joined ? inviteMessage(t, tenant?.name, data.link) : '';
  const active = data?.joined && data.status === 'active';
  let notEarning = null;
  if (data?.joined) {
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

        {(view === 'business-only' || view === 'owner-only') && (
          <Card className="p-6 text-center">
            <Gift className="w-8 h-8 mx-auto text-slate-300" />
            <p className="mt-3 text-sm text-slate-600" data-testid="refer-not-for-you">
              {view === 'owner-only' ? t("Only the shop's owner can see this.") : t('Refer & earn is for the owners of business shops on a paid plan.')}
            </p>
            <Link to="/explore/me" className="mt-4 h-10 px-5 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center">{t('Back to Me')}</Link>
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

        {view === 'join' && (
          <>
            <Pitch t={t} rates={rates} locale={locale} onInfo={openInfo}>
              <button
                type="button"
                onClick={join}
                disabled={joining}
                className="mt-1 h-12 rounded-xl bg-white text-[15px] font-bold text-blue-900 inline-flex items-center justify-center gap-2 disabled:opacity-70"
                data-testid="refer-join"
              >
                {joining ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Gift className="w-[18px] h-[18px]" />}{' '}{t('Get my referral code')}
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
            <Steps t={t} />
            <FooterLinks t={t} onInfo={openInfo} />
          </>
        )}

        {(view === 'soon' || view === 'trial' || view === 'inactive') && (
          <>
            <Pitch t={t} rates={rates} locale={locale} onInfo={openInfo}>
              <Notice testId={`refer-${view}`}>
                {view === 'soon' && t("Refer & earn isn't open yet.")}
                {view === 'trial' && t('Refer & earn opens after your shop’s first payment. Your code will be here then.')}
                {view === 'inactive' && t('Refer & earn opens when your business plan is active.')}
              </Notice>
            </Pitch>
            <Steps t={t} />
            <FooterLinks t={t} onInfo={openInfo} />
          </>
        )}

        {view === 'joined' && (
          <>
            {notEarning && (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900" data-testid="refer-not-earning">{notEarning}</p>
            )}
            <section className="rounded-2xl p-4 text-white flex flex-col gap-2.5" style={{ background: BRAND_GRADIENT }} data-testid="refer-code-card">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] leading-[18px] font-semibold">{t('Your referral code')}</span>
                <InfoButton onClick={openInfo} label={t('How Refer & earn works')} />
              </div>
              <p className={`text-[34px] leading-10 font-extrabold tracking-[0.14em] ${active ? '' : 'opacity-60'}`} data-testid="refer-code">{data.code}</p>
              <p className="text-sm leading-5 break-all">{String(data.link || '').replace(/^https?:\/\//, '')}</p>
              {active && (
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

            {active && (
              <Card className="flex items-start gap-3">
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
              </Card>
            )}

            <Steps t={t} />
            <FooterLinks t={t} onInfo={openInfo} />
          </>
        )}
      </main>
      <ExploreTabBar active="me" />

      <InfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} rates={rates} />
      {data?.joined && (
        <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} code={data.code} link={data.link} shopName={tenant?.name} tenantId={tenantId} />
      )}
    </div>
  );
}
