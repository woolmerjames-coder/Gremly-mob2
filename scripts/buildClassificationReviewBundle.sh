#!/usr/bin/env bash

###############################################################################
# Classification Review Bundle Builder
#
# Creates classification_review_bundle.zip containing all files related to:
# - AI classification pipeline (Mind Drop, Cortex)
# - Data model (todos, habits, notes/logs)
# - Entry points (Mind Drop, UnifiedOverlay, Quick Add)
# - Post-classification flows (Recent Drops, Sweep, Type Changes)
# - Documentation
#
# Usage:
#   chmod +x scripts/buildClassificationReviewBundle.sh
#   ./scripts/buildClassificationReviewBundle.sh
#
# Output:
#   classification_review_bundle.zip in repo root
###############################################################################

set -e  # Exit on error

BUNDLE_DIR="classification_review_bundle"
BUNDLE_ZIP="classification_review_bundle.zip"

echo "🔍 Building Classification Review Bundle..."
echo ""

# Clean up previous bundle
if [ -d "$BUNDLE_DIR" ]; then
  echo "🧹 Removing existing bundle directory..."
  rm -rf "$BUNDLE_DIR"
fi

if [ -f "$BUNDLE_ZIP" ]; then
  echo "🧹 Removing existing bundle zip..."
  rm -f "$BUNDLE_ZIP"
fi

echo "📁 Creating bundle directory..."
mkdir -p "$BUNDLE_DIR"

echo ""
echo "📦 Copying files..."
echo ""

# Function to copy a file preserving directory structure
copy_file() {
  local src="$1"
  if [ -f "$src" ]; then
    local dest="$BUNDLE_DIR/$src"
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
    echo "  ✓ $src"
  else
    echo "  ⚠️  MISSING: $src"
  fi
}

###############################################################################
# 1. CLASSIFICATION PIPELINE
###############################################################################

echo "1️⃣  CLASSIFICATION PIPELINE"
echo ""

# Mind Drop Pipeline
copy_file "lib/minddrop/pipelineStages.ts"
copy_file "lib/minddrop/backgroundPrefill.ts"
copy_file "lib/minddrop/minddropShared.ts"
copy_file "lib/minddrop/buildCanonicalFromMindDrop.ts"
copy_file "lib/minddrop/normalizeTodoTitle.ts"
copy_file "lib/minddrop/logSubtypeTags.ts"
copy_file "lib/minddrop/deleteHelpers.ts"
copy_file "lib/minddrop/USAGE_EXAMPLE.ts"

# Mind Drop Tests
copy_file "lib/minddrop/__tests__/minddropShared.test.ts"
copy_file "lib/minddrop/__tests__/buildCanonicalFromMindDrop.test.ts"
copy_file "lib/minddrop/__tests__/deleteHelpers.test.ts"
copy_file "lib/minddrop/__tests__/archiveItemsByDropId.test.ts"
copy_file "lib/minddrop/__tests__/zombiePrevention.test.ts"

# Cortex AI Classification
copy_file "lib/cortex/cortexDecide.ts"
copy_file "lib/cortex/index.ts"
copy_file "lib/cortex/thresholds.ts"
copy_file "lib/cortex/classifyLogSubtype.ts"
copy_file "lib/cortex/textNormalization.ts"
copy_file "lib/cortex/canonicalMap.ts"
copy_file "lib/cortex/smalltalk.ts"
copy_file "lib/cortex/summarize.ts"
copy_file "lib/cortex/router.ts"
copy_file "lib/cortex/lane.ts"
copy_file "lib/cortex/explain.ts"
copy_file "lib/cortex/CortexClient.ts"
copy_file "lib/cortex/diag.ts"
copy_file "lib/cortex/learn.ts"

# Cortex Persona & Prompts
copy_file "lib/cortex/persona/prompt.ts"
copy_file "lib/cortex/persona/refine.ts"

# Cortex Context
copy_file "lib/cortex/context/summary.ts"

