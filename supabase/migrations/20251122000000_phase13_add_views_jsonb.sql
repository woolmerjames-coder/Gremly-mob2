-- Phase 13: Add views JSONB column to todos, habits, and notes
-- This column stores UI state flags like ai_title_frozen, ai_tags_frozen, etc.
-- Used to prevent re-running AI enrichment when user has manually edited content.

alter table if exists public.todos
  add column if not exists views jsonb not null default '{}'::jsonb;

alter table if exists public.habits
  add column if not exists views jsonb not null default '{}'::jsonb;

alter table if exists public.notes
  add column if not exists views jsonb not null default '{}'::jsonb;
