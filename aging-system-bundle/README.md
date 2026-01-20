# Gremly Aging System Bundle

This bundle contains all files related to Gremly's aging/evolution system.

## System Overview

### How Aging Works (Ritual Progress)
- **3 drops + 3 sweeps per day = 1 age up**
- "Drop" = submitting something to Mind Drop
- "Sweep" = completing the evening sweep
- Day boundary is configurable (default 4 AM)
- When ritual is complete, Gremly ages up and a celebration modal shows

### Key Store State (in useGremlyStore.ts)
```typescript
gremlyAge: number;                    // Current age (starts at 0)
gremlyAgeLastIncrementedAt: string;   // When last aged up
dayBoundaryHour: number;              // Hour when day "rolls over" (default 4)
todayRitualDay: string;               // Current ritual day (YYYY-MM-DD)
todayDropsCount: number;              // Drops today (0-3+)
todaySweepsCount: number;             // Sweeps today (0-3+)
todayRitualCompletedAt: string;       // When ritual was completed today
```

### Key Store Actions
```typescript
incrementDropCount()      // Called when user submits to Mind Drop
incrementSweepCount()     // Called when sweep completes
checkAndIncrementAge()    // Checks if 3+3 met, calls RPC to age up
ensureCurrentRitualDay()  // Resets counters if day rolled over
```

### Supabase RPCs (backend)
- `increment_drop_count(p_owner_id, p_ritual_day)` - Atomically increments drops
- `increment_sweep_count(p_owner_id, p_ritual_day)` - Atomically increments sweeps  
- `check_and_increment_gremly_age(p_owner_id, p_ritual_day)` - Checks 3+3 and ages up

## Files in This Bundle

### Celebration/Modal
- `AgeUpCelebrationModal.tsx` - The main modal shown when Gremly ages up
- `AgeUpCelebrationModal.test.tsx` - Tests for the modal
- `CelebrationProvider.tsx` - Provider/context for celebration triggers
- `CelebrationController.ts` - Controller for triggering celebrations
- `Celebration.tsx` - Generic celebration component
- `TodayCelebrationOverlay.tsx` - Today page celebration overlay
- `SweepCelebrationTransition.tsx` - Sweep-specific celebration

### Mascot/Gremlin
- `Mascot-components.tsx` - Main Mascot component (components/mascot/)
- `Mascot-features.tsx` - Mascot feature component (app/features/mascot/)
- `Mascot-features.test.tsx` - Mascot tests
- `MascotIcon.tsx` - Icon wrapper for mascot
- `mascot/` folder - All gremlin image assets

### Haptics
- `haptics.ts` - Expo-haptics wrapper with semantic haptic functions

### Ritual Day Logic
- `ritualDay.ts` - Logic for calculating current ritual day based on boundary hour
- `ritualDay.test.ts` - Tests for ritual day logic

### Store Extracts
- `gremlyAge-store-types.ts` - Type definitions from useGremlyStore
- `gremlyAge-store-actions.ts` - Action implementations from useGremlyStore
- `gremlyAgeActions.test.ts` - Tests for the aging actions

## Gremlin Stage Definitions

Currently there are NO visual stage definitions - Gremly looks the same at all ages.
The age is just a number that increments (0, 1, 2, 3...).

**Opportunity:** Define visual stages/evolution:
- Baby Gremly (age 0-5)
- Child Gremly (age 6-20)  
- Teen Gremly (age 21-50)
- Adult Gremly (age 51-100)
- Elder Gremly (age 100+)

## Assets (mascot/ folder)
- `gremly-mascot.png` - Default mascot
- `morningbriefgremly.png` - Morning brief variant
- `habitgremly.png` - Habit-specific variant
- `sweepcomplete.png` - Sweep celebration pose
- `sweepintrogremly.png` - Sweep intro pose
- `JournalGremly.png` - Journal variant
- Various themed variants (chef, explorer, artist, etc.)
- `gremly_sweep_celebration_small.gif` - Animated celebration

## Haptics Setup
Using `expo-haptics` with wrapper in `lib/haptics.ts`:
```typescript
triggerMedium()   // Medium impact feedback
triggerSuccess()  // Success notification feedback
triggerLight()    // Light impact feedback
```
