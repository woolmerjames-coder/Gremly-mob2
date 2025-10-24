-- Update space_chat_messages.role to support more message types
-- Phase 11.7: Add support for 'action', 'confirmation', 'action-confirmation', and 'entry-card' roles

-- Drop the old constraint
ALTER TABLE public.space_chat_messages 
DROP CONSTRAINT IF EXISTS space_chat_messages_role_check;

-- Add new constraint with expanded role values
ALTER TABLE public.space_chat_messages
ADD CONSTRAINT space_chat_messages_role_check 
CHECK (role IN (
  'user',               -- User messages
  'assistant',          -- Gremly assistant messages
  'system',            -- System notifications
  'action',            -- Action creation notifications
  'confirmation',      -- Confirmation messages
  'action-confirmation', -- Inline action confirmations (Phase 11.3)
  'entry-card'         -- Entry cards for created/retrieved entries (Phase 11.6)
));

-- Update comment to reflect new role types
COMMENT ON COLUMN public.space_chat_messages.role IS 
'Message role: user | assistant | system | action | confirmation | action-confirmation | entry-card';

-- Update comment on metadata column to clarify usage
COMMENT ON COLUMN public.space_chat_messages.metadata_json IS 
'Optional structured metadata. For action-confirmation: { type, actionType, actionId, title }. For entry-card: { entry, entryType, entryId }. For multi-intent: { alternativeIntents, options }.';
