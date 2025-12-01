# Classification Review Bundle

This bundle contains all files related to the classification system and data model in the Gremly mobile app.

## Contents

### 1. Classification Pipeline (Mind Drop + Cortex AI)

**Mind Drop Pipeline** - Two-stage processing:
- `lib/minddrop/pipelineStages.ts` - Stage A (classification) & Stage B (enrichment)
- `lib/minddrop/backgroundPrefill.ts` - Background AI prefill for entities
- `lib/minddrop/buildCanonicalFromMindDrop.ts` - Canonical entity builder
- `lib/minddrop/minddropShared.ts` - Shared utilities
- `lib/minddrop/normalizeTodoTitle.ts` - Todo title normalization
- `lib/minddrop/logSubtypeTags.ts` - Log subtype detection
- `lib/minddrop/deleteHelpers.ts` - Cleanup & deletion helpers

**Cortex AI Classification Engine**:
- `lib/cortex/cortexDecide.ts` - **Main classification entry point**
- `lib/cortex/classifyLogSubtype.ts` - Log subtype classification
- `lib/cortex/textNormalization.ts` - Text parsing & field extraction
- `lib/cortex/thresholds.ts` - Confidence thresholds
- `lib/cortex/persona/prompt.ts` - AI prompt templates
- `lib/cortex/intents/*` - Intent detection & classification
- `lib/cortex/policy/*` - Heuristics & decision policies

**Tag Extraction**:
- `lib/tags/extractTagsAI.ts` - AI-based tag extraction
- `lib/tags/quality.ts` - Tag quality filtering
- `lib/tags/themes.ts` - Theme detection

### 2. Data Model

**TypeScript Types**:
- `lib/types.ts` - Core entity types (Todo, Habit, Note, LogSubtype, etc.)
- `types/supabase.ts` - Supabase schema types
- `lib/canonical.ts` - Canonical type system

**Repository Layer**:
- `lib/repo/IRepo.ts` - Repository interface
- `lib/repo/supabase.ts` - Supabase implementation
- `providers/RepoProvider.tsx` - Repository provider context

**Database Migrations**:
- `supabase/migrations/20251122000000_phase13_add_views_jsonb.sql` - Views JSONB support
- `supabase/migrations/20251110_convert_or_create_from_drop.sql` - Drop conversion functions
- `supabase/migrations/20251024000001_add_habit_subtype.sql` - Habit subtype support
- Plus 10+ other migrations for todos, habits, notes, tags, RLS policies

### 3. Entry Points

**Mind Drop (Primary Classification Entry)**:
- `app/screens/CatchAllNotepad.tsx` - Mind Drop screen (main UI)
- `app/components/minddrop/MidConfidenceChips.tsx` - Category selection chips

**Manual Overlay (Secondary Entry)**:
- `components/overlay/UnifiedOverlayV2.tsx` - Manual creation overlay
- `components/overlay/fields/TodoFields.tsx` - Todo creation form
- `components/overlay/fields/HabitFields.tsx` - Habit creation form
- `components/overlay/fields/NoteFields.tsx` - Note/Log creation form

**Quick Add**:
- `app/screens/NowScreenV1.tsx` - Now/Today page with quick add
- `lib/now/useNowQuickAdd.ts` - Quick add hook

**Conversion Helpers**:
- `lib/conversion.ts` - Entity type conversion (note→todo, note→habit, etc.)

### 4. Post-Classification Flow

**Recent Drops Display**:
- Recent drops rendering in `app/screens/CatchAllNotepad.tsx` (lines 1700+)
- Visual state detection (`getMindDropVisualState`)

**Sweep Candidates**:
- `lib/today/sweepSelectors.ts` - Sweep candidate selection logic
- `lib/today/hooks/useSweepPreview.ts` - Sweep preview hook

**Type Change Handling**:
- Type change logic in `components/overlay/UnifiedOverlayV2.tsx`
- `buildCanonicalFromMindDrop` for re-classification

**Re-classification Triggers**:
- Handled in overlay when title/fields change
- Stage B prefill can re-run enrichment

### 5. Tests

**Mind Drop Integration Tests** (20+ test files):
- `__tests__/minddrop-pipeline.integration.test.ts` - Full pipeline tests
- `__tests__/minddrop-ui-rendering.test.tsx` - UI rendering tests
- `__tests__/minddrop-fallback-retry.test.ts` - Retry logic
- `__tests__/minddrop.tag.quality.integration.test.ts` - Tag quality
- Plus unit tests for all Mind Drop utilities

