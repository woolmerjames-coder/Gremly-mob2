-- Phase 11.x: Create space_milestones table for unified timeline milestones

CREATE TABLE IF NOT EXISTS public.space_milestones (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid NOT NULL,
  space_id uuid REFERENCES public.spaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  date date NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.space_milestones ENABLE ROW LEVEL SECURITY;

-- RLS Policies: user can only access their own milestones
CREATE POLICY "Users can view their own milestones"
  ON public.space_milestones
  FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own milestones"
  ON public.space_milestones
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own milestones"
  ON public.space_milestones
  FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own milestones"
  ON public.space_milestones
  FOR DELETE
  USING (auth.uid() = owner_id);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_space_milestones_owner ON public.space_milestones(owner_id);
CREATE INDEX IF NOT EXISTS idx_space_milestones_space ON public.space_milestones(space_id);
CREATE INDEX IF NOT EXISTS idx_space_milestones_date ON public.space_milestones(date);
