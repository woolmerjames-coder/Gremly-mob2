-- Auto-graduate existing users (anyone who has ever dropped something)
UPDATE cortex_preferences
SET is_training_mode = false,
    graduated_at = NOW(),
    training_level = 3,
    training_items_completed = '["drops","sweeps","briefs","habits","entity_chat","space"]'::jsonb
WHERE is_training_mode = true
  AND (gremly_age > 0 OR first_drop_completed_at IS NOT NULL);

-- New accounts will start with the defaults: is_training_mode = true, training_level = 1
