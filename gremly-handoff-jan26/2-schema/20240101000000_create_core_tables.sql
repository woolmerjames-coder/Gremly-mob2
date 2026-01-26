/**
 * Phase 1: Core Tables Foundation
 * Create the basic tables that the application depends on.
 * This migration must come first before all other migrations.
 */

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create core tables that other migrations depend on
CREATE TABLE IF NOT EXISTS public.spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  frequency text NOT NULL DEFAULT 'daily',
  owner_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text, -- will be renamed to name in later migration
  owner_id uuid NOT NULL,
  due_date timestamptz,
  undefined_due boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  body text,
  owner_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text, -- will be converted to display_name in later migration
  email text,
  owner_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add basic indexes for performance
CREATE INDEX IF NOT EXISTS idx_spaces_owner_id ON public.spaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_habits_owner_id ON public.habits(owner_id);
CREATE INDEX IF NOT EXISTS idx_todos_owner_id ON public.todos(owner_id);
CREATE INDEX IF NOT EXISTS idx_notes_owner_id ON public.notes(owner_id);

-- Add basic RLS policies (can be enhanced later)
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Basic policies for owner access
CREATE POLICY "Users can access their own spaces" ON public.spaces
  FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "Users can access their own habits" ON public.habits
  FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "Users can access their own todos" ON public.todos
  FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "Users can access their own notes" ON public.notes
  FOR ALL USING (auth.uid() = owner_id);