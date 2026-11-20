-- A shop whose plan payment failed is 'suspended' once it has no grace left (Alvin, 20 Nov 2026):
-- never paid (its trial's first charge failed), or its 3 days of grace are over. While its grace
-- runs it stays 'active' (it can still sell), and paid again it's 'active'. Its plan was already
-- 'lapsed' then (app.tenant_plan: it can't sell); this makes tenants.status say so too, instead of
-- 'active' for every past-due shop. The app doesn't read tenants.status (it locks on the
-- subscription); the World needs 'active' and can_sell. A grace that ends with no Stripe event
-- after it shows 'active' until the next event (usually Stripe's next retry): no scheduled job.
--
-- Three edits to public.sync_stripe_billing_state, made on its live definition and applied only if
-- the result is exactly the version tested (the md5 below; tested 20 Nov in a rolled-back
-- transaction: never paid → suspended, paid → active, in grace → active, after grace → suspended,
-- cancelled → suspended, trial → trial).
do $migration$
declare
  v_def text := pg_get_functiondef('public.sync_stripe_billing_state'::regproc);
  v_new text;
begin
  v_new := replace(v_def, $a$  v_type text;
begin$a$, $a$  v_type text;
  v_grace timestamptz;
begin$a$);
  v_new := replace(v_new, $a$  update public.tenants
  set
    billing_status = p_status,$a$, $a$  select s.grace_period_ends_at into v_grace from public.subscriptions s where s.tenant_id = p_tenant_id;

  update public.tenants
  set
    billing_status = p_status,$a$);
  v_new := replace(v_new, $a$      when p_status in ('active', 'past_due') then 'active'$a$, $a$      when p_status = 'active' then 'active'
      -- A failed payment: 'active' while its grace runs; 'suspended' when there's none left (never
      -- paid, or its 3 days are over), as its plan is 'lapsed' then (app.tenant_plan). Alvin, 20 Nov 2026.
      when p_status = 'past_due' then case when v_grace > now() then 'active' else 'suspended' end$a$);
  if md5(v_new) <> 'f799935981c5d10ab95d5bc33ed9f504' then
    raise exception 'public.sync_stripe_billing_state is not the version this change was written for (md5 %)', md5(v_new);
  end if;
  execute v_new;
end $migration$;
