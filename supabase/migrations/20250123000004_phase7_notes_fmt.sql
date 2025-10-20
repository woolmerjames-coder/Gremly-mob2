-- Phase 7: Add fmt column to notes table for formatting support
-- Adds formatting options (bullets, numbers, checkboxes) for all note types
-- Other note fields (tags, space_id, ai_placed) already exist from previous migrations

-- Add fmt column with check constraint
alter table if exists notes 
  add column if not exists fmt text null 
  check (fmt in ('bullets', 'numbers', 'checkboxes'));

-- Add comment for clarity
comment on column notes.fmt is 'Formatting style for note body: bullets, numbers, or checkboxes';
