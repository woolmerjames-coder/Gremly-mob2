-- Phase 10.10: Ensure space chat messages retain space_id for context lookups
ALTER TABLE public.space_chat_messages
ADD COLUMN IF NOT EXISTS space_id uuid REFERENCES public.spaces(id) ON DELETE CASCADE;

-- Backfill existing rows using chat → space relationship
UPDATE public.space_chat_messages scm
SET space_id = sc.space_id
FROM public.space_chats sc
WHERE scm.space_id IS NULL
  AND sc.id = scm.chat_id;

-- Enforce not-null once backfilled
ALTER TABLE public.space_chat_messages
ALTER COLUMN space_id SET NOT NULL;

-- Helpful index for space-scoped queries
CREATE INDEX IF NOT EXISTS idx_scm_space_id ON public.space_chat_messages (space_id);

COMMENT ON COLUMN public.space_chat_messages.space_id IS 'Owning space for this message, used for context assembly.';
