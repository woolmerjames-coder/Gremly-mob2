# Classification Review Bundle - Complete File List

**Bundle Created**: December 1, 2025  
**Total Files**: 215  
**Bundle Size**: 3.0 MB (740 KB zipped)  
**Location**: `classification_review_bundle.zip`

---

## 1. CLASSIFICATION PIPELINE (57 files)

### Mind Drop Pipeline Core
- `lib/minddrop/pipelineStages.ts` - **Stage A (Classification) & Stage B (Enrichment)**
- `lib/minddrop/backgroundPrefill.ts` - Background AI enrichment
- `lib/minddrop/minddropShared.ts` - Shared utilities
- `lib/minddrop/buildCanonicalFromMindDrop.ts` - Canonical entity builder
- `lib/minddrop/normalizeTodoTitle.ts` - Title normalization
- `lib/minddrop/logSubtypeTags.ts` - Log subtype detection
- `lib/minddrop/deleteHelpers.ts` - Cleanup & deletion
- `lib/minddrop/USAGE_EXAMPLE.ts` - Usage examples

### Mind Drop Tests (5 files)
- `lib/minddrop/__tests__/minddropShared.test.ts`
- `lib/minddrop/__tests__/buildCanonicalFromMindDrop.test.ts`
- `lib/minddrop/__tests__/deleteHelpers.test.ts`
- `lib/minddrop/__tests__/archiveItemsByDropId.test.ts`
- `lib/minddrop/__tests__/zombiePrevention.test.ts`

### Cortex AI Classification (14 files)
- `lib/cortex/cortexDecide.ts` - **Main AI classification entry point**
- `lib/cortex/index.ts`
- `lib/cortex/thresholds.ts` - Confidence thresholds
- `lib/cortex/classifyLogSubtype.ts` - Log subtype classification
- `lib/cortex/textNormalization.ts` - Text parsing & field extraction
- `lib/cortex/canonicalMap.ts` - Canonical type mapping
- `lib/cortex/smalltalk.ts` - Smalltalk detection
- `lib/cortex/summarize.ts` - Summarization
- `lib/cortex/router.ts` - Request routing
- `lib/cortex/lane.ts` - Lane-based routing
- `lib/cortex/explain.ts` - Explanation generation
- `lib/cortex/CortexClient.ts` - OpenAI client
- `lib/cortex/diag.ts` - Diagnostics
- `lib/cortex/learn.ts` - Learning system

### Cortex Persona & Prompts (2 files)
- `lib/cortex/persona/prompt.ts` - **AI prompt templates**
- `lib/cortex/persona/refine.ts` - Prompt refinement

### Cortex Context (1 file)
- `lib/cortex/context/summary.ts` - Context summarization

### Cortex Intents (8 files)
- `lib/cortex/intents/canonicalIntent.ts` - Canonical intent resolution
- `lib/cortex/intents/classifyIntentWithAI.ts` - AI-based intent classification
- `lib/cortex/intents/multiIntentDetector.ts` - Multi-intent detection
- `lib/cortex/intents/detectIntent.ts` - Intent detection orchestrator
- `lib/cortex/intents/types.ts` - Intent type definitions
- `lib/cortex/intents/intentRules.ts` - Heuristic rules
- `lib/cortex/intents/__tests__/classifyIntentWithAI.test.ts`
- `lib/cortex/intents/__tests__/canonicalIntent.test.ts`

### Cortex Policy & Heuristics (4 files)
- `lib/cortex/policy/chips.ts` - Chip suggestion policy
- `lib/cortex/policy/listHeuristics.ts` - List detection heuristics
- `lib/cortex/policy/ideaHeuristics.ts` - Idea detection heuristics
- `lib/cortex/policy/withHeuristicWhy.ts` - Explanation helpers

### Cortex Tests (1 file)
- `lib/cortex/__tests__/cortexDecide.list.autoCreate.test.ts`

### Tag Extraction (14 files)
- `lib/tags/extractTagsAI.ts` - **AI-based tag extraction**
- `lib/tags/extractTags.ts` - Tag extraction orchestrator
- `lib/tags/normalize.ts` - Tag normalization
- `lib/tags/quality.ts` - Tag quality filtering
- `lib/tags/themes.ts` - Theme detection
- `lib/tags/constants.ts` - Tag constants
- `lib/tags/getEffectiveTags.ts` - Effective tags resolver
- `lib/tags/parseSearch.ts` - Search parsing
- `lib/tags/search.ts` - Tag search
- `lib/tags/__tests__/extractTagsAI.test.ts`
- `lib/tags/__tests__/quality.test.ts`
- `lib/tags/__tests__/junkTagPrevention.test.ts`
- `lib/tags/__tests__/getEffectiveTags.test.ts`
- `lib/tags/__tests__/themes.test.ts`
- `lib/tags/__tests__/peopleAndPlaceExtraction.test.ts`

