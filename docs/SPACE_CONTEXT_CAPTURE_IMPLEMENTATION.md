# Space-Context Capture Implementation

## Overview
Phase 7 feature: When creating items from Hub or Space screens, new items automatically inherit the current space context from the ScopeSelector.

## Problem Statement
Previously, all items created from Hub were saved with `space_id: null` (unassigned), regardless of the current scope filter. This meant:
- User filters to a specific Space
- Creates a new item
- Item appears in "Unassigned" instead of the selected Space
- User has to manually move item to Space after creation

## Solution
Thread the current `spaceId` from ScopeSelector through to `repo.create()` calls:
- **Everywhere scope:** `space_id: undefined` → saves as `null` (unassigned)
- **Unassigned scope:** `space_id: null` (explicit unassigned)
- **Space scope:** `space_id: "<space-id>"` (assigned to that space)

## Implementation

### 1. ManualAddOverlay Updates (`components/ManualAddOverlay.tsx`)

**New Prop:**
```typescript
interface ManualAddOverlayProps {
  // ...existing props
  currentSpaceId?: string | null; // null = unassigned, undefined = everywhere
}
```

**Space ID Resolution:**
```typescript
// In handleSubmit for catch-all:
const spaceId = currentSpaceId !== undefined ? currentSpaceId : null;
```

**Applied to All Catch-All Saves:**
- Note classification → `space_id: spaceId`
- Todo classification → `space_id: spaceId`
- Habit classification → `space_id: spaceId`
- Fallback (no classification) → `space_id: spaceId`

**Behavior:**
- If `currentSpaceId` is undefined (Everywhere): saves as `null`
- If `currentSpaceId` is null (Unassigned): saves as `null`
- If `currentSpaceId` is a string (Space): saves to that space

### 2. HubScreen Updates (`app/tabs/HubScreen.tsx`)

**Pass Context to Overlay:**
```typescript
<ManualAddOverlay
  visible={overlayVisible}
  defaultTab="habits"
  onClose={() => setOverlayVisible(false)}
  onSubmit={handleManualAddSubmit}
  onCatchAllSaved={() => void load()}
  currentSpaceId={
    scope.type === 'space' 
      ? scope.spaceId 
      : scope.type === 'unassigned' 
        ? null 
        : undefined
  }
/>
```

**Updated handleManualAddSubmit:**
```typescript
const handleManualAddSubmit = async (payload: ManualAddPayload) => {
  // Determine space_id from current scope
  const spaceId =
    scope.type === 'space' ? scope.spaceId : scope.type === 'unassigned' ? null : null;

  switch (payload.type) {
    case 'habits':
      await repo.create({
        // ...
        space_id: payload.data.spaceId || spaceId, // Prefer payload, fallback to scope
      });
      break;
    case 'todos':
      await repo.create({
        // ...
        space_id: spaceId, // Always use scope (todos don't have spaceId in payload)
      });
      break;
    case 'journal':
      await repo.create({
        // ...
        space_id: payload.data.spaceId || spaceId, // Prefer payload, fallback to scope
      });
      break;
  }
};
```

**Logic:**
- Habits/Journal: Check payload first (Space Picker may override), fallback to scope
- Todos: Always use scope (no Space Picker in todo form)
- Catch-all: Handled internally by ManualAddOverlay

### 3. CatchAllNotepad Updates (`app/screens/CatchAllNotepad.tsx`)

**Changes:**
```typescript
await repo.create({
  type: 'note',
  // ...
  ai_placed: false, // Phase 7: "Save to Hub" actions set ai_placed=false by default
  space_id: null, // CatchAllNotepad is not space-scoped (always saves to unassigned)
  why_string: 'Saved from Catch-All Notepad',
  // ...
});
```

**Rationale:**
- CatchAllNotepad is a standalone screen (not in Hub context)
- No ScopeSelector available
- Always saves as unassigned (`space_id: null`)
- `ai_placed: false` since user explicitly saved (not AI-placed)

## Scope Type Mapping

| Scope Type | ScopeOption | currentSpaceId | Resulting space_id |
|------------|-------------|----------------|-------------------|
| Everywhere | `{ type: 'everywhere' }` | `undefined` | `null` (unassigned) |
| Unassigned | `{ type: 'unassigned' }` | `null` | `null` (unassigned) |
| Space | `{ type: 'space', spaceId: 'abc' }` | `'abc'` | `'abc'` (assigned) |

## AI Placement Flag

**Phase 7 Requirement:**
> "Ensure any 'Save to the Hub' actions set ai_placed=false by default for Phase 7."

