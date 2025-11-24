/**
 * Phase 4: List Templates
 * 
 * Create a reusable list_templates table for saving and applying list patterns
 * across todos, notes, and habits.
 * 
 * Design Constraints:
 * - Per-owner storage (not global)
 * - Supports scoping to specific entity types (todo/note/habit/any)
 * - Preserves source entity reference for template provenance
 * - Does NOT modify existing Stage A/Stage B pipeline logic
 * - Does NOT alter todos/notes/habits tables
 * 
 * Use Cases:
 * - Save a grocery list from a note → reuse it on todos
 * - Save a workout routine from a habit → reuse it on notes
 * - Save a packing list → apply to any entity type
 */

-- Enable UUID extension (idempotent)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create list_templates table
CREATE TABLE IF NOT EXISTS public.list_templates (
  -- Primary key
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  owner_id uuid NOT NULL,
  
  -- Template metadata
  name text NOT NULL,
  scope text NOT NULL DEFAULT 'any', -- 'any' | 'todo' | 'habit' | 'note' (enforced in app)
  
  -- List data (JSONB array of ListItem objects)
  -- Structure: [{ id: uuid, text: string, checked: boolean }, ...]
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Optional: Track source entity (for template provenance)
  source_entity_type text, -- nullable: 'todo' | 'note' | 'habit'
  source_entity_id uuid,   -- nullable: original entity id
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: One template per owner per name (case-insensitive)
-- This prevents duplicate template names for the same user
CREATE UNIQUE INDEX IF NOT EXISTS list_templates_owner_name_unique
  ON public.list_templates (owner_id, lower(name));

-- Index for efficient owner queries
CREATE INDEX IF NOT EXISTS list_templates_owner_id_idx
  ON public.list_templates (owner_id);

-- Index for scope filtering (when we want to show only todo-compatible templates, etc.)
CREATE INDEX IF NOT EXISTS list_templates_scope_idx
  ON public.list_templates (scope);

-- Index for source entity lookups (if we want to show "templates created from this entity")
CREATE INDEX IF NOT EXISTS list_templates_source_entity_idx
  ON public.list_templates (source_entity_type, source_entity_id)
  WHERE source_entity_type IS NOT NULL AND source_entity_id IS NOT NULL;

-- RLS Policies: Owner-only access
ALTER TABLE public.list_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own templates
CREATE POLICY list_templates_select_own
  ON public.list_templates
  FOR SELECT
  USING (owner_id = auth.uid());

-- Policy: Users can only insert their own templates
CREATE POLICY list_templates_insert_own
  ON public.list_templates
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Policy: Users can only update their own templates
CREATE POLICY list_templates_update_own
  ON public.list_templates
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Policy: Users can only delete their own templates
CREATE POLICY list_templates_delete_own
  ON public.list_templates
  FOR DELETE
  USING (owner_id = auth.uid());

-- Trigger: Update updated_at timestamp on row update
CREATE OR REPLACE FUNCTION public.update_list_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER list_templates_updated_at
  BEFORE UPDATE ON public.list_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_list_templates_updated_at();

-- Debug Comment: How to inspect templates
COMMENT ON TABLE public.list_templates IS 
'Reusable list templates for todos, notes, and habits.

Example queries:

-- View all templates for a user
SELECT id, name, scope, jsonb_array_length(items) as item_count, created_at
FROM list_templates
WHERE owner_id = ''<user-uuid>''
ORDER BY created_at DESC;

-- View template items expanded
SELECT 
  lt.name,
  lt.scope,
  item->''text'' as item_text,
  (item->''checked'')::boolean as is_checked
FROM list_templates lt,
  jsonb_array_elements(lt.items) as item
WHERE lt.owner_id = ''<user-uuid>''
  AND lt.name = ''Grocery List'';

-- Count templates by scope
SELECT scope, count(*) as template_count
FROM list_templates
WHERE owner_id = ''<user-uuid>''
GROUP BY scope;
';

-- Validation comment for scope field (enforced in application code)
COMMENT ON COLUMN public.list_templates.scope IS 
'Scope restriction for template usage. 
Allowed values (enforced in app): ''any'' | ''todo'' | ''habit'' | ''note''.
Use ''any'' for templates that can be applied to any entity type.';

-- Validation comment for items field
COMMENT ON COLUMN public.list_templates.items IS 
'JSONB array of list items. 
Expected structure: [{ id: uuid, text: string, checked: boolean }, ...]
This matches the list_items JSONB structure on todos/notes/habits.';
