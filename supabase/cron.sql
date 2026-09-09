-- ---------------------------------------------------------------------------
-- Schedule the confirmation / reminder emails.
-- Run this AFTER `supabase functions deploy booking-notify --no-verify-jwt`.
--
-- Replace YOUR-PROJECT-REF below, then run in the Supabase SQL editor.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('booking-notify')
where exists (select 1 from cron.job where jobname = 'booking-notify');

-- Every five minutes: new bookings get their confirmation, and anything
-- starting inside settings.reminder_minutes gets its nudge. The function is
-- idempotent, so a missed or doubled run costs nothing.
select cron.schedule(
  'booking-notify',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/booking-notify',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Check it is running:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