# Cortex Intents
copy_file "lib/cortex/intents/canonicalIntent.ts"
copy_file "lib/cortex/intents/classifyIntentWithAI.ts"
copy_file "lib/cortex/intents/multiIntentDetector.ts"
copy_file "lib/cortex/intents/detectIntent.ts"
copy_file "lib/cortex/intents/types.ts"
copy_file "lib/cortex/intents/intentRules.ts"
copy_file "lib/cortex/intents/__tests__/classifyIntentWithAI.test.ts"
copy_file "lib/cortex/intents/__tests__/canonicalIntent.test.ts"

# Cortex Policy
copy_file "lib/cortex/policy/chips.ts"
copy_file "lib/cortex/policy/listHeuristics.ts"
copy_file "lib/cortex/policy/ideaHeuristics.ts"
copy_file "lib/cortex/policy/withHeuristicWhy.ts"

# Cortex Tests
copy_file "lib/cortex/__tests__/cortexDecide.list.autoCreate.test.ts"

# Tag Extraction (AI-based)
copy_file "lib/tags/extractTagsAI.ts"
copy_file "lib/tags/extractTags.ts"
copy_file "lib/tags/normalize.ts"
copy_file "lib/tags/quality.ts"
copy_file "lib/tags/themes.ts"
copy_file "lib/tags/constants.ts"
copy_file "lib/tags/getEffectiveTags.ts"
copy_file "lib/tags/parseSearch.ts"
copy_file "lib/tags/search.ts"
copy_file "lib/tags/__tests__/extractTagsAI.test.ts"
copy_file "lib/tags/__tests__/quality.test.ts"
copy_file "lib/tags/__tests__/junkTagPrevention.test.ts"
copy_file "lib/tags/__tests__/getEffectiveTags.test.ts"
copy_file "lib/tags/__tests__/themes.test.ts"
copy_file "lib/tags/__tests__/peopleAndPlaceExtraction.test.ts"

# Log Subtype Detection
copy_file "lib/logs/getEffectiveLogSubtype.ts"

echo ""

###############################################################################
# 2. DATA MODEL
###############################################################################

echo "2️⃣  DATA MODEL"
echo ""

# TypeScript Types
copy_file "lib/types.ts"
copy_file "types/supabase.ts"
copy_file "types/habit.ts"
copy_file "lib/supabase/mappers.ts"

# Canonical Types
copy_file "lib/canonical.ts"

# Schemas & Validation
copy_file "lib/schemas.ts"

# Repository Layer
copy_file "lib/repo/IRepo.ts"
copy_file "lib/repo/supabase.ts"
copy_file "lib/repo/memory.ts"
copy_file "lib/repo/types.ts"
copy_file "lib/repo/adapters/listAdapters.ts"
copy_file "lib/repo/ISpaceChatRepo.ts"
copy_file "providers/RepoProvider.tsx"

# Supabase Migrations (todos, habits, notes)
copy_file "supabase/migrations/20251122000000_phase13_add_views_jsonb.sql"
copy_file "supabase/migrations/20251117_fix_due_time_timestamp_conversion.sql"
copy_file "supabase/migrations/20251110_convert_or_create_from_drop.sql"
copy_file "supabase/migrations/20251024000001_add_habit_subtype.sql"
copy_file "supabase/migrations/20251023000007_rls_core_policy.sql"
copy_file "supabase/migrations/20251023000005_fix_people_backfill.sql"
copy_file "supabase/migrations/20251023000003_hotfix_from_audit.sql"
copy_file "supabase/migrations/20251022000100_sync_notes_metadata.sql"
copy_file "supabase/migrations/20251022000000_fix_tag_map_columns.sql"
copy_file "supabase/migrations/20251021_102_cortex_prefs_lists_events.sql"
copy_file "supabase/migrations/20251020032702_phase8_entity_people.sql"
copy_file "supabase/migrations/20251020032701_phase8_tags_and_map.sql"
copy_file "supabase/migrations/20251020000000_fix_entity_people_columns.sql"
copy_file "supabase/migrations/20251015000001_uuid_compatibility.sql"
copy_file "supabase/migrations/20251120_add_log_photos_table_if_missing.sql"
copy_file "supabase/migrations/20251025001020_log_idempotency_indices.sql"

