-- Handover QR for home sellers' orders (Alvin, 23 Nov 2026): every home seller's order gets a QR
-- the buyer shows when they collect it, or when it's delivered; the seller (or the courier they
-- sent) scans it, and that scan is what marks the order collected / delivered. It is there to stop
-- "I never got it" when the buyer did: the record says when the QR was issued, when the buyer's
-- phone showed it, and when and by whom it was scanned and verified. Payment is not part of it.
--
-- How:
-- * The server issues the QR when the order is placed (trigger on orders, any checkout): a
--   32-character random token, and a 6-digit code to type if the QR can't be shown or read. It is
--   kept here, in the app schema, where no app reads or writes directly.
-- * Only the buyer's account sees it, and only from the server (my_handover): the account that
--   placed the order. So a home seller's order needs a signed-in buyer: a signed-out one is
--   refused (trigger below; the store page and the app ask buyers to sign in first).
-- * The shop never sees the QR or the code. Its scanner sends what it read; the server checks it,
--   records the handover and marks the order completed, all at once (shop_handover_scan, or
--   shop_handover_pin for the code). Every 5th wrong code makes the code wait 5 minutes (never
--   locked for good; the QR always works), so no one can run through all million codes.
-- * A shop can change its own order rows directly (orders' RLS), so an order with a buyer's QR
--   can't be marked completed that way: only a verified scan completes it (trigger below). There
--   is no Mark collected / delivered for it. Cancelling stays as it is.
-- * Delivery: the seller scans the buyer's QR at the door, or sends the courier they arranged a
--   one-time link (shop_courier_link): whoever opens it can scan the buyer's QR, or type the code,
--   for that order only, for 24 hours. Once the order is handed over the link stops working.
-- * Orders already open when this is applied get their QR now (open ones with a signed-in buyer).
--   Business stores' orders get none (yet).

create table app.order_handovers (
  order_id text primary key,
  tenant_id text not null,
  token text not null unique check (token ~ '^[0-9a-f]{32}$'),
  pin text not null check (pin ~ '^[0-9]{6}$'),
  -- The account that placed the order: the only one shown the QR.
  holder_uid text,
  issued_at timestamptz not null default now(),
  -- When the buyer's phone showed the QR (my_handover): first and latest, and how many times
  -- (counted at most once every 2 minutes: an open screen asks every few seconds).
  first_shown_at timestamptz,
  last_shown_at timestamptz,
  shown_count integer not null default 0,
  -- Wrong 6-digit codes typed for this order, all of them (for the record). Every 5th makes the
  -- code wait until pin_paused_until.
  wrong_tries integer not null default 0,
  pin_paused_until timestamptz,
  -- The courier link (shop_courier_link): its token while it works, who it's for (as the seller
  -- typed it), when and by whom it was made, until when it works, and when it was first opened.
  courier_link text unique check (courier_link ~ '^[0-9a-f]{32}$'),
  courier_name text check (char_length(courier_name) <= 60),
  courier_link_made_at timestamptz,
  courier_link_made_by text,
  courier_link_expires_at timestamptz,
  courier_opened_at timestamptz,
  -- The scan that verified it (which also marked the order completed): when, how, by whom
  -- (verified_by: the staff member's email; for a courier, null and verified_by_courier).
  verified_at timestamptz,
  verified_via text check (verified_via in ('qr', 'pin')),
  verified_by text,
  verified_by_name text,
  verified_by_courier boolean not null default false,
  constraint order_handovers_verified_whole check ((verified_at is null) = (verified_via is null))
);
create index order_handovers_tenant_idx on app.order_handovers (tenant_id, issued_at desc);
alter table app.order_handovers enable row level security;
revoke all on app.order_handovers from public, anon, authenticated;

-- A QR token (also a courier link): 32 hex characters (122 random bits; gen_random_uuid uses the
-- strong random source).
create function app.handover_token() returns text
language sql volatile set search_path to ''
as $$ select replace(gen_random_uuid()::text, '-', '') $$;

-- A 6-digit code, from 48 random bits of a fresh UUID (its first 12 hex digits are all random).
create function app.handover_pin() returns text
language sql volatile set search_path to ''
as $$
  select lpad(((('x' || lpad(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 16, '0'))::bit(64)::bigint) % 1000000)::text, 6, '0')
$$;
revoke all on function app.handover_token() from public, anon, authenticated;
revoke all on function app.handover_pin() from public, anon, authenticated;

-- ── A home seller's order needs a signed-in buyer ──────────────────────────────────────────
-- Its QR is shown only to the account that placed it, so an order placed signed out would have
-- nobody to show it to, and could never be handed over. Refused however it's placed (a direct
-- call to a checkout function too). The shop's own team is signed in; Sellio's server (no app
-- sign-in at all) isn't affected, nor are business stores.
create function app.order_require_signed_in() returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'anon'
     and exists (select 1 from public.tenants t where t.id = new.tenant_id and t.seller_type = 'individual') then
    raise exception 'Please sign in to order from this shop.' using errcode = '42501', hint = 'sign_in_required';
  end if;
  return new;