### Log Subtype Detection (1 file)
- `lib/logs/getEffectiveLogSubtype.ts`

---

## 2. DATA MODEL (31 files)

### TypeScript Types (4 files)
- `lib/types.ts` - **Core entity types (Todo, Habit, Note, LogSubtype)**
- `types/supabase.ts` - Supabase schema types
- `types/habit.ts` - Habit-specific types
- `lib/supabase/mappers.ts` - Type mappers

### Canonical Types (1 file)
- `lib/canonical.ts` - Canonical type system

### Schemas & Validation (1 file)
- `lib/schemas.ts` - Zod validation schemas

### Repository Layer (6 files)
- `lib/repo/IRepo.ts` - **Repository interface**
- `lib/repo/supabase.ts` - Supabase implementation
- `lib/repo/memory.ts` - In-memory implementation
- `lib/repo/types.ts` - Repository types
- `lib/repo/adapters/listAdapters.ts` - List adapters
- `lib/repo/ISpaceChatRepo.ts` - Chat repository interface
- `providers/RepoProvider.tsx` - Repository provider context

### Supabase Migrations (17 files)
- `supabase/migrations/20251122000000_phase13_add_views_jsonb.sql` - Views JSONB
- `supabase/migrations/20251117_fix_due_time_timestamp_conversion.sql` - Due time fix
- `supabase/migrations/20251110_convert_or_create_from_drop.sql` - **Drop conversion**
- `supabase/migrations/20251024000001_add_habit_subtype.sql` - Habit subtype
- `supabase/migrations/20251023000007_rls_core_policy.sql` - RLS policies
- `supabase/migrations/20251023000005_fix_people_backfill.sql` - People backfill
- `supabase/migrations/20251023000003_hotfix_from_audit.sql` - Audit hotfix
- `supabase/migrations/20251022000100_sync_notes_metadata.sql` - Notes metadata
- `supabase/migrations/20251022000000_fix_tag_map_columns.sql` - Tag map columns
- `supabase/migrations/20251021_102_cortex_prefs_lists_events.sql` - Cortex prefs
- `supabase/migrations/20251020032702_phase8_entity_people.sql` - Entity people
- `supabase/migrations/20251020032701_phase8_tags_and_map.sql` - **Tags & tag_map**
- `supabase/migrations/20251020000000_fix_entity_people_columns.sql` - People columns
- `supabase/migrations/20251015000001_uuid_compatibility.sql` - UUID compatibility
- `supabase/migrations/20251120_add_log_photos_table_if_missing.sql` - Log photos
- `supabase/migrations/20251025001020_log_idempotency_indices.sql` - Idempotency

### Recurrence (1 file)
- `app/utils/recurrence.ts` - Recurrence detection & parsing

---

## 3. ENTRY POINTS (23 files)

### Mind Drop (CatchAll) (2 files)
- `app/screens/CatchAllNotepad.tsx` - **Mind Drop screen (main entry point)**
- `app/components/minddrop/MidConfidenceChips.tsx` - Category selection chips

### Unified Overlay (Manual Entry) (4 files)
- `components/overlay/UnifiedOverlayV2.tsx` - **Unified overlay (create/edit)**
- `components/overlay/UnifiedCreateOverlay.tsx` - Create-only overlay
- `components/overlay/overlayV2.state.ts` - Overlay state management
- `hooks/useUnifiedOverlayController.ts` - Overlay controller hook

### Overlay Field Components (4 files)
- `components/overlay/fields/TodoFields.tsx` - Todo creation fields
- `components/overlay/fields/HabitFields.tsx` - Habit creation fields
- `components/overlay/fields/NoteFields.tsx` - Note/Log creation fields
- `components/overlay/fields/HabitFrequency.tsx` - Habit frequency selector

