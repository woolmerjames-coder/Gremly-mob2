/**
 * Worlds & Chapters v2 — classifier (Phase 1, step 3 · Phase 1b revision)
 *
 * Sonnet-based weekly rebuild classifier. Reads a SignalBundle plus the user's
 * current active Worlds, active Chapters, and calendar summary; produces up to
 * six output arrays via Anthropic tool use:
 *   - new_world_candidates: clusters large enough to propose as Worlds
 *   - new_chapter_candidates: bounded arcs that do NOT overlap existing chapters
 *   - chapter_updates: extensions / closures of existing active chapters
 *   - new_life_context_candidates: constraint containers, not growth surfaces
 *   - velocity_updates: per active-World, velocity + dormancy recommendation
 *   - evolution_proposals: split | emerge | transform | absorb
 *
 * Phase 1b changes vs step 3:
 *   1. Active chapters now passed into the prompt. Classifier is explicitly
 *      instructed to extend rather than re-propose overlapping arcs.
 *   2. life_contexts is a new output array. Classifier decides whether a
 *      calendar-dense, reflection-light domain is a World or a life_context.
 *   3. Calendar summary passed in so the classifier can actually see meeting
 *      density when making the Worlds vs life_contexts call.
 *   4. Evolution rules tightened. sustained_over_rebuilds ≥ 2 applies to all
 *      four event types (was only enforced for split). Transform is given an
 *      explicit trigger (dominant sub-theme has shifted for 2+ consecutive
 *      windows) so the Sobriety / Anxiety-ADHD refinement case we missed in
 *      the step-3 harness actually fires going forward.
 *
 * Hard boundary: this file does not import from any Life Map pipeline function.
 * Enforced by scripts/check-worlds-boundary.mjs.
 *
 * References:
 *   worlds_and_chapters_spec_v2-3.md §5, §6, §7, §8, §9b, §14
 *   audit_v2-1.md §5, §11
 */

import type { SignalBundle } from './signalCollector';

export interface ClassifierEnv {
  ANTHROPIC_API_KEY: string;
}

// ─── Enums and constants ─────────────────────────────────────────────────────

export type Archetype =
  | 'creative' | 'professional' | 'wellness_body' | 'wellness_mind'
  | 'learning' | 'relational' | 'domestic' | 'generic';

const ARCHETYPES: Archetype[] = [
  'creative', 'professional', 'wellness_body', 'wellness_mind',
  'learning', 'relational', 'domestic', 'generic',
];

export type ModuleKey =
  | 'reflection_timeline' | 'habit_streaks' | 'next_actions'
  | 'recent_thoughts' | 'upcoming_events' | 'people_involved'
  | 'artifact_gallery' | 'mood_over_time' | 'symptom_tracker'
  | 'supplement_log' | 'chapter_strip' | 'active_goals' | 'progress_bar';

const MODULES: ModuleKey[] = [
  'reflection_timeline', 'habit_streaks', 'next_actions',
  'recent_thoughts', 'upcoming_events', 'people_involved',
  'artifact_gallery', 'mood_over_time', 'symptom_tracker',
  'supplement_log', 'chapter_strip', 'active_goals', 'progress_bar',
];

export type VelocityDelta = 'growing' | 'stable' | 'declining' | 'dormant';
export type EvolutionEvent = 'split' | 'emerge' | 'transform' | 'absorb';
export type DropType = 'note' | 'todo' | 'habit';
export type EvidenceDropType = DropType | 'chat_summary' | 'temporal_anchor';

export type ChapterType = 'project' | 'goal' | 'arc' | 'transition' | 'ritual';
export type ChapterPhase = 'suggested' | 'upcoming' | 'active' | 'closing' | 'closed';
export type LifeContextKind = 'job' | 'school' | 'obligation' | 'constraint' | 'circumstance';
export const LIFE_CONTEXT_KINDS: LifeContextKind[] = [
  'job', 'school', 'obligation', 'constraint', 'circumstance',
];

