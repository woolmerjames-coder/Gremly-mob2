# Search/Hub Schema Audit

> Mapping spec-required fields to actual Supabase database fields

---

## Summary

All spec-required fields are present in the database schema. No migrations needed.

---

## Entity Field Mapping

### 1. Todos (`todos` table)

| Spec Field | DB Field | Status | Notes |
|------------|----------|--------|-------|
| title/name | `title`, `name` | ✅ Present | Both fields exist |
| body | `body` | ✅ Present | `string \| null` |
| tags | `tags` | ✅ Present | `Json \| null` (array) |
| space_id | `space_id` | ✅ Present | `string \| null` |
| created_at | `created_at` | ✅ Present | `string \| null` |
| updated_at | `updated_at` | ✅ Present | `string \| null` |
| due_day | `due_day` | ✅ Present | `string \| null` (YYYY-MM-DD) |
| due_date | `due_date` | ✅ Present | `string \| null` (legacy) |
| completed_at | `completed_at` | ✅ Present | `string \| null` |
| archived | `archived` | ✅ Present | `boolean` |
| archived_at | `archived_at` | ✅ Present | `string \| null` |
| subtype | `subtype` | ✅ Present | `string \| null` |
| is_pinned | `is_pinned` | ✅ Present | `boolean \| null` |

**Additional useful fields:**
- `drop_id` - Mind Drop trace ID
- `origin` - source of creation (e.g., 'catchall')
- `canonical_type` - type classification
- `tags_meta` - sticky tags and tombstones

---

### 2. Notes/Logs/Journals (`notes` table)

| Spec Field | DB Field | Status | Notes |
|------------|----------|--------|-------|
| title/name | `title` | ✅ Present | `string` (required) |
| body | `body` | ✅ Present | `string \| null` |
| tags | `tags` | ✅ Present | `Json \| null` (array) |
| space_id | `space_id` | ✅ Present | `string \| null` |
| created_at | `created_at` | ✅ Present | `string \| null` |
| updated_at | `updated_at` | ✅ Present | `string \| null` |
| archived | `archived` | ✅ Present | `boolean` |
| archived_at | `archived_at` | ✅ Present | `string \| null` |
| subtype | `subtype` | ✅ Present | `string \| null` (general, idea, etc.) |
| journal_subtype | `journal_subtype` | ✅ Present | `string \| null` (journal-specific) |
| mood | `mood` | ✅ Present | `string \| null` |
| canonical_type | `canonical_type` | ✅ Present | `string \| null` (note, log, journal) |
| is_pinned | `is_pinned` | ✅ Present | `boolean \| null` |
| is_favorite | `is_favorite` | ✅ Present | `boolean \| null` |

**Additional useful fields:**
- `drop_id` - Mind Drop trace ID
- `origin` - source of creation
- `tags_meta` - sticky tags and tombstones
- `date` - explicit date for the entry

**Related table: `log_photos`**
- Stores photo attachments for notes
- FK: `note_id` → `notes.id`
- Fields: `id`, `url`, `position`, `created_at`, `owner_id`

---

### 3. Habits (`habits` table)

| Spec Field | DB Field | Status | Notes |
|------------|----------|--------|-------|
| title/name | `title`, `name` | ✅ Present | Both fields exist |
| body | `notes` | ✅ Present | Uses `notes` field for body |
| tags | `tags` | ✅ Present | `string[] \| null` |
| space_id | `space_id` | ✅ Present | `string \| null` |
| created_at | `created_at` | ✅ Present | `string \| null` |
| updated_at | `updated_at` | ✅ Present | `string \| null` |
| completed_at | `completed_at` | ✅ Present | `string \| null` |
| archived | `archived` | ✅ Present | `boolean` |
| archived_at | `archived_at` | ✅ Present | `string \| null` |
| subtype | `subtype` | ✅ Present | `string` (build, break, maintain) |
| is_pinned | `is_pinned` | ✅ Present | `boolean \| null` |

**Additional useful fields:**
- `drop_id` - Mind Drop trace ID
- `origin` - source of creation
- `canonical_type` - type classification
- `tags_meta` - sticky tags and tombstones
- `frequency`, `cadence`, `target_count` - habit tracking

---