### Overlay Forms (4 files)
- `components/overlay/TodoForm.tsx` - Todo form
- `components/overlay/HabitStartForm.tsx` - Start habit form
- `components/overlay/HabitBreakForm.tsx` - Break habit form
- `components/overlay/HabitsTab.tsx` - Habits tab

### Quick Add / Now Page (5 files)
- `app/screens/NowScreenV1.tsx` - **Now/Today page**
- `lib/now/useNowData.ts` - Now page data hook
- `lib/now/useNowQuickAdd.ts` - Quick add hook
- `lib/now/nowTypes.ts` - Now page types
- `lib/now/nowSelectors.ts` - Now page selectors

### Conversion Helpers (1 file)
- `lib/conversion.ts` - **Entity type conversion (note→todo, note→habit)**

### Notes Hooks (1 file)
- `lib/notes/useRecentLogs.ts` - Recent logs hook

---

## 4. POST-CLASSIFICATION FLOW (11 files)

### Sweep Selectors (1 file)
- `lib/today/sweepSelectors.ts` - **Sweep candidate selection**

### Today Data & Interactions (2 files)
- `lib/today/useTodayData.ts` - Today page data
- `lib/today/useTodayInteractions.ts` - Today page interactions

### Today Hooks (6 files)
- `lib/today/hooks/useCommitments.ts` - Commitments
- `lib/today/hooks/useFocusCard.ts` - Focus card
- `lib/today/hooks/useTodayEntries.ts` - Today entries
- `lib/today/hooks/useSweepPreview.ts` - Sweep preview
- `lib/today/hooks/useDropZoneSummary.ts` - Drop zone summary
- `lib/today/hooks/useWeeklyHabitStats.ts` - Weekly habit stats

### UI Utilities (1 file)
- `lib/ui/kindToDisplayLabel.ts` - Display label mapping

---

## 5. TESTS (27 files)

### Mind Drop Integration Tests (21 files)
- `__tests__/minddrop-pipeline.integration.test.ts` - **Full pipeline integration**
- `__tests__/minddrop-ui-rendering.test.tsx` - UI rendering tests
- `__tests__/minddrop-fallback-retry.test.ts` - Fallback retry logic
- `__tests__/minddrop-views-state.integration.test.ts` - Views state
- `__tests__/minddrop.tag.quality.integration.test.ts` - Tag quality
- `__tests__/minddrop.aiPending.lifecycle.test.tsx` - AI pending lifecycle
- `__tests__/minddrop.uniqueness.test.tsx` - Uniqueness constraints
- `__tests__/minddrop.habit.notes.test.tsx` - Habit notes field
- `__tests__/minddrop-no-duplication.test.ts` - Deduplication
- `__tests__/minddrop.log.subtype.test.tsx` - Log subtype
- `__tests__/minddrop.narrative.chips.test.tsx` - Narrative chips
- `__tests__/minddrop.autoOverlay.phase2d.test.tsx` - Auto overlay
- `__tests__/minddrop.duplicate-create.test.tsx` - Duplicate prevention
- `__tests__/minddrop.unsorted.aiPending.test.ts` - Unsorted AI pending
- `__tests__/minddrop-pipeline.duplicates.test.ts` - Pipeline duplicates
- `__tests__/minddrop.chip-bubbling.test.tsx` - Chip bubbling
- `__tests__/minddrop.trustbuilders.test.tsx` - Trust builders
- `__tests__/minddrop.ls2.subtype.test.ts` - L2 subtype
- `__tests__/minddrop.tag.fallback.test.tsx` - Tag fallback
- `__tests__/minddrop.card.visual.states.test.tsx` - Visual states
- `__tests__/minddrop.dropid.duplicate.prevention.test.tsx` - Drop ID dedup

### Cortex Tests (1 file)
- `__tests__/cortex/openAiEngine.prompt-polish.test.ts`

### Sweep Tests (2 files)
- `tests/today.v3.sweep.test.tsx` - Today sweep
- `tests/now/now.sweep.test.tsx` - Now sweep
- `tests/minddrop.prompt.time.test.tsx` - Prompt time handling

### Overlay Tests (3 files)
- `__tests__/note-fields.test.tsx` - Note fields
- `__tests__/todo-fields.test.tsx` - Todo fields
- `components/overlay/__tests__/overlay.list.autoCreate.test.tsx` - List auto-create

---

## 6. DOCUMENTATION (62 files)

