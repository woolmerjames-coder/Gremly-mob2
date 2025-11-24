/**
 * Habits Template Linkage
 * 
 * Add optional template reference to habits table so habits can:
 * - Attach a reusable list template
 * - Reset their daily checklist from the template
 * - Share templates across multiple habits
 * 
 * Design:
 * - Nullable list_template_id column
 * - Foreign key to list_templates.id (ON DELETE SET NULL - preserve habit if template deleted)
 * - No impact on existing habits (all existing rows will have NULL template_id)
 */

-- Add template reference column to habits
ALTER TABLE public.habits
ADD COLUMN IF NOT EXISTS list_template_id uuid;

-- Add last reset tracking for daily checklist reset
ALTER TABLE public.habits
ADD COLUMN IF NOT EXISTS last_reset_date timestamptz;

-- Add foreign key constraint (optional but recommended for referential integrity)
-- ON DELETE SET NULL: if template is deleted, habit keeps its current list_items but loses template link
ALTER TABLE public.habits
ADD CONSTRAINT habits_list_template_fk
  FOREIGN KEY (list_template_id)
  REFERENCES public.list_templates(id)
  ON DELETE SET NULL;

-- Index for efficient template lookups (find all habits using a template)
CREATE INDEX IF NOT EXISTS habits_list_template_id_idx
  ON public.habits (list_template_id)
  WHERE list_template_id IS NOT NULL;

-- Index for efficient reset date checks
CREATE INDEX IF NOT EXISTS habits_last_reset_date_idx
  ON public.habits (last_reset_date)
  WHERE list_template_id IS NOT NULL;

-- Comment explaining usage
COMMENT ON COLUMN public.habits.list_template_id IS 
'Optional reference to a list template. 
When set, the habit''s daily checklist will reset from this template.
If the template is deleted, this field is set to NULL but the habit''s current list_items are preserved.';

COMMENT ON COLUMN public.habits.last_reset_date IS
'Timestamp of last checklist reset from template. 
Used to detect if daily reset is needed (compares date portion with current date).
Updated automatically when checklist is reset from template.';

-- Debug query: Find habits using templates
COMMENT ON CONSTRAINT habits_list_template_fk ON public.habits IS 
'Example queries:

-- Find all habits using a specific template
SELECT h.id, h.title, h.list_items, lt.name as template_name
FROM habits h
JOIN list_templates lt ON h.list_template_id = lt.id
WHERE lt.name = ''Morning Routine'';

-- Find habits with template linkage
SELECT h.id, h.title, lt.name as template_name, jsonb_array_length(h.list_items) as item_count
FROM habits h
LEFT JOIN list_templates lt ON h.list_template_id = lt.id
WHERE h.list_template_id IS NOT NULL;

-- Count habits per template
SELECT lt.name, count(h.id) as habit_count
FROM list_templates lt
LEFT JOIN habits h ON h.list_template_id = lt.id
GROUP BY lt.id, lt.name
HAVING count(h.id) > 0;
';
