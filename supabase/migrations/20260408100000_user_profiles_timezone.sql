-- Add timezone column to user_profiles for server-side timezone resolution
-- when the client doesn't send it in the request body.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';
