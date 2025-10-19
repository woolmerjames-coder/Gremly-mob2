# Notes Subfilter Pills - Implementation Summary

**Status**: ✅ COMPLETED & COMMITTED

## Overview

Added quick-filter pills to the Notes tab that allow users to filter between All notes, Ideas, Lists, and Reference notes without affecting other tabs.

## Implementation Details

### State Management

**New State**:
```typescript
const [notesSubfilter, setNotesSubfilter] = useState<'all' | 'idea' | 'list' | 'reference'>('all');
```

**Reset Logic**:
- Filter automatically resets to 'all' when user switches away from Notes tab
- Implemented via useEffect hook monitoring tab changes

### Filter Logic

**Notes Tab Query** (updated):
```typescript
} else if (tab === 'Notes') {
  const subtypes =
    notesSubfilter === 'all'
      ? ['idea', 'list', 'reference']
      : [notesSubfilter];
  data = await repo.listByType('note', {
    ...scopeOpts,
    subtypes,
  });
}
```

**Filter Mappings**:
- `All` → `['idea', 'list', 'reference']` (all note subtypes)
- `Ideas` → `['idea']`
- `Lists` → `['list']`
- `Reference` → `['reference']`

### UI Component

**Pill Bar** (conditionally rendered):
```tsx
{tab === 'Notes' && (
  <View style={styles.pillBar}>
    {/* Four TouchableOpacity pills */}
  </View>
)}
```

**Position**: Between SegmentedTabs and search box

**Pills**:
1. **All** - Shows all note types
2. **Ideas** - Filters to idea notes only
3. **Lists** - Filters to list notes only
4. **Reference** - Filters to reference notes only

### Styling

**Pill Bar**:
```typescript
pillBar: {
  flexDirection: 'row',
  marginTop: spacing.sm,
  marginHorizontal: spacing.md,
  gap: spacing.xs,
}
```

**Individual Pills**:
```typescript
pill: {
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  borderRadius: radii.xl,
  backgroundColor: colors.gray100,
  borderWidth: 1,
  borderColor: colors.gray200,
}
```

**Active State**:
```typescript
pillActive: {
  backgroundColor: colors.deepTeal,
  borderColor: colors.deepTeal,
}
```

**Text Styles**:
```typescript
pillText: {
  fontSize: 13,
  fontWeight: '600',
  color: colors.gray600,
}
pillTextActive: {
  color: colors.white,
}
```

## User Flow

1. **User navigates to Notes tab** → Pills appear below tabs
2. **Default state**: "All" pill is active (deep teal)
3. **User taps "Ideas"** → 
   - Ideas pill becomes active (deep teal)
   - All pill becomes inactive (gray)
   - List refreshes showing only idea notes
4. **User switches to different tab** (e.g., Habits) →
   - Pills disappear
   - Filter resets to 'all'
5. **User returns to Notes tab** →
   - Pills reappear
   - "All" pill is active again (reset behavior)

## Behavior

### Conditional Visibility
- Pills **only** appear when `tab === 'Notes'`
- Hidden on all other tabs (Habits, To-Dos, Journal, People)

### Filter Scope
- Works **in conjunction** with existing scope selector (Everywhere/Spaces/Unassigned)
- Subfilter applies to whichever scope is selected
- Example: "Work Space" + "Ideas" filter = idea notes in Work space only

### Automatic Reset
- Filter resets to 'all' when switching away from Notes tab
- Ensures consistent experience when returning to Notes
- Prevents confusing filtered views on other tabs

### Load Dependency
- Added `notesSubfilter` to load() useCallback dependencies
- Changing filter triggers data reload with new subtypes
- Smooth transition between filtered views

## TestIDs

All pills have testIDs for automated testing:
- `notes-filter-all`
- `notes-filter-idea`
- `notes-filter-list`
- `notes-filter-reference`

## Acceptance Criteria

✅ **Pills filter the Notes tab without affecting other tabs**
- Pills only visible on Notes tab
- Other tabs unchanged

✅ **All shows all note subtypes**
- Displays idea + list + reference notes
- Default state when viewing Notes

✅ **Individual pills filter to specific subtype**
- Ideas pill → idea notes only
- Lists pill → list notes only
- Reference pill → reference notes only

✅ **Filter resets when leaving Notes tab**
- Switching tabs resets to 'all'
- Clean state on return

## Integration Points

### Works With
- **Scope Selector**: Filters within selected scope
- **Search**: Pills + search work together
- **Unsorted Banner**: Banner appears regardless of pill filter
- **Needs Sorting Section**: Shows ai_placed items across all filters

### Data Flow
1. User selects pill → `setNotesSubfilter(value)`
2. State change triggers load() (via dependency)
3. load() builds subtypes array based on filter
4. repo.listByType('note', { ...scopeOpts, subtypes })
5. Results filtered by repo query
6. UI updates with filtered items

## Technical Notes

### Performance
- No performance concerns - filter is server-side via repo query
- Pills don't add computational overhead
- State updates trigger single load() call

### Accessibility
- TouchableOpacity provides native touch feedback
- Clear visual distinction between active/inactive states
- Text labels are readable (13px font, 600 weight)

### Future Enhancements
- Could add count badges to pills (e.g., "Ideas (12)")
- Could persist last-selected filter in AsyncStorage
- Could add animation on pill selection
- Could support multi-select (e.g., Ideas + Lists)

## Git Status

**Committed as**: `feat(hub): add Notes subfilter pills (All | Ideas | Lists | Reference)`
- 1 file changed: 96 insertions(+), 2 deletions(-)
- Modified: `app/tabs/HubScreen.tsx`

## Visual Design

```
┌─────────────────────────────────────┐
│ Hub                                 │
│                                     │
│ [Everywhere ▼]                      │
│                                     │
│ [Habits] [To-Dos] [Journal] [Notes] │ ← Main tabs
│                                     │
│ ┌───┐ ┌─────┐ ┌─────┐ ┌──────────┐│ ← Pills (Notes tab only)
│ │All│ │Ideas│ │Lists│ │Reference││
│ └───┘ └─────┘ └─────┘ └──────────┘│
│   ^active    inactive              │
│                                     │
│ [Search the Hub...]                 │
│                                     │
│ 🌀 3 Unsorted items — Review       │
│                                     │
│ ✅ My Morning Routine              │
│ 🔔 Buy groceries                   │
│ 📝 Project ideas                   │
└─────────────────────────────────────┘
```

## Summary

Successfully implemented Notes subfilter pills that provide quick filtering within the Notes tab. Pills are contextual (only appear on Notes), integrate seamlessly with existing scope/search filters, and automatically reset when switching tabs. The feature enhances note organization without adding complexity to other tab views.
