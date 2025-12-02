# Classification Review Bundle - Usage Guide

## Quick Start

```bash
# From the repo root
./scripts/buildClassificationReviewBundle.sh
```

**Output**: `classification_review_bundle.zip` (740 KB) in the repo root

---

## What's Included

The bundle contains **215 files** organized into 6 categories:

1. **Classification Pipeline** (57 files) - Mind Drop, Cortex AI, Tag Extraction
2. **Data Model** (31 files) - Types, Schemas, Migrations, Repository Layer
3. **Entry Points** (23 files) - Mind Drop Screen, Overlay, Quick Add
4. **Post-Classification** (11 files) - Recent Drops, Sweep, Type Changes
5. **Tests** (27 files) - Integration & Unit Tests
6. **Documentation** (62 files) - Architecture, Phase Docs, Guides

Plus 4 config files (env, package.json, tsconfig).

---

## Directory Structure

The bundle preserves the original repo structure:

```
classification_review_bundle/
├── lib/
│   ├── minddrop/           # Mind Drop pipeline
│   ├── cortex/             # AI classification engine
│   ├── tags/               # Tag extraction
│   ├── repo/               # Repository layer
│   ├── types.ts            # Core entity types
│   └── ...
├── app/
│   ├── screens/CatchAllNotepad.tsx  # Mind Drop UI
│   └── components/minddrop/
├── components/
│   └── overlay/            # Manual creation overlay
├── supabase/migrations/    # Database schema
├── __tests__/              # Tests
├── *.md                    # Documentation
└── package.json, tsconfig.json
```

---

## How to Review

### For First-Time Review

**Start with these 6 files**:

1. `DEPENDENCY_GRAPH.md` - System architecture overview
2. `lib/cortex/cortexDecide.ts` - AI classification entry point
3. `lib/minddrop/pipelineStages.ts` - Two-stage pipeline
4. `app/screens/CatchAllNotepad.tsx` - Mind Drop UI
5. `CATCHALL_PIPELINE_FLOW.md` - Flow diagrams
6. `MINDDROP_ARCHITECTURE_README.md` - Design philosophy

### Deep Dive by Topic

**Want to understand classification?**
→ `lib/cortex/cortexDecide.ts` + `lib/cortex/intents/` folder

**Want to understand Mind Drop pipeline?**
→ `lib/minddrop/pipelineStages.ts` + `MINDDROP_V3_PHASE_4B_TWO_STAGE_PIPELINE.md`

**Want to understand data model?**
→ `lib/types.ts` + `supabase/migrations/` + `DB_SCHEMA_CONFORMANCE.md`

**Want to understand tag extraction?**
→ `lib/tags/extractTagsAI.ts` + `AI_TAG_EXTRACTION_IMPLEMENTATION_COMPLETE.md`

**Want to understand log subtypes?**
→ `lib/cortex/classifyLogSubtype.ts` + `LOG_SUBTYPE_AI_INTEGRATION.md`

**Want to see tests?**
→ `__tests__/minddrop-pipeline.integration.test.ts` + other `__tests__/minddrop*.tsx`

---

## Classification Flow Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│                     User Input                              │
│  (Mind Drop / Overlay / Quick Add)                         │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              cortexDecide()                                 │
│  File: lib/cortex/cortexDecide.ts                          │
│                                                             │
│  - Intent detection (heuristics + AI)                      │
│  - Confidence scoring (0-1)                                │
│  - MindDropDecision: {                                     │
│      probableKind: 'todo' | 'habit' | 'log' | 'none'      │
│      needsClarification: boolean                           │
│    }                                                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│            Stage A: Classification                          │
│  File: lib/minddrop/pipelineStages.ts                      │
│  Function: runMindDropStageAClassification()                │
│                                                             │
│  - Create entities (todos/habits/logs)                     │
│  - Set views.minddrop_stage = 'classified'                 │
│  - Set drop_id for tracking                                │
│  - Returns: { entities: { todos, habits, notes } }         │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ (synchronous)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│       Stage B: Enrichment (Background)                      │
│  File: lib/minddrop/backgroundPrefill.ts                   │
│  Function: runMindDropStageBPrefill()                       │
│                                                             │
│  - AI title compaction                                     │
│  - AI tag extraction                                       │
│  - Log subtype refinement                                  │
│  - Set views.minddrop_stage = 'prefilled'                  │
│  - Set views.minddrop_prefilled_v1 = true                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│         Entity in Canonical View                            │
│                                                             │
│  - Todos     → Today page                                  │
│  - Habits    → Habits tab                                  │
│  - Logs      → Logs / Your Notes                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

