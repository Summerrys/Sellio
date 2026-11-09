-- Chats: archive and delete, each person for themselves; online and last seen.
-- (Alvin, 9 Nov 2026: archive and delete per person, not shared by a shop's staff; a new
-- message keeps a chat archived; online and last seen always shown, with no switch.)
--
-- chat_member_state: one row per person per chat, written only by these functions.
--   archived_at  in that person's Archived list (new messages leave it there)
--   cleared_at   deleted by that person: they see only messages after it. The other side,
--                and the shop's other staff, keep theirs. Nothing is erased.
-- user_presence: when each signed-in person last had Sellio open (presence_ping). Shown only
--   to the people they chat with, through chat_list and chat_thread. A shop is online when
--   anyone who answers its chats is.

create table public.chat_member_state (
  conversation_id text not null references public.chat_conversations(id) on delete cascade,
  email text not null,
  archived_at timestamptz,
  cleared_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, email)
);
create index chat_member_state_email_idx on public.chat_member_state (email);
alter table public.chat_member_state enable row level security;
revoke all on public.chat_member_state from anon, authenticated;
comment on table public.chat_member_state is
  'Each person''s own view of a chat: archived (archived_at) or deleted for them (cleared_at: they see only messages after it). Read and written only by the chat_* functions.';

create table public.user_presence (
  email text primary key,
  last_seen_at timestamptz not null default now(),
  online boolean not null default true
);
alter table public.user_presence enable row level security;
revoke all on public.user_presence from anon, authenticated;
comment on table public.user_presence is
  'When each signed-in person last had Sellio open (presence_ping). Shown only to people they chat with, by chat_list and chat_thread.';

-- The other side of a chat, as the viewer sees it: a buyer sees the shop (online if anyone
-- who answers its chats is; last seen the latest of them), the shop sees the buyer.
create or replace function app.chat_presence(p_tenant_id text, p_buyer_email text, p_viewer_role text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'online', coalesce(bool_or(up.online and up.last_seen_at > now() - interval '2 minutes'), false),
    'last_seen_at', max(up.last_seen_at))
    from (
      select e.email from app.chat_seller_emails(p_tenant_id) as e(email) where p_viewer_role = 'buyer'
      union
      select p_buyer_email where p_viewer_role <> 'buyer'
    ) who
    join public.user_presence up on up.email = who.email
$$;
revoke all on function app.chat_presence(text, text, text) from public, anon, authenticated;

