import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Check, CircleCheck, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { useAppUser } from '@/lib/AppUserContext';
import { rememberReturnPath } from '@/lib/authNavigation';
import { RUPIAH_NOTE, SELLIO_WHATSAPP, plansFor, rupiahAmount, sellioWhatsAppUrl } from '@/lib/plans';
import { usePlanRegion } from '@/lib/usePlanRegion';
import { outsideLinkProps } from '@/lib/nativeApp';
import { forgetReferral, keepReferral, keptReferral, referralCode, referralCodeInfo, whatsAppLink, withReferral } from '@/lib/referral';
import { LOGO_URL } from '@/components/explore/shared';
import AppLanguageSwitch from '@/components/ui-custom/AppLanguageSwitch';
import { useAppText, N_ } from '@/lib/appText';

// The invite page, sellio.sg/r/CODE (screen 9 of the build plan): who invited them, the code
// applied, and the business plans with the 7-day free trial. The code is kept on this device for
// 60 days (lib/referral.js), so the plan buttons here and on the landing page carry it into
// Stripe's checkout; an owner who already sells from home logs in and moves their shop to a
// business plan with the code filled in. Signed out, so it reads only referral_code_info:
// the shop's name and logo, the owner's first name, and their WhatsApp if they chose to show it.

const PINK = '#be185d';
const INK = '#1f1530';
const MUTED = '#5b5470';
const WARM = 'linear-gradient(135deg, #c2410c 0%, #be185d 55%, #7e22ce 100%)';
const TOP_BAR = 'linear-gradient(90deg, #fb923c 0%, #e0449a 50%, #8b2fc9 100%)';
const HIGHLIGHTS = [
  N_('POS counter, QR ordering and storefront'),
  N_('Kitchen display and receipt printing'),
  N_('Reports and Sellio AI tools'),
];
const money = (amount) => `S$${Number(amount).toLocaleString('en-SG')}`;
const sellioNumber = `+${SELLIO_WHATSAPP.slice(0, 2)} ${SELLIO_WHATSAPP.slice(2, 6)} ${SELLIO_WHATSAPP.slice(6)}`;

function Avatar({ info }) {
  const [broken, setBroken] = useState(false);
  const letter = (info.shopName || info.firstName || 'S').trim().charAt(0).toUpperCase();
  if (info.logoUrl && !broken) {
    return <img src={info.logoUrl} alt="" onError={() => setBroken(true)} className="w-11 h-11 rounded-full object-cover bg-white border border-pink-100 flex-shrink-0" />;
  }
  return (
    <span aria-hidden="true" className="w-11 h-11 rounded-full text-white text-lg font-bold flex items-center justify-center flex-shrink-0" style={{ background: WARM }}>
      {letter}
    </span>
  );
}

