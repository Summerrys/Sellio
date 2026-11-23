-- Orders lower an item's stock, and a buyer can't order more than is left (Alvin, 24 Nov 2026).
--
-- When a shop counts an item's stock (products.track_inventory on, a number in stock_quantity),
-- every order line takes what it asks for from that count as it's placed, whoever places it: a
-- buyer on Explore or a store page, a table's QR, staff at the Counter (place_order adds the lines;
-- staff editing an order delete and add them again). A buyer (anyone not on the shop's team) is
-- refused past what's left: "Only 2 left of Butter cookies." / "Butter cookies is sold out."
-- (errcode 22023, hint out_of_stock, detail {product_id, name, left}); nothing of the order is
-- kept. The shop's own team isn't refused, but the count never goes below 0. A cancelled or
-- deleted order, or a line taken off an order, puts back what it took. Items without a counted
-- stock are left alone. Before this, sales never changed the count.
--
-- Each line is counted with the item's row locked (and the same lock adjust_inventory takes), so
-- two buyers can't both take the last one. inventory_items.current_stock follows the count.
-- stock_history is left to the shop's own changes (it feeds the inventory report's adjustments);
-- what each order took is in app.order_stock_moves. A cancelled order brought back (cancelled
-- to another step) doesn't take stock again.

create table app.order_stock_moves (
  order_item_id text primary key,
  order_id text not null,
  tenant_id text not null,
  product_id text not null,
  quantity integer not null check (quantity >= 0),
  taken_at timestamptz not null default now(),
  returned_at timestamptz
);
create index order_stock_moves_order on app.order_stock_moves (order_id);
alter table app.order_stock_moves enable row level security;
revoke all on app.order_stock_moves from public, anon, authenticated;

-- An order line being added: take its quantity from the item's stock (refusing a buyer past it).
create function app.order_item_take_stock() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare
  p record;
  v_take integer;
begin
  if new.product_id is null or coalesce(new.quantity, 0) <= 0 or coalesce(new.is_deleted, false) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock:' || new.tenant_id || ':' || new.product_id, 0));
  select x.id, btrim(x.name) as name, x.stock_quantity into p
    from public.products x
   where x.id = new.product_id and x.tenant_id = new.tenant_id
     and coalesce(x.track_inventory, false) and x.stock_quantity is not null
   for update;
  if not found then
    return new;  -- stock not counted: unlimited
  end if;
  if new.quantity > greatest(p.stock_quantity, 0) and not app.is_member(new.tenant_id) then
    if p.stock_quantity <= 0 then
      raise exception '% is sold out.', p.name
        using errcode = '22023', hint = 'out_of_stock',
              detail = jsonb_build_object('product_id', p.id, 'name', p.name, 'left', 0)::text;
    end if;
    raise exception 'Only % left of %.', p.stock_quantity, p.name
      using errcode = '22023', hint = 'out_of_stock',
            detail = jsonb_build_object('product_id', p.id, 'name', p.name, 'left', p.stock_quantity)::text;
  end if;
  v_take := least(new.quantity, greatest(p.stock_quantity, 0));
  begin
    if v_take > 0 then
      update public.products x set stock_quantity = x.stock_quantity - v_take
       where x.id = p.id and x.tenant_id = new.tenant_id;
      update public.inventory_items i
         set current_stock = greatest(0, coalesce(i.current_stock, 0) - v_take), updated_date = now()
       where i.tenant_id = new.tenant_id and i.product_id = p.id;
    end if;
    insert into app.order_stock_moves (order_item_id, order_id, tenant_id, product_id, quantity)
    values (new.id, new.order_id, new.tenant_id, p.id, v_take)
    on conflict (order_item_id) do nothing;
  exception when others then
    -- Never stops the order over its record (the refusal above is not caught).
    raise warning 'order_item_take_stock: % not counted for order %: % %', p.id, new.order_id, sqlstate, sqlerrm;
  end;
  return new;
end $$;
revoke all on function app.order_item_take_stock() from public, anon, authenticated;

-- Put back what lines took and haven't given back: one line (p_order_item_id), or every line
-- of an order (p_order_item_id null).
create function app.stock_return(p_order_id text, p_order_item_id text) returns void
language plpgsql security definer set search_path to ''
as $$
declare
  m record;
begin
  for m in
    update app.order_stock_moves s set returned_at = now()
     where s.returned_at is null
       and (case when p_order_item_id is not null then s.order_item_id = p_order_item_id
                 else s.order_id = p_order_id end)
    returning s.tenant_id, s.product_id, s.quantity
  loop
    if m.quantity > 0 then
      perform pg_advisory_xact_lock(hashtextextended('stock:' || m.tenant_id || ':' || m.product_id, 0));
      update public.products x set stock_quantity = coalesce(x.stock_quantity, 0) + m.quantity
       where x.id = m.product_id and x.tenant_id = m.tenant_id;
      update public.inventory_items i
         set current_stock = coalesce(i.current_stock, 0) + m.quantity, updated_date = now()
       where i.tenant_id = m.tenant_id and i.product_id = m.product_id;
    end if;
  end loop;
end $$;
revoke all on function app.stock_return(text, text) from public, anon, authenticated;

-- A line taken off an order (deleted, or marked deleted): its stock goes back.
create function app.order_item_return_stock() returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  begin
    if tg_op = 'DELETE' then
      perform app.stock_return(old.order_id, old.id);
    elsif coalesce(new.is_deleted, false) and not coalesce(old.is_deleted, false) then
      perform app.stock_return(new.order_id, new.id);
    end if;
  exception when others then
    raise warning 'order_item_return_stock: line % not put back: % %', coalesce(old.id, new.id), sqlstate, sqlerrm;
  end;
  return null;
end $$;
revoke all on function app.order_item_return_stock() from public, anon, authenticated;

-- An order cancelled or deleted: what all its lines took goes back.
create function app.order_return_stock() returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  if (new.status = 'cancelled' and old.status is distinct from 'cancelled')
     or (coalesce(new.is_deleted, false) and not coalesce(old.is_deleted, false)) then
    begin
      perform app.stock_return(new.id, null);
    exception when others then
      raise warning 'order_return_stock: order % not put back: % %', new.id, sqlstate, sqlerrm;
    end;
  end if;
  return null;
end $$;
revoke all on function app.order_return_stock() from public, anon, authenticated;

create trigger order_items_take_stock before insert on public.order_items
  for each row execute function app.order_item_take_stock();
create trigger order_items_return_stock after delete or update of is_deleted on public.order_items
  for each row execute function app.order_item_return_stock();
create trigger orders_return_stock after update of status, is_deleted on public.orders
  for each row execute function app.order_return_stock();
