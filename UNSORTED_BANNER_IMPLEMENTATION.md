# Unsorted Banner & Review Sheet - Implementation Summary

**Status**: ✅ COMPLETED & COMMITTED

## Overview

Implemented a system to surface AI-placed items (ai_placed=true) that need user confirmation. Distinguishes between "Unsorted" (uncertain AI placements) and "Unassigned" (items without a Space).

## Implementation Details

### 1. UnsortedReviewSheet Component ✅
**File**: `components/UnsortedReviewSheet.tsx`

**Features**:
- Modal sheet UI with rounded top corners
- Header with "🌀 Unsorted Items" title and close button
- Description text explaining items were placed by Gremly AI
- FlatList of unsorted items with:
  - Type icon (✅ habit, 🔔 todo, 📝 note)
  - Item title (condensed from body if needed)
  - Subtype label for notes (journal, idea, list, reference)
  - "Confirm" button per item
- Empty state: "No unsorted items"
- Styled with brand colors (cream cards, deep teal confirm button)

**Props**:
```typescript
{
  items: UnsortedItem[];      // List of unsorted items
  onConfirm: (id: string) => void;  // Callback when item confirmed
  onClose: () => void;         // Callback to dismiss modal
  testID?: string;             // For testing
}
```

**TestIDs**:
- `unsorted-item-{id}` - Each item card
- `confirm-{id}` - Confirm button per item
- `unsorted-close` - Close button

### 2. HubItemCard Updates ✅
**File**: `components/HubItemCard.tsx`

**Changes**:
- **Before**: Showed "🪄 placed by Gremly" text in meta row
- **After**: Shows small `✨ AI` badge next to title
- Badge styling:
  - Background: `colors.periwinkle`
  - Text: White, 10px, bold
  - Padding: 2px vertical, xs horizontal
  - Rounded corners (sm radius)
- Only visible when `item.placedBy === 'ai'`
- TestID: `ai-badge`

### 3. HubScreen Integration ✅
**File**: `app/tabs/HubScreen.tsx`

**New State**:
```typescript
const [unsortedCount, setUnsortedCount] = useState(0);
const [reviewSheetVisible, setReviewSheetVisible] = useState(false);
const [bannerDismissed, setBannerDismissed] = useState(false);
```

**Load Function Updates**:
- Added call to `repo.countUnsorted()` to fetch count
- Count loaded alongside spaces on every refresh
- Banner resets (`setBannerDismissed(false)`) when count reaches 0

**Unsorted Banner**:
- Positioned below search box, above error/loading states
- Shows when `unsortedCount > 0 && !bannerDismissed`
- Background: `colors.periwinkle`
- Text: "🌀 {count} Unsorted items — Review" (singular/plural aware)
- Tapping opens review sheet modal
- Dismiss button (✕) hides banner without opening modal
- TestIDs:
  - `unsorted-banner` - Banner container
  - `unsorted-banner-dismiss` - Dismiss button

**Confirm Handler**:
```typescript
const handleConfirmUnsorted = useCallback(async (id: string) => {
  await repo.update({ id, patch: { ai_placed: false } });
  await load(); // Refresh to update count and lists
}, [repo, load]);
```

**Review Sheet Modal**:
- Implemented as overlay with backdrop
- 70% screen height
- Semi-transparent black backdrop (0.5 opacity)
- Tapping backdrop dismisses modal
- Passes `unsortedItems` (converted from AppRecord to UnsortedItem)
- `toUnsortedItem` helper extracts minimal info (id, type, title, subtype)

**Helper Functions**:
```typescript
const toUnsortedItem = useCallback((item: AppRecord): UnsortedItem => {
  let title = item.title || '';
  if (item.type === 'note' && item.body && !title) {
    title = suggestShortTitle(item.body);
  }
  return {
    id: item.id,
    type: item.type as 'habit' | 'todo' | 'note',
    title: title || 'Untitled',
    subtype: item.type === 'note' ? item.subtype : undefined,
  };
}, []);
```

**Styles Added**:
```typescript
unsortedBanner: { 
  marginTop/Horizontal: spacing.md,
  backgroundColor: colors.periwinkle,
  borderRadius: radii.xl,
  padding: spacing.md,
}
bannerContent: { flexDirection: 'row', justifyContent: 'space-between' }
bannerText: { color: white, fontSize: 15, fontWeight: '600' }
bannerDismiss: { color: white, fontSize: 20 }
modalOverlay: { position: absolute, full screen, justifyContent: flex-end }
modalBackdrop: { absolute, rgba(0,0,0,0.5) }
sheetContainer: { height: 70% }
```

## User Flow

1. **User opens Hub** → `load()` fetches `countUnsorted()`
2. **If count > 0** → Banner appears at top
3. **User taps banner** → Review sheet modal opens
4. **User sees list** → All ai_placed items with type, title, subtype
5. **User taps "Confirm"** → 
   - `handleConfirmUnsorted(id)` called
   - `repo.update({ id, patch: { ai_placed: false } })`
   - `load()` refreshes → count decreases
   - Item disappears from review list
6. **When count reaches 0** → Banner auto-resets for next time
7. **User can dismiss banner** → Hides until next refresh

## Behavior

### Unsorted vs Unassigned
- **Unsorted**: `ai_placed === true` (AI uncertain about placement)
- **Unassigned**: `space_id === null` (item not in any Space)
- These are **independent** - an item can be both, one, or neither

### Banner Dismissal
- Dismissed state is **session-only** (not persisted)
- Resets when count reaches 0
- Reappears on next app launch if items still unsorted

### Phase 7 Scope
- Simple confirm action only (flips `ai_placed` to false)
- No type editing or space moving (deferred to Phase 10+)
- Focus: Surface uncertainty, let user acknowledge

## Testing

**TestIDs Available**:
- `unsorted-banner` - Banner touchable
- `unsorted-banner-dismiss` - Dismiss button
- `unsorted-review-sheet` - Modal container
- `unsorted-item-{id}` - Item card in review sheet
- `confirm-{id}` - Confirm button per item
- `unsorted-close` - Sheet close button
- `ai-badge` - AI badge on HubItemCard

**Manual Testing Checklist**:
- [ ] Banner appears when unsorted items exist
- [ ] Banner shows correct count (singular/plural)
- [ ] Tapping banner opens review sheet
- [ ] Dismiss button hides banner
- [ ] Review sheet lists all unsorted items
- [ ] Confirm button removes item from list
- [ ] Count decreases after confirming
- [ ] Banner disappears when count reaches 0
- [ ] AI badge shows on item cards with ai_placed=true

## Known Issues

### Tests Not Updated ⚠️
- Hub tests reference old tab structure (`tab-catch-all` → `tab-notes`)
- Need to add tests for unsorted banner and review sheet
- See `HUB_TABS_SCOPE_STATUS.md` for full test update plan

## Git Status

**Committed as**: `feat(hub): add unsorted banner and review sheet`
- 3 files changed: 322 insertions(+), 8 deletions(-)
- New file: `components/UnsortedReviewSheet.tsx`
- Modified: `app/tabs/HubScreen.tsx`, `components/HubItemCard.tsx`

## Next Steps

1. **Update Hub Tests** (Priority: High)
   - Fix tab structure references
   - Add unsorted banner tests
   - Add review sheet tests
   - Test confirm flow

2. **User Testing** (Priority: Medium)
   - Verify UX with real unsorted items
   - Check banner visibility and timing
   - Validate confirm action clarity

3. **Phase 10+ Enhancements** (Future)
   - Add type editing in review sheet
   - Add space assignment from review
   - Persist banner dismissal preference
   - Add bulk confirm action
