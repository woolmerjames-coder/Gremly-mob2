-- Add commitment tracking fields to habits and todos
ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS commitment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS commitment_started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS commitment_note text NULL,
  ADD COLUMN IF NOT EXISTS commitment_archived_at timestamptz NULL;

ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS commitment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS commitment_started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS commitment_note text NULL,
  ADD COLUMN IF NOT EXISTS commitment_archived_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_habits_commitment_owner ON habits (owner_id)
  WHERE commitment = true;

CREATE INDEX IF NOT EXISTS idx_todos_commitment_owner ON todos (owner_id)
  WHERE commitment = true;
