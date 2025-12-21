# Sweep Journal Page - Context Bundle for Redesign

> Generated: December 18, 2025
> Purpose: Collect everything needed to edit the Sweep Journal/Mood step

---

## A) Sweep Flow / Navigation Wiring

### Main Screen File
**File:** `app/screens/SweepFlowScreen.tsx`

**What it does:** Main container for the Evening Sweep wizard - a multi-step flow for daily review

**Step Order (lines 1-10):**
```typescript
/**
 * Sweep Flow Screen - Evening Sweep wizard container
 *
 * Full-screen flow for the Evening Sweep ritual:
 * - Step 0: Intro ("Ready to Sweep?")
 * - Step 1: Decision cards
 * - Step 2: Mood check-in      <-- THIS IS THE JOURNAL STEP
 * - Step 3: Wrap up / habits
 * - Step 4: Summary/celebration
 */
```

**Step Rendering (lines 1341-1349):**
```typescript
{step === 0 && <SweepIntroStep onStart={handleIntroStart} />}
{step === 1 && (
  <SweepDecisionStep onFinished={handleDecisionFinished} onClose={handleClose} />
)}
{step === 2 && <SweepMoodStep onContinue={handleMoodContinue} />}  // <-- JOURNAL STEP
{step === 3 && <SweepHabitsStep onContinue={handleWrapUpContinue} />}
{step === 4 && (
  <SweepSummaryStep keptCount={keptCount} clearedCount={clearedCount} onDone={handleSummaryDone} />
)}
```

**Step Navigation Handlers (lines 1252-1260):**
```typescript
const handleIntroStart = () => {
  setStep(1); // go to Decision cards
};

const handleMoodContinue = () => {
  setStep(3); // Mood → Wrap-up / Habits
};

const handleWrapUpContinue = () => {
  setStep(4); // Wrap-up → Summary
};

const handleDecisionFinished = (summary: SweepSummary) => {
  // Update local state for Summary step display
  setKeptCount(summary.kept);
  setClearedCount(summary.cleared);
  // ...
  setStep(2); // Decision → Mood
};
```

### Navigation Registration
**File:** `navigation/RootNavigator.tsx`

```typescript
import SweepFlowScreen from '../app/screens/SweepFlowScreen';

// Route definition (line 33):
Sweep: undefined;

// Screen registration (lines 89-93):
<Stack.Screen
  name="Sweep"
  component={SweepFlowScreen}
  options={{ headerShown: false, presentation: 'card', gestureEnabled: false }}
/>
```

---

## B) Existing Journal Step UI (SweepMoodStep)

### Location
**File:** `app/screens/SweepFlowScreen.tsx`
**Component:** `SweepMoodStep` (lines 219-357)

### Props Interface
```typescript
interface StepProps {
  onContinue: () => void;
}
```

### Component Structure (lines 219-357)
```typescript
function SweepMoodStep({ onContinue }: StepProps) {
  // Use store's createNote mutation
  const createNote = useGremlyStore((state) => state.createNote);
  const [selectedMood, setSelectedMood] = useState<MoodValue | null>(null);
  const [journalText, setJournalText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleContinue = useCallback(async () => {
    // If nothing to save, just continue
    if (!selectedMood && !journalText.trim()) {
      onContinue();
      return;
    }

    setIsSaving(true);
    try {
      // Create a journal note for the sweep reflection using store mutation
      await createNote({
        subtype: 'journal',
        title: journalText.trim() || `Evening reflection`,
        body: journalText.trim() || undefined,
        mood: selectedMood ?? undefined,
        origin: 'manual',
        canonicalType: 'log',
        journal_subtype: 'reflection',
        tags: ['reflection', 'sweep'],
        views: {
          sweep_origin: true,
          sweep_reflection: true,
          sweep_date: new Date().toISOString().split('T')[0],
        },
      });
    } catch (error) {
      console.warn('[SweepMoodStep] Failed to save reflection:', error);
    } finally {
      setIsSaving(false);
      onContinue();
    }
  }, [createNote, selectedMood, journalText, onContinue]);

  const handleSkip = useCallback(() => {
    // Skip without saving anything
    onContinue();
  }, [onContinue]);

  // ... render JSX
}
```

