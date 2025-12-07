# Phase 6: "+ Add to Space" Flow – Implementation Complete

## Summary

Implemented a proper "+ Add to Space" flow on the Space screen that mirrors the Add-to-Today MindDrop on the Now/Today screen. Items are now attached to the current Space (rather than forced to "today" scoping).

## Files Created

### 1. `lib/spaces/useSpaceQuickAdd.ts`
- Hook for quick-adding items to a Space via MindDrop pipeline
- Similar to `useNowQuickAdd` but:
  - Attaches new entities to the specified space via `space_id`
  - Does NOT automatically set `due_day` to today (lets AI/heuristics decide)
- Supports optimistic UI flow with `onStart`/`onComplete`/`onError` callbacks
- Uses fire-and-forget pattern for immediate UI response

### 2. `components/spaces/SpaceQuickAddModal.tsx`
- Large bottom sheet modal for quick adding items to a Space
- Features:
  - MindDrop header asset
  - Space name displayed ("Add to [Space Name]")
  - Text input with submit button
  - "Manual add" link for opening UnifiedOverlayV2 with prefilled text
- Fire-and-forget pattern: closes immediately on submit, pipeline runs in background

### 3. `components/spaces/AttachExistingModal.tsx`
- Modal for attaching existing unattached items to a Space
- Features:
  - Filter pills: All / Todos / Habits / Notes
  - FlatList of unattached items (space_id is null)
  - Tap to attach item to current space
  - Success toast feedback
  - Empty state message

## Files Modified

### 4. `app/spaces/SpaceHomeScreen.tsx`
- Added imports for new components and hooks
- Added state: `showQuickAddModal`, `showAttachExistingModal`, `optimisticQuickAdd`
- Added `useSpaceQuickAdd` hook
- Added handlers:
  - `handleQuickAddSubmit`: Fire-and-forget MindDrop submission
  - `handleQuickAddManual`: Opens UnifiedOverlayV2 with prefilled text
  - `handleAttachExistingComplete`: Refreshes space data after attach
- Added UI:
  - "+ Add to Space" card below "Captured in this Space" header
  - "Attach existing item" link below the card
  - Rendered `SpaceQuickAddModal` and `AttachExistingModal`

### 5. `lib/minddrop/pipelineStages.ts`
- Added `spaceId?: string | null` to `StageAParams` interface
- Destructured `spaceId` in `runMindDropStageAClassification` (ready for future use)

### 6. `app/screens/CatchAllNotepad.tsx`
- Added `spaceId?: string | null` to `saveToUnsortedTray` options
- Passes `space_id: spaceId ?? null` to note creation baseInput

## How It Works

### Quick Add Flow
1. User taps "+ Add to Space" card on SpaceHomeScreen
2. SpaceQuickAddModal opens with text input
3. User types and taps "Add"
4. Modal closes immediately (optimistic UI)
5. `useSpaceQuickAdd.onQuickAdd(text)` fires:
   - Calls `saveToUnsortedTray` with `spaceId` to create unsorted note
   - Calls `runMindDropStageAClassification` to classify intent
   - Converts to proper entity type (todo/habit/note) with `space_id` set
   - Calls `runMindDropStageBPrefill` for AI refinement
6. Entity appears in Space with proper type and attachment

### Manual Add Flow
1. User taps "Manual add" link in SpaceQuickAddModal
2. Opens UnifiedOverlayV2 in create mode with:
   - `spaceId` set to current space
   - `initialText` prefilled from modal input
3. User selects type and fills in details
4. Saves entity with `space_id` attached

### Attach Existing Flow
1. User taps "Attach existing item" link
2. AttachExistingModal opens showing unattached items (space_id = null)
3. User filters by type if needed
4. User taps an item to attach
5. Item's `space_id` is updated to current space
6. Success toast shown, modal can stay open for more attachments
7. On close, SpaceHomeScreen refreshes to show newly attached items

## Key Design Decisions

1. **Fire-and-forget pattern**: Matches NowScreenV1 behavior for snappy UX
2. **No forced due_day**: Unlike Today MindDrop, Space MindDrop lets AI decide if task should be due today
3. **Uses existing pipeline**: Leverages `saveToUnsortedTray` → `runMindDropStageAClassification` → entity conversion
4. **UnifiedOverlayV2 integration**: Manual add opens the gateway overlay, NOT legacy overlays
5. **Attach existing**: Simple flat list with filter pills, one-tap attachment

## Testing

All space-related tests pass:
```
Test Suites: 20 passed
Tests: 198 passed
```

TypeScript compilation passes for all new files.

## Usage

The "+ Add to Space" card appears on any Space screen below the "Captured in this Space" section header. Users can:
- Tap the card to open quick-add modal
- Type and submit for automatic classification
- Use "Manual add" for precise control
- Tap "Attach existing item" to bring in existing unattached entities