**Cortex Tests**:
- `lib/cortex/intents/__tests__/` - Intent detection tests
- `__tests__/cortex/openAiEngine.prompt-polish.test.ts` - Prompt tests

**Overlay Tests**:
- `components/overlay/__tests__/overlay.list.autoCreate.test.tsx`
- `__tests__/note-fields.test.tsx`
- `__tests__/todo-fields.test.tsx`

### 6. Documentation (50+ markdown files)

**Mind Drop Architecture**:
- `MINDDROP_ARCHITECTURE_README.md` - Overall architecture
- `MINDDROP_V3_PHASE_4B_TWO_STAGE_PIPELINE.md` - Two-stage pipeline design
- `DEPENDENCY_GRAPH.md` - Full system dependency graph

**Classification System**:
- `CATCHALL_PIPELINE_FLOW.md` - Pipeline flow diagrams
- `AI_CLASSIFICATION_TYPE_FIELD_FIX.md` - Classification type handling
- `MULTI_INTENT_DETECTION.md` - Multi-intent handling
- `CANONICAL_INTENT_CHIP_SUPPRESSION.md` - Intent chip logic

**Phase Documentation**:
- `MINDDROP_V3_PHASE6_SUMMARY.md` - Phase 6 telemetry & retry
- `PHASE_2A_BACKGROUND_PREFILL_COMPLETE.md` - Background prefill implementation
- `PHASE_1A_DELETE_BY_DROPID_COMPLETE.md` - Cleanup & deletion

**Data Model Docs**:
- `DB_SCHEMA_CONFORMANCE.md` - Schema documentation
- `TODAY_NOW_MINDDROP_DATA_FLOWS.md` - Data flow diagrams

**Tag System**:
- `AI_TAG_EXTRACTION_IMPLEMENTATION_COMPLETE.md`
- `TAG_SYSTEM_OVERHAUL_COMPLETE.md`
- `JUNK_TAG_PREVENTION_TESTS.md`

**Log System**:
- `LOG_SUBTYPE_AI_INTEGRATION.md`
- `LOG_KIND_DETECTION_L1.md`
- `LOG_KIND_EXAMPLES.md`

## How to Build the Bundle

```bash
# From the repo root
./scripts/buildClassificationReviewBundle.sh
```

## Output

- **Folder**: `classification_review_bundle/` (preserves directory structure)
- **Zip**: `classification_review_bundle.zip` (in repo root)

## File Organization in Bundle

The bundle preserves the original directory structure:

```
classification_review_bundle/
├── lib/
│   ├── minddrop/
│   │   ├── pipelineStages.ts
│   │   ├── backgroundPrefill.ts
│   │   └── ...
│   ├── cortex/
│   │   ├── cortexDecide.ts
│   │   ├── intents/
│   │   └── ...
│   ├── tags/
│   ├── repo/
│   └── ...
├── app/
│   ├── screens/CatchAllNotepad.tsx
│   └── ...
├── components/
│   └── overlay/
│       └── UnifiedOverlayV2.tsx
├── supabase/
│   └── migrations/
├── __tests__/
└── *.md (documentation)
```

## Key Files to Review First

If you're new to the classification system, start here:

1. **`DEPENDENCY_GRAPH.md`** - Overall system architecture
2. **`lib/cortex/cortexDecide.ts`** - Main AI classification entry point
3. **`lib/minddrop/pipelineStages.ts`** - Two-stage pipeline (Stage A: classify, Stage B: enrich)
4. **`app/screens/CatchAllNotepad.tsx`** - Mind Drop UI & orchestration
5. **`MINDDROP_ARCHITECTURE_README.md`** - Mind Drop design philosophy
6. **`CATCHALL_PIPELINE_FLOW.md`** - Visual pipeline diagrams

## Classification Flow Summary

```
User Input (Mind Drop)
  ↓
cortexDecide() - AI intent classification
  ↓
Stage A (pipelineStages.ts)
  - Create entities (todo/habit/log)
  - Set minddrop_stage = 'classified'
  ↓
Stage B (backgroundPrefill.ts) - Background
  - AI enrichment (tags, title, subtype)
  - Set minddrop_stage = 'prefilled'
  ↓
Entity appears in canonical view
  (Today for todos, Habits tab for habits, Logs for notes)
```

## Questions?

For questions about specific files or flows, refer to:
- `DEPENDENCY_GRAPH.md` for component relationships
- Individual `MINDDROP_*.md` files for feature-specific docs
- Test files for usage examples
