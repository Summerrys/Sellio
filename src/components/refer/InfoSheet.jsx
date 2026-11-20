import React, { useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { HandCoins, RotateCcw, ShieldCheck, Users, X } from 'lucide-react';
import BottomSheet from '@/components/explore/BottomSheet';
import { handOverBackStep } from '@/lib/useBackToClose';
import { DISTRIBUTOR_TERMS_PATH, ratePercent } from '@/lib/referral';
import { useAppText } from '@/lib/appText';

// How Refer & earn works (screen 2, the "i" next to the code): the rules, with the rates from
// Sellio's settings. Where the money goes (the wallet, pay runs) waits for its own decision
// (Alvin, 20 Nov 2026), so it isn't here yet.
function Item({ icon: Icon, title, children, last = false }) {
  return (
    <div className={`flex gap-3 py-3 ${last ? '' : 'border-b border-slate-100'}`}>
      <span className="w-9 h-9 rounded-[10px] bg-purple-50 flex items-center justify-center flex-shrink-0">
        <Icon className="w-[18px] h-[18px] text-purple-700" />
      </span>
      <div className="min-w-0 flex flex-col gap-0.5">
        <h3 className="text-[15px] leading-5 font-bold text-slate-900">{title}</h3>
        <p className="text-[13px] leading-[19px] text-slate-600">{children}</p>
      </div>
    </div>
  );
}

export default function InfoSheet({ open, onClose, rates }) {
  const { t, locale } = useAppText('explore');
  const navigate = useNavigate();
  const titleId = useId();
  const pct = (rate) => ratePercent(rate, locale);
  const count = Number(rates?.milestoneShops) || 10;
  return (
    <BottomSheet open={open} onClose={onClose} labelledBy={titleId}>
      <section aria-labelledby={titleId} className="flex flex-col gap-1.5 pb-1" data-testid="refer-info-sheet">
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold text-slate-900">{t('How Refer & earn works')}</h2>
          <button type="button" onClick={onClose} aria-label={t('Close')} className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-5 h-5 text-slate-700" />
          </button>
        </div>
        <Item icon={HandCoins} title={t('{monthly} of monthly, {yearly} of yearly payments', { monthly: pct(rates?.monthly), yearly: pct(rates?.yearly) })}>
          {t('Every time a shop that joined with your code pays its plan, for as long as it stays. Free trials and failed payments don’t earn.')}
        </Item>
        <Item icon={RotateCcw} title={t('Your plan fee back at {count} shops', { count })}>
          {t('When {count} shops on the same billing as you (monthly or yearly) have paid, you earn one month’s or one year’s fee of your plan. Any plan counts. Once.', { count })}
        </Item>
        <Item icon={Users} title={t('A bonus for friends who sell')}>
          {t('A friend who joins Sellio with your code and shares their own: once {count} of their shops pay monthly, you get an extra {monthly} of those payments; {count} yearly, an extra {yearly}.', { count, monthly: pct(rates?.friendMonthly), yearly: pct(rates?.friendYearly) })}
        </Item>
        <Item icon={ShieldCheck} title={t('Shops stay private')} last>
          {t('Sellio doesn’t show you which shops joined, their plans, or who became a distributor.')}
        </Item>
        <a
          href={DISTRIBUTOR_TERMS_PATH}
          // A link out of an open window: the window's Back step becomes the terms page's.
          onClick={(event) => { event.preventDefault(); navigate(DISTRIBUTOR_TERMS_PATH, { replace: handOverBackStep() }); }}
          className="self-start py-2 inline-flex items-center text-[13px] font-semibold text-blue-600 hover:text-blue-700"
        >
          {t('Read the Sellio Distributor Terms')}
        </a>
      </section>
    </BottomSheet>
  );
}