### Mood Options (lines 91-98)
```typescript
type MoodValue = 'happy' | 'neutral' | 'sad' | 'ecstatic' | 'low' | 'tired';

const SWEEP_MOOD_OPTIONS: Array<{ value: MoodValue; label: string; icon: string }> = [
  { value: 'ecstatic', label: 'Great', icon: 'Sun' },
  { value: 'happy', label: 'Good', icon: 'CheckCircle2' },
  { value: 'neutral', label: 'Okay', icon: 'Minus' },
  { value: 'low', label: 'Low', icon: 'TrendingDown' },
  { value: 'tired', label: 'Tired', icon: 'Moon' },
  { value: 'sad', label: 'Rough', icon: 'Cloud' },
];
```

### UI Structure (JSX at lines 265-357)
- KeyboardAvoidingView wrapper
- ScrollView with mood header section
- 2x3 Grid of mood buttons with icons
- Journal text input area
- Continue button (calls `handleContinue`)
- Skip button (calls `handleSkip`)

### Styles for SweepMoodStep (lines 1520-1690)
Key style names:
- `moodStepContainer`
- `moodHeaderSection`
- `moodStepTitle`
- `moodStepSubcopy`
- `moodGridContainer`
- `moodGrid`
- `moodButton` / `moodButtonSelected` / `moodButtonPressed`
- `moodButtonLabel` / `moodButtonLabelSelected`
- `moodJournalContainer`
- `moodJournalLabel`
- `moodJournalInput`
- `moodButtonContainer`
- `moodContinueButton` / `moodContinueButtonContent` / `moodContinueButtonDisabled` / `moodContinueButtonText`
- `moodSkipButton` / `moodSkipButtonText`

---

## C) Zustand Store Slice(s)

### Main Store
**File:** `lib/store/useGremlyStore.ts`

**Creation (line 1):**
```typescript
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
```

### Relevant Actions Used by Journal Step:
```typescript
// createNote - used to save the reflection journal entry
const createNote = useGremlyStore((state) => state.createNote);
```

### Sweep-Related Selectors
**File:** `lib/store/selectors.ts`

```typescript
// Lines 567-661: selectSweepCandidatesUnified
export const selectSweepCandidatesUnified = createSelector(
  [selectTodos, selectNotes, selectSpaces],
  (todos, notes, spaces): Array<{ candidate: SweepCandidate; meta: SweepCardMeta }> => {
    // ... filtering and sorting logic
  },
);

// Lines 681-687: selectRecentJournals
export const selectRecentJournals = createSelector([selectJournals], (journals): Note[] => {
  const sevenDaysAgo = getDaysAgoDayString(7);
  return journals
    .filter((j) => j.created_at?.split('T')[0] >= sevenDaysAgo)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
});

// Hook exports (lines 1104-1112):
export const useSweepCandidates = () => useGremlyStore(selectSweepCandidates);
export const useSweepCandidatesUnified = () => useGremlyStore(selectSweepCandidatesUnified);
export const useRecentJournals = () => useGremlyStore(selectRecentJournals);
```

### Persistence
- Uses Supabase directly via `supabase` client
- No local persistence middleware visible
- Sweep completion stored in `cortex_preferences.last_sweep_completed_at`

---

## D) Data/Query for Recent Entries Since Last Sweep

### Last Sweep Timestamp
**File:** `lib/sweep/engine.ts` (lines 42-68)

```typescript
export async function getLastSweepCompletedAt(
  ownerId: string,
  client: SupabaseClient<Database>,
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from('cortex_preferences')
      .select('last_sweep_completed_at')
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (error) {
      console.error('[Sweep] Failed to get last_sweep_completed_at:', error);
      return null;
    }

    return data?.last_sweep_completed_at ?? null;
  } catch (error) {
    console.error('[Sweep] Unexpected error in getLastSweepCompletedAt:', error);
    return null;
  }
}
```

### Marking Sweep Complete
**File:** `lib/sweep/engine.ts`

```typescript
import { markSweepCompleted } from '../../lib/sweep/engine';

// Called in SweepFlowScreen (lines 1267-1272):
if (user?.id) {
  markSweepCompleted(user.id, supabase, summary).catch((err) => {
    console.error('Failed to mark sweep as completed', err);
  });
}
```

### Intro Stats - Activity Since Last Sweep
**File:** `lib/sweep/introStats.ts`

