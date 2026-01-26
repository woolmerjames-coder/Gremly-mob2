-- Phase 7: Add new todo fields for time, reminders, notes, tags, and subtype
-- These fields support the extended todo creation UI

-- Add name column (new primary field, required)
alter table if exists todos add column if not exists name text;

-- Add due_time for HH:mm format time
alter table if exists todos add column if not exists due_time text null check (due_time ~ '^\d{2}:\d{2}$');

-- Add reminders stored as JSONB (ReminderRow[])
alter table if exists todos add column if not exists reminders_json jsonb;

-- Add subtype (AI-only, never set by front-end)
alter table if exists todos add column if not exists subtype text null check (subtype in ('reminder','microproject'));

-- Add additional notes field
alter table if exists todos add column if not exists notes text null;

-- Add tags/categories array
alter table if exists todos add column if not exists tags jsonb;

-- Backfill: Set name from title for existing rows where name is null
update todos set name = title where name is null and title is not null;

-- Make name NOT NULL after backfill (required field)
alter table if exists todos alter column name set not null;