// ─── Input shapes ────────────────────────────────────────────────────────────

export interface ArchetypeWeight { type: Archetype; weight: number; }
export interface ModuleWeight { module: ModuleKey; weight: number; }

export interface Evidence {
  drop_id: string;
  drop_type: EvidenceDropType;
  date: string;
  snippet: string;
}

export interface ActiveWorldInput {
  id: string;
  name: string;
  description: string | null;
  archetypes: ArchetypeWeight[];
  first_signal_at: string | null;
  last_signal_at: string | null;
}

export interface ActiveChapterInput {
  id: string;
  title: string;
  chapter_type: ChapterType;
  phase: ChapterPhase;
  start_date: string | null;
  end_date: string | null;
  primary_world_name: string;
  description: string;
  target_description: string | null;
}

// ─── Output shapes ───────────────────────────────────────────────────────────

export interface NewWorldCandidate {
  proposed_name: string;
  description: string;
  archetypes: ArchetypeWeight[];
  confidence: number;
  first_signal_at: string;
  last_signal_at: string;
  drop_count: number;
  distinct_day_count: number;
  evidence: Evidence[];
  seed_module_layout: ModuleWeight[];
  reason: string;
}

export interface NewChapterCandidate {
  proposed_title: string;
  description: string;
  chapter_type: ChapterType;
  start_date: string | null;
  end_date: string | null;
  target_description: string | null;
  primary_world_name: string;
  related_world_names: string[];
  evidence: Evidence[];
  confidence: number;
}

/**
 * Phase 1b: extend an already-active chapter rather than re-proposing it.
 * Used when an ongoing arc picks up additional evidence in the new window
 * but the chapter itself hasn't changed identity.
 */
export interface ChapterUpdate {
  chapter_id: string;
  new_end_date: string | null;
  new_description: string | null;
  new_target_description: string | null;
  close_chapter: boolean;
  reason: string;
  evidence: Evidence[];
}

/**
 * Phase 1b: a life_context is a constraint container, not a life domain.
 * It describes something the user must do (work, school, obligation) rather
 * than something they are growing into. Lives outside the Worlds tab.
 */
export interface NewLifeContextCandidate {
  proposed_name: string;
  description: string;
  kind: LifeContextKind;
  calendar_source: string | null;
  start_date: string | null;
  end_date: string | null;
  confidence: number;
  evidence: Evidence[];
  reason: string;
}

export interface VelocityUpdate {
  world_id: string;
  signal_velocity: number;
  signal_velocity_delta: VelocityDelta;
  drops_last_4_weeks: number;
  drops_prior_4_weeks: number;
  recommend_dormant: boolean;
  rationale: string;
}

export interface EvolutionProposal {
  event_type: EvolutionEvent;
  parent_world_ids: string[];
  proposed_children: {
    name: string;
    description: string;
    archetypes: ArchetypeWeight[];
  }[];
  reason: string;
  drops_to_reassign: {
    drop_id: string;
    drop_type: DropType;
    from_world_id: string | null;
    to_world_name: string;
  }[];
  confidence: number;
  sustained_over_rebuilds: number;
}

export interface ReclassificationProposal {
  world_id: string;
  world_name: string;
  target_kind: 'employer' | 'role' | 'obligation' | 'calendar_source' | 'custom';
  target_name: string;
  reason: string;
  confidence: number;
  sustained_over_rebuilds: number;
  evidence: Evidence[];
}

export interface ReactivationProposal {
  world_id: string;
  world_name: string;
  reason: string;
  confidence: number;
  drops_last_4_weeks: number;
  evidence: Evidence[];
}

export interface ClassifierRunMetadata {
  model: string;
  bundle_mode: 'live' | 'backfill';
  window_start: string | null;
  window_end: string | null;
  effective_today: string;
  input_tokens: number;
  output_tokens: number;
}

