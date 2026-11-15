-- A buyer who had ordered from a free shop before couldn't order again from another phone or
-- browser (15 Nov 2026).
--
-- A shop keeps one customer record per device (customers: unique tenant_id + device_id), and a
-- mobile number belongs to one customer in a shop (unique tenant_id + phone). place_shop_order
-- copied the buyer's number onto this device's record. When the same person had already ordered
-- from the shop on another phone or browser (or before reinstalling the app), their number was
-- on that other record: the copy broke the unique rule (23505) and the whole order was undone,
-- every time. Seen at Perfect Five, 15 Nov 06:24 UTC, three tries ("Your order wasn't sent").
--
-- Now the number is copied only when no other customer in the shop has it, and filling in the
-- customer record never stops the order. The order itself has the buyer's name and number
-- (orders.customer_name, customer_phone), as before. Nothing else in place_shop_order changes:
-- the exact old lines are replaced, and this stops if they aren't found exactly once.

do $migration$
declare
  v_old text := E'    if p_customer_id is not null then\n'
    || E'      update public.customers c\n'
    || E'         set name = coalesce(c.name, v_name), phone = coalesce(c.phone, v_phone), updated_date = now()\n'
    || E'       where c.id::text = p_customer_id and c.tenant_id = p_tenant_id;\n'
    || E'    end if;\n';
  v_new text := E'    if p_customer_id is not null then\n'
    || E'      -- This device''s customer record gets the buyer''s name, and their number unless another\n'
    || E'      -- customer in this shop already has it (the same person on another phone or browser: a\n'
    || E'      -- number belongs to one customer in a shop). Filling this in never stops the order.\n'
    || E'      begin\n'
    || E'        update public.customers c\n'
    || E'           set name = coalesce(c.name, v_name),\n'
    || E'               phone = case\n'
    || E'                 when c.phone is null and not exists (\n'
    || E'                   select 1 from public.customers o\n'
    || E'                    where o.tenant_id = p_tenant_id and o.phone = v_phone and o.id <> c.id)\n'
    || E'                 then v_phone\n'
    || E'                 else c.phone\n'
    || E'               end,\n'
    || E'               updated_date = now()\n'
    || E'         where c.id::text = p_customer_id and c.tenant_id = p_tenant_id;\n'
    || E'      exception\n'
    || E'        when unique_violation then\n'
    || E'          -- Another order with this number got there at the same moment: keep the name only.\n'
    || E'          update public.customers c\n'
    || E'             set name = coalesce(c.name, v_name), updated_date = now()\n'
    || E'           where c.id::text = p_customer_id and c.tenant_id = p_tenant_id;\n'
    || E'        when others then\n'
    || E'          raise warning ''place_shop_order: customer % not updated: % %'', p_customer_id, sqlstate, sqlerrm;\n'
    || E'      end;\n'
    || E'    end if;\n';
  v_oid oid;
  v_def text;
  v_found int;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_shop_order' and p.prokind = 'f';
  if v_oid is null or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'place_shop_order') <> 1 then
    raise exception 'Repeat buyer fix: public.place_shop_order not found once';
  end if;
  v_def := pg_get_functiondef(v_oid);
  v_found := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_found <> 1 then
    raise exception 'Repeat buyer fix: the customer update is in place_shop_order % times, not once', v_found;
  end if;
  execute replace(v_def, v_old, v_new);
end
$migration$;