end $$;
revoke all on function app.order_require_signed_in() from public, anon, authenticated;
create trigger orders_require_signed_in before insert on public.orders
  for each row execute function app.order_require_signed_in();

-- ── Issuing: every home seller's order with a buyer, however it was placed ─────────────────
-- (An order the shop makes itself has no buyer, so no QR: it's handed over as before.)
-- Never stops the order: a QR that can't be issued leaves the order to be handed over as before.
create function app.order_issue_handover() returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  begin
    if new.buyer_id is not null
       and exists (select 1 from public.tenants t where t.id = new.tenant_id and t.seller_type = 'individual') then
      insert into app.order_handovers (order_id, tenant_id, token, pin, holder_uid)
      values (new.id, new.tenant_id, app.handover_token(), app.handover_pin(), new.buyer_id)
      on conflict (order_id) do nothing;
    end if;
  exception when others then
    raise warning 'Handover QR not issued for order %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;
revoke all on function app.order_issue_handover() from public, anon, authenticated;
create trigger orders_issue_handover after insert on public.orders
  for each row execute function app.order_issue_handover();

-- ── Only a verified scan completes an order that has a buyer's QR ─────────────────────────
-- For the trigger below, which runs as the person changing the order (who can't read the table).
create function app.handover_open(p_order_id text) returns boolean
language sql stable security definer set search_path to ''
as $$
  select exists (select 1 from app.order_handovers h
                  where h.order_id = p_order_id and h.holder_uid is not null and h.verified_at is null)
$$;
revoke all on function app.handover_open(text) from public, anon, authenticated;
grant execute on function app.handover_open(text) to anon, authenticated, service_role;

-- An app (a shop's staff, an older app's Mark collected) marking such an order completed is
-- refused; the scan functions below run as their owner and go through.
create function app.order_require_handover() returns trigger
language plpgsql set search_path to ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and current_user in ('anon', 'authenticated') then
    if app.handover_open(new.id) then
      raise exception 'Scan the buyer’s QR to hand over this order.'
        using errcode = '42501', hint = 'handover_scan_required';
    end if;
  end if;
  return new;
end $$;
create trigger orders_require_handover before update of status on public.orders
  for each row execute function app.order_require_handover();

-- ── The buyer ──────────────────────────────────────────────────────────────────────────────
-- Their QR for one of their orders, from the server each time (nothing is kept on the phone):
-- { token, pin, issued_at, status } while it's still to be handed over (and noted as shown), or
-- { status, issued_at, verified_at, verified_via } once it was scanned; null when the order
-- isn't theirs or has no QR.
create function public.my_handover(p_order_id text) returns jsonb
language plpgsql volatile security definer set search_path to ''
as $$
declare
  v_uid text := auth.uid()::text;
  h app.order_handovers%rowtype;
  v_status text;
begin
  if v_uid is null or p_order_id is null then
    return null;
  end if;
  select * into h from app.order_handovers x where x.order_id = p_order_id and x.holder_uid = v_uid;
  if not found then
    return null;
  end if;
  select o.status::text into v_status from public.orders o
   where o.id = h.order_id and not coalesce(o.is_deleted, false);
  if v_status is null then
    return null;
  end if;
  if h.verified_at is null and v_status not in ('completed', 'cancelled') then
    if h.last_shown_at is null or h.last_shown_at < now() - interval '2 minutes' then
      update app.order_handovers x
         set first_shown_at = coalesce(x.first_shown_at, now()), last_shown_at = now(), shown_count = x.shown_count + 1
       where x.order_id = h.order_id;
    end if;
    return jsonb_build_object('token', h.token, 'pin', h.pin, 'issued_at', h.issued_at, 'status', v_status);
  end if;
  return jsonb_build_object('status', v_status, 'issued_at', h.issued_at,
                            'verified_at', h.verified_at, 'verified_via', h.verified_via);
end $$;

-- ── The shop ───────────────────────────────────────────────────────────────────────────────
-- What the shop's team sees for its orders: whether the buyer has a QR (never the QR or the
-- code), until when its code waits after wrong tries, the record (issued, shown on the buyer's
-- phone, verified: when, how, by whom, by a courier), and the courier link while it works.
create function public.shop_handovers(p_tenant_id text, p_order_ids text[])
returns table (
  order_id text,
  has_qr boolean,
  pin_paused_until timestamptz,
  issued_at timestamptz,
  first_shown_at timestamptz,
  last_shown_at timestamptz,
  verified_at timestamptz,
  verified_via text,
  verified_by_name text,
  verified_by_courier boolean,
  courier_link text,
  courier_name text,
  courier_link_made_at timestamptz,
  courier_link_expires_at timestamptz,
  courier_opened_at timestamptz
)
language plpgsql stable security definer set search_path to ''
as $$
begin
  if not app.is_member(p_tenant_id) then
    raise exception 'Only the shop''s team can see its orders.' using errcode = '42501', hint = 'not_member';
  end if;
  return query
    select h.order_id, h.holder_uid is not null,
           case when h.pin_paused_until > now() then h.pin_paused_until end,
           h.issued_at, h.first_shown_at, h.last_shown_at,
           h.verified_at, h.verified_via, h.verified_by_name, h.verified_by_courier,
           case when l.works then h.courier_link end,
           case when l.works then h.courier_name end,
           case when l.works then h.courier_link_made_at end,
           case when l.works then h.courier_link_expires_at end,
           case when l.works then h.courier_opened_at end
      from app.order_handovers h
     cross join lateral (select h.courier_link is not null and h.verified_at is null
                                and h.courier_link_expires_at > now() as works) l
     where h.tenant_id = p_tenant_id
       and h.order_id = any ((coalesce(p_order_ids, '{}'::text[]))[1:500]);
end $$;

-- A typed 6-digit code for an order (its row locked by the caller): null when it's right, or the
-- answer to give. Every 5th wrong code makes the code wait 5 minutes; while it waits, every code
-- is refused (the right one too), so a script would need years to go through them all.
create function app.handover_pin_check(p_order_id text, p_pin text) returns jsonb
language plpgsql volatile security definer set search_path to ''
as $$
declare
  v_pin text := regexp_replace(coalesce(p_pin, ''), '[^0-9]', '', 'g');
  h app.order_handovers%rowtype;
begin
  select * into h from app.order_handovers x where x.order_id = p_order_id;
  if h.pin_paused_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'paused', 'order_id', h.order_id, 'paused_until', h.pin_paused_until);
  end if;
  if v_pin = h.pin then
    return null;
  end if;
  update app.order_handovers x
     set wrong_tries = x.wrong_tries + 1,
         pin_paused_until = case when (x.wrong_tries + 1) % 5 = 0 then now() + interval '5 minutes' else x.pin_paused_until end
   where x.order_id = h.order_id
  returning x.wrong_tries, x.pin_paused_until into h.wrong_tries, h.pin_paused_until;
  if h.wrong_tries % 5 = 0 then
    return jsonb_build_object('ok', false, 'reason', 'paused', 'order_id', h.order_id, 'paused_until', h.pin_paused_until);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'wrong_pin', 'order_id', h.order_id, 'tries_left', 5 - h.wrong_tries % 5);