-- Sellio open on this person's phone or computer: called every minute while it's on screen,
-- and once when it goes to the background (p_leaving). Writes at most every 30 s.
create or replace function public.presence_ping(p_leaving boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := app.jwt_email();
begin
  if v_email is null then return; end if;
  insert into public.user_presence as up (email, last_seen_at, online)
  values (v_email, now(), not coalesce(p_leaving, false))
  on conflict (email) do update
     set last_seen_at = excluded.last_seen_at, online = excluded.online
   where up.online is distinct from excluded.online
      or up.last_seen_at < now() - interval '30 seconds';
end $$;
revoke all on function public.presence_ping(boolean) from public, anon;
grant execute on function public.presence_ping(boolean) to authenticated, service_role;

-- Archive a chat for yourself (p_archived false: move it back to Chats).
create or replace function public.chat_archive(p_conversation_id text, p_archived boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := app.jwt_email();
  v_archive boolean := coalesce(p_archived, true);
  c public.chat_conversations%rowtype;
begin
  if v_email is null then
    raise exception 'Sign in to see your chats.' using errcode = '42501', hint = 'sign_in';
  end if;
  select * into c from public.chat_conversations where id = p_conversation_id;
  if not found or not (c.buyer_email = v_email or app.chat_is_seller(c.tenant_id)) then
    raise exception 'This chat isn''t available.' using errcode = 'P0002', hint = 'not_found';
  end if;
  insert into public.chat_member_state as s (conversation_id, email, archived_at, updated_at)
  values (c.id, v_email, case when v_archive then now() end, now())
  on conflict (conversation_id, email) do update
     set archived_at = case when v_archive then coalesce(s.archived_at, now()) end,
         updated_at = now();
  return jsonb_build_object('id', c.id, 'archived', v_archive);
end $$;
revoke all on function public.chat_archive(text, boolean) from public, anon;
grant execute on function public.chat_archive(text, boolean) to authenticated, service_role;

-- Delete a chat for yourself: its messages up to now go from your chats. The other side
-- (and the shop's other staff) keep theirs; if either side writes again, it starts fresh.
create or replace function public.chat_delete(p_conversation_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := app.jwt_email();
  c public.chat_conversations%rowtype;
begin
  if v_email is null then
    raise exception 'Sign in to see your chats.' using errcode = '42501', hint = 'sign_in';
  end if;
  select * into c from public.chat_conversations where id = p_conversation_id for update;
  if not found or not (c.buyer_email = v_email or app.chat_is_seller(c.tenant_id)) then
    raise exception 'This chat isn''t available.' using errcode = 'P0002', hint = 'not_found';
  end if;
  insert into public.chat_member_state as s (conversation_id, email, archived_at, cleared_at, updated_at)
  values (c.id, v_email, null, greatest(now(), c.last_message_at), now())
  on conflict (conversation_id, email) do update
     set cleared_at = excluded.cleared_at, archived_at = null, updated_at = now();
  if c.buyer_email = v_email then
    -- A buyer's count is theirs alone (the shop's is shared by its staff).
    update public.chat_conversations set buyer_unread = 0 where id = c.id and buyer_unread > 0;
  else
    update public.notifications set is_read = true, read_at = now()
     where tenant_id = c.tenant_id and type = 'chat_message' and lower(user_email) = v_email
       and data ->> 'conversation_id' = c.id and not coalesce(is_read, false);
  end if;
  return jsonb_build_object('id', c.id, 'deleted', true);
end $$;
revoke all on function public.chat_delete(text) from public, anon;
grant execute on function public.chat_delete(text) to authenticated, service_role;

-- The chat list: now each person's own (archived ones only in Archived, deleted ones gone
-- until someone writes again), with whether the other side is online.
drop function if exists public.chat_list(text, text, integer, integer);
create function public.chat_list(
  p_box text default 'buying',
  p_tenant_id text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_archived boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := app.jwt_email();
  v_role text := case p_box when 'buying' then 'buyer' else 'seller' end;
  v jsonb;
begin
  if v_email is null then
    raise exception 'Sign in to see your chats.' using errcode = '42501', hint = 'sign_in';
  end if;
  if p_box is null or p_box not in ('buying', 'selling') then
    raise exception 'Unknown chat list.' using errcode = '22023', hint = 'bad_box';
  end if;
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', x.id,
             'box', p_box,
             'tenant_id', x.tenant_id,
             'shop_name', btrim(t.name),
             'shop_slug', t.slug,
             'shop_logo_url', t.logo_url,
             'buyer_name', coalesce(x.buyer_name, 'Buyer'),
             'product_id', x.product_id,
             'product_name', coalesce(btrim(p.name), x.product_name),
             'product_image_url', coalesce(nullif(btrim(coalesce(p.image_url, '')), ''), x.product_image_url),
             'price', p.price,
             'currency', coalesce(t.currency, 'SGD'),
             'last_message_at', x.last_message_at,
             'last_message_preview', x.last_message_preview,
             'from_me', x.last_sender = v_role,
             'unread', case when x.cleared_at is null then x.unread
                            else least(x.unread, (select count(*) from public.chat_messages m
                                                   where m.conversation_id = x.id and m.created_at > x.cleared_at
                                                     and m.sender_role <> v_role)) end,
             'archived', x.archived_at is not null,
             'online', (pr.p ->> 'online')::boolean,
             'last_seen_at', pr.p -> 'last_seen_at')
           order by x.last_message_at desc, x.id), '[]'::jsonb)
    into v
    from (
      select c.id, c.tenant_id, c.buyer_email, c.buyer_name, c.product_id, c.product_name, c.product_image_url,
             c.last_message_at, c.last_message_preview, c.last_sender,
             case p_box when 'buying' then c.buyer_unread else c.seller_unread end as unread,
             s.archived_at, s.cleared_at
        from public.chat_conversations c
        left join public.chat_member_state s on s.conversation_id = c.id and s.email = v_email
       where case p_box
               when 'buying' then c.buyer_email = v_email
               else c.tenant_id in (select st.tenant_id from app.chat_seller_tenants() st)
                    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
             end
         and (s.cleared_at is null or c.last_message_at > s.cleared_at)
         and case when coalesce(p_archived, false) then s.archived_at is not null else s.archived_at is null end
       order by c.last_message_at desc, c.id
       limit least(greatest(coalesce(p_limit, 50), 1), 100)
      offset greatest(coalesce(p_offset, 0), 0)
    ) x
    join public.tenants t on t.id = x.tenant_id
    left join public.products p on p.id = x.product_id
    cross join lateral (select app.chat_presence(x.tenant_id, x.buyer_email, v_role) as p) pr;
  return v;