### Mind Drop Architecture (32 files)
- `MINDDROP_ARCHITECTURE_README.md` - **Overall architecture**
- `MINDDROP_V3_PHASE_4B_TWO_STAGE_PIPELINE.md` - **Two-stage pipeline**
- `MINDDROP_V3_PHASE6_SUMMARY.md` - Phase 6 telemetry & retry
- `MINDDROP_V3_PHASE5_AUDIT.md` - Phase 5 audit
- `MINDDROP_V3_PHASE_4_EXTENDED_VIEWS.md` - Extended views
- `MINDDROP_V3_E2E_TESTS.md` - E2E tests
- `MINDDROP_V3_CATCHALL_FILTER.md` - Catch-All filter logic
- `MINDDROP_V3_CHIP_RENDERING_FIX.md` - Chip rendering fix
- `MINDDROP_V3_UI_REFRESH_FIX.md` - UI refresh fix
- `MINDDROP_V3_NO_DUPLICATION.md` - No duplication design
- `MINDDROP_UI_FIX_COMPLETE.md` - UI fix summary
- `MINDDROP_DEDUPLICATION_COMPLETE.md` - Deduplication implementation
- `MINDDROP_STATE_TRANSITIONS_COMPLETE.md` - State transitions
- `MINDDROP_REALTIME_SYNC_FIX.md` - Realtime sync
- `MINDDROP_DUPLICATE_PREVENTION_COMPLETE.md` - Duplicate prevention
- `MINDDROP_IDEMPOTENCY_COMPLETE.md` - Idempotency
- `MINDDROP_CREATION_REFACTOR_COMPLETE.md` - Creation refactor
- `MINDDROP_HABIT_CREATION_UNIFIED.md` - Habit creation
- `MINDDROP_HABIT_CHIP_FIX_COMPLETE.md` - Habit chip fix
- `MINDDROP_HABIT_NOTES_FIELD_COMPLETE.md` - Habit notes field
- `MINDDROP_LOG_FIX_SUMMARY.md` - Log classification fix
- `MINDDROP_CATEGORY_CHIPS_COMPLETE.md` - Category chips
- `MINDDROP_AI_TAG_OVERRIDE_COMPLETE.md` - AI tag override
- `MINDDROP_TAG_CLEANUP_COMPLETE.md` - Tag cleanup
- `MINDDROP_NOTE_TAG_CLEANUP_COMPLETE.md` - Note tag cleanup
- `MINDDROP_TODO_TAG_CLEANUP_COMPLETE.md` - Todo tag cleanup
- `MINDDROP_TAG_PRESERVATION_COMPLETE.md` - Tag preservation
- `MINDDROP_PREFILL_OWNERSHIP_COMPLETE.md` - Prefill ownership
- `MINDDROP_RAW_TEXT_HELPER_COMPLETE.md` - Raw text helper
- `MINDDROP_SHARED_UTILITIES_COMPLETE.md` - Shared utilities
- `MINDDROP_DUPLICATION_ANALYSIS.md` - Duplication analysis
- `MINDDROP_FIX_GUIDE.md` - Fix guide
- `MIND_DROP_TEST_SUITE.md` - Test suite

### Classification System (8 files)
- `AI_CLASSIFICATION_TYPE_FIELD_FIX.md` - Type field fix
- `CATCHALL_PIPELINE_FLOW.md` - **Pipeline flow diagrams**
- `CATCHALL_CORTEX_REFACTOR.md` - Cortex refactor
- `CATCHALL_PIPELINE_WIRING_COMPLETE.md` - Pipeline wiring
- `MULTI_INTENT_DETECTION.md` - Multi-intent detection
- `MULTI_INTENT_FIX.md` - Multi-intent fix
- `AMBIGUOUS_SOCIAL_PLAN_IMPLEMENTATION.md` - Ambiguous handling
- `CANONICAL_INTENT_CHIP_SUPPRESSION.md` - Intent chip suppression

### Phase Documentation (7 files)
- `PHASE_1A_DELETE_BY_DROPID_COMPLETE.md` - Delete by drop_id
- `PHASE_1B_DUPLICATE_PREVENTION_COMPLETE.md` - Duplicate prevention
- `PHASE_1C_TAG_FILTERING_COMPLETE.md` - Tag filtering
- `PHASE_2A_BACKGROUND_PREFILL_COMPLETE.md` - **Background prefill**
- `PHASE_2B_OVERLAY_AI_REMOVAL_COMPLETE.md` - Overlay AI removal
- `PHASE_2E_NO_AUTO_OPEN_OVERLAY.md` - No auto-open overlay
- `PHASE_4A_TAG_QUALITY_UPGRADE.md` - Tag quality upgrade
- `PHASE_4B_ADDITIVE_THEMES_COMPLETE.md` - Additive themes