# Recurrence
copy_file "app/utils/recurrence.ts"

echo ""

###############################################################################
# 3. ENTRY POINTS
###############################################################################

echo "3️⃣  ENTRY POINTS"
echo ""

# Mind Drop (CatchAll)
copy_file "app/screens/CatchAllNotepad.tsx"

# Mind Drop Components
copy_file "app/components/minddrop/MidConfidenceChips.tsx"

# Unified Overlay (Manual Entry)
copy_file "components/overlay/UnifiedOverlayV2.tsx"
copy_file "components/overlay/UnifiedCreateOverlay.tsx"
copy_file "components/overlay/overlayV2.state.ts"
copy_file "hooks/useUnifiedOverlayController.ts"

# Overlay Field Components
copy_file "components/overlay/fields/TodoFields.tsx"
copy_file "components/overlay/fields/HabitFields.tsx"
copy_file "components/overlay/fields/NoteFields.tsx"
copy_file "components/overlay/fields/HabitFrequency.tsx"

# Overlay Forms
copy_file "components/overlay/TodoForm.tsx"
copy_file "components/overlay/HabitStartForm.tsx"
copy_file "components/overlay/HabitBreakForm.tsx"
copy_file "components/overlay/HabitsTab.tsx"

# Quick Add / Now Page
copy_file "app/screens/NowScreenV1.tsx"
copy_file "lib/now/useNowData.ts"
copy_file "lib/now/useNowQuickAdd.ts"
copy_file "lib/now/nowTypes.ts"
copy_file "lib/now/nowSelectors.ts"

# Conversion Helpers
copy_file "lib/conversion.ts"

# Notes Hooks
copy_file "lib/notes/useRecentLogs.ts"

echo ""

###############################################################################
# 4. POST-CLASSIFICATION FLOW
###############################################################################

echo "4️⃣  POST-CLASSIFICATION FLOW"
echo ""

# Sweep Selectors
copy_file "lib/today/sweepSelectors.ts"

# Today Data & Interactions
copy_file "lib/today/useTodayData.ts"
copy_file "lib/today/useTodayInteractions.ts"

# Today Hooks
copy_file "lib/today/hooks/useCommitments.ts"
copy_file "lib/today/hooks/useFocusCard.ts"
copy_file "lib/today/hooks/useTodayEntries.ts"
copy_file "lib/today/hooks/useSweepPreview.ts"
copy_file "lib/today/hooks/useDropZoneSummary.ts"
copy_file "lib/today/hooks/useWeeklyHabitStats.ts"

# UI Utilities
copy_file "lib/ui/kindToDisplayLabel.ts"

echo ""

###############################################################################
# 5. TESTS (Mind Drop specific)
###############################################################################

echo "5️⃣  TESTS (Mind Drop)"
echo ""

copy_file "__tests__/minddrop.aiPending.lifecycle.test.tsx"
copy_file "__tests__/minddrop.uniqueness.test.tsx"
copy_file "__tests__/minddrop.habit.notes.test.tsx"
copy_file "__tests__/minddrop-no-duplication.test.ts"
copy_file "__tests__/minddrop.log.subtype.test.tsx"
copy_file "__tests__/minddrop.narrative.chips.test.tsx"
copy_file "__tests__/minddrop.autoOverlay.phase2d.test.tsx"
copy_file "__tests__/minddrop.duplicate-create.test.tsx"
copy_file "__tests__/minddrop.unsorted.aiPending.test.ts"
copy_file "__tests__/minddrop-pipeline.duplicates.test.ts"
copy_file "__tests__/minddrop.chip-bubbling.test.tsx"
copy_file "__tests__/minddrop.trustbuilders.test.tsx"
copy_file "__tests__/minddrop-ui-rendering.test.tsx"
copy_file "__tests__/minddrop.ls2.subtype.test.ts"
copy_file "__tests__/minddrop-views-state.integration.test.ts"
copy_file "__tests__/minddrop.tag.quality.integration.test.ts"
copy_file "__tests__/minddrop-fallback-retry.test.ts"
copy_file "__tests__/minddrop.tag.fallback.test.tsx"
copy_file "__tests__/minddrop.card.visual.states.test.tsx"
copy_file "__tests__/minddrop-pipeline.integration.test.ts"
copy_file "__tests__/minddrop.dropid.duplicate.prevention.test.tsx"

