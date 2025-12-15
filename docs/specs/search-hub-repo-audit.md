# Search/Hub Repo Layer Audit

> Audit Date: December 14, 2025  
> Branch: `Hub-Search-page-december-revamp`

## Executive Summary

The repo layer has solid foundations for the Hub/Search feature but **lacks key filtering options** for time-range and status queries. Tag filtering is server-side and works well. Archived item listing has no dedicated API.

---

## 1. Can we query by time range efficiently (week/month/3mo/all)?

### Current State: ❌ **NOT SUPPORTED**

**Findings:**

- `listByType()` has no `createdAfter` / `createdBefore` / `dateRange` options
- The only time-range aware function is `listRecentDrops(sinceIso)` which:
  - Queries notes table with `.gte('created_at', sinceIso)`
  - Limited to notes only, returns max 100 items
- `listAdapters.ts` provides a thin `{ createdAfter }` option but it's **client-side filtering** after fetching all items

**Database Indexes (already exist):**
```
- idx_notes_created_at
- idx_todos_created_at  
- idx_habits_completed_at
```

**Recommendation:**
Extend `ListByTypeOptions` with time-range filters that push down to SQL:

```typescript
// lib/repo/IRepo.ts - Proposed addition to ListByTypeOptions
interface ListByTypeOptions {
  // ... existing fields
  createdAfter?: string;   // ISO timestamp - created_at >= this
  createdBefore?: string;  // ISO timestamp - created_at < this
}
```

**Implementation location:** `lib/repo/supabase.ts` line ~1400 in `listByType()`

---

## 2. Can we query by status (active/completed/all) for todos and other types?

### Current State: ⚠️ **PARTIAL - Active only by default, no completed option**

**Findings:**

- `listByType()` **always** excludes completed/archived items (ZOMBIE PREVENTION):
  - Notes: `query.or('archived.eq.false,archived.is.null')`
  - Todos: `query.is('completed_at', null)` 
  - Habits: `query.is('completed_at', null)`
- There is **no opt-in** to include completed items
- `listTodayMerged()` returns status field but only for active items

**Database Fields:**
- Todos: `status` ('active' | 'completed' | 'archived'), `completed_at`
- Habits: `completed_at` (no status field)
- Notes: `archived` boolean

**Recommendation:**
Add status filter option to `ListByTypeOptions`:

```typescript
// lib/repo/IRepo.ts - Proposed addition
interface ListByTypeOptions {
  // ... existing fields
  status?: 'active' | 'completed' | 'all';  // Default: 'active'
}
```

**Implementation location:** `lib/repo/supabase.ts` line ~1414-1432 (ZOMBIE PREVENTION section)

---

## 3. Can we query archived only (for archived screen)?

### Current State: ❌ **NOT SUPPORTED**

**Findings:**

- No `listArchived()` function exists
- `restoreItem(id, type)` exists for restoring individual items
- `archiveItemsByDropId()` archives by drop_id
- `listByType()` explicitly **excludes** archived items with no override

**Database Fields (all tables):**
```
- archived: boolean
- archived_at: string | null  
- archived_reason: string | null
```

**Recommendation:**
Option A (minimal): Add `includeArchived` flag to `ListByTypeOptions`:

```typescript
interface ListByTypeOptions {
  // ... existing fields
  archivedOnly?: boolean;     // true = only archived items
  includeArchived?: boolean;  // true = include archived (don't filter)
}
```

Option B (dedicated function): Add `listArchived()` to IRepo:

```typescript
// lib/repo/IRepo.ts - Proposed addition
listArchived(type: AppRecord['type'], opts?: {
  spaceId?: ID | null;
  tagNames?: string[];
  archivedAfter?: string;  // For "recently archived" queries
}): Promise<AppRecord[]>;
```

**Implementation location:** `lib/repo/supabase.ts` after `listByType()` (~line 1530)

---

## 4. Is tag filtering server-side or client-side?

### Current State: ✅ **SERVER-SIDE**

