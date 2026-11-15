-- New-order alerts in the shop's own language (Alvin, 15 Nov 2026: "OK. Proceed." to the
-- server-text step): a shop in Indonesia gets "Pesanan baru #ORD-000123" /
-- "Meja 5 · Budi · 3 item · Rp55.000"; every other shop gets the English it got before. Printed
-- receipts and kitchen chits follow the same rule in the app (src/lib/printWords.js).
-- Also: a table whose name already says "Meja" (or "Table") is not called "Table Meja 5".
-- Otherwise the same as the live function (indonesia_phase1: app.money_text).
create or replace function app.order_new_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o          public.orders%rowtype;
  v_currency text;
  v_id       boolean;  -- the shop is in Indonesia: Bahasa Indonesia
  v_kind     text;
  v_items    numeric;
  v_name     text;
begin
  begin
    -- Customers' orders through the apps only: not the shop's own staff keying one in, and
    -- not Sellio's own tools (service role, SQL).
    if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') then
      return null;
    end if;
    if auth.uid() is not null and app.is_member(new.tenant_id) then
      return null;
    end if;

    select * into o from public.orders where id = new.id;
    if not found or coalesce(o.is_deleted, false)
       or o.status::text not in ('pending', 'confirmed', 'preparing', 'ready') then
      return null;
    end if;

    select coalesce(nullif(btrim(t.currency), ''), 'SGD'), coalesce(t.country = 'Indonesia', false)
      into v_currency, v_id
      from public.tenants t where t.id = o.tenant_id;
    v_id := coalesce(v_id, false);
    v_kind := case
      when o.type = 'dine_in' then
        case when nullif(btrim(coalesce(o.table_name, '')), '') is null then case when v_id then 'Makan di tempat' else 'Dine-in' end
             when o.table_name ~* '(table|meja)' then btrim(o.table_name)
             else case when v_id then 'Meja ' else 'Table ' end || btrim(o.table_name) end
      when o.fulfilment ->> 'method' = 'collection' then case when v_id then 'Ambil sendiri' else 'Collection' end
      when o.fulfilment ->> 'method' = 'delivery' or o.type = 'delivery' then case when v_id then 'Pengiriman' else 'Delivery' end
      else case when v_id then 'Bawa pulang' else 'Takeaway' end end;
    select sum(case when jsonb_typeof(e -> 'quantity') = 'number' then (e ->> 'quantity')::numeric else 1 end)
      into v_items
      from jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) as e;
    v_name := left(nullif(btrim(regexp_replace(coalesce(o.customer_name, ''), '[[:cntrl:]]+', ' ', 'g')), ''), 40);

    -- "New order #ORD-000123" / "Table 2 · 3 items · S$18.50"
    -- "Pesanan baru #ORD-000123" / "Meja 2 · 3 item · Rp55.000"
    insert into public.notifications (tenant_id, user_email, type, title, message, link, data, priority)
    select o.tenant_id, e, 'new_order',
           case when v_id then 'Pesanan baru #' else 'New order #' end || coalesce(o.order_number, ''),
           concat_ws(' · ', v_kind, v_name,
                     case when v_items = 1 then '1 item'
                          when v_items > 1 then to_char(v_items, 'FM999990') || case when v_id then ' item' else ' items' end end,
                     app.money_text(coalesce(o.total_amount, 0), v_currency)),
           '/Orders',
           jsonb_build_object('order_id', o.id, 'shop_id', o.tenant_id),
           'normal'
      from app.chat_seller_emails(o.tenant_id) as e;
  exception when others then
    null;  -- the order is saved even if the shop can't be told
  end;
  return null;
end $$;
