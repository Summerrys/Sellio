// Records every paid Stripe invoice above S$0 in the referral programme's app.shop_payments,
// through the webhook's own code (invoicePaymentArgs, referral_record_payment; safe to run
// again): the payments made before the webhook started recording them (20 Nov 2026), and later
// to reconcile. The database starts a run: select app.referral_backfill_call('{"dryRun": true}');
// the answer is in net._http_response (supabase/migrations/20261120121646_referral_backfill_hook.sql).
// Body: dryRun (read Stripe, record nothing), limit (invoices a run, default 40, at most 100),
// startingAfter (go on from that invoice; the answer gives nextStartingAfter when there's more).
// Deploy with the paths from supabase/functions/: referral-backfill/index.ts,
// stripe-webhook/_shared/referrals.ts and stripe-webhook/_shared/billing.ts, entrypoint
// referral-backfill/index.ts, verify_jwt off (the Vault secret is the check).
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { findTenantId, getInvoiceSubscriptionId, getStripeClient } from "../stripe-webhook/_shared/billing.ts";
import { invoicePaymentArgs } from "../stripe-webhook/_shared/referrals.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = req.headers.get("x-sellio-backfill") ?? "";
  if (!/^[0-9a-f]{64}$/.test(secret)) return json({ error: "Not allowed" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Supabase service configuration is missing" }, 500);
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: allowed, error: allowedError } = await supabase.rpc("referral_backfill_allowed", { p_secret: secret });
  if (allowedError) return json({ error: "Could not check the request" }, 500);
  if (allowed !== true) return json({ error: "Not allowed" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const limit = Number.isInteger(body?.limit) ? Math.min(100, Math.max(1, body.limit)) : 40;
    const startingAfter = typeof body?.startingAfter === "string" && body.startingAfter ? body.startingAfter : null;

    const stripe = getStripeClient();
    const list: any = await stripe.invoices.list({
      status: "paid",
      limit,
      expand: ["data.payments"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const invoices: any[] = list?.data ?? [];
    const summary = {
      dryRun,
      invoices: invoices.length,
      recorded: 0,
      wouldRecord: 0,
      skipped: {} as Record<string, number>,
      rows: [] as Record<string, unknown>[],
      nextStartingAfter: list?.has_more && invoices.length ? invoices[invoices.length - 1].id : null,
    };
    const skip = (reason: string) => summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1;

    for (const invoice of invoices) {
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
      const record = await invoicePaymentArgs(stripe, invoice, { tenantId: null, subscriptionId, customerId });
      if ("skip" in record) {
        skip(record.skip);
        continue;
      }
      const tenantId = await findTenantId(supabase, customerId, subscriptionId);
      const args: Record<string, unknown> = { ...record.args, p_tenant_id: tenantId };
      summary.rows.push({
        invoice: invoice.id,
        shop: tenantId,
        paid: args.p_amount_paid_minor,
        base: args.p_base_minor,
        cycle: args.p_billing_cycle,
        paidAt: args.p_paid_at,
        card: Boolean(args.p_card_fingerprint),
      });
      if (dryRun) {
        summary.wouldRecord++;
        continue;
      }
      const { data, error } = await supabase.rpc("referral_record_payment", args);
      if (error) throw new Error(`referral_record_payment failed for ${invoice.id}: ${error.message}`);
      if (typeof data?.skipped === "string") skip(data.skipped);
      else summary.recorded++;
    }
    return json(summary);
  } catch (error: any) {
    console.error("referral-backfill failed:", error.message);
    return json({ error: error.message }, 500);
  }
});
