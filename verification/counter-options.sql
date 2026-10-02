-- Transactional verification: fixture product and all changes are rolled back.
BEGIN;
DO $verify$
DECLARE
  tid text;
  pid text := gen_random_uuid()::text;
  choices jsonb;
  rejected boolean;
BEGIN
  SELECT tenant_id INTO tid FROM products WHERE coalesce(is_active, true) LIMIT 1;
  IF tid IS NULL THEN RAISE EXCEPTION 'No tenant available for verification'; END IF;
  INSERT INTO products(id,tenant_id,name,price,variants) VALUES(pid,tid,'Counter option validation fixture',3.50,
    '[{"name":"Temperature","type":"other","options":[{"label":"Hot","price_modifier":0},{"label":"Cold","price_modifier":2}]},{"name":"Extras","type":"addon","options":[{"label":"Cream","price_modifier":0.5},{"label":"Sugar","price_modifier":0}]}]'::jsonb);
  FOR choices IN SELECT jsonb_array_elements(
    '[[{"group":"Temperature","label":"Hot"},{"group":"Temperature","label":"Cold"}],
      [{"group":"Temperature","label":"Hot"},{"group":"Temperature","label":"Hot"}],
      ["Hot","Cold"],
      [{"group":"Extras","label":"Cream"},{"group":"Extras","label":"Cream"}]]'::jsonb)
  LOOP
    rejected := false;
    BEGIN
      PERFORM public.place_order(tid,jsonb_build_array(jsonb_build_object('product_id',pid,'quantity',1,'options',choices)));
    EXCEPTION WHEN SQLSTATE '22023' THEN rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'Conflicting/duplicate option selection was accepted'; END IF;
  END LOOP;
END;
$verify$;
ROLLBACK;
SELECT 4 AS server_checks_passed, true AS fixture_rolled_back;