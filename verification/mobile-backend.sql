
begin;
do $test$
declare
 tenant text := gen_random_uuid()::text; other_tenant text := gen_random_uuid()::text;
 product text := gen_random_uuid()::text;
 owner uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
 owner_email text; staff_email text; outsider_email text;
 key uuid := gen_random_uuid(); checkout_key uuid := gen_random_uuid();
 response jsonb; replay jsonb; request jsonb; blocked boolean; request_id uuid;
begin
 owner_email := 'sellio-mobile-owner-' || owner || '@example.invalid';
 staff_email := 'sellio-mobile-staff-' || staff || '@example.invalid';
 outsider_email := 'sellio-mobile-outsider-' || outsider || '@example.invalid';
 insert into auth.users(id,email,aud,role) values(owner,owner_email,'authenticated','authenticated'),(staff,staff_email,'authenticated','authenticated'),(outsider,outsider_email,'authenticated','authenticated');
 insert into public.app_users(email,full_name,role,is_active) values(owner_email,'Temporary test owner','admin',true),(staff_email,'Temporary test staff','staff',true),(outsider_email,'Temporary test outsider','staff',true);
 insert into public.tenants(id,name,slug,owner_email,status,plan,billing_status)
 values(tenant,'Temporary mobile test','mobile-test-'||tenant,owner_email,'active','starter','active'),
 (other_tenant,'Temporary isolation test','mobile-test-'||other_tenant,outsider_email,'active','starter','active');
 insert into public.subscriptions(tenant_id,tier,status,orders_period_reset_at,orders_this_period)
 values(tenant,'starter','active',now(),0);
 insert into public.tenant_users(tenant_id,user_email,is_owner,status)
 values(tenant,owner_email,true,'active'),(tenant,staff_email,false,'active'),(other_tenant,outsider_email,true,'active');
 insert into public.products(id,tenant_id,name,price,stock_quantity,low_stock_threshold)
 values(product,tenant,'Temporary test product',2.50,10,5);
 insert into public.inventory_items(tenant_id,product_id,current_stock,low_stock_threshold,unit)
 values(tenant,product,10,5,'pcs');

 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'email',owner_email,'role','authenticated')::text,true);
 assert app.auth_identity_exists(), 'Existing owner identity must be recognised';
 response := public.adjust_inventory(tenant,product,12,6,10,5,key,'Temporary test');
 replay := public.adjust_inventory(tenant,product,12,6,10,5,key,'Temporary test');
 assert response=replay, 'Stock retry must return the same receipt';
 assert (select current_stock=12 and low_stock_threshold=6 from public.inventory_items where tenant_id=tenant and product_id=product), 'Inventory row must match';
 assert (select stock_quantity=12 and low_stock_threshold=6 from public.products where id=product), 'Product stock mirror must match';
 assert (select count(*)=1 from public.stock_history where tenant_id=tenant and product_id=product), 'Stock retry must create one history row';
 blocked := false;
 begin perform public.adjust_inventory(tenant,product,13,6,10,5,gen_random_uuid(),null);
 exception when serialization_failure then blocked:=true; end;
 assert blocked, 'Stale stock must be rejected';
 assert (select current_stock=12 from public.inventory_items where tenant_id=tenant and product_id=product), 'Rejected stock must not write';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'email',staff_email,'role','authenticated')::text,true);
 blocked:=false;
 begin perform public.adjust_inventory(tenant,product,13,6,12,6,gen_random_uuid(),null);
 exception when insufficient_privilege then blocked:=true; end;
 assert blocked, 'Staff without inventory.adjust permission must be rejected';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'email',outsider_email,'role','authenticated')::text,true);
 blocked:=false;
 begin perform public.adjust_inventory(tenant,product,13,6,12,6,gen_random_uuid(),null);
 exception when insufficient_privilege then blocked:=true; end;
 assert blocked, 'Cross-store adjustment must be rejected';
 perform set_config('request.jwt.claims','{}',true);
 response:=public.place_order_once(tenant,jsonb_build_array(jsonb_build_object('product_id',product,'quantity',2,'options','[]'::jsonb)),checkout_key);
 replay:=public.place_order_once(tenant,jsonb_build_array(jsonb_build_object('product_id',product,'quantity',2,'options','[]'::jsonb)),checkout_key);
 assert response=replay, 'Checkout retry must return the same order';
 assert (response->>'total_amount')::numeric=5, 'Price must come from the server';
 assert (select count(*)=1 from public.orders where tenant_id=tenant), 'Checkout retry must not create duplicate orders';
 assert (select orders_this_period=1 from public.subscriptions where tenant_id=tenant), 'Checkout retry must count once';
 blocked:=false;
 begin perform public.place_order_once(tenant,jsonb_build_array(jsonb_build_object('product_id',product,'quantity',3)),checkout_key);
 exception when invalid_parameter_value then blocked:=true; end;
 assert blocked, 'A retry key must not accept a changed cart';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'email',owner_email,'role','authenticated')::text,true);
 blocked:=false;
 begin perform public.place_order_once(tenant,jsonb_build_array(jsonb_build_object('product_id',product,'quantity',2,'options','[]'::jsonb)),checkout_key);
 exception when insufficient_privilege then blocked:=true; end;
 assert blocked, 'Identity changes during retry must not create another order';
 assert (select count(*)=1 from public.orders where tenant_id=tenant), 'Changed checkout identity must not duplicate an order';

 request:=public.account_deletion_prepare(owner);
 assert request->>'status'='needs_owner_action', 'Store owner must not be deleted';
 assert (select status='active' from public.tenant_users where tenant_id=tenant and user_email=owner_email), 'Blocked deletion must preserve membership';
 request:=public.account_deletion_prepare(staff);
 request_id:=(request->>'requestId')::uuid;
 assert request->>'status'='processing', 'Non-owner account must be deletable';
 assert (select status='suspended' from public.tenant_users where tenant_id=tenant and user_email=staff_email), 'Deletion must suspend permissions first';
 perform public.account_deletion_restore(staff,request_id);
 assert (select status='active' from public.tenant_users where tenant_id=tenant and user_email=staff_email), 'Failed deletion must restore membership';
 assert (select is_active from public.app_users where email=staff_email), 'Failed deletion must restore profile';
 request:=public.account_deletion_prepare(staff);
 request_id:=(request->>'requestId')::uuid;
 -- Only the newly created fixture identity is removed; the transaction is rolled back.
 delete from auth.users where id=staff;
 assert (select status='completed' from app.account_deletion_requests where id=request_id), 'Auth removal must atomically finalize deletion';
 assert not exists(select 1 from public.app_users where email=staff_email), 'Personal profile must be removed';
 assert not exists(select 1 from public.tenant_users where user_email=staff_email), 'Personal memberships must be removed';
 assert exists(select 1 from public.tenants where id=tenant), 'Shared store must remain';
 assert (select count(*)=1 from public.orders where tenant_id=tenant), 'Shared order must remain';
 assert (select stock_quantity=12 from public.products where id=product), 'Shared stock must remain';
 assert exists(select 1 from public.subscriptions where tenant_id=tenant), 'Shared subscription must remain';
 replay:=public.account_deletion_finish(staff,request_id);
 assert replay->>'status'='completed', 'Deletion finalization must be idempotent';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'email',staff_email,'role','authenticated')::text,true);
 assert not app.auth_identity_exists(), 'A deleted identity must not recreate its profile';
end $test$;
rollback;
select 'PASS: stock atomicity, conflict, permissions, checkout retry, pricing, quota, deletion protection, restore, finalization and shared data retention. All fixtures rolled back.' as verification;