# Cortex Tests
copy_file "__tests__/cortex/openAiEngine.prompt-polish.test.ts"

# Other relevant tests
copy_file "tests/minddrop.prompt.time.test.tsx"
copy_file "tests/today.v3.sweep.test.tsx"
copy_file "tests/now/now.sweep.test.tsx"

# Overlay Tests
copy_file "__tests__/note-fields.test.tsx"
copy_file "__tests__/todo-fields.test.tsx"
copy_file "components/overlay/__tests__/overlay.list.autoCreate.test.tsx"

echo ""

###############################################################################
# 6. DOCUMENTATION
###############################################################################

echo "6️⃣  DOCUMENTATION"
echo ""

# Mind Drop Docs
copy_file "MINDDROP_V3_PHASE6_SUMMARY.md"
copy_file "MINDDROP_UI_FIX_COMPLETE.md"
copy_file "MINDDROP_DEDUPLICATION_COMPLETE.md"
copy_file "MINDDROP_V3_CATCHALL_FILTER.md"
copy_file "MINDDROP_V3_CHIP_RENDERING_FIX.md"
copy_file "MINDDROP_AI_TAG_OVERRIDE_COMPLETE.md"
copy_file "MINDDROP_HABIT_CHIP_FIX_COMPLETE.md"
copy_file "MINDDROP_LOG_FIX_SUMMARY.md"
copy_file "MINDDROP_V3_UI_REFRESH_FIX.md"
copy_file "MINDDROP_STATE_TRANSITIONS_COMPLETE.md"
copy_file "MINDDROP_TAG_CLEANUP_COMPLETE.md"
copy_file "MINDDROP_NOTE_TAG_CLEANUP_COMPLETE.md"
copy_file "MINDDROP_CATEGORY_CHIPS_COMPLETE.md"
copy_file "MINDDROP_REALTIME_SYNC_FIX.md"
copy_file "MINDDROP_V3_PHASE5_AUDIT.md"
copy_file "MINDDROP_V3_NO_DUPLICATION.md"
copy_file "MINDDROP_TAG_PRESERVATION_COMPLETE.md"
copy_file "MINDDROP_FIX_GUIDE.md"
copy_file "MINDDROP_DUPLICATE_PREVENTION_COMPLETE.md"
copy_file "MINDDROP_TODO_TAG_CLEANUP_COMPLETE.md"
copy_file "MINDDROP_ARCHITECTURE_README.md"
copy_file "MINDDROP_V3_PHASE_4B_TWO_STAGE_PIPELINE.md"
copy_file "MINDDROP_V3_PHASE_4_EXTENDED_VIEWS.md"
copy_file "MINDDROP_V3_E2E_TESTS.md"
copy_file "MINDDROP_CREATION_REFACTOR_COMPLETE.md"
copy_file "MINDDROP_HABIT_CREATION_UNIFIED.md"
copy_file "MINDDROP_HABIT_NOTES_FIELD_COMPLETE.md"
copy_file "MINDDROP_IDEMPOTENCY_COMPLETE.md"
copy_file "MINDDROP_PREFILL_OWNERSHIP_COMPLETE.md"
copy_file "MINDDROP_RAW_TEXT_HELPER_COMPLETE.md"
copy_file "MINDDROP_SHARED_UTILITIES_COMPLETE.md"
copy_file "MINDDROP_DUPLICATION_ANALYSIS.md"
copy_file "MIND_DROP_TEST_SUITE.md"

