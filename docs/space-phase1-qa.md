# Space Phase 1 QA Checklist

## Overview

Phase 1 implements the filter bar and section components for SpaceHomeScreen. This document provides manual QA steps to verify the implementation.

## Filter Bar Specification

### Tabs
| Tab | Label | Filter Key |
|-----|-------|------------|
| 1 | All | `all` |
| 2 | Todos | `todos` |
| 3 | Habits | `habits` |
| 4 | Logs | `logs` |
| 5 | Lists | `lists` |

### Styling
- **Active tab**: Moss Green underline (`#2E5540`), Moss Green text, font-weight 600
- **Inactive tab**: No underline, Charcoal 70% text (`rgba(34,34,34,0.7)`), font-weight 500
- **Gap between tabs**: 24px
- **Container padding**: 16px horizontal, 12px vertical

## Section Visibility Matrix

| Filter | Recent Activity | Todos | Habits | Logs/Notes | Lists |
|--------|-----------------|-------|--------|------------|-------|
| All | ✅ | ✅ | ✅ | ✅ | ✅ |
| Todos | ✅ | ✅ | ❌ | ❌ | ❌ |
| Habits | ✅ | ❌ | ✅ | ❌ | ❌ |
| Logs | ✅ | ❌ | ❌ | ✅ | ❌ |
| Lists | ✅ | ❌ | ❌ | ❌ | ✅ |

**Note**: Sections only render if they have items. Empty sections return `null` (except Recent Activity which shows an empty state).

## Manual QA Steps

### 1. Filter Bar Rendering
- [ ] Navigate to any Space
- [ ] Verify filter bar appears below the header
- [ ] Verify all 5 tabs are visible: All, Todos, Habits, Logs, Lists
- [ ] Verify "All" is selected by default (Moss Green underline + text)
- [ ] Verify inactive tabs have Charcoal 70% text

### 2. Filter Switching - Todos
- [ ] Tap "Todos" tab
- [ ] Verify Todos tab becomes active (underline + green text)
- [ ] Verify Recent Activity section is visible
- [ ] Verify Todos section is visible (if space has todos)
- [ ] Verify Habits section is NOT visible
- [ ] Verify Logs/Notes section is NOT visible
- [ ] Verify Lists section is NOT visible

### 3. Filter Switching - Habits
- [ ] Tap "Habits" tab
- [ ] Verify Habits tab becomes active
- [ ] Verify Recent Activity section is visible
- [ ] Verify Habits section is visible (if space has habits)
- [ ] Verify Todos section is NOT visible
- [ ] Verify Logs/Notes section is NOT visible
- [ ] Verify Lists section is NOT visible

### 4. Filter Switching - Logs
- [ ] Tap "Logs" tab
- [ ] Verify Logs tab becomes active
- [ ] Verify Recent Activity section is visible
- [ ] Verify Logs/Notes section is visible (if space has logs/notes)
- [ ] Verify Todos section is NOT visible
- [ ] Verify Habits section is NOT visible
- [ ] Verify Lists section is NOT visible

### 5. Filter Switching - Lists
- [ ] Tap "Lists" tab
- [ ] Verify Lists tab becomes active
- [ ] Verify Recent Activity section is visible
- [ ] Verify Lists section is visible (if space has lists)
- [ ] Verify Todos section is NOT visible
- [ ] Verify Habits section is NOT visible
- [ ] Verify Logs/Notes section is NOT visible

### 6. Filter Switching - All
- [ ] Tap "All" tab
- [ ] Verify All tab becomes active
- [ ] Verify all sections with content are visible

### 7. Section Interactions
- [ ] Tap an item in Recent Activity → verify overlay opens
- [ ] Tap a todo → verify overlay opens
- [ ] Tap the checkbox on a todo → verify completion (confetti)
- [ ] Tap a habit → verify overlay opens
- [ ] Tap the + button on a habit → verify progress logged
- [ ] Tap a log/note → verify overlay opens
- [ ] Tap a list → verify overlay opens

### 8. Empty States
- [ ] In a Space with no items, verify Recent Activity shows empty state
- [ ] In a Space with no todos, verify Todos section doesn't render (not even header)
- [ ] Same for Habits, Logs/Notes, Lists

### 9. Layout Branches
- [ ] Test filter bar in v33 layout (default)
- [ ] Test filter bar in v22 layout (if EXPO_PUBLIC_SPACE_V22=on)
- [ ] Test filter bar in legacy layout (if not v3/v22)

## Known Limitations

1. **Recent Activity always shows**: Even when empty, it displays an empty state rather than hiding
2. **Lists detection**: Uses `is_list === true` OR `subtype === 'list'` to identify lists
3. **Logs/Notes filtering**: Excludes items with `is_list` or `subtype === 'list'`

## Test Coverage

Automated tests: `__tests__/spaces/SpaceHomeScreen.sections.test.tsx`
- Filter bar renders with 5 tabs
- Default selection is "All"
- Filter → section visibility for each tab