end $$;
revoke all on function public.chat_list(text, text, integer, integer, boolean) from public, anon;
grant execute on function public.chat_list(text, text, integer, integer, boolean) to authenticated, service_role;

-- Chats with something new, for the badges: only chats in each person's Chats (archived and
-- deleted ones don't count). Archived: how many chats are there, and how many have news.
create or replace function public.chat_unread()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select app.jwt_email() as email),
  mine as (
    select 'buying' as box, 'buyer' as role, c.id, c.tenant_id, c.buyer_unread as unread,
           c.last_message_at, s.archived_at, s.cleared_at
      from public.chat_conversations c
      cross join me
      left join public.chat_member_state s on s.conversation_id = c.id and s.email = me.email
     where me.email is not null and c.buyer_email = me.email
    union all
    select 'selling', 'seller', c.id, c.tenant_id, c.seller_unread,
           c.last_message_at, s.archived_at, s.cleared_at
      from public.chat_conversations c
      cross join me
      left join public.chat_member_state s on s.conversation_id = c.id and s.email = me.email
     where c.tenant_id in (select st.tenant_id from app.chat_seller_tenants() st)
  ),
  shown as (
    select m.box, m.tenant_id, m.archived_at is not null as archived,
           case when m.cleared_at is null then m.unread
                else least(m.unread, (select count(*) from public.chat_messages cm
                                       where cm.conversation_id = m.id and cm.created_at > m.cleared_at
                                         and cm.sender_role <> m.role)) end as unread
      from mine m
     where m.cleared_at is null or m.last_message_at > m.cleared_at
  )
  select jsonb_build_object(
    'buying', (select count(*) from shown where box = 'buying' and not archived and unread > 0),
    'selling', (select count(*) from shown where box = 'selling' and not archived and unread > 0),
    'by_tenant', coalesce((select jsonb_object_agg(tenant_id, n) from (
                   select tenant_id, count(*) as n from shown
                    where box = 'selling' and not archived and unread > 0 group by tenant_id) t), '{}'::jsonb),
    'archived', jsonb_build_object(
      'buying', (select jsonb_build_object('chats', count(*), 'unread', count(*) filter (where unread > 0))
                   from shown where box = 'buying' and archived),
      'selling', (select jsonb_build_object('chats', count(*), 'unread', count(*) filter (where unread > 0))
                    from shown where box = 'selling' and archived),
      'by_tenant', coalesce((select jsonb_object_agg(tenant_id, jsonb_build_object('chats', n, 'unread', u)) from (
                     select tenant_id, count(*) as n, count(*) filter (where unread > 0) as u from shown
                      where box = 'selling' and archived group by tenant_id) t), '{}'::jsonb)))
$$;

