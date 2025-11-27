# 📦 Today/NOW Review Bundle - Summary

**Created:** November 26, 2025  
**Location:** `/Users/jameswoolmer/Documents/gremly-mob2/gremly-today-review.zip`  
**Size:** 441 KB  
**Files:** 142 files

---

## ✅ What's Included

### 🎯 Core Screens (6 files)
- ✅ `NowScreenV1.tsx` - Main NOW screen
- ✅ `CatchAllNotepad.tsx` - Mind Drop screen (2,900+ lines)
- ✅ `CatchAllNotepadSimple.tsx` - Simplified variant
- ✅ `TodayScreen.tsx` - Today router
- ✅ `TodayV3View.tsx` - Today V3
- ✅ `TodayV4LanesView.tsx` - Today V4 Lanes

### 🧩 NOW Components (24 files)
All visual components for the NOW screen including:
- Header, progress bar, week indicator
- Item cards (locked, active, future)
- Overwhelm flow (select/plan/focus sheets)
- Sweep bar, popups, vault components

### 🎨 Today Components (17 files)
Legacy Today screen components including:
- Mascot header, section containers
- Habit/todo/suggestion cards
- Celebration overlay
- Sweep drawer and V3 components

### 🔀 Overlay System (24 files)
Complete unified overlay architecture:
- `UnifiedCreateOverlay.tsx` - Main overlay
- `UnifiedOverlayV2.tsx` - V2 implementation
- `useOverlayPrefill.ts` - AI prefill hook
- State management, mappers, forms

### 💧 Mind Drop Pipeline (8 files)
Complete two-stage pipeline:
- **`pipelineStages.ts`** - Stage A + Stage B (600+ lines)
- `backgroundPrefill.ts` - AI enrichment
- `minddropShared.ts` - Utilities
- `buildCanonicalFromMindDrop.ts` - Canonical builder
- Delete helpers, log subtypes, normalization

### 📊 Data Hooks (19 files)
All data loading logic:
- **NOW:** `useNowData.ts`, `nowSelectors.ts`, `useOverwhelmFlow.ts`
- **Today:** `useTodayData.ts`, `useTodayInteractions.ts`
- **Today Hooks:** Commitments, focus card, entries, sweep preview
- **Selectors:** Today data selectors and types

### 🧠 Cortex AI (2 files)
- `cortexDecide.ts` - AI decision engine (900+ lines)
- `router.ts` - Routing logic

### 💾 Repository Layer (5 files)
Complete data access layer:
- `IRepo.ts` - Interface (1,000+ lines)
- `supabase.ts` - Supabase implementation (3,500+ lines)
- `memory.ts` - Memory repo for tests (2,000+ lines)
- `types.ts` - Repository types
- `ISpaceChatRepo.ts` - Space chat interface

### 🔄 Navigation & Providers (4 files)
- `RootNavigator.tsx` - Root stack
- `TabNavigator.tsx` - Bottom tabs
- `RepoProvider.tsx` - Repository context
- `AuthProvider.tsx` - Auth context

### ⚙️ Configuration (3 files)
- `lib/env.ts` - Environment variables (300+ lines)
- `src/config/featureFlags.ts` - Feature flags
- `lib/types.ts` - Shared types

### 🪝 Hooks & Events (4 files)
- `useUnifiedOverlayController.ts` - Overlay controller
- `useActionToast.tsx` - Action toast system
- `EventBus.ts` - Event system
- `overlaySaved.ts` - Overlay events

### 🎨 Design System (20 files)
- **UI:** Screen, Box, Text, Input, Button, Chip (6 files)
- **Design System:** Button, Input, Textarea, Card, Icon, Badge, ListItem, Tabs (8 files)

### 🔧 Utilities (6 files)
- Diagnostics: `catchallDebug.ts`, `catchallLogger.ts`
- Telemetry: `catchallLogger.ts`, `overlay.ts`
- Copy/motion helpers

### 🖼️ Assets (1 file)
- `minddrop_header-removebg.png` - Mind Drop header

### 📄 Documentation (2 files)
- **`README.md`** - Complete architecture overview
- **`FILE_MANIFEST.txt`** - Complete file listing

---

## 🚀 Quick Start Guide

### Unzip the Bundle
```bash
cd ~/Downloads  # or wherever you saved it
unzip gremly-today-review.zip
cd gremly-today-review
```

### Key Files to Review First

1. **`README.md`** - Start here for architecture overview
2. **`app/screens/CatchAllNotepad.tsx`** - Mind Drop UI (2,900 lines)
3. **`lib/minddrop/pipelineStages.ts`** - Two-stage pipeline (600 lines)
4. **`lib/now/useNowData.ts`** - NOW data hook (320 lines)
5. **`components/overlay/UnifiedOverlayV2.tsx`** - Overlay system (1,200 lines)

