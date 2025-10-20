-- Phase 8: Create space_chats table for chat threads within spaces
-- Supports pinning, archiving, and metadata for future AI features

CREATE TABLE IF NOT EXISTS public.space_chats (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  space_id uuid REFERENCES public.spaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  pinned boolean DEFAULT false,
  archived_at timestamptz,
  last_message_snippet text,
  updated_at timestamptz DEFAULT now(),
  metadata_json jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.space_chats ENABLE ROW LEVEL SECURITY;

-- RLS Policies: user can only access their own chats
CREATE POLICY "Users can view their own space chats"
  ON public.space_chats
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own space chats"
  ON public.space_chats
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own space chats"
  ON public.space_chats
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own space chats"
  ON public.space_chats
  FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_space_chats_user_id ON public.space_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_space_chats_space_id ON public.space_chats(space_id);
CREATE INDEX IF NOT EXISTS idx_space_chats_pinned ON public.space_chats(pinned) WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_space_chats_updated_at ON public.space_chats(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_space_chats_archived ON public.space_chats(archived_at) WHERE archived_at IS NOT NULL;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_space_chats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER space_chats_updated_at
  BEFORE UPDATE ON public.space_chats
  FOR EACH ROW
  EXECUTE FUNCTION update_space_chats_updated_at();

-- Comments for documentation
COMMENT ON TABLE public.space_chats IS 'Chat threads within spaces for AI conversations and notes';
COMMENT ON COLUMN public.space_chats.pinned IS 'Pinned chats appear at top of list';
COMMENT ON COLUMN public.space_chats.archived_at IS 'Soft delete timestamp';
COMMENT ON COLUMN public.space_chats.last_message_snippet IS 'Preview text for chat list';
COMMENT ON COLUMN public.space_chats.metadata_json IS 'Extensible metadata for future features';