export default function ReferralInvite() {
  const { t, textKey } = useAppText('signup');
  const { code: rawCode } = useParams();
  const code = referralCode(rawCode);
  const { appUser } = useAppUser() || {};
  const [info, setInfo] = useState(null);
  const [state, setState] = useState(code ? 'loading' : 'missing'); // loading | ready | missing | error
  const [yearly, setYearly] = useState(false);
  const region = usePlanRegion();
  const plans = plansFor(region);

  const load = useCallback(async () => {
    if (!code) { setState('missing'); return; }
    setState('loading');
    try {
      const answer = await referralCodeInfo(code);
      if (answer?.found) {
        keepReferral(answer);
        setInfo(answer);
        setState('ready');
      } else {
        // A code that no longer works (paused or closed): don't carry it into a checkout.
        if (keptReferral()?.code === code) forgetReferral();
        setState('missing');
      }
    } catch {
      setState('error');
    }
  }, [code]);
  useEffect(() => { load(); }, [load]);

  const name = info?.firstName || info?.shopName || '';
  useEffect(() => {
    const previous = document.title;
    document.title = state === 'ready' && name ? `${t('{name} invited you to Sellio', { name })} · Sellio` : 'Sellio';
    return () => { document.title = previous; };
  }, [state, name, textKey]); // eslint-disable-line react-hooks/exhaustive-deps

  let who = null;
  if (info?.firstName && info?.shopName) who = t('{name} from {shop}', { name: info.firstName, shop: info.shopName });
  else who = info?.shopName || info?.firstName || '';

  const homeSellerLink = appUser
    ? <Link to="/explore/me" className="font-bold text-purple-800">{t('Open Sellio')}</Link>
    : <Link to="/Auth" onClick={() => rememberReturnPath('/explore/me')} className="font-bold text-purple-800">{t('Log in')}</Link>;

  return (
    <div className="min-h-screen bg-white" style={{ color: INK }} data-testid="referral-invite">
      <div aria-hidden="true" className="h-[5px]" style={{ background: TOP_BAR }} />
      <div className="max-w-md mx-auto pb-6">
        <header className="flex items-center justify-between gap-2 px-[18px] py-3">
          <a href="/" aria-label="Sellio"><img src={LOGO_URL} alt="Sellio" className="h-[46px] w-10 object-contain" /></a>
          <div className="flex items-center gap-2">
            <AppLanguageSwitch />
            {!appUser && (
              <Link to="/Auth" onClick={() => rememberReturnPath('/explore/me')} className="min-h-11 inline-flex items-center text-[15px] font-bold text-purple-800">{t('Log in')}</Link>
            )}
          </div>
        </header>

        {state === 'loading' && (
          <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>
        )}

        {state === 'error' && (
          <section className="mx-[18px] mt-6 rounded-[18px] border border-slate-200 p-6 text-center">
            <p className="text-[15px]" style={{ color: MUTED }}>{t('We couldn’t open this invite just now.')}</p>
            <button type="button" onClick={load} className="mt-3 h-10 px-4 rounded-full border border-slate-200 text-sm font-semibold inline-flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" />{' '}{t('Try again')}
            </button>
          </section>
        )}

        {state === 'missing' && (
          <section className="mx-[18px] mt-6 rounded-[18px] border border-slate-200 p-6 text-center" data-testid="invite-missing">
            <p className="text-lg font-bold">{t('This invite link isn’t active.')}</p>
            <p className="mt-1 text-[15px]" style={{ color: MUTED }}>{t('You can still try Sellio free for 7 days.')}</p>
            <a href="/#pricing" className="mt-4 h-11 px-5 rounded-xl text-white text-[15px] font-bold inline-flex items-center" style={{ background: WARM }}>{t('See plans')}</a>
          </section>
        )}

        {state === 'ready' && info && (
          <>
            <section className="mx-[18px] mt-1 p-3.5 rounded-[18px] border flex flex-col gap-2.5" style={{ background: '#fdf7fb', borderColor: '#f5d0e6' }} data-testid="invite-from">
              <div className="flex items-center gap-3">
                <Avatar info={info} />
                <p className="text-[15px] leading-[21px]">
                  {t('{who} invited you to Sellio.', { who: <b>{who}</b> })}
                  {info.shopName ? <>{' '}{t('{shop} uses Sellio for its counter and orders.', { shop: info.shopName })}</> : null}
                </p>
              </div>
              <p className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] font-bold text-emerald-700" data-testid="invite-applied">
                <CircleCheck className="w-4 h-4" />{' '}{t('Referral code {code} applied', { code: info.code })}
              </p>
            </section>

            <section className="px-[18px] pt-[22px] pb-1.5 flex flex-col gap-2.5">
              <h1 className="text-[32px] leading-9 font-extrabold tracking-[-0.02em]">{t('Your business, beautifully online')}</h1>
              <p className="text-base leading-6" style={{ color: MUTED }}>{t('One app for your counter, table QR ordering, kitchen display and receipts. Try any plan free for 7 days.')}</p>
              <ul className="mt-1 flex flex-col gap-2">
                {HIGHLIGHTS.map((line) => (
                  <li key={line} className="flex items-center gap-2 text-[15px] leading-[21px]">
                    <CircleCheck className="w-[18px] h-[18px] flex-shrink-0" style={{ color: PINK }} />{t(line)}
                  </li>
                ))}
              </ul>
            </section>

            <div role="radiogroup" aria-label={t('Billing')} className="mx-[18px] mt-2.5 grid grid-cols-2 gap-1 p-1 rounded-full" style={{ background: '#f4eefa' }}>
              {[[false, t('Monthly')], [true, `${t('Yearly')} · ${t('2 months free')}`]].map(([isYearly, label]) => (
                <button
                  key={String(isYearly)}
                  type="button"
                  role="radio"
                  aria-checked={yearly === isYearly}
                  onClick={() => setYearly(isYearly)}
                  className={`h-11 rounded-full text-[15px] font-bold ${yearly === isYearly ? 'bg-white shadow-[0_1px_2px_rgba(31,21,48,0.12)]' : ''}`}
                  style={{ color: yearly === isYearly ? INK : MUTED }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="px-[18px] pt-3 flex flex-col gap-3">
              {plans.map((plan) => {
                const featured = plan.key === 'growth';
                const price = yearly ? plan.yearly : plan.monthly;
                const href = withReferral(yearly ? plan.links.yearly : plan.links.monthly, info.code);
                const features = plan.features.filter((f) => !/^Everything in /.test(f)).slice(0, 3);
                return (
                  <article
                    key={plan.key}
                    className="p-4 rounded-[18px] bg-white flex flex-col gap-2.5"
                    style={{ border: featured ? '2px solid #c084fc' : '1px solid #ece2f6' }}
                    data-plan={plan.key}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[17px] leading-[22px] font-bold">{plan.name}</h3>
                      {featured && <span className="text-[11px] leading-4 font-bold px-2 py-[3px] rounded-full bg-purple-100 text-purple-800">{t('Most Popular')}</span>}
                    </div>
                    <p className="flex items-baseline gap-1">
                      <span className="text-[30px] leading-[34px] font-extrabold">{money(price)}</span>
                      <span className="text-sm" style={{ color: MUTED }}>{yearly ? t('/year') : t('/month')}</span>
                      <span className="ml-auto text-[13px]" style={{ color: MUTED }}>
                        {yearly ? t('or {price}/month', { price: money(plan.monthly) }) : t('or {price}/year', { price: money(plan.yearly) })}
                      </span>
                    </p>
                    {region === 'ID' && <p className="text-xs font-medium -mt-1.5" style={{ color: MUTED }} data-testid="plan-rupiah">{t(RUPIAH_NOTE, { amount: rupiahAmount(price) })}</p>}
                    <ul className="flex flex-col gap-1.5">
                      {features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm leading-5 text-[#3f3a4f]">
                          <Check className="w-4 h-4 text-emerald-700 flex-shrink-0" strokeWidth={2.5} />{t(feature)}
                        </li>
                      ))}
                    </ul>
                    <a
                      {...outsideLinkProps(href)}
                      className={`h-[46px] rounded-xl text-[15px] font-bold inline-flex items-center justify-center gap-1.5 ${featured ? 'text-white' : 'bg-white border border-[#d8cbe6]'}`}
                      style={featured ? { background: WARM } : { color: INK }}
                      data-testid="invite-trial"
                    >
                      {t('Start 7-day free trial')}<ArrowUpRight className="w-4 h-4" />
                    </a>
                  </article>
                );
              })}
            </div>

            <section className="mx-[18px] mt-[18px] p-4 rounded-[18px] border flex flex-col gap-2.5" style={{ background: '#faf7fd', borderColor: '#ece2f6' }}>
              <h2 className="text-[17px] leading-[22px] font-bold">{t('Want help setting up?')}</h2>
              {info.whatsapp ? (
                <>
                  <p className="text-sm leading-[21px]" style={{ color: MUTED }}>{t('{name} can show you around and help you set up.', { name })}</p>
                  <a
                    {...outsideLinkProps(whatsAppLink(t('Hi {name}, I opened your Sellio invite (code {code}). Can you help me get started?', { name, code: info.code }), info.whatsapp))}
                    className="h-[46px] rounded-xl text-white text-[15px] font-bold inline-flex items-center justify-center gap-2"
                    style={{ background: INK }}
                    data-testid="invite-whatsapp"
                  >
                    <MessageCircle className="w-[18px] h-[18px]" />{' '}{t('WhatsApp {name}', { name })}
                  </a>
                  <p className="text-[13px] leading-[19px]" style={{ color: MUTED }}>
                    {t('Or message Sellio on WhatsApp at {number}.', {
                      number: <a {...outsideLinkProps(sellioWhatsAppUrl(t('Hi, I’d like help setting up Sellio. My referral code is {code}.', { code: info.code })))} className="font-semibold text-purple-800">{sellioNumber}</a>,
                    })}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm leading-[21px]" style={{ color: MUTED }}>{t('Message Sellio on WhatsApp and we’ll help you set up.')}</p>
                  <a
                    {...outsideLinkProps(sellioWhatsAppUrl(t('Hi, I’d like help setting up Sellio. My referral code is {code}.', { code: info.code })))}
                    className="h-[46px] rounded-xl text-white text-[15px] font-bold inline-flex items-center justify-center gap-2"
                    style={{ background: INK }}
                  >
                    <MessageCircle className="w-[18px] h-[18px]" />{' '}{t('WhatsApp Sellio')}
                  </a>
                </>
              )}
            </section>

            <p className="mx-[18px] mt-4 text-sm leading-[21px] text-[#3f3a4f]">
              {t('Already selling from home on Sellio? {link} and move your shop to a business plan. The code stays applied.', { link: homeSellerLink })}
            </p>
            <p className="mx-[18px] mt-3.5 text-xs leading-[18px]" style={{ color: MUTED }} data-testid="invite-disclosure">
              {t('{name} earns a commission from Sellio if you subscribe. Your price is the same.', { name })}
            </p>
          </>
        )}

        <footer className="mt-[18px] px-[18px] pt-3.5 border-t border-[#f0eaf6] flex gap-4 text-[13px]" style={{ color: MUTED }}>
          <span>sellio.sg</span>
          <Link to="/privacy" className="underline underline-offset-2">{t('Privacy')}</Link>
          <Link to="/terms" className="underline underline-offset-2">{t('Terms')}</Link>
        </footer>
      </div>
    </div>
  );
}
