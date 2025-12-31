# Overlay System Bundle

This bundle contains all the core files for the Gremly overlay system (UnifiedOverlayV2).

## Files Included

### 1. Core Overlay Component
- **UnifiedOverlayV2.tsx** - The main overlay component (~8000+ lines)
  - Full-screen bottom sheet overlay for creating/editing todos, habits, notes
  - Handles all entity types with type switching
  - Manages form state, validation, AI prefill
  - Photo attachments, tags, due dates, commitments
  - View mode vs edit mode

### 2. State Management & Context
- **OverlayContext.tsx** - React Context that provides overlay state globally
  - Exports `OverlayProvider` (wraps app) and `useGlobalOverlay` hook
  - Manages: isOpen, selectedItem, entityType, mode (create/edit/view)
  - Provides: openCreate(), openEdit(), close() functions

- **OverlayHost.tsx** - Container component that renders UnifiedOverlayV2
  - Mounted at app root level
  - Listens to OverlayContext and renders overlay when open

### 3. Controller Hooks
- **useOverlayController.ts** - Simplified hook for opening overlay
  - Wraps OverlayContext for easier consumption
  - Used by: SweepFlowScreen, HubScreen, etc.

- **useUnifiedOverlayController.ts** - Full-featured controller hook
  - More comprehensive API for overlay control
  - Type inference helpers

### 4. Utility Hooks
- **useOverlayV2Draft.ts** - Draft persistence hook
  - Saves unsaved text to AsyncStorage
  - Restores drafts when overlay reopens

- **useOverlayPrefill.ts** - AI prefill hook
  - Calls AI to suggest tags, due dates, etc.
  - Runs on first edit of mind drop items

### 5. Example Components That Trigger Overlay

- **UnifiedEntityCard.tsx** - Generic card for todos/habits/notes
  - Takes `onPress` prop that typically calls `overlayController.openEdit()`
  - Used in lists throughout the app

- **NowFocusRow.tsx** - Row component in Now/Today screen
  - Takes `onPress` prop for editing
  - Parent screen (NowScreenV1) handles the openEdit call

- **HubScreen.tsx** - Main hub tab screen
  - Contains multiple lists of todos/habits/notes
  - Calls `overlayController.openEdit({ record })` when items tapped
  - Lines ~555-560, ~755-760, ~1150-1280 show openEdit patterns

- **NowScreenV1.tsx** - Now/Today screen
  - Lines ~474 and ~613 show openEdit calls
  - Opens overlay when todo/habit rows are tapped

## Data Flow

```
User taps card/row
       ↓
Component calls overlayController.openEdit({ record })
       ↓
useOverlayController (hook) → calls context.openEdit()
       ↓
OverlayContext.openEdit() → sets state: isOpen=true, selectedItem=record
       ↓
OverlayHost detects isOpen change
       ↓
OverlayHost renders <UnifiedOverlayV2 />
       ↓
UnifiedOverlayV2 displays with record data
```

## Key Types

```typescript
// From OverlayContext
interface OverlayContextValue {
  isOpen: boolean;
  selectedItem: Todo | Habit | Note | null;
  entityType: 'todo' | 'habit' | 'note' | null;
  mode: 'create' | 'edit' | 'view';
  openCreate: (options?: CreateOptions) => void;
  openEdit: (options: EditOptions) => void;
  close: () => void;
}

// EditOptions shape
interface EditOptions {
  record: Todo | Habit | Note;
  spaceId?: string;
  initialTab?: string;
}
```

## Usage Pattern

```typescript
// In any component that needs to open the overlay:
import { useOverlayController } from '../../hooks/useOverlayController';

function MyComponent() {
  const overlayController = useOverlayController();
  
  const handleTap = (item: Todo) => {
    overlayController.openEdit({ record: item });
  };
  
  return <Card onPress={() => handleTap(todo)} />;
}
```
