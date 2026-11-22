import { useEffect, useRef } from 'react';
import { reconcileBilling } from '@/lib/billing';

// "Your trial ends soon" (components/subscription/TrialReminderModal), for a shop's owner, is only
// for a trial after which no plan starts: its plan was cancelled during the trial (or, on Alvin's
// own test shops, which get a trial without checkout, there is no Stripe plan behind it), so the
// shop locks when the trial ends. A trial whose plan starts by itself when the trial ends (Stripe
// charges the card saved at checkout) is never warned about (Alvin, 15 Jun and 22 Nov 2026).
// In the trial's last 24 hours Sellio asks Stripe (reconcile-billing): once, then at most every
// 10 minutes while Sellio is open (a plan cancelled meanwhile), one question at a time. When Stripe
// can't be asked (no connection, a server error), nothing is shown and Sellio asks again 2 minutes
// later. Until 22 Nov 2026 an error showed the reminder, and Sellio asked on every 30-second plan
// refresh, sometimes twice at once: two at once deadlocked the billing sync, and its error told
// Cafelicious, which hadn't cancelled, that its trial was ending. A trial with no card saved got
// it too; it doesn't now.

const HOUR_MS = 60 * 60 * 1000;
export const ASK_HOURS = 24; // the trial's last 24 hours
export const CLOSABLE_HOURS = 12; // with more than 12 hours left, "Remind me later" closes it
export const RECHECK_MS = 10 * 60 * 1000;
export const RETRY_MS = 2 * 60 * 1000;
export const DISMISSED_KEY = 'trial_modal_dismissed'; // "Remind me later", for this session

// From reconcile-billing's answer: whether no plan starts when the trial ends. endsWithTrial counts
// both ways Stripe records a cancellation (cancel_at_period_end, or a cancel_at date no later than
// the trial's end); a reconcile-billing that doesn't send it yet reports cancel_at_period_end only.
export function trialEndsWithoutPlan(answer) {
  if (!answer || typeof answer !== 'object') return false;
  if (answer.status === 'no_subscription') return true; // no Stripe plan behind the trial
  if (answer.status === 'canceled' || answer.status === 'incomplete_expired') return true;
  if (typeof answer.endsWithTrial === 'boolean') return answer.endsWithTrial;
  return answer.cancelAtPeriodEnd === true;
}

// Whole hours left in a trial that is in its last 24 hours; null otherwise (not a trial, a trial
// with longer to go, or one already over: its plan has started, or the shop is locked).
export function trialHoursLeft(subscription, now = Date.now()) {
  if (subscription?.status !== 'trial' || !subscription.current_period_end) return null;
  const left = new Date(subscription.current_period_end).getTime() - now;
  if (!(left > 0)) return null;
  const hours = Math.floor(left / HOUR_MS);
  return hours > ASK_HOURS ? null : hours;
}

function dismissedThisSession() {
  try {
    return !!sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return false;
  }
}

// Asks Stripe about the owner's trial; show(closable) when no plan starts after it, hide() when one
// does, or when the shop isn't in a trial's last 24 hours (a plan that started, another shop).
// Runs on each plan refresh (Layout reads the plan every 30 seconds) and asks only when it's due.
// ask: for tests.
export function useTrialReminder({ tenantId, isOwner, subscription, show, hide, ask = reconcileBilling }) {
  const hoursLeft = isOwner && tenantId ? trialHoursLeft(subscription) : null;
  const key = hoursLeft == null ? null : `${tenantId}|${subscription.current_period_end}`;
  const latest = useRef(null);
  latest.current = { key, show, hide };
  const asked = useRef({ key: null, at: 0, wait: 0, busy: false });

  useEffect(() => {
    if (key == null) {
      latest.current.hide();
      return;
    }
    if (dismissedThisSession()) return;
    const last = asked.current;
    if (last.busy || (last.key === key && Date.now() - last.at < last.wait)) return;
    last.busy = true;
    const closable = hoursLeft > CLOSABLE_HOURS;
    Promise.resolve()
      .then(() => ask(tenantId))
      .then(
        (answer) => {
          Object.assign(last, { busy: false, key, at: Date.now(), wait: RECHECK_MS });
          const now = latest.current;
          if (now.key !== key) return; // another shop or another trial meanwhile
          if (trialEndsWithoutPlan(answer)) now.show(closable);
          else now.hide();
        },
        () => {
          // Stripe couldn't be asked: nothing is shown. Asked again shortly.
          Object.assign(last, { busy: false, key, at: Date.now(), wait: RETRY_MS });
        },
      );
  }, [key, hoursLeft, subscription, tenantId, ask]);
}
