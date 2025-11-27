# Gremly Today/NOW Page & Mind Drop Pipeline - Review Bundle

**Generated:** November 26, 2025  
**Purpose:** Complete archive of all files influencing the Today/NOW page and Mind Drop → Today piping

---

## 📁 Structure

### 🖥️ Screen Components
- **`app/screens/NowScreenV1.tsx`** - Main NOW screen (feature flag: `EXPO_PUBLIC_NOW_V1`)
- **`app/screens/CatchAllNotepad.tsx`** - Mind Drop input & classification screen
- **`app/screens/CatchAllNotepadSimple.tsx`** - Simplified Mind Drop variant
- **`app/tabs/TodayScreen.tsx`** - Today screen router (decides which variant to show)
- **`app/tabs/TodayV3View.tsx`** - Today V3 variant
- **`app/tabs/TodayV4LanesView.tsx`** - Today V4 Lanes variant

### 🧩 NOW Components (`components/now/`)
All UI components for the NOW screen:
- Header, progress bar, week indicator, mascot
- Item cards (locked, active, future)
- Overwhelm flow (select/plan/focus)
- Sweep bar, progress popup, week popup
- Vault summary components

### 🎨 Today V2 Components (`components/today/`)
Legacy Today screen components:
- Mascot header, section containers
- Habit/todo/suggestion cards
- Celebration overlay
- Sweep drawer (`v3/SweepDrawer.tsx`)

### 🔀 Overlay System (`components/overlay/`)
Unified create/edit overlay for all entity types:
- **`UnifiedCreateOverlay.tsx`** - Main overlay component
- **`UnifiedOverlayV2.tsx`** - V2 implementation
- **`useOverlayPrefill.ts`** - AI prefill hook
- State management, mapping, feedback, form components

### 💧 Mind Drop Components (`components/minddrop/`)
- **`MidConfidenceChips.tsx`** - Category selection chips

### 📊 Data Layer

#### NOW Data (`lib/now/`)
- **`useNowData.ts`** - Main NOW data hook (loads todos/habits/progress)
- **`useOverwhelmFlow.ts`** - Overwhelm flow state machine
- **`nowSelectors.ts`** - Data selectors
- **`nowTypes.ts`** - Type definitions

#### Today Data (`lib/today/`)
- **`useTodayData.ts`** - Main Today data hook
- **`useTodayInteractions.ts`** - Shared interaction logic (used by both NOW and Today)
- **`copy.ts`** - Text/greeting helpers
- **`motion.ts`** - Animation config
- **`hooks/`** - Commitments, focus card, entries, sweep preview, drop zone

#### Mind Drop Pipeline (`lib/minddrop/`)
**TWO-STAGE ARCHITECTURE:**
- **`pipelineStages.ts`** - Stage A (Classification) + Stage B (Prefill)
  - **Stage A:** Intent detection → entity creation (todo/habit/note)
  - **Stage B:** AI enrichment (title compaction, tags)
- **`backgroundPrefill.ts`** - Background AI enhancement
- **`minddropShared.ts`** - Shared utilities
- **`buildCanonicalFromMindDrop.ts`** - Canonical entity builder

### 🧠 Cortex AI (`lib/cortex/`)
- **`cortexDecide.ts`** - AI decision engine
- **`router.ts`** - Cortex routing logic

### 💾 Repository Layer (`lib/repo/`)
- **`IRepo.ts`** - Repository interface
- **`supabase.ts`** - Supabase implementation
- **`memory.ts`** - Memory implementation (for tests)
- **`types.ts`** - Repository types

### 🔄 Conversion (`lib/conversion/`)
Functions to convert between entity types (unsorted → todo/habit/log)

### 🗂️ Navigation
- **`navigation/RootNavigator.tsx`** - Root stack
- **`navigation/TabNavigator.tsx`** - Bottom tabs

### 🪝 Hooks
- **`hooks/useUnifiedOverlayController.ts`** - Overlay state controller

### 📦 Providers
- **`providers/RepoProvider.tsx`** - Repository context
- **`providers/AuthProvider.tsx`** - Authentication context

### ⚙️ Configuration
- **`lib/env.ts`** - Environment variables & feature flags
- **`src/config/featureFlags.ts`** - Feature flag definitions

### 🎯 Action Toast
- **`src/hooks/useActionToast.tsx`** - Inline action toast system

### 📐 Selectors (`selectors/today/`)
- Today-specific data selectors and types

### 🎨 Design System
- **`ui/`** - Base UI components
- **`design-system/`** - Design system primitives

### 🖼️ Assets
- **`assets/minddrop_header-removebg.png`** - Mind Drop header image

---

## 🔑 Key Concepts

### NOW Screen Architecture
1. **Feature Flag:** `EXPO_PUBLIC_NOW_V1=true` enables NOW screen
2. **Data Hook:** `useNowData()` loads all TODAY data (todos, habits, progress)
3. **Interactions:** Shared via `useTodayInteractions()` (same as Today V2)
4. **Overlay:** Uses `UnifiedOverlayV2` for create/edit operations

### Mind Drop Pipeline
1. **User Input** → Unsorted note created
2. **Stage A (Classification):**
   - Cortex classifies intent (todo/habit/note)
   - Creates canonical entity
   - Sets `views.minddrop_stage = 'classified'`
3. **Stage B (Prefill - Background):**
   - AI compacts title
   - Extracts tags
   - Sets `views.minddrop_stage = 'prefilled'`
4. **User Opens Overlay** → Further edits possible

### Data Flow: Mind Drop → Today
- Mind Drop creates todos with `due_date` and habits with `frequency`
- These appear in Today/NOW screens via `useNowData()` / `useTodayData()`
- Selectors filter by time window (today, this week, etc.)
- Cards rendered with checkboxes → completion triggers celebration

### Overlay System
- **Controller:** `useUnifiedOverlayController()` manages state
- **Modes:** `create` | `edit` | `view`
- **Entities:** Supports todos, habits, notes, logs, lists, persons
- **Prefill:** `useOverlayPrefill()` runs AI enhancement on first open
- **AI Freeze:** Prevents re-enrichment after user edits

---

## 🚀 Quick Reference

### Enable NOW Screen
```bash
EXPO_PUBLIC_NOW_V1=true
```

### Mind Drop Feature Flags
```bash
EXPO_PUBLIC_MIND_DROP_V2=true
EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL=true
```

### Key Files to Review
1. **Pipeline Logic:** `lib/minddrop/pipelineStages.ts`
2. **NOW Data:** `lib/now/useNowData.ts`
3. **Today Data:** `lib/today/useTodayData.ts`
4. **Overlay:** `components/overlay/UnifiedOverlayV2.tsx`
5. **Mind Drop UI:** `app/screens/CatchAllNotepad.tsx`

---

## 📝 Notes

- All NOW components reuse Today interactions via `useTodayInteractions()`
- Mind Drop Stage A and Stage B are independent (can retry separately)
- Overlay prefill only runs ONCE per entity (tracked via `views.minddrop_prefilled_v1`)
- Repository layer abstracts Supabase (can swap to Memory for tests)

---

**For Questions:** Review the implementation files or run tests in `tests/now/` and `__tests__/minddrop-*`
