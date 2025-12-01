# UnifiedOverlayV2 Type Change Flow - Implementation Summary

## Overview

This document describes the hardened "change type" flow in UnifiedOverlayV2 for converting between logs, todos, and habits.

## Problem Statement

When a user changed the type in the overlay (e.g., log → todo), the previous implementation used `repo.update()` which wrote to the **original table**. Since Supabase uses separate tables for each entity type (`notes`, `todos`, `habits`), this caused:

1. **Wrong table writes**: A note converted to todo would write todo fields to the `notes` table
2. **Lost entities**: The new type's record was never created in the correct table
3. **Broken Mind Drop links**: The `drop_id` association could be lost

## Solution

The type change flow now properly handles cross-table conversions:

### Detection Logic

```typescript
// Determine original and target type families
const originalFamily: TypeFamily = originalEntityType === 'todo' ? 'todo' 
  : originalEntityType === 'habit' ? 'habit' 
  : originalEntityType === 'note' ? 'note' 
  : null;
const targetFamily = TYPE_FAMILY[baseType]; // { log: 'note', todo: 'todo', habit: 'habit' }

// Detect cross-table type conversion
const isTypeConversion = mode === 'edit' 
  && initialEntity?.id 
  && originalFamily !== null 
  && originalFamily !== targetFamily;
```

### Conversion Flow

When `isTypeConversion` is true:

1. **Create new record** in target table with `repo.create()`
   - Includes `dropId` to preserve Mind Drop linkage
   - Sets correct `canonicalType`, `labels`, and type-specific fields

2. **Archive/delete old record** via `deleteEntityOrDrop()`
   - Handles `drop_id` cleanup properly
   - Non-fatal: continues even if cleanup fails

3. **Emit telemetry event** `OverlayTypeConverted`
   - Includes `from`, `to`, `oldId`, `newId`, `dropId`

### Supported Conversions

| From | To | Behavior |
|------|-----|----------|
| note/log | todo | Create todo in `todos`, archive note |
| note/log | habit | Create habit in `habits`, archive note |
| todo | note/log | Create note in `notes`, archive todo |
| todo | habit | Create habit in `habits`, archive todo |
| habit | todo | Create todo in `todos`, archive habit |
| habit | note/log | Create note in `notes`, archive habit |

### Same-Type Updates

When `isTypeConversion` is false (same type):
- Uses standard `repo.update()` for in-place edits
- No archival, no new record creation

## Files Changed

1. **`components/overlay/UnifiedOverlayV2.tsx`**
   - Added `TYPE_FAMILY` constant for table family mapping
   - Added `deleteEntityOrDrop` import
   - Added type change detection in `onSave()`
   - Added cross-table conversion logic
   - Added documentation comments for `handleTypeSelect()`

2. **`lib/events/EventBus.ts`**
   - Added `OverlayTypeConverted` event type

3. **`components/overlay/__tests__/UnifiedOverlayV2.typeChange.test.tsx`** (new)
   - Tests for note → todo conversion
   - Tests for todo → habit conversion
   - Tests for habit → log conversion
   - Tests for same-type updates (no conversion)
   - Tests for cancel without save

## Key Fields Preserved During Conversion

| Field | Description |
|-------|-------------|
| `drop_id` | Mind Drop linkage (CRITICAL) |
| `tags` | User tags |
| `tags_meta` | Sticky/tombstone metadata |
| `space_id` | Space association |
| `origin` | Source (catchall, manual, etc.) |
| `views` | View-specific flags |
| Title/body/notes | Content (mapped appropriately per type) |

## Dev Logging

When `__DEV__` is true:
```
[OverlayTypeChange] Cross-table conversion detected { oldId, dropId, originalFamily, targetFamily, from, to }
[OverlayTypeChange] New record created { newId, newType, dropId }
[OverlayTypeChange] Old record archived/deleted { oldId, entityType }
```

## Intentionally Not Supported

- **No unsupported conversions**: All 6 conversion directions are supported
- **Subtype-only changes**: Changing log subtype (journal → list) uses in-place update, not conversion

## Testing

Run the type change tests:
```bash
npm test -- components/overlay/__tests__/UnifiedOverlayV2.typeChange.test.tsx
```
