# MindDrop Voice Input Bundle

This bundle contains all relevant code for implementing voice input in the MindDrop system.

## Directory Structure

### 1-ui-layer/
The main MindDrop UI components:
- **CatchAllNotepad.tsx** - Main MindDrop screen with input field, mic button area, "Drop to Gremly" button
- **NowQuickAddModal.tsx** - Quick add modal for Today's Focus
- **SpaceQuickAddModal.tsx** - Quick add modal for Spaces
- **useMindDropSubmit.ts** - Core hook that handles "Drop to Gremly" submission logic
- **useNowQuickAdd.ts** - Wrapper hook for Today-scoped quick adds

### 2-state-management/
Zustand store and MindDrop pipeline:
- **useGremlyStore.ts** - Main Zustand store (todos, habits, notes, pending items)
- **selectors.ts** - Store selectors
- **minddrop-pipeline/** - Complete MindDrop classification/enrichment pipeline:
  - `phase1.ts` - Immediate heuristic + AI classification
  - `phase2.ts` - Background AI enrichment (tags, due dates, etc.)
  - `heuristicClassify.ts` - Fast local classification
  - `types.ts` - MindDrop-specific types
  - `photoDrop.ts` - Photo attachment handling
  - `photoUpload.ts` - Photo upload to Supabase storage

### 3-api-layer/
API client and configuration:
- **CortexClient.ts** - Typed client for Supabase Edge Function (cortex-proxy)
- **cortex-index.ts** - Main cortex exports
- **env.ts** - Environment variable readers
- **supabase-client.ts** - Supabase client setup

### 4-backend/
Supabase Edge Function (AI proxy):
- **cortex-proxy.ts** - The edge function that proxies OpenAI calls securely
- **edge-env.d.ts** - Deno edge function types
- **CLOUDFLARE_WORKER_CONTRACT.md** - API contract documentation

### 5-types-schemas/
Core type definitions:
- **types.ts** - Main app types (Todo, Habit, Note, Space, etc.)
- **database.types.ts** - Auto-generated Supabase types
- **minddrop-types.ts** - MindDrop-specific types (buckets, classification, etc.)

### 6-existing-patterns/
Patterns to follow for UI/UX consistency:
- **useActionToast.tsx** - Toast notification system for feedback
- **notifications.ts** - Push notification permission handling
- **ToastUndo.tsx** - Toast with undo action
- **AuthProvider.tsx** - Auth state + push notification registration
- **featureFlags.ts** - Feature flag patterns

### 7-config/
App configuration:
- **app.json** - Expo config with permissions
- **.env.example** - Environment variables needed
- **tsconfig.json** - TypeScript config
- **babel.config.js** - Babel config

### 8-ui-primitives/
UI components and styling:
- **design-system/** - Core design system components (Button, Input, Icon, etc.)
- **Icon.tsx** - Icon component
- **theme-tokens.ts** - Design tokens (colors, spacing, etc.)
- **theme-typography.ts** - Typography styles

## Key Flows

### "Drop to Gremly" Flow
1. User types in CatchAllNotepad input field
2. User taps "Drop to Gremly →" button
3. `useMindDropSubmit.submit()` is called
4. Phase 1: Immediate heuristic classification + optimistic UI
5. Phase 1: API call to cortex-proxy for AI classification confirmation
6. Entity created (todo/habit/note) in Zustand store → synced to Supabase
7. Phase 2: Background enrichment (tags, due dates) via cortex-proxy
8. Entity updated with enriched fields

### Quick Add Flow (Today/Spaces)
1. User taps "+" button on Today or Space screen
2. Modal opens (NowQuickAddModal or SpaceQuickAddModal)
3. User types and taps "Drop to Gremly →"
4. Same pipeline as above, but with `source: 'today'` or `source: 'space'`
5. For `source: 'today'`: due_day auto-set to today

### Voice Input (To Implement)
The voice input should integrate at the CatchAllNotepad level:
1. Add mic button next to input field
2. On tap: request microphone permission, start recording
3. On release/stop: transcribe audio → insert into input field
4. User can edit, then tap "Drop to Gremly →"

## Environment Variables Needed
```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_CORTEX_URL=https://xxx.supabase.co/functions/v1/cortex-proxy
```

## Permissions (app.json)
Voice input will need microphone permission:
```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSMicrophoneUsageDescription": "Allow Gremly to capture voice notes"
      }
    },
    "android": {
      "permissions": ["RECORD_AUDIO"]
    }
  }
}
```