export interface ClassifierOutput {
  run_metadata: ClassifierRunMetadata;
  new_world_candidates: NewWorldCandidate[];
  new_chapter_candidates: NewChapterCandidate[];
  chapter_updates: ChapterUpdate[];
  new_life_context_candidates: NewLifeContextCandidate[];
  velocity_updates: VelocityUpdate[];
  evolution_proposals: EvolutionProposal[];
  reactivation_proposals: ReactivationProposal[];
  reclassification_proposals: ReclassificationProposal[];
}

// ─── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the signal-first classifier for Gremly's Worlds & Chapters system. You read a user's raw signal (journals, notes, todos, habits, chat running summaries, temporal anchors, profile overrides, daily ritual progress, photo-accompanying note bodies, a calendar summary digest, plus in live mode the most recent Daily Context Objects and weekly summaries) and produce eight outputs by calling the submit_classifier_output tool exactly once.

What a World is. A World is an active, long-lived domain of the user's life where the user is engaged, reflecting, or growing. A domain has recurring signal across multiple signal types; journals, todos, habits, and chats often all touch it. It names a region of someone's life, not a single activity or feeling. One-off tasks, single moods, and isolated thoughts are not Worlds.

What a life_context is (distinct from a World). A life_context is a constraint container: something the user has to do, not something they are growing into. Work (employer, role), school, caregiving, legal obligations. Life_contexts are typically calendar-dense (many meetings, many events) but reflection-light (few journal entries, few todos the user chose to make). They consume time without being a growth surface. Decide World vs life_context this way: if the user writes about it, plans inside it, or builds habits around it, it's a World; if they mostly just show up to it because they have to, and the evidence is dominated by calendar events or repetitive obligations rather than reflection, it's a life_context. Employment is the canonical example. When calendar summary shows high meeting density for a domain AND reflection/journal signal on that domain is low, prefer life_context over World. Life_contexts render outside the Worlds tab.

What a Chapter is. A Chapter is a bounded arc with a recognizable beginning and end. It can span multiple Worlds. A Chapter has temporal coherence (drops cluster within a window) and narrative coherence (drops tell a story with a start and an end). If no plausible start or end is identifiable, it is not a Chapter. Some Chapters are achievement-shaped; their target_description states what finishing looks like.

Active chapters and chapter deduplication. Before proposing a new chapter in a primary_world, examine every existing chapter in that world from active_chapters_in regardless of phase. For each, compute the date range overlap between the proposed chapter's start_date and end_date and the existing chapter's range. If the overlap exceeds 60 percent of the proposed chapter's own duration, do not emit the candidate. If the overlapping existing chapter is still open, emit a chapter_update refining its description and target instead. If the existing chapter is already closed, skip the proposal entirely and rely on the closed chapter for narrative continuity.

When active_chapters is non-empty, you must also check each new_chapter_candidate you would emit against the active list. If a candidate overlaps an existing active chapter in time range AND topic (same primary World or closely related theme), DO NOT emit it as a new candidate. Instead, either (a) emit a chapter_update that extends the existing chapter's end_date or description based on the new evidence, (b) emit a chapter_update with close_chapter=true if the arc has reached its target, or (c) emit nothing for that arc if nothing has changed. Only emit a new_chapter_candidate when the arc is genuinely new or its identity has shifted enough that the existing chapter no longer describes it. Slight title variations ("Gremly Launch Sprint" vs "App Launch Push") describing the same ongoing arc are duplicates and must not be re-proposed.

## Deduplication rules

Before emitting a new_chapter_candidate or new_life_context_candidate, check the provided state for existing entries of the same kind.

For chapters: compare the proposed start_date and end_date against every chapter in chapter_book regardless of phase (including phase="closed"). If the proposed date range overlaps more than 60% with an existing chapter that shares the same primary_world_name, do NOT emit a new_chapter_candidate. If the existing chapter is still open (phase="suggested" or "accepted"), emit a chapter_update instead. If the existing chapter is closed, skip silently — the arc has already been captured.