**Data Shape (lines 14-37):**
```typescript
export interface SweepIntroItem {
  id: string;
  name: string;
  type: 'todo' | 'habit' | 'note';
}

export interface SweepIntroStats {
  /** Items completed since last sweep */
  completed: {
    todos: SweepIntroItem[];
    habits: SweepIntroItem[];
  };
  /** Items created/dropped since last sweep */
  dropped: {
    todos: SweepIntroItem[];
    habits: SweepIntroItem[];
    notes: SweepIntroItem[];
  };
  /** Whether this is the user's first sweep (no last_sweep_completed_at) */
  isFirstSweep: boolean;
  /** The cutoff timestamp used for queries */
  cutoffTimestamp: string;
}
```

**Fetch Function (lines 47-150):**
```typescript
export async function fetchSweepIntroStats(
  ownerId: string,
  client: SupabaseClient<Database>,
): Promise<SweepIntroStats>
```

**Hook for Intro Stats:**
**File:** `lib/sweep/useSweepIntroStats.ts`

---

## E) Overlay / Navigation to Open an Entry

### Overlay Context
**File:** `contexts/OverlayContext.tsx`

**Key Interface (lines 63-69):**
```typescript
interface OverlayContextValue {
  state: OverlayState;
  openCreate: (options?: CreateOptions) => void;
  openEdit: (options: EditOptions) => void;
  openView: (options: EditOptions) => void;
  close: () => void;
}
```

**Edit Options (lines 55-59):**
```typescript
interface EditOptions {
  record: AppRecord;
  spaceId?: string | null;
  fromChat?: boolean; // Opens notes in preview mode when true
}
```

### Usage in SweepFlowScreen
```typescript
import { useOverlayController } from '../../hooks/useOverlayController';
import { useGlobalOverlay } from '../../contexts/OverlayContext';

// Get overlay controller
const overlayController = useOverlayController();
const overlay = useGlobalOverlay();

// Open edit mode for an item
overlay.openEdit({ record: fullRecord, spaceId: null });
```

### Overlay Controller Hook
**File:** `hooks/useOverlayController.ts`

---

## F) Brand Tokens / Components

### Primary Brand Tokens
**File:** `design/brand.ts`

```typescript
export const BRAND = {
  colors: {
    // Core palette
    mossGreen: '#2E5540',        // Primary
    sageMist: '#BFD8C0',         // Secondary
    periwinkleSmoke: '#9CA6E0',  // Accent (sparingly)
    goldenPear: '#E0C47A',       // Highlight / Success
    linenCream: '#F9F6F1',       // Background (Light)
    deepForest: '#1A3328',       // Background (Dark)
    charcoalInk: '#222222',      // Text (Light)

    // Neutrals / utilities
    inkSubtle: 'rgba(34, 34, 34, 0.7)',
    inkMuted: 'rgba(34, 34, 34, 0.55)',
    surface: '#FFFFFF',
    borderSubtle: 'rgba(0,0,0,0.08)',
  },

  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 18,
    '2xl': 24,
    pill: 999,
  },

  elevation: {
    one: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    two: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  },

  typography: {
    header: { fontFamily: 'PlusJakartaSans-Bold' },
    subhead: { fontFamily: 'PlusJakartaSans-SemiBold' },
    body: { fontFamily: 'Inter-Regular' },
    bodyMedium: { fontFamily: 'Inter-Medium' },
    italic: { fontFamily: 'Inter-Italic' },
  },
} as const;
```

### Extended Tokens
**File:** `design/tokens.ts`

```typescript
export const lightTokens = {
  colors: {
    bg: '#FFFDF8',
    surface: '#FFFFFF',
    text: '#0E1116',
    subtle: '#6A6F76',
    primary: '#2E5540',
    onPrimary: '#F9F6F1',
    // ... more colors
  },
  spacing: [0, 4, 8, 12, 16, 20, 24, 32] as const,
  radius: [0, 6, 12, 16, 20] as const,
  typography: {
    fontFamily: {
      regular: 'Inter-Regular',
      medium: 'Inter-Medium',
      bold: 'PlusJakartaSans-Bold',
    },
    size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, '2xl': 32 },
    lineHeight: { tight: 1.1, snug: 1.25, normal: 1.4, relaxed: 1.6 },
  },
  elevation: { none: {...}, sm: {...}, md: {...}, lg: {...} },
};
```

### Reusable UI Components

**Button:**
- **File:** `ui/Button.tsx`
- Variants: `primary | neutral | danger | ghost`
- Sizes: `sm | md | lg`

**Chip:**
- **File:** `ui/Chip.tsx`
- Props: `label`, `selected`, `onPress`

**Text:**
- **File:** `ui/Text.tsx`

**Screen:**
- **File:** `ui/Screen.tsx`