end $$;
revoke all on function app.handover_pin_check(text, text) from public, anon, authenticated;

-- Verify and record a handover, and mark the order completed (every scan function). The order's
-- handover row is locked by the caller. p_courier: scanned through the courier link (named as the
-- seller named the courier). Either way the courier link stops working. Answers {ok, reason, …};
-- never raises over a wrong code.
create function app.handover_complete(p_tenant_id text, p_order_id text, p_via text, p_courier boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path to ''
as $$
declare
  o public.orders%rowtype;
  h app.order_handovers%rowtype;
  v_email text := case when p_courier then null else app.jwt_email() end;
  v_name text;
  v_at timestamptz := now();
  v_method text;
begin
  select * into o from public.orders x where x.id = p_order_id and x.tenant_id = p_tenant_id for update;
  if not found or coalesce(o.is_deleted, false) then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  select * into h from app.order_handovers x where x.order_id = o.id;
  v_method := coalesce(o.fulfilment ->> 'method', case when o.type = 'delivery' then 'delivery' else 'collection' end);
  if h.verified_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already', 'order_id', o.id, 'order_number', o.order_number,
      'method', v_method, 'verified_at', h.verified_at, 'verified_via', h.verified_via, 'verified_by_name', h.verified_by_name,
      'verified_by_courier', h.verified_by_courier);
  end if;
  if o.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'cancelled', 'order_id', o.id, 'order_number', o.order_number);
  end if;
  if o.status = 'completed' then
    return jsonb_build_object('ok', false, 'reason', 'already_completed', 'order_id', o.id, 'order_number', o.order_number);
  end if;

  if p_courier then
    v_name := h.courier_name;
  else
    select coalesce(
             (select nullif(btrim(tu.user_name), '') from public.tenant_users tu
               where tu.tenant_id = p_tenant_id and lower(btrim(tu.user_email)) = v_email
               order by tu.created_date limit 1),
             (select nullif(btrim(u.full_name), '') from public.app_users u
               where lower(btrim(u.email)) = v_email
               order by u.created_date limit 1))
      into v_name;
  end if;

  update app.order_handovers x
     set verified_at = v_at, verified_via = p_via, verified_by = v_email, verified_by_name = v_name,
         verified_by_courier = coalesce(p_courier, false),
         courier_link = null, courier_link_expires_at = null
   where x.order_id = o.id;
  update public.orders x set status = 'completed', updated_date = v_at where x.id = o.id;

  return jsonb_build_object('ok', true, 'order_id', o.id, 'order_number', o.order_number, 'method', v_method,
    'customer_name', o.customer_name, 'items', o.items, 'total_amount', o.total_amount,
    'verified_at', v_at, 'verified_via', p_via, 'verified_by_name', v_name,
    'verified_by_courier', coalesce(p_courier, false));
