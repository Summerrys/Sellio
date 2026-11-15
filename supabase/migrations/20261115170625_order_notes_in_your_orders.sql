-- The store page's "Your orders" shows the note the buyer wrote for the whole order (16 Nov
-- 2026; until now only each item's note showed there, because these lookups left the order's
-- note out). The same two lookups with notes added: get_storefront_orders_v2 (a business
-- store's page) and get_shop_orders_v2 (a free shop's page). New names, because a function's
-- columns can't be changed in place, and apps from before this keep calling the old two,
-- which stay as they are. Same rules as the old ones: at most 50 of the buyer's own order
-- ids, deleted orders left out, and a free shop's collection address only once accepted.

create function public.get_storefront_orders_v2(p_tenant_id text, p_order_ids text[])
returns table (
  id text, order_number text, status public.order_status, type text, table_name text, items jsonb,
  subtotal numeric, tax_amount numeric, discount_amount numeric, total_amount numeric,
  payment_status text, payment_method text, notes text,
  created_date timestamp with time zone, updated_date timestamp with time zone
)
language sql
stable
security definer
set search_path to ''
as $$
  select o.id, o.order_number, o.status, o.type, o.table_name, o.items,
         o.subtotal, o.tax_amount, o.discount_amount, o.total_amount,
         o.payment_status, o.payment_method, o.notes, o.created_date, o.updated_date
  from public.orders o
  where o.tenant_id = p_tenant_id
    and o.id = any (p_order_ids[1:50])
    and not o.is_deleted
  order by o.created_date desc
$$;

create function public.get_shop_orders_v2(p_tenant_id text, p_order_ids text[])
returns table (
  id text, order_number text, status public.order_status, type text, items jsonb,
  subtotal numeric, total_amount numeric, payment_status text, customer_name text,
  fulfilment jsonb, notes text,
  created_date timestamp with time zone, updated_date timestamp with time zone
)
language sql
stable
security definer
set search_path to ''
as $$
  select o.id, o.order_number, o.status, o.type, o.items, o.subtotal, o.total_amount, o.payment_status,
         o.customer_name,
         case when o.status in ('confirmed', 'preparing', 'ready', 'served', 'completed') then o.fulfilment
              else o.fulfilment - 'collection_address' end,
         o.notes,
         o.created_date, o.updated_date
  from public.orders o
  join public.tenants t on t.id = o.tenant_id and t.seller_type = 'individual'
  where o.tenant_id = p_tenant_id
    and o.id = any (p_order_ids[1:50])
    and not o.is_deleted
  order by o.created_date desc
$$;

revoke all on function public.get_storefront_orders_v2(text, text[]) from public;
revoke all on function public.get_shop_orders_v2(text, text[]) from public;
grant execute on function public.get_storefront_orders_v2(text, text[]) to anon, authenticated, service_role;
grant execute on function public.get_shop_orders_v2(text, text[]) to anon, authenticated, service_role;
