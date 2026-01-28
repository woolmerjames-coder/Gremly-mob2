-- Phase 7: Add journal-specific fields to notes table
-- These fields support the enhanced journal creation UI
-- Journal entries are stored as notes with subtype='journal'

-- Add date for journal entry (may differ from created_at)
alter table if exists notes add column if not exists date date null;

-- Add mood tracking (6 options)
alter table if exists notes add column if not exists mood text null 
  check (mood in ('ecstatic','happy','neutral','low','sad','tired'));

-- Add formatting style
alter table if exists notes add column if not exists fmt text null 
  check (fmt in ('bullets','numbers','checkboxes'));

-- Add reminders stored as JSONB (ReminderRow[])
alter table if exists notes add column if not exists reminders_json jsonb;

-- Add tags/categories array
alter table if exists notes add column if not exists tags jsonb;

-- Add AI-only journal subtype classification
alter table if exists notes add column if not exists journal_subtype text null 
  check (journal_subtype in ('reflection','gratitude','dream','review'));

-- Note: Journal entries continue to be stored as notes with subtype='journal'
-- The new columns provide additional metadata for journal-specific features
