# Phase 7 To-Do Implementation - Complete

**Date**: October 19, 2025  
**Status**: ✅ Complete

## Overview

Implemented full To-Do section in unified overlay system following Habits UX pattern with required fields (name + due date), optional fields (time, reminders, space, tags, notes), and NO front-end subtype visibility (AI-only feature).

---

## ✅ Completed Tasks

### 1. Type Definitions (lib/types.ts)
- ✅ Updated `Todo` interface with new fields:
  - `name: string` - Required primary field (replacing `title` as main field)
  - `title?: string` - Kept for backwards compatibility
  - `due_time?: string | null` - HH:mm format for time component
  - `reminders?: any[] | null` - ReminderRow[] JSON array
  - `notes?: string | null` - Additional notes field
  - `tags?: string[] | null` - Categories/tags array
  - `subtype?: 'reminder' | 'microproject' | null` - AI-only, optional (never set by front-end)
  - `undefined_due?: boolean` - Now optional (legacy field)

### 2. Zod Schemas (lib/schemas.ts)
- ✅ Updated `todoZ` runtime schema with all new fields
- ✅ Updated `todoInsertSchema` with validation:
  - `name` required (min 1 character)
  - `due_time` regex validation (HH:mm format)
  - `reminders_json` for database column mapping
  - All optional fields properly typed

### 3. Repository Interface (lib/repo/IRepo.ts)
- ✅ Updated `CreateRecordInput` interface:
  - Added `name` field comment for todos
  - Added `due_time` field for todos
  - Merged `subtype` to support todos ('reminder' | 'microproject')

### 4. Memory Repository (lib/repo/memory.ts)
- ✅ Updated `create` method for todos:
  - Requires `name` field (throws error if missing)
  - Maps all new fields (due_time, reminders, notes, tags, subtype)
  - Fixed test fixture `t1` to include required `name` field

### 5. Supabase Repository (lib/repo/supabase.ts)
- ✅ Created `mapTodoFromDb` function:
  - Maps `reminders_json` (database column) → `reminders` (TS field)
- ✅ Updated `create` method for todos:
  - Validates `name` is required
  - Passes all new fields in `todoInsertSchema` payload
- ✅ Updated all 5 parsing locations with `mapTodoFromDb`:
  - `create` return
  - `update` return
  - `getById` return
  - `listByType` mapping
  - `listBySpaceId` mapping

### 6. TodoFields Component (components/overlay/fields/TodoFields.tsx)
- ✅ Complete rewrite following Habits UX pattern (265 lines)
- **Required Fields**:
  - `name` input (testID: `todo-name`)
  - `due_date` input (testID: `todo-due-date`)
- **Optional Fields**:
  - `due_time` input (testID: `todo-due-time`)
  - RemindersList integration (existing component, testID: `reminders-add`)
- **Add Details Toggle**:
  - testID: `add-details-toggle`
  - Shows/hides details section
  - Text: "Add details ▾" / "Hide details ▴"
- **Details Section**:
  - Notes textarea (testID: `todo-notes`)
  - Space selector (testID: `todo-space`)
  - Tags input + add button (testID: `todo-tag-input`, `todo-tag-add`)
  - Tag chips (testID: `todo-tag-chip-{tag}`)
- **NO Subtype Chips**: AI-only feature, completely removed from UI
- **Exports**: `TodoFields` component and `TodoDetailsState` type

### 7. Unified Overlay Integration (components/overlay/UnifiedCreateOverlay.tsx)
- ✅ Updated state variables:
  - `todoDueDate` now `string | null` (was `string`)
  - Added `todoDueTime: string | null`
  - Added `todoDetails: TodoDetailsState` (reminders, spaceId, notes, tags)
  - Removed `todoSubtype` state (AI-only, not exposed in UI)
- ✅ Updated `resetFields` function
- ✅ Updated validation logic:
  - Requires both `name` AND `due_date`
  - Hint: "Name required" or "Due date required"
- ✅ Updated save logic (`buildInput`):
  - Maps `name` as primary field
  - Includes `title` for backwards compatibility
  - Passes all new fields (due_time, reminders, notes, tags)
  - Applies spaceId from details if set

