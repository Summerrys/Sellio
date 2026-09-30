
create table app.checkout_requests (
  tenant_id text not null, request_id uuid not null, actor_id text not null,
  request_hash text not null, response jsonb not null, created_at timestamptz not null default now(),
  primary key (tenant_id, request_id, actor_id)
);
create unique index checkout_requests_tenant_request_unique on app.checkout_requests(tenant_id,request_id);
alter table app.checkout_requests enable row level security;
revoke all on app.checkout_requests from public, anon, authenticated;

create or replace function public.place_order_once(
 p_tenant_id text, p_items jsonb, p_request_id uuid,
 p_type text default 'takeaway', p_table_id text default null,
 p_notes text default null, p_customer_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $
declare
 v_actor text := coalesce(auth.uid()::text, 'guest');
 v_hash text := md5(jsonb_build_object('items',p_items,'type',p_type,'table',p_table_id,'notes',p_notes,'customer',p_customer_id)::text);
 v_previous app.checkout_requests%rowtype;
 v_response jsonb;
begin
 if p_request_id is null then raise exception 'Checkout request key required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout:' || p_tenant_id || ':' || p_request_id::text,0));
 select * into v_previous from app.checkout_requests where tenant_id=p_tenant_id and request_id=p_request_id;
 if found then
   if v_previous.actor_id<>v_actor then raise exception 'Return to the original signed-in account to retry this checkout' using errcode='42501',hint='checkout_actor_changed'; end if;
   if v_previous.request_hash <> v_hash then raise exception 'This checkout key belongs to a different cart' using errcode='22023'; end if;
   return v_previous.response;
 end if;
 v_response := public.place_order(p_tenant_id,p_items,p_type,p_table_id,p_notes,p_customer_id);
 insert into app.checkout_requests(tenant_id,request_id,actor_id,request_hash,response) values(p_tenant_id,p_request_id,v_actor,v_hash,v_response);
 return v_response;
end $;
revoke all on function public.place_order_once(text,jsonb,uuid,text,text,text,text) from public;
grant execute on function public.place_order_once(text,jsonb,uuid,text,text,text,text) to anon,authenticated;

create table app.inventory_adjustment_requests (
 tenant_id text not null, product_id text not null, actor_id uuid not null, request_id uuid not null,
 request_hash text not null, response jsonb not null, created_at timestamptz not null default now(),
 primary key(tenant_id,actor_id,request_id)
);
alter table app.inventory_adjustment_requests enable row level security;
revoke all on app.inventory_adjustment_requests from public,anon,authenticated;

create or replace function public.adjust_inventory(
 p_tenant_id text, p_product_id text, p_stock integer, p_threshold integer,
 p_expected_stock integer, p_expected_threshold integer, p_request_id uuid, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid := auth.uid();
 v_hash text := md5(jsonb_build_object('product',p_product_id,'stock',p_stock,'threshold',p_threshold,'expectedStock',p_expected_stock,'expectedThreshold',p_expected_threshold,'notes',p_notes)::text);
 v_prior app.inventory_adjustment_requests%rowtype;
 v_product public.products%rowtype;
 v_inventory public.inventory_items%rowtype;
 v_count integer;
 v_stock integer;
 v_threshold integer;
 v_result jsonb;
begin
 if v_actor is null or not app.has_permission(p_tenant_id,'inventory.adjust') then
   raise exception 'You do not have access to adjust inventory' using errcode='42501';
 end if;
 if p_request_id is null or p_stock is null or p_stock<0 or p_threshold is null or p_threshold<0 or length(coalesce(p_notes,''))>1000 then
   raise exception 'Invalid stock adjustment' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('stock:' || p_tenant_id || ':' || p_product_id,0));
 select * into v_prior from app.inventory_adjustment_requests where tenant_id=p_tenant_id and actor_id=v_actor and request_id=p_request_id;
 if found then
   if v_prior.request_hash<>v_hash then raise exception 'This adjustment key belongs to another change' using errcode='22023'; end if;
   return v_prior.response;
 end if;
 select * into v_product from public.products where id=p_product_id and tenant_id=p_tenant_id for update;
 if not found then raise exception 'Product not found in this store' using errcode='P0002'; end if;
 select count(*) into v_count from public.inventory_items where tenant_id=p_tenant_id and product_id=p_product_id;
 if v_count>1 then raise exception 'Duplicate inventory records require reconciliation before adjustment' using errcode='23505'; end if;
 select * into v_inventory from public.inventory_items where tenant_id=p_tenant_id and product_id=p_product_id for update;
 v_stock := coalesce(v_inventory.current_stock,0);
 v_threshold := coalesce(v_inventory.low_stock_threshold,5);
 if p_expected_stock is distinct from v_stock or (v_inventory.id is not null and p_expected_threshold is distinct from v_threshold) then
   raise exception 'Stock changed on another device. Refresh and review the new quantity before saving.' using errcode='40001';
 end if;
 if v_inventory.id is null then
   insert into public.inventory_items(tenant_id,product_id,current_stock,low_stock_threshold,unit,last_restock_date)
     values(p_tenant_id,p_product_id,p_stock,p_threshold,'pcs',now()) returning * into v_inventory;
 else
   update public.inventory_items set current_stock=p_stock,low_stock_threshold=p_threshold,last_restock_date=now(),updated_date=now()
     where id=v_inventory.id returning * into v_inventory;
 end if;
 update public.products set stock_quantity=p_stock,low_stock_threshold=p_threshold,updated_date=now() where id=p_product_id and tenant_id=p_tenant_id;
 insert into public.stock_history(tenant_id,product_id,product_name,old_stock,new_stock,change_amount,notes,changed_by)
   values(p_tenant_id,p_product_id,v_product.name,v_stock,p_stock,p_stock-v_stock,nullif(trim(p_notes),''),app.jwt_email());
 v_result := jsonb_build_object('id',v_inventory.id,'product_id',p_product_id,'current_stock',p_stock,'stock_quantity',p_stock,'low_stock_threshold',p_threshold,'updated_date',v_inventory.updated_date);
 insert into app.inventory_adjustment_requests(tenant_id,product_id,actor_id,request_id,request_hash,response)
   values(p_tenant_id,p_product_id,v_actor,p_request_id,v_hash,v_result);
 return v_result;
end $$;
revoke all on function public.adjust_inventory(text,text,integer,integer,integer,integer,uuid,text) from public,anon;
grant execute on function public.adjust_inventory(text,text,integer,integer,integer,integer,uuid,text) to authenticated;
