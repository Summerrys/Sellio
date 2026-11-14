-- Browser alerts (Alvin, 14 Nov 2026: "Be it buyers or seller should both have notification on
-- any devices"). A browser that allows Sellio's notifications registers like an Android phone
-- (src/lib/webPush.js), with platform 'web', and send-push sends it the same alerts through
-- Firebase Cloud Messaging (public/sw.js shows them). Only the list of platforms changes:
-- push_notification_payload, app.notification_push and unregister_push_device take any platform
-- already.
--
-- register_push_device was made outside this folder, so it is changed in place: its platform
-- list must appear exactly once, or nothing changes.

alter table public.push_devices drop constraint push_devices_platform_check;
alter table public.push_devices add constraint push_devices_platform_check
  check (platform = any (array['android'::text, 'ios'::text, 'web'::text]));

do $migration$
declare
  v_def text := pg_get_functiondef('public.register_push_device(text,text,text)'::regprocedure);
  v_old text := $a$p_platform not in ('android', 'ios')$a$;
  v_count int;
begin
  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_count <> 1 then
    raise exception 'register_push_device: expected its platform list once, found % times', v_count;
  end if;
  execute replace(v_def, v_old, $b$p_platform not in ('android', 'ios', 'web')$b$);
end
$migration$;
