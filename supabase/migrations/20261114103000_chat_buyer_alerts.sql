-- Buyers hear about a shop's reply (Alvin, 14 Nov 2026).
--
-- chat_send told only the shop: when a buyer wrote, each of the shop's people got a
-- chat_message notification (a pop-up and the bell on the web, a phone alert in the app).
-- A shop's reply told the buyer nothing, so on the web there was no alert and no bell entry,
-- only the unread count on the Chat page, and the app had no phone alert either.
--
-- Now the buyer gets the same: one chat_message notification per unread stretch (the shop's
-- first reply while nothing was waiting for the buyer), titled "New message about <listing>",
-- "<shop name>: <message>", linking to /explore/chats/<id>. It has no shop on it (tenant_id
-- null), so only the buyer can read it (policy recipient_read) and the phone alert goes to the
-- buyer's devices only (notification_push looks up user_email). Reading the chat
-- (chat_mark_read) or deleting it (chat_delete) marks it read, as the shop's already are.
--
-- The three functions were made outside this folder, so each is changed in place: the new
-- lines go after a line that must appear exactly once, or nothing changes.

do $migration$
declare
  v_def text;
  v_anchor text;
  v_count int;
begin
  -- 1. chat_send: tell the buyer about the shop's reply.
  v_def := pg_get_functiondef('public.chat_send(text,text,text,text)'::regprocedure);
  v_anchor := $a$  return jsonb_build_object(
    'conversation_id', c.id,$a$;
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception 'chat_send: expected its return statement once, found % times', v_count;
  end if;
  if position('Tell the buyer when the shop replies' in v_def) > 0 then
    raise exception 'chat_send already tells the buyer';
  end if;
  execute replace(v_def, v_anchor, $b$  -- Tell the buyer when the shop replies and nothing was waiting yet (one alert per
  -- unread stretch, as for the shop). No shop on it (tenant_id null): only the buyer
  -- reads it, and the phone alert goes to the buyer's devices.
  if v_role = 'seller' and c.buyer_unread = 0 then
    insert into public.notifications (tenant_id, user_email, type, title, message, link, data, priority)
    values (null, c.buyer_email, 'chat_message',
            'New message about ' || left(c.product_name, 60),
            coalesce((select nullif(btrim(t.name), '') from public.tenants t where t.id = c.tenant_id), 'The seller')
              || ': ' || v_preview,
            '/explore/chats/' || c.id,
            jsonb_build_object('conversation_id', c.id),
            'normal');
  end if;

$b$ || v_anchor);

  -- 2. chat_mark_read: the buyer reading the chat marks their chat alerts read.
  v_def := pg_get_functiondef('public.chat_mark_read(text)'::regprocedure);
  v_anchor := $a$     where id = c.id and (buyer_unread > 0 or buyer_read_at is null or buyer_read_at < last_message_at);
$a$;
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception 'chat_mark_read: expected the buyer''s update once, found % times', v_count;
  end if;
  execute replace(v_def, v_anchor, v_anchor || $b$    update public.notifications set is_read = true, read_at = now()
     where tenant_id is null and type = 'chat_message' and lower(user_email) = v_email
       and data ->> 'conversation_id' = c.id and not coalesce(is_read, false);
$b$);

  -- 3. chat_delete: the buyer deleting the chat marks their chat alerts read too.
  v_def := pg_get_functiondef('public.chat_delete(text)'::regprocedure);
  v_anchor := $a$    update public.chat_conversations set buyer_unread = 0 where id = c.id and buyer_unread > 0;
$a$;
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception 'chat_delete: expected the buyer''s update once, found % times', v_count;
  end if;
  execute replace(v_def, v_anchor, v_anchor || $b$    update public.notifications set is_read = true, read_at = now()
     where tenant_id is null and type = 'chat_message' and lower(user_email) = v_email
       and data ->> 'conversation_id' = c.id and not coalesce(is_read, false);
$b$);
end
$migration$;