**Findings:**

- `listByType()` uses Supabase `.contains('tags', opts.tagNames)` operator
- This translates to PostgreSQL `@>` array containment operator
- Falls back to client-side if server query fails (with toast notification)
- AND semantics: item must have ALL specified tags

**Code location:** `lib/repo/supabase.ts` lines 1435-1436:
```typescript
if (applyTagFilter && opts?.tagNames && opts.tagNames.length > 0) {
  query = query.contains('tags', opts.tagNames);
}
```

**Performance note:** Query logs warn if tag-filtered queries take >600ms

**Status:** ✅ No changes needed for tag filtering

---

## Summary: Proposed Minimal Additions

### 1. Extend `ListByTypeOptions` interface

**File:** `lib/repo/IRepo.ts` (lines 93-99)

```typescript
export interface ListByTypeOptions {
  spaceId?: ID | null;
  unassignedOnly?: boolean;
  subtypes?: string[];
  tagIds?: ID[];
  tagNames?: string[];
  // NEW FIELDS:
  createdAfter?: string;      // ISO timestamp for time-range start
  createdBefore?: string;     // ISO timestamp for time-range end  
  status?: 'active' | 'completed' | 'all';  // Default: 'active'
  archivedOnly?: boolean;     // true = return only archived items
}
```

### 2. Implement filters in `supabase.ts`

**File:** `lib/repo/supabase.ts` in `listByType()` (~line 1400)

Add before the ZOMBIE PREVENTION section:

```typescript
// Time-range filtering (uses idx_notes_created_at, idx_todos_created_at)
if (opts?.createdAfter) {
  query = query.gte('created_at', opts.createdAfter);
}
if (opts?.createdBefore) {
  query = query.lt('created_at', opts.createdBefore);
}
```

Modify ZOMBIE PREVENTION section:

```typescript
// Status filtering (replaces hardcoded active-only)
const statusFilter = opts?.status ?? 'active';
const archivedOnly = opts?.archivedOnly ?? false;

if (archivedOnly) {
  // Archived screen: show only archived items
  if (type === 'note') query = query.eq('archived', true);
  if (type === 'todo') query = query.eq('status', 'archived');
  if (type === 'habit') query = query.eq('archived', true);
} else if (statusFilter === 'active') {
  // Default: exclude archived/completed (current behavior)
  // ... existing ZOMBIE PREVENTION code
} else if (statusFilter === 'completed') {
  // Completed items only
  if (type === 'todo') query = query.isNot('completed_at', null).neq('status', 'archived');
  if (type === 'habit') query = query.isNot('completed_at', null);
}
// statusFilter === 'all' → no filter applied
```

### 3. Mirror changes in `memory.ts`

**File:** `lib/repo/memory.ts` in `listByType()` (~line 356)

Add equivalent client-side filters for test compatibility.

---

## Usage Examples (After Implementation)

```typescript
// Hub "All Items" - past week
await repo.listByType('note', {
  createdAfter: subWeeks(new Date(), 1).toISOString(),
});

// Archived screen - all archived todos
await repo.listByType('todo', {
  archivedOnly: true,
});

// Journal view - completed entries this month
await repo.listByType('note', {
  subtypes: ['journal'],
  status: 'all',  // Include completed journals
  createdAfter: startOfMonth(new Date()).toISOString(),
});

// Search with filters - active habits with tag
await repo.listByType('habit', {
  status: 'active',
  tagNames: ['#fitness'],
});
```

---

## Implementation Priority

| Capability | Priority | Effort | Notes |
|------------|----------|--------|-------|
| Time-range filtering | HIGH | Low | ~30 lines, uses existing indexes |
| Status filtering | HIGH | Medium | ~50 lines, modify ZOMBIE PREVENTION |
| Archived-only queries | HIGH | Low | Part of status filtering |
| Memory repo parity | MEDIUM | Low | Mirror supabase changes |

**Total estimated effort:** 2-3 hours including tests