For life_contexts: compare the proposed name and kind against every entry in life_context_book regardless of end_date. If an entry already exists with a matching name (case-insensitive, trimmed) AND matching kind, do NOT emit a new_life_context_candidate. The life_context is already committed. Only emit a life_context_update if a material detail has changed (new calendar_source, new description, new end_date).

Target kind selection for life_contexts: when target_name contains an organization name (company, employer, client), prefer target_kind="employer" over target_kind="obligation". Reserve "obligation" for non-employment burdens (commutes, caregiving duties, administrative chores).

What an evolution proposal is. A proposal that an existing active World's identity, shape, or membership should change based on how its signal has drifted. Four kinds. Split: sub-clusters have diverged enough to warrant separate Worlds. Emerge: a coherent thread has formed inside or adjacent to an active World, large enough to stand alone. Transform: the World's name, description, or archetypes no longer match its recent signal; drops do not move. Absorb: a dormant World folds into an active neighbor or is archived cleanly. Merge is out of scope; never propose it.

Evolution firing rules. Evolution events must be rare and earned. All four types require sustained_over_rebuilds of at least 2, meaning the pattern justifying the proposal must have been visible across at least 2 consecutive windows. On a single-window run (sustained_over_rebuilds would be 1), no evolution events may be emitted. Confidence for evolution must be at least 0.7 to emit. Transform specifically is eligible when the dominant sub-theme of a World's signal has shifted for 2+ consecutive windows, even if no discrete sub-cluster has formed. Example pattern: a Health & Wellbeing World that started with generic supplement and sleep content, then for 2+ consecutive windows has been dominated by sobriety and habit-tracking, should transform to something like "Sobriety & Habit Formation" without needing to split. Propose at most one evolution event per run unless the evidence genuinely supports multiple.

Evidence is mandatory. Every new World candidate, new Chapter candidate, life_context candidate, chapter_update, and evolution proposal must cite at least two drop_ids whose dates span at least two distinct days. Candidates citing zero or one drop, or all drops on a single day, are invalid output and must not be emitted. Prefer diverse signal types when possible; a journal plus a todo is stronger than two todos.

Recency rule. For any drop date used in reasoning, treat the effective date as the minimum of the drop's actual date and the effective_today value in the user message. Future-dated todos, temporal anchors, and events never count as recent signal.

Completion rule. A todo is complete if and only if its completed_at is not null. The status column is unreliable and must be ignored when judging completion.

Archetypes. Classify each new World candidate with one or more archetypes from this fixed set, weights summing to 1.0: creative, professional, wellness_body, wellness_mind, learning, relational, domestic, generic. Multi-archetype is expected for Worlds that genuinely span domains. Generic is the escape hatch for Worlds that fit no specific archetype; prefer a specific archetype whenever one applies.

Seed modules. For each new World candidate, propose a seed module layout of ordered module keys with weights. Include a module only if the candidate's evidence contains matching signal for it. symptom_tracker and supplement_log are signal-gated, not archetype-gated: include them only when the evidence contains symptom or supplement or medication mentions.

Velocity for active Worlds. Compute signal_velocity as drops per week averaged over the trailing 4 weeks of available evidence. Compute signal_velocity_delta as the relative change compared to the prior 4 weeks: growing when the last 4 weeks exceed the prior 4 by more than 25 percent, declining when the inverse holds, stable when within 25 percent either way, dormant when signal falls below the applicable per-archetype floor. Dormancy floor is per-archetype, not flat. For a World whose archetype weight is at least 0.5 on a given type, apply the matching floor: relational 0.5 drops per week, professional 1.5 per week with calendar density considered as secondary evidence, wellness_body 2 per week, all other archetypes 2 per week. When archetypes are mixed, use the lowest floor among types with weight at least 0.3. Recommend dormancy only when signal has stayed below the applicable floor for the full 4 week window and the declining trajectory is sustained over the prior window.