### Mind Drop Decision

The core classification result from `cortexDecide()`:

```typescript
type MindDropDecision = {
  probableKind: 'todo' | 'habit' | 'log' | 'none';
  confidence: number;  // 0-1
  needsClarification: boolean;  // Show chips?
  logSubtype?: LogSubtype | null;
  tags?: string[];
  aiConfidence?: number;
};
```

### Two-Stage Pipeline

**Stage A (Classification)**:
- Runs synchronously
- Creates entities immediately
- Sets `minddrop_stage = 'classified'`

**Stage B (Enrichment)**:
- Runs asynchronously in background
- Enriches with AI (tags, title, subtype)
- Sets `minddrop_stage = 'prefilled'`

### Drop ID Tracking

Every Mind Drop submission gets a unique `drop_id`:
- Format: `minddrop-{timestamp}-{random}`
- Used for deduplication
- Used for tracking across stages
- Stored in `notes.drop_id`, `todos.drop_id`, `habits.drop_id`

### Views JSONB

Entities use a `views` JSONB field for transient state:
- `views.minddrop_stage`: 'pending' | 'classified' | 'prefilled'
- `views.minddrop_prefilled_v1`: boolean
- `views.ai_pending`: boolean
- `views.ai_failed`: boolean

---

## Common Questions

**Q: Where does AI classification happen?**  
A: `lib/cortex/cortexDecide.ts` → calls `classifyIntentWithAI()` → calls OpenAI

**Q: How are tags extracted?**  
A: Two ways:
1. During classification: `cortexDecide()` returns tags in `meta.classification.tags`
2. During enrichment: Stage B calls `extractTagsAI()` for additional tags

**Q: What's the difference between Mind Drop and Overlay?**  
A: 
- **Mind Drop** (`CatchAllNotepad.tsx`): AI-first, auto-classification
- **Overlay** (`UnifiedOverlayV2.tsx`): Manual creation, optional AI assist

**Q: Where are entity types defined?**  
A: `lib/types.ts` - see `Todo`, `Habit`, `Note` interfaces

**Q: Where are database migrations?**  
A: `supabase/migrations/` - 17 migrations included

**Q: How does deduplication work?**  
A: Based on `drop_id` - see `lib/minddrop/pipelineStages.ts` (idempotency checks)

**Q: How do I run tests?**  
A: Not included in bundle (run in main repo with `npm test`)

---

## Troubleshooting

### Missing Files

If you see `⚠️ MISSING: <file>` when running the script, the file may have been:
1. Moved to a different location
2. Renamed
3. Deleted from the repo

Update the script (`scripts/buildClassificationReviewBundle.sh`) accordingly.

### Bundle Size

Current bundle: 3.0 MB uncompressed, 740 KB zipped.

If size becomes an issue:
- Remove test files (27 files, ~500 KB)
- Remove markdown docs (62 files, ~1.5 MB)
- Keep only core implementation files

### Regenerating Bundle

```bash
# Clean up old bundle
rm -rf classification_review_bundle classification_review_bundle.zip

# Regenerate
./scripts/buildClassificationReviewBundle.sh
```

---

## Modifying the Bundle

To add/remove files, edit `scripts/buildClassificationReviewBundle.sh`:

```bash
# Add a file
copy_file "path/to/new/file.ts"

# Comment out a file
# copy_file "path/to/old/file.ts"
```

Then regenerate the bundle.

---

## Related Documentation

- `CLASSIFICATION_REVIEW_BUNDLE_README.md` - Overview
- `CLASSIFICATION_BUNDLE_FILE_LIST.md` - Complete file list (215 files)
- `DEPENDENCY_GRAPH.md` - System architecture (in bundle)

---

**Script Location**: `scripts/buildClassificationReviewBundle.sh`  
**Last Updated**: December 1, 2025