### Architecture & Dependencies (2 files)
- `DEPENDENCY_GRAPH.md` - **Full system dependency graph**
- `DB_SCHEMA_CONFORMANCE.md` - Database schema documentation

### Log System (4 files)
- `LOG_SUBTYPE_AI_INTEGRATION.md` - **AI log subtype integration**
- `LOG_KIND_DETECTION_L1.md` - Log kind detection
- `LOG_KIND_EXAMPLES.md` - Log examples
- `LOG_LAYOUT_L2.md` - Log layout

### Tag System (5 files)
- `AI_TAG_EXTRACTION_IMPLEMENTATION_COMPLETE.md` - **AI tag extraction**
- `TAG_EXTRACTION_V3_IMPLEMENTATION.md` - Tag extraction v3
- `TAG_SYSTEM_OVERHAUL_COMPLETE.md` - Tag system overhaul
- `THEME_TAG_IMPLEMENTATION.md` - Theme tags
- `JUNK_TAG_PREVENTION_TESTS.md` - Junk tag prevention

### Overlay (1 file)
- `OVERLAY_TYPE_CHANGE_IMPLEMENTATION.md` - Type change handling

### General (2 files)
- `EXPORT_SUMMARY.md` - Export summary
- `TODAY_NOW_MINDDROP_DATA_FLOWS.md` - **Data flow diagrams**

---

## 7. ENVIRONMENT & CONFIG (4 files)

- `lib/env.ts` - Environment variables
- `.env.example` - Example environment file
- `package.json` - Dependencies
- `tsconfig.json` - TypeScript config

---

## KEY FILES TO START WITH

If reviewing the classification system for the first time, start here:

1. **`DEPENDENCY_GRAPH.md`** - Overall system architecture & data flows
2. **`lib/cortex/cortexDecide.ts`** - Main AI classification entry point (1500 lines)
3. **`lib/minddrop/pipelineStages.ts`** - Two-stage pipeline orchestration (576 lines)
4. **`app/screens/CatchAllNotepad.tsx`** - Mind Drop UI & orchestration (3600+ lines)
5. **`CATCHALL_PIPELINE_FLOW.md`** - Visual pipeline flow diagrams
6. **`MINDDROP_ARCHITECTURE_README.md`** - Mind Drop design philosophy

## CRITICAL IMPLEMENTATION FILES

### Classification Logic
- `lib/cortex/cortexDecide.ts` - AI classification decision making
- `lib/cortex/intents/canonicalIntent.ts` - Intent resolution
- `lib/cortex/persona/prompt.ts` - AI prompt templates

### Pipeline Execution
- `lib/minddrop/pipelineStages.ts` - Stage A (classification) & Stage B (enrichment)
- `lib/minddrop/backgroundPrefill.ts` - Background AI prefill
- `lib/minddrop/buildCanonicalFromMindDrop.ts` - Canonical entity builder

### Entity Creation
- `lib/conversion.ts` - Type conversion (note→todo, note→habit)
- `lib/repo/supabase.ts` - Database operations

### UI Entry Points
- `app/screens/CatchAllNotepad.tsx` - Mind Drop screen
- `components/overlay/UnifiedOverlayV2.tsx` - Manual creation overlay

## DATA FLOW SUMMARY

```
User Input (Mind Drop / Overlay / Quick Add)
  ↓
cortexDecide() - AI classification
  - Intent detection (heuristics + AI)
  - Confidence scoring
  - Action generation (create.todo, create.habit, create.log)
  ↓
Stage A (pipelineStages.ts)
  - Create entities based on classification
  - Set views.minddrop_stage = 'classified'
  - Set drop_id for tracking
  ↓
Stage B (backgroundPrefill.ts) - Background async
  - AI title compaction
  - AI tag extraction
  - Log subtype refinement
  - Set views.minddrop_stage = 'prefilled'
  ↓
Entity appears in canonical view
  - Todos → Today page
  - Habits → Habits tab
  - Logs → Logs / Your Notes
```

---

**Generated**: December 1, 2025  
**Script**: `scripts/buildClassificationReviewBundle.sh`