# Classification Docs
copy_file "AI_CLASSIFICATION_TYPE_FIELD_FIX.md"
copy_file "CATCHALL_PIPELINE_FLOW.md"
copy_file "CATCHALL_CORTEX_REFACTOR.md"
copy_file "CATCHALL_PIPELINE_WIRING_COMPLETE.md"

# Multi-Intent & Ambiguity
copy_file "MULTI_INTENT_DETECTION.md"
copy_file "MULTI_INTENT_FIX.md"
copy_file "AMBIGUOUS_SOCIAL_PLAN_IMPLEMENTATION.md"
copy_file "CANONICAL_INTENT_CHIP_SUPPRESSION.md"

# Phase Documentation
copy_file "PHASE_1A_DELETE_BY_DROPID_COMPLETE.md"
copy_file "PHASE_1B_DUPLICATE_PREVENTION_COMPLETE.md"
copy_file "PHASE_1C_TAG_FILTERING_COMPLETE.md"
copy_file "PHASE_2A_BACKGROUND_PREFILL_COMPLETE.md"
copy_file "PHASE_2B_OVERLAY_AI_REMOVAL_COMPLETE.md"
copy_file "PHASE_2E_NO_AUTO_OPEN_OVERLAY.md"
copy_file "PHASE_4A_TAG_QUALITY_UPGRADE.md"
copy_file "PHASE_4B_ADDITIVE_THEMES_COMPLETE.md"

# Dependencies & Architecture
copy_file "DEPENDENCY_GRAPH.md"
copy_file "DB_SCHEMA_CONFORMANCE.md"

# Log System
copy_file "LOG_KIND_DETECTION_L1.md"
copy_file "LOG_KIND_EXAMPLES.md"
copy_file "LOG_LAYOUT_L2.md"
copy_file "LOG_SUBTYPE_AI_INTEGRATION.md"

# Tag System
copy_file "AI_TAG_EXTRACTION_IMPLEMENTATION_COMPLETE.md"
copy_file "TAG_EXTRACTION_V3_IMPLEMENTATION.md"
copy_file "TAG_SYSTEM_OVERHAUL_COMPLETE.md"
copy_file "THEME_TAG_IMPLEMENTATION.md"
copy_file "JUNK_TAG_PREVENTION_TESTS.md"

# Overlay
copy_file "OVERLAY_TYPE_CHANGE_IMPLEMENTATION.md"

# General Architecture
copy_file "EXPORT_SUMMARY.md"
copy_file "TODAY_NOW_MINDDROP_DATA_FLOWS.md"

echo ""

###############################################################################
# 7. ENVIRONMENT & CONFIG
###############################################################################

echo "7️⃣  ENVIRONMENT & CONFIG"
echo ""

copy_file "lib/env.ts"
copy_file ".env.example"

# Config files
copy_file "package.json"
copy_file "tsconfig.json"

echo ""

###############################################################################
# CREATE ZIP
###############################################################################

echo "📦 Creating zip archive..."
echo ""

if command -v zip &> /dev/null; then
  zip -r "$BUNDLE_ZIP" "$BUNDLE_DIR" > /dev/null
  echo "✅ Created: $BUNDLE_ZIP"
else
  echo "❌ Error: 'zip' command not found. Please install zip utility."
  exit 1
fi

echo ""
echo "📊 Bundle Statistics:"
echo ""
echo "  Files copied: $(find "$BUNDLE_DIR" -type f | wc -l | xargs)"
echo "  Bundle size:  $(du -sh "$BUNDLE_DIR" | cut -f1)"
echo "  Zip size:     $(du -sh "$BUNDLE_ZIP" | cut -f1)"
echo ""
echo "✨ Classification Review Bundle ready!"
echo ""
echo "📂 Location: $(pwd)/$BUNDLE_ZIP"
echo ""
