-- Reject conflicting single choices and duplicate option charges.
-- Preserves existing authorization, authoritative pricing and order idempotency.
DO $check_current$
BEGIN
  IF pg_get_functiondef('public.place_order(text,jsonb,text,text,text,text)'::regprocedure) <> $previous_counter_options$CREATE OR REPLACE FUNCTION public.place_order(p_tenant_id text, p_items jsonb, p_type text DEFAULT 'takeaway'::text, p_table_id text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_customer_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item        jsonb;
  v_product     record;
  v_qty         int;
  v_opts        jsonb;   -- flat label -> modifier (legacy string selections)
  v_gmap        jsonb;   -- group name -> { label -> modifier }
  v_gopts       jsonb;
  v_gname       text;
  v_sel         jsonb;
  v_label       text;
  v_grp         text;
  v_mod         numeric;
  v_mods_total  numeric;
  v_unit        numeric;
  v_line_items  jsonb := '[]'::jsonb;
  v_subtotal    numeric := 0;
  v_table_name  text;
  v_order_no    text;
  v_order       public.orders%ROWTYPE;
  v_customer    uuid;
  v_known       text[] := ARRAY['size','color','colour','addon','flavour','flavor','type','option','variant'];
  v_first       jsonb;
  v_vkey        text;
  v_base        numeric;
  v_group       jsonb;
  v_opt         jsonb;
  v_variant_str text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Unknown store' USING ERRCODE = 'P0002';
  END IF;
  IF p_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'Invalid order type' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Too many items in one order' USING ERRCODE = '22023';
  END IF;

  IF p_table_id IS NOT NULL THEN
    SELECT name INTO v_table_name FROM tables WHERE id = p_table_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown table' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT id INTO v_customer FROM customers
     WHERE id::text = p_customer_id AND tenant_id = p_tenant_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 99 THEN
      RAISE EXCEPTION 'Invalid quantity' USING ERRCODE = '22023';
    END IF;

    SELECT id, name, price, image_url, variants INTO v_product
      FROM products
     WHERE id = v_item->>'product_id'
       AND tenant_id = p_tenant_id
       AND coalesce(is_active, true);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'An item in your cart is no longer available' USING ERRCODE = 'P0002';
    END IF;

    -- Build both a flat label map (legacy) and a per-group map (exact).
    v_opts := '{}'::jsonb;
    v_gmap := '{}'::jsonb;
    IF jsonb_typeof(v_product.variants) = 'array' AND jsonb_array_length(v_product.variants) > 0 THEN
      v_first := v_product.variants->0;
      IF v_first ? 'options' THEN
        FOR v_group IN SELECT * FROM jsonb_array_elements(v_product.variants) LOOP
          IF jsonb_typeof(v_group->'options') = 'array' THEN
            v_gname := coalesce(nullif(v_group->>'name', ''), 'Options');
            v_gopts := coalesce(v_gmap->v_gname, '{}'::jsonb);
            FOR v_opt IN SELECT * FROM jsonb_array_elements(v_group->'options') LOOP
              v_mod := coalesce((v_opt->>'price_modifier')::numeric, 0);
              v_opts  := v_opts  || jsonb_build_object(coalesce(v_opt->>'label', ''), v_mod);
              v_gopts := v_gopts || jsonb_build_object(coalesce(v_opt->>'label', ''), v_mod);
            END LOOP;
            v_gmap := v_gmap || jsonb_build_object(v_gname, v_gopts);
          END IF;
        END LOOP;
      ELSE
        SELECT k INTO v_vkey FROM jsonb_object_keys(v_first) k WHERE lower(k) = ANY(v_known) LIMIT 1;
        IF v_vkey IS NULL THEN
          SELECT k INTO v_vkey FROM jsonb_object_keys(v_first) k
           WHERE k NOT IN ('price', 'price_modifier') LIMIT 1;
        END IF;
        v_gopts := '{}'::jsonb;
        IF v_vkey IS NOT NULL THEN
          IF coalesce(v_product.price, 0) > 0 THEN
            v_base := v_product.price;
          ELSE
            SELECT coalesce(min((e->>'price')::numeric), 0) INTO v_base
              FROM jsonb_array_elements(v_product.variants) e
             WHERE coalesce((e->>'price')::numeric, 0) > 0;
          END IF;
          v_gname := upper(left(v_vkey, 1)) || lower(substr(v_vkey, 2));
          FOR v_opt IN SELECT * FROM jsonb_array_elements(v_product.variants) LOOP
            v_mod := greatest(0, round(coalesce((v_opt->>'price')::numeric, 0) - v_base, 2));
            v_opts  := v_opts  || jsonb_build_object(coalesce(v_opt->>v_vkey, ''), v_mod);
            v_gopts := v_gopts || jsonb_build_object(coalesce(v_opt->>v_vkey, ''), v_mod);
          END LOOP;
        ELSE
          v_gname := 'Options';
          FOR v_opt IN SELECT * FROM jsonb_array_elements(v_product.variants) LOOP
            v_mod := coalesce((v_opt->>'price_modifier')::numeric, 0);
            v_opts  := v_opts  || jsonb_build_object(coalesce(v_opt->>'name', v_opt->>'label', ''), v_mod);
            v_gopts := v_gopts || jsonb_build_object(coalesce(v_opt->>'name', v_opt->>'label', ''), v_mod);
          END LOOP;
        END IF;
        v_gmap := jsonb_build_object(v_gname, v_gopts);
      END IF;
    END IF;

    -- Selections: {"group","label"} objects are priced from that exact group;
    -- plain strings (storefront) fall back to the flat label map.
    v_mods_total := 0;
    v_variant_str := NULL;
    IF jsonb_typeof(v_item->'options') = 'array' THEN
      FOR v_sel IN SELECT * FROM jsonb_array_elements(v_item->'options') LOOP
        IF jsonb_typeof(v_sel) = 'object' THEN
          v_grp := v_sel->>'group';
          v_label := v_sel->>'label';
          IF v_grp IS NULL OR v_label IS NULL OR NOT (coalesce(v_gmap->v_grp, '{}'::jsonb) ? v_label) THEN
            RAISE EXCEPTION 'Option "%" is no longer available for %', coalesce(v_label, '?'), v_product.name
              USING ERRCODE = 'P0002';
          END IF;
          v_mod := (v_gmap->v_grp->>v_label)::numeric;
        ELSE
          v_label := v_sel #>> '{}';
          IF NOT (v_opts ? v_label) THEN
            RAISE EXCEPTION 'Option "%" is no longer available for %', v_label, v_product.name
              USING ERRCODE = 'P0002';
          END IF;
          v_mod := (v_opts->>v_label)::numeric;
        END IF;
        v_mods_total := v_mods_total + v_mod;
        v_variant_str := CASE WHEN v_variant_str IS NULL THEN v_label ELSE v_variant_str || ', ' || v_label END;
      END LOOP;
    END IF;

    v_unit := round(v_product.price + v_mods_total, 2);
    v_subtotal := v_subtotal + v_unit * v_qty;

    v_line_items := v_line_items || jsonb_build_array(jsonb_build_object(
      'key',        coalesce(v_item->>'key', v_product.id || '-' || coalesce(v_variant_str, 'default')),
      'product_id', v_product.id,
      'name',       v_product.name,
      'price',      v_unit,
      'image_url',  v_product.image_url,
      'quantity',   v_qty,
      'variant',    v_variant_str,
      'notes',      nullif(left(coalesce(v_item->>'notes', ''), 500), '')
    ));
  END LOOP;

  v_subtotal := round(v_subtotal, 2);

  v_order_no := public.get_next_order_number(p_tenant_id);

  INSERT INTO orders (tenant_id, order_number, status, type, table_id, table_name,
                      notes, items, subtotal, total_amount, payment_status, payment_method, customer_id)
  VALUES (p_tenant_id, v_order_no, 'pending', p_type, p_table_id, v_table_name,
          nullif(left(coalesce(p_notes, ''), 1000), ''), v_line_items, v_subtotal, v_subtotal,
          'unpaid', 'pending', v_customer)
  RETURNING * INTO v_order;

  INSERT INTO order_items (tenant_id, order_id, product_id, product_name, variant_name,
                           quantity, unit_price, total_price, special_instructions)
  SELECT p_tenant_id, v_order.id, li->>'product_id', li->>'name', li->>'variant',
         (li->>'quantity')::int, (li->>'price')::numeric,
         round((li->>'price')::numeric * (li->>'quantity')::int, 2), li->>'notes'
    FROM jsonb_array_elements(v_line_items) li;

  IF p_table_id IS NOT NULL THEN
    -- One running bill per table: open it on the first order if none is active.
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_table_id));
    IF NOT EXISTS (SELECT 1 FROM table_sessions
                    WHERE table_id = p_table_id AND tenant_id = p_tenant_id AND status = 'active') THEN
      INSERT INTO table_sessions (tenant_id, table_id, table_name, status, started_at, order_ids, total_amount)
      VALUES (p_tenant_id, p_table_id, v_table_name, 'active', now(), '[]'::jsonb, 0);
    END IF;
    UPDATE table_sessions
       SET order_ids    = coalesce(order_ids, '[]'::jsonb) || to_jsonb(v_order.id),
           table_name   = v_table_name,
           total_amount = coalesce(total_amount, 0) + v_subtotal,
           updated_date = now()
     WHERE table_id = p_table_id AND tenant_id = p_tenant_id AND status = 'active';
    UPDATE tables SET status = 'occupied', updated_date = now()
     WHERE id = p_table_id AND tenant_id = p_tenant_id;
  END IF;

  IF v_customer IS NOT NULL THEN
    UPDATE customers
       SET total_orders   = coalesce(total_orders, 0) + 1,
           total_spent    = coalesce(total_spent, 0) + v_subtotal,
           last_order_at  = now(),
           first_order_at = coalesce(first_order_at, now()),
           updated_date   = now()
     WHERE id = v_customer;
  END IF;

  RETURN to_jsonb(v_order);
