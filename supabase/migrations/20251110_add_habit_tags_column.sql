-- Ensure habits table has tags column aligned with todos
ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
