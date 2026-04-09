-- Create user_temporal_anchors table
-- Captures events, deadlines, and time-bound milestones mentioned by users in chat

CREATE TABLE IF NOT EXISTS user_temporal_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'event'
    CHECK (category IN ('event', 'deadline', 'milestone')),
  date_text TEXT,
  resolved_date DATE,
  date_confidence TEXT NOT NULL DEFAULT 'unknown'
    CHECK (date_confidence IN ('exact', 'approximate', 'unknown')),
  date_range_start DATE,
  date_range_end DATE,
  source_chat_id UUID,
  source_message TEXT,
  space_id UUID,
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'passed', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_user_temporal_anchors_user_status
  ON user_temporal_anchors (user_id, status);

CREATE INDEX idx_user_temporal_anchors_lifecycle
  ON user_temporal_anchors (status, date_confidence, resolved_date);

-- RLS
ALTER TABLE user_temporal_anchors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own temporal anchors"
  ON user_temporal_anchors
  FOR SELECT
  USING (user_id = auth.uid());