### 8. Database Migration (supabase/migrations/20250123000002_phase7_todos_extras.sql)
- ✅ Created migration file with:
  - `name` column (text, required after backfill)
  - `due_time` column (text with HH:mm check constraint)
  - `reminders_json` column (jsonb for ReminderRow[])
  - `subtype` column (text with 'reminder'/'microproject' check)
  - `notes` column (text, nullable)
  - `tags` column (jsonb for string array)
  - Backfill: Sets `name = title` for existing rows
  - Make `name` NOT NULL after backfill

### 9. Tests (__tests__/todo-fields.test.tsx)
- ✅ Created comprehensive test suite: **28/28 tests passing**
- **Test Coverage**:
  - Required fields rendering and interaction (6 tests)
  - Optional fields (due_time, reminders) (3 tests)
  - Add details toggle behavior (4 tests)
  - Notes field (2 tests)
  - Space selector (2 tests)
  - Tags add/remove/duplicate handling (5 tests)
  - Disabled state (2 tests)
  - NO subtype chips validation (1 test)
- **Test Results**: All tests pass in 0.893s

---

## 📁 Files Modified

### Core Types & Schemas
- `lib/types.ts` - Todo interface with 7 new/modified fields
- `lib/schemas.ts` - todoZ and todoInsertSchema updated
- `lib/repo/IRepo.ts` - CreateRecordInput extended for todos

### Repository Layer
- `lib/repo/memory.ts` - create method + test fixture
- `lib/repo/supabase.ts` - mapTodoFromDb + 5 parsing locations

### Components
- `components/overlay/fields/TodoFields.tsx` - Complete rewrite (265 lines)
- `components/overlay/UnifiedCreateOverlay.tsx` - State, validation, and save logic

### Database
- `supabase/migrations/20250123000002_phase7_todos_extras.sql` - New migration

### Tests
- `__tests__/todo-fields.test.tsx` - 28 tests, 100% passing

---

## 🎯 Acceptance Criteria Met

✅ **Name + Due Date Required**: Validation enforces both fields  
✅ **Optional Fields**: Time, Reminders, Space, Tags, Notes all implemented  
✅ **NO Subtype Chips**: Completely removed from UI (AI-only)  
✅ **"Add Details" Section**: Toggle behavior matches Habits pattern  
✅ **TestIDs Present**: All fields have proper testIDs  
✅ **RemindersList Reused**: Existing component integrated  
✅ **Save Disabled**: Until name + due date are valid  
✅ **Multiple Reminders**: Supported via RemindersList  
✅ **Data in Hub**: Repo implementations save all fields correctly  
✅ **Migration Created**: Backfills existing data safely  
✅ **Tests Passing**: 28/28 tests green

---

## 🔍 Key Design Decisions

1. **name vs title**: `name` is the new primary field, `title` kept for backwards compatibility
2. **due_time separate from due_date**: Allows time to be optional, matches Habits reminder time pattern
3. **reminders_json column**: Database stores as JSONB, mapped to TypeScript `reminders` array
4. **subtype AI-only**: Never exposed in UI, optional in type system, can be set by backend cortex
5. **TodoDetailsState type**: Encapsulates optional fields (reminders, spaceId, notes, tags) in single state object
6. **Backfill strategy**: Migration copies `title` to `name` for existing todos before making `name` NOT NULL

---

## 🚀 Next Steps (Future Enhancements)

1. **Date/Time Pickers**: Replace TextInput with native date/time picker components
2. **Space Picker**: Replace TextInput with proper space selector dropdown
3. **Tag Autocomplete**: Suggest existing tags as user types
4. **Edit Mode**: Load existing todo data into TodoFields for editing
5. **AI Subtype Assignment**: Backend cortex can analyze todos and assign 'reminder' or 'microproject' subtype
6. **Due Time Validation**: Add HH:mm format validation in UI (currently only in schema)

---

## ✅ Status: Ready for QA

All implementation complete, tests passing, migration ready to run. Todo creation UI now matches Habits UX pattern with full feature parity.
