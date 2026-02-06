-- Space Suggestions table for nightly AI-generated organization suggestions
-- Part of the Space Suggestions feature

-- Add disable_suggestions flag to spaces
ALTER TABLE spaces
ADD COLUMN IF NOT EXISTS disable_suggestions boolean DEFAULT false;

-- Add enable_space_suggestions flag to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS enable_space_suggestions boolean DEFAULT true;

-- Create space_suggestions table
CREATE TABLE IF NOT EXISTS space_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestion_type text NOT NULL CHECK (suggestion_type IN ('assign_to_space', 'new_space')),
  space_id uuid REFERENCES spaces(id) ON DELETE CASCADE, -- For assign_to_space type
  suggested_name text, -- For new_space type
  reason text,
  drop_ids uuid[] NOT NULL DEFAULT '{}',
  confidence real DEFAULT 0.8,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  acted_on_at timestamptz
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_space_suggestions_user_id ON space_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_space_suggestions_user_status ON space_suggestions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_space_suggestions_space_id ON space_suggestions(space_id);

-- RLS policies
ALTER TABLE space_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own suggestions"
  ON space_suggestions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own suggestions"
  ON space_suggestions FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can insert (for nightly job)
CREATE POLICY "Service role can insert suggestions"
  ON space_suggestions FOR INSERT
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE space_suggestions IS 'AI-generated suggestions for organizing unassigned items into Spaces';
COMMENT ON COLUMN space_suggestions.suggestion_type IS 'assign_to_space: assign drops to existing space, new_space: suggest creating a new space';
COMMENT ON COLUMN space_suggestions.drop_ids IS 'Array of todo/note/habit IDs that this suggestion applies to';
COMMENT ON COLUMN space_suggestions.status IS 'pending: awaiting user action, accepted: user applied, dismissed: user rejected, expired: replaced by newer suggestions';