### 4. Spaces (`spaces` table)

| Spec Field | DB Field | Status | Notes |
|------------|----------|--------|-------|
| name | `name` | ✅ Present | `string` (required) |
| created_at | `created_at` | ✅ Present | `string \| null` |
| updated_at | `updated_at` | ✅ Present | `string \| null` |
| archived_at | `archived_at` | ✅ Present | `string \| null` |
| icon | `icon` | ✅ Present | `string \| null` |
| theme | `theme` | ✅ Present | `string \| null` |

**Additional useful fields:**
- `last_summary`, `last_summary_at` - AI summary caching
- `defaults_json` - space default settings

---

### 5. Tags (`tags` table + `tag_map` junction)

| Spec Field | DB Field | Status | Notes |
|------------|----------|--------|-------|
| name | `name` | ✅ Present | `string` (required) |
| color | `color` | ✅ Present | `string \| null` |
| created_at | `created_at` | ✅ Present | `string \| null` |
| updated_at | `updated_at` | ✅ Present | `string \| null` |

**Junction table: `tag_map`**
- Links tags to entities
- Fields: `tag_id`, `entity_id`, `entity_type`, `owner_id`

**Note:** Most entities also store tags inline as `tags: Json[]` for denormalized access.

---

### 6. People (`people` table + `entity_people` junction)

| Spec Field | DB Field | Status | Notes |
|------------|----------|--------|-------|
| name | `name` | ✅ Present | `string \| null` |
| display_name | `display_name` | ✅ Present | `string \| null` |
| email | `email` | ✅ Present | `string \| null` |
| notes | `notes` | ✅ Present | `string \| null` |
| tags | `tags` | ✅ Present | `Json \| null` |
| space_id | `space_id` | ✅ Present | `string \| null` |
| created_at | `created_at` | ✅ Present | `string \| null` |
| updated_at | `updated_at` | ✅ Present | `string \| null` |

**Junction table: `entity_people`**
- Links people to entities
- Fields: `person_id`, `entity_id`, `entity_type`, `owner_id`

---

## Hub/Search Specific Requirements

### Pinned Items
- **Field:** `is_pinned` (boolean)
- **Tables:** `todos`, `notes`, `habits`
- **Status:** ✅ All have `is_pinned`

### Archived Items
- **Fields:** `archived` (boolean), `archived_at` (timestamp), `archived_reason` (string)
- **Tables:** `todos`, `notes`, `habits`
- **Status:** ✅ All have full archive support

### Type Discrimination
- **Field:** `canonical_type`
- **Tables:** `todos`, `notes`, `habits`
- **Status:** ✅ All have `canonical_type`
- **Values:** `todo`, `note`, `log`, `journal`, `habit`, `idea`, etc.

### Journal-Specific
- **Fields:** `canonical_type = 'journal'`, `journal_subtype`, `mood`
- **Table:** `notes`
- **Status:** ✅ All fields present
- **Journal subtypes:** `reflection`, `gratitude`, `day`, etc.

---

## Migration Requirements

### Status: ✅ No migrations needed

All spec-required fields are already present in the database schema.

---

## Query Patterns for Hub

### Recent Items (last 7 days)
```sql
SELECT * FROM todos 
WHERE owner_id = ? 
  AND archived = false 
  AND updated_at > NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC;
```

### Pinned Items
```sql
SELECT * FROM todos WHERE owner_id = ? AND is_pinned = true AND archived = false;
SELECT * FROM notes WHERE owner_id = ? AND is_pinned = true AND archived = false;
SELECT * FROM habits WHERE owner_id = ? AND is_pinned = true AND archived = false;
```

### Journal Entries
```sql
SELECT * FROM notes 
WHERE owner_id = ? 
  AND canonical_type = 'journal' 
  AND archived = false
ORDER BY created_at DESC;
```

### Archived Items
```sql
SELECT * FROM todos WHERE owner_id = ? AND archived = true ORDER BY archived_at DESC;
SELECT * FROM notes WHERE owner_id = ? AND archived = true ORDER BY archived_at DESC;
```

### Search by Tag
```sql
SELECT * FROM todos WHERE owner_id = ? AND tags @> '["work"]'::jsonb;
```

---

_Last updated: December 14, 2024_