### Architecture Highlights

#### Mind Drop Flow
```
User Input → Unsorted Note
    ↓
Stage A: Classification (pipelineStages.ts)
    - Cortex decides: todo | habit | note
    - Creates canonical entity
    - Sets minddrop_stage = 'classified'
    ↓
Stage B: Prefill (backgroundPrefill.ts)
    - AI compacts title
    - Extracts tags
    - Sets minddrop_stage = 'prefilled'
    ↓
User Opens Overlay → Further edits
```

#### NOW Screen Data Flow
```
useNowData() hook
    ↓
Fetches: todos, habits, logs, completions
    ↓
Selectors: lockedItems, activeItems, futureItems
    ↓
Renders: Cards with checkboxes
    ↓
Interactions: useTodayInteractions() (shared)
    ↓
Opens: UnifiedOverlayV2 for edits
```

---

## 🔍 File Statistics

### Lines of Code (Top 10)
1. `lib/repo/supabase.ts` - 3,500+ lines
2. `app/screens/CatchAllNotepad.tsx` - 2,900+ lines
3. `lib/repo/memory.ts` - 2,000+ lines
4. `components/overlay/UnifiedOverlayV2.tsx` - 1,200+ lines
5. `lib/repo/IRepo.ts` - 1,000+ lines
6. `lib/cortex/cortexDecide.ts` - 900+ lines
7. `lib/minddrop/pipelineStages.ts` - 600+ lines
8. `src/hooks/useActionToast.tsx` - 500+ lines
9. `lib/now/useNowData.ts` - 320+ lines
10. `lib/env.ts` - 300+ lines

### File Types
- **TypeScript/TSX:** 139 files
- **Images:** 1 file (PNG)
- **Markdown:** 2 files

---

## 📋 Complete File Manifest

See `FILE_MANIFEST.txt` for the complete alphabetical listing of all 142 files.

---

## ❓ Common Questions

### How do I replicate the Quick Add button?

1. **Study:** `app/screens/CatchAllNotepad.tsx` (Mind Drop screen)
2. **Pipeline:** `lib/minddrop/pipelineStages.ts` (Stage A + B)
3. **Overlay:** `components/overlay/UnifiedOverlayV2.tsx` (Edit UI)
4. **Hook:** `hooks/useUnifiedOverlayController.ts` (State management)

**Key Pattern:**
- Quick Add should create an unsorted note with `views.minddrop_stage = 'pending'`
- Run Stage A classification immediately (or defer to background)
- Stage B prefill runs in background
- User can edit in overlay before/after AI processing

### What's the difference between NOW and Today screens?

- **NOW V1:** New unified screen (feature flag: `EXPO_PUBLIC_NOW_V1=true`)
- **Today V2:** Legacy screen (default when flags disabled)
- **Today V3/V4:** Experimental variants

All screens share:
- Same data hooks (`useTodayData` / `useNowData`)
- Same interaction logic (`useTodayInteractions`)
- Same overlay system (`UnifiedOverlayV2`)

### How does Mind Drop → Today piping work?

1. Mind Drop creates todos with `due_date` (for "today" or "tomorrow")
2. Mind Drop creates habits with `frequency` ("daily" or "weekly")
3. `useNowData()` / `useTodayData()` queries for items due today
4. Selectors filter and sort items
5. Cards render with checkboxes
6. Completion triggers celebration + state update

---

## 🛠️ Technical Notes

### Feature Flags Used
- `EXPO_PUBLIC_NOW_V1` - Enable NOW screen
- `EXPO_PUBLIC_MIND_DROP_V2` - Enable Mind Drop v2
- `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL` - Enable AI classification
- `EXPO_PUBLIC_UNIFIED_OVERLAY` - Enable unified overlay

### Database Schema
- Todos: `due_date`, `due_time`, `completed_at`
- Habits: `frequency`, `completion_history`
- Notes: `origin: 'catchall'`, `labels: ['catchall']`
- Views: `minddrop_stage`, `ai_pending`, `ai_failed`, `minddrop_prefilled_v1`

### State Management
- **Repository Pattern:** `IRepo` interface with Supabase/Memory implementations
- **Context Providers:** Auth, Repo
- **Hooks:** React hooks for data/interactions
- **Events:** EventBus for cross-component communication

---

**Need Help?** Review the `README.md` for detailed architecture explanations, or examine test files (not included) for usage examples.

**Generated by:** GitHub Copilot  
**Date:** November 26, 2025
