-- Notifications: removing what the old system left in the database.
--
-- Run this ONCE, after the new notifications are live for everyone
-- (NOTIFICATIONS_MODE = "on") and the two old Cloudflare workers
-- (gremly-notifications, gremly-notification-worker) are deleted.
-- Nothing in the app or the workers reads any of this any more.
--
-- How: Supabase dashboard -> SQL Editor -> New query -> paste all of this -> Run.
-- It deletes the old token table (2 rows, last written in March 2026) and the
-- old send-tracking columns; it cannot be undone, which is why it is not a
-- migration that runs by itself.

drop function if exists public.claim_notification_slot(uuid, text, text);
drop table if exists public.push_tokens;

alter table public.notification_preferences
  drop column if exists afternoon_enabled,
  drop column if exists afternoon_time,
  drop column if exists afternoon_last_sent,
  drop column if exists morning_last_sent,
  drop column if exists evening_last_sent,
  drop column if exists weekly_last_sent;