end $$;
revoke all on function app.handover_complete(text, text, text, boolean) from public, anon, authenticated;

-- The seller's scanner read a QR (p_token: the token in it): if it's one of this shop's orders,
-- verified, recorded and completed in one go.
create function public.shop_handover_scan(p_tenant_id text, p_token text) returns jsonb
language plpgsql volatile security definer set search_path to ''
as $$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  h app.order_handovers%rowtype;
begin
  if not app.has_permission(p_tenant_id, 'orders.edit') then
    raise exception 'Only staff who can update orders can hand them over.' using errcode = '42501', hint = 'no_permission';
  end if;
  if v_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  select * into h from app.order_handovers x where x.token = v_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  if h.tenant_id <> p_tenant_id then
    return jsonb_build_object('ok', false, 'reason', 'other_shop');
  end if;
  return app.handover_complete(p_tenant_id, h.order_id, 'qr');
end $$;

-- The 6-digit code typed for an order (when the QR can't be shown or read).
create function public.shop_handover_pin(p_tenant_id text, p_order_id text, p_pin text) returns jsonb
language plpgsql volatile security definer set search_path to ''
as $$
declare
  h app.order_handovers%rowtype;
  v_wrong jsonb;
begin
  if not app.has_permission(p_tenant_id, 'orders.edit') then
    raise exception 'Only staff who can update orders can hand them over.' using errcode = '42501', hint = 'no_permission';
  end if;
  select * into h from app.order_handovers x
   where x.order_id = p_order_id and x.tenant_id = p_tenant_id and x.holder_uid is not null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_qr', 'order_id', p_order_id);
  end if;
  if h.verified_at is null then
    v_wrong := app.handover_pin_check(h.order_id, p_pin);
    if v_wrong is not null then
      return v_wrong;
    end if;
  end if;
  return app.handover_complete(p_tenant_id, h.order_id, 'pin');
end $$;

-- ── The courier link ───────────────────────────────────────────────────────────────────────
-- The seller makes a link for one of their orders with a buyer's QR, for the courier they
-- arranged (p_courier_name: optional, as they'd call them), or stops it (p_stop). A new link
-- replaces the last one. It works once, for 24 hours, and stops when the order is handed over.
create function public.shop_courier_link(p_tenant_id text, p_order_id text, p_courier_name text default null,
                                         p_stop boolean default false) returns jsonb
language plpgsql volatile security definer set search_path to ''
as $$
declare
  v_name text := left(nullif(btrim(regexp_replace(coalesce(p_courier_name, ''), '[[:cntrl:]]', ' ', 'g')), ''), 60);
  h app.order_handovers%rowtype;
  o public.orders%rowtype;
  v_link text;
  v_until timestamptz := now() + interval '24 hours';
begin
  if not app.has_permission(p_tenant_id, 'orders.edit') then
    raise exception 'Only staff who can update orders can send a courier link.' using errcode = '42501', hint = 'no_permission';
  end if;
  select * into h from app.order_handovers x
   where x.order_id = p_order_id and x.tenant_id = p_tenant_id and x.holder_uid is not null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_qr', 'order_id', p_order_id);
  end if;
  select * into o from public.orders x where x.id = h.order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_qr', 'order_id', p_order_id);
  end if;
  if h.verified_at is not null or o.status = 'completed' then
    return jsonb_build_object('ok', false, 'reason', 'already_completed', 'order_id', o.id, 'order_number', o.order_number);
  end if;
  if o.status = 'cancelled' or coalesce(o.is_deleted, false) then
    return jsonb_build_object('ok', false, 'reason', 'cancelled', 'order_id', o.id, 'order_number', o.order_number);
  end if;
  if coalesce(p_stop, false) then
    update app.order_handovers x set courier_link = null, courier_link_expires_at = null where x.order_id = h.order_id;
    return jsonb_build_object('ok', true, 'order_id', h.order_id, 'stopped', true);
  end if;
  v_link := app.handover_token();
  update app.order_handovers x
     set courier_link = v_link, courier_name = v_name, courier_link_made_at = now(),
         courier_link_made_by = app.jwt_email(), courier_link_expires_at = v_until, courier_opened_at = null
   where x.order_id = h.order_id;
  return jsonb_build_object('ok', true, 'order_id', h.order_id, 'link', v_link, 'courier_name', v_name,
                            'made_at', now(), 'expires_at', v_until);
end $$;

-- The courier opened the link (no Sellio account): the order it's for, while the link works.
-- Only what the courier needs: the shop, the order number, delivery or collection. Noted as opened.
create function public.courier_handover(p_link text) returns jsonb
language plpgsql volatile security definer set search_path to ''
as $$
declare
  v_link text := lower(btrim(coalesce(p_link, '')));
  h app.order_handovers%rowtype;
  o public.orders%rowtype;
begin
  if v_link !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select * into h from app.order_handovers x where x.courier_link = v_link;
  if not found or h.verified_at is not null or coalesce(h.courier_link_expires_at <= now(), true) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select * into o from public.orders x where x.id = h.order_id;
  if not found or coalesce(o.is_deleted, false) or o.status in ('completed', 'cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  update app.order_handovers x set courier_opened_at = now()
   where x.order_id = h.order_id and x.courier_opened_at is null;
  return jsonb_build_object('ok', true,
    'shop_name', (select t.name from public.tenants t where t.id = h.tenant_id),
    'order_number', o.order_number,
    'method', coalesce(o.fulfilment ->> 'method', case when o.type = 'delivery' then 'delivery' else 'collection' end),
    'courier_name', h.courier_name, 'expires_at', h.courier_link_expires_at,
    'paused_until', case when h.pin_paused_until > now() then h.pin_paused_until end);
end $$;

-- The courier's answer after a scan or a code: never the buyer's details.
create function app.courier_answer(p_answer jsonb) returns jsonb
language sql immutable set search_path to ''
as $$
  select case when coalesce((p_answer ->> 'ok')::boolean, false)
              then jsonb_build_object('ok', true, 'order_number', p_answer ->> 'order_number', 'method', p_answer ->> 'method',
                                      'verified_at', p_answer -> 'verified_at', 'verified_via', p_answer ->> 'verified_via')
              else p_answer - 'order_id' - 'verified_by_name' - 'verified_by_courier'
         end
$$;
revoke all on function app.courier_answer(jsonb) from public, anon, authenticated;

-- The courier scanned the buyer's QR through the link: for this link's order only.
create function public.courier_handover_scan(p_link text, p_token text) returns jsonb
language plpgsql volatile security definer set search_path to ''
as $$
declare
  v_link text := lower(btrim(coalesce(p_link, '')));
  v_token text := lower(btrim(coalesce(p_token, '')));
  h app.order_handovers%rowtype;
begin
  if v_link !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select * into h from app.order_handovers x where x.courier_link = v_link for update;
  if not found or h.verified_at is not null or coalesce(h.courier_link_expires_at <= now(), true) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if v_token <> h.token then
    return jsonb_build_object('ok', false, 'reason', 'not_this_order');
  end if;
  return app.courier_answer(app.handover_complete(h.tenant_id, h.order_id, 'qr', true));
end $$;

-- The courier typed the buyer's 6-digit code through the link (the same waits as the shop's).
create function public.courier_handover_pin(p_link text, p_pin text) returns jsonb
language plpgsql volatile security definer set search_path to ''
as $$
declare
  v_link text := lower(btrim(coalesce(p_link, '')));
  h app.order_handovers%rowtype;
  v_wrong jsonb;
begin
  if v_link !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select * into h from app.order_handovers x where x.courier_link = v_link for update;
  if not found or h.verified_at is not null or coalesce(h.courier_link_expires_at <= now(), true) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  v_wrong := app.handover_pin_check(h.order_id, p_pin);
  if v_wrong is not null then
    return app.courier_answer(v_wrong);
  end if;
  return app.courier_answer(app.handover_complete(h.tenant_id, h.order_id, 'pin', true));
end $$;

-- Orders already open get their QR now (for the buyer who placed them), so they too are handed
-- over only by a scan.
insert into app.order_handovers (order_id, tenant_id, token, pin, holder_uid)
select o.id, o.tenant_id, app.handover_token(), app.handover_pin(), o.buyer_id
  from public.orders o
  join public.tenants t on t.id = o.tenant_id and t.seller_type = 'individual'
 where not coalesce(o.is_deleted, false)
   and o.status not in ('completed', 'cancelled')
   and o.buyer_id is not null
on conflict (order_id) do nothing;

-- Functions made in public are callable by everyone on Supabase until taken away (its default
-- privileges): take it away, then give each to whoever uses it. The courier's three are for
-- anyone with a link (no Sellio account); the link is the key, and it opens one order.
revoke all on function public.my_handover(text) from public, anon, authenticated;
revoke all on function public.shop_handovers(text, text[]) from public, anon, authenticated;
revoke all on function public.shop_handover_scan(text, text) from public, anon, authenticated;
revoke all on function public.shop_handover_pin(text, text, text) from public, anon, authenticated;
revoke all on function public.shop_courier_link(text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.courier_handover(text) from public, anon, authenticated;
revoke all on function public.courier_handover_scan(text, text) from public, anon, authenticated;
revoke all on function public.courier_handover_pin(text, text) from public, anon, authenticated;
grant execute on function public.my_handover(text) to authenticated, service_role;
grant execute on function public.shop_handovers(text, text[]) to authenticated, service_role;
grant execute on function public.shop_handover_scan(text, text) to authenticated, service_role;
grant execute on function public.shop_handover_pin(text, text, text) to authenticated, service_role;
grant execute on function public.shop_courier_link(text, text, text, boolean) to authenticated, service_role;
grant execute on function public.courier_handover(text) to anon, authenticated, service_role;
grant execute on function public.courier_handover_scan(text, text) to anon, authenticated, service_role;
grant execute on function public.courier_handover_pin(text, text) to anon, authenticated, service_role;
