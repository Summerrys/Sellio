-- Refer & earn is for paying shops (Alvin, 20 Nov 2026: "this referral program will only start when
-- the merchant is actually a paying merchant", then "Proceed. make joining require a recorded
-- payment and a plan past its trial").
--
-- app.referral_join_block(shop): why a shop can't join yet, or null when it can:
--   'no shop', 'home shop' (a free home shop), 'trial' (its business plan's free trial),
--   'plan lapsed', 'shop closed', 'no payment' (no payment of its plan recorded in
--   app.shop_payments, by the shop or its Stripe subscription).
-- referral_join refuses with "opens after your shop's first payment" (trial, no payment) or "is
-- for shops on a paid business plan" (the rest). referral_dashboard's canJoin follows the same
-- rule and says which (joinBlock), so the app can say why. A shop that joined already keeps its code.
-- Sellio's admins still join while joining is closed, but only with a paying shop like everyone.

create function app.referral_join_block(p_tenant_id text) returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when t.id is null then 'no shop'
    when coalesce(t.seller_type, 'merchant') = 'individual' then 'home shop'
    when s.status = 'trial' then 'trial'
    when coalesce(app.tenant_plan(t.id), 'lapsed') in ('lapsed', 'personal') then 'plan lapsed'
    when not app.can_sell(t.id) then 'shop closed'
    when not exists (select 1 from app.shop_payments sp
                      where sp.tenant_id = t.id
                         or (s.stripe_subscription_id is not null and sp.stripe_subscription_id = s.stripe_subscription_id)) then 'no payment'
  end
  from (select p_tenant_id as id) x
  left join public.tenants t on t.id = x.id
  left join lateral (select s.status, s.stripe_subscription_id from public.subscriptions s
                      where s.tenant_id = t.id order by s.updated_date desc nulls last limit 1) s on true
$function$;
revoke all on function app.referral_join_block(text) from public, anon, authenticated;

do $migration$
declare
  v_def text;
  v_new text;
begin
  -- referral_join: the rule, and why.
  v_def := pg_get_functiondef('public.referral_join(text,text)'::regprocedure);
  if md5(v_def) <> 'a37f93a9aff0890e485f2efb2ab9f24f' then
    raise exception 'referral_join is not the version this migration edits (md5 %)', md5(v_def);
  end if;
  v_new := replace(v_def, E'  p app.referral_partners%rowtype;\nbegin\n', E'  p app.referral_partners%rowtype;\n  v_block text;\nbegin\n');
  if v_new = v_def then raise exception 'referral_join edit 1 (declaration) did not apply'; end if;
  v_def := v_new;
  v_new := replace(v_def,
    E'  if coalesce(t.seller_type, ''merchant'') = ''individual'' or not app.can_sell(p_tenant_id)\n'
    || E'     or coalesce(app.tenant_plan(p_tenant_id), ''lapsed'') in (''lapsed'', ''personal'') then\n'
    || E'    raise exception ''Refer & earn is for shops on a business plan or its free trial.'' using errcode = ''42501'';\n'
    || E'  end if;\n',
    E'  -- Paying shops only (20 Nov 2026): a payment recorded, and a plan past its free trial.\n'
    || E'  v_block := app.referral_join_block(p_tenant_id);\n'
    || E'  if v_block in (''trial'', ''no payment'') then\n'
    || E'    raise exception ''Refer & earn opens after your shop''''s first payment.'' using errcode = ''42501'';\n'
    || E'  elsif v_block is not null then\n'
    || E'    raise exception ''Refer & earn is for shops on a paid business plan.'' using errcode = ''42501'';\n'
    || E'  end if;\n');
  if v_new = v_def then raise exception 'referral_join edit 2 (the rule) did not apply'; end if;
  execute v_new;

  -- referral_dashboard: canJoin by the same rule, and why not.
  v_def := pg_get_functiondef('public.referral_dashboard(text)'::regprocedure);
  if md5(v_def) <> '06b287da09e8ad249320a602f6fec0d2' then
    raise exception 'referral_dashboard is not the version this migration edits (md5 %)', md5(v_def);
  end if;
  v_new := replace(v_def,
    E'      ''canJoin'', coalesce(t.seller_type, ''merchant'') <> ''individual'' and app.can_sell(p_tenant_id)\n'
    || E'                 and coalesce(app.tenant_plan(p_tenant_id), ''lapsed'') not in (''lapsed'', ''personal''),\n',
    E'      ''canJoin'', app.referral_join_block(p_tenant_id) is null,\n'
    || E'      ''joinBlock'', app.referral_join_block(p_tenant_id),\n');
  if v_new = v_def then raise exception 'referral_dashboard edit (canJoin) did not apply'; end if;
  execute v_new;
end
$migration$;