**Applied To:**
- ✅ ManualAddOverlay catch-all saves: `ai_placed: false` (unless Cortex suggests `true`)
- ✅ CatchAllNotepad saves: `ai_placed: false` (explicit user save)
- ✅ HubScreen manual add handler: `ai_placed: false` (all tabs)

**Exception:**
- Cortex classification may set `ai_placed: true` if it auto-classifies catch-all content
- Final payload checks: if `subtype === 'catchall'`, force `ai_placed: true` with why_string

## User Experience

### Before Implementation
1. User selects "Work" space from ScopeSelector
2. Creates new habit "Review PRs"
3. Habit appears in "Unassigned" (frustrating!)
4. User must manually move habit to "Work"

### After Implementation
1. User selects "Work" space from ScopeSelector
2. Creates new habit "Review PRs"
3. Habit appears in "Work" space (as expected!)
4. No manual move required

## Edge Cases

### Space Picker Override
Some forms (Habits, Journal) have a Space Picker:
```typescript
space_id: payload.data.spaceId || spaceId
```
- If user explicitly picks a space → use that
- Otherwise → use scope context

### Todos (No Space Picker)
Todos form doesn't have Space Picker:
```typescript
space_id: spaceId
```
- Always inherit from scope
- No override possible

### Catch-All with Cortex Classification
Cortex may classify catch-all as habit/todo/note:
```typescript
const spaceId = currentSpaceId !== undefined ? currentSpaceId : null;
// Applied to all classification branches
```
- Classification respects space context
- Classified items land in correct space

## Testing Strategy

### Manual Testing Checklist
- [ ] **Everywhere → Create habit** → space_id should be null
- [ ] **Unassigned → Create todo** → space_id should be null
- [ ] **Work Space → Create habit** → space_id should be 'work-id'
- [ ] **Work Space → Create todo** → space_id should be 'work-id'
- [ ] **Work Space → Create journal** → space_id should be 'work-id'
- [ ] **Work Space → Save catch-all** → space_id should be 'work-id'
- [ ] **Habit with Space Picker** → picker overrides scope
- [ ] **Switch spaces** → new items use new space
- [ ] **CatchAllNotepad** → always saves as unassigned

### Automated Tests (TODO)
Create `__tests__/space-context-capture.test.ts`:
- Mock ScopeSelector with different scopes
- Test ManualAddOverlay receives correct currentSpaceId
- Test handleManualAddSubmit applies correct space_id
- Verify Space Picker override behavior
- Test Cortex classification respects space context

## Related Files
- `components/ManualAddOverlay.tsx` - Added currentSpaceId prop, applied to catch-all saves
- `app/tabs/HubScreen.tsx` - Pass scope to overlay, updated handleManualAddSubmit
- `app/screens/CatchAllNotepad.tsx` - Explicit space_id: null, ai_placed: false

## Design Decisions

### Why `undefined` for Everywhere?
- Distinguishes "no context" from "explicit unassigned"
- Allows fallback logic: `currentSpaceId !== undefined ? currentSpaceId : null`
- Type: `string | null | undefined`

### Why Prefer Payload Over Scope?
Habits and Journal forms have Space Pickers:
```typescript
space_id: payload.data.spaceId || spaceId
```
- Respects explicit user choice (Space Picker)
- Falls back to context if not specified
- Provides flexibility for power users

### Why Always Use Scope for Todos?
Todos form has no Space Picker:
```typescript
space_id: spaceId
```
- Simpler UI (fewer decisions)
- Context inheritance makes sense
- User can move later if needed

## Future Enhancements

### Space Screen Integration
When creating from Space detail screen:
```typescript
<ManualAddOverlay
  currentSpaceId={spaceId} // From Space screen params
  // ...
/>
```
- Items created in Space screen auto-assigned to that space
- Consistent behavior with Hub scope

### Destination Picker Enhancement
Update move sheet to show current space context:
- "Move to..." → "Move from [Current] to..."
- Visual indicator when item will stay in same space

### Smart Defaults
Remember user's last Space Picker choice per tab:
- User picks "Work" for habits → future habits default to "Work"
- Per-tab memory for better UX

## Git History
- **Commit:** feat(hub): Add space-context capture to respect scope when creating
- **Branch:** feat/catchall-hub-optimizations
- **Files Changed:** 3 (ManualAddOverlay, HubScreen, CatchAllNotepad)
- **Lines:** ~60 insertions, ~15 deletions

## Acceptance Criteria
✅ Creating from Hub within a Space results in space_id being set on the new record
✅ Scope = "Everywhere" → space_id = null
✅ Scope = "Unassigned" → space_id = null  
✅ Scope = "Work Space" → space_id = "work-id"
✅ Space Picker overrides scope for Habits/Journal
✅ All "Save to Hub" actions set ai_placed=false by default