-- One chat: only the messages after the person deleted it (if they did), and whether the
-- other side is online.
create or replace function public.chat_thread(
  p_conversation_id text,
  p_after_id bigint default null,
  p_before_id bigint default null,
  p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := app.jwt_email();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  c public.chat_conversations%rowtype;
  v_role text;
  v_archived boolean := false;
  v_cleared timestamptz;
  v_presence jsonb;
  v_head jsonb;
  v_messages jsonb;
  v_more boolean;
begin
  if v_email is null then
    raise exception 'Sign in to see your chats.' using errcode = '42501', hint = 'sign_in';
  end if;
  select * into c from public.chat_conversations where id = p_conversation_id;
  if found and c.buyer_email = v_email then
    v_role := 'buyer';
  elsif found and app.chat_is_seller(c.tenant_id) then
    v_role := 'seller';
  else
    raise exception 'This chat isn''t available.' using errcode = 'P0002', hint = 'not_found';
  end if;
  select s.archived_at is not null, s.cleared_at into v_archived, v_cleared
    from public.chat_member_state s where s.conversation_id = c.id and s.email = v_email;
  v_archived := coalesce(v_archived, false);
  v_presence := app.chat_presence(c.tenant_id, c.buyer_email, v_role);

  select jsonb_build_object(
           'id', c.id,
           'my_role', v_role,
           'tenant_id', c.tenant_id,
           'shop_name', btrim(t.name),
           'shop_slug', t.slug,
           'shop_logo_url', t.logo_url,
           'buyer_name', coalesce(c.buyer_name, 'Buyer'),
           'product_id', c.product_id,
           'product_name', coalesce(btrim(p.name), c.product_name),
           'product_image_url', coalesce(nullif(btrim(coalesce(p.image_url, '')), ''), c.product_image_url),
           'price', p.price,
           'compare_at_price', p.compare_at_price,
           'currency', coalesce(t.currency, 'SGD'),
           'listing_available', p.id is not null and coalesce(p.is_active, true)
                                and coalesce(t.is_public, false) and t.slug is not null and app.can_sell(t.id),
           'sold_out', coalesce(p.track_inventory, false) and coalesce(p.stock_quantity = 0, false),
           'other_read_at', case v_role when 'buyer' then c.seller_read_at else c.buyer_read_at end,
           'unread', case v_role when 'buyer' then c.buyer_unread else c.seller_unread end,
           'archived', v_archived,
           'online', (v_presence ->> 'online')::boolean,
           'last_seen_at', v_presence -> 'last_seen_at')
    into v_head
    from public.tenants t
    left join public.products p on p.id = c.product_id
   where t.id = c.tenant_id;

  if p_after_id is not null then
    with page as (
      select cm.id, cm.sender_role, cm.body, cm.image_path, cm.created_at,
             row_number() over (order by cm.id) as rn
        from public.chat_messages cm
       where cm.conversation_id = c.id and cm.id > p_after_id
         and (v_cleared is null or cm.created_at > v_cleared)
       order by cm.id
       limit v_limit + 1)
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'sender_role', sender_role, 'from_me', sender_role = v_role,
                                                 'body', body, 'image_path', image_path, 'created_at', created_at)
                              order by id) filter (where rn <= v_limit), '[]'::jsonb),
           count(*) > v_limit
      into v_messages, v_more
      from page;
  else
    with page as (
      select cm.id, cm.sender_role, cm.body, cm.image_path, cm.created_at,
             row_number() over (order by cm.id desc) as rn
        from public.chat_messages cm
       where cm.conversation_id = c.id and (p_before_id is null or cm.id < p_before_id)
         and (v_cleared is null or cm.created_at > v_cleared)
       order by cm.id desc
       limit v_limit + 1)
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'sender_role', sender_role, 'from_me', sender_role = v_role,
                                                 'body', body, 'image_path', image_path, 'created_at', created_at)
                              order by id) filter (where rn <= v_limit), '[]'::jsonb),
           count(*) > v_limit
      into v_messages, v_more
      from page;
  end if;

  return jsonb_build_object('conversation', v_head, 'messages', v_messages, 'has_more', v_more);
end $$;