Naming. World names describe domains of life in short, concrete terms. Chapter titles describe arcs. Life_context names describe the obligation in short, concrete terms ("Sage at Dentsu", "Stanford coursework"). Avoid names that duplicate the product features of journaling or productivity apps.

What to ignore. Space ids, space names, and any legacy "where was this filed" information must not influence clustering. Individual synced calendar events are filtered upstream; do not treat any meeting-shaped title alone as World signal if one slips through. Use the calendar_summary digest for calendar density, not individual event rows.

Empty output is valid. If the signal is insufficient, return empty arrays for any output. Do not invent candidates to fill space. A candidate below 0.5 confidence must not be emitted. An evolution proposal below 0.7 confidence must not be emitted.

Reactivation of dormant worlds. For any world appearing in active_worlds_in with phase dormant, evaluate whether current window signal density exceeds the applicable dormancy floor by 25 percent or more. If yes, emit a reactivation_proposal referencing the world by id. Do not create a new world_candidate with a matching name and archetype. Reactivation is a single-window state change and does not require sustained_over_rebuilds.

Reclassification from World to life_context. A World represents a domain the user actively reflects on and grows into. A life_context represents an obligation the user shows up to because they have to. When a world was previously classified as a World but current signal has shifted toward obligation shape, propose reclassification. All of the following must hold in the current window and at least one prior rebuild: calendar density for the world is high relative to its reflection signal, journal and note signal density tagged to the world is low, sentiment trend is neutral or negative. Reclassification requires sustained_over_rebuilds of at least 2 and confidence of at least 0.7.

