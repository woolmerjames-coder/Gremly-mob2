-- Phase 7: Add Person enhancements for lightweight CRM
-- Adds dates, notes with formatting, reminders, space, and tags to people table

-- Add dates_json column for important dates (birthdays, anniversaries, etc.)
alter table if exists people 
  add column if not exists dates_json jsonb;

-- Add notes column for gift ideas, last connect notes, etc.
alter table if exists people 
  add column if not exists notes text;

-- Add notes formatting style
alter table if exists people 
  add column if not exists notes_fmt text null 
  check (notes_fmt in ('bullets', 'numbers', 'checkboxes'));

-- Add reminders_json for check-ins
alter table if exists people 
  add column if not exists reminders_json jsonb;

-- Add space_id for organizing people by context
alter table if exists people 
  add column if not exists space_id uuid null;

-- Add tags for categories/labels
alter table if exists people 
  add column if not exists tags jsonb;

-- Add display_name as primary name field (migrates from 'name')
alter table if exists people 
  add column if not exists display_name text;

-- Backfill display_name from name for existing records
update people set display_name = name where display_name is null;

-- Add comments for clarity
comment on column people.dates_json is 'Important dates as JSON array: [{date: "YYYY-MM-DD", label: "birthday|anniversary|moving|custom"}]';
comment on column people.notes is 'Gift ideas, last connect notes, etc.';
comment on column people.notes_fmt is 'Formatting style for notes: bullets, numbers, or checkboxes';
comment on column people.reminders_json is 'Check-in reminders as JSON array';
comment on column people.space_id is 'Organize people by space/context (optional foreign key to spaces table)';
comment on column people.tags is 'Categories/labels as JSON array of strings';
comment on column people.display_name is 'Primary display name (preferred over deprecated name field)';
