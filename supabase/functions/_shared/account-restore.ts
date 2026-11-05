// Keep my account (closed-account, Alvin 5 Nov 2026: "restore instantly"): once
// public.account_restore_now has opened the account again, its shops' paid plans renew again.
//
// When the deletion was asked for, delete-account stopped each plan renewing
// (cancel_at_period_end, with metadata sellio_deletion_request = the request's id), or cancelled
// it at once when payment was overdue, and recorded which (stripe_result). Here each one is
// read from Stripe as it is now:
//   - still running and set to end by delete-account itself: renewal is switched back on
//   - still running and renewing: nothing to do
//   - set to end by the owner before the deletion (no Sellio note on it): left as it is
//   - ended (cancelled at the deletion, or its paid period ran out since): can't be resumed;
//     the owner chooses a plan again
// Anything not renewing again is reported, so the admins can follow it up.

export type StripeSubscriptions = {
  subscriptions: {
    retrieve(id: string): Promise<any>;
    update(id: string, params: Record<string, unknown>): Promise<any>;
  };
};

export type Renewal = {
  id: string;
  tenantId?: string;
  result: "renews_again" | "ended" | "left_as_is" | "failed";
  detail?: string;
};

const RUNNING = new Set(["active", "trialing"]);
const ENDED = new Set(["canceled", "incomplete_expired"]);

export async function renewAfterRestore(
  stripe: StripeSubscriptions | null,
  requestId: string,
  stripeResult: unknown,
): Promise<Renewal[]> {
  const entries = Array.isArray(stripeResult) ? stripeResult : [];
  const renewals: Renewal[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const id = typeof entry?.id === "string" ? entry.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const base: Renewal = { id, result: "failed", ...(typeof entry.tenantId === "string" ? { tenantId: entry.tenantId } : {}) };
    try {
      if (!stripe) throw new Error("STRIPE_SECRET_KEY is not configured");
      const sub = await stripe.subscriptions.retrieve(id);
      const status = String(sub?.status ?? "");
      if (ENDED.has(status)) {
        renewals.push({ ...base, result: "ended", detail: entry.action === "cancelled_now"
          ? "cancelled when the deletion was asked for (payment was overdue)"
          : "its paid period ran out before the account was kept" });
      } else if (!RUNNING.has(status)) {
        renewals.push({ ...base, result: "left_as_is", detail: `Stripe status ${status || "unknown"}` });
      } else if (!sub.cancel_at_period_end) {
        renewals.push({ ...base, result: "renews_again" });
      } else if (String(sub.metadata?.sellio_deletion_request ?? "") !== requestId) {
        renewals.push({ ...base, result: "left_as_is", detail: "set to end before the deletion was asked for" });
      } else {
        await stripe.subscriptions.update(id, { cancel_at_period_end: false, metadata: { sellio_deletion_request: "" } });
        renewals.push({ ...base, result: "renews_again" });
      }
    } catch (error) {
      renewals.push({ ...base, result: "failed", detail: String((error as Error)?.message ?? error).slice(0, 300) });
    }
  }
  return renewals;
}

// For the admins' alert: the plans that aren't renewing again, in plain words.
export function renewalsNeedingAHand(renewals: Renewal[]): string | null {
  const words: Record<Renewal["result"], string> = {
    renews_again: "renews again",
    ended: "has ended, so the owner needs to choose a plan again",
    left_as_is: "was left as it was",
    failed: "couldn't be switched back on: do it in Stripe",
  };
  const lines = renewals
    .filter((r) => r.result !== "renews_again")
    .map((r) => `${r.id} ${words[r.result]}${r.detail ? ` (${r.detail})` : ""}`);
  return lines.length ? lines.join("; ") : null;
}