Confidence. Every candidate and proposal gets a confidence between 0 and 1. Think of 0.5 as the minimum emission threshold for non-evolution outputs, 0.7 as the downstream weekly-update surfacing threshold and the minimum for evolution, 0.9 as very strong. Do not inflate confidence to surface weak candidates.`;

// ─── Tool definition ─────────────────────────────────────────────────────────

const ARCHETYPE_WEIGHT_SCHEMA = {
  type: 'object',
  required: ['type', 'weight'],
  properties: {
    type: { type: 'string', enum: ARCHETYPES },
    weight: { type: 'number', minimum: 0, maximum: 1 },
  },
};

const EVIDENCE_SCHEMA = {
  type: 'object',
  required: ['drop_id', 'drop_type', 'date', 'snippet'],
  properties: {
    drop_id: { type: 'string' },
    drop_type: {
      type: 'string',
      enum: ['note', 'todo', 'habit', 'chat_summary', 'temporal_anchor'],
    },
    date: { type: 'string' },
    snippet: { type: 'string' },
  },
};

const SUBMIT_CLASSIFIER_OUTPUT_TOOL = {
  name: 'submit_classifier_output',
  description:
    'Submit the classifier output. Call exactly once with all eight arrays present. Any array may be empty.',
  input_schema: {
    type: 'object',
    required: [
      'new_world_candidates',
      'new_chapter_candidates',
      'chapter_updates',
      'new_life_context_candidates',
      'velocity_updates',
      'evolution_proposals',
      'reactivation_proposals',
      'reclassification_proposals',
    ],
    properties: {
      new_world_candidates: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'proposed_name', 'description', 'archetypes', 'confidence',
            'first_signal_at', 'last_signal_at', 'drop_count',
            'distinct_day_count', 'evidence', 'seed_module_layout', 'reason',
          ],
          properties: {
            proposed_name: { type: 'string' },
            description: { type: 'string' },
            archetypes: { type: 'array', minItems: 1, items: ARCHETYPE_WEIGHT_SCHEMA },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            first_signal_at: { type: 'string' },
            last_signal_at: { type: 'string' },
            drop_count: { type: 'integer', minimum: 2 },
            distinct_day_count: { type: 'integer', minimum: 2 },
            evidence: { type: 'array', minItems: 2, items: EVIDENCE_SCHEMA },
            seed_module_layout: {
              type: 'array',
              items: {
                type: 'object',
                required: ['module', 'weight'],
                properties: {
                  module: { type: 'string', enum: MODULES },
                  weight: { type: 'number', minimum: 0, maximum: 1 },
                },
              },
            },
            reason: { type: 'string' },
          },
        },
      },
      new_chapter_candidates: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'proposed_title', 'description', 'chapter_type',
            'primary_world_name', 'related_world_names',
            'evidence', 'confidence',
          ],
          properties: {
            proposed_title: { type: 'string' },
            description: { type: 'string' },
            chapter_type: { type: 'string', enum: ['bounded', 'season', 'milestone'] },
            start_date: { type: ['string', 'null'] },
            end_date: { type: ['string', 'null'] },
            target_description: { type: ['string', 'null'] },
            primary_world_name: { type: 'string' },
            related_world_names: { type: 'array', items: { type: 'string' } },
            evidence: { type: 'array', minItems: 2, items: EVIDENCE_SCHEMA },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
      chapter_updates: {
        type: 'array',
        items: {
          type: 'object',
          required: ['chapter_id', 'close_chapter', 'reason', 'evidence'],
          properties: {
            chapter_id: { type: 'string' },
            new_end_date: { type: ['string', 'null'] },
            new_description: { type: ['string', 'null'] },
            new_target_description: { type: ['string', 'null'] },
            close_chapter: { type: 'boolean' },
            reason: { type: 'string' },
            evidence: { type: 'array', minItems: 2, items: EVIDENCE_SCHEMA },
          },
        },
      },
      new_life_context_candidates: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'proposed_name', 'description', 'kind', 'confidence',
            'evidence', 'reason',
          ],
          properties: {
            proposed_name: { type: 'string' },
            description: { type: 'string' },
            kind: { type: 'string', enum: LIFE_CONTEXT_KINDS },
            calendar_source: { type: ['string', 'null'] },
            start_date: { type: ['string', 'null'] },
            end_date: { type: ['string', 'null'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            evidence: { type: 'array', minItems: 2, items: EVIDENCE_SCHEMA },
            reason: { type: 'string' },
          },
        },
      },
      velocity_updates: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'world_id', 'signal_velocity', 'signal_velocity_delta',
            'drops_last_4_weeks', 'drops_prior_4_weeks',
            'recommend_dormant', 'rationale',
          ],
          properties: {
            world_id: { type: 'string' },
            signal_velocity: { type: 'number', minimum: 0 },
            signal_velocity_delta: {
              type: 'string',
              enum: ['growing', 'stable', 'declining', 'dormant'],
            },
            drops_last_4_weeks: { type: 'integer', minimum: 0 },
            drops_prior_4_weeks: { type: 'integer', minimum: 0 },
            recommend_dormant: { type: 'boolean' },
            rationale: { type: 'string' },
          },
        },
      },
      evolution_proposals: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'event_type', 'parent_world_ids', 'proposed_children',
            'reason', 'drops_to_reassign', 'confidence', 'sustained_over_rebuilds',
          ],
          properties: {
            event_type: { type: 'string', enum: ['split', 'emerge', 'transform', 'absorb'] },
            parent_world_ids: { type: 'array', items: { type: 'string' } },
            proposed_children: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name', 'description', 'archetypes'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  archetypes: { type: 'array', items: ARCHETYPE_WEIGHT_SCHEMA },
                },
              },
            },
            reason: { type: 'string' },
            drops_to_reassign: {
              type: 'array',
              items: {
                type: 'object',
                required: ['drop_id', 'drop_type', 'to_world_name'],
                properties: {
                  drop_id: { type: 'string' },
                  drop_type: { type: 'string', enum: ['note', 'todo', 'habit'] },
                  from_world_id: { type: ['string', 'null'] },
                  to_world_name: { type: 'string' },
                },
              },
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            // Phase 1b: all evolution types now require ≥ 2 consecutive windows.
            sustained_over_rebuilds: { type: 'integer', minimum: 2 },
          },
        },
      },
      reactivation_proposals: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'world_id', 'world_name', 'reason', 'confidence',
            'drops_last_4_weeks', 'evidence',
          ],
          properties: {
            world_id: { type: 'string' },
            world_name: { type: 'string' },
            reason: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            drops_last_4_weeks: { type: 'number' },
            evidence: { type: 'array', items: EVIDENCE_SCHEMA },
          },
        },
      },
      reclassification_proposals: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'world_id', 'world_name', 'target_kind', 'target_name',
            'reason', 'confidence', 'sustained_over_rebuilds', 'evidence',
          ],
          properties: {
            world_id: { type: 'string' },
            world_name: { type: 'string' },
            target_kind: {
              type: 'string',
              enum: ['employer', 'role', 'obligation', 'calendar_source', 'custom'],
            },
            target_name: { type: 'string' },
            reason: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            sustained_over_rebuilds: { type: 'integer', minimum: 1 },
            evidence: { type: 'array', items: EVIDENCE_SCHEMA },
          },
        },
      },
    },
  },
};

// ─── Classifier invoke ───────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 16000;

export async function classifyWorldsWeekly(
  bundle: SignalBundle,
  activeWorlds: ActiveWorldInput[],
  activeChapters: ActiveChapterInput[],
  env: ClassifierEnv,
): Promise<ClassifierOutput> {
  const effectiveToday = computeEffectiveToday(bundle);
  const userPrompt = buildUserPrompt(bundle, activeWorlds, activeChapters, effectiveToday);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [SUBMIT_CLASSIFIER_OUTPUT_TOOL],
      tool_choice: { type: 'tool', name: 'submit_classifier_output' },
      stream: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `classifyWorldsWeekly: Anthropic API ${res.status} ${res.statusText}\n${body}`,
    );
  }
  if (!res.body) {
    throw new Error('classifyWorldsWeekly: Anthropic stream had no body');
  }

  // Accumulate the streamed tool_use input. Anthropic streaming emits:
  //   message_start         → input_tokens in usage
  //   content_block_start   → tool name (for type=tool_use)
  //   content_block_delta   → partial_json fragments (for type=input_json_delta)
  //   message_delta         → stop_reason, output_tokens
  //   message_stop
  let toolName = '';
  let toolInputJson = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | null = null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line (\n\n).
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      sep = buffer.indexOf('\n\n');

      const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      const payload = dataLine.slice(6);
      if (payload === '[DONE]') continue;

      try {
        const evt = JSON.parse(payload) as {
          type: string;
          message?: { usage?: { input_tokens: number } };
          content_block?: { type: string; name?: string };
          delta?: { type?: string; partial_json?: string; stop_reason?: string };
          usage?: { output_tokens: number };
        };

        if (evt.type === 'message_start') {
          inputTokens = evt.message?.usage?.input_tokens ?? 0;
        } else if (
          evt.type === 'content_block_start' &&
          evt.content_block?.type === 'tool_use'
        ) {
          toolName = evt.content_block.name ?? '';
        } else if (
          evt.type === 'content_block_delta' &&
          evt.delta?.type === 'input_json_delta'
        ) {
          toolInputJson += evt.delta.partial_json ?? '';
        } else if (evt.type === 'message_delta') {
          if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
          if (evt.usage?.output_tokens) outputTokens = evt.usage.output_tokens;
        }
      } catch {
        // Ignore malformed event payloads (keepalives, partial frames).
      }
    }
  }

  if (toolName !== 'submit_classifier_output') {
    throw new Error(
      `classifyWorldsWeekly: stream ended without tool_use block ` +
        `(stop_reason=${stopReason}, tool_name=${toolName || 'none'})`,
    );
  }
  if (!toolInputJson) {
    throw new Error(
      `classifyWorldsWeekly: tool_use block had empty input_json (stop_reason=${stopReason})`,
    );
  }

  let parsed: Omit<ClassifierOutput, 'run_metadata'>;
  try {
    parsed = JSON.parse(toolInputJson);
  } catch (e) {
    throw new Error(
      `classifyWorldsWeekly: failed to parse tool input JSON: ${(e as Error).message}\n` +
        `First 500 chars: ${toolInputJson.slice(0, 500)}`,
    );
  }

  return {
    run_metadata: {
      model: MODEL,
      bundle_mode: bundle.mode,
      window_start: bundle.mode === 'backfill' ? bundle.windowStart : null,
      window_end: bundle.mode === 'backfill' ? bundle.windowEnd : null,
      effective_today: effectiveToday,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
    new_world_candidates: normalizeArrayField(parsed.new_world_candidates, 'new_world_candidates'),
    new_chapter_candidates: normalizeArrayField(parsed.new_chapter_candidates, 'new_chapter_candidates'),
    chapter_updates: normalizeArrayField(parsed.chapter_updates, 'chapter_updates'),
    new_life_context_candidates: normalizeArrayField(
      parsed.new_life_context_candidates,
      'new_life_context_candidates',
    ),
    velocity_updates: normalizeArrayField(parsed.velocity_updates, 'velocity_updates'),
    evolution_proposals: normalizeArrayField(parsed.evolution_proposals, 'evolution_proposals'),
    reactivation_proposals: normalizeArrayField(parsed.reactivation_proposals, 'reactivation_proposals'),
    reclassification_proposals: normalizeArrayField(parsed.reclassification_proposals, 'reclassification_proposals'),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeEffectiveToday(bundle: SignalBundle): string {
  // Live: today. Backfill: the window end (classifier sees the window's "now").
  if (bundle.mode === 'backfill') {
    return bundle.windowEnd.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function buildUserPrompt(
  bundle: SignalBundle,
  activeWorlds: ActiveWorldInput[],
  activeChapters: ActiveChapterInput[],
  effectiveToday: string,
): string {
  const parts: string[] = [
    `effective_today: ${effectiveToday}`,
    `bundle_mode: ${bundle.mode}`,
  ];
  if (bundle.mode === 'backfill') {
    parts.push(`window_start: ${bundle.windowStart}`);
    parts.push(`window_end: ${bundle.windowEnd}`);
  }
  parts.push('');
  parts.push('active_worlds:');
  parts.push(JSON.stringify(activeWorlds, null, 2));
  parts.push('');
  parts.push('active_chapters:');
  parts.push(JSON.stringify(activeChapters, null, 2));
  parts.push('');
  parts.push('signal_bundle:');

  // Strip metadata from the bundle before serializing; keep the signal.
  const { userId: _u, collectedAt: _c, ...signal } = bundle as SignalBundle & {
    userId: string;
    collectedAt: string;
  };
  parts.push(JSON.stringify(signal, null, 2));
  parts.push('');
  parts.push(
    'Classify this signal according to the rules in the system prompt. ' +
      'Call submit_classifier_output exactly once with all six arrays present. ' +
      'Check new chapter candidates against active_chapters and prefer chapter_updates ' +
      'or no emission over re-proposing overlapping arcs.',
  );
  return parts.join('\n');
}

function normalizeArrayField<T>(value: unknown, fieldName: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        console.warn(
          `classifyWorldsWeekly: "${fieldName}" returned as JSON string; parsed to array of length ${parsed.length}`,
        );
        return parsed as T[];
      }
    } catch (e) {
      console.warn(
        `classifyWorldsWeekly: "${fieldName}" looked like JSON string but failed to parse: ${(e as Error).message}`,
      );
    }
  }
  return [];
}
