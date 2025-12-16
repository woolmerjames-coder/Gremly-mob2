# MindDrop Card Reference Files

## Summary of the Problem

**UnifiedDrop is missing the `frequency` field for habits.**

When habits are created:
1. `buildHabitFields(text)` parses frequency from user input (e.g., "Run 3x per week" → `weekly`)
2. `convertUnsortedToHabit()` receives `{ frequency, frequencyValue }` and stores them on the Habit entity
3. The Habit entity has `frequency: 'daily' | 'weekly' | 'monthly' | 'custom'`

But when loading Recent Drops in CatchAllNotepad.tsx:
- `habitDrops` mapping does NOT include `frequency`
- So `getContextualMeta()` does `(item as any).frequency` which is always `undefined`
- Falls back to just showing "Habit"

## Fix Needed

### 1. Add frequency to UnifiedDrop type (line ~780)
```typescript
type UnifiedDrop = {
  // ... existing fields
  frequency?: string | null;  // ADD THIS
};
```

### 2. Map frequency in habitDrops (in load function, around line 1720)
```typescript
const habitDrops: UnifiedDrop[] = habits.map((h) => ({
  // ... existing fields
  frequency: h.frequency,  // ADD THIS
}));
```

### 3. Update getContextualMeta to use item.frequency (no more `as any`)
```typescript
if (kind === 'habit') {
  return item.frequency || 'Habit';
}
```

## Files in This Reference Folder

1. **01-UnifiedDrop-type.ts** - Current UnifiedDrop type definition
2. **02-AnimatedMindDropCard-JSX.tsx** - Card rendering JSX
3. **03-helper-functions.ts** - getContextualMeta and getDisplayKindForChip
4. **04-card-styles.ts** - Relevant styles (recentCard, recentConfirmation, recentContextPill)
5. **05-entity-types.ts** - Habit and Note interfaces from lib/types.ts
6. **06-pipelineStages.ts** - Stage A (classification) and Stage B (enrichment) flow
7. **07-conversion-helpers.ts** - convertUnsortedToHabit and convertUnsortedToLog

## Quick Reference

| Entity | Key Field | Where Stored | Mapped to UnifiedDrop? |
|--------|-----------|--------------|------------------------|
| Habit  | frequency | habit.frequency | ❌ NO - needs fix |
| Note   | subtype   | note.subtype | ✅ YES (as noteSubtype) |
| Todo   | due_date  | todo.due_date | ✅ YES |
