-- Phase 7: Add new habit fields for frequency, reminders, buddy, stacking, break habits
-- These fields support the extended habit creation UI

alter table if exists habits add column if not exists frequency_json jsonb;
alter table if exists habits add column if not exists reminders_json jsonb;
alter table if exists habits add column if not exists buddy_id uuid null;
alter table if exists habits add column if not exists buddy_email text null;
alter table if exists habits add column if not exists stack_with_id uuid null;
alter table if exists habits add column if not exists stack_position text null check (stack_position in ('before','after'));
alter table if exists habits add column if not exists stack_offset_minutes int null;
alter table if exists habits add column if not exists taper_plan jsonb;
alter table if exists habits add column if not exists triggers_json jsonb;
alter table if exists habits add column if not exists replacement_habit_id uuid null;
alter table if exists habits add column if not exists replacement_text text null;
alter table if exists habits add column if not exists start_date date null;
alter table if exists habits add column if not exists end_date date null;
