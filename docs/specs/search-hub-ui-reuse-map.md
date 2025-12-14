# Search/Hub UI Component Reuse Map

> Created: December 14, 2025  
> Branch: `Hub-Search-page-december-revamp`

This document lists existing components the Hub/Search feature should reuse to ensure UI consistency and reduce duplication.

---

## 1. Item Card/Row Components

### HubItemCard (Primary - Currently in Use)

**Path:** `components/HubItemCard.tsx`

**Props:**
```typescript
interface HubItemCardProps {
  item: {
    id: string;
    kind: 'habit' | 'todo' | 'note';
    title: string;
    note?: string;
    date?: string;              // ISO or pretty format
    placedBy?: 'ai' | 'user';   // Shows sparkle badge when 'ai'
    tags?: Tag[];               // Up to 2 displayed
    spaceName?: string;         // Shown when scope is "Everywhere"
    showSpaceChip?: boolean;
    spaceId?: string | null;
    private?: boolean;          // Lock icon for private logs
  };
  onPress?: () => void;
  onMove?: () => void;
  showMove?: boolean;
  onSpacePress?: (spaceId: string) => void;
  testID?: string;
}
```

**Use case:** Hub list view for habits, todos, notes

---

### UnifiedEntityCard (Alternative - Unified Today/Space card)

**Path:** `components/entities/UnifiedEntityCard.tsx`

**Props:**
```typescript
interface UnifiedEntityCardProps {
  entity: UnifiedEntityRecord;    // Todo | Habit | Note with entityType field
  onPress: () => void;
  onToggleComplete?: () => void;
  showCheckbox?: boolean;         // true for todos
  showProgressBar?: boolean;      // true for habits
  showTypeChip?: boolean;
  isFirst?: boolean;              // hides top divider
  completed?: boolean;
  habitProgress?: { done: number; target: number };
  onLogProgress?: () => void;
  subtitle?: string;
  testID?: string;
}
```

**Use case:** Alternative card with accent bars and progress tracking

---

### TodayTodoCard

**Path:** `components/today/TodayTodoCard.tsx`

**Props:**
```typescript
interface TodayTodoCardProps {
  id: string;
  title: string;
  dueTime?: string;
  tags?: string[];
  spaceName?: string;
  overdue?: boolean;              // Red left border
  nearDue?: boolean;              // Periwinkle left border + glow
  grouped?: boolean;              // In space group display
  onComplete: (id: string) => void;
  onLongPress?: (id: string) => void;
  reducedMotion?: boolean;
}
```

**Use case:** Today screen todo cards with urgency indicators

---

### TodayHabitCard

**Path:** `components/today/TodayHabitCard.tsx`

**Props:**
```typescript
interface TodayHabitCardProps {
  id: string;
  name: string;
  dueWindow?: string;
  streakCount?: number;
  tags?: string[];
  spaceName?: string;
  onComplete: (id: string) => void;
  onLongPress?: (id: string) => void;
  reducedMotion?: boolean;
}
```

**Use case:** Today screen habit cards with streak display

---

### TodayRow (v3 Compact Row)

**Path:** `components/today/v3/TodayRow.tsx`

**Props:**
```typescript
interface Props {
  id: string;
  lane: 'habit' | 'todo';
  title: string;
  dueTime?: string | null;
  habitProgress?: { done: number; target: number } | null;
  onComplete: (id: string) => Promise<void> | void;
  testID?: string;
  onPress?: (id: string) => void;
}
```

**Use case:** Compact row for Today v3 lanes view

---

## 2. Chip/Filter Components

### Chip (Base Component)

**Path:** `components/ui/Chip.tsx`

**Props:**
```typescript
interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;
  disabled?: boolean;
}
```

**Use case:** Generic selectable chip (tabs, filters, badges)

---

### SegmentedTabs

**Path:** `components/SegmentedTabs.tsx`

**Props:**
```typescript
interface Props {
  value: 'Habits' | 'To-Dos' | 'Journal' | 'Notes' | 'Lists' | 'People';
  onChange: (tab: Tab) => void;
  tabs?: Tab[];  // Defaults to all tabs
}
```

**Use case:** Hub main navigation tabs

---

### ScopeSelector

**Path:** `components/ScopeSelector.tsx`

**Props:**
```typescript
interface ScopeSelectorProps {
  selectedScope: {
    type: 'everywhere' | 'space' | 'unassigned';
    spaceId?: ID;
    label: string;
    icon?: string;
  };
  spaces: Space[];
  onChange: (scope: ScopeOption) => void;
}
```

**Use case:** Space/scope filtering dropdown

---

## 3. Tag Filter Bars

### TagFilterBar (Name-based - Preferred)

**Path:** `components/tags/TagFilterBar.tsx`