**Design System Components:**
- **Directory:** `design-system/`
- Files: `Button.tsx`, `Card.tsx`, `Badge.tsx`, `Input.tsx`, `Textarea.tsx`, `ListItem.tsx`, `Tabs.tsx`, `Icon.tsx`

---

## G) Icons + Mascot Assets

### Icon Component (Lucide Wrapper)
**File:** `design-system/Icon.tsx`

```typescript
import * as Icons from 'lucide-react-native';

export interface IconProps {
  /** Icon name from lucide-react-native */
  name: keyof typeof Icons;
  /** Icon size */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Icon color */
  color?: string;
  /** Stroke width */
  strokeWidth?: number;
}

const sizeMap = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 40,
};

// Usage:
<Icon name="Sun" size="sm" color={BRAND.colors.mossGreen} strokeWidth={1.8} />
```

### Icons Used in Mood Step
From `SWEEP_MOOD_OPTIONS`:
- `Sun` - Great mood
- `CheckCircle2` - Good mood
- `Minus` - Okay mood
- `TrendingDown` - Low mood
- `Moon` - Tired mood
- `Cloud` - Rough mood

Other icons in SweepFlowScreen:
- `ArrowRight` - Continue button
- `ChevronLeft` - Back navigation
- `Sparkles` - Header mode indicator
- `X` - Close button
- `Check` - Habit completion

### Mascot Assets
**Directory:** `assets/mascot/`

**Available images:**
- `gremly-mascot.png` - Standard mascot
- `fistbumpgremly.png` - Celebration/intro pose
- `JournalGremly.png` - Journal-specific pose
- `Gremlychat.png` - Chat pose
- `clipboardgremly.png` - Clipboard pose
- `gremlywaving.png` - Waving pose
- `astrogremly.png` - Astronaut pose
- `spaceschatchair.png` - Chair pose
- `running-removebg.png` - Running pose

**Import pattern (from SweepFlowScreen):**
```typescript
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT = require('../../assets/mascot/gremly-mascot.png');
const GREMLY_MASCOT_CELEBRATE = require('../../assets/mascot/fistbumpgremly.png');

// Usage:
<Image
  source={GREMLY_MASCOT_CELEBRATE}
  style={styles.introMascotImage}
  resizeMode="contain"
/>
```

---

## H) File List Summary

### Core Files to Edit
1. `app/screens/SweepFlowScreen.tsx` - Main file containing `SweepMoodStep`

### Supporting Files (Reference Only)
2. `navigation/RootNavigator.tsx` - Route registration
3. `lib/store/useGremlyStore.ts` - Zustand store
4. `lib/store/selectors.ts` - Sweep selectors
5. `lib/sweep/engine.ts` - Sweep business logic
6. `lib/sweep/types.ts` - Type definitions
7. `lib/sweep/introStats.ts` - Stats since last sweep
8. `contexts/OverlayContext.tsx` - Overlay controller
9. `design/brand.ts` - Brand tokens
10. `design/tokens.ts` - Design tokens
11. `design-system/Icon.tsx` - Icon component
12. `ui/Button.tsx` - Button component
13. `ui/Chip.tsx` - Chip component

### Asset Files
14. `assets/mascot/JournalGremly.png` - Journal-specific mascot
15. `assets/mascot/gremly-mascot.png` - Standard mascot
16. `assets/mascot/fistbumpgremly.png` - Celebration mascot

---

## I) NOT FOUND Items

The following searched terms had no direct matches or were not explicitly implemented:

- `JournalSlide` - NOT FOUND (component is called `SweepMoodStep`)
- `SweepJournal` - NOT FOUND (component is called `SweepMoodStep`)
- `ReflectionSlide` - NOT FOUND (component is called `SweepMoodStep`)
- Separate "recent entries since last sweep" component in journal step - NOT FOUND (only exists in intro stats)

---

## J) Quick Reference - Key Line Numbers in SweepFlowScreen.tsx

| Item | Lines |
|------|-------|
| File header/step docs | 1-10 |
| MoodValue type | 87 |
| SWEEP_MOOD_OPTIONS | 91-98 |
| SweepMoodStep component | 219-357 |
| handleContinue (save reflection) | 226-260 |
| handleSkip | 262-265 |
| Mood JSX render | 267-357 |
| Step state & setStep | 1194 |
| handleMoodContinue | 1256 |
| Step rendering switch | 1341-1349 |
| moodStepContainer style | 1522 |
| All mood styles | 1520-1690 |