END;
$function$
$previous_counter_options$ THEN
    RAISE EXCEPTION 'place_order changed since review; validation migration stopped';
  END IF;
END;
$check_current$;

CREATE OR REPLACE FUNCTION public.place_order(p_tenant_id text, p_items jsonb, p_type text DEFAULT 'takeaway'::text, p_table_id text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_customer_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item        jsonb;
  v_product     record;
  v_qty         int;
  v_opts        jsonb;   -- flat label -> modifier (legacy string selections)
  v_gmap        jsonb;   -- group name -> { label -> modifier }
  v_gopts       jsonb;
  v_gname       text;
  v_sel         jsonb;
  v_label       text;
  v_grp         text;
  v_mod         numeric;
  v_mods_total  numeric;
  v_unit        numeric;
  v_line_items  jsonb := '[]'::jsonb;
  v_subtotal    numeric := 0;
  v_table_name  text;
  v_order_no    text;
  v_order       public.orders%ROWTYPE;
  v_customer    uuid;
  v_known       text[] := ARRAY['size','color','colour','addon','flavour','flavor','type','option','variant'];
  v_first       jsonb;
  v_vkey        text;
  v_base        numeric;
  v_group       jsonb;
  v_opt         jsonb;
  v_variant_str text;
  v_seen        jsonb;
  v_group_counts jsonb;
  v_group_modes jsonb;
  v_sel_key     text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Unknown store' USING ERRCODE = 'P0002';
  END IF;
  IF p_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'Invalid order type' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Too many items in one order' USING ERRCODE = '22023';
  END IF;

  IF p_table_id IS NOT NULL THEN
    SELECT name INTO v_table_name FROM tables WHERE id = p_table_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown table' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT id INTO v_customer FROM customers
     WHERE id::text = p_customer_id AND tenant_id = p_tenant_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 99 THEN
      RAISE EXCEPTION 'Invalid quantity' USING ERRCODE = '22023';
    END IF;

    SELECT id, name, price, image_url, variants INTO v_product
      FROM products
     WHERE id = v_item->>'product_id'
       AND tenant_id = p_tenant_id
       AND coalesce(is_active, true);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'An item in your cart is no longer available' USING ERRCODE = 'P0002';
    END IF;

    -- Build both a flat label map (legacy) and a per-group map (exact).
    v_opts := '{}'::jsonb;
    v_gmap := '{}'::jsonb;
    v_seen := '{}'::jsonb;
    v_group_counts := '{}'::jsonb;
    v_group_modes := '{}'::jsonb;
    IF jsonb_typeof(v_product.variants) = 'array' AND jsonb_array_length(v_product.variants) > 0 THEN
      v_first := v_product.variants->0;
      IF v_first ? 'options' THEN
        FOR v_group IN SELECT * FROM jsonb_array_elements(v_product.variants) LOOP
          IF jsonb_typeof(v_group->'options') = 'array' THEN
            v_gname := coalesce(nullif(v_group->>'name', ''), 'Options');
            v_group_modes := v_group_modes || jsonb_build_object(v_gname, lower(coalesce(v_group->>'type', 'other')) = 'addon');
            v_gopts := coalesce(v_gmap->v_gname, '{}'::jsonb);
            FOR v_opt IN SELECT * FROM jsonb_array_elements(v_group->'options') LOOP
              v_mod := coalesce((v_opt->>'price_modifier')::numeric, 0);
              v_opts  := v_opts  || jsonb_build_object(coalesce(v_opt->>'label', ''), v_mod);
              v_gopts := v_gopts || jsonb_build_object(coalesce(v_opt->>'label', ''), v_mod);
            END LOOP;
            v_gmap := v_gmap || jsonb_build_object(v_gname, v_gopts);
          END IF;
        END LOOP;
      ELSE
        SELECT k INTO v_vkey FROM jsonb_object_keys(v_first) k WHERE lower(k) = ANY(v_known) LIMIT 1;
        IF v_vkey IS NULL THEN
          SELECT k INTO v_vkey FROM jsonb_object_keys(v_first) k
           WHERE k NOT IN ('price', 'price_modifier') LIMIT 1;
        END IF;
        v_gopts := '{}'::jsonb;
        IF v_vkey IS NOT NULL THEN
          IF coalesce(v_product.price, 0) > 0 THEN
            v_base := v_product.price;
          ELSE
            SELECT coalesce(min((e->>'price')::numeric), 0) INTO v_base
              FROM jsonb_array_elements(v_product.variants) e
             WHERE coalesce((e->>'price')::numeric, 0) > 0;
          END IF;
          v_gname := upper(left(v_vkey, 1)) || lower(substr(v_vkey, 2));
          FOR v_opt IN SELECT * FROM jsonb_array_elements(v_product.variants) LOOP
            v_mod := greatest(0, round(coalesce((v_opt->>'price')::numeric, 0) - v_base, 2));
            v_opts  := v_opts  || jsonb_build_object(coalesce(v_opt->>v_vkey, ''), v_mod);
            v_gopts := v_gopts || jsonb_build_object(coalesce(v_opt->>v_vkey, ''), v_mod);
          END LOOP;
        ELSE
          v_gname := 'Options';
          FOR v_opt IN SELECT * FROM jsonb_array_elements(v_product.variants) LOOP
            v_mod := coalesce((v_opt->>'price_modifier')::numeric, 0);
            v_opts  := v_opts  || jsonb_build_object(coalesce(v_opt->>'name', v_opt->>'label', ''), v_mod);
            v_gopts := v_gopts || jsonb_build_object(coalesce(v_opt->>'name', v_opt->>'label', ''), v_mod);
          END LOOP;
        END IF;
        v_gmap := jsonb_build_object(v_gname, v_gopts);
      END IF;
    END IF;

    -- Selections: {"group","label"} objects are priced from that exact group;
    -- plain strings (storefront) fall back to the flat label map.
    v_mods_total := 0;
    v_variant_str := NULL;
    IF jsonb_typeof(v_item->'options') = 'array' THEN
      FOR v_sel IN SELECT * FROM jsonb_array_elements(v_item->'options') LOOP
        IF jsonb_typeof(v_sel) = 'object' THEN
          v_grp := v_sel->>'group';
          v_label := v_sel->>'label';
          IF v_grp IS NULL OR v_label IS NULL OR NOT (coalesce(v_gmap->v_grp, '{}'::jsonb) ? v_label) THEN
            RAISE EXCEPTION 'Option "%" is no longer available for %', coalesce(v_label, '?'), v_product.name
              USING ERRCODE = 'P0002';
          END IF;
          v_mod := (v_gmap->v_grp->>v_label)::numeric;
        ELSE
          v_label := v_sel #>> '{}';
          SELECT CASE WHEN count(*) = 1 THEN min(key) ELSE NULL END INTO v_grp
            FROM jsonb_each(v_gmap) WHERE value ? v_label;
          IF NOT (v_opts ? v_label) THEN
            RAISE EXCEPTION 'Option "%" is no longer available for %', v_label, v_product.name
              USING ERRCODE = 'P0002';
          END IF;
          v_mod := (v_opts->>v_label)::numeric;
        END IF;
        -- Never charge for the same selection twice, and honor the editor's
        -- single-choice mode independently of the group's display name.
        v_sel_key := jsonb_build_array(v_grp, v_label)::text;
        IF v_seen ? v_sel_key THEN
          RAISE EXCEPTION 'Option "%" was selected more than once for %', v_label, v_product.name
            USING ERRCODE = '22023';
        END IF;
        v_seen := v_seen || jsonb_build_object(v_sel_key, true);
        IF v_grp IS NOT NULL THEN
          IF NOT coalesce((v_group_modes->>v_grp)::boolean, false)
             AND coalesce((v_group_counts->>v_grp)::int, 0) >= 1 THEN
            RAISE EXCEPTION 'Choose only one option for % on %', v_grp, v_product.name
              USING ERRCODE = '22023';
          END IF;
          v_group_counts := v_group_counts || jsonb_build_object(v_grp, coalesce((v_group_counts->>v_grp)::int, 0) + 1);
        END IF;
        v_mods_total := v_mods_total + v_mod;
        v_variant_str := CASE WHEN v_variant_str IS NULL THEN v_label ELSE v_variant_str || ', ' || v_label END;
      END LOOP;
    END IF;

    v_unit := round(v_product.price + v_mods_total, 2);
    v_subtotal := v_subtotal + v_unit * v_qty;

    v_line_items := v_line_items || jsonb_build_array(jsonb_build_object(
      'key',        coalesce(v_item->>'key', v_product.id || '-' || coalesce(v_variant_str, 'default')),
      'product_id', v_product.id,
      'name',       v_product.name,
      'price',      v_unit,
      'image_url',  v_product.image_url,
      'quantity',   v_qty,
      'variant',    v_variant_str,
      'notes',      nullif(left(coalesce(v_item->>'notes', ''), 500), '')
    ));
  END LOOP;

  v_subtotal := round(v_subtotal, 2);

  v_order_no := public.get_next_order_number(p_tenant_id);

  INSERT INTO orders (tenant_id, order_number, status, type, table_id, table_name,
                      notes, items, subtotal, total_amount, payment_status, payment_method, customer_id)
  VALUES (p_tenant_id, v_order_no, 'pending', p_type, p_table_id, v_table_name,
          nullif(left(coalesce(p_notes, ''), 1000), ''), v_line_items, v_subtotal, v_subtotal,
          'unpaid', 'pending', v_customer)
  RETURNING * INTO v_order;

  INSERT INTO order_items (tenant_id, order_id, product_id, product_name, variant_name,
                           quantity, unit_price, total_price, special_instructions)
  SELECT p_tenant_id, v_order.id, li->>'product_id', li->>'name', li->>'variant',
         (li->>'quantity')::int, (li->>'price')::numeric,
         round((li->>'price')::numeric * (li->>'quantity')::int, 2), li->>'notes'
    FROM jsonb_array_elements(v_line_items) li;

  IF p_table_id IS NOT NULL THEN
    -- One running bill per table: open it on the first order if none is active.
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_table_id));
    IF NOT EXISTS (SELECT 1 FROM table_sessions
                    WHERE table_id = p_table_id AND tenant_id = p_tenant_id AND status = 'active') THEN
      INSERT INTO table_sessions (tenant_id, table_id, table_name, status, started_at, order_ids, total_amount)
      VALUES (p_tenant_id, p_table_id, v_table_name, 'active', now(), '[]'::jsonb, 0);
    END IF;
    UPDATE table_sessions
       SET order_ids    = coalesce(order_ids, '[]'::jsonb) || to_jsonb(v_order.id),
           table_name   = v_table_name,
           total_amount = coalesce(total_amount, 0) + v_subtotal,
           updated_date = now()
     WHERE table_id = p_table_id AND tenant_id = p_tenant_id AND status = 'active';
    UPDATE tables SET status = 'occupied', updated_date = now()
     WHERE id = p_table_id AND tenant_id = p_tenant_id;
  END IF;

  IF v_customer IS NOT NULL THEN
    UPDATE customers
       SET total_orders   = coalesce(total_orders, 0) + 1,
           total_spent    = coalesce(total_spent, 0) + v_subtotal,
           last_order_at  = now(),
           first_order_at = coalesce(first_order_at, now()),
           updated_date   = now()
     WHERE id = v_customer;
  END IF;

  RETURN to_jsonb(v_order);
END;
$function$