**Props:**
```typescript
interface Props {
  selected: string[];           // Normalized names (#tag, *tag, @person)
  available: string[];          // All available tag names
  onChange: (next: string[]) => void;
  tagLoading?: boolean;
  stablePlaceholder?: boolean;  // Prevents placeholder flicker
  allowSearch?: boolean;        // Enable text input search
  testID?: string;
}
```

**Use case:** Tag filtering with text search input (currently used in Hub)

---

### TagFilterBar (ID-based - Legacy)

**Path:** `components/filters/TagFilterBar.tsx`

**Props:**
```typescript
interface Props {
  tags: Tag[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onClearAll?: () => void;
  testID?: string;
}
```

**Use case:** Legacy tag filtering by ID (prefer name-based version)

---

## 4. Empty States

### EmptyState

**Path:** `components/EmptyState.tsx`

**Props:**
```typescript
interface EmptyStateProps {
  title: string;                // e.g., "No To-Dos yet"
  subtitle?: string;            // e.g., "Start small. Add one thing for today."
  icon?: React.ReactNode;       // Optional mascot or emoji
  style?: ViewStyle;
  testID?: string;              // Defaults to "empty-state"
}
```

**Use case:** Empty list states across all tabs

**Suggested titles by tab:**
- Habits: "No habits yet" / "Build your first habit today"
- To-Dos: "All caught up!" / "Nice work, nothing due"
- Journal: "No journal entries" / "Start writing to reflect"
- Notes: "No notes yet" / "Capture ideas as they come"
- Lists: "No lists yet" / "Create shopping or packing lists"
- People: "No people yet" / "Add people to tag in your entries"

---

## 5. Overlay Open Handlers

### useOverlayController (Feature-flagged wrapper)

**Path:** `hooks/useOverlayController.ts`

**Usage:**
```typescript
const overlayController = useOverlayController();

// Create new item
overlayController.openCreate({
  type?: 'habit' | 'todo' | 'note';
  spaceId?: string | null;
  logSubtype?: 'idea' | 'list' | 'reference' | 'journal' | null;
  defaultDueToday?: boolean;
  conversionMeta?: {
    initialTitle?: string;
    initialNote?: string;
    initialTags?: string[];
    initialDueDate?: string;
  };
});

// Edit existing item
overlayController.openEdit({
  record: AppRecord;
  spaceId?: string | null;
});

// View item (read-only)
overlayController.openView({
  record: AppRecord;
  spaceId?: string | null;
  fromChat?: boolean;  // Opens in preview mode
});

// Close overlay
overlayController.close();
```

---

### useUnifiedOverlayController (Direct hook)

**Path:** `hooks/useUnifiedOverlayController.ts`

Same API as `useOverlayController`, bypasses feature flag. Use when unified overlay is guaranteed.

---

### OverlayContext (Global provider)

**Path:** `contexts/OverlayContext.tsx`

**Provider:** Wrap app in `<OverlayProvider>` to enable global overlay state.

**Hook:** `useGlobalOverlay()` for accessing overlay state from any component.

**State shape:**
```typescript
interface OverlayState {
  visible: boolean;
  mode: 'create' | 'edit' | 'view';
  initialEntity?: {
    type: EntityType | null;
    id?: string;
    logSubtype?: LogSubtype | null;
  };
  initialSpaceId?: string | null;
  conversionMeta?: ConversionMeta;
  entity?: AppRecord;
  views?: Record<string, any>;
  defaultDueToday?: boolean;
}
```

---

## 6. Recommended Component for Hub Revamp

| Feature | Component to Use | Notes |
|---------|-----------------|-------|
| Item list | `HubItemCard` | Already in use, supports all entity types |
| Tab navigation | `SegmentedTabs` | Already in use |
| Scope dropdown | `ScopeSelector` | Already in use |
| Tag filtering | `TagFilterBar` (tags/) | Name-based, supports search |
| Empty states | `EmptyState` | Generic, pass custom title/subtitle |
| Open overlay | `useOverlayController` | Handles create/edit/view |
| Chip UI | `Chip` | For custom filter chips |

---

## 7. Additional Components to Consider

### UnsortedReviewSheet

**Path:** `components/UnsortedReviewSheet.tsx`

**Props:**
```typescript
interface Props {
  visible: boolean;
  onClose: () => void;
  items: UnsortedItem[];
  onAssign: (item: UnsortedItem, spaceId: string) => void;
  onDismiss: (item: UnsortedItem) => void;
}
```

**Use case:** Bottom sheet for reviewing AI-sorted items

---

### PeopleList

**Path:** `components/people/PeopleList.tsx`

**Props:**
```typescript
interface Props {
  people: PersonWithCounts[];
  onPress: (person: Person) => void;
  onEdit?: (person: Person) => void;
}
```

**Use case:** People tab list rendering
