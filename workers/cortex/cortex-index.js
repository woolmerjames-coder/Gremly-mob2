/**
 * Cortex Proxy Worker
 *
 * Features:
 * - Phase 1 classification (non-streaming) - UPDATED with semantic classification + MULTI-ENTITY DETECTION
 * - Phase 2 enrichment (streaming with flush fixes, padding, heartbeat)
 * - Space Chat (streaming OR non-streaming based on stream flag)
 * - Space Chat Save (v2.8) - classify + enrich in single call for chat saves
 * - Entity Chat (v4.0) - NEW: scoped chat for individual entities (todos, habits, notes)
 * - Session Context (v4.1) - Cross-entity awareness from Supabase with KV caching
 * - General chat/completion
 * - Transcription via OpenAI Whisper
 *
 * Streaming fixes applied:
 * - Initial padding to force flush
 * - Heartbeat pings until first field
 * - Proper charset and no-transform headers
 * - TTFT timing logs
 *
 * Classification v2 (2026-01-02):
 * - Semantic understanding of TODO vs HABIT vs LOG
 * - Concrete/trackable behavior test for habits
 * - Self-talk/venting detection for logs
 * - Verb + object context analysis
 *
 * v2.1 (2026-01-02):
 * - Added time_estimate_minutes for habits (mirrors todo pattern)
 *
 * v2.2 (2026-01-03):
 * - HABIT now requires EXPLICIT tracking intent (frequency, commitment, behavior change)
 * - Without explicit signals, repeatable activities default to TODO
 * - Semantic understanding over keyword matching
 *
 * v2.3 (2026-01-03):
 * - HABIT requires EXPLICIT FREQUENCY or STOP/QUIT + concrete behavior
 * - "more/less/reduce" WITHOUT frequency  LOG/general (fuzzy aspirations)
 * - Evening Sweep handles conversion to habit if user wants
 *
 * v2.4 (2026-01-03):
 * - Added transcription endpoint for voice-to-text via Whisper
 *
 * v2.5 (2026-01-06):
 * - FIX 1: Updated Space Chat persona - balanced, helpful without being pushy
 * - FIX 3: Increased token limits for substantive responses (400 -> 800)
 *
 * v2.6 (2026-01-06):
 * - NEW: space-chat-save endpoint - single call classify + enrich for chat saves
 * - Optimized for saving AI chat responses (different from Mind Drop classification)
 * - Supports full type/subtype: habit (start/break), todo, log (general/idea/journal)
 *
 * v2.7 (2026-01-07):
 * - IMPROVED: space-chat-save classification using Mind Drop logic
 * - HABIT GATE: Explicit frequency OR stop/quit + concrete behavior
 * - TODO: Only with explicit user intent (remind me, add a todo, etc.)
 * - LOG/general: Default for advice, plans, lists, reference material
 * - LOG/idea: Only with explicit brainstorming language
 * - LOG/journal: Emotional reflection from user message
 *
 * v2.8 (2026-01-07):
 * - FIX: TODO detection now based on USER MESSAGE intent, ignores AI response content
 * - FIX: Break habit catches softer patterns (should stop, need to stop, going to stop)
 * - FIX: Frequency parsing for "twice a week", "2x per week", specific days
 * - FIX: Activity-based time estimates (running=30-45min, not 5min)
 *
 * v2.9 (2026-01-08):
 * - NEW: extracted_days field - extracts specific days when mentioned
 * - FIX: "twice a week" now correctly parses to "2x/week" (was "3x/week")
 * - FIX: Day count matches frequency - "Monday and Friday"  "2x/week" + days [1, 5]
 * - FIX: Word-to-number mapping for "twice", "three times", etc.
 * - Day format: array of integers 0-6 (0=Sunday, 1=Monday, ... 6=Saturday)
 *
 * v3.0 (2026-01-09):
 * - NEW: Mood extraction for journal entries
 * - 13 mood values: great, good, okay, low, tired (energy) + anxious, overwhelmed, frustrated, scattered, grateful, hopeful, focused, calm (emotion)
 * - Multi-select support (1-3 moods per entry)
 * - Mood returned as array in Phase 2 enrichment for journal subtype
 *
 * v3.1 (2026-01-09):
 * - FIX: Title must NOT contain mood words (prevents "Feeling Overwhelmed" title + "overwhelmed" chip duplication)
 * - FIX: Implicit mood detection from context (promotion = great, bad news = low, even if not stated)
 *
 * v3.2 (2026-01-09):
 * - NEW: MULTI-ENTITY DETECTION in Phase 1
 * - Detects multiple distinct items in single drop (e.g., "pick up groceries and start running daily")
 * - Returns is_multi: true with items array when multiple intents detected
 * - Smart semantic grouping - keeps shopping lists together, splits genuinely separate intents
 * - Backward compatible - single items return same shape with is_multi: false
 *
 * v3.3 (2026-01-09):
 * - IMPROVED: Multi-entity detection accuracy based on extensive testing
 * - FIX: "X or Y" now correctly stays SINGLE (alternatives, not separate items)
 * - FIX: Causal/explanatory relationships stay SINGLE ("meeting moved, jake is sick")
 * - FIX: Same-intent items stay SINGLE ("birthday + order flowers")
 * - FIX: Multiple emotions = ONE journal (never 2 journal entries)
 * - FIX: Coping responses stay with emotion ("stressed, need to walk" = 1 journal)
 * - FIX: Stronger separator detection ("also", "oh and", "oh yeah")
 * - FIX: Context preservation - split items must be self-contained (no dangling "them")
 * - FIX: Same-domain todos with different verbs/completion times now split correctly
 *
 * v3.4 (2026-01-09):
 * - NEW: Phase 0 returns dominant_bucket and dominant_subtype for modal UX
 * - FIX: Summary titles must be CONTENT-based ("Work Stress + Resume") not TYPE-based ("Two Emotions")
 * - FIX: Rich context drops stay SINGLE (habit with planning notes = one habit, not multi)
 * - FIX: Phase 1 better idea detection (maybe, alternatives, gift idea, thinking about)
 * - FIX: Phase 1 extracts core intent from planning context (finds frequency in notes)
 * v3.6 (2026-01-09):
 * - REVERT: Removed all heuristic rules from Phase 0 - back to pure AI detection
 * - IMPROVED: Phase 0 prompt now strongly emphasizes "or" = alternatives = SINGLE
 * - IMPROVED: Phase 0 prompt has clearer segment extraction examples
 * - IMPROVED: Phase 0 prompt handles 3+ segments (e.g., "anxious, also call mom and cancel gym")
 * - Phase 1 & 2 unchanged from v3.5
 *
 * v4.0 (2026-01-11):
 * - NEW: Entity Chat endpoint for scoped conversations about individual items
 * - Entity context injection (title, body, tags, due date, frequency, etc.)
 * - Preset action support (break_down, research, think_through, whats_blocking, etc.)
 * - Sweep context support (times_moved, days_unscheduled, is_overdue)
 * - Save detection in responses (notes, checklists)
 * - Streaming and non-streaming support
 *
 * v5.0 (2026-02-16):
 * - UPGRADED: organize-day now uses Anthropic Sonnet 4.5 (was gpt-4o-mini)
 * - NEW: Prompt caching on static scheduling rules for ~90% input cost savings
 * - NEW: Expanded context support: userPatterns, spacePriorities, habitContext, recentCompletions
 * - NEW: Daily usage limit (5/day per user via KV)
 * - IMPROVED: ADHD-aware scheduling rules (quick wins, transition costs, streak protection)
 * - IMPROVED: max_tokens 1200 → 4096 for larger task sets
 *
 * v6.0 (Habit Builder V2 — Phase 6):
 * - POST-CREATION: Habit stacking suggestion via prompt (existing habits context)
 * - POST-CREATION: First-week nudge notification
 *   Cron query for notification worker (NOT in this file — add to notification cron):
 *
 *   SELECT h.*
 *   FROM habits h
 *   WHERE h.check_in_after IS NOT NULL
 *     AND h.check_in_after > 0
 *     AND h.check_in_sent IS NOT TRUE
 *     AND h.archived_at IS NULL
 *     AND (
 *       SELECT COUNT(*)
 *       FROM habit_progress hp
 *       WHERE hp.habit_id = h.id
 *         AND hp.occurred_day >= h.start_date
 *     ) >= h.check_in_after;
 *
 *   When triggered: send push notification opening entity chat for the habit.
 *   Then UPDATE habits SET check_in_sent = true WHERE id = h.id;
 */

// DEPRECATED Phase 3 — replaced by chatProjection.js
// import { getSessionContext } from './context/sessionContext.js';
// import { buildSessionContextString, buildDcoContextHeader } from './context/contextBuilder.js';
// import { getDcoContext } from './context/dcoContext.js';
import { buildChatContext, getLifeMapForChat, lastUserText } from './context/chatProjection.js';
import { checkTurn } from './context/corrections.js';
import { fetchPageDetail, pageAnchorFrom } from './context/pageDetail.js';
import { rememberChapterNo } from './context/saidNo.js';
import { judgeKeep } from './context/keep.js';
import { guessChapter } from './context/chapterGuess.js';
import { fetchInngestWorker } from './inngestWorker.js';
import { getUserProfile } from './context/userProfile.js';
import { buildTodayActivity } from './context/todayActivity.js';
import { getAgeGuidance } from './context/gremlyAge.js';
import {
  titleReactionPrompt,
  titleReactionUser,
  reclassifyPrompt as reclassifySystemPrompt,
  detailsPrompt,
  runningSummaryPrompt,
} from './minddropPrompts.js';
import { sentenceCase, fallbackTitle, dashBackstop, lengthBackstop } from '../shared/titles.js';
import { triageMessage, generateLoadingMessage, callMini } from './triage';
import { briefTurnResponse } from './agent/brief.js';
import { weekReadResponse } from './weekRead.js';
import { AGENT_LANES, agentChatFor, prefetchForChat, runChatTurn } from './agent/chat.js';
import {
  geminiGenerate,
  geminiStream,
  parseGeminiChunk,
  buildFollowUpContents,
  convertMessages,
} from './geminiClient.js';
import {
  assembleGenerationConfig,
  buildEntityChatConfig,
  buildGeneralChatConfig,
  buildEntityContextBlock,
  getSearchPolicy,
  MODE_TEMP,
} from './gremlyPersona';
import { aiClassify, aiGenerate, aiStream, getProviders } from './aiProvider.js';
import {
  buildClassifyV3Prompt,
  buildSecondOpinionPrompt,
  buildClarifyPrompt,
  buildClarification,
  formatDropMessage,
  normalizeClassifyV3,
  parseModelJson,
  wantsQuestionWriter,
  AMBIGUITY_TYPES,
  classifyPromptFor,
} from './classifyV3.js';

import { handleHabitRead } from './habitRead.js';
import { fetchItemDetail, itemDetailText, handleItemTopics } from './itemDetail.js';
import { configureModels, models, helperModel } from './models.js';
import { helperFetch } from './helperClient.js';
import { greetingFacts, greetingPrompt } from './greeting.js';
import { readWeekAhead } from './context/weekAhead.js';
import { personNow } from '../shared/day.js';
import { GREMLY_CORE_PERSONA } from './corePersona.js';
import { HABIT_BUILDER_PROMPT } from './habitBuilderPrompt.js';
import { writeWrapWords, WRAP_WORDS_VERSION } from './wrap/words.js';
import { writeAgeWords, AGE_WORDS_VERSION } from './age/words.js';
import { clock } from './agent/tools/words.js';
import { minutesIn } from '../shared/calendar.js';
import { weeklyDayOf } from '../shared/week.js';
import { executeTavilySearch, formatSearchBrief } from './webSearch.js';
import { aiContext, installAiUsageLogging, setAiUsage } from '../shared/aiUsage.js';
import { briefNoCardSection, briefQuestionSection } from './briefTurn.js';
import { relateDrop } from './minddropRelate.js';
import {
  matchEntity,
  applyEntityCardToTriage,
  anchorFrom,
  turnItemSections,
  offerLateCard,
  todayIsoIn,
  checkNewAgainstTracked,
} from './entityMatch.js';
import {
  reconcileSameAs,
  trackedRowsFromItems,
  trackedItemsBlock,
  lateCardCandidate,
  newItemsOnly,
  withValidDays,
  buildChatExtractionPrompt,
  buildPillPrompt,
  buildTitlePrompt,
  withEvidenceRule,
  withEditsRule,
  evidenceGrounded,
  NO_EXTRACTION_MODES,
} from './chatPrompts.js';
import { forgetPerson } from './context/forget.js';
import { fileDrop, filingReply } from '../inngest-jobs/context/filing.js';
import { invalidateChatCache } from '../shared/chatCache.js';

async function getCachedDomainNames(userId, env) {
  if (!userId || !env.CONTEXT_CACHE) return [];
  try {
    const cached = await env.CONTEXT_CACHE.get(`life-map-domains:${userId}`, 'json');
    return Array.isArray(cached) ? cached : [];
  } catch {
    return [];
  }
}

/**
 * Extract the last user/assistant exchange from a messages array.
 * Used to give the triage classifier conversation context.
 */
function extractPreviousExchange(messages) {
  if (!messages || messages.length < 2) return null;
  let assistantMsg = null;
  let userMsg = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!assistantMsg && messages[i].role === 'assistant') {
      assistantMsg = messages[i].content;
    } else if (assistantMsg && !userMsg && messages[i].role === 'user') {
      userMsg = messages[i].content;
      break;
    }
  }
  if (!userMsg || !assistantMsg) return null;
  return { userMsg, assistantMsg };
}

/** The last n user/assistant pairs before the current message, oldest first. */
function extractRecentExchanges(messages, n = 3) {
  const out = [];
  let assistantMsg = null;
  for (let i = (messages || []).length - 1; i >= 0 && out.length < n; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === 'assistant') assistantMsg = m.content;
    else if (m.role === 'user' && assistantMsg) {
      out.push({ userMsg: m.content, assistantMsg });
      assistantMsg = null;
    }
  }
  return out.reverse();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-PHASE SEMANTIC PARSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pre-Phase Semantic Parse Result
 *
 * Extracts structural and semantic facts from user input WITHOUT classifying.
 * Used by the heuristic mapping function to determine bucket.
 *
 * Design principle: Parse structure, don't classify. When uncertain, return "uncertain".
 *
 * @typedef {Object} PrePhaseParseResult
 *
 * @property {string|null} core_verb
 * The main action verb the user would "do" (not auxiliaries like "need", "want", "have").
 * Extract the verb they would actually perform.
 * Examples:
 * - "buy milk" → "buy"
 * - "need to call mom" → "call"
 * - "thinking about starting yoga" → "start" (or "do yoga")
 * - "passport renewal" → null (noun phrase, no verb)
 * - "feeling overwhelmed" → null (state, not action)
 *
 * @property {"start"|"after_hedge"|"after_obligation"|"inside_hypothetical"|"none"} verb_position
 * Where the core verb appears relative to other structural elements.
 * - "start": Verb is at/near beginning, imperative feel ("call mom", "buy groceries")
 * - "after_hedge": Verb follows hedging language ("maybe start running", "might try yoga")
 * - "after_obligation": Verb follows obligation framing ("need to call", "have to finish")
 * - "inside_hypothetical": Verb is in hypothetical frame ("what if I started", "wonder if I should")
 * - "none": No core verb present
 *
 * @property {"directing"|"exploring"|"processing"|"factual"|"uncertain"} frame_type
 * The overall communicative frame of the input.
 * - "directing": User commanding themselves to act ("call mom", "buy groceries", "finish report")
 * - "exploring": Floating possibilities, wondering, brainstorming ("maybe yoga?", "what if I tried...")
 * - "processing": Working through feelings/experiences ("feeling stressed about work", "had a rough day")
 * - "factual": Stating information about the world ("meeting at 3pm", "john's birthday is friday")
 * - "uncertain": Cannot determine the frame
 *
 * @property {boolean|"uncertain"} has_completion_point
 * Could the user say "I'm done with this" at some point?
 * - true: Clear end state exists ("buy milk" → bought, "call mom" → called)
 * - false: Ongoing/continuous ("be healthier", "feel better")
 * - "uncertain": Can't determine
 *
 * @property {boolean} uncertainty_present
 * Is there hedging, doubt, or tentative language?
 * Examples: "maybe", "might", "not sure", "possibly", "thinking about", "could"
 *
 * @property {"verb"|"object_details"|"entire_proposition"|null} uncertainty_target
 * WHAT is uncertain - critical for distinguishing ambiguous from committed.
 * - "verb": Uncertain WHETHER to do the action ("maybe start running", "might try yoga")
 * - "object_details": Committed to act but uncertain about specifics ("buy a gift, maybe book or scarf")
 * - "entire_proposition": Whole thing is hypothetical ("what if I moved to Spain")
 * - null: No uncertainty present
 *
 * @property {boolean} obligation_framing
 * Uses obligation/necessity language.
 * Examples: "need to", "have to", "must", "should", "gotta", "ought to"
 *
 * @property {boolean} frequency_present
 * Explicit repetition intent detected.
 * Examples: "daily", "every morning", "twice a week", "on Mondays", "3x per week"
 *
 * @property {"explicit"|"day_names"|"stop_quit"|null} frequency_type
 * Type of frequency signal if present.
 * - "explicit": Clear frequency ("daily", "every morning", "3x per week", "twice a week")
 * - "day_names": Specific days mentioned ("on Tuesdays and Thursdays", "every Monday")
 * - "stop_quit": Cessation language implying ongoing behavior ("stop smoking", "quit caffeine", "cut out sugar")
 * - null: No frequency signal
 *
 * @property {boolean} direction_without_schedule
 * Wanting more/less of something without specifying when/how often.
 * Examples: "drink more water", "be more present", "reduce screen time", "eat healthier"
 * Note: This is a fuzzy aspiration, not a trackable habit.
 *
 * @property {boolean} has_occasion_noun
 * Does the text reference a specific occasion, appointment, event, or scheduled occurrence?
 *
 * @property {boolean} is_self_restriction
 * Is the user declaring a personal behavioral rule, boundary, or prohibition?
 *
 * @property {boolean} has_implied_recurrence
 * Does the text describe a behavior anchored to a recurring life context without explicit frequency words?
 *
 * @property {boolean} emotional_content
 * Contains emotional expression, venting, or processing feelings.
 * Examples: "feeling overwhelmed", "so frustrated with work", "grateful for today"
 *
 * @property {boolean} hypothetical_framing
 * Framed as hypothetical or speculative.
 * Examples: "what if", "I wonder if", "could be cool to", "imagine if"
 *
 * @property {boolean} factual_statement
 * Stating a fact about the world (not a task or feeling).
 * Examples: "meeting moved to 3pm", "john's birthday is friday", "rent is due on the 1st"
 *
 * @property {boolean} self_reflection
 * Asking about or analyzing own patterns/feelings.
 * Examples: "why do I always procrastinate", "I notice I feel anxious before meetings"
 *
 * @property {boolean} is_noun_phrase_only
 * Just a noun/noun phrase with no verb or framing.
 * Examples: "passport renewal", "groceries", "mom's birthday gift"
 *
 * @property {"high"|"medium"|"low"} parse_confidence
 * How confident the parse is overall.
 * - "high": Clear structure, unambiguous parsing
 * - "medium": Some structural elements unclear but main parse is solid
 * - "low": Significant uncertainty in the parse
 *
 * @property {"self"|"external"|"other_person"} action_target
 * Who or what is the subject of change or action.
 * - "self": The user will do or change something about themselves
 * - "external": Describing how something else should behave or be configured
 * - "other_person": About someone else's behavior
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-PHASE HEURISTIC MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if preparse result indicates a committed action.
 *
 * A committed action has:
 * - A core verb (something to DO)
 * - A directing frame OR obligation framing (user is telling themselves to act)
 * - No hedging on whether to do the action (uncertainty may exist on details, but not on the verb itself)
 *
 * @param {PrePhaseParseResult} preparse - The preparse result object
 * @returns {boolean} True if this represents a committed action
 */
function isCommittedAction(preparse) {
  // Must have a core verb
  if (!preparse.core_verb) return false;

  // Must be in a directing frame OR have obligation framing
  const hasDirectingIntent = preparse.frame_type === 'directing' || preparse.obligation_framing;
  if (!hasDirectingIntent) return false;

  // Must NOT have uncertainty on the verb itself (hedged action)
  if (preparse.uncertainty_present && preparse.uncertainty_target === 'verb') return false;

  return true;
}

/**
 * @typedef {Object} FastPathClassification
 * @property {false} needsPhase1 - Fast path taken, no AI needed
 * @property {'todo'|'habit'|'log'} bucket - The determined bucket
 * @property {'journal'|'idea'|'general'|null} subtype - Log subtype if applicable
 * @property {'start_habit'|'break_habit'|null} habitSubtype - Habit subtype if applicable
 */

/**
 * @typedef {Object} NeedsPhase1Classification
 * @property {true} needsPhase1 - Needs Phase 1 AI classification
 * @property {string} reason - Why fast path couldn't be used
 */

// ──────────────────────────────────────────────────────────────────────────────
// Convergence scorers using gate → disqualifier → confirming signal count.
// Each scorer reads PreParse observations. No single field can fast-path alone.
// A score of 0.7+ requires 3+ independent signals to converge.
// ──────────────────────────────────────────────────────────────────────────────

function mapScore(confirming) {
  if (confirming >= 5) return 0.9;
  if (confirming >= 4) return 0.85;
  if (confirming >= 3) return 0.7;
  if (confirming >= 2) return 0.5;
  if (confirming >= 1) return 0.3;
  return 0.15;
}

function scoreTodo(p, hasUserSelectedDate = false) {
  // ── REQUIRED GATE (Tier 1 — reliable) ──
  if (!p.core_verb) return 0.0;

  // ── DISQUALIFIERS (Tier 1 — reliable fields only) ──

  // Past reflection — user is processing, not directing action
  if (p.temporal_orientation === 'past' && p.is_narrative_reflection) return 0.0;

  // Emotional expression without imperative — journal territory
  if (p.has_emotion_language && !p.is_command) return 0.0;

  // State verb — can't be marked done
  if (p.is_state_verb) return 0.0;

  // Direction without destination — vague aspiration, not a finishable action
  if (
    p.references_current_state &&
    p.change_is_open_ended &&
    (p.struct_modifier_target === 'action' || p.degree_shift_target === 'own_action')
  )
    return 0.0;

  // Full cessation of own behaviour — habit_break territory
  if (p.has_discontinuation && !p.is_command) return 0.0;

  // ── CONFIRMING SIGNALS (Tier 1 — strong) ──
  let c = 0;
  if (p.is_command) c++;
  if (!p.has_emotion_language) c++;
  if (p.temporal_orientation === 'future') c++;
  if (!p.has_discontinuation && !p.has_prohibition) c++;

  // ── CONFIRMING SIGNALS (Tier 2 — interpretive, can be wrong) ──
  if (p.user_intent_mode === 'directing') c++;
  if (p.action_direction === 'external') c++;
  if (p.boundary_type === 'one_time') c++;
  if (!p.is_ongoing_practice) c++;

  const recurrenceSignals = [
    p.is_ongoing_practice,
    p.has_routine_anchor,
    p.struct_completion === 'recurring' && !p.is_single_instance,
    p.has_explicit_multiplicity,
    p.frequency_present,
  ].filter(Boolean).length;

  if (recurrenceSignals >= 2) {
    return Math.min(mapScore(c), 0.5);
  }
  return mapScore(c);
}

function scoreHabitBuild(p, hasUserSelectedDate = false) {
  // REQUIRED: must have recurrence signal
  if (!p.is_ongoing_practice && !p.has_routine_anchor) return 0.0;
  // DISQUALIFIERS
  if (p.temporal_orientation === 'past') return 0.0;
  if (p.has_prohibition || p.has_discontinuation) return 0.0;
  if (p.is_single_instance && p.has_date_or_time) return 0.0;
  // CONFIRMING SIGNALS
  let c = 0;
  if (p.is_ongoing_practice) c++;
  if (p.has_routine_anchor) c++;
  if (p.time_role === 'characteristic') c++;
  if (p.action_direction === 'own_behavior') c++;
  if (p.is_about_personal_patterns) c++;
  if (p.user_mode_record_or_change === 'requesting_change') c++;
  if (p.is_command && p.core_verb) c++;
  // ASPIRATION DAMPENER: hedging or exploring caps score to force Phase 1
  if (p.has_hedging || p.user_intent_mode === 'exploring') {
    return Math.min(mapScore(c), 0.5);
  }
  return mapScore(c);
}

function scoreHabitBreak(p, hasUserSelectedDate = false) {
  // REQUIRED: must have cessation, prohibition, or relative change signal
  if (
    !p.has_discontinuation &&
    !p.has_prohibition &&
    !p.has_relative_change &&
    !p.has_restriction_boundary
  )
    return 0.0;
  // DISQUALIFIERS
  if (p.temporal_orientation === 'past' && p.is_narrative_reflection) return 0.0;
  // CONFIRMING SIGNALS
  let c = 0;
  if (p.has_discontinuation) c++;
  if (p.has_prohibition) c++;
  if (p.action_direction === 'own_behavior') c++;
  if (p.boundary_type === 'ongoing_boundary') c++;
  if (p.is_about_personal_patterns) c++;
  if (p.user_mode_record_or_change === 'requesting_change') c++;
  if (p.references_existing_pattern) c++;
  if (p.has_restriction_boundary) c++;
  // VAGUENESS CAP: relative change without concrete cessation/prohibition forces Phase 1
  if (!p.has_discontinuation && !p.has_prohibition) {
    return Math.min(mapScore(c), 0.4);
  }
  return mapScore(c);
}

function scoreEvent(p, hasUserSelectedDate = false) {
  // REQUIRED: must be about something scheduled/occurring
  // BUT: if user explicitly selected a date, that IS the scheduling signal
  if (!p.is_scheduled_occurrence && !hasUserSelectedDate) return 0.0;
  // DISQUALIFIERS
  if (p.is_command && !p.is_scheduled_occurrence && !hasUserSelectedDate) return 0.0;
  // CONFIRMING SIGNALS
  let c = 0;
  if (p.has_date_or_time) c++;
  if (p.has_occasion_noun) c++;
  if (p.user_mode_record_or_change === 'recording') c++;
  if (p.user_intent_mode === 'capturing') c++;
  if (p.is_storing_information) c++;
  if (p.time_role === 'when') c++;
  if (p.is_single_instance) c++;
  // User selected a date — strong signal this is an event
  if (hasUserSelectedDate) c++;
  return mapScore(c);
}

function scoreJournal(p, hasUserSelectedDate = false) {
  // REQUIRED: must have at least one emotional or reflective signal
  if (
    !p.has_emotion_language &&
    !p.is_about_emotion &&
    !p.is_about_feelings_not_actions &&
    !p.is_narrative_reflection
  )
    return 0.0;
  // DISQUALIFIERS
  if (p.is_command && !p.is_about_emotion && !p.has_emotion_language) return 0.0;
  // CONFIRMING SIGNALS
  let c = 0;
  if (p.has_emotion_language) c++;
  if (p.is_about_emotion) c++;
  if (p.is_about_feelings_not_actions) c++;
  if (p.is_narrative_reflection) c++;
  if (p.temporal_orientation === 'past') c++;
  if (p.user_intent_mode === 'processing') c++;
  if (p.self_reflection) c++;
  if (p.is_past_or_present) c++;
  return mapScore(c);
}

function scoreIdea(p, hasUserSelectedDate = false) {
  // REQUIRED: must have speculation
  if (!p.has_speculation && p.struct_novelty !== 'novel') return 0.0;
  // DISQUALIFIERS
  if (p.is_command && p.user_intent_mode === 'directing') return 0.0;
  // User selected a date — penalize idea, they have temporal intent
  if (hasUserSelectedDate) return 0.0;
  // CONFIRMING SIGNALS
  let c = 0;
  if (p.has_speculation) c++;
  if (p.has_hedging) c++;
  if (p.user_intent_mode === 'exploring') c++;
  if (!p.is_command) c++;
  if (!p.has_verb || p.core_verb === 'want') c++;
  if (p.temporal_orientation !== 'past') c++;
  return mapScore(c);
}

function scoreGeneral(p, hasUserSelectedDate = false) {
  // REQUIRED: must have factual/reference signal
  if (!p.is_declarative && !p.is_storing_information && !p.factual_statement) return 0.0;
  // DISQUALIFIERS
  if (p.is_scheduled_occurrence && p.has_date_or_time) return 0.0;
  if (p.has_emotion_language) return 0.0;
  if (p.has_speculation) return 0.0;
  // User selected a date — penalize general, they have temporal intent
  if (hasUserSelectedDate) return 0.0;
  // CONFIRMING SIGNALS
  let c = 0;
  if (p.is_declarative) c++;
  if (p.is_storing_information) c++;
  if (p.factual_statement) c++;
  if (p.user_intent_mode === 'capturing') c++;
  if (p.user_mode_record_or_change === 'recording') c++;
  if (!p.is_command) c++;
  if (p.time_role === 'characteristic' || p.time_role === 'no_time') c++;
  return mapScore(c);
}

// ──────────────────────────────────────────────────────────────────────────────
// Score-to-classification mapper
// ──────────────────────────────────────────────────────────────────────────────

function mapWinnerToClassification(winnerType) {
  switch (winnerType) {
    case 'todo':
      return { needsPhase1: false, bucket: 'todo', subtype: null, habitSubtype: null };
    case 'habit_build':
      return { needsPhase1: false, bucket: 'habit', subtype: null, habitSubtype: 'start_habit' };
    case 'habit_break':
      return { needsPhase1: false, bucket: 'habit', subtype: null, habitSubtype: 'break_habit' };
    case 'event':
      return { needsPhase1: false, bucket: 'log', subtype: 'event', habitSubtype: null };
    case 'journal':
      return { needsPhase1: false, bucket: 'log', subtype: 'journal', habitSubtype: null };
    case 'idea':
      return { needsPhase1: false, bucket: 'log', subtype: 'idea', habitSubtype: null };
    case 'general':
      return { needsPhase1: false, bucket: 'log', subtype: 'general', habitSubtype: null };
    default:
      return { needsPhase1: true, reason: 'unknown_scorer_type' };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Decision function — replaces the waterfall if/else chain
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Classify a pre-parsed drop using independent scorers per type.
 * Each scorer evaluates the same PreParse signals but only looks at
 * signals relevant to its type. Adding or changing one scorer cannot
 * affect another scorer's output.
 *
 * Decision thresholds:
 * - Clear winner (top >= 0.6, gap to second >= 0.2): fast-path
 * - Otherwise: bail to Phase 1 AI with competing types as context
 */
function mapPreparseToClassification(preparse, options = {}) {
  const { hasUserSelectedDate = false } = options;
  // Low confidence parse — always bail to Phase 1
  if (preparse.parse_confidence === 'low') {
    return { needsPhase1: true, reason: 'low_parse_confidence' };
  }

  // Ultra-short inputs with no strong signal — bail to Phase 1
  const textLen = (preparse.text_preview || '').trim().length;
  if (textLen > 0 && textLen <= 5) {
    const maxScore = Math.max(
      scoreTodo(preparse, hasUserSelectedDate),
      scoreHabitBuild(preparse, hasUserSelectedDate),
      scoreHabitBreak(preparse, hasUserSelectedDate),
      scoreEvent(preparse, hasUserSelectedDate),
      scoreJournal(preparse, hasUserSelectedDate),
      scoreIdea(preparse, hasUserSelectedDate),
      scoreGeneral(preparse, hasUserSelectedDate),
    );
    if (maxScore < 0.7) {
      return { needsPhase1: true, reason: 'ultra_short_input' };
    }
  }

  // Run all scorers — each uses only PreParse fields
  const scores = {
    todo: scoreTodo(preparse, hasUserSelectedDate),
    habit_build: scoreHabitBuild(preparse, hasUserSelectedDate),
    habit_break: scoreHabitBreak(preparse, hasUserSelectedDate),
    event: scoreEvent(preparse, hasUserSelectedDate),
    journal: scoreJournal(preparse, hasUserSelectedDate),
    idea: scoreIdea(preparse, hasUserSelectedDate),
    general: scoreGeneral(preparse, hasUserSelectedDate),
  };

  // Rank by score
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = ranked[0];
  const [secondType, secondScore] = ranked[1];
  const gap = topScore - secondScore;

  // Log scores for debugging
  console.log('[Scorer] Results', {
    text: preparse.text_preview || '',
    scores: Object.fromEntries(ranked.map(([k, v]) => [k, Math.round(v * 100) / 100])),
    winner: topType,
    topScore: Math.round(topScore * 100) / 100,
    gap: Math.round(gap * 100) / 100,
    decision: topScore >= 0.6 && gap >= 0.2 ? 'fast_path' : 'phase1',
  });

  // Clear winner — fast path
  if (topScore >= 0.6 && gap >= 0.2) {
    return mapWinnerToClassification(topType);
  }

  // No clear winner — bail to Phase 1 with competing types as context
  return {
    needsPhase1: true,
    reason: `scorer_${topType}_vs_${secondType}`,
    scores: Object.fromEntries(ranked.map(([k, v]) => [k, Math.round(v * 100) / 100])),
  };
}

/**
 * Compute plausible interpretations from pre-phase parse signals.
 *
 * This is a pure deterministic function — no AI calls. It takes the structured
 * signals extracted by the preparse step and returns an array of plausible
 * bucket interpretations for the input. Each interpretation represents a
 * genuinely distinct way the user might have intended their mind drop.
 *
 * Used by Phase 1.5 to seed the clarification options with signal-driven
 * candidates before the AI generates contextual labels and questions.
 *
 * @param {object} preparse - The pre-phase parse result object containing
 *   structural signals (core_verb, frame_type, frequency_present, etc.)
 * @returns {Array<{bucket: string|null, subtype: string|null, habitSubtype: string|null, dateField: string|null}>}
 *   Array of 2-4 plausible interpretation objects.
 */
function computePlausibleInterpretations(preparse) {
  const interpretations = [];

  // --- Evaluate each bucket independently ---

  // Todo: plausible when there's a verb, noun phrase, obligation, or completion point
  const todoPlausible =
    preparse.core_verb != null ||
    preparse.is_noun_phrase_only === true ||
    preparse.obligation_framing === true ||
    preparse.has_completion_point === true;

  if (todoPlausible) {
    interpretations.push({ bucket: 'todo', subtype: null, habitSubtype: null, dateField: null });
  }

  // Habit/build: plausible when direction without schedule, or explicit/day_names frequency
  const habitBuildPlausible =
    preparse.direction_without_schedule === true ||
    (preparse.frequency_present === true &&
      (preparse.frequency_type === 'explicit' || preparse.frequency_type === 'day_names'));

  if (habitBuildPlausible) {
    interpretations.push({
      bucket: 'habit',
      subtype: null,
      habitSubtype: 'start_habit',
      dateField: null,
    });
  }

  // Habit/break: plausible when frequency_type is stop_quit
  if (preparse.frequency_type === 'stop_quit') {
    interpretations.push({
      bucket: 'habit',
      subtype: null,
      habitSubtype: 'break_habit',
      dateField: null,
    });
  }

  // Log/journal: plausible when emotional content, self-reflection, or processing frame
  const journalPlausible =
    preparse.emotional_content === true ||
    preparse.self_reflection === true ||
    preparse.frame_type === 'processing';

  if (journalPlausible) {
    interpretations.push({
      bucket: 'log',
      subtype: 'journal',
      habitSubtype: null,
      dateField: null,
    });
  }

  // Log/idea: plausible when exploring frame, hedged verb/proposition, or hypothetical
  const ideaPlausible =
    preparse.frame_type === 'exploring' ||
    (preparse.uncertainty_present === true &&
      (preparse.uncertainty_target === 'verb' ||
        preparse.uncertainty_target === 'entire_proposition')) ||
    preparse.hypothetical_framing === true;

  // Log/general: plausible unless pure emotional processing
  const pureEmotionalProcessing =
    preparse.emotional_content === true && preparse.frame_type === 'processing';
  const generalPlausible = !pureEmotionalProcessing;

  // Resolve log/general vs log/idea conflict:
  // Both can appear only when frame_type is "exploring" AND is_noun_phrase_only is true.
  // Otherwise, include only the one with stronger signal.
  const bothLogsAllowed =
    preparse.frame_type === 'exploring' && preparse.is_noun_phrase_only === true;

  if (ideaPlausible && generalPlausible) {
    if (bothLogsAllowed) {
      interpretations.push({
        bucket: 'log',
        subtype: 'general',
        habitSubtype: null,
        dateField: preparse.temporal_specificity ? 'target_date' : null,
      });
      interpretations.push({ bucket: 'log', subtype: 'idea', habitSubtype: null, dateField: null });
    } else if (ideaPlausible && preparse.frame_type === 'exploring') {
      // Idea has stronger signal
      interpretations.push({ bucket: 'log', subtype: 'idea', habitSubtype: null, dateField: null });
    } else {
      // General has stronger signal (default)
      interpretations.push({
        bucket: 'log',
        subtype: 'general',
        habitSubtype: null,
        dateField: preparse.temporal_specificity ? 'target_date' : null,
      });
    }
  } else if (ideaPlausible) {
    interpretations.push({ bucket: 'log', subtype: 'idea', habitSubtype: null, dateField: null });
  } else if (generalPlausible) {
    interpretations.push({
      bucket: 'log',
      subtype: 'general',
      habitSubtype: null,
      dateField: preparse.temporal_specificity ? 'target_date' : null,
    });
  }

  // --- Safety: enforce 2-4 interpretations ---

  // Cap at 4: drop log/idea first, then log/journal
  if (interpretations.length > 4) {
    const ideaIdx = interpretations.findIndex((i) => i.subtype === 'idea');
    if (ideaIdx !== -1) interpretations.splice(ideaIdx, 1);
  }
  if (interpretations.length > 4) {
    const journalIdx = interpretations.findIndex((i) => i.subtype === 'journal');
    if (journalIdx !== -1) interpretations.splice(journalIdx, 1);
  }

  // Floor at 2: add fallback if needed
  if (interpretations.length < 2) {
    const hasGeneral = interpretations.some((i) => i.bucket === 'log' && i.subtype === 'general');
    const hasTodo = interpretations.some((i) => i.bucket === 'todo');

    if (!hasGeneral) {
      interpretations.push({
        bucket: 'log',
        subtype: 'general',
        habitSubtype: null,
        dateField: preparse.temporal_specificity ? 'target_date' : null,
      });
    } else if (!hasTodo) {
      interpretations.push({ bucket: 'todo', subtype: null, habitSubtype: null, dateField: null });
    }
  }

  return interpretations;
}

const PREPARSE_INTENT_PROMPT = `Extract these facts from the input. Return JSON only.

- g1: Is this sentence a bare imperative — a direct instruction that contains NO stated subject? A bare imperative has the verb as the grammatical starting point of the clause, with the actor entirely implied rather than named. The moment a subject appears — particularly a first-person subject — the sentence is no longer an imperative. It becomes a statement about the speaker's internal state: their felt obligation, desire, or aspiration. The distinction matters: imperatives direct action. Statements with a stated subject describe the speaker's relationship to the action — what they feel they should do, want to do, or need to do. These are fundamentally different speech acts even when they reference the same underlying activity. Only return true when there is genuinely no stated subject and the sentence functions as a direct instruction. (boolean)
- g2: Does the text state a fact about something — providing information about a subject rather than instructing someone to act? A declarative statement asserts that something IS the case. It assigns a property, attribute, date, status, or characteristic to a subject. The subject and its predicate may appear in any order and the copula may be implicit rather than explicitly written. Noun phrases that name a subject alongside a property — where the relationship between them is one of attribution or identity — are declarative even when the verb is omitted. The core test: is the text TELLING you something about the world, or TELLING you to do something? Assertions about the world are declarative. Instructions to act are not. (boolean)
- g3: Is the user floating a hypothetical or wondering about a possibility? Speculation means the user is IMAGINING something that does not currently exist — the content lives entirely in the realm of "could be" rather than "is" or "was." The key distinction is between three orientations: the user can be directed toward WHAT IS (investigating, researching, checking — not speculation), toward WHAT THEY FEEL (processing, reflecting — not speculation), or toward WHAT COULD BE (imagining, proposing, wondering — this IS speculation). The test: does the substance of the thought exist only in the user's imagination at this moment? If the user is describing something that has no reality yet and they are entertaining whether it should, that is speculation regardless of how tentatively or confidently they express it. (boolean)
- g4: Is the text describing something that already happened or is currently happening — past or present tense? (boolean)
- g6: Is the user narrating or reflecting on something that happened to them — recounting an experience, describing a moment, or processing something they went through? (boolean)`;

const PREPARSE_CONTENT_PROMPT = `Extract these facts from the input. Return JSON only.

- c1: Is the text about something that is SCHEDULED TO HAPPEN at a point in time — not something the user needs to DO, but something that WILL OCCUR? This includes any scheduled occurrence the user would want to be aware of — something they would note in a calendar because it exists in time. The test: is the text noting that something EXISTS IN TIME, not instructing an action? (boolean)
- c1r: "one sentence explaining your choice for c1"
- c3: Is the user describing their emotional or physical state — expressing how they feel right now or how they felt? The WORDS themselves must convey feeling. Scheduling language, action descriptions, and factual statements carry no emotional weight regardless of the topic. (boolean)
- c3r: "one sentence explaining your choice for c3"
- c4: Is the user describing their own inner state — their thoughts, feelings, or reflections? (boolean)
- c4r: "one sentence explaining your choice for c4"
- s1: Is the user the one who will act or be affected, or is the text about an external system, product, or other person? "user" / "external" / "other_person"`;

const PREPARSE_STRUCTURE_PROMPT = `Extract these facts from the input. Return JSON only.

- t1: Does the text contain a specific date, named day of the week, or clock time? (boolean)
- t2a1: Does the text state a specific COUNT of how many times the action will occur? The text must make a numerical claim about repetition — how many instances of the action are intended within a given period. If no numerical count of occurrences is stated, return false. (boolean)
- t2a3a: Does the text specify a measurable amount of the action — a defined quantity, duration, or count that states how much of the action is intended? (boolean)
- t2a3b: Is that amount bounded by a time period that it must fit WITHIN — does the text pair the amount with a period that acts as its container or allowance? The time period is not telling you WHEN to do the action — it is telling you the window that the amount is measured against. Only relevant when t2a3a is true — return false if t2a3a is false. (boolean)
- t2a3c: Does that containing time period naturally recur — does it exist again and again as part of the rhythm of life without anyone scheduling it? If the period is a single specific upcoming occasion that will pass and not return, return false. If the period is a type of time that keeps occurring, return true. Only relevant when t2a3b is true — return false if t2a3b is false. (boolean)
- t2b1: Is the USER the one who will personally perform this action each time it occurs? The user must be the agent — the person who carries out the activity. If the action is performed by an external system, another person, or something that happens TO the user without their active participation, return false. (boolean)
- t2b2: Is the action directed at the FUTURE — something the user intends to do going forward? Return false if the text is reporting what has already been happening, describing a past pattern, or explaining how something external currently operates. Return true only when the action represents forward-looking intended behaviour. (boolean)
- t3: Does the text anchor a behavior to a moment in the user's day that recurs by its very nature — not because anyone scheduled it, but because the structure of a human day inherently contains it? A routine anchor is a reference to a point in the daily cycle that exists universally and repeats every day without deliberate planning. The distinction from other time references: a routine anchor recurs because human days have a predictable rhythm. A calendar date, a named weekday, or a clock time recurs because of a scheduling system. If the referenced moment would still exist even if the user owned no calendar and no clock, it is a routine anchor. If it requires a calendar or clock to identify, it is not. (boolean)
- t4: Does the text contain a temporal reference that SCOPES the action to a SINGLE OCCASION? Temporal scoping means the time reference creates a boundary around the action — placing it within a specific, finite time window rather than leaving it open-ended. Named days, named dates, relative time references pointing to a specific upcoming window, and calendar-specific anchors all create temporal scope. The test: does the time reference answer "WHEN specifically?" in a way that limits this to one occurrence? If the time reference describes a PATTERN or CHARACTERISTIC rather than scoping to one occasion, it does not qualify — recurrence and single instance are mutually exclusive. When both a specific time window and a recurrence signal are present in the same text, recurrence takes precedence and t4 is false. (boolean)
- t4r: "one sentence identifying the specific temporal scoping reference, or explaining why no temporal scope is present"`;

const PREPARSE_BEHAVIORAL_PROMPT = `Extract these facts from the input. Return JSON only.

- b1: Does the text use NEGATIVE framing to set a boundary — expressing that something should NOT happen, is NOT allowed, or WILL NOT be done? Positive recommendations or obligations about what SHOULD happen are not prohibition. (boolean)
- b2a: Is the user expressing that a behavior should FULLY CEASE — reaching a target state of ZERO? The user must be communicating that something should stop entirely, be eliminated, or no longer occur at all. Wanting LESS of something, wanting to REDUCE something, or wanting a DIFFERENT AMOUNT of something does NOT qualify — those express a desire for relative change, not full cessation. The test: is the user's intended end state for this behavior unambiguously zero occurrences? If the desired state is "less than now" rather than "none at all", return false. Relative or directional language without a zero-target is not discontinuation. (boolean)
- b2ar: "one sentence explaining whether the target state is zero or merely reduced"
- b2b: Is the text about a behavior or pattern that ALREADY EXISTS in the user's life? This can be established in two ways: (1) The user explicitly describes a current or past pattern. (2) The user's language LOGICALLY ENTAILS an existing pattern. Cessation, prohibition, and reduction language inherently imply that the behavior already exists — it is impossible to stop, quit, reduce, limit, or cut back on something that is not already happening. When the user expresses wanting to end, reduce, or restrict a behavior, the existence of that behavior as a current pattern is a logical certainty, not an inference. Return true whenever the behavior's current existence is either stated or logically entailed. (boolean)
- b2br: "one sentence explaining whether the existing pattern is explicitly stated or logically entailed by cessation/reduction language"
- b3: Does the text express a desire for relative change — wanting a different amount or quality of something — without specifying a concrete target or schedule? (boolean)
- b4a1: Does the text reference the user's CURRENT STATE or CURRENT LEVEL and express that it should be DIFFERENT? The language must contain an implicit claim about how things are NOW and a desire to move away from that. The test: does the language require you to know the user's current situation to understand what they want? If what the user is describing is fully defined without any reference to how things currently are, return false. If the meaning depends on a comparison to an unstated present baseline, return true. (boolean)
- b4a2: Is the desired change OPEN-ENDED — expressed as a direction of movement without defining where to stop? The user wants to move along a spectrum but has not stated a point where the change would be complete. The test: if someone asked "how much change is enough?" does the text provide a definite answer? If the text names a specific boundary where the change is achieved, return false. If the text only indicates a direction to move with no stated boundary, return true. Only relevant when b4a1 is true — return false if b4a1 is false. (boolean)
- b6: Is the user setting an UPPER BOUNDARY on their own consumption or behaviour — expressing that a certain amount, frequency, or duration should not be exceeded? The user is defining a ceiling — a maximum allowable level that they intend to stay within. The behaviour is not being eliminated, it is being capped. (boolean)`;

const PREPARSE_META_PROMPT = `Extract these facts from the input. Return JSON only.

- m1: Does the text use hedging or tentative language expressing doubt about whether to proceed? (boolean)
- m2: Does the text use language expressing duty or necessity? (boolean)
- m3: Overall clarity: "high" (clear meaning), "medium" (some ambiguity), or "low" (very unclear).
- c2: Is the primary purpose of this text to STORE A PIECE OF INFORMATION for future reference? The text must be providing a data point to remember, not directing an action to take or expressing a commitment. (boolean)
- c2r: "one sentence explaining your choice for c2"`;

const PREPARSE_RELATIONAL_PROMPT = `Analyze the RELATIONSHIPS between elements in this text. Return JSON only.

- r1: Is any action in this text directed at the user's OWN BEHAVIOR or PATTERNS — or is it directed at an EXTERNAL OBJECT, SERVICE, or THING? "own_behavior" / "external" / "unclear"
- r1r: "one sentence explaining your choice for r1"
- r2: If there is a time element, is it telling you WHEN a specific one-time thing will happen, or is it describing a PROPERTY or CHARACTERISTIC of the subject — how it works, how long it lasts, or how often it occurs? "when" / "characteristic" / "no_time"
- r2r: "one sentence explaining your choice for r2"
- r3: If there is negation or cessation, is the user setting an ONGOING BOUNDARY they will need to maintain, or performing a ONE-TIME ACTION that will be complete once done? "ongoing_boundary" / "one_time" / "no_negation"
- r3r: "one sentence explaining your choice for r3"`;

const PREPARSE_HOLISTIC_PROMPT = `Look at this text as a whole and answer these questions. Return JSON only.

- m4: Is the user oriented toward the PAST (reflecting on what happened), FUTURE (looking ahead at what is coming or what they will do), or NEITHER (stating a standing fact or exploring)? "past" / "future" / "neither"
- m5: Is the user RECORDING something (capturing information or noting what exists) or REQUESTING A CHANGE (directing themselves or others to act or behave differently)? "recording" / "requesting_change" / "neither"
- m6a: Is this drop primarily about the user's OWN PATTERNS, HABITS, or LIFESTYLE — something about how they live or behave? (boolean)
- m6b: Is this drop primarily about STORING A FACT or PIECE OF INFORMATION for later? (boolean)
- m6c: Is this drop primarily about a FEELING or EMOTIONAL EXPERIENCE? (boolean)`;

/**
 * Run a single mini-parse via OpenAI.
 *
 * @param {string} text - The input text to parse
 * @param {Object} env - Environment with OPENAI_API_KEY
 * @param {string} systemPrompt - The system prompt for this mini-parse
 * @returns {Promise<Object>} Parsed JSON result
 */

const STRUCTURAL_PARSE_PROMPT = `Parse the structural components of this text. Return JSON only.

- verb: What is the main action verb — the thing someone would DO? 
  Return the verb as a string. If no action verb is present, return null.

- has_verb: Is there a word in this text that describes an activity 
  a person PERFORMS — something that occupies their time and effort 
  while they do it? If no such word is present, return false. (boolean)

- object: What is the THING being acted upon — the noun that receives 
  the action of the verb? This is the direct object. If the verb has 
  no external object (the action is self-contained), return null. 
  Return the noun phrase as a string, or null.

- modifier: Is there comparative or qualitative language that expresses 
  a desired shift in degree, amount, or quality? Return the modifier 
  word or phrase as a string. If no comparative or qualitative modifier 
  is present, return null.

- modifier_target: Does the modifier describe a property of the OBJECT 
  (the thing being sought, obtained, or selected) or does it describe 
  the ACTION itself (how the user performs, consumes, or engages)? 
  Only relevant when both modifier and object are present. When the 
  modifier and object form a unit that specifies WHICH KIND of thing 
  the user wants, return "object". When the modifier describes the 
  manner, degree, or extent of the user's own activity, return "action". 
  When there is no object and the modifier stands alone with the verb, 
  return "action". Return null when modifier is null. 
  ("object" / "action" / null)

- time_reference: Is there a temporal phrase that indicates WHEN or 
  HOW OFTEN? Return the temporal phrase as a string. If no temporal 
  language is present, return null.

- time_binding: Can the time reference be placed on ONE SPECIFIC DATE 
  on a calendar? If it points to a single datable occasion, return 
  "bound". If it describes a recurring slot or pattern that cannot be 
  pinpointed to one calendar date, return "unbound". If it could 
  reasonably mean either, return "ambiguous". Only relevant when 
  time_reference is not null — return null when time_reference is null. 
  ("bound" / "unbound" / "ambiguous" / null)

- verb_type: Does the verb describe an ACTION the user performs — an 
  activity that occupies time and effort — or a STATE the user 
  inhabits — a condition or quality of being? Return null when has_verb 
  is false. ("action" / "state" / null)

- intent_mode: What is the user DOING by writing this? Telling 
  themselves or someone to act = "directing". Storing information 
  for later = "capturing". Working through a feeling or experience 
  = "processing". Thinking out loud or wondering = "exploring". 
  ("directing" / "capturing" / "processing" / "exploring")

- completion: Based ONLY on what this text says, is the user committing to a recurring pattern or setting up a one-time action? Return "done" when the text describes a single action to perform, even if the underlying activity is something that could theoretically be repeated in the future. Return "recurring" ONLY when the text contains explicit frequency, schedule, or repetition language indicating the user intends this to happen more than once. The absence of frequency or schedule language means "done". Return "unclear" when genuinely ambiguous. ("done" / "recurring" / "unclear")

- novelty: Is the PRIMARY SUBJECT of this text something that 
  does not currently exist? Not the actions or feelings mentioned, 
  but the THING the text is fundamentally about. If the text is 
  fundamentally about a real action the user will take, a real 
  experience they had, or a real thing in their life, return 
  "existing" — even if the action has not happened yet. If the 
  text is fundamentally about an imagined system, tool, method, 
  or concept that has no concrete form yet, return "novel". 
  Return "unclear" when genuinely ambiguous. 
  ("novel" / "existing" / "unclear")`;

// ──────────────────────────────────────────────────────────────────────────────
// PreParse field code → readable name mapping
// Mini-prompts use codes (g1, c2, t3...) to prevent field names from biasing
// the LLM. This map converts coded output back to readable names for scorers,
// logging, and downstream code.
// ──────────────────────────────────────────────────────────────────────────────
const PREPARSE_FIELD_MAP = {
  // Prompt A: Grammar
  g1: 'is_command',
  g2: 'is_declarative',
  g3: 'has_speculation',
  g4: 'is_past_or_present',
  g6: 'is_narrative_reflection',
  // Prompt B: Content
  c1: 'is_scheduled_occurrence',
  c1r: 'scheduled_reasoning',
  c3: 'has_emotion_language',
  c3r: 'emotion_reasoning',
  c4: 'is_about_feelings_not_actions',
  c4r: 'feelings_reasoning',
  s1: 'action_target',
  // Prompt C: Temporal
  t1: 'has_date_or_time',
  t2a1: 'has_occurrence_count',
  t2a3a: 'has_measurable_amount',
  t2a3b: 'amount_bounded_by_period',
  t2a3c: 'bounding_period_recurs',
  t2b1: 'user_is_agent',
  t2b2: 'action_is_future',
  t3: 'has_routine_anchor',
  t4: 'is_single_instance',
  t4r: 'single_instance_reasoning',
  // Prompt D: Behavioral
  b1: 'has_prohibition',
  b2a: 'has_discontinuation',
  b2ar: 'discontinuation_reasoning',
  b2b: 'references_existing_pattern',
  b2br: 'pattern_reasoning',
  b3: 'has_relative_change',
  b4a1: 'references_current_state',
  b4a2: 'change_is_open_ended',
  b6: 'has_restriction_boundary',
  // Prompt E: Meta
  m1: 'has_hedging',
  m2: 'has_obligation',
  m3: 'parse_confidence',
  c2: 'is_reference_detail',
  c2r: 'reference_reasoning',
  // Prompt F: Relational
  r1: 'action_direction',
  r1r: 'action_direction_reasoning',
  r2: 'time_role',
  r2r: 'time_role_reasoning',
  r3: 'boundary_type',
  r3r: 'boundary_reasoning',
  // Prompt G: Holistic
  m4: 'temporal_orientation',
  m5: 'user_mode_record_or_change',
  m6a: 'is_about_personal_patterns',
  m6b: 'is_storing_information',
  m6c: 'is_about_emotion',
};

function mapCodedPreparse(coded) {
  const mapped = {};
  for (const [code, value] of Object.entries(coded)) {
    const readableName = PREPARSE_FIELD_MAP[code];
    if (readableName) {
      mapped[readableName] = value;
    } else {
      mapped[code] = value;
    }
  }
  return mapped;
}

async function runPreparseMini(text, env, systemPrompt) {
  const result = await aiClassify({
    mode: 'realtime',
    ...getProviders('nano', env),
    env,
    systemPrompt,
    messages: [{ role: 'user', content: text.substring(0, 500) }],
    temperature: 0.1,
    maxOutputTokens: 300,
    endpoint: 'preparse-mini',
  });

  if (!result.parsed) {
    throw new Error('preparse failed: both providers returned unusable output');
  }

  return result.parsed;
}

async function runStructuralParse(text, env) {
  const result = await aiClassify({
    mode: 'realtime',
    ...getProviders('mini', env),
    env,
    systemPrompt: STRUCTURAL_PARSE_PROMPT,
    messages: [{ role: 'user', content: text.substring(0, 500) }],
    temperature: 0.1,
    maxOutputTokens: 200,
    endpoint: 'structural-parse',
  });

  if (!result.parsed) {
    throw new Error('structural parse failed: both providers returned unusable output');
  }

  return result.parsed;
}

/**
 * Run semantic preparse via OpenAI.
 *
 * Extracts structural and semantic facts from input text without classifying.
 * This is used by both the standalone classify-preparse endpoint and the
 * unified classify-phase1-v2 endpoint.
 *
 * @param {string} text - The input text to parse
 * @param {Object} env - Environment with OPENAI_API_KEY
 * @returns {Promise<{success: true, result: PrePhaseParseResult, latency_ms: number} | {success: false, error: string, latency_ms: number}>}
 */
async function runPreparse(text, env) {
  const t0 = Date.now();

  try {
    // Run all parses in parallel — structural (mini) and seven nano parses
    const [
      structuralResult,
      intentResult,
      contentResult,
      structureResult,
      behavioralResult,
      metaResult,
      relationalResult,
      holisticResult,
    ] = await Promise.all([
      runStructuralParse(text, env).catch((err) => {
        console.error('[StructuralParse] Failed, using nano fallback', { error: String(err) });
        return {};
      }),
      runPreparseMini(text, env, PREPARSE_INTENT_PROMPT),
      runPreparseMini(text, env, PREPARSE_CONTENT_PROMPT),
      runPreparseMini(text, env, PREPARSE_STRUCTURE_PROMPT),
      runPreparseMini(text, env, PREPARSE_BEHAVIORAL_PROMPT),
      runPreparseMini(text, env, PREPARSE_META_PROMPT),
      runPreparseMini(text, env, PREPARSE_RELATIONAL_PROMPT),
      runPreparseMini(text, env, PREPARSE_HOLISTIC_PROMPT),
    ]);

    const latency = Date.now() - t0;

    const grammar = mapCodedPreparse(intentResult);
    const content = mapCodedPreparse(contentResult);
    const temporal = mapCodedPreparse(structureResult);
    const behavioral = mapCodedPreparse(behavioralResult);
    const meta = mapCodedPreparse(metaResult);
    const relational = mapCodedPreparse(relationalResult);
    const holistic = mapCodedPreparse(holisticResult);

    const result = {
      // Atomic observations
      is_command: Boolean(grammar.is_command),
      is_declarative: Boolean(grammar.is_declarative),
      has_speculation: Boolean(grammar.has_speculation),
      is_past_or_present: Boolean(grammar.is_past_or_present),
      core_verb: structuralResult.verb || grammar.core_verb || null,
      struct_object: structuralResult.object || null,
      struct_modifier: structuralResult.modifier || null,
      struct_modifier_target: ['object', 'action'].includes(structuralResult.modifier_target)
        ? structuralResult.modifier_target
        : null,
      struct_time_reference: structuralResult.time_reference || null,
      struct_time_binding: ['bound', 'unbound', 'ambiguous'].includes(structuralResult.time_binding)
        ? structuralResult.time_binding
        : null,
      struct_completion: ['done', 'recurring', 'unclear'].includes(structuralResult.completion)
        ? structuralResult.completion
        : 'unclear',
      struct_novelty: ['novel', 'existing', 'unclear'].includes(structuralResult.novelty)
        ? structuralResult.novelty
        : 'unclear',
      is_narrative_reflection: Boolean(grammar.is_narrative_reflection),
      is_state_verb: structuralResult.verb_type === 'state',
      has_concrete_result: false,
      verb_has_completion: structuralResult.verb_type === 'action',
      has_verb: structuralResult.has_verb !== false,

      is_scheduled_occurrence: Boolean(content.is_scheduled_occurrence),
      scheduled_reasoning: content.scheduled_reasoning || '',
      has_emotion_language: Boolean(content.has_emotion_language),
      emotion_reasoning: content.emotion_reasoning || '',
      is_about_feelings_not_actions: Boolean(content.is_about_feelings_not_actions),
      feelings_reasoning: content.feelings_reasoning || '',
      action_target: ['user', 'external', 'other_person'].includes(content.action_target)
        ? content.action_target
        : 'user',

      has_date_or_time: Boolean(temporal.has_date_or_time),
      has_occurrence_count: Boolean(temporal.has_occurrence_count),
      has_time_reference: Boolean(temporal.has_time_reference),
      time_reference_binding: ['bound', 'unbound', 'ambiguous'].includes(
        temporal.time_reference_binding,
      )
        ? temporal.time_reference_binding
        : null,
      claims_all_instances:
        temporal.time_reference_binding === 'unbound' ||
        structuralResult.time_binding === 'unbound',
      has_measurable_amount: Boolean(temporal.has_measurable_amount),
      amount_bounded_by_period: Boolean(temporal.amount_bounded_by_period),
      bounding_period_recurs: Boolean(temporal.bounding_period_recurs),
      has_explicit_multiplicity:
        Boolean(temporal.has_occurrence_count) ||
        temporal.time_reference_binding === 'unbound' ||
        structuralResult.time_binding === 'unbound' ||
        (Boolean(temporal.has_measurable_amount) &&
          Boolean(temporal.amount_bounded_by_period) &&
          Boolean(temporal.bounding_period_recurs)),
      user_is_agent: Boolean(temporal.user_is_agent),
      action_is_future: Boolean(temporal.action_is_future),
      multiplicity_is_future_self:
        Boolean(temporal.user_is_agent) && Boolean(temporal.action_is_future),
      is_ongoing_practice:
        (Boolean(temporal.has_occurrence_count) ||
          temporal.time_reference_binding === 'unbound' ||
          structuralResult.time_binding === 'unbound' ||
          (Boolean(temporal.has_measurable_amount) &&
            Boolean(temporal.amount_bounded_by_period) &&
            Boolean(temporal.bounding_period_recurs))) &&
        Boolean(temporal.user_is_agent) &&
        Boolean(temporal.action_is_future),
      ongoing_reasoning: '',
      has_routine_anchor: Boolean(temporal.has_routine_anchor),
      is_single_instance: Boolean(temporal.is_single_instance),
      single_instance_reasoning: temporal.single_instance_reasoning || '',

      has_prohibition: Boolean(behavioral.has_prohibition),
      has_discontinuation: Boolean(behavioral.has_discontinuation),
      discontinuation_reasoning: behavioral.discontinuation_reasoning || '',
      references_existing_pattern: Boolean(behavioral.references_existing_pattern),
      pattern_reasoning: behavioral.pattern_reasoning || '',
      has_relative_change: Boolean(behavioral.has_relative_change),
      references_current_state: Boolean(behavioral.references_current_state),
      change_is_open_ended: Boolean(behavioral.change_is_open_ended),
      has_restriction_boundary: Boolean(behavioral.has_restriction_boundary),
      degree_shift_target:
        structuralResult.modifier_target === 'object'
          ? 'thing_sought'
          : structuralResult.modifier_target === 'action'
            ? 'own_action'
            : ['own_action', 'thing_sought'].includes(behavioral.degree_shift_target)
              ? behavioral.degree_shift_target
              : null,

      has_hedging: Boolean(meta.has_hedging),
      has_obligation: Boolean(meta.has_obligation),
      parse_confidence: ['high', 'medium', 'low'].includes(meta.parse_confidence)
        ? meta.parse_confidence
        : 'medium',

      is_reference_detail: Boolean(meta.is_reference_detail),
      reference_reasoning: meta.reference_reasoning || '',

      // Relational
      action_direction: ['own_behavior', 'external', 'unclear'].includes(
        relational.action_direction,
      )
        ? relational.action_direction
        : 'unclear',
      action_direction_reasoning: relational.action_direction_reasoning || '',
      time_role: ['when', 'characteristic', 'no_time'].includes(relational.time_role)
        ? relational.time_role
        : 'no_time',
      time_role_reasoning: relational.time_role_reasoning || '',
      boundary_type: ['ongoing_boundary', 'one_time', 'no_negation'].includes(
        relational.boundary_type,
      )
        ? relational.boundary_type
        : 'no_negation',
      boundary_reasoning: relational.boundary_reasoning || '',

      // Holistic
      temporal_orientation: ['past', 'future', 'neither'].includes(holistic.temporal_orientation)
        ? holistic.temporal_orientation
        : 'neither',
      user_mode_record_or_change: ['recording', 'requesting_change', 'neither'].includes(
        holistic.user_mode_record_or_change,
      )
        ? holistic.user_mode_record_or_change
        : 'neither',
      is_about_personal_patterns: Boolean(holistic.is_about_personal_patterns),
      is_storing_information: Boolean(holistic.is_storing_information),
      is_about_emotion: Boolean(holistic.is_about_emotion),
      user_intent_mode: ['directing', 'capturing', 'processing', 'exploring'].includes(
        structuralResult.intent_mode,
      )
        ? structuralResult.intent_mode
        : ['directing', 'capturing', 'processing', 'exploring'].includes(holistic.user_intent_mode)
          ? holistic.user_intent_mode
          : 'directing',

      // Derived fields for backward compatibility
      frame_type: 'uncertain',
      factual_statement: false,
      is_noun_phrase_only: false,
      self_reflection: false,
      emotional_content: false,
      has_occasion_noun: false,
      uncertainty_present: false,
      frequency_present: false,
      frequency_type: null,
      is_self_restriction: false,
      has_implied_recurrence: false,
      obligation_framing: false,
      direction_without_schedule: false,
      has_completion_point: 'uncertain',
      hypothetical_framing: false,
      verb_position: 'none',
      temporal_specificity: false,
      reminder_intent: false,
    };

    if (result.has_verb === false) {
      result.is_command = false;
      result.is_state_verb = false;
      if (result.user_intent_mode === 'directing') {
        result.user_intent_mode = 'capturing';
      }
    }

    // Derive backward-compatible fields
    result.frame_type =
      result.has_emotion_language && result.is_about_feelings_not_actions
        ? 'processing'
        : result.is_command
          ? 'directing'
          : result.has_speculation || result.has_hedging
            ? 'exploring'
            : result.is_declarative || result.is_reference_detail
              ? 'factual'
              : result.is_past_or_present && result.is_about_feelings_not_actions
                ? 'processing'
                : 'uncertain';
    result.factual_statement = result.is_declarative;
    result.is_noun_phrase_only = !result.has_verb;
    result.self_reflection = result.is_about_feelings_not_actions;
    result.emotional_content = result.has_emotion_language;
    result.has_occasion_noun = result.is_scheduled_occurrence;
    result.uncertainty_present = result.has_hedging;
    result.frequency_present = result.is_ongoing_practice || result.has_discontinuation;
    result.frequency_type =
      result.has_discontinuation && result.references_existing_pattern
        ? 'stop_quit'
        : result.is_ongoing_practice
          ? 'explicit'
          : null;
    result.is_self_restriction =
      result.has_prohibition && result.references_existing_pattern && !result.is_single_instance;
    result.has_implied_recurrence = result.has_routine_anchor;
    result.obligation_framing = result.has_obligation;
    result.direction_without_schedule = result.has_relative_change;
    result.verb_position = result.is_command
      ? 'start'
      : result.has_speculation
        ? 'inside_hypothetical'
        : 'none';

    console.log('[PreParse] Success', { latency_ms: latency });
    return { success: true, result, latency_ms: latency };
  } catch (err) {
    const latency = Date.now() - t0;
    console.error('[PreParse] Error', { error: String(err), latency_ms: latency });
    return { success: false, error: String(err), latency_ms: latency };
  }
}

/**
 * Get specific reasoning guidance based on the routing reason.
 * Returns reasoning TESTS to help Phase 1 focus on the right question.
 *
 * @param {string} reason - The routing reason from heuristic
 * @returns {string} Specific reasoning tests for Phase 1
 */
function getReasoningGuidance(reason) {
  switch (reason) {
    case 'noun_phrase_only':
      return `This is a noun phrase with no verb or framing.

Apply THE ACTION IMPLICATION TEST:
Does this noun inherently imply something needs to be done, or could it equally be reference information to remember? 

If only one interpretation makes sense, choose it. If both are genuinely plausible, return AMBIGUOUS with type "bucket". Additionally, before applying THE ACTION IMPLICATION TEST, first check whether the noun phrase implies project-scale or multi-step work — a system, product, feature, initiative, or named deliverable that would require coordinated effort across multiple actions. When action_target is external AND the noun implies this kind of scale, return AMBIGUOUS with ambiguity_type "scope" rather than "bucket". The distinction: bucket is for nouns where intent is entirely unknown. Scope is for nouns where working on something is implied but the scale — one task vs a larger effort — is what needs clarifying.`;

    case 'direction_without_schedule':
      return `This input expresses a desire for relative change without a concrete schedule. Apply these two tests IN ORDER and stop at the first that resolves:

FIRST — THE ZERO-TARGET TEST:
Is the user's desired end state for this behavior unambiguously zero? This means the user has clearly expressed that the behavior should stop entirely, not merely reduce. Relative language — wanting less, fewer, more, better — does NOT satisfy this test. Only explicit cessation intent satisfies this test. If the desired end state is zero with certainty → HABIT with subtype break_habit.

SECOND — THE CONCRETE DAILY BINARY TEST:
Can the user answer "did I do this today?" with an unambiguous yes or no based solely on what was stated in the input? The test is strict: the behavior must be specific enough that two different people reading the input would agree on whether it happened on a given day. Vague qualities — being more present, spending less time, being better at something, being less reactive — do not pass this test because they have no defined threshold. Aspirational language about abstract qualities or relative improvements without a stated threshold always fails this test. If the test fails → return AMBIGUOUS with type "bucket". Do not attempt to infer a threshold that the user did not state.

If both tests fail → AMBIGUOUS. The clarify flow exists precisely for these inputs. Do not classify as habit when the user has not provided enough information to make the habit trackable.`;

    case 'hedged_action':
      return `This has an action verb, but uncertainty is on the verb itself.

Apply THE UNCERTAINTY LOCATION TEST:
Is the uncertainty about THE WORLD (external factors, timing, availability) or about THE USER'S OWN INTENT (whether to do it at all)?

- World uncertainty: The user has committed but faces external unknowns. The intent is clear; circumstances are not. This is TODO.
- Self uncertainty: The user hasn't decided. They're exploring or processing. This is LOG/idea or LOG/journal.

The key test: If external conditions resolved favorably, would the user definitely act? YES → TODO. UNSURE → not TODO.

Apply THE HEDGE REMOVAL TEST:
Mentally remove the hedging language. Does a clear self-directed command remain? If yes, the hedge was stylistic softening of a commitment. If the whole thought collapses without the hedge, the hedge WAS the content.`;

    case 'uncertain_frame':
      return `The dominant frame is unclear.

Apply THE FRAME TEST:
Individual words exist inside an overall frame. The frame determines classification, not the words inside it.

- DIRECTING frame: User is telling themselves to do something. Even soft language inside a directing frame is TODO.
- EXPLORING frame: User is considering possibilities. Even action verbs inside an exploring frame is LOG/idea.
- PROCESSING frame: User is working through feelings. Even future-oriented words inside a processing frame is LOG/journal.

The test: What is the user DOING with this thought right now? Capturing an action? Floating a possibility? Working through feelings?`;

    case 'low_parse_confidence':
      return `Structure was unclear to the parser. Do a fresh holistic read.

Apply all core tests:
1. THE UNCERTAINTY LOCATION TEST - Is uncertainty about the world or about user intent?
2. THE FRAME TEST - What is the dominant frame: directing, exploring, or processing?
3. THE COMMITMENT TEST - Has the user decided to act, or are they still weighing?
4. THE COMPLETENESS TEST - Is this a complete expression (emotional, factual) or genuinely missing intent?

If multiple interpretations remain equally valid after applying these tests, return AMBIGUOUS.`;

    case 'no_clear_mapping':
      return `Structural facts are clear but don't map to a single bucket.

Apply THE SYNTHESIS TEST:
Facts may co-exist (emotional content + action verb, or frequency language + hedging). One purpose dominates.

Ask: What does the user ultimately WANT from capturing this? That answer determines the bucket.

Apply THE FUZZY DETAILS TEST:
Uncertainty about WHAT/WHEN/HOW within a committed action is still TODO - the commitment is clear, just the specifics are fuzzy.
Only uncertainty about WHETHER to act at all removes it from TODO.

If signals genuinely conflict with equal weight, return AMBIGUOUS.`;

    case 'frequency_detected_needs_habit_verification':
      return `Pre-parse detected frequency or cessation signals alongside a leading action verb. A leading verb does NOT override frequency — the verb describes the action content while frequency determines the entity type.

Apply THE HABIT GATE — all three tests must pass for HABIT classification:

1. WHO REPEATS: Is the user personally performing the recurring action? If they are building, configuring, or scheduling something external (a system, a project, a deliverable), that is a TODO regardless of frequency language.

2. WHAT RECURS: Does the frequency language attach to the user's own behavior? Recurrence in the action the user takes → HABIT. Recurrence in an output, event, or external process → TODO.

3. IS THERE CONCRETE TIMING: Either explicit recurrence schedules (daily, weekly, every morning) or cessation language (stop, quit, give up) count as concrete frequency signals. Vague aspirational language without temporal anchoring does not.

If all three pass → HABIT. Use subtype "start_habit" for building new behaviors, "break_habit" for stopping or quitting existing behaviors.
If any test fails → TODO. The frequency language is incidental, not definitional.

CRITICAL: When the input is a short action phrase of two to four words containing a verb and an activity — with no explicit schedule, no day names, and no specific time anchor — the frequency signal is ambiguous as to whether the user means a one-time action or a recurring practice. In this situation, do not commit to todo or habit with high confidence. Return AMBIGUOUS with ambiguity_type "habit_or_todo" so the user can clarify. The input must be treated as genuinely unclear between a single action and an ongoing commitment.`;

    case 'exploring_frame':
      return `Pre-parse detected "exploring" frame, but this signal is unreliable.

Apply THE COMMITMENT TEST:
Is this a self-command to act, or a consideration of whether to act?

A self-command expresses commitment through its grammatical form — the user is telling themselves to do something. This is DIRECTING → TODO.

A consideration expresses uncertainty about whether to commit — the user is weighing options or floating a possibility. This is EXPLORING → LOG/idea.

The test: Is the user issuing an instruction to themselves, or asking themselves a question?

IGNORE the preparse frame_type for this decision. Evaluate fresh.`;

    default:
      return `Apply holistic reasoning using the core tests: Uncertainty Location, Frame, Commitment, and Completeness.`;
  }
}

/**
 * Run Phase 1 classification via OpenAI.
 *
 * This is the core Phase 1 AI classification logic, extracted for reuse by both
 * classify-phase1 and classify-phase1-v2 endpoints.
 *
 * @param {string} text - The input text to classify
 * @param {Object} env - Environment with OPENAI_API_KEY
 * @param {Object|null} preparseContext - Optional preparse result for context
 * @param {string} preparseContext.frame_type - Frame type from preparse
 * @param {string|null} preparseContext.core_verb - Core verb from preparse
 * @param {boolean} preparseContext.uncertainty_present - Whether uncertainty is present
 * @param {string|null} preparseContext.uncertainty_target - What is uncertain
 * @param {boolean} preparseContext.frequency_present - Whether frequency is detected
 * @param {boolean} preparseContext.emotional_content - Whether emotional content is present
 * @param {string} preparseContext.parse_confidence - Parse confidence level
 * @param {string|null} routingReason - Why heuristic needed Phase 1
 * @returns {Promise<{success: true, result: Object, latency_ms: number} | {success: false, error: string, latency_ms: number}>}
 */
async function runPhase1Classification(
  text,
  env,
  preparseContext = null,
  routingReason = null,
  scorerScores = null,
  hasUserSelectedDate = false,
) {
  const t0 = Date.now();

  // Build structural facts section
  const structuralFacts = preparseContext
    ? `Frame type: ${preparseContext.frame_type}
Core verb: ${preparseContext.core_verb || 'none detected'}
Verb position: ${preparseContext.verb_position}
Uncertainty present: ${preparseContext.uncertainty_present}
Uncertainty target: ${preparseContext.uncertainty_target || 'N/A'}
Obligation framing: ${preparseContext.obligation_framing}
Frequency present: ${preparseContext.frequency_present}
Frequency type: ${preparseContext.frequency_type || 'N/A'}
Direction without schedule: ${preparseContext.direction_without_schedule}
Temporal specificity: ${preparseContext.temporal_specificity}
Emotional content: ${preparseContext.emotional_content}
Hypothetical framing: ${preparseContext.hypothetical_framing}
Self reflection: ${preparseContext.self_reflection}
Noun phrase only: ${preparseContext.is_noun_phrase_only}`
    : 'No pre-parse context available.';

  // Get specific guidance for this routing reason
  let reasoningGuidance = getReasoningGuidance(routingReason);

  // When scorer bails, tell Phase 1 which types are competing
  let scorerGuidance = '';
  if (routingReason && routingReason.startsWith('scorer_')) {
    const parts = routingReason.replace('scorer_', '').split('_vs_');
    if (parts.length === 2) {
      const typeLabels = {
        todo: 'a discrete completable action (TODO)',
        habit_build: 'a recurring behavior to build (HABIT/start_habit)',
        habit_break: 'a recurring behavior to stop (HABIT/break_habit)',
        event: 'a scheduled occasion to remember (LOG/event)',
        journal: 'emotional processing or reflection (LOG/journal)',
        idea: 'a hypothetical or possibility (LOG/idea)',
        general: 'factual information to record (LOG/general)',
      };
      const a = typeLabels[parts[0]] || parts[0];
      const b = typeLabels[parts[1]] || parts[1];
      scorerGuidance = `\nThe heuristic analysis found this is most likely either ${a} or ${b}. Use semantic analysis to determine which is the better fit.`;
    }
  }
  reasoningGuidance += scorerGuidance;

  if (scorerScores) {
    const scoreContext = Object.entries(scorerScores)
      .filter(([_, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    reasoningGuidance += `\nScorer confidence levels: ${scoreContext}`;
  }

  // Build the Phase 1 prompt for nuanced interpretation
  const phase1Prompt = `You resolve ambiguous mind drops for Gremly. This input could not be automatically classified because it requires nuanced interpretation beyond structural facts.

You have the structural analysis. Your job is to REASON about what the user actually intends.

=== STRUCTURAL FACTS ===

${structuralFacts}

=== STRONG SIGNALS ===

These pre-phase facts are strong classification signals. Do not ignore them:

- hypothetical_framing: true → Almost always LOG/idea. User is floating a "what if".
- factual_statement: true → Almost always LOG/general. User is recording information.
- emotional_content: true → Almost always LOG/journal. User is expressing feelings.
- frame_type: "exploring" → Usually LOG/idea UNLESS verb_position is "start". When the input opens with a bare imperative verb (no subject, no hedging), the grammatical form is a command, not exploration. The user may be exploring a TOPIC, but they are DIRECTING themselves to do so. If verb_position is "start" and core_verb is present, classify as TODO.
- frame_type: "factual" → Almost always LOG/general. User is stating facts.
- frame_type: "directing" with uncertainty only on "object_details" → Almost always TODO. User knows WHAT, fuzzy on details.
- verb_position: "start" with core_verb present → Strong TODO signal regardless of frame_type. Imperative grammatical form expresses commitment to act. Only exception: uncertainty_target is "verb" (user unsure WHETHER to act). CRITICAL EXCEPTION: When frequency_present is true OR frequency_type is "stop_quit", the verb signal does NOT override — apply the HABIT GATE instead. Frequency and cessation signals take precedence over verb position for classification.
- frequency_type: "stop_quit" is a strong signal toward HABIT/break_habit, but it does not automatically override all other signals. Apply this decision: If stop_quit is present AND the framing is direct or obligatory with no significant emotional processing content, classify as HABIT/break_habit with high confidence. If stop_quit is present AND the framing is exploratory, tentative, or emotionally weighted — meaning the user appears to be processing feelings about a pattern as much as committing to change it — return AMBIGUOUS with type "bucket" so the user can clarify whether they want to track this as a break habit or just needed to express it. The distinguishing question is: has the user committed to changing this behavior, or are they expressing that they feel they should? Commitment warrants break_habit. Expression of should-ness without clear commitment warrants AMBIGUOUS.
- Cessation of cognitive or automatic behavioral patterns → When the target of a cessation verb is a cognitive process, automatic response, or habitual behavioral pattern — meaning a behavior that occurs repeatedly without deliberate initiation rather than a discrete one-time action — classify as HABIT/break_habit. The defining characteristic is whether the behavior recurs automatically as part of the user's established patterns. A behavior that happens on an ongoing basis and that the user wants to reduce or eliminate is trackable as a break habit even when no explicit schedule is stated, because the recurrence is inherent to the nature of the behavior itself. Contrast this with one-time actions that happen to use cessation language — those remain TODO.
- direction_without_schedule: true with no concrete behavioral threshold stated → NEVER classify directly as habit. Wanting more or less of something, or wanting to embody an abstract quality more fully, is an aspiration not a trackable behavior. Return AMBIGUOUS with type "bucket" so the user can clarify what the concrete behavior actually is. A habit requires a behavior specific enough that the user can answer "did I do this today?" with certainty. If that answer requires inferring a threshold the user did not provide, the input is AMBIGUOUS.

AMBIGUITY TYPE DETECTION — when returning AMBIGUOUS, use these signals to determine the correct ambiguity_type:
- is_noun_phrase_only: true → ambiguity_type is almost always "bucket". The input has no frame or verb to signal intent.
- temporal_specificity: true — particularly when the input contains a specific named day AND a specific time, or a specific date AND a named occasion or appointment-type noun — this is a strong signal for "date_type". The combination of day/date + time + appointment context means the user is almost certainly referring to something scheduled or to-be-scheduled. This should take priority over "action_or_memory" when both seem plausible. Only use "date_type" when the bucket is clearly TODO — if the bucket is unclear, use "bucket" instead. This also applies when is_noun_phrase_only is true but the noun is an appointment, event, or occasion type AND the input contains a specific day name or date AND a specific time. In this case, the absence of a verb does not change the classification — the temporal anchor is the signal. Appointment-type nouns with specific day + time should be date_type, not bucket, even when there is no action verb present.
- direction_without_schedule: true AND no concrete threshold stated → ambiguity_type is "vague_aspiration". The user wants relative change but has not defined what done looks like.
- frequency_present: true AND it is unclear whether this is a one-time action or an ongoing practice → ambiguity_type is "habit_or_todo". When frequency signals are present alongside a clear action verb, this ambiguity type takes priority over obligation_framing. Obligation framing indicates the user feels they should act — it does not resolve whether the action is one-time or recurring. When both obligation_framing and frequency_present are true for a personal action, return habit_or_todo ambiguous rather than committing to todo.
- factual_statement: true OR action_target is "other_person" AND no action verb present → ambiguity_type is "action_or_memory". A fact or reference that may or may not require action.
- direction_without_schedule: true AND the behaviour is clearly named AND the only uncertainty is whether the user wants accountability → ambiguity_type is "commitment_level". Distinguished from vague_aspiration by having a concrete named activity.
- emotional_content: true AND self_reflection: true AND an action or change is implied but not committed → ambiguity_type is "emotional_or_action".
- action_target is "other_person" AND temporal_specificity is true or false AND no clear commitment to plan or just note → ambiguity_type is "social_plan".
- When is_noun_phrase_only is true AND action_target is external AND the noun phrase describes a project, system, product, or named deliverable — something that implies coordinated multi-step effort rather than a single discrete action — prefer scope over bucket. The distinction: bucket is for nouns where the user's intent is entirely unknown. Scope is for nouns where the intent to work on something is implied, but the scale is unclear. is_noun_phrase_only: true AND the noun implies a potentially large effort rather than a single action → ambiguity_type is "scope". Distinguished from "bucket" by the noun implying project-scale work.
- frame_type is "exploring" AND uncertainty_target is "entire_proposition" AND the action is concrete → ambiguity_type is "idea_or_commitment". The user is floating something real but has not committed.

Only return AMBIGUOUS if these signals conflict or are absent.

=== WHY THIS NEEDS YOUR JUDGMENT ===

Routing reason: ${routingReason || 'unknown'}

${reasoningGuidance}

=== CORE REASONING PRINCIPLES ===

${
  hasUserSelectedDate
    ? `DATE SELECTION CONTEXT: The user has explicitly selected a specific date for this item. This signals temporal intent:
- Activities, appointments, outings, plans, meetings, concerts, or experiences → classify as subtype "event"
- Tasks or actions → classify as bucket "todo"
- Do NOT classify as general note, idea, or journal when a date has been selected, unless the text is clearly reflective/emotional with no actionable or temporal content
`
    : ''
}
THE UNCERTAINTY LOCATION PRINCIPLE:
When hedging or tentative language appears, ask: Is uncertainty about THE WORLD or about THE USER'S OWN INTENT?
- World uncertainty (timing, availability, external factors): User has committed but faces external unknowns. Intent is clear. → TODO
- Self uncertainty (whether to do it, weighing options): User hasn't decided. → LOG/idea or AMBIGUOUS

THE FRAME PRINCIPLE:
The overall frame determines classification, not individual words inside it.
- Directing frame with soft language inside → still TODO
- Exploring frame with action verbs inside → still LOG/idea
- Processing frame with future words inside → still LOG/journal

THE COMMITMENT PRINCIPLE:
Committed action owns fuzzy details. Uncertainty about WHAT/WHEN/HOW within a committed action is still TODO.
Only uncertainty about WHETHER to act removes something from TODO.

THE COMPLETENESS PRINCIPLE:
Short inputs are not necessarily incomplete. Single emotional expressions are complete journal entries. Bare nouns without any verb or context genuinely lack signal and ARE ambiguous.

=== BUCKETS ===

TODO — A discrete, completable action. The user can mark it DONE. Committed action with fuzzy details is still TODO.

HABIT — A trackable, recurring behavior the USER will personally repeat. User must be able to answer "did I do this today?" with a clear yes or no. Direction without concrete recurrence is NOT a habit.

HABIT GATE — Before classifying as HABIT, apply these semantic tests:
1. WHO repeats? Is the USER the one who will personally perform this action repeatedly? If the user is building/creating/configuring something, the output may be recurring but the user's action is one-time. That's TODO.
2. WHAT recurs? Does the frequency language describe the user's behavior, or something else (a feature, an event, an output)? The recurrence must attach to the user's action.
3. IS there concrete timing? Wanting "more" or "less" of something is a vague aspiration, not a schedule. The user must have specified when or how often they will do this. If no timing is present, it's not a habit.

The test: "Has the user specified WHEN or HOW OFTEN?" If NO → not a habit, even if PreParse detected frequency.

PAST-TENSE PATTERN DESCRIPTION IS NEVER A HABIT.
When the user describes a behavior in the past tense — what they have been doing, what they did, how a period of their life went — they are REFLECTING, not REQUESTING TRACKING. The value of the input is the reflection itself. Past-tense descriptions of ongoing behaviors are JOURNAL entries about the user's experience, not requests to set up forward-looking habit tracking. The temporal orientation determines classification: past-oriented pattern description is journal. Future-oriented behavioral commitment is habit.

LOG — Capture for reflection, not action:
- journal: Expressing or processing feelings. The value is in the expression itself.
- idea: A floating possibility with no commitment. The whole thought is pre-action.
- general: Recording facts about what IS or WAS. Requires existence framing, not just a noun.
- event: Something that happens or will happen at a specific point in time that the user wants to note or remember. The defining signals are a concrete temporal anchor (specific date, day, or time) combined with an occasion, appointment, meeting, or occurrence — and crucially, no personal action required beyond noting it. The user is recording that something exists in time, not committing to do anything about it. Distinguish from todo: a todo requires the user to act. An event is something that happens, that the user attends or is aware of. Distinguish from general: a general note records information without a specific temporal anchor. An event is anchored to a specific time. Auto-classify as event when: the input is a factual statement frame AND contains a specific date or time AND describes an occasion or occurrence rather than an action. No clarify needed when intent is unambiguous. Route to clarify (date_type) when: a temporal anchor is present but it is unclear whether the user is noting an existing event or needs to take action to create it. CRITICAL: When the input is a noun phrase containing an appointment, meeting, or occasion type noun alongside a specific day AND a specific time, and it is unclear whether this is already arranged or needs to be arranged — return AMBIGUOUS with ambiguity_type "date_type", not a direct event classification. Only auto-classify as event when the factual nature of the input makes it clear the thing already exists — such as a declarative statement form ("X is on Y") or when no action to create it is plausible. When the arrangement status is uncertain, always prefer date_type ambiguity so the user can clarify.

GENERAL IS THE NARROWEST LOG SUBTYPE — NEVER A FALLBACK.
Before classifying as log/general, apply this verification: is the input PURELY FACTUAL REFERENCE — asserting something about the state of the world with no emotional, aspirational, or behavioral content? If the input expresses any of the following, it is NOT general: aspiration, desire, or wanting (even without action commitment) should be AMBIGUOUS. Emotional state, self-reflection, or processing should be JOURNAL. Hypothetical or speculative framing should be IDEA. Behavioral change intent of any kind should be AMBIGUOUS or HABIT. General is ONLY for pure data points: facts about people, dates of existing events, reference information, status updates stated in existence language. When in doubt between general and another subtype, choose the other subtype. When in doubt between general and ambiguous, choose ambiguous.

AMBIGUOUS — When confidence for any specific bucket is below 0.7.

CRITICAL DISTINCTION: Uncertainty expressed IN the input is not uncertainty about CLASSIFICATION.

Your job is to classify WHAT THE USER CAPTURED, not to mirror their uncertainty back at them.

If the user captured a rule or boundary they want to maintain, classify it as HABIT.
If the user captured a recurring behavior they want to build or break, classify it as HABIT.
If the user captured a hypothetical or possibility they're considering, classify it as LOG/idea.
If the user captured an emotion or reflection, classify it as LOG/journal.
If the user captured a fact or piece of information to remember, classify it as LOG/general.
If the user captured an action they intend to do, classify it as TODO.

The input's content may be uncertain. Your classification should not be.

Use AMBIGUOUS only when you genuinely cannot determine if this is something to DO, TRACK, or KNOW - not because the input contains soft language.

The clarification flow handles ambiguous inputs well. It is better to ask the user than to guess wrong. A wrong classification that the user has to manually fix is a worse experience than a brief clarification question that gets it right. Use AMBIGUOUS when you cannot point to specific words in the input that reveal the user's intent with certainty.

=== AMBIGUITY TYPES ===

When returning AMBIGUOUS, always specify the type:
- bucket: The input is a bare noun phrase or contains no verb, frame, or actionable signal — cannot determine if this is something to DO, TRACK, or KNOW. Only use this when a thoughtful human would also be genuinely unsure.
- date_type: Bucket is clearly TODO but it is unclear whether the date means when something IS happening (the user will attend) or when the user needs to ACT (a deadline to do something).
- vague_aspiration: The user wants to change a behaviour but has expressed it in relative or directional language without a concrete measurable threshold. Applies when "more", "less", "better", or similar relative language is present and no specific target has been stated that would make the behaviour trackable.
- habit_or_todo: The user has expressed clear intent to perform an action but it is genuinely unclear whether this is a one-time completion they will mark done, or an ongoing recurring practice they want to track over time.
- action_or_memory: The input contains a fact, date, name, or reference that could be purely informational OR could imply an action the user needs to take. The action is not stated but may be implied by context.
- commitment_level: The behaviour is concrete and named, but it is unclear whether the user wants to formally commit to tracking it as an ongoing practice or simply note an intention without accountability.
- emotional_or_action: The input contains emotional language or self-reflection alongside language that could imply an actionable intent. It is unclear whether the user is processing a feeling or committing to do something about it.
- social_plan: The input describes an occasion or interaction involving another person, but it is unclear whether this is already arranged, needs to be arranged, or is simply being noted.
- scope: The input describes something that could be a single completable action OR a larger multi-part effort or project. The scale of what the user intends is genuinely unclear.
- idea_or_commitment: The input is framed hypothetically or exploratorily but it is unclear whether the user is seriously committing to something or floating a possibility they have not yet decided on.

=== OUTPUT ===

Return ONLY valid JSON:

{
  "bucket": "todo" | "habit" | "log" | "ambiguous",
  "confidence": 0.0-1.0,
  "subtype": "journal" | "idea" | "general" | "event" | null,
  "habitSubtype": "start_habit" | "break_habit" | null,
  "is_ambiguous": boolean,
  "ambiguity_type": "bucket" | "date_type" | "vague_aspiration" | "habit_or_todo" | "action_or_memory" | "commitment_level" | "emotional_or_action" | "social_plan" | "scope" | "idea_or_commitment" | null,
  "ambiguity_reason": "Brief explanation of why intent cannot be determined" | null
}

Rules:
- subtype is only set when bucket is "log"
- habitSubtype is only set when bucket is "habit" (start_habit for building behaviors, break_habit for stopping behaviors)
- is_ambiguous is true when bucket is "ambiguous"
- When bucket is "ambiguous", always provide ambiguity_type and ambiguity_reason`;

  const result = await aiClassify({
    mode: 'realtime',
    ...getProviders('mini', env),
    env,
    systemPrompt: phase1Prompt,
    messages: [{ role: 'user', content: text.substring(0, 1000) }],
    temperature: 0.1,
    maxOutputTokens: 500,
    endpoint: 'classify-phase1',
    validate: (parsed) => {
      // Must have a bucket field
      if (!parsed || typeof parsed !== 'object') {
        return { valid: false, reason: 'not_object' };
      }
      return { valid: true };
    },
  });

  const latency = Date.now() - t0;

  if (!result.parsed) {
    console.error('[Phase1Class] Both providers failed', {
      wasFallback: result.wasFallback,
      fallbackReason: result.fallbackReason,
      latency_ms: latency,
    });
    return { success: false, error: 'both_providers_failed', latency_ms: latency };
  }

  const parsed = result.parsed;

  // Validate and normalize the result
  const validBuckets = ['todo', 'habit', 'log', 'ambiguous'];
  let bucket = validBuckets.includes(parsed.bucket) ? parsed.bucket : 'log';

  // Normalize ambiguous to log/general for storage
  if (bucket === 'ambiguous') {
    bucket = 'log';
  }

  let subtype = null;
  if (bucket === 'log') {
    const validSubtypes = ['journal', 'idea', 'general', 'event'];
    subtype = validSubtypes.includes(parsed.subtype) ? parsed.subtype : 'general';
  }

  let habitSubtype = null;
  if (bucket === 'habit') {
    const validHabitSubtypes = ['start_habit', 'break_habit'];
    habitSubtype = validHabitSubtypes.includes(parsed.habitSubtype)
      ? parsed.habitSubtype
      : 'start_habit';
  }

  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.7;
  confidence = Math.max(0, Math.min(1, confidence));

  const isAmbiguous = parsed.bucket === 'ambiguous' || confidence < 0.7;
  // An ambiguous result must always carry a type. Low confidence alone (or a
  // missing/invalid type from the model) used to return is_ambiguous: true
  // with ambiguity_type: null, and the client then never asked the question.
  const ambiguityType = isAmbiguous
    ? AMBIGUITY_TYPES.includes(parsed.ambiguity_type)
      ? parsed.ambiguity_type
      : 'bucket'
    : null;
  const ambiguityReason =
    isAmbiguous && typeof parsed.ambiguity_reason === 'string'
      ? parsed.ambiguity_reason.trim().substring(0, 200)
      : null;

  const classResult = {
    bucket,
    subtype,
    habitSubtype,
    confidence,
    is_ambiguous: isAmbiguous,
    ambiguity_type: ambiguityType,
    ambiguity_reason: ambiguityReason,
  };

  console.log('[Phase1Class] Complete', {
    bucket: classResult.bucket,
    subtype: classResult.subtype,
    habitSubtype: classResult.habitSubtype,
    confidence: classResult.confidence,
    is_ambiguous: classResult.is_ambiguous,
    latency_ms: latency,
    wasFallback: result.wasFallback,
    fallbackReason: result.fallbackReason,
    provider: result.provider,
    model: result.model,
  });

  return { success: true, result: classResult, latency_ms: latency };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAVILY SEARCH HELPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Strip filler/compliment openings from AI responses.
 * Runs on buffered first sentence before streaming to client.
 * This is a lightweight output guard — catches patterns regardless of prompt wording.
 */
function stripFillerOpening(text) {
  const fillerPatterns = [
    // Compliment openers
    /^that'?s a (?:great|really great|super|fantastic|wonderful|excellent) (?:question|task|idea|goal|focus|habit|start|one)[.!,]*\s*/i,
    /^great (?:question|task|idea|goal|focus|habit|start|one)[.!,]*\s*/i,
    /^good (?:question|thinking|one)[.!,]*\s*/i,
    /^love (?:that|this|it)[.!,]*\s*/i,
    /^what a great (?:question|idea|goal)[.!,]*\s*/i,
    /^i love that you'?re (?:asking|thinking about|working on)[^.!]*[.!,]*\s*/i,
    /^that'?s (?:really |so )?(?:smart|clever|thoughtful|interesting)[.!,]*\s*/i,
    /^(?:oh |ah )?(?:what a |that's a )?(?:really |super )?great (?:question|one)[.!,]*\s*/i,
    // Transitional filler openers
    /^and it'?s (?:smart|wise|good|great|helpful) to [^.!]{0,60}[.!]\s*/i,
    /^it'?s (?:smart|wise|good|great|a good idea|a great idea|helpful) to [^.!]{0,60}[.!]\s*/i,
    /^it makes sense to [^.!]{0,60}[.!]\s*/i,
    /^(?:that's|it's) (?:a )?(?:really )?(?:great|good|smart|important) (?:question|idea|goal|thing to think about|thing to consider)[.!,]*\s*/i,
    /^you'?re (?:right|smart|wise) to (?:ask|think about|consider|want)[^.!]*[.!,]*\s*/i,
    /^(?:absolutely|definitely)[.!,]+\s*/i,
  ];

  for (const pattern of fillerPatterns) {
    const match = text.match(pattern);
    if (match) {
      const stripped = text.slice(match[0].length);
      if (stripped.length > 0) {
        return stripped.charAt(0).toUpperCase() + stripped.slice(1);
      }
      return stripped;
    }
  }
  return text;
}

/**
 * Detect if a query would benefit from images
 * Returns true for exercises, recipes, products, places, etc.
 */
function isVisualQuery(query) {
  if (!query) return false;

  const q = query.toLowerCase();

  // Explicit image requests
  if (
    q.includes('show me') ||
    q.includes('what does') ||
    q.includes('look like') ||
    q.includes('picture of')
  ) {
    return true;
  }

  // Exercise/fitness - form matters
  if (
    q.includes('deadlift') ||
    q.includes('squat') ||
    q.includes('pushup') ||
    q.includes('push-up') ||
    q.includes('plank') ||
    q.includes('lunge') ||
    q.includes('yoga pose') ||
    q.includes('exercise form') ||
    q.includes('stretch')
  ) {
    return true;
  }

  // Recipes - visual helps
  if (
    q.includes('recipe') ||
    q.includes('how to cook') ||
    (q.includes('how to make') && (q.includes('food') || q.includes('dish') || q.includes('meal')))
  ) {
    return true;
  }

  // Products - what they look like
  if (q.match(/best .*(product|tool|gear|equipment|device)/)) {
    return true;
  }

  // Places/destinations
  if (
    q.includes('places to visit') ||
    q.includes('destination') ||
    (q.includes('what is') && q.includes('like') && q.match(/city|country|beach|mountain/))
  ) {
    return true;
  }

  // DIY/crafts
  if (q.includes('diy') || q.includes('craft') || q.includes('how to build')) {
    return true;
  }

  return false;
}

/**
 * Extract content from a URL using Tavily Extract API
 *
 * @param {string} url - The URL to extract content from
 * @param {string} apiKey - Tavily API key
 * @returns {Promise<Object|null>} Extracted content or null on error
 */
async function executeTavilyExtract(url, apiKey) {
  try {
    console.log('[Tavily:Extract] Fetching URL:', url);

    const response = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        urls: [url],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[Tavily:Extract] Failed:', {
        status: response.status,
        error: errorText,
      });
      return null;
    }

    const data = await response.json();

    // Tavily returns results array with extracted content
    const result = data.results?.[0];
    if (!result) {
      console.log('[Tavily:Extract] No content extracted');
      return null;
    }

    // Truncate content to ~4000 tokens (~16000 chars) to avoid context overflow
    const maxChars = 16000;
    const rawContent = result.raw_content || '';
    const truncatedContent =
      rawContent.length > maxChars
        ? rawContent.substring(0, maxChars) + '\n\n[Content truncated...]'
        : rawContent;

    console.log('[Tavily:Extract] Success:', {
      url: result.url,
      contentLength: rawContent.length,
      truncated: rawContent.length > maxChars,
    });

    return {
      url: result.url || url,
      title: extractTitleFromContent(truncatedContent) || getDomainFromUrl(url),
      content: truncatedContent,
      success: true,
    };
  } catch (error) {
    console.error('[Tavily:Extract] Error:', error);
    return null;
  }
}

/**
 * Extract a title from content (first heading or first line)
 */
function extractTitleFromContent(content) {
  if (!content) return null;

  // Try to find a heading
  const headingMatch = content.match(/^#\s+(.+)$/m) || content.match(/^(.{10,80})[\n\r]/);
  if (headingMatch) {
    return headingMatch[1].trim().substring(0, 100);
  }

  // Fall back to first 60 chars
  return content.substring(0, 60).trim() + '...';
}

/**
 * Get domain name from URL for fallback title
 */
function getDomainFromUrl(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return 'Link';
  }
}

/**
 * Detect URLs in text and extract them
 */
function extractUrlsFromText(text) {
  if (!text) return [];

  // Match URLs (http, https, or www)
  const urlRegex = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;
  const matches = text.match(urlRegex) || [];

  // Clean up URLs (remove trailing punctuation)
  return matches.map((url) => {
    // Add https if missing
    if (url.startsWith('www.')) {
      url = 'https://' + url;
    }
    // Remove trailing punctuation
    return url.replace(/[.,;:!?)]+$/, '');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DAILY FOCUS FOR GREETING — lightweight DCO fetch for general-greeting
// ═══════════════════════════════════════════════════════════════════════════════

async function getDailyFocusForChat(userId, env, timezone = 'UTC', day = null) {
  if (!userId) return null;
  try {
    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };
    // their day when the caller knows it (after midnight it is still yesterday
    // until their day ends, workers/shared/day.js), else the calendar's date
    const today =
      day ||
      // eslint-disable-next-line no-restricted-syntax -- Worker has no dateService; timezone-safe via Intl
      new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=eq.${today}&select=dco`,
      { headers },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const dco = rows?.[0]?.dco;
    if (!dco) return null;
    return {
      briefHeadline: dco.brief_headline || null,
      namedAnchors: dco.named_anchors || [],
      todayFocus: dco.today_focus || [],
      leadStory: dco.lead_story || null,
    };
  } catch (err) {
    console.warn('[getDailyFocusForChat] Failed:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANNER PROJECTION — Life Map + daily state context for organize-day
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchPlannerProjection(userId, timezone, env) {
  if (!userId) return '';

  try {
    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    // Fetch Life Map + today's daily state in parallel
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());

    const [mapRes, dcoRes] = await Promise.all([
      fetch(`${env.SUPABASE_URL}/rest/v1/user_life_map?user_id=eq.${userId}&select=life_map`, {
        headers,
      }),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=eq.${today}&select=dco`,
        { headers },
      ),
    ]);

    const mapData = mapRes.ok ? await mapRes.json() : [];
    const dcoData = dcoRes.ok ? await dcoRes.json() : [];
    const lifeMap = mapData?.[0]?.life_map;
    const dco = dcoData?.[0]?.dco;

    if (!lifeMap?.domains) return '';

    const parts = [];
    parts.push('=== LIFE CONTEXT (from accumulated understanding of this person) ===');

    // Daily focus — what matters today
    if (dco) {
      if (dco.day_type) parts.push(`Day type: ${dco.day_type}`);
      if (dco.tone) parts.push(`Today's tone: ${dco.tone}`);
      // fix: lead_story was rendering as [object Object] — it is {domain, thread, detail, why_today}, not a string
      if (dco.lead_story) {
        const ls = dco.lead_story;
        const leadText =
          typeof ls === 'string'
            ? ls
            : ls.detail || ls.why_today || [ls.domain, ls.thread].filter(Boolean).join(' › ');
        if (leadText) parts.push(`Lead story: ${leadText}`);
      }
    }

    // Thread priorities — what to protect and prioritize
    const priorityThreads = [];
    const streakProtection = [];

    for (const domain of lifeMap.domains) {
      if (domain.attention === 'background') continue;

      for (const thread of domain.threads || []) {
        if (thread.lifecycle !== 'active' && thread.lifecycle !== undefined) continue;

        // Front-of-mind threads get priority
        if (thread.attention === 'front_of_mind' || domain.attention === 'front_of_mind') {
          priorityThreads.push(
            `${domain.name}: ${thread.name} (${thread.status}, ${thread.momentum})`,
          );
        }

        // Streak protection — habits that are building or at risk
        if (thread.momentum === 'strong_upward' || thread.momentum === 'upward') {
          streakProtection.push(
            `PROTECT: ${thread.name} — momentum is ${thread.momentum}, don't let it slip`,
          );
        }
        if (
          thread.status === 'struggling' ||
          thread.status === 'declining' ||
          thread.momentum === 'declining'
        ) {
          streakProtection.push(
            `NEEDS ATTENTION: ${thread.name} — ${thread.status}, schedule related tasks early`,
          );
        }
        if (thread.status === 'approaching_milestone') {
          const milestoneEvidence = (thread.evidence || []).find((e) => e.type === 'milestone');
          const detail = milestoneEvidence ? milestoneEvidence.signal : 'milestone approaching';
          streakProtection.push(`MILESTONE: ${thread.name} — ${detail}`);
        }
      }
    }

    if (priorityThreads.length > 0) {
      parts.push(`\nPriority life threads (schedule related tasks first):`);
      for (const t of priorityThreads.slice(0, 6)) parts.push(`  ${t}`);
    }

    if (streakProtection.length > 0) {
      parts.push(`\nStreak & momentum flags:`);
      for (const s of streakProtection.slice(0, 6)) parts.push(`  ${s}`);
    }

    const result = parts.join('\n');
    console.log(`[organize-day] Planner projection: ${result.length} chars`);
    return result;
  } catch (err) {
    console.warn(`[organize-day] Planner projection failed: ${err.message}`);
    return '';
  }
}

function truncateAtSentence(text, maxChars) {
  if (!text || text.length <= maxChars) return text;

  // Find the last sentence boundary within the limit
  const truncated = text.slice(0, maxChars);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? '),
    truncated.lastIndexOf('.'),
  );

  // If we found a sentence boundary after at least half the budget, use it
  if (lastSentenceEnd > maxChars * 0.5) {
    return truncated.slice(0, lastSentenceEnd + 1).trim();
  }

  // Fallback: cut at last space to avoid mid-word
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.5) {
    return truncated.slice(0, lastSpace).trim() + '...';
  }

  return truncated.trim() + '...';
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUNNING SUMMARY — fire-and-forget after Space Chat replies
// ═══════════════════════════════════════════════════════════════════════════════

/** The World or Chapter a chat is on, as checkTurn takes it, or null. */
function pageScopeOf(body) {
  const page = pageAnchorFrom(body?.anchorEntity);
  return page ? { kind: page.type, id: page.id } : null;
}

/**
 * The Save button under a reply worth keeping (Worlds rebuild, stage 2,
 * context/keep.js), for an app build that can show it, in Ask Gremly, a
 * World's or a Chapter's chat or the box on Worlds. Null when there is none.
 */
function keepCheck(env, body, userId, reply, card = false) {
  if (!userId || body?.worldsCard !== true || body?.chatSurface === 'brief' || !reply)
    return Promise.resolve(null);
  return judgeKeep({
    env,
    userId,
    message: lastUserText(body),
    reply,
    page: pageAnchorFrom(body?.anchorEntity),
    card,
  }).catch(() => null);
}

/**
 * One Ask Gremly message answered by the agent (agent/chat.js): status lines
 * while it works, then its reply and its card on the chat's stream, then what
 * follows every reply (the chat's summary, an item chat's summary and the
 * correction check). The Save items pill is skipped: the agent puts anything
 * new worth keeping on its card. False when the agent could not finish, so the
 * quick lane's writer answers instead.
 */
async function answerWithAgent({
  env,
  ctx,
  body,
  userId,
  timezone,
  messages,
  preload,
  send,
  timing,
}) {
  const t0 = Date.now();
  const turn = await runChatTurn({
    env,
    userId,
    timezone,
    messages,
    tasks: Array.isArray(body.agentTasks) ? body.agentTasks : [],
    preload,
    // their week, from an app build that can show the weekly review's button
    week: body.week && typeof body.week === 'object' ? body.week : null,
    // their Worlds and Chapters, for an app build that can apply changes to them (Worlds rebuild, stage 2)
    worlds: body.worldsCard === true,
    // a note's kind (note, event, idea), for an app build that can write it
    noteKinds: body.noteKinds === true,
    onStatus: (line) => {
      send({ searching: true, query: line, isLoadingHint: true }).catch(() => {});
    },
  });
  if (!turn.ok) {
    console.warn('[GeneralChat:Agent] the agent could not finish, the writer answers', {
      error: turn.error,
      model: turn.model,
      ms: turn.ms,
    });
    return false;
  }
  const reply = turn.reply;
  const latency = Date.now() - t0;
  // whether the reply is worth a Save button, read while it goes out
  const keepP = keepCheck(env, body, userId, reply, (turn.card || []).length > 0);
  await send({ delta: reply, done: false });
  const keep = await keepP;
  await send({
    done: true,
    full_content: reply,
    save_suggestion: null,
    entity_card: null,
    ...(keep ? { keep } : {}),
    // the agent offers anything new on its card, so no Save items pill follows
    extraction: 'skipped',
    agent: {
      card: turn.card,
      tasks: turn.tasks,
      // the button to their week, when Gremly put one under the reply
      ...(turn.offer ? { offer: turn.offer } : {}),
      model: turn.model,
      ms: turn.ms,
      tools: turn.tools,
      prompt_version: turn.prompt_version,
    },
    timing: { ...timing, reply_ms: latency },
    latency_ms: latency,
  });
  console.log('[GeneralChat:Agent] Complete', {
    model: turn.model,
    ms: turn.ms,
    tools: turn.tools,
    card: turn.card.length,
    lane: timing.lane,
  });

  // what follows every reply, after it is sent
  if (body.chatId) {
    const said = messages.filter((m) => m.role !== 'system');
    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };
    ctx.waitUntil(
      (async () => {
        try {
          const prev = await fetch(
            `${env.SUPABASE_URL}/rest/v1/scope_chats?id=eq.${body.chatId}&select=running_summary`,
            { headers },
          );
          const rows = prev?.ok ? await prev.json().catch(() => []) : [];
          await generateRunningSummary(
            said,
            reply,
            body.chatId,
            null,
            rows?.[0]?.running_summary || null,
            env,
            timezone,
          );
        } catch (err) {
          console.warn('[GeneralChat:Agent] Summary failed:', err.message);
        }
      })(),
    );
    const anchor = preload.anchor;
    if (anchor && !anchor.gone && anchor.id) {
      ctx.waitUntil(
        generateEntityChatSummary(
          said,
          reply,
          anchor.id,
          anchor.type,
          anchor.title,
          null,
          null,
          env,
          timezone,
        ).catch((err) =>
          console.warn('[GeneralChat:Agent] Item chat summary failed:', err.message),
        ),
      );
    }
  }
  // when they say Gremly has something about their life wrong, the context
  // pipeline applies it straight away; every message is checked, once
  checkTurn({
    env,
    ctx,
    messages,
    reply,
    chatId: body.chatId,
    userId,
    surface: 'chat',
    // a correction said in a World's or Chapter's own chat reaches that page's words
    scope: pageScopeOf(body),
    tag: 'GeneralChat:Agent',
  });
  return true;
}

async function generateRunningSummary(
  conversationMessages,
  lastAssistantResponse,
  chatId,
  spaceName,
  previousSummary,
  env,
  timezone = 'UTC',
) {
  const t0 = Date.now();

  // Gate: only summarize substantive conversations
  const userMessages = conversationMessages.filter((m) => m.role === 'user');
  const totalUserChars = userMessages.reduce((sum, m) => sum + (m.content || '').length, 0);
  if (userMessages.length < 3 || totalUserChars < 200) {
    console.log(`[RunningSummary] Gated out: ${userMessages.length} msgs, ${totalUserChars} chars`);
    return;
  }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());

  const turns = [
    ...conversationMessages
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'User' : 'Gremly'}: ${(m.content || '').slice(0, 300)}`),
    `Gremly: ${lastAssistantResponse.slice(0, 300)}`,
  ].join('\n');

  const prompt = runningSummaryPrompt({ today, spaceName, previousSummary, turns });

  try {
    const res = await helperFetch('running_summary', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 350,
      temperature: 0.3,
    });

    if (!res.ok) {
      console.warn(`[RunningSummary] Nano call failed: ${res.status}`);
      return;
    }

    const data = await res.json();
    let summary = (data.choices?.[0]?.message?.content || '').trim();
    if (!summary) return;

    // eslint-disable-next-line no-control-regex
    summary = truncateAtSentence(summary.replace(/[\0-\x1f\x7f]/g, ' ').trim(), 800);

    const patchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/scope_chats?id=eq.${chatId}`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        running_summary: summary,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!patchRes.ok) {
      console.warn(`[RunningSummary] PATCH failed: ${patchRes.statusText}`);
    } else {
      console.log(
        `[RunningSummary] Updated chat ${chatId} (${Date.now() - t0}ms): "${summary.slice(0, 60)}..."`,
      );
    }
  } catch (err) {
    console.warn(`[RunningSummary] Error: ${err.message}`);
  }
}

async function generateEntityChatSummary(
  conversationMessages,
  lastAssistantResponse,
  entityId,
  entityType,
  entityTitle,
  spaceName,
  previousSummary,
  env,
  timezone = 'UTC',
) {
  const t0 = Date.now();

  // Gate: only summarize substantive conversations
  const userMessages = conversationMessages.filter((m) => m.role === 'user');
  const totalUserChars = userMessages.reduce((sum, m) => sum + (m.content || '').length, 0);

  if (userMessages.length < 3 || totalUserChars < 200) {
    console.log(
      `[EntityChatSummary] Gated out: ${userMessages.length} msgs, ${totalUserChars} chars`,
    );
    return;
  }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());

  const turns = [
    ...conversationMessages
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'User' : 'Gremly'}: ${(m.content || '').slice(0, 300)}`),
    `Gremly: ${lastAssistantResponse.slice(0, 300)}`,
  ].join('\n');

  const entityContext = [
    entityTitle ? `about "${entityTitle}"` : '',
    entityType ? `(${entityType})` : '',
    spaceName ? `in the "${spaceName}" area` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const priorContext = previousSummary
    ? `\nPRIOR SUMMARY (build on this — preserve important context, update with new developments):\n${previousSummary}`
    : '';

  const prompt = `Today is ${today}. Summarize this conversation ${entityContext} in 1-3 sentences.${priorContext}

Capture: what was explored, any decisions or plans made, emotional signals, and open questions. Write as factual notes. Be specific with names, dates, and details.

CONVERSATION:
${turns}

SUMMARY:`;

  try {
    const res = await helperFetch('running_summary', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.3,
    });

    if (!res.ok) {
      console.warn(`[EntityChatSummary] Nano call failed: ${res.status}`);
      return;
    }

    const data = await res.json();
    let summary = (data.choices?.[0]?.message?.content || '').trim();
    if (!summary) return;

    // eslint-disable-next-line no-control-regex
    summary = truncateAtSentence(summary.replace(/[\0-\x1f\x7f]/g, ' ').trim(), 400);

    const rpcRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/set_chat_summary`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_summary: summary,
      }),
    });

    if (!rpcRes.ok) {
      console.warn(`[EntityChatSummary] RPC failed: ${rpcRes.statusText}`);
    } else {
      console.log(
        `[EntityChatSummary] Updated ${entityType} ${entityId} (${Date.now() - t0}ms): "${summary.slice(0, 60)}..."`,
      );
    }
  } catch (err) {
    console.warn(`[EntityChatSummary] Error: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPENAI FUNCTION TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// GREMLY CORE PERSONA — shared across Entity Chat, Habit Builder, Space Chat
// ═══════════════════════════════════════════════════════════════════════════════

// GREMLY_CORE_PERSONA: corePersona.js

/**
 * Determine token budget and reasoning effort for Gemini chat based on query complexity.
 *
 * @param {string} userMessage - The user's message
 * @param {{ isSearchFollowUp?: boolean }} [opts] - Optional flags
 * @returns {{ maxTokens: number, thinkingLevel: string }}
 */
function getChatConfig(userMessage, opts = {}) {
  const msg = (userMessage || '').toLowerCase();

  const isComplex =
    msg.length > 250 ||
    opts.isSearchFollowUp === true ||
    /\b(plan|steps|strategy|analyze|research|compare|explain|break down|think through|pros and cons|help me understand|in detail|deep dive|walk me through|how should i|what do you think)\b/i.test(
      msg,
    );

  return isComplex
    ? { maxTokens: 4096, thinkingLevel: 'medium' }
    : { maxTokens: 2048, thinkingLevel: 'low' };
}

function makeWebSearchTool(timezone) {
  return {
    type: 'function',
    function: {
      name: 'web_search',
      description: `Search the web for current, factual information. The current date is ${new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone || 'UTC' }).format(new Date())}.

DEFAULT TO SEARCHING. If there is ANY chance that current, specific information would improve your answer, search first. The cost of an unnecessary search is near zero. The cost of giving generic advice when specific information exists is high.

ALWAYS search for:
- Health, fitness, supplements, medications, nutrition
- Product recommendations or comparisons
- How-to guides, tutorials, best practices
- Current events, recent news, things that change over time
- Research topics, learning something new
- Trip planning, local recommendations, places to visit
- Recipes, cooking techniques, food information
- Technology, apps, tools, software recommendations
- Upcoming events, races, conferences, deadlines
- Any topic where up-to-date external sources would improve the answer
- ANY question where you're about to write "you might want to", "consider looking into", "some people find", or "it depends on" — search instead of hedging

DO NOT search for:
- Questions about the user's own tasks, habits, notes, or personal data
- Emotional support or reflection conversations
- Simple factual questions you can confidently answer (math, definitions, historical facts)
- When the user is venting or processing feelings
- Conversational responses like greetings`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Concise search query, 2-8 words. Be specific and include key terms.',
          },
        },
        required: ['query'],
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC MODEL & TOKEN ROUTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine the best model and token limit based on query complexity
 * Conservative approach: default to gpt-4.1, only use mini for clearly simple cases
 * @param {Object} options
 * @param {string} options.preset - The preset action (research, break_down, etc.)
 * @param {string} options.userMessage - The user's message
 * @param {number} options.messageCount - Number of messages in conversation
 * @param {string} options.entityType - Type of entity (todo, habit, note)
 * @returns {{ model: string, maxTokens: number, reason: string }}
 */
function getModelAndTokens({ preset, userMessage, messageCount, entityType }) {
  const msg = (userMessage || '').toLowerCase();

  // DEFAULT to gpt-4.1 — only downgrade for clearly simple cases

  // Simple enough for mini:
  const canUseMini =
    // No preset selected (freeform simple question)
    !preset &&
    // Short message (under 50 chars)
    msg.length < 50 &&
    // Single question or statement
    (msg.match(/\?/g) || []).length <= 1 &&
    // Early in conversation (first 2 messages)
    messageCount < 3 &&
    // No complexity signals
    !msg.includes('why') &&
    !msg.includes('how do i') &&
    !msg.includes('help me') &&
    !msg.includes('feeling') &&
    !msg.includes('struggling') &&
    !msg.includes('stuck') &&
    !msg.includes('explain') &&
    !msg.includes('compare') &&
    !msg.includes('pros and cons') &&
    !msg.includes('think through') &&
    !msg.includes('in depth');

  // Token limits based on expected response length
  const needsMoreTokens =
    preset === 'research' ||
    preset === 'break_down' ||
    preset === 'action_steps' ||
    msg.includes('plan') ||
    msg.includes('steps') ||
    msg.includes('list') ||
    msg.includes('all the') ||
    msg.length > 100;

  if (canUseMini) {
    return {
      model: helperModel('entity_chat_short'),
      maxTokens: 400,
      reason: 'simple_short_query',
    };
  }

  // Default: use the good model
  return {
    model: models().legacyOpenAIChat,
    maxTokens: needsMoreTokens ? 1000 : 800,
    reason: preset ? `preset:${preset}` : 'standard_query',
  };
}

// =============================================================================
// WEEKLY SUMMARY SYSTEM PROMPT (v1.0)
// =============================================================================
const WEEKLY_SUMMARY_SYSTEM_PROMPT = `You are Gremly — a warm, encouraging AI companion inside a calm productivity app. You know this person's week intimately: their completed tasks, habits, journal entries, ideas, and upcoming events. You are writing their Weekly Summary.

Your voice is first-person, conversational, and specific. You are NOT a corporate report generator. You are a thoughtful friend reviewing the week together. Be honest but kind — if it was a quiet week, acknowledge the pace and look forward. If it was productive, celebrate specifically.

## YOUR OUTPUT

Return ONLY valid JSON matching this exact schema. No markdown, no backticks, no preamble, no explanation outside the JSON.

{
  "weeklyCommentary": "string — 2-3 sentences in Gremly's voice. A warm, specific opening that captures the week's essence. Reference actual items by name. Never generic ('great week!'). If sparse data, acknowledge the pace honestly and point forward.",
  "highlightMoment": {
    "title": "string — the single most notable achievement or moment",
    "reason": "string — why this matters in context of their goals/patterns",
    "gremlyComment": "string — a warm one-liner reaction (e.g., 'This one's been on your list a while — feels good, right?')"
  },
  "insights": [
    {
      "type": "stale_cleanup | capture_ratio | productivity_pattern | space_activity | balance | habit_observation | journal_encouragement",
      "headline": "string — short, conversational (e.g., 'A few things gathering dust')",
      "body": "string — 1-2 sentences explaining the observation",
      "isActionable": true,
      "actionLabel": "string — CTA button text (e.g., 'Review stale items') — only if isActionable",
      "actionType": "string — one of: 'open_cleanup', 'open_sweep', 'open_habits' — only if isActionable",
      "staleItemIds": ["string"] 
    }
  ],
  "weekAhead": {
    "introduction": "string — Gremly's forward-looking comment about next week",
    "highlights": [
      {
        "eventTitle": "string",
        "day": "string (e.g., 'Thursday')",
        "time": "string or null",
        "context": "string or null — connection to journal/note if relevant",
        "prepNudge": "string or null — if preparation is needed"
      }
    ],
    "busyDayWarnings": [{ "day": "string", "comment": "string" }],
    "totalEventCount": 0
  },
  "keyThemes": ["string — 3-5 theme words/phrases capturing the week"],
  "mood": "string — AI-inferred emotional tone (e.g., 'focused', 'overwhelmed', 'steady', 'reflective')"
}

## INSIGHT RULES

1. Pick only 2-4 insights. Quality over quantity. If only 1 is genuinely useful, return 1. Never pad with filler.
2. stale_cleanup is one POSSIBLE insight type, not guaranteed. Only surface it when 3+ stale items exist. Stale items are "zombie items" — things the user keeps pushing to tomorrow in their Evening Sweep instead of actually doing. Each stale item includes: ageDays (how long it's been on their list) and sweepRescheduleCount (how many times they've explicitly bumped it in Sweep). When sweepRescheduleCount is high (7+), lead with that: "You've rescheduled this 12 times." When it's 0 (data still accumulating), use ageDays: "This has been on your list for 24 days." Sort your commentary by the worst offenders first. Include the actual item IDs in staleItemIds.
3. For stale_cleanup: actionType = 'open_cleanup'. For capture_ratio (unprocessed drops): actionType = 'open_sweep'. For habit_observation: actionType = 'open_habits'.
4. balance and space_activity insights should note which spaces are active vs quiet, but frame positively.
5. habit_observation should reference specific habits and their completion patterns from the completedDays arrays.
6. journal_encouragement: only if the user journals and you can connect an entry's theme to their actions or upcoming events.
7. productivity_pattern: reference specific days/time blocks from completionsByDay and completionsByTimeBlock.

## WEEK AHEAD RULES

1. Classify upcoming events into tiers:
   - Tier 1 (highlight): Events created inside Gremly (source='gremly_entity' or source='user_calendar'), important meetings, deadlines, events the user has interacted with. Gremly-created entity events are ALWAYS Tier 1 — these are things the user intentionally tracked (e.g., "Flight to Los Angeles", "Mom's birthday party").
   - Tier 2 (count only): Routine recurring calendar events, minor external calendar items (source='calendar').
2. Only include Tier 1 events in the highlights array. Set totalEventCount to the total of ALL events.
3. When an event has a spaceName, mention the Space by name to give context (e.g., "In your 'LA Trip' space, you've got…").
4. When an event has a location, include it naturally in the highlight context.
5. When an event has linkedTodoCount > 0, mention the prep items (e.g., "You have 3 tasks linked to this event").
6. When an event has an endDate different from its date, it's a multi-day event — frame it as a range (e.g., "Thursday through Sunday").
7. Cross-reference upcoming event titles against journal excerpts and note titles. If a journal entry mentions something related to an upcoming event, include that connection in the highlight's context field.
8. If any day next week has 4+ events, add a busyDayWarning.
9. Keep prepNudge suggestions concrete and actionable: "Draft your agenda tonight" not "Be prepared".

## VOICE & TONE

1. Commentary must reference specific items. "You knocked out 'Fix login bug' and 'Update docs'" not "You completed several tasks."
2. Frame everything positively but honestly. Quiet week = "A gentler pace this week — sometimes that's exactly what's needed." Not "You didn't do much."
3. For sparse data (first week, few items): Still produce a useful summary. Acknowledge the early stage. Focus on what WAS captured and look forward.
4. Never use corporate jargon: no "synergy", "leverage", "optimize", "actionable insights". Speak like a thoughtful friend.
5. Keep keyThemes to 3-5 concise phrases. These are tags, not sentences.
6. mood should be a single word or short phrase reflecting the overall emotional reading.

## TREND CONTEXT RULES (when prior week data is provided)

1. Only reference prior weeks when a pattern is sustained across 2+ weeks. One-off changes are noise.
2. Never open with "Last week you also..." — weave history into forward-looking observations.
3. If the user acted on a previous recommendation (e.g., cleaned up stale items after you suggested it), acknowledge it warmly.
4. Never repeat the same insight verbatim from a prior week. If the same issue persists, reframe or escalate.
5. Use the insightFrequency data to avoid fatigue: if the same insight type appeared 3+ consecutive weeks, either skip it, reframe it significantly, or escalate ("This keeps coming up — might be worth a deeper look").
6. When completionTrend is 'declining', don't scold. Frame as an observation and ask if priorities shifted.
7. When habitConsistencyTrend is 'increasing', celebrate the streak momentum.
8. workLifeBalanceTrend data is directional — use it to add nuance, not as a diagnosis.

## HANDLING EDGE CASES

- Zero completed todos: Focus on habits, journal entries, ideas captured. Frame around reflection/planning.
- No journal entries: Skip journal_encouragement insight. Don't nag about journaling.
- No upcoming events: weekAhead.introduction = forward-looking encouragement. highlights = empty array.
- No stale items: Do not generate stale_cleanup insight.
- No habits: Skip habit_observation insight.
- All data sparse: Produce a shorter, genuine summary. Short is better than padded.`;

// ═══════════════════════════════════════════════════════════════════
// IP-based rate limiting — Phase 6 prep
// Prevents abuse of ungated AI endpoints (classification, enrichment, etc.)
// Uses CONTEXT_CACHE KV with per-minute sliding windows.
// Fails open: if KV is unavailable, the request proceeds.
// ═══════════════════════════════════════════════════════════════════

async function checkIpRateLimit(request, env, bucket, maxPerMinute) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const minute = Math.floor(Date.now() / 60000);
    const key = `rate:${bucket}:ip:${ip}:${minute}`;

    const current = await env.CONTEXT_CACHE.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= maxPerMinute) {
      return { allowed: false, count, limit: maxPerMinute };
    }

    await env.CONTEXT_CACHE.put(key, String(count + 1), { expirationTtl: 120 });
    return { allowed: true, count: count + 1, limit: maxPerMinute };
  } catch {
    // Fail open — don't block requests if KV is down
    return { allowed: true, count: 0, limit: maxPerMinute };
  }
}

function rateLimitResponse(bucket, count, limit) {
  return new Response(
    JSON.stringify({
      error: 'rate_limited',
      message: 'Too many requests. Please try again in a moment.',
      bucket,
      count,
      limit,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Retry-After': '60',
      },
    },
  );
}

// ═══════════════════════════════════════════════════════════════════
// Access control helpers — Phase 4.7
// ═══════════════════════════════════════════════════════════════════

/**
 * Check whether a user has access to generative/mutation endpoints.
 *
 * Access rules:
 *   - is_tester=true → always allowed
 *   - is_subscribed=true → always allowed (set by RevenueCat webhook)
 *   - challenge_completed_at IS NULL AND within 14 days of trial_started_at → allowed (free window)
 *   - otherwise → denied (read-only)
 *
 * Fails open: if the access check itself errors, returns hasAccess=true so
 * legit users don't get blocked by transient infrastructure issues.
 */
async function checkUserAccess(userId, env) {
  if (!userId) {
    return { hasAccess: false, reason: 'missing_user_id' };
  }

  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/cortex_preferences?owner_id=eq.${userId}&select=is_tester,is_subscribed,trial_started_at,challenge_completed_at`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      },
    );

    if (!response.ok) {
      console.error('[Cortex:access] Fetch failed:', response.status);
      return { hasAccess: true, reason: 'access_check_failed_fail_open' };
    }

    const rows = await response.json();
    const prefs = rows[0];

    if (!prefs) {
      console.warn('[Cortex:access] No cortex_preferences row for userId:', userId);
      return { hasAccess: true, reason: 'no_prefs_row_fail_open' };
    }

    if (prefs.is_tester === true) {
      return { hasAccess: true, reason: 'tester' };
    }

    if (prefs.is_subscribed === true) {
      return { hasAccess: true, reason: 'subscribed' };
    }

    // Free window: challenge not yet complete AND within 14 days of trial start
    if (prefs.challenge_completed_at === null && prefs.trial_started_at) {
      const trialStarted = new Date(prefs.trial_started_at).getTime();
      const ceilingMs = 14 * 24 * 60 * 60 * 1000;
      if (Date.now() < trialStarted + ceilingMs) {
        return { hasAccess: true, reason: 'free_window' };
      }
    }

    return { hasAccess: false, reason: 'read_only' };
  } catch (err) {
    console.error('[Cortex:access] Check threw:', err);
    return { hasAccess: true, reason: 'access_check_exception_fail_open' };
  }
}

/**
 * Standard 403 response for read-only users. Client detects this shape
 * and routes to the paywall screen.
 */
function denyAccessResponse(reason) {
  return new Response(
    JSON.stringify({
      error: 'read_only',
      message: 'Subscription required to use this feature.',
      reason,
    }),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}

/**
 * For streaming endpoints (SSE), return a 200 OK response with a single
 * SSE error event and close. EventSource on the client can't read HTTP
 * status on connection failure, so we deliver the error via the stream itself.
 */
function denyAccessSSEResponse(reason) {
  const encoder = new TextEncoder();
  const body = `data: ${JSON.stringify({ error: 'read_only', reason })}\n\n`;
  return new Response(encoder.encode(body), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// RevenueCat webhook handler — Phase 4.7
// ═══════════════════════════════════════════════════════════════════

/**
 * Receives RevenueCat webhook events and updates is_subscribed on cortex_preferences.
 *
 * RevenueCat sends Authorization: Bearer <shared-secret>. We verify against
 * env.REVENUECAT_WEBHOOK_SECRET and reject on mismatch.
 *
 * Events we care about:
 *   - INITIAL_PURCHASE, RENEWAL, NON_RENEWING_PURCHASE → set is_subscribed=true
 *   - CANCELLATION → no change yet (user still has access until expiration)
 *   - EXPIRATION → set is_subscribed=false
 *   - PRODUCT_CHANGE → set is_subscribed=true (still has an active entitlement)
 *   - BILLING_ISSUE → no change (user temporarily in grace period)
 *   - SUBSCRIPTION_EXTENDED → no change (still subscribed)
 *   - TRANSFER → set is_subscribed=true for new user, false for old
 *
 * For any event we don't explicitly handle, we just log and return 200.
 */
async function handleRevenueCatWebhook(request, env) {
  // 1. Verify shared secret
  const authHeader = request.headers.get('Authorization');
  const expected = `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`;

  if (!env.REVENUECAT_WEBHOOK_SECRET) {
    console.error('[Cortex:rc-webhook] REVENUECAT_WEBHOOK_SECRET not configured');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  if (authHeader !== expected) {
    console.warn('[Cortex:rc-webhook] Invalid Authorization header');
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse body
  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error('[Cortex:rc-webhook] Invalid JSON body:', err);
    return new Response('Invalid body', { status: 400 });
  }

  const event = body.event;
  if (!event) {
    console.error('[Cortex:rc-webhook] Missing event payload');
    return new Response('Missing event', { status: 400 });
  }

  const eventType = event.type;
  const appUserId = event.app_user_id;

  if (!appUserId) {
    console.warn('[Cortex:rc-webhook] Missing app_user_id, ignoring');
    return new Response('OK', { status: 200 });
  }

  console.log(`[Cortex:rc-webhook] ${eventType} for user ${appUserId}`);

  // 3. Determine new is_subscribed state based on event type
  let newSubscribedState = null; // null = no change

  switch (eventType) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'NON_RENEWING_PURCHASE':
    case 'PRODUCT_CHANGE':
    case 'UNCANCELLATION':
      newSubscribedState = true;
      break;
    case 'EXPIRATION':
      newSubscribedState = false;
      break;
    case 'TRANSFER':
      // Handle transfer separately — update both old and new user IDs
      await handleTransferEvent(event, env);
      return new Response('OK', { status: 200 });
    case 'CANCELLATION':
    case 'BILLING_ISSUE':
    case 'SUBSCRIPTION_EXTENDED':
    case 'SUBSCRIPTION_PAUSED':
    case 'TEST':
      // No state change needed
      console.log(`[Cortex:rc-webhook] ${eventType}: no state change`);
      return new Response('OK', { status: 200 });
    default:
      console.warn(`[Cortex:rc-webhook] Unknown event type: ${eventType}`);
      return new Response('OK', { status: 200 });
  }

  if (newSubscribedState === null) {
    return new Response('OK', { status: 200 });
  }

  // 4. Update cortex_preferences
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/cortex_preferences?owner_id=eq.${appUserId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ is_subscribed: newSubscribedState }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Cortex:rc-webhook] Supabase update failed: ${response.status} ${errText}`);
      return new Response('OK', { status: 200 });
    }

    console.log(`[Cortex:rc-webhook] is_subscribed=${newSubscribedState} for ${appUserId}`);
    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('[Cortex:rc-webhook] Update threw:', err);
    return new Response('OK', { status: 200 });
  }
}

async function handleTransferEvent(event, env) {
  const oldUserId = event.transferred_from?.[0];
  const newUserId = event.transferred_to?.[0];

  if (oldUserId) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/cortex_preferences?owner_id=eq.${oldUserId}`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_subscribed: false }),
    });
  }

  if (newUserId) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/cortex_preferences?owner_id=eq.${newUserId}`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_subscribed: true }),
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// JWT verification (Phase 6.2)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Verify Supabase JWT using HS256 shared secret.
 * Returns the verified payload { sub, email, ... } or null if invalid/expired.
 */
async function verifyJWT(token, secret) {
  if (!token || !secret) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header to check algorithm
    const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
    if (header.alg !== 'HS256') return null;

    // Verify signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signatureBytes = Uint8Array.from(
      atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    );
    const signedData = encoder.encode(`${headerB64}.${payloadB64}`);
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, signedData);
    if (!valid) return null;

    // Decode payload
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

    // Check expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    return payload;
  } catch (err) {
    console.warn('[verifyJWT] Verification failed:', err?.message ?? err);
    return null;
  }
}

/**
 * Extract authenticated user ID from incoming request's Authorization header.
 * Returns the user UUID from the JWT's sub claim, or null if no valid auth.
 */
async function extractAuthenticatedUserId(request, env) {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  const payload = await verifyJWT(token, env.SUPABASE_JWT_SECRET);
  return payload?.sub ?? null;
}

function unauthorizedResponse() {
  return new Response(
    JSON.stringify({ error: 'unauthorized', message: 'Invalid or missing session' }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}

function unauthorizedSSEResponse() {
  return new Response(
    JSON.stringify({ error: 'unauthorized', message: 'Invalid or missing session' }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}

// The Worker's request handler. The default export below runs it inside a
// usage context, so every model call it makes is logged to ai_usage
// (../shared/aiUsage.js).
const cortexHandler = {
  async fetch(request, env, ctx) {
    configureModels(env); // every model the Worker calls, resolved from env (models.js)
    // --- URL-based routing (Phase 4.7) ---
    const url = new URL(request.url);

    // RevenueCat webhook endpoint
    if (url.pathname === '/revenuecat-webhook' && request.method === 'POST') {
      return handleRevenueCatWebhook(request, env);
    }

    // --- CORS preflight ---
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // Route: POST /api/challenge-completed
    // Auth: JWT required (Phase 6.3)
    // Proxies to Inngest worker's /api/challenge-completed endpoint
    if (url.pathname === '/api/challenge-completed' && request.method === 'POST') {
      const authenticatedUserId = await extractAuthenticatedUserId(request, env);
      if (!authenticatedUserId) {
        return unauthorizedResponse();
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: 'invalid_json' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Security: force user_id to match authenticated user, regardless of body claim
      const forwardBody = {
        ...body,
        user_id: authenticatedUserId,
      };

      try {
        const inngestRes = await fetchInngestWorker(env, '/api/challenge-completed', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': env.INNGEST_ADMIN_KEY,
          },
          body: JSON.stringify(forwardBody),
        });

        const text = await inngestRes.text();
        return new Response(text, {
          status: inngestRes.status,
          headers: {
            'Content-Type': inngestRes.headers.get('Content-Type') ?? 'application/json',
          },
        });
      } catch (err) {
        console.error('[challenge-completed proxy] Forward failed:', err);
        return new Response(JSON.stringify({ error: 'forward_failed' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    try {
      const raw = await request.text();
      const body = raw ? JSON.parse(raw) : {};
      const key = env.OPENAI_API_KEY;

      const type = body.type || 'complete';
      const lane = body.lane || null;
      setAiUsage({ job: lane || type });

      // Check if client requests streaming
      const wantsStreaming = body.stream === true;
      const isPhase2Streaming = wantsStreaming && type === 'enrich-phase2';
      const isEntityChatStreaming = wantsStreaming && type === 'entity-chat';
      const isHabitBuilderStreaming = wantsStreaming && type === 'habit-builder';

      // =========================
      // JWT Authentication Gate (Phase 6.2)
      // Routes that access user-specific data require a valid session JWT.
      // Classification, enrichment, and other stateless routes stay open.
      // =========================
      const AUTH_REQUIRED_TYPES = new Set([
        'general-greeting',
        'wrap-words',
        'habit-builder',
        'entity-chat',
        'organize-day',
        'weekly-summary',
        'floor-suggest',
        'habit-read',
        'minddrop-relate',
        'item-topics',
        'not-right',
        'daily-brief',
        'plan-pick',
        'day-turn',
        'brief-turn',
        'week-read',
        'week-spread',
        'notification-test',
        'forget-me',
        'chapter-memory',
        'worlds-changed',
        'chapter-said-no',
        'chapter-guess',
        'person-merge',
        'person-page',
      ]);
      const AUTH_REQUIRED_LANES = new Set(['general_chat']);

      const needsAuth = AUTH_REQUIRED_TYPES.has(type) || (lane && AUTH_REQUIRED_LANES.has(lane));

      let authenticatedUserId = null;
      if (needsAuth) {
        authenticatedUserId = await extractAuthenticatedUserId(request, env);
        if (!authenticatedUserId) {
          console.warn(
            `[AUTH] Rejected unauthenticated request: type=${type}, lane=${lane}, ip=${request.headers.get('CF-Connecting-IP')}`,
          );
          // Use SSE-friendly response for streaming routes so client doesn't open a dead stream
          if (wantsStreaming) {
            return unauthorizedSSEResponse();
          }
          return unauthorizedResponse();
        }
      }
      // Open routes (drop classification and enrichment, filing) need no session,
      // but the app sends one on them too. A valid one names the person in the
      // usage log only, so cost per person counts drops. Nothing else reads it.
      const usageUserId =
        authenticatedUserId || (needsAuth ? null : await extractAuthenticatedUserId(request, env));
      setAiUsage({ userId: usageUserId || body.userId || body.user_id || null });

      // =========================
      // Timezone resolution (single source of truth per request)
      // Three-tier fallback: client body → user_profiles → UTC
      // =========================
      async function resolveTimezone(reqBody, reqEnv) {
        const clientTz = reqBody?.timezone;
        if (clientTz && typeof clientTz === 'string' && clientTz.length >= 2) {
          return clientTz;
        }

        // Client didn't send timezone — read from stored profile
        // Prefer verified JWT userId when available, fall back to body.userId for non-auth routes
        const tzUserId = authenticatedUserId || reqBody?.userId;
        if (tzUserId && reqEnv?.SUPABASE_URL) {
          try {
            const res = await fetch(
              `${reqEnv.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${tzUserId}&select=timezone`,
              {
                headers: {
                  apikey: reqEnv.SUPABASE_SERVICE_KEY,
                  Authorization: `Bearer ${reqEnv.SUPABASE_SERVICE_KEY}`,
                },
              },
            );
            if (res.ok) {
              const data = await res.json();
              if (data?.[0]?.timezone) {
                console.log('[Timezone] Resolved from profile:', data[0].timezone);
                return data[0].timezone;
              }
            }
          } catch (err) {
            console.warn('[Timezone] Profile fetch failed:', err.message);
          }
        }

        console.warn('[Timezone] Falling back to UTC — no client value, no profile value', {
          userId: (authenticatedUserId || reqBody?.userId)?.slice(0, 8) || 'unknown',
        });
        return 'UTC';
      }

      const userTimezone = await resolveTimezone(body, env);

      console.log('[TIMEZONE_DEBUG]', {
        timezone: body.timezone,
        type: typeof body.timezone,
        keys: Object.keys(body).filter((k) => k.toLowerCase().includes('time')),
      });

      // =========================
      // Helpers
      // =========================
      const clamp01 = (n) => Math.max(0, Math.min(1, n));

      // =========================
      // Save Suggestion Extractor (post-response)
      // =========================
      // Uses a fast, cheap model to decide whether to show a Save card/chips and what type.
      // This MUST NOT change the assistant's conversational response.
      // --- Valid mood values (v3.0) ---
      const VALID_MOODS = [
        // Energy moods
        'great',
        'good',
        'okay',
        'low',
        'tired',
        // Emotion moods
        'anxious',
        'overwhelmed',
        'frustrated',
        'scattered',
        'grateful',
        'hopeful',
        'focused',
        'calm',
      ];

      // --- Clarification confidence threshold ---
      // Below this confidence, AI should ask a clarifying question instead of guessing
      const BUCKET_CONFIDENCE_THRESHOLD = 0.7;

      function isSenseMakingJournal(text) {
        const t = String(text || '').trim();
        if (!t) return false;

        const infoDump =
          /\b(http|www\.|@\w+|isbn|serial\s+number|address:|phone:|reference|documentation)\b/i;
        if (infoDump.test(t)) return false;

        const reflectionVerbs =
          /\b(i\s+realized|i\s+noticed|i\s+learned|i\s+figured\s+out|i\s+keep\s+thinking|i\s+can't\s+stop\s+thinking|it\s+made\s+me\s+realize|it\s+reminded\s+me)\b/i;

        const patternLanguage =
          /\b(lately|recently|this\s+week|these\s+days|for\s+the\s+past\s+\d+\s+(days|weeks)|i['']ve\s+been|i\s+have\s+been|i\s+keep|i\s+tend\s+to)\b/i;

        const selfStateFrame =
          /\b(i\s+feel|i\s+felt|i['']m|i\s+am|i\s+was|been\s+feeling|my\s+mood|in\s+my\s+head)\b/i;

        const internalStateWords =
          /\b(anxious|anxiety|stressed|stressful|overwhelmed|tired|exhausted|sad|down|lonely|angry|frustrated|worried|scared|nervous|restless|calm|peaceful|relieved|proud|grateful|thankful|happy|excited|content)\b/i;

        const expectationShift =
          /\b(more\s+than\s+i\s+expected|less\s+than\s+i\s+expected|than\s+i\s+expected|surprised\s+me|didn['']t\s+think\s+i['']d|wasn['']t\s+expecting|turned\s+out\s+better|turned\s+out\s+worse|ended\s+up)\b/i;

        const meaningCues =
          /\b(i\s+don['']t\s+know\s+why|not\s+sure\s+why|it\s+means|made\s+me\s+think|i\s+want\s+to\s+change|i\s+need\s+to\s+change|i\s+should\s+stop|i\s+should\s+start)\b/i;

        if (reflectionVerbs.test(t)) return true;
        if (expectationShift.test(t)) return true;
        if (patternLanguage.test(t) && (meaningCues.test(t) || internalStateWords.test(t)))
          return true;
        if (selfStateFrame.test(t) && internalStateWords.test(t)) return true;
        if (meaningCues.test(t)) return true;

        return false;
      }

      function normalizePhase1(bucket, subtype, text) {
        const validBuckets = ['todo', 'habit', 'log', 'ambiguous'];
        let b = String(bucket || '').toLowerCase();
        // If ambiguous, store as log/general for DB compatibility
        if (b === 'ambiguous') {
          return { bucket: 'log', subtype: 'general' };
        }
        if (!validBuckets.includes(b)) b = 'log';

        let st = null;
        if (b === 'log') {
          const validSubtypes = ['journal', 'idea', 'general', 'event'];
          st = validSubtypes.includes(subtype) ? subtype : 'general';
          if (st === 'general' && isSenseMakingJournal(text)) st = 'journal';
        }
        return { bucket: b, subtype: st };
      }

      // =========================
      // === HABIT BUILDER SYSTEM PROMPT ===
      // =========================
      // the habit builder's instructions: habitBuilderPrompt.js

      // ─── V2 MODE-SPECIFIC PROMPT SECTIONS ─────────────────────────────
      // DESIGN RULE: Semantic instructions only. No example phrases, no template
      // sentences, no sample responses. The AI pattern-matches examples and
      // regurgitates them verbatim. Describe WHAT to do, never HOW to say it.

      const HABIT_MODE_QUICK_LOCK = `
=== MODE: QUICK LOCK ===
This user provided a fully-formed habit with behavior, type, and frequency already stated. They know what they want.

APPROACH:
- Confirm what you heard in a single natural sentence. Do not reformat it as a list or card.
- If one element is ambiguous, ask ONE clarifying question. If nothing is ambiguous, move directly to the lock-in question.
- If existing habits in context interact with this one (complement, conflict, or share a time window), mention it in one sentence.
- Reach the lock-in question within 2 exchanges maximum.
- Skip motivation and background — this user came to execute, not explore.`;

      const HABIT_MODE_SHAPE = `
=== MODE: SHAPE ===
This user has a vague intent that needs shaping into a specific, trackable behavior. They said something broad without a concrete action or frequency.

APPROACH:
- Your first response: ask ONE question that narrows from category to specific behavior. Target the verb — what will they physically do?
- By your third response in the conversation, propose a concrete habit with a specific behavior, frequency, and time. Don't keep asking — propose and let them react.
- If your proposal doesn't land, iterate on it. Proposing and adjusting is faster than more questions.
- Never ask more than one question per response.
- The value you provide is turning vague intent into something schedulable. If they could have typed it into a form, you haven't added value.`;

      const HABIT_MODE_RESEARCH = `
=== MODE: RESEARCH ===
This user wants information or perspective before committing. They asked a question or expressed curiosity about an approach.

APPROACH:
- You have web search results injected into context. Lead with the single most specific and useful finding — a number, a study result, a concrete data point. Never open with vague framing.
- Synthesize no more than 2-3 findings and connect each one to the user's specific situation. Do not list findings generically.
- After delivering the research value, pivot to shaping a specific habit based on what resonated. Propose something concrete.
- The research IS the value-add. This is what differentiates the chat from a form. If you give generic advice without referencing search results, you've failed the mode.
- If mid-conversation the user asks a follow-up research question, search again. Say you're looking into it and use web_search.
- Prefer widely recognized sources — major health organizations, established fitness publications, university research, well-known media outlets. If search results only return niche or unfamiliar sites, rely on your training knowledge instead and be transparent that you couldn't find strong sources.`;

      const HABIT_MODE_BREAK = `
=== MODE: BREAK ===
This user wants to stop, reduce, or eliminate a behavior. This is psychologically different from building a new habit. Use a completely different conversation structure.

CONVERSATION STRUCTURE (follow this order):
1. Clarify the specific behavior to stop and how often it currently happens.
2. Identify the primary trigger — what situation, emotion, or time of day causes it. Ask ONE question about this, not a list of options.
3. Identify or suggest a replacement behavior for when the trigger hits. If they don't know, suggest 2-3 context-appropriate alternatives.
4. Shape a specific, binary, measurable boundary rule. The rule should be enforceable — something they can answer yes/no to at the end of each day.

KEY DIFFERENCES FROM BUILD:
- Frequency is implicit: daily avoidance is the default. Don't ask "how often do you want to avoid it."
- Time window refers to when the TRIGGER occurs, not when they'll do a positive action.
- Understanding WHY they want to stop drives the replacement behavior — motivation matters more here than in build.
- Notes should capture: the trigger, the replacement, and any environment changes they plan.

TRACKING FRAMING:
Build habits show on the Today page for tick-off completion. Break habits are tracked through the Evening Wrap Up, where the user reports whether they held the boundary. Frame tracking accordingly. Never describe the wrong mechanism.

FRAMING:
Never frame a break habit as deprivation or loss. Frame it as a trade — replacing one behavior with another when the trigger hits.`;

      const HABIT_MODE_EVENT_ANCHORED = `
=== MODE: EVENT ANCHORED ===
This user's habit is tied to a deadline, event, or milestone. The event is the context for everything.

APPROACH:
- Acknowledge the timeline in your first response. Calculate the remaining weeks or months. Make the timeline feel concrete.
- Shape the habit with the timeline in mind. For training goals, consider progressive difficulty. For lifestyle changes before an event, suggest a sustainable pace that doesn't burn out before the date.
- End date is a required field in this mode, not optional. Extract or confirm it.
- If appropriate, suggest starting easier and ramping up. The initial habit captures the starting point only — progression planning happens through entity chat after creation.
- After lock-in, tell the user that Gremly shows a countdown and that the entity chat can help adjust the plan as the event approaches.
- The event name and timeline should appear in the notes field.`;

      const HABIT_MODE_RESTART = `
=== RESTART CONTEXT ===
This user has tried this habit (or something similar) before and stopped. Before shaping, ask ONE question about what got in the way previously.

Use their answer to shape the habit differently than their last attempt:
- Overcommitment → suggest smaller scope or lower frequency than they tried before.
- Lost motivation → suggest accountability mechanisms or habit stacking with existing routines.
- Life disruption → suggest flexible scheduling (weekly target rather than fixed days).
- Forgetting → suggest anchoring to an existing behavior or time-based trigger.

The notes field should capture what's different about this attempt compared to the previous one.

Spend ONE exchange on what went wrong, then move forward. Do not dwell on failure or analyze it extensively.`;

      const HABIT_MODE_NUDGE = `
=== NUDGE ===
This conversation has been going for a while without reaching a concrete proposal. It is time to synthesize. Take everything the user has shared — goals, constraints, context, preferences — and shape it into one specific, concrete habit proposal with behavior, frequency, and timing. Ask if they want to lock it in or adjust.`;

      const HABIT_SHARED_V2_ADDITIONS = `

=== READINESS MODEL ===
You are NOT collecting form fields. You are having a conversation that gradually resolves a habit. The extraction model runs in the background and tracks readiness — you don't need to mentally checklist fields. Focus on having a genuinely useful conversation. The UI handles showing what's been resolved.

When you have enough to propose something concrete, propose it. When the conversation has been valuable AND all critical fields are resolved, move to confirmation. Don't rush to confirmation just because fields are complete — if the conversation is adding value, keep going.

=== CONTEXT AWARENESS ===
You receive context about the user's existing habits, life situation, and capacity. Use it naturally — don't dump all context at once, weave it in where relevant:
- If they have many daily habits, lean toward suggesting weekly or 2-3x/week for the new one.
- If their life context is relevant (major transition, busy period, etc.), factor it into your suggestions.
- If they have a habit that conflicts with or complements what they're building, reference it.

=== CONVERSATION LENGTH ===
If you're 6+ exchanges in without having proposed a specific habit, synthesize and propose. The user can always tweak after creation through entity chat. Don't let pursuit of the perfect habit prevent creating a good one.

=== POST-LOCK-IN EDITS ===
If the user requests a change after confirming (different frequency, different start date, etc.), acknowledge the change in one sentence. The app handles the update. Do not re-confirm or re-propose the entire habit.

=== HABIT STACKING ===
After the user confirms and locks in a habit, check the existing habits listed in the session context. If any existing habit shares the same time window (morning/evening) or cadence (daily) as the new habit, offer to anchor the new one to the existing one. One sentence, framed as a suggestion not a requirement. If the user agrees, mention it will be linked in the app. If no existing habits match or the user has no habits yet, skip this entirely — do not mention stacking.`;

      // Map mode string to prompt section
      const HABIT_MODE_PROMPTS = {
        QUICK_LOCK: HABIT_MODE_QUICK_LOCK,
        SHAPE: HABIT_MODE_SHAPE,
        RESEARCH: HABIT_MODE_RESEARCH,
        BREAK: HABIT_MODE_BREAK,
        EVENT_ANCHORED: HABIT_MODE_EVENT_ANCHORED,
      };

      // =========================
      // === GENERAL GREETING ===
      // =========================
      // Gremly's own words in the evening wrap up (agent plan step 10): the
      // opener, the journal question, his reply to an entry, the close, and
      // which of his questions to ask tonight. The app says its fixed sentence
      // when this has nothing.
      if (type === 'wrap-words') {
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return denyAccessResponse(access.reason);
        }
        try {
          const out = await writeWrapWords({ env, userId: authenticatedUserId, body });
          return j(out ? { ...out, version: WRAP_WORDS_VERSION } : { words: null });
        } catch (err) {
          console.warn('[WrapWords] Failed:', String(err?.message || err).slice(0, 200));
          return j({ words: null });
        }
      }

      // What got me here: the line on the age up page, written from the three
      // fed days that earned the age. The app shows its fallback when this
      // has nothing or is late.
      if (type === 'age-words') {
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return denyAccessResponse(access.reason);
        }
        try {
          const out = await writeAgeWords({
            env,
            userId: authenticatedUserId,
            tz: userTimezone,
            body,
          });
          return j(out ? { ...out, version: AGE_WORDS_VERSION } : { line: null });
        } catch (err) {
          console.warn('[AgeWords] Failed:', String(err?.message || err).slice(0, 200));
          return j({ line: null });
        }
      }

      if (type === 'general-greeting') {
        // Access gate — Phase 4.7
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return denyAccessResponse(access.reason);
        }

        try {
          // their day: after midnight it is still yesterday until their day ends
          const theirDay = await personNow(env, authenticatedUserId, userTimezone);
          // the daily context, and what is still on the calendar today
          const [dailyFocus, week] = await Promise.all([
            getDailyFocusForChat(authenticatedUserId, env, userTimezone, theirDay.today),
            readWeekAhead(authenticatedUserId, userTimezone, env, { today: theirDay.today }),
          ]);
          // eslint-disable-next-line no-restricted-syntax -- Worker has no dateService; timezone-safe via Intl
          const now = new Date();
          const timeStr = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: userTimezone,
          }).format(now);
          // the weekday of their day, read at noon so no time zone moves it
          const dayStr = new Intl.DateTimeFormat('en-US', {
            weekday: 'long',
            timeZone: 'UTC',
          }).format(new Date(`${theirDay.today}T12:00:00Z`));
          const clockMinutes = minutesIn(userTimezone, now);
          const hour = Math.floor(clockMinutes / 60);
          // after midnight on their day, everything on that day's calendar has passed
          const nowMinutes = theirDay.late ? clockMinutes + 24 * 60 : clockMinutes;
          const today = week?.days?.[0];
          const laterToday = today
            ? [
                ...today.meetings
                  .filter((m) => m.start >= nowMinutes)
                  .map((m) => `${clock(m.start)} ${m.title}`),
                ...today.allDay.map((a) => `all day: ${a.title}`),
              ].slice(0, 6)
            : [];
          const prompt = greetingPrompt({
            timeStr,
            dayStr,
            hour,
            facts: greetingFacts({
              focus: dailyFocus,
              laterToday,
              // sent by app builds that know them
              briefUnread: body.brief_unread === true,
              toDecide: Number(body.to_decide) || 0,
              // while Answer some Gremly questions shows (data fabric stage 4f)
              questions:
                body.questions_waiting && typeof body.questions_waiting === 'object'
                  ? {
                      count: Math.max(0, Math.min(99, Number(body.questions_waiting.count) || 0)),
                      needs: Math.max(0, Math.min(99, Number(body.questions_waiting.needs) || 0)),
                    }
                  : null,
            }),
          });

          const res = await helperFetch('general_greeting', {
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: 'Write the line.' },
            ],
            max_tokens: 80,
            temperature: 0.7,
          });

          if (res.ok) {
            const data = await res.json();
            const greeting = (data.choices?.[0]?.message?.content || '')
              .trim()
              .replace(/^["']|["']$/g, '');
            return j({ greeting });
          }
          return j({ greeting: null });
        } catch (err) {
          console.warn('[GeneralGreeting] Failed:', err.message);
          return j({ greeting: null });
        }
      }

      // =========================
      // === HABIT BUILDER CHAT ===
      // =========================
      if (type === 'habit-builder') {
        // Access gate — Phase 4.7
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return wantsStreaming
            ? denyAccessSSEResponse(access.reason)
            : denyAccessResponse(access.reason);
        }

        const messages = Array.isArray(body.messages) ? body.messages : [];
        const context = body.context || {};

        // Load user profile and session context (same as entity chat)
        let userProfileContext = '';
        let habitTodayActivity = null;
        if (authenticatedUserId) {
          try {
            const [chatContext, profile, todayAct] = await Promise.all([
              buildChatContext(
                authenticatedUserId,
                'habit_builder',
                {
                  message: lastUserText(body),
                  timezone: userTimezone,
                  currentChatId: body.chatId || null,
                },
                env,
              ),
              getUserProfile(authenticatedUserId, env),
              buildTodayActivity(authenticatedUserId, userTimezone, env),
            ]);
            const ageInfo = getAgeGuidance(profile?.relationshipStartedAt, profile?.signals);

            if (profile?.profileText) {
              userProfileContext += `\n=== ABOUT THIS USER ===\nRead the IDENTITY line first. Use it for this person's name, gender, and pronouns throughout your response. Never assume or guess gender or pronouns — always refer to what's stated. If no IDENTITY line is present, use "they/them" as default.\n\n${profile.profileText}\n`;
            }
            if (todayAct) {
              userProfileContext += `\n${todayAct}\n`;
            }
            if (chatContext) {
              userProfileContext += `\n${chatContext}`;
            }
            userProfileContext += `\n${ageInfo.promptGuidance}\n`;
          } catch (err) {
            console.error('[HabitBuilder] Context error', err);
          }
        }

        // ── Build context string ──
        const contextParts = [];

        // eslint-disable-next-line no-restricted-syntax -- server-side fallback; client sends local date via dateService
        const today =
          context.currentDate ||
          new Intl.DateTimeFormat('en-CA', { timeZone: userTimezone }).format(new Date());
        const dow =
          context.dayOfWeek ||
          new Intl.DateTimeFormat('en-US', {
            weekday: 'long',
            timeZone: userTimezone,
          }).format(new Date());
        contextParts.push(`Today is ${dow}, ${today}.`);

        if (context.userName) {
          contextParts.push(`User's name: ${context.userName}`);
        }

        if (context.existingHabits && context.existingHabits.length > 0) {
          const habitList = context.existingHabits
            .map((h) => {
              let desc = `- "${h.name}" (${h.subtype === 'break_habit' ? 'break' : 'build'})`;
              if (h.frequency) desc += ` — ${h.frequency}`;
              return desc;
            })
            .join('\n');
          contextParts.push(`\n=== EXISTING HABITS ===\n${habitList}`);
        } else {
          contextParts.push('\n=== EXISTING HABITS ===\nNone yet — this is their first habit.');
        }

        if (context.prefill) {
          contextParts.push(
            `\n=== PRE-FILLED INTENT ===\nThe user started with: "${context.prefill}"\nUse this as the starting point — don't ask "what habit?" again.`,
          );
        }

        const contextString = contextParts.join('\n');

        // ── V2: Pre-parse triage ──
        const lastUserMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';
        const prevExchange = extractPreviousExchange(messages);

        let preParse = null;
        try {
          const lifeMap = await getLifeMapForChat(authenticatedUserId, env);
          const compressedLifeMap = compressLifeMapForHabits(lifeMap);

          preParse = await habitPreParse(
            lastUserMsg,
            prevExchange,
            {
              existingHabits: context.existingHabits || [],
              currentMode: context.currentMode || null,
              turnNumber: context.turnNumber || 0,
              compressedLifeMap: compressedLifeMap.trim() || null,
              currentDate: today,
              habitCapacity: context.habitCapacity || null,
            },
            env,
          );
        } catch (err) {
          console.warn('[HabitBuilder] Pre-parse failed, using V1 path:', err.message);
        }

        // Inject mode context into system prompt
        const builderMode =
          preParse?.mode !== 'CONTINUE' ? preParse?.mode : context.currentMode || 'SHAPE';

        // Build mode-specific prompt section
        const modePromptSection = HABIT_MODE_PROMPTS[builderMode] || HABIT_MODE_PROMPTS.SHAPE;
        let dynamicSections = HABIT_SHARED_V2_ADDITIONS + '\n' + modePromptSection;

        // Inject search hint for RESEARCH mode (Gemini's native web_search handles the actual search)
        if (preParse?.search_query) {
          dynamicSections += `\n\n=== SEARCH HINT ===\nThe user's intent suggests research would be valuable. Use web_search to look up: "${preParse.search_query}" and lead with specific findings.`;
        }

        // Add restart section if detected
        if (preParse?.is_restart) {
          dynamicSections += '\n' + HABIT_MODE_RESTART;
        }

        // Add nudge if conversation is long
        if (preParse?.nudge_toward_proposal) {
          dynamicSections += '\n' + HABIT_MODE_NUDGE;
        }

        // Add secondary mode context
        if (preParse?.secondary_mode === 'EVENT_ANCHORED' && preParse?.event_context) {
          dynamicSections += `\n\n=== EVENT CONTEXT ===\nThis habit is tied to: ${preParse.event_context.name} on ${preParse.event_context.date} (${preParse.event_context.weeks_until} weeks away). Factor the timeline into your shaping.`;
        }
        if (preParse?.secondary_mode === 'BREAK') {
          dynamicSections +=
            '\n\n=== NOTE ===\nThis user also wants to break/stop a behavior. Use break habit framing — focus on triggers, replacement, and boundaries rather than frequency and time slots.';
        }

        // Add capacity signal
        if (preParse?.capacity_signal) {
          dynamicSections += `\n\n=== CAPACITY NOTE ===\n${preParse.capacity_signal}`;
        }

        const habitBuilderSystemPrompt = `${HABIT_BUILDER_PROMPT}${dynamicSections}\n\n=== SESSION CONTEXT ===\n${contextString}${userProfileContext}`;

        const openaiMessages = [
          { role: 'system', content: habitBuilderSystemPrompt },
          ...messages.slice(-20),
        ];

        const t0 = Date.now();

        // ── STREAMING ──
        if (isHabitBuilderStreaming) {
          console.log('[HabitBuilder:Streaming] Starting SSE stream');

          const chatCfg = getChatConfig(lastUserMsg);
          const geminiRes = await geminiStream(
            habitBuilderSystemPrompt,
            openaiMessages,
            {
              temperature: 0.7,
              label: 'habit_builder',
              maxOutputTokens: chatCfg.maxTokens,
              thinkingLevel: chatCfg.thinkingLevel,
              tools: [makeWebSearchTool(userTimezone)],
            },
            env.GOOGLE_API_KEY,
          );

          if (!geminiRes.ok || !geminiRes.body) {
            const errText = geminiRes.error || 'unknown error';
            console.log('[HabitBuilder:Streaming] Gemini error', {
              status: geminiRes.status,
              error: errText,
            });
            return j({ error: `gemini_error: ${geminiRes.status}`, detail: errText }, 200);
          }

          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();

          (async () => {
            // Send initial SSE ping
            await writer.write(encoder.encode(': ping\n\n'));

            const reader = geminiRes.body.getReader();
            let buffer = '';
            let fullContent = '';
            let sources = undefined;

            // Track tool call accumulation
            let toolCalls = [];
            let modelResponseParts = [];

            // Output guard: buffer first sentence to strip filler openings
            let fillerBuffer = '';
            let fillerFlushed = false;

            try {
              // eslint-disable-next-line no-constant-condition
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || '';

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed === 'data: [DONE]') continue;
                  if (!trimmed.startsWith('data: ')) continue;

                  try {
                    const chunk = parseGeminiChunk(trimmed.slice(6));
                    const delta = chunk.text;

                    if (delta) {
                      fullContent += delta;
                      if (!fillerFlushed) {
                        fillerBuffer += delta;
                        const hasBreak = /[.?!]\s/.test(fillerBuffer) || fillerBuffer.length > 150;
                        if (hasBreak) {
                          const cleaned = stripFillerOpening(fillerBuffer);
                          if (cleaned) {
                            await writer.write(
                              encoder.encode(
                                `data: ${JSON.stringify({ delta: cleaned, done: false })}\n\n`,
                              ),
                            );
                          }
                          fillerFlushed = true;
                        }
                      } else {
                        const sseData = JSON.stringify({ delta, done: false });
                        await writer.write(encoder.encode(`data: ${sseData}\n\n`));
                      }
                    }

                    // Collect function calls with thought signatures
                    if (chunk.functionCalls) {
                      for (const fc of chunk.functionCalls) {
                        toolCalls.push({
                          id: fc.id,
                          name: fc.name,
                          arguments: JSON.stringify(fc.args),
                        });
                        modelResponseParts.push({
                          functionCall: { name: fc.name, args: fc.args, id: fc.id },
                          thoughtSignature: fc.thoughtSignature,
                        });
                      }
                    }
                  } catch (parseErr) {
                    // skip
                  }
                }
              }

              // Flush any remaining filler buffer
              if (!fillerFlushed && fillerBuffer) {
                const cleaned = stripFillerOpening(fillerBuffer);
                if (cleaned) {
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify({ delta: cleaned, done: false })}\n\n`),
                  );
                }
              }
              fullContent = stripFillerOpening(fullContent);

              // ── Handle web search tool calls ──
              const webSearchCalls = toolCalls.filter(
                (tc) => tc.name === 'web_search' && tc.arguments,
              );

              if (webSearchCalls.length > 0) {
                console.log('[HabitBuilder:Streaming] Web search triggered', {
                  searchCount: webSearchCalls.length,
                });

                // Notify client we're searching
                let firstQuery = '';
                try {
                  firstQuery = JSON.parse(webSearchCalls[0].arguments).query || '';
                } catch {
                  const match = webSearchCalls[0].arguments.match(/"query"\s*:\s*"([^"]+)"/);
                  firstQuery = match ? match[1] : 'searching';
                }
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ searching: true, query: firstQuery })}\n\n`,
                  ),
                );

                // Execute all searches in parallel
                const searchPromises = webSearchCalls.map(async (tc) => {
                  try {
                    let query;
                    try {
                      query = JSON.parse(tc.arguments).query;
                    } catch {
                      const match = tc.arguments.match(/"query"\s*:\s*"([^"]+)"/);
                      query = match ? match[1] : null;
                    }
                    if (!query) return { toolCallId: tc.id, query: null, results: null };

                    const results = await executeTavilySearch(query, env.TAVILY_API_KEY, {
                      includeImages: false,
                    });
                    return { toolCallId: tc.id, query, results };
                  } catch (err) {
                    console.log('[HabitBuilder:Streaming] Search error:', err);
                    return { toolCallId: tc.id, query: null, results: null };
                  }
                });

                const searchResults = await Promise.all(searchPromises);
                const successfulSearches = searchResults.filter(
                  (sr) => sr.results && sr.results.results.length > 0,
                );

                if (successfulSearches.length > 0) {
                  const originalContents = convertMessages(openaiMessages);

                  if (fullContent) {
                    modelResponseParts.unshift({ text: fullContent });
                  }

                  const functionResults = successfulSearches.map((sr) => ({
                    name: 'web_search',
                    id: sr.toolCallId,
                    response: { results: formatSearchBrief(sr.results) },
                  }));

                  const followUpContents = buildFollowUpContents(
                    originalContents,
                    modelResponseParts,
                    functionResults,
                  );

                  const chatCfgFollowUp = getChatConfig(lastUserMsg, { isSearchFollowUp: true });
                  const followUpRes = await geminiStream(
                    habitBuilderSystemPrompt,
                    [],
                    {
                      temperature: 0.7,
                      maxOutputTokens: chatCfgFollowUp.maxTokens,
                      thinkingLevel: chatCfgFollowUp.thinkingLevel,
                      nativeContents: followUpContents,
                    },
                    env.GOOGLE_API_KEY,
                  );

                  // Stream the follow-up response
                  const followUpReader = followUpRes.body.getReader();
                  let followUpBuffer = '';

                  let followUpFillerBuffer = '';
                  let followUpFillerFlushed = false;

                  // eslint-disable-next-line no-constant-condition
                  while (true) {
                    const result = await followUpReader.read();
                    if (result.done) break;

                    followUpBuffer += decoder.decode(result.value, { stream: true });
                    const followUpLines = followUpBuffer.split(/\r?\n/);
                    followUpBuffer = followUpLines.pop() || '';

                    for (const line of followUpLines) {
                      const trimmed = line.trim();
                      if (!trimmed.startsWith('data:')) continue;
                      const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
                      if (jsonStr === '[DONE]') continue;

                      try {
                        const chunk = parseGeminiChunk(jsonStr);
                        const delta = chunk.text;
                        if (delta) {
                          fullContent += delta;
                          if (!followUpFillerFlushed) {
                            followUpFillerBuffer += delta;
                            const hasBreak =
                              /[.?!]\s/.test(followUpFillerBuffer) ||
                              followUpFillerBuffer.length > 150;
                            if (hasBreak) {
                              const cleaned = stripFillerOpening(followUpFillerBuffer);
                              if (cleaned) {
                                await writer.write(
                                  encoder.encode(
                                    `data: ${JSON.stringify({ delta: cleaned, done: false })}\n\n`,
                                  ),
                                );
                              }
                              followUpFillerFlushed = true;
                            }
                          } else {
                            await writer.write(
                              encoder.encode(`data: ${JSON.stringify({ delta, done: false })}\n\n`),
                            );
                          }
                        }
                      } catch {
                        // skip
                      }
                    }
                  }

                  // Flush remaining follow-up filler buffer
                  if (!followUpFillerFlushed && followUpFillerBuffer) {
                    const cleaned = stripFillerOpening(followUpFillerBuffer);
                    if (cleaned) {
                      await writer.write(
                        encoder.encode(
                          `data: ${JSON.stringify({ delta: cleaned, done: false })}\n\n`,
                        ),
                      );
                    }
                  }
                  fullContent = stripFillerOpening(fullContent);

                  console.log('[HabitBuilder:Streaming] Search complete', {
                    searchCount: successfulSearches.length,
                    queries: successfulSearches.map((s) => s.query),
                  });

                  // Collect sources from search results
                  sources = successfulSearches.flatMap((sr) =>
                    sr.results.results.map((r) => ({ title: r.title, url: r.url })),
                  );
                }
              }

              // ── POST-STREAM EXTRACTION ──
              const fullConversation = [...messages, { role: 'assistant', content: fullContent }];

              const resolved = await extractHabitFields(fullConversation, key, today, builderMode);
              resolved.builder_mode = builderMode;
              const latency = Date.now() - t0;
              const finalData = JSON.stringify({
                done: true,
                full_content: fullContent,
                resolved_fields: resolved,
                latency_ms: latency,
                sources: sources,
              });
              await writer.write(encoder.encode(`data: ${finalData}\n\n`));

              console.log('[HabitBuilder:Streaming] Complete', {
                latency_ms: latency,
                content_length: fullContent.length,
                required_count: resolved.required_count,
                next_field: resolved.next_field,
                had_search: webSearchCalls.length > 0,
              });
            } catch (streamErr) {
              console.log('[HabitBuilder:Streaming] Stream error', { error: String(streamErr) });
              const errorData = JSON.stringify({
                error: String(streamErr),
                done: true,
                full_content: fullContent,
              });
              await writer.write(encoder.encode(`data: ${errorData}\n\n`));
            } finally {
              await writer.close();
            }
          })();

          return new Response(readable, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
            },
          });
        }

        // ── NON-STREAMING FALLBACK ──
        try {
          const chatCfg = getChatConfig(lastUserMsg);
          const geminiResult = await geminiGenerate(
            habitBuilderSystemPrompt,
            openaiMessages,
            {
              temperature: 0.7,
              maxOutputTokens: chatCfg.maxTokens,
              thinkingLevel: chatCfg.thinkingLevel,
            },
            env.GOOGLE_API_KEY,
          );

          const latency = Date.now() - t0;

          if (!geminiResult.ok) {
            console.log('[HabitBuilder] API error', {
              error: geminiResult.error,
              latency_ms: latency,
            });
            return j(
              { error: 'habit_builder_failed', detail: geminiResult.error, latency_ms: latency },
              200,
            );
          }

          let content = geminiResult.content;
          content = stripFillerOpening(content);

          // Extraction call with full conversation
          const fullConversation = [...messages, { role: 'assistant', content }];
          const resolved = await extractHabitFields(fullConversation, key, today, builderMode);
          resolved.builder_mode = builderMode;

          console.log('[HabitBuilder] Complete', {
            latency_ms: latency,
            content_length: content.length,
            required_count: resolved.required_count,
            next_field: resolved.next_field,
          });

          return j({
            content,
            resolved_fields: resolved,
            latency_ms: latency,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[HabitBuilder] Error', { error: String(err), latency_ms: latency });
          return j(
            { error: 'habit_builder_failed', detail: String(err), latency_ms: latency },
            200,
          );
        }
      }

      // =========================
      // === ENTITY CHAT (v4.0) ===
      // Scoped chat for individual entities (todos, habits, notes)
      // =========================
      if (type === 'entity-chat') {
        // Access gate — Phase 4.7
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return wantsStreaming
            ? denyAccessSSEResponse(access.reason)
            : denyAccessResponse(access.reason);
        }

        const entity = body.entity || {};
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const preset = body.preset || null;
        const sweepContext = body.sweepContext || null;

        // Build entity context string
        const entityContextParts = [];
        entityContextParts.push(`Type: ${entity.type || 'unknown'}`);
        entityContextParts.push(`Title: "${entity.title || 'Untitled'}"`);
        if (entity.subtype) entityContextParts.push(`Subtype: ${entity.subtype}`);
        if (entity.body) entityContextParts.push(`Details: "${entity.body.substring(0, 1000)}"`);
        if (entity.tags && entity.tags.length > 0)
          entityContextParts.push(`Tags: ${entity.tags.join(', ')}`);
        if (entity.due_date) entityContextParts.push(`Due: ${entity.due_date}`);
        if (entity.frequency) entityContextParts.push(`Frequency: ${entity.frequency}`);
        if (entity.time_estimate)
          entityContextParts.push(`Time estimate: ${entity.time_estimate} minutes`);
        if (entity.days_since_created !== undefined)
          entityContextParts.push(`Created: ${entity.days_since_created} days ago`);
        if (entity.times_swept)
          entityContextParts.push(`Times reviewed in Sweep: ${entity.times_swept}`);

        // Enriched fields
        if (entity.energy_type) entityContextParts.push(`Energy type: ${entity.energy_type}`);
        if (entity.time_window && entity.time_window !== 'any')
          entityContextParts.push(`Preferred time: ${entity.time_window}`);
        if (entity.mood && entity.mood.length > 0)
          entityContextParts.push(`Mood when captured: ${entity.mood.join(', ')}`);
        // Lock In is gone; the words they wrote with one are kept
        if (entity.commitment_note) {
          entityContextParts.push(`Why it matters to them: "${entity.commitment_note}"`);
        }
        if (entity.triggers && entity.triggers.length > 0)
          entityContextParts.push(`Triggers: ${entity.triggers.join(', ')}`);
        if (entity.replacement_text)
          entityContextParts.push(`Replacement behavior: "${entity.replacement_text}"`);
        if (entity.notes)
          entityContextParts.push(`Additional notes: "${entity.notes.substring(0, 300)}"`);
        if (entity.is_favorite) entityContextParts.push(`Marked as favorite`);

        // Habit completion stats
        if (entity.habitStats) {
          const hs = entity.habitStats;
          entityContextParts.push(`\n--- Habit Progress ---`);
          entityContextParts.push(
            `Completions last 7 days: ${hs.completionsLast7Days} of ${hs.targetPerWeek} target`,
          );
          entityContextParts.push(
            `Completion rate (7-day): ${Math.round(hs.completionRate7Day * 100)}%`,
          );
          if (hs.completionsLast14Days !== undefined) {
            entityContextParts.push(`Completions last 14 days: ${hs.completionsLast14Days}`);
          }
          if (hs.currentStreak > 0) {
            entityContextParts.push(`Current streak: ${hs.currentStreak} days`);
          }
          if (hs.daysSinceLastCompletion !== null && hs.daysSinceLastCompletion !== undefined) {
            if (hs.daysSinceLastCompletion === 0) entityContextParts.push(`Last completed: today`);
            else if (hs.daysSinceLastCompletion === 1)
              entityContextParts.push(`Last completed: yesterday`);
            else entityContextParts.push(`Last completed: ${hs.daysSinceLastCompletion} days ago`);
          } else {
            entityContextParts.push(`Never completed yet`);
          }
          entityContextParts.push(
            `Use this data to personalize your response — acknowledge consistency ("you've been crushing it"), identify gaps ("it's been a few days"), or calibrate advice accordingly. Never shame gaps.`,
          );
        }

        const entityContext = entityContextParts.join('\n');

        // Build sweep context if present
        let sweepContextStr = '';
        if (sweepContext) {
          const sweepParts = [];
          if (sweepContext.times_moved >= 2)
            sweepParts.push(
              `This item has been deferred ${sweepContext.times_moved} times in Sweep.`,
            );
          if (sweepContext.days_unscheduled >= 7)
            sweepParts.push(
              `This item has been unscheduled for ${sweepContext.days_unscheduled} days.`,
            );
          if (sweepContext.is_overdue) sweepParts.push(`This item is overdue.`);
          if (sweepParts.length > 0) {
            sweepContextStr = `\n\n=== SWEEP CONTEXT ===\n${sweepParts.join('\n')}`;
          }
        }

        // Build sibling context if present
        let siblingContextStr = '';
        if (body.siblingContext) {
          const sc = body.siblingContext;

          if (sc.sameSpace && sc.sameSpace.length > 0) {
            siblingContextStr += `\n\n=== OTHER ITEMS IN THIS SPACE ===\n`;
            siblingContextStr += sc.sameSpace
              .map((item) => {
                let line = `- ${item.type}: "${item.title}"`;
                if (item.frequency) line += ` (${item.frequency})`;
                if (item.last_completed_at) {
                  const daysAgo = Math.floor(
                    (Date.now() - new Date(item.last_completed_at).getTime()) / 86400000,
                  );
                  line +=
                    daysAgo === 0
                      ? ' — done today'
                      : daysAgo === 1
                        ? ' — done yesterday'
                        : ` — last done ${daysAgo}d ago`;
                }
                return line;
              })
              .join('\n');
            siblingContextStr += `\nWhen giving advice, reference these sibling items by name. For habit stacking, suggest pairing with a sibling habit they already do consistently rather than generic examples like "brushing your teeth".\n`;
          }

          if (sc.otherHabits && sc.otherHabits.length > 0) {
            siblingContextStr += `\n=== USER'S OTHER ACTIVE HABITS ===\n`;
            siblingContextStr += sc.otherHabits
              .map((h) => {
                let line = `- "${h.title}" (${h.frequency})`;
                if (h.completionsLast7Days !== undefined)
                  line += ` — ${h.completionsLast7Days}/7 days last week`;
                if (h.time_window && h.time_window !== 'any') line += ` — prefers ${h.time_window}`;
                return line;
              })
              .join('\n');
            siblingContextStr += `\nReference these when relevant. If the user is consistent with another habit, suggest stacking. If they struggle with multiple habits, acknowledge the load.\n`;
          }

          if (sc.recentCompletions && sc.recentCompletions.length > 0) {
            siblingContextStr += `\n=== RECENTLY COMPLETED TASKS ===\n`;
            siblingContextStr += sc.recentCompletions.map((t) => `- "${t.title}"`).join('\n');
            siblingContextStr += `\nThe user has momentum. Reference these for confidence when appropriate — "you knocked out X recently, this is smaller than that."\n`;
          }
        }

        // Build preset instruction if present
        let presetInstruction = '';
        if (preset) {
          const presetInstructions = {
            break_down:
              'The user wants help breaking this down into smaller, manageable steps. Focus on creating a clear action plan.',
            research:
              'The user wants researched information about this topic. Use web search to find current, accurate information and provide a helpful summary. Do not just suggest websites - actually search and synthesize the information for them.',
            think_through:
              'The user wants to think through this more deeply. Help them consider different angles and implications.',
            whats_blocking:
              'The user feels stuck on this. Help them identify what might be blocking them and how to move forward.',
            action_steps:
              'The user wants to turn this into concrete action steps. Help them identify specific next actions.',
            expand:
              'The user wants to expand on this idea. Help them flesh it out with more detail and possibilities.',
            stay_consistent:
              'The user wants help staying consistent with this habit. Focus on practical strategies and motivation.',
            approach:
              'The user wants to refine their approach to this habit. Help them optimize their strategy.',
          };
          presetInstruction = presetInstructions[preset]
            ? `\n\n=== USER REQUEST ===\n${presetInstructions[preset]}`
            : '';
        }

        const tz = userTimezone;
        const currentDate = new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: tz,
        }).format(new Date());

        // Time of day for contextual suggestions (timezone-aware)
        // eslint-disable-next-line no-restricted-syntax -- Worker has no dateService; timezone-safe via Intl
        const now = new Date();
        const hourStr = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hour12: false,
          timeZone: tz,
        }).format(now);
        const clientHour = parseInt(hourStr, 10);
        const timeOfDay = clientHour < 12 ? 'morning' : clientHour < 17 ? 'afternoon' : 'evening';
        const timeStr = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: tz,
        }).format(now);

        /* [COMMENTED OUT — replaced by triage pipeline in buildEntityChatConfig]
        const entityChatSystemPrompt = `${GREMLY_CORE_PERSONA}

=== CONTEXT: ENTITY CHAT ===
You are helping someone work through a specific item in their productivity app.

=== CURRENT DATE & TIME ===
Today is ${currentDate}. It's currently ${timeOfDay} (${timeStr}). If suggesting the user do something now, consider the time — don't suggest starting a workout at 11pm or a morning routine in the evening.

=== THE ITEM YOU'RE HELPING WITH ===
${entityContext}${sweepContextStr}${siblingContextStr}${presetInstruction}

=== CONVERSATION CONTINUITY ===
If the message history shows previous conversations with this user about 
this item, build on what was discussed. Examples:
- "Last time we talked about [strategy] — how's that been going?"
- "You mentioned [concern] before — has anything changed?"
- "Building on what we discussed — here's a next step."
Don't repeat previous advice verbatim. Evolve it.
If this is the first message (empty history), skip this entirely.

=== EXAMPLE EXCHANGES ===

These show exactly how Gremly responds. Match this voice.

User asks about sticking with a habit (RESEARCH-NEEDED):
[Search first, then respond:]
"Habit stacking has the strongest evidence — a UCL study found linking a new habit to an existing routine makes it about 2x more likely to stick after 30 days. Since yours is daily, try anchoring it right after something you already do every morning, like brushing your teeth. The first two weeks are the hardest — after that it gets much easier."

User asks to break down a task (ACTION-READY):
"Here's how I'd break this down:
- **Pick your launch date** and work backwards
- **List the non-negotiables** — what absolutely must ship vs nice-to-have
- **Set weekly milestones** — one deliverable per week keeps momentum
Want me to save this as a checklist?"

User shares they keep avoiding something (EMOTIONAL):
"That avoidance feeling is heavy — and totally normal when something keeps sitting there. What's making this one feel hard to start right now?"

User asks for best time of day (RESEARCH-NEEDED):
[Search first, then respond:]
"Morning tends to win for meditation — a 2022 study in Frontiers in Psychology found morning meditators had 35% higher consistency over 8 weeks compared to evening. Your body's cortisol is naturally higher in the morning, which actually helps with focus during meditation."

User asks a vague question (EXPLORATORY):
"What's pulling you toward this right now — is there something specific you're trying to solve, or more of a general feeling?"

=== SAVE SUGGESTIONS ===
Do NOT mention saving in your response. When content is worth saving, append after your response:
<!--SAVE:{"type":"todo","title":"Title here","steps":["Step 1","Step 2"]}-->

When to suggest: clear action items, habits with frequency, reference info worth keeping
When NOT to suggest: questions, emotional support, short responses, exploratory conversation

=== SPACE PROMOTION ===
Almost never suggest creating a Space. Only if ALL true:
- 3+ distinct sub-tasks with different timelines
- Will take weeks, not days
- User seems to be managing something complex`;
        */

        const lastUserMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';

        // =========================
        // STREAMING ENTITY CHAT
        // =========================
        if (isEntityChatStreaming) {
          console.log('[EntityChat:Streaming] Starting SSE stream');

          // Create TransformStream early so we can send fetching indicators
          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();

          // Loading message — fires immediately, independent of main work
          (async () => {
            try {
              const loadingMsg = await generateLoadingMessage(
                lastUserMsg,
                body.spaceName || null,
                env.OPENAI_API_KEY,
              );
              if (loadingMsg) {
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ searching: true, query: loadingMsg, isLoadingHint: true })}\n\n`,
                  ),
                );
              }
            } catch {
              /* fire-and-forget */
            }
          })();

          // Main work IIFE — runs after Response is returned to client
          (async () => {
            try {
              // Send SSE ping
              await writer.write(encoder.encode(': ping\n\n'));

              // === CONTEXT LOADING (inside IIFE — non-blocking for SSE) ===
              let sessionContextStr = '';
              let userProfile = null;
              let cachedDomains = [];
              let entityTodayActivity = null;
              const previousExchange = extractPreviousExchange(messages);
              if (authenticatedUserId) {
                try {
                  const [chatContext, profile, domains, todayAct] = await Promise.all([
                    buildChatContext(
                      authenticatedUserId,
                      'entity',
                      {
                        message: lastUserText(body),
                        entityTitle: entity?.title || entity?.name || null,
                        entitySpaceId: entity?.spaceId || entity?.space_id || null,
                        timezone: userTimezone,
                        currentChatId: body.chatId || null,
                      },
                      env,
                    ),
                    getUserProfile(authenticatedUserId, env),
                    getCachedDomainNames(authenticatedUserId, env),
                    buildTodayActivity(authenticatedUserId, userTimezone, env),
                  ]);
                  sessionContextStr = chatContext;
                  userProfile = profile;
                  cachedDomains = domains;
                  entityTodayActivity = todayAct;
                  if (sessionContextStr || userProfile) {
                    console.log('[EntityChat] Context loaded', {
                      userId: authenticatedUserId.slice(0, 8),
                      sessionContextLength: sessionContextStr?.length || 0,
                      hasUserProfile: !!userProfile,
                    });
                  }
                } catch (err) {
                  console.error('[EntityChat] Context error', err);
                }
              }

              const triage = await triageMessage({
                userMessage: lastUserMsg,
                previousExchange,
                spaceName: body.spaceName || undefined,
                preset: preset || undefined,
                chatType: 'entity',
                env,
                domainNames: cachedDomains,
                profileSnippet: userProfile?.profileText?.slice(0, 150) || '',
                messageCount: messages.length,
              });

              console.log('[EntityChat:Triage]', {
                mode: triage.mode,
                search: triage.search,
                personal: triage.personal,
                depth: triage.depth,
                source: triage.source,
                preset: preset || 'none',
                messagePreview: lastUserMsg.slice(0, 80),
              });

              const entityContextBlock = buildEntityContextBlock({
                entity: {
                  type: entity.type,
                  title: entity.title || 'Untitled',
                  body: entity.body || null,
                  tags: entity.tags || [],
                  due_date: entity.due_date || null,
                  frequency: entity.frequency || null,
                  time_estimate: entity.time_estimate || null,
                  subtype: entity.subtype || null,
                },
                sweepContext: sweepContext || null,
                siblingContext: body.siblingContext || null,
                timeOfDay,
                timeStr,
                messageCount: messages.length,
              });

              const genConfig = buildEntityChatConfig(
                triage,
                entityContextBlock,
                body.accountCreatedAt,
                sessionContextStr,
                userProfile?.profileText,
                tz,
                entityTodayActivity,
              );

              const entityMessages = [
                { role: 'system', content: genConfig.systemPrompt },
                ...messages.slice(-20).filter((m) => m.role !== 'system'),
              ];

              const previousSearchContext = messages
                .filter((m) => m.role === 'assistant' && m.metadata?.sources?.length > 0)
                .slice(-1)[0];

              if (previousSearchContext) {
                entityMessages.push({
                  role: 'system',
                  content: `Note: You previously searched and found information about this topic. The sources were: ${previousSearchContext.metadata.sources.map((s) => s.title).join(', ')}. For follow-up questions on the same topic, use this context rather than searching again unless the user asks for new/different information.`,
                });
              }

              const searchPolicy = getSearchPolicy(triage.search);
              const t0 = Date.now();
              let urlContext = '';
              let fetchedUrl = null;

              // Detect URLs in the user's message
              const detectedUrls = extractUrlsFromText(lastUserMsg);

              if (detectedUrls.length > 0) {
                console.log('[EntityChat:Streaming] URLs detected:', detectedUrls);

                // Fetch the first URL (limit to one to control costs)
                const urlToFetch = detectedUrls[0];

                // Send "fetching" indicator to client
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      fetching: true,
                      fetchingUrl: urlToFetch,
                      done: false,
                    })}\n\n`,
                  ),
                );

                const extracted = await executeTavilyExtract(urlToFetch, env.TAVILY_API_KEY);

                if (extracted && extracted.success) {
                  fetchedUrl = {
                    url: extracted.url,
                    title: extracted.title,
                  };

                  // Add extracted content as context for the model
                  urlContext = `\n\n=== EXTRACTED CONTENT FROM URL ===\nURL: ${extracted.url}\nTitle: ${extracted.title}\n\n${extracted.content}\n\n=== END EXTRACTED CONTENT ===\n\nThe user has shared this link. Summarize the key points and answer any questions they have about it. If they just shared the link without a specific question, provide a helpful summary of what the content covers.`;

                  console.log('[EntityChat:Streaming] URL content extracted, adding to context');
                } else {
                  // Extraction failed - let model know
                  urlContext = `\n\n[Note: The user shared a link (${urlToFetch}) but I couldn't access its content. It may be paywalled, require login, or be temporarily unavailable. Let the user know and offer to help if they can paste the content directly.]`;

                  console.log('[EntityChat:Streaming] URL extraction failed');
                }

                // Clear fetching indicator
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      fetching: false,
                      done: false,
                    })}\n\n`,
                  ),
                );
              }

              // Inject URL context into entityMessages if present
              if (urlContext) {
                const lastIdx = entityMessages.length - 1;
                if (entityMessages[lastIdx].role === 'user') {
                  entityMessages[lastIdx] = {
                    ...entityMessages[lastIdx],
                    content: entityMessages[lastIdx].content + urlContext,
                  };
                }
              }

              const streamConfig = {
                label: 'entity_chat',
                temperature: genConfig.temperature,
                maxOutputTokens: genConfig.maxTokens,
                thinkingLevel: genConfig.thinkingLevel,
              };

              if (searchPolicy.attachTool) {
                streamConfig.tools = [makeWebSearchTool(userTimezone)];
              }

              console.log('[EntityChat:Streaming:Payload]', {
                temperature: streamConfig.temperature,
                maxOutputTokens: streamConfig.maxOutputTokens,
                thinkingLevel: streamConfig.thinkingLevel,
                hasTools: !!streamConfig.tools,
                messageCount: entityMessages.length,
              });

              const geminiRes = await geminiStream(
                genConfig.systemPrompt,
                entityMessages,
                streamConfig,
                env.GOOGLE_API_KEY,
              );

              if (!geminiRes.ok || !geminiRes.body) {
                const errText = geminiRes.error || 'unknown error';
                console.log('[EntityChat:Streaming] Gemini error', {
                  status: geminiRes.status,
                  error: errText,
                });
                await writer.write(
                  encoder.encode(`data: ${JSON.stringify({ error: errText, done: true })}\n\n`),
                );
                return; // exits the IIFE, writer.close() runs in finally
              }

              const reader = geminiRes.body.getReader();
              let buffer = '';
              let fullContent = '';
              let searchImages = [];

              // Output guard: buffer first sentence to strip filler openings
              let fillerBuffer = '';
              let fillerFlushed = false;

              // Track tool call accumulation - support multiple tool calls
              let toolCalls = []; // Array of { id, name, arguments }
              let modelResponseParts = [];

              try {
                // eslint-disable-next-line no-constant-condition
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split(/\r?\n/);
                  buffer = lines.pop() || '';

                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    if (!trimmed.startsWith('data: ')) continue;

                    try {
                      const chunk = parseGeminiChunk(trimmed.slice(6));
                      const delta = chunk.text;

                      if (delta) {
                        fullContent += delta;
                        // Don't stream SAVE comments to client
                        if (!fullContent.includes('<!--SAVE:')) {
                          if (!fillerFlushed) {
                            fillerBuffer += delta;
                            const hasBreak =
                              /[.?!]\s/.test(fillerBuffer) || fillerBuffer.length > 150;
                            if (hasBreak) {
                              const cleaned = stripFillerOpening(fillerBuffer);
                              if (cleaned) {
                                await writer.write(
                                  encoder.encode(
                                    `data: ${JSON.stringify({ delta: cleaned, done: false })}\n\n`,
                                  ),
                                );
                              }
                              fillerFlushed = true;
                            }
                          } else {
                            const sseData = JSON.stringify({ delta, done: false });
                            await writer.write(encoder.encode(`data: ${sseData}\n\n`));
                          }
                        }
                      }

                      // Collect function calls with thought signatures for follow-up
                      if (chunk.functionCalls) {
                        for (const fc of chunk.functionCalls) {
                          toolCalls.push({
                            id: fc.id,
                            name: fc.name,
                            arguments: JSON.stringify(fc.args),
                          });
                          modelResponseParts.push({
                            functionCall: { name: fc.name, args: fc.args, id: fc.id },
                            thoughtSignature: fc.thoughtSignature,
                          });
                        }
                      }
                    } catch (parseErr) {
                      console.log('[EntityChat:Streaming] Chunk parse error', {
                        line: trimmed.slice(0, 100),
                      });
                    }
                  }
                }

                // Flush any remaining filler buffer from main stream
                if (!fillerFlushed && fillerBuffer) {
                  const cleaned = stripFillerOpening(fillerBuffer);
                  if (cleaned) {
                    await writer.write(
                      encoder.encode(
                        `data: ${JSON.stringify({ delta: cleaned, done: false })}\n\n`,
                      ),
                    );
                  }
                }

                // Clean fullContent to match what was streamed
                fullContent = stripFillerOpening(fullContent);

                // Track search metadata
                let sources = undefined;
                let searchQueries = [];

                // Filter to only web_search tool calls with arguments
                const webSearchCalls = toolCalls.filter(
                  (tc) => tc.name === 'web_search' && tc.arguments,
                );

                if (webSearchCalls.length > 0) {
                  console.log('[EntityChat:Streaming] Web search triggered', {
                    searchCount: webSearchCalls.length,
                  });

                  // Notify client we're searching (show first query)
                  let firstQuery = '';
                  try {
                    const firstArgs = JSON.parse(webSearchCalls[0].arguments);
                    firstQuery = firstArgs.query || '';
                  } catch {
                    const match = webSearchCalls[0].arguments.match(/"query"\s*:\s*"([^"]+)"/);
                    firstQuery = match ? match[1] : 'multiple topics';
                  }
                  const searchNotice =
                    webSearchCalls.length > 1
                      ? `${firstQuery} (+${webSearchCalls.length - 1} more)`
                      : firstQuery;
                  await writer.write(
                    encoder.encode(
                      `data: ${JSON.stringify({ searching: true, query: searchNotice })}\n\n`,
                    ),
                  );

                  // Execute all searches in parallel
                  const searchT0 = Date.now();
                  const searchPromises = webSearchCalls.map(async (tc) => {
                    try {
                      let query;
                      try {
                        const args = JSON.parse(tc.arguments);
                        query = args.query;
                      } catch (parseErr) {
                        // Try regex extraction for malformed JSON
                        const match = tc.arguments.match(/"query"\s*:\s*"([^"]+)"/);
                        if (match) {
                          query = match[1];
                          console.log(
                            '[EntityChat:Streaming] Recovered query from malformed JSON:',
                            query,
                          );
                        } else {
                          console.log(
                            '[EntityChat:Streaming] Could not parse tool arguments:',
                            tc.arguments.slice(0, 200),
                          );
                          return { toolCallId: tc.id, query: null, results: null };
                        }
                      }

                      searchQueries.push(query);
                      const shouldIncludeImages =
                        isVisualQuery(query) || isVisualQuery(lastUserMsg);
                      console.log('[EntityChat] Calling Tavily:', {
                        query: query,
                        includeImages: shouldIncludeImages,
                        isVisualQueryResult: isVisualQuery(query),
                      });
                      const results = await executeTavilySearch(query, env.TAVILY_API_KEY, {
                        includeImages: shouldIncludeImages,
                      });
                      return { toolCallId: tc.id, query, results };
                    } catch (err) {
                      console.log('[EntityChat:Streaming] Individual search error:', err);
                      return { toolCallId: tc.id, query: null, results: null };
                    }
                  });

                  const searchResults = await Promise.all(searchPromises);
                  const searchLatency = Date.now() - searchT0;

                  const successfulSearches = searchResults.filter(
                    (sr) => sr.results && sr.results.results.length > 0,
                  );
                  console.log('[EntityChat:Streaming] Searches complete', {
                    total: searchResults.length,
                    successful: successfulSearches.length,
                    latency: searchLatency,
                  });

                  if (successfulSearches.length > 0) {
                    // Build native follow-up contents with thought signatures preserved
                    const originalContents = convertMessages(entityMessages);

                    // Add any accumulated text to model response parts
                    if (fullContent) {
                      modelResponseParts.unshift({ text: fullContent });
                    }

                    const functionResults = successfulSearches.map((sr) => ({
                      name: 'web_search',
                      id: sr.toolCallId,
                      response: { results: formatSearchBrief(sr.results) },
                    }));

                    const followUpContents = buildFollowUpContents(
                      originalContents,
                      modelResponseParts,
                      functionResults,
                    );

                    // Second API call for final response - with real streaming
                    // Tell client to discard any pre-search text that was already streamed
                    await writer.write(
                      encoder.encode(`data: ${JSON.stringify({ reset: true, done: false })}\n\n`),
                    );
                    fullContent = '';

                    const followUpRes = await geminiStream(
                      genConfig.systemPrompt,
                      [],
                      {
                        temperature: genConfig.temperature,
                        maxOutputTokens: Math.max(genConfig.maxTokens, 1200),
                        thinkingLevel: genConfig.thinkingLevel,
                        nativeContents: followUpContents,
                      },
                      env.GOOGLE_API_KEY,
                    );

                    // Stream the follow-up response to client
                    const followUpReader = followUpRes.body.getReader();
                    let followUpBuffer = '';
                    let readerDone = false;

                    // Output guard: buffer first sentence to strip filler openings
                    let followUpFillerBuffer = '';
                    let followUpFillerFlushed = false;

                    while (!readerDone) {
                      const result = await followUpReader.read();
                      readerDone = result.done;
                      if (readerDone) break;
                      const value = result.value;

                      followUpBuffer += decoder.decode(value, { stream: true });

                      // Process complete lines only
                      const lines = followUpBuffer.split('\n');
                      followUpBuffer = lines.pop() || ''; // Keep incomplete line in buffer

                      for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data:')) continue;

                        const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
                        if (jsonStr === '[DONE]') continue;

                        try {
                          const chunk = parseGeminiChunk(jsonStr);
                          const delta = chunk.text;
                          if (delta) {
                            fullContent += delta;
                            if (!followUpFillerFlushed) {
                              followUpFillerBuffer += delta;
                              const hasBreak =
                                /[.?!]\s/.test(followUpFillerBuffer) ||
                                followUpFillerBuffer.length > 150;
                              if (hasBreak) {
                                const cleaned = stripFillerOpening(followUpFillerBuffer);
                                if (cleaned) {
                                  await writer.write(
                                    encoder.encode(
                                      `data: ${JSON.stringify({ delta: cleaned, done: false })}\n\n`,
                                    ),
                                  );
                                }
                                followUpFillerFlushed = true;
                              }
                            } else {
                              await writer.write(
                                encoder.encode(
                                  `data: ${JSON.stringify({ delta, done: false })}\n\n`,
                                ),
                              );
                            }
                          }
                        } catch {
                          // Skip malformed JSON
                        }
                      }
                    }

                    // Process any remaining buffer
                    if (followUpBuffer.trim()) {
                      const trimmed = followUpBuffer.trim();
                      if (trimmed.startsWith('data:')) {
                        const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
                        if (jsonStr !== '[DONE]') {
                          try {
                            const chunk = parseGeminiChunk(jsonStr);
                            const delta = chunk.text;
                            if (delta) {
                              fullContent += delta;
                              if (!followUpFillerFlushed) {
                                followUpFillerBuffer += delta;
                              } else {
                                await writer.write(
                                  encoder.encode(
                                    `data: ${JSON.stringify({ delta, done: false })}\n\n`,
                                  ),
                                );
                              }
                            }
                          } catch {
                            // Skip
                          }
                        }
                      }
                    }

                    // Flush any remaining filler buffer at end of stream
                    if (!followUpFillerFlushed && followUpFillerBuffer) {
                      const cleaned = stripFillerOpening(followUpFillerBuffer);
                      if (cleaned) {
                        await writer.write(
                          encoder.encode(
                            `data: ${JSON.stringify({ delta: cleaned, done: false })}\n\n`,
                          ),
                        );
                      }
                    }

                    // Clean fullContent to match what was streamed
                    fullContent = stripFillerOpening(fullContent);

                    // Combine all sources
                    sources = successfulSearches.flatMap((sr) =>
                      sr.results.results.map((r) => ({ title: r.title, url: r.url })),
                    );

                    console.log('[EntityChat] successfulSearches structure:', {
                      count: successfulSearches.length,
                      firstItem: successfulSearches[0]
                        ? Object.keys(successfulSearches[0])
                        : 'empty',
                      firstItemImages: successfulSearches[0]?.images,
                      firstItemResultsImages: successfulSearches[0]?.results?.images,
                    });

                    // Collect images from search results
                    // Structure: sr.results contains Tavily response with images
                    successfulSearches.forEach((sr) => {
                      if (sr.results.images && sr.results.images.length > 0) {
                        searchImages.push(...sr.results.images);
                      }
                    });

                    console.log('[EntityChat] Images collected:', {
                      searchImagesCount: searchImages.length,
                      searchImages: searchImages.slice(0, 2),
                    });
                  }
                }

                // Fallback: if tool calls were made but we have no content, respond without search
                if (webSearchCalls.length > 0 && !fullContent) {
                  console.log(
                    '[EntityChat:Streaming] Search fallback - responding without search results',
                  );

                  const fallbackResult = await geminiGenerate(
                    genConfig.systemPrompt +
                      '\n\nAnswer based on the entity context and your existing knowledge. Do not mention search availability.',
                    entityMessages,
                    {
                      temperature: genConfig.temperature,
                      maxOutputTokens: genConfig.maxTokens,
                      thinkingLevel: genConfig.thinkingLevel,
                    },
                    env.GOOGLE_API_KEY,
                  );

                  fullContent = fallbackResult.ok
                    ? fallbackResult.content
                    : 'I had trouble searching for that information. Could you try rephrasing your question?';
                  fullContent = stripFillerOpening(fullContent);

                  // Stream the fallback content
                  const words = fullContent.split(' ');
                  for (let i = 0; i < words.length; i += 3) {
                    const chunk = words.slice(i, i + 3).join(' ') + ' ';
                    await writer.write(
                      encoder.encode(`data: ${JSON.stringify({ delta: chunk, done: false })}\n\n`),
                    );
                    await new Promise((resolve) => setTimeout(resolve, 15));
                  }
                }

                // For final event, use first search query or combined
                const searchQuery =
                  searchQueries.length > 0 ? searchQueries.join(' | ') : undefined;

                // Extract smart save suggestion (inline from model)
                const { suggestion: smartSuggestion, cleanContent } =
                  extractSaveSuggestion(fullContent);

                // Fall back to pattern detection if no smart suggestion
                const saveable = smartSuggestion
                  ? { detected: true, type: smartSuggestion.type, smart: true }
                  : detectSaveableContent(cleanContent);

                // Use smart suggestion if available
                const save_suggestion = smartSuggestion || null;

                // Use cleaned content (without suggestion block) for display
                fullContent = cleanContent;

                const latency = Date.now() - t0;
                // Strip SAVE comment and markdown images before sending to client
                const displayContent = fullContent
                  .replace(/<!--SAVE:.*?-->/gs, '')
                  .replace(/<!--SAVE:.*$/s, '')
                  .replace(/!\[.*?\]\(.*?\)/g, '') // Strip markdown images
                  .trim();
                const finalData = JSON.stringify({
                  done: true,
                  full_content: displayContent,
                  saveable,
                  save_suggestion,
                  latency_ms: latency,
                  sources: sources,
                  images: searchImages.length > 0 ? searchImages.slice(0, 2) : undefined,
                  search_query: searchQuery,
                  fetchedUrl: fetchedUrl,
                });
                await writer.write(encoder.encode(`data: ${finalData}\n\n`));

                console.log('[EntityChat:Streaming] Complete', {
                  latency_ms: latency,
                  content_length: fullContent.length,
                  has_saveable: saveable?.detected,
                  used_search: !!searchQuery,
                  images_sent: searchImages.length > 0 ? searchImages.slice(0, 2) : undefined,
                });

                // ── POST-STREAM: Update entity chat summary (non-blocking) ──
                if (authenticatedUserId && fullContent) {
                  const entity = body.entity || {};
                  const entityId = entity.id || null;
                  const entityType = entity.type || null;
                  if (entityId && entityType) {
                    const summaryPromise = (async () => {
                      try {
                        const tableName =
                          entityType === 'habit'
                            ? 'habits'
                            : entityType === 'note'
                              ? 'notes'
                              : 'todos';
                        const prevRes = await fetch(
                          `${env.SUPABASE_URL}/rest/v1/${tableName}?id=eq.${entityId}&select=views`,
                          {
                            headers: {
                              apikey: env.SUPABASE_SERVICE_KEY,
                              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                            },
                          },
                        );
                        const prevRows = prevRes.ok ? await prevRes.json() : [];
                        const previousEntitySummary = prevRows?.[0]?.views?.chat_summary || null;

                        await generateEntityChatSummary(
                          messages.filter((m) => m.role !== 'system'),
                          fullContent,
                          entityId,
                          entityType,
                          entity.title || entity.name || null,
                          entity.space_name || null,
                          previousEntitySummary,
                          env,
                          tz,
                        );
                      } catch (err) {
                        console.warn('[EntityChat] Chat summary failed:', err.message);
                      }
                    })();
                    ctx.waitUntil(summaryPromise);
                  }
                }
              } catch (streamErr) {
                console.log('[EntityChat:Streaming] Stream error', { error: String(streamErr) });
                const errorData = JSON.stringify({
                  error: String(streamErr),
                  done: true,
                  full_content: fullContent,
                });
                await writer.write(encoder.encode(`data: ${errorData}\n\n`));
              }
            } catch (outerErr) {
              console.error('[EntityChat:Streaming] Outer error', { error: String(outerErr) });
              try {
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ error: String(outerErr), done: true })}\n\n`,
                  ),
                );
              } catch {
                /* stream may be closed */
              }
            } finally {
              try {
                await writer.close();
              } catch {
                /* already closed */
              }
            }
          })();

          return new Response(readable, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
            },
          });
        }

        // === CONTEXT LOADING (non-streaming) ===
        let sessionContextStr = '';
        let userProfile = null;
        let cachedDomains = [];
        let entityTodayActivity = null;
        const previousExchange = extractPreviousExchange(messages);
        if (authenticatedUserId) {
          try {
            const [chatContext, profile, domains, todayAct] = await Promise.all([
              buildChatContext(
                authenticatedUserId,
                'entity',
                {
                  message: lastUserText(body),
                  entityTitle: entity?.title || entity?.name || null,
                  entitySpaceId: entity?.spaceId || entity?.space_id || null,
                  timezone: userTimezone,
                  currentChatId: body.chatId || null,
                },
                env,
              ),
              getUserProfile(authenticatedUserId, env),
              getCachedDomainNames(authenticatedUserId, env),
              buildTodayActivity(authenticatedUserId, userTimezone, env),
            ]);
            sessionContextStr = chatContext;
            userProfile = profile;
            cachedDomains = domains;
            entityTodayActivity = todayAct;
          } catch (err) {
            console.error('[EntityChat:NonStreaming] Context error', err);
          }
        }

        let urlContext = '';
        let fetchedUrl = null;

        const triage = await triageMessage({
          userMessage: lastUserMsg,
          previousExchange,
          spaceName: body.spaceName || undefined,
          preset: preset || undefined,
          chatType: 'entity',
          env,
          domainNames: cachedDomains,
          profileSnippet: userProfile?.profileText?.slice(0, 150) || '',
          messageCount: messages.length,
        });

        console.log('[EntityChat:NonStreaming:Triage]', {
          mode: triage.mode,
          search: triage.search,
          personal: triage.personal,
          depth: triage.depth,
          source: triage.source,
          preset: preset || 'none',
          messagePreview: lastUserMsg.slice(0, 80),
        });

        const entityContextBlock = buildEntityContextBlock({
          entity: {
            type: entity.type,
            title: entity.title || 'Untitled',
            body: entity.body || null,
            tags: entity.tags || [],
            due_date: entity.due_date || null,
            frequency: entity.frequency || null,
            time_estimate: entity.time_estimate || null,
            subtype: entity.subtype || null,
          },
          sweepContext: sweepContext || null,
          siblingContext: body.siblingContext || null,
          timeOfDay,
          timeStr,
          messageCount: messages.length,
        });

        const genConfig = buildEntityChatConfig(
          triage,
          entityContextBlock,
          body.accountCreatedAt,
          sessionContextStr,
          userProfile?.profileText,
          tz,
          entityTodayActivity,
        );

        const entityMessages = [
          { role: 'system', content: genConfig.systemPrompt },
          ...messages.slice(-20).filter((m) => m.role !== 'system'),
        ];

        const previousSearchContext = messages
          .filter((m) => m.role === 'assistant' && m.metadata?.sources?.length > 0)
          .slice(-1)[0];

        if (previousSearchContext) {
          entityMessages.push({
            role: 'system',
            content: `Note: You previously searched and found information about this topic. The sources were: ${previousSearchContext.metadata.sources.map((s) => s.title).join(', ')}. For follow-up questions on the same topic, use this context rather than searching again unless the user asks for new/different information.`,
          });
        }

        const searchPolicy = getSearchPolicy(triage.search);
        const t0 = Date.now();

        // =========================
        // NON-STREAMING ENTITY CHAT
        // =========================
        try {
          const nonStreamConfig = {
            temperature: genConfig.temperature,
            maxOutputTokens: genConfig.maxTokens,
            thinkingLevel: genConfig.thinkingLevel,
          };

          if (searchPolicy.attachTool) {
            nonStreamConfig.tools = [makeWebSearchTool(userTimezone)];
            nonStreamConfig.toolChoice =
              searchPolicy.toolChoice === 'required' ? 'web_search' : 'auto';
          }

          const geminiResult = await geminiGenerate(
            genConfig.systemPrompt,
            entityMessages,
            nonStreamConfig,
            env.GOOGLE_API_KEY,
          );

          let latency = Date.now() - t0;

          if (!geminiResult.ok) {
            console.log('[EntityChat] API error', {
              error: geminiResult.error,
              latency_ms: latency,
            });
            return j(
              { error: 'entity_chat_failed', detail: geminiResult.error, latency_ms: latency },
              200,
            );
          }

          // Check for tool call
          const toolCall = geminiResult.functionCalls?.[0];
          let content = geminiResult.content ?? '';
          let sources = undefined;
          let searchQuery = undefined;

          if (toolCall?.name === 'web_search') {
            try {
              const args = toolCall.args || {};
              searchQuery = args.query;

              console.log('[EntityChat] Web search triggered', { query: searchQuery });

              const searchT0 = Date.now();
              const searchResults = await executeTavilySearch(searchQuery, env.TAVILY_API_KEY);
              const searchLatency = Date.now() - searchT0;

              console.log('[EntityChat] Search complete', {
                resultCount: searchResults?.results?.length || 0,
                latency: searchLatency,
              });

              if (searchResults && searchResults.results.length > 0) {
                // Build native follow-up contents with thought signatures preserved
                const originalContents = convertMessages(entityMessages);
                const functionResults = [
                  {
                    name: 'web_search',
                    id: toolCall.id || 'web_search_0',
                    response: { results: formatSearchBrief(searchResults) },
                  },
                ];
                const followUpContents = buildFollowUpContents(
                  originalContents,
                  geminiResult.parts || [],
                  functionResults,
                );

                // Second API call (triage config)
                const followUpResult = await geminiGenerate(
                  genConfig.systemPrompt,
                  [],
                  {
                    temperature: genConfig.temperature,
                    maxOutputTokens: Math.max(genConfig.maxTokens, 1200),
                    thinkingLevel: genConfig.thinkingLevel,
                    nativeContents: followUpContents,
                  },
                  env.GOOGLE_API_KEY,
                );

                content = followUpResult.ok ? followUpResult.content : '';
                sources = searchResults.results.map((r) => ({ title: r.title, url: r.url }));
                latency = Date.now() - t0;
              }
            } catch (searchErr) {
              console.log('[EntityChat] Search error:', searchErr);
            }
          }

          // Extract smart save suggestion (inline from model)
          const { suggestion: smartSuggestion, cleanContent } = extractSaveSuggestion(content);

          // Fall back to pattern detection if no smart suggestion
          const saveable = smartSuggestion
            ? { detected: true, type: smartSuggestion.type, smart: true }
            : detectSaveableContent(cleanContent);

          // Use smart suggestion if available
          const save_suggestion = smartSuggestion || null;

          // Use cleaned content (without suggestion block) for display
          content = cleanContent;
          content = stripFillerOpening(content);
          // Strip any residual or partial SAVE blocks
          content = content
            .replace(/<!--SAVE:.*?-->/gs, '')
            .replace(/<!--SAVE:.*$/s, '')
            .trim();

          console.log('[EntityChat] Complete', {
            latency_ms: latency,
            content_length: content.length,
            has_saveable: saveable?.detected,
            used_search: !!searchQuery,
          });

          // ── POST-RESPONSE: Update entity chat summary (non-blocking) ──
          if (authenticatedUserId && content) {
            const entity = body.entity || {};
            const entityId = entity.id || null;
            const entityType = entity.type || null;
            if (entityId && entityType) {
              const summaryPromise = (async () => {
                try {
                  const tableName =
                    entityType === 'habit' ? 'habits' : entityType === 'note' ? 'notes' : 'todos';
                  const prevRes = await fetch(
                    `${env.SUPABASE_URL}/rest/v1/${tableName}?id=eq.${entityId}&select=views`,
                    {
                      headers: {
                        apikey: env.SUPABASE_SERVICE_KEY,
                        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                      },
                    },
                  );
                  const prevRows = prevRes.ok ? await prevRes.json() : [];
                  const previousEntitySummary = prevRows?.[0]?.views?.chat_summary || null;

                  await generateEntityChatSummary(
                    messages.filter((m) => m.role !== 'system'),
                    content,
                    entityId,
                    entityType,
                    entity.title || entity.name || null,
                    entity.space_name || null,
                    previousEntitySummary,
                    env,
                    tz,
                  );
                } catch (err) {
                  console.warn('[EntityChat:NonStreaming] Chat summary failed:', err.message);
                }
              })();
              ctx.waitUntil(summaryPromise);
            }
          }

          return j({
            content,
            saveable,
            save_suggestion,
            latency_ms: latency,
            sources,
            search_query: searchQuery,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[EntityChat] Error', { error: String(err), latency_ms: latency });
          return j({ error: 'entity_chat_failed', detail: String(err), latency_ms: latency }, 200);
        }
      }

      // Helper: Extract smart save suggestion from response
      function extractSaveSuggestion(content) {
        if (!content) return { suggestion: null, cleanContent: content };

        // Look for <!--SAVE:{...}--> pattern (forgiving of whitespace and slight variations)
        const savePattern = /<!--\s*SAVE\s*:\s*(\{[\s\S]*?\})\s*-->/i;
        const match = content.match(savePattern);

        if (!match) {
          return { suggestion: null, cleanContent: content };
        }

        try {
          // Clean up the JSON string (remove any stray newlines or formatting)
          const jsonStr = match[1]
            .replace(/[\n\r]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const suggestion = JSON.parse(jsonStr);

          // Validate required fields
          if (!suggestion.type || !suggestion.title) {
            console.log('[SaveSuggestion] Invalid suggestion - missing type or title');
            return { suggestion: null, cleanContent: content };
          }

          // Validate type
          if (!['todo', 'habit', 'note'].includes(suggestion.type)) {
            console.log('[SaveSuggestion] Invalid type:', suggestion.type);
            return { suggestion: null, cleanContent: content };
          }

          // Clean up steps if present
          if (suggestion.steps) {
            if (!Array.isArray(suggestion.steps)) {
              delete suggestion.steps;
            } else {
              // Limit to 12 steps, clean strings
              suggestion.steps = suggestion.steps
                .slice(0, 12)
                .map((s) => String(s).trim())
                .filter((s) => s.length > 0 && s.length < 200);

              if (suggestion.steps.length === 0) {
                delete suggestion.steps;
              }
            }
          }

          // Remove the suggestion block from displayed content
          const cleanContent = content.replace(savePattern, '').trim();

          console.log('[SaveSuggestion] Extracted:', {
            type: suggestion.type,
            title: suggestion.title,
            hasSteps: !!suggestion.steps,
            stepCount: suggestion.steps?.length || 0,
          });

          return { suggestion, cleanContent };
        } catch (parseErr) {
          console.log('[SaveSuggestion] Parse error:', parseErr.message);
          return { suggestion: null, cleanContent: content };
        }
      }

      /**
       * Pre-parse: classify user intent into a conversation mode before main chat.
       * Runs gpt-4.1-nano (~100ms). Returns null on any failure.
       */
      async function habitPreParse(userMessage, previousExchange, context, env) {
        const { existingHabits, currentMode, turnNumber, compressedLifeMap, habitCapacity } =
          context;

        const habitList =
          (existingHabits || [])
            .map((h) => {
              const parts = [h.name];
              parts.push(h.subtype === 'break_habit' ? 'break' : 'build');
              if (h.frequency) parts.push(h.frequency);
              if (h.time_window && h.time_window !== 'any') parts.push(h.time_window);
              return parts.join(', ');
            })
            .join(' | ') || 'None';

        // eslint-disable-next-line no-restricted-syntax -- Worker has no dateService; timezone-safe via Intl
        const today =
          context.currentDate ||
          new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date());

        const prompt = `You classify the intent of a message in a habit-building conversation.
Today's date is ${today}.

CONTEXT:
- User's existing habits: ${habitList}
${habitCapacity ? `- Habit capacity: ${habitCapacity.totalActive} active habits (${habitCapacity.dailyCount} daily, ${habitCapacity.weeklyCount} weekly)` : ''}
- Life context: ${compressedLifeMap || 'None available'}
- Current conversation mode: ${currentMode || 'none (first message)'}
- Previous exchange: ${previousExchange ? `Assistant: "${previousExchange.assistantMsg?.slice(0, 200)}" / User: "${previousExchange.userMsg?.slice(0, 200)}"` : 'none'}
- Turn number: ${turnNumber || 0}

IF current mode is "none" (first message) OR you detect a clear mode shift signal:
  CLASSIFY into exactly one primary mode:
  - QUICK_LOCK: User gave a specific behavior + frequency. All key info present.
  - SHAPE: Intent present but missing specific behavior and/or frequency.
  - RESEARCH: User is asking a question, wants information, or expresses curiosity/uncertainty.
  - BREAK: User wants to stop, quit, reduce, or eliminate a behavior.
  - EVENT_ANCHORED: Habit tied to a specific deadline, event, or milestone.
  Also check for a secondary mode if signals for two modes are present.

IF the user is simply responding to a question, confirming, or continuing without new intent:
  Return mode: "CONTINUE"

MODE SHIFT SIGNALS (reclassify even mid-conversation):
  - User asks a question → may shift to RESEARCH
  - User mentions a deadline or event → may add EVENT_ANCHORED as secondary
  - "I've tried this before" / "I keep failing" → set is_restart: true
  - "Just set it up" → shift to QUICK_LOCK
  - "What does research say?" → shift to RESEARCH
  - User mentions wanting to stop/quit something → shift to BREAK

ALSO DETECT:
- is_restart: true if user signals they've tried this before and failed/stopped. false otherwise.
- search_query: A concise 3-6 word web search query if RESEARCH mode or if user asks something researchable. null otherwise. Make it specific.
- event_context: { name, date (YYYY-MM-DD), weeks_until } if EVENT_ANCHORED detected. null otherwise.
- capacity_signal: Brief note if habit load suggests capacity concerns. null if fine.
- nudge_toward_proposal: true if turn_number >= 8. false otherwise.

EXTRACT fields present in THIS message:
- behavior, habit_type ("build"/"break"/null), frequency, start_date (YYYY-MM-DD), time_window ("morning"/"afternoon"/"evening"/"anytime"), end_date (YYYY-MM-DD)
All null if not present.

Return ONLY valid JSON:
{"mode":"...","secondary_mode":null,"is_restart":false,"search_query":null,"event_context":null,"capacity_signal":null,"nudge_toward_proposal":false,"extracted":{"behavior":null,"habit_type":null,"frequency":null,"start_date":null,"time_window":null,"end_date":null}}`;

        try {
          const res = await helperFetch('habit_preparse', {
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: userMessage },
            ],
            temperature: 0.1,
            max_tokens: 300,
            response_format: { type: 'json_object' },
          });

          if (!res.ok) {
            console.warn('[HabitPreParse] API error:', res.status);
            return null;
          }

          const data = await res.json();
          const raw = data?.choices?.[0]?.message?.content ?? '{}';
          const parsed = safeParseJson(raw);

          if (!parsed || !parsed.mode) {
            console.warn('[HabitPreParse] Invalid response:', raw?.slice(0, 100));
            return null;
          }

          const validModes = [
            'QUICK_LOCK',
            'SHAPE',
            'RESEARCH',
            'BREAK',
            'EVENT_ANCHORED',
            'CONTINUE',
          ];
          if (!validModes.includes(parsed.mode)) {
            console.warn('[HabitPreParse] Invalid mode:', parsed.mode);
            return null;
          }

          console.log('[HabitPreParse] Result:', {
            mode: parsed.mode,
            secondary: parsed.secondary_mode,
            isRestart: parsed.is_restart,
            hasSearch: !!parsed.search_query,
            nudge: parsed.nudge_toward_proposal,
          });

          return parsed;
        } catch (err) {
          console.error('[HabitPreParse] Error:', err.message);
          return null;
        }
      }

      /**
       * Compress the Life Map into a short context string for habit builder.
       * Used by pre-parse (under 500 chars) and could be used by other lightweight contexts.
       *
       * Pulls:
       * 1. Active domain names from Life Map
       * 2. High-importance active thread summaries (first sentence only)
       */
      function compressLifeMapForHabits(lifeMap) {
        const parts = [];

        // 1. Active domain names
        if (lifeMap?.domains) {
          const activeDomains = lifeMap.domains
            .filter((d) => d.attention !== 'background')
            .map((d) => d.name);
          if (activeDomains.length > 0) {
            parts.push('Active domains: ' + activeDomains.join(', '));
          }

          // 2. High-importance active thread summaries (first sentence only)
          const highThreads = [];
          for (const domain of lifeMap.domains) {
            if (domain.attention === 'background') continue;
            for (const thread of domain.threads || []) {
              if (
                thread.importance === 'high' &&
                (thread.lifecycle === 'active' || thread.lifecycle === 'dormant')
              ) {
                if (thread.summary) {
                  const firstSentence = thread.summary.split(/\.\s/)[0];
                  highThreads.push(`${domain.name}: ${firstSentence}`);
                }
              }
            }
          }
          if (highThreads.length > 0) {
            parts.push(highThreads.slice(0, 3).join('. '));
          }
        }

        const result = parts.join('. ').trim();

        // Enforce 500 char limit — drop thread summaries first if over
        if (result.length > 500) {
          const withoutThreads = parts.slice(0, 2).join('. ').trim();
          return withoutThreads.slice(0, 500);
        }

        return result || '';
      }

      /**
       * Post-stream extraction: analyzes full conversation to extract resolved habit fields.
       * Runs after streaming completes (~300ms). User doesn't see this call.
       */
      async function extractHabitFields(messages, apiKey, currentDate, builderMode) {
        // eslint-disable-next-line no-restricted-syntax -- Worker has no dateService; timezone-safe via Intl
        const fallbackDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: userTimezone,
        }).format(new Date());
        const isBreakMode = builderMode === 'BREAK';
        const isEventMode = builderMode === 'EVENT_ANCHORED';

        const extractionPrompt = `You analyze a habit-building conversation and assess readiness.
Today is ${new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: userTimezone }).format(new Date())}, ${currentDate || fallbackDate}.
Resolve relative day and date references into YYYY-MM-DD. Verify the day-of-week matches the calendar date before returning.

Conversation mode: ${builderMode || 'SHAPE'}

Read the FULL conversation. Extract resolved fields and assess readiness.

=== READINESS TIERS ===
${
  isBreakMode
    ? `BREAK HABITS:
- "exploring": No specific behavior to stop identified.
- "shaping": Behavior to stop identified, but missing trigger OR replacement/boundary.
- "confirmable": Behavior to stop + trigger identified + replacement behavior OR boundary rule.
- "locked": User has confirmed.`
    : `BUILD HABITS:
- "exploring": No specific, schedulable behavior identified. User still thinking.
- "shaping": Specific behavior exists but missing frequency OR build/break type.
- "confirmable": Core triad resolved — specific trackable behavior + build/break + frequency. Start date defaults to today if not discussed.
- "locked": User has confirmed.`
}

SPECIFICITY TEST: Could this behavior be written on a calendar? If yes, at least "shaping." If too vague to schedule, "exploring."
READINESS MUST NEVER REGRESS from a previous tier.

=== CONVERSATION VALUE ===
- "low": User provided all info upfront. Chat just confirmed.
- "medium": Chat helped shape the behavior, frequency, or approach.
- "high": Chat provided research, restart shaping, context integration, or fundamentally changed the approach.

=== FIELDS TO EXTRACT ===
1. name — clean habit name, 2-6 words. For break habits, use the boundary rule as the name if one has been shaped.
   CRITICAL: name must be short, action-oriented, and usable as a standalone title. Not a sentence, not a description, not a summary of the conversation. Return null if no specific behavior has been identified.
2. habit_type — "build" or "break"
3. cadence — "daily", "weekly", or "monthly"
4. target — normalized frequency string: "daily", "2x/week", "3x/week", "weekly", etc.
5. start_date — YYYY-MM-DD
6. time_window — "morning", "afternoon", "evening", or "anytime" (null if not discussed)
7. space_name — Space name if user discussed assigning to one (null if not)
8. notes — the user's personal WHY in one short sentence, first person. This must add context that is NOT already captured by the name, frequency, start date, or time window fields. If the user's motivation is fully expressed by the habit parameters themselves, return null. Maximum 15 words. Never mention the habit name, frequency, schedule, or any field values that already appear elsewhere in this JSON.
9. end_date — YYYY-MM-DD if a deadline or event was discussed (null if not)
10. time_estimate_minutes — estimated minutes per session: 5, 10, 15, 30, 45, 60, 90, 120 (null if not discussed, infer from activity type if obvious)
11. event_name — what they're working toward, if an event/deadline is involved (null if not)
12. is_restart — true if the user indicated they've attempted this before and stopped
13. restart_context — what went wrong last time and how this attempt differs (null if not a restart or not discussed)
${
  isBreakMode
    ? `
=== BREAK-SPECIFIC FIELDS ===
14. trigger — what causes the unwanted behavior (null if not discussed)
15. replacement_behavior — what they'll do instead when triggered (null if not discussed)
16. environment_change — any physical or environmental modifications planned (null if not discussed)
17. boundary_rule — the specific binary rule they're setting, phrased as a constraint (null if not shaped)
18. current_frequency — how often the unwanted behavior currently happens (null if not discussed)`
    : ''
}
${
  isEventMode
    ? `
=== EVENT-SPECIFIC NOTES ===
Include the event name and timeline in the notes field.`
    : ''
}

=== CONFIRMATION DETECTION ===
is_confirmation: true if the assistant's LAST message asks the user to confirm/lock in the habit. true even if the assistant did not list habit details (the app renders a visual card separately). false if still shaping.

=== POST-LOCK-IN EDIT DETECTION ===
If the habit was already confirmed and the user is requesting a change:
- edit_field: the field name being changed (frequency, start_date, end_date, time_window, name, notes, time_estimate_minutes, trigger, replacement_behavior, boundary_rule)
- edit_value: the new value
Keep readiness as "locked" in this case.

=== CHIPS ===
CRITICAL RULE: Chips must respond to the topic and intent of the assistant's last message, not to which habit fields are missing. For yes/no questions, return yes/no style options. For choice questions, return the choices. Never generate field-completion chips when the assistant asked an unrelated question.

suggested_chips: 2-3 short tappable answer options that directly respond to the assistant's last question.
- Match the question topic (frequency, time, start date, confirmation).
- If the assistant presented specific options in its message, use THOSE as chips.
- If the assistant asked an open-ended or exploratory question, return null.
- If readiness is confirmable, include a lock-in chip.
- Default to null if unsure.

steering_chips: 0-1 conversation control chips.
- If the conversation is 3+ turns and mode is SHAPE or RESEARCH, consider a skip-to-setup option.
- If research might help, consider a research option.
- If a restart signal seems possible, consider a past-attempt option.
- After lock-in: null.
- Default: null. Don't force steering chips.

Return ONLY valid JSON:
{
  "name": "string or null",
  "habit_type": "build or break or null",
  "cadence": "daily or weekly or monthly or null",
  "target": "string or null",
  "start_date": "YYYY-MM-DD or null",
  "time_window": "morning or afternoon or evening or anytime or null",
  "space_name": "string or null",
  "notes": "string or null",
  "end_date": "YYYY-MM-DD or null",
  "time_estimate_minutes": "number or null",
  "event_name": "string or null",
  "is_restart": false,
  "restart_context": "string or null",
  "is_confirmation": false,
  "readiness": "exploring or shaping or confirmable or locked",
  "conversation_value": "low or medium or high",
  "suggested_chips": "array of strings or null",
  "steering_chips": "array of strings or null",
  "edit_field": "string or null",
  "edit_value": "string or null"${
    isBreakMode
      ? `,
  "trigger": "string or null",
  "replacement_behavior": "string or null",
  "environment_change": "string or null",
  "boundary_rule": "string or null",
  "current_frequency": "string or null"`
      : ''
  }
}`;

        const defaults = {
          name: null,
          habit_type: null,
          cadence: null,
          target: null,
          start_date: null,
          time_window: null,
          space_name: null,
          notes: null,
          end_date: null,
          time_estimate_minutes: null,
          is_confirmation: false,
          suggested_chips: null,
          next_field: null,
          required_count: 0,
          readiness: 'exploring',
          conversation_value: 'low',
          event_name: null,
          is_restart: false,
          restart_context: null,
          steering_chips: null,
          edit_field: null,
          edit_value: null,
          trigger: null,
          replacement_behavior: null,
          environment_change: null,
          boundary_rule: null,
          current_frequency: null,
        };

        try {
          const res = await helperFetch('habit_fields', {
            messages: [
              { role: 'system', content: extractionPrompt },
              {
                role: 'user',
                content:
                  'Here is the conversation:\n\n' +
                  messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n'),
              },
            ],
            temperature: 0.1,
            max_tokens: 600,
            response_format: { type: 'json_object' },
          });

          if (!res.ok) {
            console.log('[HabitBuilder:Extract] API error', { status: res.status });
            return defaults;
          }

          const oj = await res.json();
          const raw = oj?.choices?.[0]?.message?.content ?? '{}';
          const parsed = JSON.parse(raw);

          // Build extracted fields from AI response
          const extracted = {
            name: typeof parsed.name === 'string' ? parsed.name : null,
            habit_type: ['build', 'break'].includes(parsed.habit_type) ? parsed.habit_type : null,
            cadence: ['daily', 'weekly', 'monthly'].includes(parsed.cadence)
              ? parsed.cadence
              : null,
            target: typeof parsed.target === 'string' ? parsed.target : null,
            start_date:
              typeof parsed.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.start_date)
                ? parsed.start_date
                : null,
            time_window: ['morning', 'afternoon', 'evening', 'anytime'].includes(parsed.time_window)
              ? parsed.time_window
              : null,
            space_name: typeof parsed.space_name === 'string' ? parsed.space_name : null,
            notes: typeof parsed.notes === 'string' ? parsed.notes : null,
            end_date:
              typeof parsed.end_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.end_date)
                ? parsed.end_date
                : null,
            time_estimate_minutes: Number.isFinite(parsed.time_estimate_minutes)
              ? parsed.time_estimate_minutes
              : null,
            is_confirmation: parsed.is_confirmation === true,
            suggested_chips: Array.isArray(parsed.suggested_chips)
              ? parsed.suggested_chips
                  .filter((c) => typeof c === 'string' && c.length > 0 && c.length <= 30)
                  .slice(0, 4)
              : null,
            // V2 fields
            readiness: ['exploring', 'shaping', 'confirmable', 'locked'].includes(parsed.readiness)
              ? parsed.readiness
              : 'exploring',
            conversation_value: ['low', 'medium', 'high'].includes(parsed.conversation_value)
              ? parsed.conversation_value
              : 'low',
            event_name: typeof parsed.event_name === 'string' ? parsed.event_name : null,
            is_restart: parsed.is_restart === true,
            restart_context:
              typeof parsed.restart_context === 'string' ? parsed.restart_context : null,
            steering_chips: Array.isArray(parsed.steering_chips)
              ? parsed.steering_chips
                  .filter((c) => typeof c === 'string' && c.length > 0 && c.length <= 30)
                  .slice(0, 2)
              : null,
            edit_field: typeof parsed.edit_field === 'string' ? parsed.edit_field : null,
            edit_value: typeof parsed.edit_value === 'string' ? parsed.edit_value : null,
            // Break-specific
            trigger: typeof parsed.trigger === 'string' ? parsed.trigger : null,
            replacement_behavior:
              typeof parsed.replacement_behavior === 'string' ? parsed.replacement_behavior : null,
            environment_change:
              typeof parsed.environment_change === 'string' ? parsed.environment_change : null,
            boundary_rule: typeof parsed.boundary_rule === 'string' ? parsed.boundary_rule : null,
            current_frequency:
              typeof parsed.current_frequency === 'string' ? parsed.current_frequency : null,
          };

          // ── Server-side inference: fill obvious gaps the model might miss ──
          // Daily cadence always means daily target
          if (extracted.cadence === 'daily' && !extracted.target) {
            extracted.target = 'daily';
          }
          // Monthly cadence without target: default to monthly
          if (extracted.cadence === 'monthly' && !extracted.target) {
            extracted.target = 'monthly';
          }
          // If target is set but cadence is missing, infer cadence
          if (extracted.target && !extracted.cadence) {
            if (extracted.target === 'daily') extracted.cadence = 'daily';
            else if (extracted.target.includes('/week')) extracted.cadence = 'weekly';
            else if (extracted.target.includes('/month')) extracted.cadence = 'monthly';
            else if (extracted.target === 'weekly') extracted.cadence = 'weekly';
            else if (extracted.target === 'monthly') extracted.cadence = 'monthly';
          }

          // ── Server-side computation: count and determine next field ──
          const requiredFields = ['name', 'habit_type', 'cadence', 'target', 'start_date'];
          const requiredCount = requiredFields.filter((f) => extracted[f] !== null).length;
          const nextField =
            requiredCount >= 5
              ? 'confirm'
              : requiredFields.find((f) => extracted[f] === null) || null;

          extracted.required_count = requiredCount;
          extracted.next_field = nextField;

          return extracted;
        } catch (err) {
          console.log('[HabitBuilder:Extract] Error', { error: String(err) });
          return defaults;
        }
      }

      // Helper: Detect saveable content in response
      function detectSaveableContent(content) {
        if (!content) return { detected: false };

        const lower = content.toLowerCase();

        // Check for bullet list (potential checklist)
        const bulletPattern = /^[\s]*[-"*]\s+.+$/gm;
        const bullets = content.match(bulletPattern);
        const hasBulletList = bullets && bullets.length >= 2;

        // Check for numbered list
        const numberedPattern = /^[\s]*\d+[.)]\s+.+$/gm;
        const numbered = content.match(numberedPattern);
        const hasNumberedList = numbered && numbered.length >= 2;

        // Check for save suggestion phrases
        const savePhrases = [
          'save this',
          'worth saving',
          'keep this',
          'worth keeping',
          'as a checklist',
          'save these steps',
          'bookmark this',
        ];
        const hasSaveSuggestion = savePhrases.some((phrase) => lower.includes(phrase));

        // Determine type
        const isChecklist = hasBulletList || hasNumberedList;

        if (!isChecklist && !hasSaveSuggestion) {
          return { detected: false };
        }

        // Extract checklist items if present
        let checklistItems = null;
        if (isChecklist) {
          const allItems = [...(bullets || []), ...(numbered || [])];
          checklistItems = allItems
            .map((item) => item.replace(/^[\s]*[-"*\d.)]+\s+/, '').trim())
            .filter((item) => item.length > 0 && item.length < 200)
            .slice(0, 10);
        }

        return {
          detected: true,
          type: isChecklist ? 'checklist' : 'note',
          checklist_items: checklistItems,
          has_save_suggestion: false,
        };
      }

      // === ORGANIZE DAY (v2.0) ===
      // AI-powered task scheduling for Morning Brief
      // UPGRADED: Anthropic Sonnet 4.5 (was gpt-4o-mini)
      // - Prompt caching on static scheduling rules (~90% input cost reduction on cache hits)
      // - Expanded context: user patterns, space priorities, habit streaks, completion history
      // - Daily usage limit (configurable, default 5/day)
      // - Better multi-constraint reasoning for 20-50+ tasks
      // =========================
      if (type === 'organize-day') {
        // Access gate — Phase 4.7
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return denyAccessResponse(access.reason);
        }

        const tasks = Array.isArray(body.tasks) ? body.tasks : [];
        const calendarEvents = Array.isArray(body.calendarEvents) ? body.calendarEvents : [];
        const blocks = body.blocks || {};
        const timezone = userTimezone;
        let currentHour;
        if (body.currentHour != null) {
          currentHour = body.currentHour;
        } else {
          // eslint-disable-next-line no-restricted-syntax -- Worker has no dateService; timezone-safe via Intl
          const hourStr = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            hour12: false,
            timeZone: timezone,
          }).format(new Date());
          currentHour = parseInt(hourStr, 10);
        }
        const userId = authenticatedUserId;

        // === Expanded context (new in v2.0) ===
        const userPatterns = body.userPatterns || null;
        const spacePriorities = body.spacePriorities || null;
        const habitContext = body.habitContext || null;
        const recentCompletions = body.recentCompletions || null;

        // === Daily usage limit ===
        const DAILY_ORGANIZE_LIMIT = 5;

        if (userId && env.CORTEX_KV) {
          try {
            // eslint-disable-next-line no-restricted-syntax -- Worker has no dateService; timezone-safe via Intl
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(
              new Date(),
            );
            const limitKey = `organize-limit:${userId}:${today}`;
            const currentCount = parseInt((await env.CORTEX_KV.get(limitKey)) || '0', 10);

            if (currentCount >= DAILY_ORGANIZE_LIMIT) {
              return j({
                error: 'daily_limit_reached',
                limit: DAILY_ORGANIZE_LIMIT,
                assignments: [],
                overflow: [],
                reasoning: [],
                summary: `You've organized ${DAILY_ORGANIZE_LIMIT} times today. Trust your plan — you've got this.`,
                latency_ms: 0,
              });
            }

            await env.CORTEX_KV.put(limitKey, String(currentCount + 1), { expirationTtl: 172800 });
          } catch (kvErr) {
            console.log('[organize-day] KV limit check failed, proceeding', {
              error: String(kvErr),
            });
          }
        }

        // === Validation ===
        if (tasks.length === 0) {
          return j({
            assignments: [],
            overflow: [],
            reasoning: [],
            summary: 'No tasks to organize.',
            latency_ms: 0,
          });
        }

        const tasksToAssign = tasks.filter((t) => !t.currentBlock);

        if (tasksToAssign.length === 0) {
          return j({
            assignments: [],
            overflow: [],
            reasoning: [],
            summary: 'All tasks are already assigned or locked.',
            latency_ms: 0,
          });
        }

        // === Build task context ===
        const taskList = tasksToAssign
          .map((t) => {
            const parts = [`- ${t.id}: "${t.title}"`];
            parts.push(`  total_minutes: ${t.totalMinutes || t.estimateMinutes || 30}`);
            parts.push(`  energy: ${t.energyType || 'administrative'}`);
            parts.push(`  type: ${t.type || 'todo'}`);
            if (t.tags && Array.isArray(t.tags) && t.tags.length > 0) {
              parts.push(`  tags: ${t.tags.slice(0, 5).join(', ')}`);
            }
            if (t.timeWindowPreference) {
              parts.push(`  prefers: ${t.timeWindowPreference}`);
            }
            if (t.dueDate) {
              parts.push(`  due: ${t.dueDate}`);
            }
            if (t.priority) {
              parts.push(`  priority: ${t.priority}`);
            }
            if (t.spaceName) {
              parts.push(`  space: ${t.spaceName}`);
            }
            if (t.locked) {
              parts.push(`  locked: true`);
            }
            return parts.join('\n');
          })
          .join('\n');

        // === Build calendar context ===
        const calendarContext =
          calendarEvents.length > 0
            ? calendarEvents
                .map((e) => `- ${e.title}: ${e.startAt} to ${e.endAt} (${e.durationMinutes}min)`)
                .join('\n')
            : 'No calendar events today.';

        // === Build block capacity context ===
        const formatGaps = (gaps) =>
          (gaps || [])
            .map(
              (g) =>
                `  gap: ${g.startIso.slice(11, 16)}–${g.endIso.slice(11, 16)} (${g.durationMinutes} min)`,
            )
            .join('\n');

        // Calendar-only availability: block total minus calendar events only
        // This ensures task assignments don't shrink reported capacity
        const calendarFreeMinutes = (block) => {
          if (!block) return 0;
          const total = ((block.endHour ?? 0) - (block.startHour ?? 0)) * 60;
          // Gaps give us the actual free windows so sum those
          const gapTotal = (block.gaps || []).reduce((sum, g) => sum + (g.durationMinutes || 0), 0);
          return gapTotal || block.realisticAvailableMinutes || block.availableMinutes || 0;
        };

        const blockContext = `Morning: ${calendarFreeMinutes(blocks.morning)} min available
${formatGaps(blocks.morning?.gaps)}
Day: ${calendarFreeMinutes(blocks.day)} min available
${formatGaps(blocks.day?.gaps)}
Evening: ${calendarFreeMinutes(blocks.evening)} min available
${formatGaps(blocks.evening?.gaps)}`;

        // === Build expanded context sections (new in v2.0) ===
        let expandedContext = '';

        if (userPatterns) {
          expandedContext += `\n=== USER PATTERNS ===\n`;
          if (userPatterns.peakFocusTime)
            expandedContext += `Peak focus time: ${userPatterns.peakFocusTime}\n`;
          if (userPatterns.avgCompletionRate != null)
            expandedContext += `Avg daily completion rate: ${Math.round(userPatterns.avgCompletionRate * 100)}%\n`;
          if (userPatterns.commonSkipTimes)
            expandedContext += `Common skip times: ${userPatterns.commonSkipTimes}\n`;
          if (userPatterns.preferredTaskOrder)
            expandedContext += `Preferred order: ${userPatterns.preferredTaskOrder}\n`;
        }

        if (spacePriorities && spacePriorities.length > 0) {
          expandedContext += `\n=== SPACE PRIORITIES ===\n`;
          expandedContext +=
            spacePriorities
              .map(
                (s) =>
                  `- ${s.name}: priority ${s.priority}${s.taskCount ? ` (${s.taskCount} tasks)` : ''}`,
              )
              .join('\n') + '\n';
        }

        if (habitContext && habitContext.length > 0) {
          expandedContext += `\n=== HABIT CONTEXT ===\n`;
          expandedContext +=
            habitContext
              .map((h) => {
                const parts = [`- "${h.title}"`];
                if (h.currentStreak) parts.push(`streak: ${h.currentStreak} days`);
                if (h.bestTime) parts.push(`best time: ${h.bestTime}`);
                if (h.lastCompleted) parts.push(`last: ${h.lastCompleted}`);
                return parts.join(', ');
              })
              .join('\n') + '\n';
        }

        if (recentCompletions && recentCompletions.length > 0) {
          expandedContext += `\n=== RECENT COMPLETIONS (last 3 days) ===\n`;
          expandedContext +=
            recentCompletions
              .slice(0, 15)
              .map(
                (c) => `- "${c.title}" → ${c.block}${c.completedAt ? ` at ${c.completedAt}` : ''}`,
              )
              .join('\n') + '\n';
        }

        // === Life Map planner projection ===
        let plannerProjection = '';
        if (userId) {
          plannerProjection = await fetchPlannerProjection(userId, timezone, env);
        }

        // === Static system prompt (cached) ===
        const ORGANIZE_SYSTEM_PROMPT = `You are a task scheduler for a productivity app called Gremly. Your job is to place tasks into time blocks to create a calm, focused, achievable day.

You are scheduling for real humans. This means:
- Overscheduling causes anxiety and paralysis. Leave breathing room.
- Transitions between very different tasks are cognitively expensive.
- Starting the day with a quick win builds momentum.
- Ending the day with low-energy tasks prevents evening overwhelm.
- Habits that have active streaks should be protected — don't let them slip.

=== SCHEDULING RULES ===
1. Never schedule tasks in past blocks (check current hour).
2. Aim for 85-95% of block capacity. Fill gaps thoroughly — it's better to schedule a task and let the user adjust than to overflow it when there's clearly room. Every assigned task must land in a specific gap.
3. Respect time_window_preference when set — this is a user commitment.
4. Use energy types to shape sequencing:
   - deep_focus: longest uninterrupted gap, ideally morning
   - administrative: batch together, any block
   - physical: avoid stacking back-to-back, avoid immediately after meals
   - social: avoid stacking, respect energy cost
   - quick: use as buffer between heavier tasks, or to start a block
5. Group tasks with shared tags or spaces to reduce context switching.
6. Spread habits across blocks — never cluster them all in one block.
7. Tasks due today get priority placement. Overdue tasks get highest.
8. If a user pattern indicates peak focus time, place deep_focus tasks there.
9. If habit context shows a best time, honor it.
10. If recent completions show a pattern (user always does X in morning), follow it.
11. LOCKED PRIORITIES: Tasks marked locked:true MUST be scheduled — never overflow them. Place locked tasks FIRST, then fill remaining capacity with unlocked tasks. If a locked task has a time preference, honor it strictly.

=== TIME SLOT ASSIGNMENT (REQUIRED) ===
Every assigned task MUST include a "scheduledStartIso" — the ISO-8601 start time within one of the block's gaps. This is NOT optional.

Rules:
1. Look at the gaps listed under each block in CAPACITY. Each gap has a start, end, and duration.
2. Pick a gap where the task's total_minutes fits entirely.
3. Set scheduledStartIso to a time ON or AFTER the gap start, leaving enough room before the gap end for the full task.
4. Round scheduledStartIso to the nearest 5-minute mark (e.g. :00, :05, :10 …).
5. Do NOT double-book — track remaining gap time as you assign tasks and split gaps accordingly.
6. Prefer placing deep_focus tasks in the longest available gap.
7. Prefer placing quick tasks in short gaps or as transitions between heavier tasks.
8. If no gap can fit a task, overflow it — do NOT assign without a valid scheduledStartIso.
9. scheduledStartIso MUST be in the future — never before the current time shown in the TIME section.
10. Use ISO-8601 format with timezone offset, e.g. "2025-01-15T09:30:00-05:00".

=== OVERFLOW RULES ===
If tasks won't fit, overflow them. This is NOT failure — it's realistic planning.
- Overflow the lowest-priority, non-due-today tasks first.
- Never overflow an overdue task unless there is literally zero capacity.
- Never overflow a habit with an active streak unless capacity is truly zero.
- Overflow reason should be encouraging, not guilt-inducing.

CRITICAL: Only overflow tasks when blocks are genuinely full. If a block has 60+ minutes of unscheduled time, you MUST place more tasks there before overflowing anything. Count your assignments against capacity as you go. Users feel frustrated when they see empty time blocks alongside overflowed tasks.

=== OUTPUT FORMAT ===
Respond with ONLY valid JSON. No markdown, no backticks, no explanation outside the JSON.
{
  "assignments": [
    {
      "taskId": "...",
      "block": "morning|day|evening",  // IMPORTANT: use "day" for afternoon, never "afternoon"
      "reason": "5-10 words",
      "scheduledStartIso": "2025-01-15T09:30:00-05:00"  // REQUIRED ISO-8601 start time
    }
  ],
  "overflow": [
    {
      "taskId": "...",
      "reason": "5-10 encouraging words"
    }
  ],
  "reasoning": ["Pattern or decision 1", "Pattern 2", "Pattern 3"],
  "summary": "One calm sentence about the plan"
}

=== REASONING GUIDELINES ===
Provide 2-4 short bullets explaining your approach. Focus on:
- Grouping patterns ("Batched your work tasks together")
- Energy flow ("Put focus work in the morning when you're fresh")
- Habit placement ("Spread your habits throughout the day")
- Preference respect ("Honored your morning preference for the gym")
- Gap usage ("Slotted your deep work into the 90-min morning window")
- Pattern following ("You usually journal in the evening, so kept it there")

Do NOT mention in reasoning:
- Specific minute counts or capacity numbers
- Buffer calculations
- Energy type names (use plain language like "heavier tasks" or "quick wins")
- Technical terms

=== SCHEDULING WALKTHROUGH ===
Follow these steps IN ORDER:
1. Read all gaps for each block. Note their start, end, and available minutes.
2. Place LOCKED tasks first — they must be scheduled. Honor their time preferences.
3. Place overdue and due-today tasks next, fitting them into appropriate gaps.
4. Place remaining tasks by priority and energy fit, filling gaps as you go.
5. After each placement, subtract the task's total_minutes from the gap. If the gap is partially used, split it into the remaining segment.
6. When no gap can fit a task, overflow it with an encouraging reason.
7. Double-check: every assignment has a valid scheduledStartIso that falls inside a gap and is in the future.

Keep the tone warm and reassuring — like a helpful friend explaining the plan.`;

        // === Dynamic user message ===
        // eslint-disable-next-line no-restricted-syntax -- Worker has no dateService; timezone-safe via Intl
        const currentIso = new Date().toISOString();
        const localTimeStr = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: timezone,
          // eslint-disable-next-line no-restricted-syntax -- Worker has no dateService; timezone-safe via Intl
        }).format(new Date());
        const userMessage = `=== TIME ===
Current time (UTC): ${currentIso}
Current local time: ${localTimeStr} (${timezone})
Current hour: ${currentHour}:00
Timezone: ${timezone}
Do NOT schedule any task before the current time.
Past blocks are unavailable.

=== CALENDAR ===
${calendarContext}

=== CAPACITY ===
${blockContext}

=== TASKS (${tasksToAssign.length} to schedule) ===
${taskList}

Each task includes:
- id, title
- total_minutes (includes prep/cooldown, use for capacity math)
- energy: deep_focus | administrative | physical | social | quick
- type: todo | habit
- tags: topical labels (work, health, finance, creative, etc.)
- prefers: time_window_preference if set
- due: due date if set
- priority: priority level if set
- space: which life domain this belongs to
- locked (boolean) — true if the user has committed to completing this task today. Prioritize scheduling these.
${expandedContext}
${plannerProjection ? '\n' + plannerProjection + '\n' : ''}
Schedule these tasks now. Respond with ONLY valid JSON.`;

        // === API Call ===
        const apiKey = env.GOOGLE_API_KEY;
        if (!apiKey) {
          console.log('[organize-day] GOOGLE_API_KEY not configured');
          return j({ error: 'google_key_not_configured' }, 500);
        }

        const t0 = Date.now();

        try {
          const geminiResult = await geminiGenerate(
            ORGANIZE_SYSTEM_PROMPT,
            [{ role: 'user', content: userMessage }],
            {
              temperature: 0.2,
              maxOutputTokens: 8192,
              thinkingLevel: 'low',
            },
            env.GOOGLE_API_KEY,
          );

          const latency = Date.now() - t0;

          if (!geminiResult.ok) {
            console.log('[organize-day] Gemini API error', {
              status: geminiResult.status,
              latency_ms: latency,
              error: (geminiResult.error || '').substring(0, 300),
            });
            return j(
              {
                error: 'organize_failed',
                detail: (geminiResult.error || '').substring(0, 200),
                assignments: [],
                overflow: tasksToAssign.map((t) => ({ taskId: t.id, reason: 'AI unavailable' })),
                reasoning: [],
                summary: "Couldn't organize automatically. Tasks left flexible.",
                latency_ms: latency,
              },
              200,
            );
          }

          const rawContent = geminiResult.content;

          const usage = geminiResult.usage;
          console.log('[organize-day] Gemini usage', {
            prompt_tokens: usage.promptTokenCount,
            completion_tokens: usage.candidatesTokenCount,
            latency_ms: latency,
          });

          let parsed = safeParseJson(rawContent);

          if (!parsed) {
            console.log('[organize-day] Parse failed', { preview: rawContent.substring(0, 200) });
            return j(
              {
                error: 'parse_failed',
                assignments: [],
                overflow: tasksToAssign.map((t) => ({ taskId: t.id, reason: 'Parse error' })),
                reasoning: [],
                summary: "Couldn't parse response. Tasks left flexible.",
                latency_ms: latency,
              },
              200,
            );
          }

          // === Validate and extract ===
          const validBlocks = ['morning', 'day', 'evening'];
          const taskIds = new Set(tasksToAssign.map((t) => t.id));
          const assignedIds = new Set();

          // Normalize block names — AI may output "afternoon" instead of "day"
          const normalizeBlock = (block) => {
            if (!block) return block;
            const lower = block.toLowerCase().trim();
            if (lower === 'afternoon' || lower === 'day') return 'day';
            if (lower === 'morning') return 'morning';
            if (lower === 'evening' || lower === 'night') return 'evening';
            return block;
          };

          const assignments = (Array.isArray(parsed.assignments) ? parsed.assignments : [])
            .map((a) => ({ ...a, block: normalizeBlock(a.block) }))
            .filter((a) => {
              if (!taskIds.has(a.taskId)) return false;
              if (!validBlocks.includes(a.block)) return false;
              if (assignedIds.has(a.taskId)) return false;
              assignedIds.add(a.taskId);
              return true;
            })
            .map((a) => {
              const result = {
                taskId: a.taskId,
                block: a.block,
                reason: String(a.reason || '').substring(0, 80),
              };
              if (a.scheduledStartIso) {
                const iso = String(a.scheduledStartIso);
                const parsed_date = new Date(iso);
                if (!isNaN(parsed_date.getTime())) {
                  // Drop scheduledStartIso if it's in the past
                  if (parsed_date.getTime() > Date.now()) {
                    result.scheduledStartIso = iso;
                  } else {
                    console.log('[organize-day] Dropped past scheduledStartIso', {
                      taskId: a.taskId,
                      iso,
                    });
                  }
                } else {
                  console.log('[organize-day] Invalid scheduledStartIso', {
                    taskId: a.taskId,
                    iso,
                  });
                }
              } else {
                console.log('[organize-day] Missing scheduledStartIso', { taskId: a.taskId });
              }
              return result;
            });

          const overflowIds = new Set();
          const overflow = (Array.isArray(parsed.overflow) ? parsed.overflow : [])
            .filter((o) => {
              if (!taskIds.has(o.taskId)) return false;
              if (assignedIds.has(o.taskId)) return false;
              if (overflowIds.has(o.taskId)) return false;
              overflowIds.add(o.taskId);
              return true;
            })
            .map((o) => ({
              taskId: o.taskId,
              reason: String(o.reason || '').substring(0, 80),
            }));

          // Catch any unaccounted tasks
          for (const task of tasksToAssign) {
            if (!assignedIds.has(task.id) && !overflowIds.has(task.id)) {
              overflow.push({ taskId: task.id, reason: 'Not assigned' });
            }
          }

          const summary =
            typeof parsed.summary === 'string' && parsed.summary.length > 0
              ? parsed.summary.substring(0, 200)
              : `Scheduled ${assignments.length} of ${tasksToAssign.length} tasks.`;

          const reasoning = Array.isArray(parsed.reasoning)
            ? parsed.reasoning.map((r) => String(r).substring(0, 200)).slice(0, 5)
            : [];

          console.log('[organize-day] Success', {
            assigned: assignments.length,
            overflow: overflow.length,
            total_tasks: tasksToAssign.length,
            latency_ms: latency,
          });

          return j({
            assignments,
            overflow,
            reasoning,
            summary,
            latency_ms: latency,
            _debug: {
              model: models().chat,
              prompt_tokens: usage.promptTokenCount,
              completion_tokens: usage.candidatesTokenCount,
            },
          });
        } catch (err) {
          const latency = Date.now() - t0;
          if (err.name === 'AbortError') {
            console.log('[organize-day] Request timed out', { latency_ms: latency });
            return j(
              {
                error: 'timeout',
                assignments: [],
                overflow: tasksToAssign.map((t) => ({ taskId: t.id, reason: 'Timed out' })),
                reasoning: [],
                summary: 'Took too long — tasks left flexible.',
                latency_ms: latency,
              },
              200,
            );
          }
          console.log('[organize-day] Error', { error: String(err), latency_ms: latency });
          return j(
            {
              error: 'organize_failed',
              detail: String(err),
              assignments: [],
              overflow: tasksToAssign.map((t) => ({ taskId: t.id, reason: 'Request failed' })),
              reasoning: [],
              summary: 'Request failed. Tasks left flexible.',
              latency_ms: latency,
            },
            200,
          );
        }
      }

      // =========================
      // === FORGET EVERYTHING ===
      // On What Gremly knows, after they said yes: Gremly forgets what he
      // learned about the signed in person (context/forget.js).
      // =========================
      if (type === 'forget-me') {
        try {
          const forgotten = await forgetPerson(env, authenticatedUserId);
          return j({ ok: true, forgotten });
        } catch (err) {
          console.error('[forget-me] failed:', err);
          return j({ error: 'could not forget' }, 500);
        }
      }

      // =========================
      // === NOT RIGHT (context pipeline) ===
      // The person marked something Gremly wrote about their life as wrong: a
      // line in the brief, a World or Chapter card, their story, an answer to
      // one of Gremly's questions. Their words go to the context pipeline,
      // which applies the correction everywhere straight away.
      // =========================
      if (type === 'not-right') {
        const said = String(body.said || '')
          .trim()
          .slice(0, 2000);
        const surface = ['not_right', 'brief', 'question'].includes(body.surface)
          ? body.surface
          : 'not_right';
        if (!said && !body.target_text && !body.kind)
          return j({ error: 'said, target_text or kind is required' }, 400);
        if (!env.INNGEST_WORKER_URL || !env.INNGEST_ADMIN_KEY)
          return j({ error: 'not configured' }, 503);
        const res = await fetchInngestWorker(env, '/api/correction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': env.INNGEST_ADMIN_KEY },
          body: JSON.stringify({
            user_id: authenticatedUserId,
            said:
              said ||
              (body.target_text
                ? `This is not right: ${String(body.target_text).slice(0, 500)}`
                : 'Not right'),
            surface,
            target_kind:
              typeof body.target_kind === 'string' ? body.target_kind.slice(0, 40) : null,
            target_text: body.target_text ? String(body.target_text).slice(0, 1000) : null,
            target_id: typeof body.target_id === 'string' ? body.target_id.slice(0, 64) : null,
            // Not right sheet choice (wrong, changed, done, private); answers send surface 'question' and the question id.
            kind: ['wrong', 'changed', 'done', 'private'].includes(body.kind) ? body.kind : null,
            // Some of them on a tidy up: the facts they ticked, by id (data fabric stage 4f)
            pick: Array.isArray(body.pick)
              ? body.pick
                  .filter((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
                  .slice(0, 50)
              : undefined,
          }),
        }).catch(() => null);
        if (!res?.ok) return j({ error: 'could not send the correction' }, 502);
        return j(await res.json().catch(() => ({ ok: true })));
      }

      // =========================
      // === WORLDS AND CHAPTERS (data fabric stage 4b) ===
      // chapter-memory: the Worlds build asks for a Chapter's memory as the
      // person closes it, and shows what comes back.
      // worlds-changed: the person renamed, moved, merged, closed or reopened
      // a World or a Chapter, or changed its dates. Chat's cache is cleared
      // here, so the next message knows, and fresh words are asked for.
      // =========================
      if (type === 'chapter-memory' || type === 'worlds-changed') {
        const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
        const table = type === 'chapter-memory' ? 'chapters' : body.table;
        if (!id || !['worlds', 'chapters'].includes(table))
          return j({ error: 'id and table are required' }, 400);
        if (!env.INNGEST_WORKER_URL || !env.INNGEST_ADMIN_KEY)
          return j({ error: 'not configured' }, 503);
        if (type === 'worlds-changed') await invalidateChatCache(env, authenticatedUserId);
        const res = await fetchInngestWorker(
          env,
          type === 'chapter-memory' ? '/api/chapter-memory' : '/api/words-fresh',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': env.INNGEST_ADMIN_KEY },
            body: JSON.stringify(
              type === 'chapter-memory'
                ? { user_id: authenticatedUserId, chapter_id: id }
                : { user_id: authenticatedUserId, table, id },
            ),
          },
        ).catch(() => null);
        if (!res) return j({ error: 'could not reach the pipeline' }, 502);
        return j(await res.json().catch(() => ({ error: 'bad reply' })), res.ok ? 200 : res.status);
      }

      // =========================
      // === THE PEOPLE PAGE (Worlds rebuild, stage 5) ===
      // person-merge: two records Gremly proposed as one person, made one or
      // kept apart by their tap, or put back with Undo.
      // person-page: the page Gremly keeps about someone in their life, the
      // labels on their dates and the things to remember, written again when
      // what it rests on has changed and returned as it stands.
      // =========================
      if (type === 'person-merge' || type === 'person-page') {
        const uuid = (v) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
        const forward =
          type === 'person-merge'
            ? ['merge', 'decline', 'undo'].includes(body.act) && uuid(body.merge_id)
              ? { user_id: authenticatedUserId, merge_id: body.merge_id, act: body.act }
              : null
            : uuid(body.person_id)
              ? { user_id: authenticatedUserId, person_id: body.person_id }
              : null;
        if (!forward)
          return j(
            {
              error:
                type === 'person-merge' ? 'merge_id and act are required' : 'person_id is required',
            },
            400,
          );
        if (!env.INNGEST_WORKER_URL || !env.INNGEST_ADMIN_KEY)
          return j({ error: 'not configured' }, 503);
        const res = await fetchInngestWorker(
          env,
          type === 'person-merge' ? '/api/person-merge' : '/api/person-page',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': env.INNGEST_ADMIN_KEY },
            body: JSON.stringify(forward),
          },
        ).catch(() => null);
        if (!res) return j({ error: 'could not reach the pipeline' }, 502);
        return j(await res.json().catch(() => ({ error: 'bad reply' })), res.ok ? 200 : res.status);
      }

      // chapter-said-no: a Chapter Gremly offered in chat that they said no to
      // (Worlds rebuild, stage 2), kept so it is never offered again
      if (type === 'chapter-said-no') {
        return j(await rememberChapterNo(env, authenticatedUserId, body.chapters));
      }

      // chapter-guess: Gremly fills in a Chapter started by hand from its one
      // line (Worlds rebuild, stage 3); nothing is made until they start it
      if (type === 'chapter-guess') {
        return j(
          await guessChapter(env, authenticatedUserId, {
            line: body.line,
            // their day, which the app sends; the guess falls back to today in UTC
            today: body.today,
          }),
        );
      }

      // =========================
      // === DAILY BRIEF IN CHAT ===
      // The app's first open when no brief was written for today, or a later
      // first open that needs a fresh brief for this part of the day (once a
      // day). The brief is written by inngest-jobs, beside the DCO.
      // =========================
      if (type === 'daily-brief') {
        if (!env.INNGEST_WORKER_URL || !env.INNGEST_ADMIN_KEY)
          return j({ error: 'not configured' }, 503);
        const res = await fetchInngestWorker(env, '/api/daily-brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': env.INNGEST_ADMIN_KEY },
          body: JSON.stringify({
            user_id: authenticatedUserId,
            reason: body.reason === 'rewrite' ? 'rewrite' : 'first_open',
          }),
        }).catch(() => null);
        if (!res) return j({ error: 'could not reach the brief writer' }, 502);
        return j(await res.json().catch(() => ({ error: 'bad reply' })), res.ok ? 200 : 502);
      }

      // =========================
      // === NOTIFICATION LAB (testers) ===
      // "Send now" in the Lab: a real send through the real sender to the
      // tester's own phones. inngest-jobs checks the tester flag.
      // =========================
      if (type === 'notification-test') {
        if (!env.INNGEST_WORKER_URL || !env.INNGEST_ADMIN_KEY)
          return j({ error: 'not configured' }, 503);
        const res = await fetchInngestWorker(env, '/api/notifications/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': env.INNGEST_ADMIN_KEY },
          body: JSON.stringify({
            user_id: authenticatedUserId,
            moment: typeof body.moment === 'string' ? body.moment.slice(0, 20) : 'brief',
            words:
              body.words && typeof body.words.body === 'string'
                ? {
                    title: String(body.words.title || '').slice(0, 60),
                    body: body.words.body.slice(0, 200),
                  }
                : null,
          }),
        }).catch(() => null);
        if (!res) return j({ error: 'could not reach the notifications worker' }, 502);
        return j(await res.json().catch(() => ({ error: 'bad reply' })), res.ok ? 200 : res.status);
      }

      // =========================
      // === PLAN PICK (Daily brief in Chat) ===
      // Plan my day / afternoon / evening, and changes typed while a plan is
      // open. The app sends today's candidates (a data rule) and places the
      // picks itself; inngest-jobs chooses and words them.
      // =========================
      if (type === 'plan-pick') {
        if (!env.INNGEST_WORKER_URL || !env.INNGEST_ADMIN_KEY)
          return j({ error: 'not configured' }, 503);
        const res = await fetchInngestWorker(env, '/api/plan-pick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': env.INNGEST_ADMIN_KEY },
          body: JSON.stringify({
            user_id: authenticatedUserId,
            mode: body.mode === 'edit' ? 'edit' : 'pick',
            now: body.now,
            gap_from: body.gap_from,
            pool: Array.isArray(body.pool) ? body.pool.slice(0, 40) : [],
            meetings: Array.isArray(body.meetings) ? body.meetings.slice(0, 40) : [],
            live_plan: Array.isArray(body.live_plan) ? body.live_plan.slice(0, 40) : [],
            // the day record: set times, travel and where planning stops
            fixed: Array.isArray(body.fixed) ? body.fixed.slice(0, 20) : [],
            travel: body.travel && typeof body.travel === 'object' ? body.travel : null,
            plan_end: body.plan_end ?? null,
            text: typeof body.text === 'string' ? body.text.slice(0, 500) : '',
            for_day:
              typeof body.for_day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.for_day)
                ? body.for_day
                : null,
          }),
        }).catch(() => null);
        if (!res) return j({ error: 'could not reach the plan picker' }, 502);
        return j(await res.json().catch(() => ({ error: 'bad reply' })), res.ok ? 200 : 502);
      }

      // =========================
      // === DAY TURN (Daily brief in Chat) ===
      // A message typed in today's thread: inngest-jobs reads it against the
      // day record, the plan and the person's items, and returns one change
      // set for the app's change card (or says it is not about the day).
      // =========================
      if (type === 'day-turn') {
        if (!env.INNGEST_WORKER_URL || !env.INNGEST_ADMIN_KEY)
          return j({ error: 'not configured' }, 503);
        const res = await askDayTurn(env, authenticatedUserId, body);
        if (!res) return j({ error: 'could not reach the day turn' }, 502);
        return j(await res.json().catch(() => ({ error: 'bad reply' })), res.ok ? 200 : 502);
      }

      // Today's thread on the agent (agent plan step 7): status lines while it
      // works, then the reply and the card, as server-sent events. With
      // AGENT_BRIEF off, or when the agent cannot finish, the day turn answers.
      if (type === 'brief-turn') {
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) return denyAccessSSEResponse(access.reason);
        return briefTurnResponse({
          env,
          userId: authenticatedUserId,
          body,
          useAgent: models().flags.agentBrief,
          dayTurn: async (b) => {
            if (!env.INNGEST_WORKER_URL || !env.INNGEST_ADMIN_KEY) return null;
            const res = await askDayTurn(env, authenticatedUserId, b);
            return res && res.ok ? res.json().catch(() => null) : null;
          },
          waitUntil: (p) => ctx.waitUntil(p),
        });
      }

      // =========================
      // === WEEKLY REVIEW: THE READ ===
      // The app opens the weekly review: inngest-jobs hands back the read the
      // week's row holds when it serves a review started today, and makes one
      // there and then when it does not (most of a minute, behind the app's
      // loading screen). Which review today gives is worked out there, from
      // dates and the row alone. The answer goes back as server-sent events,
      // with pings while the read is made (weekRead.js).
      // =========================
      if (type === 'week-read') {
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) return denyAccessSSEResponse(access.reason);
        if (!env.INNGEST_WORKER_URL || !env.INNGEST_ADMIN_KEY)
          return j({ error: 'not configured' }, 503);
        return weekReadResponse({
          ask: () =>
            fetchInngestWorker(env, '/api/week-read', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-admin-key': env.INNGEST_ADMIN_KEY,
              },
              body: JSON.stringify({
                user_id: authenticatedUserId,
                // the app's day; inngest-jobs takes it when it is a real day near the person's own
                date: typeof body.date === 'string' ? body.date.slice(0, 10) : null,
                // the first day it plans from: tomorrow for a review opened in the evening
                first: typeof body.first === 'string' ? body.first.slice(0, 10) : null,
              }),
            }).catch((err) => {
              console.error('[WeekRead] could not reach inngest-jobs', err?.message || err);
              return null;
            }),
          waitUntil: (p) => ctx.waitUntil(p),
        });
      }

      // =========================
      // === THE WEEKLY REVIEW'S SPREAD ===
      // Once they have answered the review, Gremly spreads their todos across
      // the days being planned (inngest-jobs week/spread.js, about twenty
      // seconds). Their own moves on the board are not saved until they finish,
      // so they ride with the request and nothing they placed is moved. The
      // answer goes back the way the read's does, with pings while it is made.
      // =========================
      if (type === 'week-spread') {
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) return denyAccessSSEResponse(access.reason);
        if (!env.INNGEST_WORKER_URL || !env.INNGEST_ADMIN_KEY)
          return j({ error: 'not configured' }, 503);
        return weekReadResponse({
          what: "the week's spread",
          answer: (data) => ({ on: data.on, spread: data.spread }),
          ask: () =>
            fetchInngestWorker(env, '/api/week-spread', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-admin-key': env.INNGEST_ADMIN_KEY,
              },
              body: JSON.stringify({
                user_id: authenticatedUserId,
                date: typeof body.date === 'string' ? body.date.slice(0, 10) : null,
                // the first day being planned as the app's board has it
                first: typeof body.first === 'string' ? body.first.slice(0, 10) : null,
                // ids and days only; inngest-jobs reads it again and leaves out anything else
                board: body.board && typeof body.board === 'object' ? body.board : null,
              }),
            }).catch((err) => {
              console.error('[WeekSpread] could not reach inngest-jobs', err?.message || err);
              return null;
            }),
          waitUntil: (p) => ctx.waitUntil(p),
        });
      }

      // =========================
      // === WEEKLY SUMMARY (v1.0) ===
      // =========================
      if (type === 'weekly-summary') {
        const rl = await checkIpRateLimit(request, env, 'misc', 30);
        if (!rl.allowed) return rateLimitResponse('misc', rl.count, rl.limit);

        const t0 = Date.now();
        const { payload, trendContext } = body;

        if (!payload) {
          console.log('[weekly-summary] Missing payload');
          return j({ error: 'missing_payload' }, 400);
        }

        try {
          // Build user message with all collected data
          const userMessage = `Here is my week's data:\n\n${JSON.stringify(payload, null, 2)}${
            trendContext
              ? `\n\nTrend context from prior weeks:\n${JSON.stringify(trendContext, null, 2)}`
              : ''
          }`;

          // Use Anthropic API with Claude Sonnet 4.5
          const anthropicKey = env.ANTHROPIC_API_KEY;
          if (!anthropicKey) {
            console.log('[weekly-summary] ANTHROPIC_API_KEY not configured');
            return j({ error: 'anthropic_key_not_configured' }, 500);
          }

          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: models().weeklySummary,
              max_tokens: 2000,
              system: WEEKLY_SUMMARY_SYSTEM_PROMPT,
              messages: [{ role: 'user', content: userMessage }],
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            const latency = Date.now() - t0;
            console.log('[weekly-summary] Anthropic API error', {
              status: res.status,
              latency_ms: latency,
            });
            return j({ error: 'anthropic_api_error', detail: errText }, 502);
          }

          const anthropicResponse = await res.json();
          const rawText = anthropicResponse.content?.[0]?.text || '';

          // Parse JSON from response
          const parsed = safeParseJson(rawText);
          if (!parsed) {
            const latency = Date.now() - t0;
            console.log('[weekly-summary] Failed to parse AI response', {
              latency_ms: latency,
              rawLength: rawText.length,
            });
            return j({ error: 'parse_failed', raw: rawText.slice(0, 500) }, 500);
          }

          // Validate required top-level fields
          if (
            !parsed.weeklyCommentary ||
            !parsed.highlightMoment ||
            !parsed.insights ||
            !parsed.weekAhead
          ) {
            const latency = Date.now() - t0;
            console.log('[weekly-summary] Incomplete AI response', {
              latency_ms: latency,
              keys: Object.keys(parsed),
            });
            return j({ error: 'incomplete_response', parsed }, 500);
          }

          // Ensure insights is an array and has valid types
          if (!Array.isArray(parsed.insights)) {
            parsed.insights = [];
          }

          // Ensure weekAhead has required structure
          if (!parsed.weekAhead.highlights) parsed.weekAhead.highlights = [];
          if (!parsed.weekAhead.busyDayWarnings) parsed.weekAhead.busyDayWarnings = [];
          if (typeof parsed.weekAhead.totalEventCount !== 'number')
            parsed.weekAhead.totalEventCount = 0;

          // Ensure keyThemes and mood have defaults
          if (!Array.isArray(parsed.keyThemes)) parsed.keyThemes = [];
          if (!parsed.mood) parsed.mood = 'steady';

          const latency = Date.now() - t0;
          console.log('[weekly-summary] Success', {
            latency_ms: latency,
            insights: parsed.insights.length,
            themes: parsed.keyThemes.length,
            mood: parsed.mood,
            upcomingHighlights: parsed.weekAhead.highlights.length,
          });

          return j(parsed);
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[weekly-summary] Error', { error: String(err), latency_ms: latency });
          return j({ error: 'request_failed', detail: String(err) }, 500);
        }
      }

      // =========================
      // === CHAT FULL SUMMARY ===
      // Generate a comprehensive summary from ALL chat messages at save time
      // =========================
      if (type === 'chat-full-summary') {
        const rl = await checkIpRateLimit(request, env, 'misc', 30);
        if (!rl.allowed) return rateLimitResponse('misc', rl.count, rl.limit);

        const chatId = body.chatId;
        if (!chatId) return j({ error: 'missing_chatId' }, 400);

        try {
          const msgRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/scope_chat_messages?chat_id=eq.${encodeURIComponent(chatId)}&select=role,content&order=created_at.asc`,
            {
              headers: {
                apikey: env.SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              },
            },
          );
          if (!msgRes.ok) {
            console.warn(`[ChatFullSummary] Failed to fetch messages: ${msgRes.status}`);
            return j({ error: 'fetch_failed' }, 500);
          }

          const allMessages = await msgRes.json();
          const userMessages = allMessages.filter((m) => m.role !== 'system');

          if (userMessages.length === 0) {
            return j({ summary: null });
          }

          const conversationText = userMessages
            .map(
              (m) => `${m.role === 'user' ? 'User' : 'Gremly'}: ${(m.content || '').slice(0, 600)}`,
            )
            .join('\n\n');

          const todayStr = new Intl.DateTimeFormat('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: userTimezone,
          }).format(new Date());

          const summaryPrompt = `Today is ${todayStr}. Summarize this entire conversation in 3-6 sentences. Cover ALL major topics discussed from start to finish — not just the beginning or the end. Include specific names, dates, decisions, recommendations, and action items mentioned. Write as a factual note the user can reference later.

CONVERSATION:
${conversationText}

SUMMARY:`;

          const res = await helperFetch('chat_full_summary', {
            messages: [{ role: 'user', content: summaryPrompt }],
            max_tokens: 400,
            temperature: 0.3,
          });

          if (!res.ok) {
            console.warn(`[ChatFullSummary] OpenAI call failed: ${res.status}`);
            return j({ error: 'openai_failed' }, 500);
          }

          const data = await res.json();
          const summary = (data.choices?.[0]?.message?.content || '').trim();
          console.log(`[ChatFullSummary] Generated ${summary.length} chars for chat ${chatId}`);
          return j({ summary: summary || null });
        } catch (err) {
          console.warn(`[ChatFullSummary] Error: ${err.message}`);
          return j({ error: 'request_failed', detail: String(err) }, 500);
        }
      }

      // =========================
      // === TRANSCRIPTION ===
      // Voice-to-text via OpenAI Whisper
      // =========================
      if (type === 'transcribe') {
        const rl = await checkIpRateLimit(request, env, 'transcribe', 20);
        if (!rl.allowed) return rateLimitResponse('transcribe', rl.count, rl.limit);

        const audio = body.audio;
        const format = body.format || 'm4a';

        if (!audio) {
          console.log('[Transcribe] Missing audio data');
          return j({ error: 'missing_audio' }, 400);
        }

        // Validate audio size (25MB limit for Whisper)
        const estimatedBytes = (audio.length * 3) / 4;
        if (estimatedBytes > 25 * 1024 * 1024) {
          console.log('[Transcribe] Audio too large', {
            size_mb: Math.round(estimatedBytes / 1024 / 1024),
          });
          return j({ error: 'audio_too_large', max_mb: 25 }, 400);
        }

        // Supported formats
        const supportedFormats = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'];
        const normalizedFormat = format.toLowerCase().replace('.', '');
        if (!supportedFormats.includes(normalizedFormat)) {
          console.log('[Transcribe] Unsupported format', { format });
          return j({ error: 'unsupported_format', supported: supportedFormats }, 400);
        }

        const t0 = Date.now();

        try {
          // Convert base64 to binary
          const binaryString = atob(audio);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // Create form data for Whisper API
          const formData = new FormData();
          formData.append(
            'file',
            new Blob([bytes], { type: `audio/${normalizedFormat}` }),
            `audio.${normalizedFormat}`,
          );
          formData.append('model', 'whisper-1');
          formData.append('response_format', 'json');

          console.log('[Transcribe] Calling Whisper API', {
            size_kb: Math.round(bytes.length / 1024),
            format: normalizedFormat,
          });

          const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
            },
            body: formData,
          });

          const latency = Date.now() - t0;

          if (!whisperRes.ok) {
            const errText = await whisperRes.text().catch(() => '');
            console.log('[Transcribe] Whisper API error', {
              status: whisperRes.status,
              error: errText,
              latency_ms: latency,
            });
            return j(
              {
                error: 'transcription_failed',
                status: whisperRes.status,
                detail: errText,
              },
              200,
            );
          }

          const result = await whisperRes.json();
          const text = result.text || '';

          console.log('[Transcribe] Success', {
            text_length: text.length,
            text_preview: text.substring(0, 50),
            latency_ms: latency,
          });

          return j({
            text,
            duration: result.duration,
            language: result.language || 'en',
            latency_ms: latency,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[Transcribe] Error', {
            error: String(err),
            latency_ms: latency,
          });
          return j(
            {
              error: 'transcription_error',
              detail: String(err?.message || 'unknown'),
            },
            200,
          );
        }
      }

      // =========================
      // === SWEEP HEADLINE: DCO-aware celebration one-liner ===
      // =========================
      if (type === 'sweep-headline') {
        const rl = await checkIpRateLimit(request, env, 'misc', 30);
        if (!rl.allowed) return rateLimitResponse('misc', rl.count, rl.limit);

        const {
          tone,
          lifeMoment,
          todosCompleted,
          habitsCompleted,
          eventsCompleted,
          dropsCaptured,
        } = body;

        const systemPrompt = `You generate a single short celebration line for a productivity app's evening review screen. The line acknowledges what the user accomplished today within the context of their current life situation.

Rules:
- Maximum 8 words. Aim for 4-6.
- No exclamation marks. No emoji.
- No generic phrases like "Great job!" or "Nice work today!" or "Keep it up!"
- Warm, slightly cheeky. Like a friend who knows your situation.
- Reference the life context naturally if it adds specificity.
- If the user is relaxed/on vacation with low activity, acknowledge that's intentional and fine.
- Output ONLY the headline text, nothing else.

Examples of good output:
- "Bora Bora pace. Light one today."
- "Big pitch week. You showed up."
- "Slow day. That counts too."
- "Three meetings down. Evening's yours."
- "Wedding crunch mode. Solid progress."`;

        const userContent = `Tone: ${tone || 'focused'}
Life context: ${lifeMoment || 'none'}
Completed: ${todosCompleted || 0} todos, ${habitsCompleted || 0} habits, ${eventsCompleted || 0} events, ${dropsCaptured || 0} drops`;

        try {
          const response = await helperFetch('sweep_headline', {
            temperature: 0.6,
            max_tokens: 30,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
          });

          if (!response.ok) {
            return j({ headline: null, error: 'nano_failed' });
          }

          const data = await response.json();
          const headline = data.choices?.[0]?.message?.content?.trim() || null;
          return j({ headline });
        } catch (err) {
          console.error('[SweepHeadline] Error:', err);
          return j({ headline: null, error: 'exception' });
        }
      }

      // =========================
      // === PRE-PHASE: SEMANTIC PARSE (v1.0) ===
      // Extracts linguistic facts WITHOUT classifying
      // =========================
      if (type === 'classify-preparse') {
        const rl = await checkIpRateLimit(request, env, 'classify', 60);
        if (!rl.allowed) return rateLimitResponse('classify', rl.count, rl.limit);

        const text = body.text || '';

        if (!text.trim()) {
          return j(
            {
              error: 'missing_text',
              detail: 'text field is required',
            },
            400,
          );
        }

        const preparseResult = await runPreparse(text, env);

        if (!preparseResult.success) {
          return j({ error: 'preparse_failed', latency_ms: preparseResult.latency_ms });
        }

        return j({
          ...preparseResult.result,
          latency_ms: preparseResult.latency_ms,
        });
      }

      // =========================
      // === PHASE 1 v2: UNIFIED CLASSIFICATION (preparse → heuristic → optional AI) ===
      // Runs preparse, applies heuristics, falls back to Phase 1 AI if needed
      // =========================
      if (type === 'classify-phase1-v2') {
        const rl = await checkIpRateLimit(request, env, 'classify', 60);
        if (!rl.allowed) return rateLimitResponse('classify', rl.count, rl.limit);

        const text = body.text || '';
        const hasAttachments = body.hasAttachments || false;
        const t0 = Date.now();

        if (!text.trim()) {
          return j(
            {
              error: 'missing_text',
              detail: 'text field is required',
            },
            400,
          );
        }

        // Step 1: Run preparse
        const preparseResult = await runPreparse(text, env);
        const preparseLatency = preparseResult.latency_ms;

        if (!preparseResult.success) {
          // Preparse failed - fall through to Phase 1 AI
          console.log('[Phase1v2] Preparse failed, falling back to Phase 1', {
            error: preparseResult.error,
            preparse_latency_ms: preparseLatency,
          });

          // (A self-fetch to classify-phase1 used to run here and its result was
          // thrown away: a full extra classification on every preparse failure,
          // added to the user's wait. Removed; return the fallback directly.)
          return j({
            bucket: 'log',
            subtype: 'general',
            habitSubtype: null,
            confidence: 0.5,
            source: 'preparse-fallback',
            is_multi: false,
            preparse_latency_ms: preparseLatency,
            heuristic_reason: 'preparse_failed',
            latency_ms: Date.now() - t0,
          });
        }

        // Log all pre-phase field values
        console.log('[Phase1v2] PreParse result', {
          text_preview: text.substring(0, 50),
          // Derived backward-compatible fields
          core_verb: preparseResult.result.core_verb,
          action_target: preparseResult.result.action_target,
          parse_confidence: preparseResult.result.parse_confidence,
          frame_type: preparseResult.result.frame_type,
          verb_position: preparseResult.result.verb_position,
          frequency_type: preparseResult.result.frequency_type,
          frequency_present: preparseResult.result.frequency_present,
          is_noun_phrase_only: preparseResult.result.is_noun_phrase_only,
          is_self_restriction: preparseResult.result.is_self_restriction,
          has_occasion_noun: preparseResult.result.has_occasion_noun,
          has_implied_recurrence: preparseResult.result.has_implied_recurrence,
          emotional_content: preparseResult.result.emotional_content,
          uncertainty_present: preparseResult.result.uncertainty_present,
          obligation_framing: preparseResult.result.obligation_framing,
          factual_statement: preparseResult.result.factual_statement,
          self_reflection: preparseResult.result.self_reflection,
          direction_without_schedule: preparseResult.result.direction_without_schedule,
          // Atomic observations
          is_command: preparseResult.result.is_command,
          is_declarative: preparseResult.result.is_declarative,
          has_speculation: preparseResult.result.has_speculation,
          is_past_or_present: preparseResult.result.is_past_or_present,
          is_narrative_reflection: preparseResult.result.is_narrative_reflection,
          is_scheduled_occurrence: preparseResult.result.is_scheduled_occurrence,
          scheduled_reasoning: preparseResult.result.scheduled_reasoning,
          is_reference_detail: preparseResult.result.is_reference_detail,
          reference_reasoning: preparseResult.result.reference_reasoning,
          has_emotion_language: preparseResult.result.has_emotion_language,
          emotion_reasoning: preparseResult.result.emotion_reasoning,
          is_about_feelings_not_actions: preparseResult.result.is_about_feelings_not_actions,
          feelings_reasoning: preparseResult.result.feelings_reasoning,
          has_date_or_time: preparseResult.result.has_date_or_time,
          has_occurrence_count: preparseResult.result.has_occurrence_count,
          has_time_reference: preparseResult.result.has_time_reference,
          time_reference_binding: preparseResult.result.time_reference_binding,
          claims_all_instances: preparseResult.result.claims_all_instances,
          has_measurable_amount: preparseResult.result.has_measurable_amount,
          amount_bounded_by_period: preparseResult.result.amount_bounded_by_period,
          bounding_period_recurs: preparseResult.result.bounding_period_recurs,
          has_explicit_multiplicity: preparseResult.result.has_explicit_multiplicity,
          user_is_agent: preparseResult.result.user_is_agent,
          action_is_future: preparseResult.result.action_is_future,
          multiplicity_is_future_self: preparseResult.result.multiplicity_is_future_self,
          is_ongoing_practice: preparseResult.result.is_ongoing_practice,
          has_routine_anchor: preparseResult.result.has_routine_anchor,
          is_single_instance: preparseResult.result.is_single_instance,
          single_instance_reasoning: preparseResult.result.single_instance_reasoning,
          has_prohibition: preparseResult.result.has_prohibition,
          has_discontinuation: preparseResult.result.has_discontinuation,
          discontinuation_reasoning: preparseResult.result.discontinuation_reasoning,
          references_existing_pattern: preparseResult.result.references_existing_pattern,
          pattern_reasoning: preparseResult.result.pattern_reasoning,
          has_relative_change: preparseResult.result.has_relative_change,
          has_hedging: preparseResult.result.has_hedging,
          has_obligation: preparseResult.result.has_obligation,
          action_direction: preparseResult.result.action_direction,
          action_direction_reasoning: preparseResult.result.action_direction_reasoning,
          time_role: preparseResult.result.time_role,
          time_role_reasoning: preparseResult.result.time_role_reasoning,
          boundary_type: preparseResult.result.boundary_type,
          boundary_reasoning: preparseResult.result.boundary_reasoning,
          temporal_orientation: preparseResult.result.temporal_orientation,
          user_mode_record_or_change: preparseResult.result.user_mode_record_or_change,
          is_about_personal_patterns: preparseResult.result.is_about_personal_patterns,
          is_storing_information: preparseResult.result.is_storing_information,
          is_about_emotion: preparseResult.result.is_about_emotion,
          user_intent_mode: preparseResult.result.user_intent_mode,
          is_state_verb: preparseResult.result.is_state_verb,
          has_concrete_result: preparseResult.result.has_concrete_result,
          verb_has_completion: preparseResult.result.verb_has_completion,
          references_current_state: preparseResult.result.references_current_state,
          change_is_open_ended: preparseResult.result.change_is_open_ended,
          has_restriction_boundary: preparseResult.result.has_restriction_boundary,
          degree_shift_target: preparseResult.result.degree_shift_target,
          // Structural parse (mini)
          struct_verb: preparseResult.result.core_verb,
          struct_has_verb: preparseResult.result.has_verb,
          struct_object: preparseResult.result.struct_object,
          struct_modifier: preparseResult.result.struct_modifier,
          struct_modifier_target: preparseResult.result.struct_modifier_target,
          struct_time_reference: preparseResult.result.struct_time_reference,
          struct_time_binding: preparseResult.result.struct_time_binding,
          struct_verb_type: preparseResult.result.is_state_verb
            ? 'state'
            : preparseResult.result.has_verb
              ? 'action'
              : 'none',
          struct_intent_mode: preparseResult.result.user_intent_mode,
          struct_completion: preparseResult.result.struct_completion,
          struct_novelty: preparseResult.result.struct_novelty,
          latency_ms: preparseResult.latency_ms,
        });

        // Step 2: Apply heuristic mapping
        preparseResult.result.text_preview = (text || '').substring(0, 60);
        console.log('[Scorer:DateIntent]', {
          hasUserSelectedDate: body.hasUserSelectedDate || false,
        });
        const heuristicDecision = mapPreparseToClassification(preparseResult.result, {
          hasUserSelectedDate: body.hasUserSelectedDate || false,
        });
        const plausibleInterpretations = computePlausibleInterpretations(preparseResult.result);

        // Log heuristic decision
        console.log('[Phase1v2] Heuristic decision', {
          needsPhase1: heuristicDecision.needsPhase1,
          reason: heuristicDecision.reason || null,
          bucket: heuristicDecision.bucket || null,
          subtype: heuristicDecision.subtype || null,
        });

        // Step 3: If fast path, return immediately
        if (!heuristicDecision.needsPhase1) {
          const totalLatency = Date.now() - t0;

          console.log('[Phase1v2] Fast path', {
            bucket: heuristicDecision.bucket,
            subtype: heuristicDecision.subtype,
            habitSubtype: heuristicDecision.habitSubtype,
            frame_type: preparseResult.result.frame_type,
            core_verb: preparseResult.result.core_verb,
            preparse_latency_ms: preparseLatency,
            total_latency_ms: totalLatency,
          });

          return j({
            bucket: heuristicDecision.bucket,
            subtype: heuristicDecision.subtype,
            habitSubtype: heuristicDecision.habitSubtype,
            confidence: 0.85,
            source: 'heuristic',
            is_multi: false,
            is_ambiguous: false,
            preparse_latency_ms: preparseLatency,
            heuristic_reason: `fast_path:${preparseResult.result.frame_type}`,
            reminder_intent: preparseResult.result.reminder_intent || false,
            latency_ms: totalLatency,
          });
        }

        // Step 4: Need Phase 1 AI - use helper
        console.log('[Phase1v2] Needs Phase 1', {
          reason: heuristicDecision.reason,
          preparse_latency_ms: preparseLatency,
        });
        console.log('[Phase1:DateIntent]', {
          hasUserSelectedDate: body.hasUserSelectedDate || false,
        });

        const phase1Result = await runPhase1Classification(
          text,
          env,
          preparseResult.result,
          heuristicDecision.reason,
          heuristicDecision.scores || null,
          body.hasUserSelectedDate || false,
        );

        const phase1Latency = phase1Result.latency_ms;
        const totalLatency = Date.now() - t0;

        if (!phase1Result.success) {
          console.error('[Phase1v2] Phase 1 call failed', {
            error: phase1Result.error,
            preparse_latency_ms: preparseLatency,
            phase1_latency_ms: phase1Latency,
          });

          return j({
            bucket: 'log',
            subtype: 'general',
            habitSubtype: null,
            confidence: 0.5,
            source: 'phase1-error-fallback',
            is_multi: false,
            preparse_latency_ms: preparseLatency,
            phase1_latency_ms: phase1Latency,
            heuristic_reason: heuristicDecision.reason,
            reminder_intent: false,
            latency_ms: totalLatency,
          });
        }

        const result = phase1Result.result;

        console.log('[Phase1v2] Phase 1 complete', {
          bucket: result.bucket,
          subtype: result.subtype,
          confidence: result.confidence,
          heuristic_reason: heuristicDecision.reason,
          preparse_latency_ms: preparseLatency,
          phase1_latency_ms: phase1Latency,
          total_latency_ms: totalLatency,
        });

        return j({
          bucket: result.bucket,
          subtype: result.subtype,
          habitSubtype: result.habitSubtype,
          confidence: result.confidence,
          source: 'api',
          is_multi: result.is_multi || false,
          is_ambiguous: result.is_ambiguous,
          ambiguity_type: result.ambiguity_type,
          ambiguity_reason: result.ambiguity_reason,
          plausible_interpretations: result.is_ambiguous ? plausibleInterpretations : null,
          preparse_latency_ms: preparseLatency,
          phase1_latency_ms: phase1Latency,
          heuristic_reason: heuristicDecision.reason,
          reminder_intent: preparseResult.result.reminder_intent || false,
          latency_ms: totalLatency,
        });
      }

      // =========================
      // === PHASE 0: MULTI-ENTITY DETECTION (v6 - SINGLE MINI CALL) ===
      // One mini call handles both detection and extraction
      // =========================
      if (type === 'detect-multi') {
        const rl = await checkIpRateLimit(request, env, 'classify', 60);
        if (!rl.allowed) return rateLimitResponse('classify', rl.count, rl.limit);

        const text = body.text || '';
        const t0 = Date.now();

        const gatePrompt = `You are determining whether a text drop contains ONE trackable item or MULTIPLE independently trackable items.

Default to SINGLE. Only return "multiple" when items are genuinely independent.

SINGLE means the items share a causal, explanatory, contextual, or goal relationship. One item explains, motivates, responds to, or is a sub-step of the other. They belong together as one tracked thing.

Specific single-item patterns:
- A task accompanied by its reason, cause, or context
- An emotion paired with a coping response or reaction to that emotion
- Alternatives or options for the same underlying need
- A list of related items that form one errand, purchase, or activity
- Multiple emotions or feelings expressed together
- A habit or goal with planning details, schedule notes, or elaboration
- Sub-steps or prerequisites that serve a single outcome
- A reflection followed by further elaboration on the same thought

MULTIPLE means the items have no causal or contextual dependency. They happen to be mentioned together but would be tracked, completed, or resolved independently in different contexts at different times.

Specific multi-item patterns:
- Unrelated tasks with no shared cause or goal
- An emotion plus a task that has nothing to do with that emotion
- A one-time completable action alongside an ongoing recurring commitment
- Actions spanning completely different life domains with no bridging relationship

THE CORE TEST: Does one item explain, cause, depend on, or serve the same goal as the other? If yes → SINGLE. If they are merely co-located in the same message → MULTIPLE.

Return JSON only:
{
  "result": "single" | "multiple",
  "reasoning": "one sentence why"
}

If "multiple", also include segments:
{
  "result": "multiple",
  "reasoning": "one sentence why",
  "segments": [
    {"text": "exact user words for item 1", "context_from_rest": "brief note about what the other segments said"},
    {"text": "exact user words for item 2", "context_from_rest": "brief note about what the other segments said"}
  ]
}

Segment rules:
- Use the user's EXACT words — do not rephrase, add, or embellish
- Each segment must be understandable on its own — if a pronoun would dangle without its referent, include enough of the original wording to resolve it
- context_from_rest summarizes what the OTHER segments contain, so downstream processing has awareness of the full drop`;

        const gateResult = await aiClassify({
          mode: 'realtime',
          ...getProviders('mini', env),
          env,
          systemPrompt: gatePrompt,
          messages: [{ role: 'user', content: text.substring(0, 1000) }],
          temperature: 0.1,
          maxOutputTokens: 400,
          endpoint: 'detect-multi-gate',
        });

        const gate = gateResult.parsed || { result: 'single', segments: [] };

        console.log('[Phase0:Gate]', {
          result: gate.result,
          reasoning: gate.reasoning,
          segment_count: gate.segments?.length || 0,
        });

        if (gate.result !== 'multiple') {
          const latency = Date.now() - t0;
          console.log('[Phase0] SINGLE', { reason: gate.reasoning, latency_ms: latency });
          return j({
            is_multi: false,
            source: 'api',
            reason: gate.reasoning || 'single',
            latency_ms: latency,
          });
        }

        const segments = Array.isArray(gate.segments) ? gate.segments : [];

        const validatedSegments = segments
          .map((seg) => ({
            text: String(seg.text || '').trim(),
            context_from_rest: String(seg.context_from_rest || '').trim(),
            likely_bucket: ['todo', 'habit', 'log'].includes(seg.likely_bucket)
              ? seg.likely_bucket
              : 'todo',
          }))
          .filter((seg) => seg.text.length > 0);

        if (validatedSegments.length < 2) {
          const latency = Date.now() - t0;
          console.log('[Phase0] Extraction gave <2 segments, falling back to SINGLE', {
            latency_ms: latency,
          });
          return j({ is_multi: false, source: 'extraction-fallback', latency_ms: latency });
        }

        let summary = validatedSegments
          .map((s) => s.text.substring(0, 30))
          .slice(0, 3)
          .join(' + ');
        if (summary.length > 60) summary = summary.substring(0, 57) + '...';

        const bucketCounts = { todo: 0, habit: 0, log: 0 };
        validatedSegments.forEach((s) => bucketCounts[s.likely_bucket]++);
        const dominantBucket = Object.entries(bucketCounts).sort((a, b) => b[1] - a[1])[0][0];

        const latency = Date.now() - t0;
        console.log('[Phase0:Multi]', {
          reason: gate.reasoning,
          item_count: validatedSegments.length,
          summary,
          dominant_bucket: dominantBucket,
          latency_ms: latency,
        });

        return j({
          is_multi: true,
          confidence: 0.85,
          item_count: validatedSegments.length,
          segments: validatedSegments,
          summary,
          dominant_bucket: dominantBucket,
          dominant_subtype: dominantBucket === 'log' ? 'general' : null,
          source: 'api',
          reason: gate.reasoning,
          latency_ms: latency,
        });
      }

      // =========================
      // === MIND DROP: IS THIS DROP ABOUT SOMETHING THEY ALREADY HAVE? ===
      // Runs after the drop is classified. The model reads the user's live items
      // and says whether the drop repeats one, changes it, adds to it, finishes a
      // todo, logs a habit or cancels one (minddropRelate.js). It only proposes:
      // the app changes nothing until the user taps. Off unless
      // MINDDROP_RELATE_ENABLED = "true"; the app then files drops as before.
      // docs/minddrop-relate.md
      // =========================
      if (type === 'minddrop-relate') {
        // checked first, so a switched off step costs nothing per drop
        if (String(env.MINDDROP_RELATE_ENABLED || '').toLowerCase() !== 'true') {
          return j({ enabled: false, relation: null });
        }

        const rl = await checkIpRateLimit(request, env, 'relate', 60);
        if (!rl.allowed) return rateLimitResponse('relate', rl.count, rl.limit);

        const text = String(body.text || '').trim();
        if (!text) {
          return j({ error: 'missing_text', detail: 'text field is required' }, 400);
        }
        const todayIso = /^\d{4}-\d{2}-\d{2}$/.test(String(body.currentDate || ''))
          ? String(body.currentDate)
          : todayIsoIn(userTimezone);
        // Never throws; any failure or doubt comes back as no relation
        // a build that understands a todo's deadline says so (deadlines: true,
        // the Mind Drop rethink's final check); every other build is answered
        // exactly as before
        const { relation } = await relateDrop({
          env,
          userId: authenticatedUserId,
          text,
          todayIso,
          deadlines: body.deadlines === true,
        });
        return j({ enabled: true, relation });
      }

      // === CLASSIFY v3: SINGLE CALL (classification + multi + clarification) ===
      // Replaces detect-multi + preparse (8 calls) + Phase 1 + clarify-ambiguity
      // for a drop with one structured call. Response is a superset of the
      // classify-phase1-v2 shape. Off unless the Worker var
      // CLASSIFY_V3_ENABLED = "true". Builds from the Mind Drop rethink have no
      // other classifier: a failed call is tried again by the drop's runner,
      // and after three tries the drop's card shows its words and Retry.
      // Builds already out fall back to their v2 path.
      // Corpus results: docs/minddrop-classify-v3.md
      // =========================
      if (type === 'classify-v3') {
        const rl = await checkIpRateLimit(request, env, 'classify', 60);
        if (!rl.allowed) return rateLimitResponse('classify', rl.count, rl.limit);

        // OFF unless explicitly enabled. Which model it runs on is decided by
        // the model audit (docs/), not by default.
        if (String(env.CLASSIFY_V3_ENABLED || '').toLowerCase() !== 'true') {
          return j({ error: 'classify_v3_disabled' }, 503);
        }

        const text = String(body.text || '').trim();
        if (!text) {
          return j({ error: 'missing_text', detail: 'text field is required' }, 400);
        }

        const t0 = Date.now();
        // The prompt version: CLASSIFY_PROMPT_NEW_BUILDS for builds from the Mind
        // Drop rethink (they send piece_questions), CLASSIFY_PROMPT for builds
        // already out; anything unknown runs the default (classifyPromptFor)
        const promptVersion = classifyPromptFor(env, body);
        const systemPrompt = buildClassifyV3Prompt({ version: promptVersion });
        // Builds from the Mind Drop rethink send piece_questions, so a piece of a
        // multi drop can ask its own question; builds already out never do.
        // CLASSIFY_SPLIT_AUTO "false" makes every multi drop ask (stage 3); "true"
        // from 10 Oct 2026 lets a clear split come apart on its own.
        const classifyOpts = {
          pieceQuestions: body.piece_questions === true,
          splitAuto: String(env.CLASSIFY_SPLIT_AUTO ?? 'true') !== 'false',
          version: promptVersion,
        };
        // Builds from stage 4 ask for the question's words after the sort
        // (clarify-ambiguity), so the writer never holds up the kind
        const writeQuestion = wantsQuestionWriter(body);

        let result;
        try {
          result = await aiClassify({
            mode: 'realtime',
            ...getProviders('classify', env),
            env,
            systemPrompt,
            messages: [
              {
                role: 'user',
                content: formatDropMessage(text, {
                  currentDate: typeof body.currentDate === 'string' ? body.currentDate : null,
                  dayOfWeek: typeof body.dayOfWeek === 'string' ? body.dayOfWeek : null,
                  hasUserSelectedDate: body.hasUserSelectedDate === true,
                }),
              },
            ],
            endpoint: 'classify-v3',
            // Worst case 5s + 4s stays inside the app's 10s budget for this
            // call. Every shortlisted model's p99 on the audit corpus was under
            // 5s (docs/2026-09-29-minddrop-model-audit.md).
            primaryTimeoutMs: 5000,
            fallbackTimeoutMs: 4000,
            // A slow primary (about 1 in 20 calls on the audit corpus) races
            // the fallback from this point instead of holding the user for 5s.
            hedgeAfterMs: Number(env.CLASSIFY_HEDGE_MS) || 3000,
            validate: (parsed) =>
              normalizeClassifyV3(parsed, text, { ...classifyOpts, quiet: true })
                ? { valid: true }
                : { valid: false, reason: 'classify_v3_shape' },
          });
        } catch (err) {
          console.error('[ClassifyV3] aiClassify threw', { error: String(err) });
          result = { parsed: null };
        }

        let normalized = result?.parsed
          ? normalizeClassifyV3(result.parsed, text, classifyOpts)
          : null;
        const dropMessage = formatDropMessage(text, {
          currentDate: typeof body.currentDate === 'string' ? body.currentDate : null,
          dayOfWeek: typeof body.dayOfWeek === 'string' ? body.dayOfWeek : null,
          hasUserSelectedDate: body.hasUserSelectedDate === true,
        });
        const steps = { second_opinion: null, writer: null };
        // The app gives this call 10s. The optional second opinion and question
        // writer only run if there is time left, and their deadlines are cut to
        // fit, so every path (including both backups) ends within 9s.
        const BUDGET_MS = 9000;
        const timeLeft = () => BUDGET_MS - (Date.now() - t0);
        const deadlines = (primaryMax, fallbackMax) => {
          const primaryTimeoutMs = Math.min(primaryMax, timeLeft() - 500);
          return {
            primaryTimeoutMs,
            fallbackTimeoutMs: Math.max(500, Math.min(fallbackMax, timeLeft() - primaryTimeoutMs)),
          };
        };

        // Optional second opinion when the classifier wants to ask (used with
        // a fast, cheap classifier): a stronger model decides whether a
        // question is really needed. Off unless SECOND_OPINION_MODEL is set.
        if (normalized?.is_ambiguous && env.SECOND_OPINION_MODEL && timeLeft() >= 2000) {
          try {
            const so = await aiClassify({
              mode: 'realtime',
              ...getProviders('second_opinion', env),
              env,
              systemPrompt: buildSecondOpinionPrompt(),
              messages: [{ role: 'user', content: dropMessage }],
              endpoint: 'classify-v3-second-opinion',
              ...deadlines(3000, 2500),
              validate: (parsed) =>
                normalizeClassifyV3(parsed, text, { ...classifyOpts, quiet: true })
                  ? { valid: true }
                  : { valid: false, reason: 'shape' },
            });
            const n2 = so?.parsed ? normalizeClassifyV3(so.parsed, text, classifyOpts) : null;
            if (n2) {
              normalized = n2;
              steps.second_opinion = { model: so.model, asked: n2.is_ambiguous };
            }
          } catch (err) {
            console.warn('[ClassifyV3] second opinion failed', { error: String(err) });
          }
        }

        // The classifier chose that a question is needed and which kind; a
        // dedicated writer (Sonnet by default) writes the words. If it is slow
        // or its words fail the checks, the classifier's own words stay.
        if (
          normalized?.is_ambiguous &&
          writeQuestion &&
          String(env.CLARIFY_WRITER_ENABLED || 'true') !== 'false' &&
          timeLeft() >= 1500
        ) {
          try {
            const w = await aiClassify({
              mode: 'realtime',
              ...getProviders('clarify_writer', env),
              env,
              systemPrompt: buildClarifyPrompt(
                normalized.ambiguity_type,
                normalized.ambiguity_reason,
              ),
              messages: [{ role: 'user', content: formatDropMessage(text) }],
              endpoint: 'classify-v3-writer',
              ...deadlines(2500, 1500),
            });
            const words = w?.parsed || parseModelJson(w?.content);
            if (words) {
              const clar = buildClarification(
                normalized.ambiguity_type,
                words.question,
                words.labels,
                words.habit_direction,
                text,
              );
              // Fixed label types only take the writer's question.
              if (
                clar.question_source === 'model' ||
                clar.labels_source === 'model' ||
                clar.labels_source === 'mixed'
              ) {
                normalized = {
                  ...normalized,
                  clarification_question: clar.clarification_question,
                  clarification_options: clar.clarification_options,
                  clarification_source: {
                    question: clar.question_source,
                    labels: clar.labels_source,
                    writer: w.model,
                  },
                  plausible_interpretations: clar.clarification_options.map((o) => ({
                    bucket: o.bucket,
                    subtype: o.subtype,
                    habitSubtype: o.habitSubtype,
                    dateField: o.dateField || null,
                  })),
                };
                steps.writer = { model: w.model };
              }
            }
          } catch (err) {
            console.warn('[ClassifyV3] question writer failed', { error: String(err) });
          }
        }
        const latency = Date.now() - t0;

        if (!normalized) {
          console.error('[ClassifyV3] unusable output', {
            latency_ms: latency,
            provider: result?.provider,
            model: result?.model,
            wasFallback: result?.wasFallback,
          });
          return j({ error: 'classify_v3_failed', latency_ms: latency }, 502);
        }

        console.log('[ClassifyV3]', {
          bucket: normalized.bucket,
          subtype: normalized.subtype,
          habitSubtype: normalized.habitSubtype,
          is_ambiguous: normalized.is_ambiguous,
          ambiguity_type: normalized.ambiguity_type,
          is_multi: normalized.is_multi,
          segments: normalized.segments?.length || 0,
          split: normalized.split,
          split_said: normalized.split_said ?? null,
          piece_questions: classifyOpts.pieceQuestions,
          prompt_version: promptVersion,
          confidence: normalized.confidence,
          provider: result.provider,
          model: result.model,
          wasFallback: result.wasFallback,
          gate: normalized.gate || null,
          second_opinion: steps.second_opinion,
          writer: writeQuestion ? steps.writer : 'not_asked',
          cache_read_tokens: result.usage?.cache_read_input_tokens ?? null,
          latency_ms: latency,
        });

        return j({
          ...normalized,
          prompt_version: promptVersion,
          provider: result.provider,
          model: result.model,
          was_fallback: result.wasFallback === true,
          latency_ms: latency,
        });
      }

      // =========================
      // === PHASE 1.5: CLARIFY AMBIGUITY ===
      // Writes the question + option labels for a drop already known to be
      // ambiguous. Used when classify-v3 is off, and by the app to heal
      // entities saved without options. Option ids/actions are fixed per type
      // (CLARIFY_TYPE_CONFIGS in classifyV3.js); the model only writes words,
      // and every question is now about the actual drop (the old fixed
      // questions such as "Is this already in the diary?" are gone).
      // Response shape is unchanged so older app builds keep working.
      // =========================
      if (type === 'clarify-ambiguity') {
        const rl = await checkIpRateLimit(request, env, 'classify', 60);
        if (!rl.allowed) return rateLimitResponse('classify', rl.count, rl.limit);

        const text = String(body.text || '');
        const ambiguityType = AMBIGUITY_TYPES.includes(body.ambiguityType)
          ? body.ambiguityType
          : 'bucket';
        const ambiguityReason =
          typeof body.ambiguityReason === 'string' ? body.ambiguityReason : '';
        const t0 = Date.now();

        let parsedWords = null;
        let aiMeta = {};
        if (text.trim()) {
          try {
            const result = await aiClassify({
              mode: 'realtime',
              ...getProviders('clarify_writer', env),
              env,
              systemPrompt: buildClarifyPrompt(ambiguityType, ambiguityReason),
              messages: [{ role: 'user', content: formatDropMessage(text) }],
              endpoint: 'clarify-ambiguity',
              // App waits 8s for this call; 4s + 3.5s keeps us inside it.
              primaryTimeoutMs: 4000,
              fallbackTimeoutMs: 3500,
            });
            parsedWords = result.parsed || parseModelJson(result.content);
            aiMeta = {
              provider: result.provider,
              model: result.model,
              wasFallback: result.wasFallback,
            };
          } catch (err) {
            console.warn('[Phase1.5] AI call failed', { error: String(err) });
          }
        }

        // buildClarification validates the words and falls back to the fixed
        // copy for the type, so this always returns a usable popup.
        const clar = buildClarification(
          ambiguityType,
          parsedWords?.question,
          parsedWords?.labels,
          parsedWords?.habit_direction,
          text,
        );
        const latency = Date.now() - t0;
        console.log('[Phase1.5]', {
          ambiguityType: clar.ambiguity_type,
          options_count: clar.clarification_options.length,
          question_source: clar.question_source,
          labels_source: clar.labels_source,
          ...aiMeta,
          latency_ms: latency,
        });

        return j({
          success: true,
          ambiguity_type: clar.ambiguity_type,
          clarification_question: clar.clarification_question,
          options: clar.clarification_options,
          // Where the words came from (stage 4): the app puts the writer's own
          // words in place of the classifier's, and keeps the classifier's
          // over the fixed copy. Builds already out ignore these.
          question_source: clar.question_source,
          labels_source: clar.labels_source,
          latency_ms: latency,
        });
      }

      // =========================
      // === RECLASSIFY AFTER CLARIFICATION ===
      // Generates updated title + confirmation message after user clarifies intent
      // =========================
      if (type === 'reclassify-after-clarification') {
        const rl = await checkIpRateLimit(request, env, 'classify', 60);
        if (!rl.allowed) return rateLimitResponse('classify', rl.count, rl.limit);

        const text = body.text || '';
        const selectedLabel = body.selectedLabel || '';
        const selectedBucket = body.selectedBucket || null;
        const selectedSubtype = body.selectedSubtype || null;
        const selectedHabitSubtype = body.selectedHabitSubtype || null;
        // eslint-disable-next-line no-restricted-syntax -- Worker has no dateService; timezone-safe via Intl
        const currentDate =
          body.currentDate ||
          new Intl.DateTimeFormat('en-CA', { timeZone: userTimezone }).format(new Date());
        const targetBucket = body.targetBucket || null;

        const contextString = `=== CONTEXT ===
ORIGINAL INPUT: "${text}"
USER SELECTED: "${selectedLabel}"
SELECTED BUCKET: ${selectedBucket || 'not specified'}
SELECTED SUBTYPE: ${selectedSubtype || 'not specified'}
CURRENT DATE: ${currentDate}`;

        const reclassifyPrompt = reclassifySystemPrompt();

        const t0 = Date.now();

        const result = await aiClassify({
          mode: 'realtime',
          ...getProviders('mini', env),
          env,
          systemPrompt: reclassifyPrompt,
          messages: [{ role: 'user', content: contextString }],
          temperature: 0.3,
          maxOutputTokens: 250,
          endpoint: 'reclassify-after-clarification',
        });

        const latency = Date.now() - t0;

        if (!result.parsed) {
          console.log('[Reclassify] Both providers failed', { latency_ms: latency });
          // the kind the user picked still decides what the item becomes
          const fallbackBucket = ['todo', 'habit', 'log'].includes(selectedBucket)
            ? selectedBucket
            : 'log';
          return j({
            bucket: fallbackBucket,
            subtype:
              fallbackBucket === 'log'
                ? ['general', 'idea', 'journal', 'event'].includes(selectedSubtype)
                  ? selectedSubtype
                  : 'general'
                : null,
            habit_subtype:
              fallbackBucket === 'habit'
                ? selectedHabitSubtype === 'break_habit'
                  ? 'break_habit'
                  : 'start_habit'
                : null,
            smart_title: fallbackTitle(text, 'reclassify-after-clarification'),
            // the answer is kept as they gave it; the line never speaks of saving
            confirmation_message: 'Got it.',
            target_date: null,
            scheduled_date: null,
            latency_ms: latency,
          });
        }

        const parsed = result.parsed;

        // Use selected bucket/subtype if provided, otherwise fall back to AI response
        const validBuckets = ['todo', 'habit', 'log'];
        let bucket =
          selectedBucket && validBuckets.includes(selectedBucket)
            ? selectedBucket
            : validBuckets.includes(parsed.bucket)
              ? parsed.bucket
              : 'log';

        // Validate subtype
        let subtype = null;
        if (bucket === 'log') {
          const validSubtypes = ['general', 'idea', 'journal', 'event'];
          subtype =
            selectedSubtype && validSubtypes.includes(selectedSubtype)
              ? selectedSubtype
              : validSubtypes.includes(parsed.subtype)
                ? parsed.subtype
                : 'general';
        }

        // Validate habit_subtype
        let habitSubtype = null;
        if (bucket === 'habit') {
          const validHabitSubtypes = ['start_habit', 'break_habit'];
          // a habit to cut back that the user picked stays one
          habitSubtype = validHabitSubtypes.includes(selectedHabitSubtype)
            ? selectedHabitSubtype
            : validHabitSubtypes.includes(parsed.habit_subtype)
              ? parsed.habit_subtype
              : 'start_habit';
        }

        // Validate dates
        let targetDate = null;
        let scheduledDate = null;
        if (parsed.target_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.target_date)) {
          targetDate = parsed.target_date;
        }
        if (parsed.scheduled_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.scheduled_date)) {
          scheduledDate = parsed.scheduled_date;
        }

        // Extract date_type_ambiguous flag
        const dateTypeAmbiguous = parsed.date_type_ambiguous === true;

        // Extract confirmation message (same as Phase 1)
        // Only the two backstops James agreed act on it, and both log (titles.js).
        let confirmationMessage = String(parsed.confirmation_message || '').trim() || null;
        if (confirmationMessage) {
          confirmationMessage = dashBackstop(confirmationMessage, 'reclassify-after-clarification');
          confirmationMessage = lengthBackstop(
            confirmationMessage,
            50,
            'reclassify-after-clarification',
          );
        }

        console.log('[Reclassify] Success', {
          bucket,
          subtype,
          habit_subtype: habitSubtype,
          title: parsed.smart_title?.substring(0, 30),
          confirmation_message: confirmationMessage,
          target_date: targetDate,
          scheduled_date: scheduledDate,
          date_type_ambiguous: dateTypeAmbiguous,
          wasFallback: result.wasFallback,
          fallbackReason: result.fallbackReason,
          latency_ms: latency,
        });

        return j({
          bucket,
          subtype,
          habit_subtype: habitSubtype,
          smart_title: String(parsed.smart_title || '').trim()
            ? sentenceCase(String(parsed.smart_title).trim())
            : fallbackTitle(text, 'reclassify-after-clarification'),
          confirmation_message: confirmationMessage,
          target_date: targetDate,
          scheduled_date: scheduledDate,
          date_type_ambiguous: dateTypeAmbiguous,
          latency_ms: latency,
        });
      }

      // =========================
      // === PHASE 1 CLASSIFICATION (v4.1 - NOW INCLUDES TITLE + MESSAGE) ===
      // =========================
      if (type === 'classify-phase1') {
        const rl = await checkIpRateLimit(request, env, 'classify', 60);
        if (!rl.allowed) return rateLimitResponse('classify', rl.count, rl.limit);

        const text = body.text || '';
        const hasAttachments = body.hasAttachments || false;
        const heuristicHint = body.heuristicHint || null;

        const currentDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: userTimezone,
        }).format(new Date());
        const dayOfWeek = new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          timeZone: userTimezone,
        }).format(new Date());

        const phase1Prompt = `You classify "mind drops" for Gremly, a productivity app. Your job is to understand the user's TRUE INTENT through semantic reasoning, not pattern matching.

Today is ${currentDate} (${dayOfWeek}).

=== THE FOUR BUCKETS ===

**TODO** — A discrete, completable action
The user will eventually "check this off." A clear DONE state exists.
Ask: "Can this be marked DONE when complete?"

**HABIT** — A trackable, recurring behavior
The user wants to TRACK this over time. It's concrete and observable.
Ask: "Can this be tracked with a yes/no each day/week?"

**LOG** — Capture for reflection, not action
A thought, feeling, idea, or fuzzy aspiration. No clear done state or tracking intent.
Ask: "Is this reflection, exploration, venting, or too vague to act on?"

**AMBIGUOUS** — Intent is unclear, need to ask the user
You cannot confidently determine which bucket this belongs in.
Ask: "Do I have EVIDENCE for TODO, HABIT, or LOG? Or am I guessing?"
Choose AMBIGUOUS when none of the other three buckets reaches 70% confidence.

=== CRITICAL SEMANTIC QUESTIONS ===

Before classifying, reason through these questions. They resolve the hardest cases.

**Q1: WHERE DOES UNCERTAINTY LIVE?**

When hedging, conditionals, or tentative language appears, ask: Is uncertainty about THE WORLD or about THE USER'S OWN INTENT?

WORLD uncertainty (timing, availability, external factors): The user has committed to the action but faces external unknowns. The intent is clear; circumstances are not. This is still a TODO. The condition is context, not wavering.

SELF uncertainty (whether to do it, weighing options, questioning desire): The user hasn't decided. They're exploring or processing. This is IDEA (exploring possibility) or JOURNAL (processing feelings about it).

The test: If the external condition resolved favorably, would the user definitely act? YES → TODO. UNSURE → not a TODO.

**Q2: WHAT IS THE DOMINANT FRAME?**

Individual words exist inside an overall frame. The frame determines classification, not the words inside it.

DIRECTING frame: User is telling themselves to do something. Even soft language inside a directing frame is a TODO.

EXPLORING frame: User is considering possibilities. Even action verbs inside an exploring frame is an IDEA.

PROCESSING frame: User is working through feelings or patterns. Even future-oriented words inside a processing frame is JOURNAL.

The test: What is the user DOING with this thought right now? Capturing an action? Floating a possibility? Working through feelings?

**Q3: IS THIS EXPRESSION COMPLETE?**

Short inputs are not necessarily incomplete — they may be fully expressed.

Single emotional words are complete JOURNAL entries. The value is the expression itself. Do not mark ambiguous due to brevity.

Bare nouns without any verb or context genuinely lack signal. These ARE ambiguous — you cannot determine if it is something to DO, TRACK, or REMEMBER.

The test: Is brevity the problem, or is intent actually missing? Emotional expression with no action is a complete journal. Noun with no framing is genuinely ambiguous.

=== CRITICAL GATES (CHECK FIRST — Before classification) ===

Apply these gates IN ORDER before any other classification. If a gate matches, use its result and STOP.

**GATE A: NECESSITY FRAMING → TODO**
Is the user framing this as something that NEEDS to happen?

Apply this test: Does the input express necessity, obligation, or requirement — the sense that this action is not optional? If the user is telling themselves "this must be done" in any phrasing, they have committed to act.

If YES → return TODO immediately. Necessity framing IS commitment. Do not check for ambiguity.

**GATE B: DIRECTION WITHOUT SCHEDULE → AMBIGUOUS**
Is the user expressing a desire to move in a direction — having more or less of something — without specifying when or how often?

Apply this test: Could you put this on a daily tracker and answer "did I do this?" with a clear yes or no? If there's no defined frequency or threshold, the answer is no.

If YES → return AMBIGUOUS immediately. Direction without schedule is not trackable.

**GATE C: IMPERATIVE STRUCTURE → TODO**
Does this input begin with an action the user is directing themselves to perform?

Apply this test: Read the first clause. Is the user telling themselves to DO something? Is there a verb at or near the start that represents an action they will take? If the input is structured as a self-command — the user directing their own future action — that's a commitment to act.

If YES → return TODO immediately. Imperative structure IS commitment. Any uncertainty later in the input about options, details, timing, or method does not change the commitment — it just means the specifics are fuzzy.

=== SEMANTIC CLASSIFICATION (after gates) ===

Your task is to REASON about intent, not to match patterns or keywords. Apply these semantic tests to ANY input.

**TODO SEMANTIC TEST:**

**FRAME FIRST — IMPERATIVE LOCKS TO TODO:** Before evaluating completion points, identify the input's structure. An imperative (verb + object, no subject) is a DIRECTING frame — the user is commanding themselves to act.

When identifying imperatives, apply grammatical parsing: if the input starts with a word that functions as a verb given what follows it, that's an imperative. Words can be both nouns and verbs — determine which based on the structure that follows.

**CRITICAL:** Once an imperative frame is identified, classification is TODO. Full stop. Do not re-evaluate based on the object. Do not second-guess completion point clarity. Do not mark ambiguous because the object is unfamiliar or abstract. The frame is the evidence. The verb carries the intent. The user knows what they meant and will know when they're done.

Imperatives have an implicit completion point: a session of that action. User-determined completion is valid — the user decides when their session is complete.

**CARVE-OUTS — These override the frame lock:**
- Explicit frequency or stop/quit language present → evaluate for HABIT first, not TODO
- State-of-being verbs that describe desired states rather than discrete actions → LOG
- Ongoing mental states with no natural completion point → LOG/idea (ask: is there a point where the user would say "I'm done with this"? If the mental activity could continue indefinitely with no endpoint, it's LOG. If there's a moment of completion — enough information gathered, decision made, answer found — it's a completable TODO)
- Hedging that applies to the CORE ACTION (see test below) → do not auto-lock, evaluate normally

**BEFORE triggering the hedging carve-out, you MUST apply this test:**

Read the ENTIRE input as a complete thought. Identify the CORE ACTION — the main verb and what it acts upon. Then ask: does the hedging make the user uncertain about performing this core action, or does it only qualify secondary elements?

Only trigger the hedging carve-out when uncertainty attaches to WHETHER the user will act. If the user IS acting and uncertainty only touches details like options, timing, method, or location — the imperative frame lock holds and classification is TODO.

If none of these carve-outs apply, the imperative locks to TODO.

In a DIRECTING frame, evaluate completion within that frame, not in the abstract.

A TODO has ALL of these properties:
1. **Discrete action** — Something that happens once then is finished. Not an ongoing behavior, not a state of being, not a continuous process. There is a clear beginning and end.

2. **Clear completion point** — There exists a specific moment where this transitions from "not done" to "done." You could identify that moment. The user would know when they've finished.

3. **Checkable** — The user would feel satisfied marking this complete. It represents a unit of work or action that, once performed, is behind them.

**The completion test:** Imagine the user coming back and saying "I did it." Does "it" refer to something concrete and finished? If yes → TODO.

**Cognitive work is still a TODO:** Mental tasks like deciding, figuring out, researching, or working through a problem ARE todos if they have a completion point. "Figure out why X is broken" is done when you understand the cause. "Decide on a venue" is done when the decision is made. "Research options for Y" is done when you've gathered enough information. These have clear done states even though the work is mental.

**Investigative actions are TODOs when they have an endpoint:** If the user is setting out to learn, discover, or understand something — and there's a point where they'd have enough information — that's a completable action, not open-ended exploration. The test: could they come back and say "I looked into it" or "I checked it out" as a completed action? If yes, it's a TODO. This is different from ongoing mental states like "thinking about" or "considering" which have no natural completion point — those are exploration (LOG/idea), not action.

**Conditional or qualified actions are still TODOs:** When a user describes an action with conditions, qualifiers, or uncertainty about outcome — but the action itself is clear — the item is still a TODO. The condition doesn't change the nature of the action; it adds context to it. The user intends to perform the action; whether the outcome is guaranteed is separate from whether the action is completable.

**What disqualifies a TODO:**
- No identifiable completion point (does not apply to clean imperatives — session completion is valid)
- Ongoing state rather than discrete action
- Too vague to know what "done" means (does not apply to clean imperatives — user-determined completion is valid)

---

**HABIT SEMANTIC TEST:**

A HABIT has ALL of these properties:
1. **Concrete, observable behavior** — Something a camera could theoretically record. A physical action or measurable behavior, not a mental state, attitude, or abstract quality. You could observe someone doing or not doing it.

2. **Binary trackability** — At the end of each day or week, the user can definitively answer "did I do this? yes or no" with certainty. There's no ambiguity about whether it happened.

3. **Explicit repetition intent** — The user has signaled they want this to recur. This signal must be EXPLICIT in their input, not inferred:
   - Stated frequency: words like "daily," "every morning," "weekly," "3x per week," "twice a day"
   - Specific named days: when the user specifies particular days of the week, they are declaring a recurring schedule, which signals habit intent — this is equivalent to stating a frequency
   - OR stop/quit language: "stop [behavior]," "quit [behavior]," "no [behavior] after [time]," "avoid [behavior]"

**The tracking test:** Could this appear on a habit tracker with a yes/no checkbox for each day? Would checking it off daily make sense?

**CRITICAL — Explicit signals required:**
Without explicit frequency or stop/quit language in the input, the item is NOT a habit, regardless of whether the activity could theoretically be repeated. A repeatable activity without explicit repetition intent is either a single TODO or a vague aspiration — and vague aspirations should be AMBIGUOUS so the user can clarify.

**Comparative words are NOT frequencies:**
Words expressing direction without schedule — wanting more or less of something — have no trackable cadence. You cannot answer "did I do this today?" with certainty. Without explicit frequency, these are vague aspirations and should be AMBIGUOUS, not HABIT.

**What disqualifies a HABIT:**
- No explicit frequency or stop/quit language (even if the activity is repeatable)
- Comparative words only without explicit frequency → AMBIGUOUS
- Mental states that can't be observed
- Abstract qualities rather than behaviors
- Vague aspirations without commitment
- Hedging + potential frequency → AMBIGUOUS (user hasn't committed)

---

**LOG SEMANTIC TEST:**

A LOG captures content that doesn't fit TODO or HABIT. It serves reflection, reference, or exploration.

LOG has three subtypes that are checked SEQUENTIALLY, not as parallel options. First check for journal, then idea, then general. This ordering matters because journal and idea have specific signals, while general is the narrowest category reserved for purely factual content.

**LOG/journal** — Emotional expression or internal processing (check FIRST):

The user is expressing feelings, reflecting on experiences, venting, processing emotions, or engaging in self-talk. The content is about their internal state or making sense of something that happened. There's no action to take — the value is in the expression itself.

The temporal orientation is INWARD and BACKWARD — processing what IS (current feelings, present state) or what WAS (past events, things that happened). The user is making sense of their experience, looking inward at their emotional state or backward at something they experienced. They are not planning future action — they are processing.

Signals: emotional language, reflection on past events, gratitude expressions, statements about feelings or internal state, sense-making about experiences.

Rhetorical self-directed questions are a strong journal indicator. These are questions the user asks themselves about their own patterns, behaviors, or tendencies — they're processing and reflecting, not seeking external answers or planning action. The question must be BOTH self-directed (about the user themselves) AND reflective in nature (making sense of something, not planning to change it). Rhetorical questions about external topics or factual inquiries are NOT journal signals — only self-reflective processing questions qualify.

Questions that examine the user's own desire or commitment are processing, not planning. The test: Is the user questioning WHETHER they want something, or questioning HOW to do something they want? Questioning desire is processing — the user is working through their relationship with the choice itself. Questioning logistics is planning.

Self-directed emotional questions are journal even when they use future-oriented framing. When emotional weight and self-direction are the dominant signals — when the user is processing how they FEEL about something rather than exploring what to DO about it — those emotional signals override any exploration framing. The user is working through feelings, not weighing possibilities.

Pure emotional expressions — single words or short phrases that are clearly expressing a feeling with no actionable or informational content — are journal. The user is venting or expressing, not requesting action. The value is in the expression itself.

Overall framing determines classification, not individual words. When the overall structure of an input is self-reflective — the user is processing their relationship with an idea, questioning their own patterns, or examining their motivations — that reflective framing determines the classification, even if individual words within the input sound action-adjacent. The test is: what is the user DOING with this input? If they're PROCESSING (making sense of feelings, questioning themselves, examining patterns), it's journal — regardless of whether action-related words appear inside the reflection.

**LOG/idea** — A spark to capture (check SECOND):

An idea is a seed. The user had a thought they don't want to lose — something that might become something later. There is no committed action, no anchor. The whole thought is floating. The user is in pure capture mode.

**The key distinction from TODO:**
TODO owns all committed action, even with fuzzy details. If there's ANY action verb the user intends to perform, that's a todo with uncertain specifics — not an idea.

Idea has NO action anchor. The entire thought is pre-commitment. The user is capturing a spark, not directing themselves to act. They might build on it later, or let it sit. The value is simply: don't lose this thought.

**CRITICAL CHECK:** Does this input contain a committed action verb — something the user intends to DO? If yes, this is NOT idea. Route to TODO. An action verb with hedging on the details is still a committed action.

Idea only applies when:
- The whole thought is floating with no action anchor
- The user is capturing a spark, not a task
- There is no verb indicating something they WILL do

**IDEA vs GENERAL:**
Both are notes without action. The difference:
- Idea is a spark — something that could become something, a seed for later
- General is factual reference — information about what IS or WAS

**IDEA vs AMBIGUOUS:**
- Idea has clear "spark" framing — the user knows they're capturing a thought to explore later
- Ambiguous has no signal at all — we cannot determine what the user wants

**LOG/general** — Factual reference only (check LAST, narrowest category):

The user is stating something that IS — recording factual information, reference data, completed events, or contact details. This requires existence verbs or past tense completion. The content is purely informational — there's no action implied because it's about what IS or WAS, not what to DO.

General requires ACTIVE FRAMING as factual reference — the user must be stating something about the world, not just naming a concept. Noun phrases that name services, processes, or things that could plausibly require action are NOT general notes. Without a verb or explicit reference framing, we don't know if the user needs to DO something or is noting information. The presence of a noun alone, even a noun that sounds like reference info, is not enough. The user must be framing it as information, not just naming it. If a noun phrase could plausibly be something to act on, that uncertainty means it's ambiguous.

Statements about schedules, closures, or status changes ARE factual reference when they use existence language. When someone states that something IS closed, IS moved, IS happening on a date, or IS changed — and they're reporting this as information rather than requesting action — that's factual reference. The key test: Is the user REPORTING a fact about the world, or are they REQUESTING something be done? Reporting facts with existence verbs = general. Requesting action or implying a task = TODO or ambiguous.

CRITICAL: General is NOT a catchall for uncertain items. It is the narrowest LOG subtype, reserved for content that is clearly and unambiguously factual reference. General is for content that is CLEARLY positioned as "here is a fact" — not content that merely COULD be a fact. If you are unsure whether something is actionable vs just informational, that uncertainty means it's AMBIGUOUS, not general.

Signals: existence verbs stating facts, past tense describing completed events, contact information, dates of existing events, schedule or status statements using "is" language, purely informational statements.

**LOG subtype decision summary:**

1. Is there emotional or reflective content about present feelings or past experiences? → **journal**
2. Is this a spark to capture — a floating thought with no action anchor? → **idea**
3. Is there factual reference info, clearly stating what IS or WAS (not what to DO)? → **general**
4. Unsure if this is something to DO vs just something to KNOW? → **ambiguous** (not general)

**REMEMBER:** If there is ANY committed action verb, it's a TODO — not idea. TODO owns all action, even with fuzzy details.

---

**CRITICAL — What is NOT ambiguity:**

Uncertain details within a committed action is NOT ambiguity. If the user has committed to an action (via imperative or obligation language) but is uncertain about specifics like which option, what time, what method, or what location — that is a TODO with fuzzy details, not ambiguity.

The test: Is the user uncertain about WHETHER to act, or uncertain about WHAT/WHEN/HOW within a committed action? Only the former is ambiguity. The latter is a clear TODO.

Do NOT flag as ambiguous just because options are being weighed. Weighing options about HOW to complete an action is part of doing the action — the commitment to act is still clear.

---

**AMBIGUOUS — When to flag:**

Flag as AMBIGUOUS when you cannot confidently determine the bucket because evidence is missing.

**The evidence test:** Before classifying, ask "What SPECIFIC WORDS in this input tell me the user's intent?" If you cannot point to concrete evidence, you are guessing.

**Types of ambiguity:**

1. **Bucket ambiguity** — You don't know if this is something to DO, TRACK, or KNOW
   - Bare nouns with no verb or intent signal
   - Fragments that could plausibly be multiple bucket types
   - Input where you'd need to ask "what do you want to do with this?"

2. **Action ambiguity** — Input has a noun + time reference but no verb
   - Could be an existing appointment OR a need to schedule
   - You'd need to ask "do you have this or need to book it?"

3. **Date type ambiguity** — Bucket is clearly TODO, but date meaning is unclear
   - Action verb + noun + date, but you don't know if the date is when something IS vs when to DO it
   - You'd need to ask "is [date] when the event is, or when you'll do the action?"

**CRITICAL:** Do not dump ambiguous items into LOG/general as a fallback. If you're uncertain, say so. The user can clarify.

=== STRUCTURAL SIGNALS (SUPPORTING EVIDENCE) ===

These linguistic patterns provide EVIDENCE to support your semantic classification. They help you identify intent but do not override semantic reasoning.

**Evidence suggesting TODO:**
- Imperative structure (verb + object, no subject) — implies a command to self
- Reminder phrasing — implies future action needed
- Obligation language — implies task to complete
- Hedging + action verb — the verb signals intent despite soft commitment

**Evidence suggesting HABIT:**
- Explicit frequency language — signals repetition intent
- Stop/quit + concrete behavior — signals behavior to track
- Tracking language — explicit tracking intent

**Evidence suggesting LOG:**
- Past tense reflection — processing, not planning
- Emotional language — internal state expression
- Hedging WITHOUT action verb — exploration, not commitment
- Existence verbs stating facts — recording information

**Evidence suggesting AMBIGUOUS:**
- No verb at all — you can't determine intent
- Noun + time without verb — could be existing or need-to-schedule
- Vague comparative language without explicit commitment — aspiration without plan

=== CONFIDENCE RULES ===

Confidence reflects EVIDENCE in the input, not gut feeling.

**0.7 or higher:** You can point to specific words that reveal intent. Classify into TODO, HABIT, or LOG with the appropriate subtype.

**Below 0.7:** You cannot point to clear evidence. Return bucket: "ambiguous". This is correct behavior — it routes to clarification where the user resolves it with one tap.

Do not guess. Do not return a low-confidence classification hoping it's right. If evidence is insufficient, return ambiguous.

=== AMBIGUITY DETECTION TESTS ===

**EXCEPTION — Clean imperatives bypass these tests:** If the input is a clean imperative (action verb + object, no subject, no hedging, not a carve-out case), it is already classified as TODO by the FRAME FIRST rule. Do not apply these ambiguity tests to clean imperatives.

Apply these semantic tests to determine if clarification is needed:

**TEST 1: BUCKET CLARITY**
Ask: "Do I KNOW if this is something to DO vs TRACK vs KNOW?"

CLEAR: Input contains evidence (action verb, frequency, emotional content, existence verb)
UNCLEAR: Bare noun, fragment, or content that fits multiple buckets equally → AMBIGUOUS, type: "bucket"

**TEST 2: ACTION CLARITY** 
(Apply when input has noun + date/time but no clear verb)
Ask: "Do I know if the user HAS something or NEEDS TO DO something?"

CLEAR: Has action verb (needs to do) or existence language (has it)
UNCLEAR: Noun + date with no verb → AMBIGUOUS, type: "action"

**TEST 3: DATE TYPE CLARITY**
(Apply when bucket is TODO and input contains a date)
Ask: "Do I know if this date is when something IS/HAPPENS or when to DO the action?"

CLEAR: Deadline language or event language or action timing
UNCLEAR: Action + noun + date with no signal about date meaning → AMBIGUOUS, type: "date_type"

**TEST 4: VERB PRESENCE**
Ask: "Is there ANY verb in this input?"

If no verb exists (bare noun, noun phrase, or fragment):
→ AMBIGUOUS, type: "bucket"

**TEST 5: ASPIRATION VS COMMITMENT**
Ask: "Has the user made a concrete commitment or expressed a vague aspiration?"

Vague aspirations use comparative language without explicit frequency or specific plans. These should be AMBIGUOUS, not HABIT or LOG/general, because the user might want to track them or might just be noting a wish.

**TEST 6: REMINDER LANGUAGE TEST**
(Apply to inputs with obligation/reminder phrasing)
Ask: "Does this have reminder/obligation language paired with an action verb?"

Inputs with obligation or reminder phrasing followed by an action verb signal TODO intent, even without explicit imperative structure. The obligation language IS the commitment signal. This applies even when the input arrives from a multi-entity split.

**THE CORE PRINCIPLE:**
If you cannot point to specific words that determine how to handle this item, you are guessing. Flag it as ambiguous and let the user clarify.

=== HABIT SUBTYPE ===

When classifying as HABIT, determine the subtype:

**start_habit** — Building or doing something
The user wants to ADD a behavior to their life. They're creating a new positive pattern.

**break_habit** — Stopping or avoiding something  
The user wants to REMOVE a behavior from their life. They're eliminating a negative pattern.

The distinction is semantic: is the user's intent to DO more of something, or to STOP doing something?

=== OUTPUT FORMAT ===

Return ONLY valid JSON:

{
  "bucket": "todo" | "habit" | "log" | "ambiguous",
  "confidence": 0.0-1.0,
  "subtype": "journal" | "idea" | "general" | null,
  "habitSubtype": "start_habit" | "break_habit" | null,
  "ambiguity_type": "bucket" | "date_type" | "vague_aspiration" | "habit_or_todo" | "action_or_memory" | "commitment_level" | "emotional_or_action" | "social_plan" | "scope" | "idea_or_commitment" | null,
  "ambiguity_reason": "Short reason why it's ambiguous" | null
}

Rules:
- subtype is only set when bucket is "log"
- habitSubtype is only set when bucket is "habit"
- When bucket is "ambiguous", always set ambiguity_type and ambiguity_reason`;

        const phase1Messages = [
          { role: 'system', content: phase1Prompt },
          { role: 'user', content: text.substring(0, 1000) },
        ];

        const t0 = Date.now();
        console.log('[Phase1:Timing] Pre-fetch', { t: Date.now() });
        const res = await helperFetch('classify_phase1', {
          messages: phase1Messages,
          temperature: 0.1,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        });
        console.log('[Phase1:Timing] Post-fetch', {
          t: Date.now(),
          status: res.status,
          ok: res.ok,
        });

        const oj = await res.json();
        console.log('[Phase1:Timing] Post-json', { t: Date.now() });
        const latency = Date.now() - t0;

        if (!res.ok) {
          console.log('[Phase1] API error', { error: oj.error });

          const fallbackBucket = heuristicHint?.bucket || 'log';
          const fallbackSubtype =
            heuristicHint?.subtypeHint || (isSenseMakingJournal(text) ? 'journal' : 'general');
          const fallbackHabitSubtype =
            fallbackBucket === 'habit' ? heuristicHint?.habitSubtypeHint || 'start_habit' : null;

          const norm = normalizePhase1(fallbackBucket, fallbackSubtype, text);

          return j({
            is_multi: false,
            bucket: norm.bucket,
            confidence: 0.5,
            subtype: norm.subtype,
            habitSubtype: norm.bucket === 'habit' ? fallbackHabitSubtype : null,
            smart_title: null,
            confirmation_message: null,
            needs_clarification: false,
            clarification_type: null,
            clarification_question: null,
            clarification_options: null,
            source: 'heuristic-fallback',
            latency_ms: latency,
          });
        }

        const rawContent = oj?.choices?.[0]?.message?.content ?? '{}';
        let parsed;
        try {
          parsed = JSON.parse(rawContent);
          console.log('[Phase1:Timing] Post-parse', { t: Date.now() });
        } catch {
          console.log('[Phase1] Parse error', { raw: rawContent });

          const fallbackBucket = heuristicHint?.bucket || 'log';
          const fallbackSubtype =
            heuristicHint?.subtypeHint || (isSenseMakingJournal(text) ? 'journal' : 'general');
          const fallbackHabitSubtype =
            fallbackBucket === 'habit' ? heuristicHint?.habitSubtypeHint || 'start_habit' : null;

          const norm = normalizePhase1(fallbackBucket, fallbackSubtype, text);

          return j({
            is_multi: false,
            bucket: norm.bucket,
            confidence: 0.5,
            subtype: norm.subtype,
            habitSubtype: norm.bucket === 'habit' ? fallbackHabitSubtype : null,
            smart_title: null,
            confirmation_message: null,
            needs_clarification: false,
            clarification_type: null,
            clarification_question: null,
            clarification_options: null,
            source: 'parse-fallback',
            latency_ms: latency,
          });
        }

        // =====================================================
        // SINGLE ITEM RESPONSE (v4.1 - now includes title + message)
        // =====================================================
        let confidence = Number(parsed.confidence);
        if (!Number.isFinite(confidence)) confidence = 0.7;
        confidence = clamp01(confidence);

        const norm = normalizePhase1(parsed.bucket, parsed.subtype, text);

        // Determine habitSubtype for habits
        let habitSubtype = null;
        if (norm.bucket === 'habit') {
          const validHabitSubtypes = ['start_habit', 'break_habit'];
          if (validHabitSubtypes.includes(parsed.habitSubtype)) {
            habitSubtype = parsed.habitSubtype;
          } else {
            habitSubtype = heuristicHint?.habitSubtypeHint ?? 'start_habit';
          }
        }

        // Extract and validate smart_title (v4.1 - NEW)
        // smart_title and confirmation_message now come from Phase 1.5a
        const smartTitle = null;

        // Extract confirmation message (v4.1 - NEW)
        const confirmationMessage = null;

        // Extract ambiguity fields (v4.2 - Phase 1 ambiguity detection)
        // IMPORTANT: Use norm.bucket (post-tiebreaker) and current confidence, not parsed.bucket
        const isAmbiguous = norm.bucket === 'ambiguous' || confidence < 0.7;
        const ambiguityReason =
          isAmbiguous && typeof parsed.ambiguity_reason === 'string'
            ? parsed.ambiguity_reason.trim().substring(0, 200)
            : null;
        // Ambiguous results always carry a type (defaults to 'bucket') so the
        // client never flags a drop without being able to ask about it.
        const ambiguityType = isAmbiguous
          ? AMBIGUITY_TYPES.includes(parsed.ambiguity_type)
            ? parsed.ambiguity_type
            : 'bucket'
          : null;

        // Legacy clarification fields - always false/null in Phase 1
        // Actual clarification options are generated by Phase 1.5
        const needsClarification = false;
        const clarificationType = null;
        const clarificationQuestion = null;
        const clarificationOptions = null;

        const sameAsBucket = heuristicHint?.bucket === norm.bucket;

        console.log('[Phase1]', {
          bucket: norm.bucket,
          subtype: norm.subtype,
          habitSubtype,
          confidence,
          smart_title: smartTitle?.substring(0, 30),
          has_message: !!confirmationMessage,
          is_ambiguous: isAmbiguous,
          ambiguity_type: ambiguityType,
          ambiguity_reason: ambiguityReason?.substring(0, 50),
          heuristicBucket: heuristicHint?.bucket,
          agreed: sameAsBucket,
          latency_ms: latency,
        });

        return j({
          bucket: norm.bucket,
          subtype: norm.subtype,
          habitSubtype,
          confidence,
          smart_title: smartTitle,
          confirmation_message: confirmationMessage,
          is_ambiguous: isAmbiguous,
          ambiguity_type: ambiguityType,
          ambiguity_reason: ambiguityReason,
          // Legacy fields for backwards compatibility - Phase 1.5 handles actual clarification
          needs_clarification: needsClarification,
          clarification_type: clarificationType,
          clarification_question: clarificationQuestion,
          clarification_options: clarificationOptions,
          source: sameAsBucket ? 'heuristic-confirmed' : 'api',
          latency_ms: latency,
        });
      }

      // =========================
      // === PHASE 1.5a: TITLE + CONFIRMATION MESSAGE ===
      // Runs after Phase 1 for non-ambiguous items
      // =========================
      if (type === 'enrich-phase1-5a') {
        const rl = await checkIpRateLimit(request, env, 'enrich', 30);
        if (!rl.allowed) return rateLimitResponse('enrich', rl.count, rl.limit);

        const text = body.text || '';
        // The app calls this at the tap, before the classifier has answered, so the
        // kind is often missing: the prompt then works it out from the words. Builds
        // already out always send one.
        const bucket = body.bucket || null;
        const subtype = body.subtype || null;
        const recentReactions = Array.isArray(body.recentReactions)
          ? body.recentReactions
              .filter((r) => typeof r === 'string' && r.trim().length > 0)
              .slice(-5)
          : [];

        const currentDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: userTimezone,
        }).format(new Date());
        const dayOfWeek = new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          timeZone: userTimezone,
        }).format(new Date());

        const phase15aSystemPrompt = titleReactionPrompt({ currentDate, dayOfWeek });

        const t0 = Date.now();

        // their recent reactions, so this one is built differently (minddropPrompts.js)
        const userMessage = titleReactionUser({ text, bucket, subtype, recentReactions });

        const result = await aiClassify({
          mode: 'realtime',
          ...getProviders('mini', env),
          env,
          systemPrompt: phase15aSystemPrompt,
          messages: [{ role: 'user', content: userMessage }],
          temperature: 0.7,
          maxOutputTokens: 150,
          endpoint: 'enrich-phase1-5a',
        });

        const latency = Date.now() - t0;

        // No card note any more (Mind Drop rethink, 9 Oct 2026): builds already out
        // show no second line when it is missing.
        if (!result.parsed) {
          return j({
            smart_title: fallbackTitle(text, 'enrich-phase1-5a'),
            confirmation_message: null,
            speech_message: null,
            latency_ms: latency,
          });
        }

        const parsed = result.parsed;

        // The title as the model wrote it, with a capital first. A long one is kept:
        // the card wraps, and the words replay counts long titles.
        const modelTitle = String(parsed.smart_title || '').trim();
        const smartTitle = modelTitle
          ? sentenceCase(modelTitle)
          : fallbackTitle(text, 'enrich-phase1-5a');

        // Gremly's reaction as the model wrote it. Only the two backstops James
        // agreed act on it, and both log when they fire (titles.js).
        let confirmationMessage = String(parsed.confirmation_message || '').trim() || null;
        if (confirmationMessage) {
          confirmationMessage = dashBackstop(confirmationMessage, 'enrich-phase1-5a');
          confirmationMessage = lengthBackstop(confirmationMessage, 70, 'enrich-phase1-5a');
        }

        console.log('[Phase1.5a] Success', {
          title: smartTitle?.substring(0, 30),
          has_message: !!confirmationMessage,
          had_kind: !!bucket,
          wasFallback: result.wasFallback,
          fallbackReason: result.fallbackReason,
          latency_ms: latency,
        });

        // The bubble shows the reaction itself: no fixed opener is added any more.
        return j({
          smart_title: smartTitle,
          confirmation_message: confirmationMessage,
          speech_message: confirmationMessage,
          latency_ms: latency,
        });
      }

      // --- PHASE 2 ENRICHMENT (v4.1 - non-streaming, metadata only) ---
      // Title and message now come from Phase 1
      // Phase 2 only extracts: tags, time, dates, frequency, days, people, mood
      if (type === 'enrich-phase2') {
        const rl = await checkIpRateLimit(request, env, 'enrich', 30);
        if (!rl.allowed) return rateLimitResponse('enrich', rl.count, rl.limit);

        const text = body.text || '';
        const bucket = body.bucket || 'log';
        const subtype = body.subtype || null;
        // Use client-provided date to avoid timezone issues
        // eslint-disable-next-line no-restricted-syntax -- Worker has no dateService; timezone-safe via Intl
        const currentDate =
          body.currentDate ||
          body.today ||
          new Intl.DateTimeFormat('en-CA', { timeZone: userTimezone }).format(new Date());
        const timezone = userTimezone;
        // Compute day of week from the date string — never hardcode a fallback day.
        // currentDate is already timezone-correct from the client's dateService.today().
        const dayOfWeek =
          body.dayOfWeek ||
          (() => {
            const [_y, _m, _d] = currentDate.split('-').map(Number);
            return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
              new Date(_y, _m - 1, _d).getDay()
            ];
          })();

        // User-selected date from calendar prefill (may be null)
        const userSelectedDate = body.userSelectedDate || null;
        console.log('[PrefillDate:5-Worker] Received userSelectedDate:', userSelectedDate);
        console.log('[Phase2:DateIntent]', {
          hasUserSelectedDate: body.hasUserSelectedDate || false,
          userSelectedDate: body.userSelectedDate || null,
        });

        const phase2Prompt = detailsPrompt({
          currentDate,
          dayOfWeek,
          timezone,
          userSelectedDate,
          bucket,
          subtype,
        });

        console.log('[Phase2:PromptCheck]', {
          hasUserSelectedDateBlock: Boolean(userSelectedDate),
          userSelectedDate: userSelectedDate,
          promptLength: phase2Prompt.length,
        });

        const t0 = Date.now();

        const result = await aiClassify({
          mode: 'realtime',
          ...getProviders('mini', env),
          env,
          systemPrompt: phase2Prompt,
          messages: [{ role: 'user', content: text.substring(0, 1500) }],
          temperature: 0.2,
          maxOutputTokens: 300,
          endpoint: 'enrich-phase2',
        });

        const latency = Date.now() - t0;

        if (!result.parsed) {
          console.log('[Phase2] Both providers failed', { latency_ms: latency });
          return j({ error: 'enrichment_failed', latency_ms: latency }, 200);
        }

        const parsed = result.parsed;

        // Debug: Log date extraction from LLM
        console.log('[Phase2:DateDebug]', {
          inputText: text.substring(0, 100),
          currentDate,
          dayOfWeek,
          timezone,
          llm_target_date: parsed.target_date,
          llm_scheduled_date: parsed.scheduled_date,
          llm_extracted_date: parsed.extracted_date,
          llm_date_type_ambiguous: parsed.date_type_ambiguous,
        });

        // Validate and normalize tags
        let tags = Array.isArray(parsed.tags) ? parsed.tags : [];
        tags = tags
          .map((t) =>
            String(t)
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-]/g, ''),
          )
          .filter((t) => t.length >= 2 && t.length <= 30)
          .slice(0, 7);

        // Validate time estimate (not for break habits)
        let timeEstimate = null;
        const isBreakHabit = bucket === 'habit' && subtype === 'break_habit';
        if ((bucket === 'todo' || bucket === 'habit') && !isBreakHabit) {
          const num = Number(parsed.time_estimate_minutes);
          if (Number.isFinite(num) && num > 0) {
            // Round to nearest 5 minutes, clamp between 5 and 240
            timeEstimate = Math.min(240, Math.max(5, Math.round(num / 5) * 5));
          }
        }

        // Validate time_window
        let timeWindow = null;
        if (parsed.time_window) {
          const validWindows = ['morning', 'day', 'evening'];
          const normalized = String(parsed.time_window).toLowerCase().trim();
          timeWindow = validWindows.includes(normalized) ? normalized : null;
        }

        // Validate energy_type
        let energyType = null;
        if ((bucket === 'todo' || bucket === 'habit') && !isBreakHabit) {
          const validEnergyTypes = ['deep_focus', 'administrative', 'physical', 'social', 'quick'];
          if (validEnergyTypes.includes(parsed.energy_type)) {
            energyType = parsed.energy_type;
          } else {
            energyType = 'administrative'; // default fallback
          }
        }

        // Validate priority_kind (todos only)
        let priorityKind = null;
        if (bucket === 'todo') {
          const validKinds = ['action', 'blocker', 'waiting', 'decision', 'momentum'];
          if (validKinds.includes(parsed.priority_kind)) {
            priorityKind = parsed.priority_kind;
          } else {
            priorityKind = 'action'; // safe default
          }
        }

        // Validate date intelligence fields (todos only)
        let targetDate = null;
        let scheduledDate = null;
        let dateTypeAmbiguous = false;
        if (bucket === 'todo') {
          // Target date (when something IS or is DUE)
          if (parsed.target_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.target_date)) {
            targetDate = parsed.target_date;
          }

          // Scheduled date (when user will DO the work)
          if (parsed.scheduled_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.scheduled_date)) {
            scheduledDate = parsed.scheduled_date;
          }

          // Ambiguity flag
          dateTypeAmbiguous = parsed.date_type_ambiguous === true;

          // Backward compatibility: if old extracted_date exists and no new fields, use it as scheduled_date
          if (
            !targetDate &&
            !scheduledDate &&
            parsed.extracted_date &&
            /^\d{4}-\d{2}-\d{2}$/.test(parsed.extracted_date)
          ) {
            scheduledDate = parsed.extracted_date;
          }
        }

        // Event dates for logs (notes that are events)
        let noteTargetDate = null;
        let eventTime = null;
        let endDate = null;
        let eventSmartTitle = null;
        // A todo's clock time comes back as event_time too; the app saves it as the
        // todo's due_time (dropSync), so a time left out of the title is kept.
        if (bucket === 'todo' && parsed.event_time && /^\d{2}:\d{2}$/.test(parsed.event_time)) {
          eventTime = parsed.event_time;
        }
        if (bucket === 'log') {
          if (parsed.target_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.target_date)) {
            noteTargetDate = parsed.target_date;
          }
          if (parsed.event_time && /^\d{2}:\d{2}$/.test(parsed.event_time)) {
            eventTime = parsed.event_time;
          }
          if (parsed.end_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.end_date)) {
            endDate = parsed.end_date;
          }
          if (subtype === 'event' && parsed.smart_title && typeof parsed.smart_title === 'string') {
            eventSmartTitle = parsed.smart_title.trim();
          }
        }

        // Validate extracted_start_date (habits)
        let extractedStartDate = null;
        if (bucket === 'habit' && parsed.extracted_start_date) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(parsed.extracted_start_date)) {
            extractedStartDate = parsed.extracted_start_date;
          }
        }

        // Validate extracted_frequency (habits)
        let extractedFrequency = null;
        if (bucket === 'habit' && parsed.extracted_frequency) {
          extractedFrequency = String(parsed.extracted_frequency).trim();
        }

        // Validate extracted_days (habits)
        let extractedDays = null;
        if (bucket === 'habit') {
          if (Array.isArray(parsed.extracted_days) && parsed.extracted_days.length > 0) {
            const validDays = parsed.extracted_days
              .map((d) => Number(d))
              .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
            if (validDays.length > 0) {
              extractedDays = [...new Set(validDays)].sort((a, b) => a - b);
            }
          }
        }

        // Validate people
        let people = [];
        if (Array.isArray(parsed.people)) {
          people = parsed.people
            .map((p) => String(p).trim())
            .filter((p) => p.length > 0 && p.length < 50)
            .slice(0, 10);
        }

        // Validate mood: any note that says how they feel keeps it (every note has a mood)
        let mood = null;
        if (bucket === 'log' && Array.isArray(parsed.mood)) {
          mood = parsed.mood
            .map((m) => String(m).toLowerCase().trim())
            .filter((m) => VALID_MOODS.includes(m))
            .slice(0, 3);
          if (mood.length === 0) mood = null;
        }

        console.log('[Phase2]', {
          tags_count: tags.length,
          has_time_estimate: timeEstimate !== null,
          has_window: timeWindow !== null,
          has_energy: energyType !== null,
          has_priority_kind: priorityKind !== null,
          has_target_date: targetDate !== null || noteTargetDate !== null,
          has_scheduled_date: scheduledDate !== null,
          date_ambiguous: dateTypeAmbiguous,
          has_event_time: eventTime !== null,
          has_frequency: extractedFrequency !== null,
          has_days: extractedDays !== null,
          has_start_date: extractedStartDate !== null,
          has_people: people.length > 0,
          has_mood: mood !== null,
          wasFallback: result.wasFallback,
          fallbackReason: result.fallbackReason,
          latency_ms: latency,
        });

        return j({
          tags,
          time_estimate_minutes: timeEstimate,
          time_window: timeWindow,
          energy_type: energyType,
          priority_kind: priorityKind,
          // New date intelligence fields for todos
          target_date: bucket === 'todo' ? targetDate : noteTargetDate,
          scheduled_date: scheduledDate,
          date_type_ambiguous: dateTypeAmbiguous,
          event_time: eventTime,
          // Event-specific fields
          end_date: endDate,
          smart_title: eventSmartTitle,
          // Keep existing habit fields
          extracted_start_date: extractedStartDate,
          extracted_frequency: extractedFrequency,
          extracted_days: extractedDays,
          // Other fields
          people,
          mood,
          latency_ms: latency,
        });
      }

      // --- PHASE 2B: AUTO-REMINDER DETECTION (standalone, lightweight) ---
      if (type === 'enrich-phase2b') {
        const rl = await checkIpRateLimit(request, env, 'enrich', 30);
        if (!rl.allowed) return rateLimitResponse('enrich', rl.count, rl.limit);

        const text = body.text || '';
        const bucket = body.bucket || 'log';
        const subtype = body.subtype || null;
        // eslint-disable-next-line no-restricted-syntax -- Worker has no dateService; timezone-safe via Intl
        const currentDate =
          body.currentDate ||
          new Intl.DateTimeFormat('en-CA', { timeZone: userTimezone }).format(new Date());
        const timezone = userTimezone;
        const dayOfWeek =
          body.dayOfWeek ||
          (() => {
            const [_y, _m, _d] = currentDate.split('-').map(Number);
            return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
              new Date(_y, _m - 1, _d).getDay()
            ];
          })();

        // Skip buckets that should never get reminders
        if (bucket === 'log' && subtype !== 'event') {
          return j({
            auto_reminder: false,
            reminder_date: null,
            reminder_time: null,
            reminder_frequency: null,
          });
        }
        if (bucket === 'habit' && subtype === 'break_habit') {
          return j({
            auto_reminder: false,
            reminder_date: null,
            reminder_time: null,
            reminder_frequency: null,
          });
        }

        const t0 = Date.now();
        const phase2bPrompt = `You decide if a user's quick thought needs a reminder, and if so, when.

=== CONTEXT ===
Today: ${currentDate} (${dayOfWeek})
Timezone: ${timezone}
Item type: ${bucket}${subtype ? ` (${subtype})` : ''}

=== RULES ===
Set auto_reminder to true when the text implies the user wants to be reminded or nudged at a specific time. This includes:
- Explicit reminder language: "remind me", "don't forget", or "remember" used as an imperative (directing oneself to retain or act on something, not recalling a past memory)
- A specific time with action intent ("at 2pm", "by 5pm", "before lunch")
- Urgency combined with a date ("need to do this tomorrow", "must call today")

Set auto_reminder to false when:
- Timing is vague ("soon", "eventually", "this week")
- There is no reminder language and no specific time
- The text is a journal entry, idea, or reflection

If auto_reminder is true, also extract:
- reminder_date: the date to remind (YYYY-MM-DD), or null if no date mentioned
- reminder_time: the time to remind (HH:mm 24h format), or null if no specific time. Use these defaults by time_window: morning=09:00, afternoon/day=13:00, evening=18:00
- reminder_frequency: "once" for one-time reminders, "daily" for habits

If auto_reminder is false, set all other fields to null.

=== OUTPUT ===
Return ONLY valid JSON, no explanation:
{
  "auto_reminder": boolean,
  "reminder_date": "YYYY-MM-DD" | null,
  "reminder_time": "HH:mm" | null,
  "reminder_frequency": "once" | "daily" | null
}`;

        const result = await aiClassify({
          mode: 'realtime',
          ...getProviders('mini', env),
          env,
          systemPrompt: phase2bPrompt,
          messages: [{ role: 'user', content: text.substring(0, 500) }],
          temperature: 0.1,
          maxOutputTokens: 100,
          endpoint: 'enrich-phase2b',
        });

        const latency = Date.now() - t0;

        if (!result.parsed) {
          console.log('[Phase2b] Both providers failed', { latency_ms: latency });
          return j({
            auto_reminder: false,
            reminder_date: null,
            reminder_time: null,
            reminder_frequency: null,
            latency_ms: latency,
          });
        }

        const parsed = result.parsed;

        // Validate reminder_time format (HH:mm)
        let reminderTime = null;
        if (parsed.reminder_time && /^\d{2}:\d{2}$/.test(parsed.reminder_time)) {
          reminderTime = parsed.reminder_time;
        }

        // Validate reminder_date format (YYYY-MM-DD)
        let reminderDate = null;
        if (parsed.reminder_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.reminder_date)) {
          reminderDate = parsed.reminder_date;
        }

        // Validate frequency
        const validFreqs = ['once', 'daily'];
        const reminderFrequency = validFreqs.includes(parsed.reminder_frequency)
          ? parsed.reminder_frequency
          : null;

        const autoReminder = parsed.auto_reminder === true;

        console.log('[Phase2b]', {
          auto_reminder: autoReminder,
          reminder_date: reminderDate,
          reminder_time: reminderTime,
          reminder_frequency: reminderFrequency,
          wasFallback: result.wasFallback,
          fallbackReason: result.fallbackReason,
          latency_ms: latency,
        });

        return j({
          auto_reminder: autoReminder,
          reminder_date: autoReminder ? reminderDate : null,
          reminder_time: autoReminder ? reminderTime : null,
          reminder_frequency: autoReminder ? reminderFrequency : null,
          latency_ms: latency,
        });
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // ASSIGN WORLDS: file a new drop into a World or Chapter
      // ═══════════════════════════════════════════════════════════════════════════
      //
      // Filing runs by one set of rules for every drop (data fabric stage 4a,
      // workers/inngest-jobs/context/filing.js, shared with the backfill): a
      // Chapter only when Gremly is sure, otherwise the World, otherwise
      // nowhere; never over what the person placed themselves.
      //
      // Trigger: POST / with { type: 'assign-worlds', entity_id, entity_type, text, ... }
      // Auth: JWT required (authenticatedUserId from Bearer token)
      // Rate limit: 60/min under tag 'assign-worlds'
      // Reply: the old counts (world_links, chapter_links, context_links) for
      // older app builds, and filed: { by, world, chapter, starts_something }.
      // ═══════════════════════════════════════════════════════════════════════════

      if (type === 'assign-worlds') {
        const rl = await checkIpRateLimit(request, env, 'assign-worlds', 60);
        if (!rl.allowed) return rateLimitResponse('assign-worlds', rl.count, rl.limit);

        const authenticatedUserId = await extractAuthenticatedUserId(request, env);
        if (!authenticatedUserId) return unauthorizedResponse();

        // Validate required fields
        const entityId = body.entity_id;
        const entityType = body.entity_type;
        const rawText = body.text;

        if (!entityId || typeof entityId !== 'string' || !/^[0-9a-f-]{36}$/i.test(entityId)) {
          return new Response(JSON.stringify({ error: 'invalid_entity_id' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (!entityType || !['todo', 'habit', 'note'].includes(entityType)) {
          return new Response(JSON.stringify({ error: 'invalid_entity_type' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
          return new Response(JSON.stringify({ error: 'missing_text' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const drop = {
          id: entityId,
          entity_type: entityType,
          text: rawText.substring(0, 4000),
          title: typeof body.smart_title === 'string' ? body.smart_title.slice(0, 200) : null,
          date:
            typeof body.extracted_date === 'string' &&
            /^\d{4}-\d{2}-\d{2}/.test(body.extracted_date)
              ? body.extracted_date.slice(0, 10)
              : null,
          tags: Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string') : [],
          people: Array.isArray(body.people)
            ? body.people.filter((t) => typeof t === 'string')
            : [],
        };

        const t0 = Date.now();
        // the pipeline's model calls read the Google key by its pipeline name
        const filingEnv = { ...env, GEMINI_API_KEY: env.GEMINI_API_KEY || env.GOOGLE_API_KEY };
        const filed = await fileDrop(filingEnv, { userId: authenticatedUserId, drop });

        console.log('[AssignWorlds]', {
          entity_id: entityId.slice(0, 8),
          entity_type: entityType,
          by: filed.by,
          world: filed.world ? filed.world.id.slice(0, 8) : null,
          chapter: filed.chapter ? filed.chapter.id.slice(0, 8) : null,
          starts_something: filed.starts_something,
          skipped_reason: filed.skipped_reason,
          model: filed.model || null,
          latency_ms: Date.now() - t0,
          uid: authenticatedUserId.slice(0, 8),
        });

        // a drop with no Worlds to go into: first Worlds may be due (data fabric
        // stage 4b). The inngest worker decides; the reply never waits on it
        if (filed.skipped_reason === 'empty_graph' && env.INNGEST_ADMIN_KEY)
          ctx.waitUntil(
            fetchInngestWorker(env, '/api/first-worlds', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-admin-key': env.INNGEST_ADMIN_KEY },
              body: JSON.stringify({ user_id: authenticatedUserId }),
            })
              .then(async (res) => {
                if (!res.ok)
                  console.warn(
                    `[AssignWorlds] first Worlds could not be asked for: ${res.status} ${(await res.text()).slice(0, 200)}`,
                  );
              })
              .catch((err) =>
                console.warn(`[AssignWorlds] first Worlds could not be asked for: ${err.message}`),
              ),
          );

        return j(filingReply(filed));
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // JOURNAL ANALYZE (v4.2) - Analyze journal entries for themes & patterns
      // ═══════════════════════════════════════════════════════════════════════════
      //
      // Accepts an array of journal entries (body text + mood + date) and returns
      // structured analysis: themes, patterns, journaling habits, and a suggestion.
      //
      // Rate-limited client-side to 1x/week via AsyncStorage.
      // ═══════════════════════════════════════════════════════════════════════════

      if (type === 'journal-analyze') {
        const rl = await checkIpRateLimit(request, env, 'misc', 30);
        if (!rl.allowed) return rateLimitResponse('misc', rl.count, rl.limit);

        const entries = body.entries || [];
        const timezone = userTimezone;

        if (!Array.isArray(entries) || entries.length === 0) {
          return j({ error: 'no_entries', detail: 'No journal entries provided' }, 200);
        }

        // Cap at 60 entries to stay within token budget
        const cappedEntries = entries.slice(0, 60);

        // Build a compact representation of the journal data
        const journalBlock = cappedEntries
          .map((entry, i) => {
            const parts = [`[${entry.date || 'unknown date'}]`];
            if (entry.mood && entry.mood.length > 0) {
              parts.push(`(mood: ${entry.mood.join(', ')})`);
            }
            parts.push(entry.body || '(empty)');
            return parts.join(' ');
          })
          .join('\n---\n');

        const analyzeSystemPrompt = `You are a thoughtful, warm journal analyst for Gremly, a calm productivity app.
The user has shared their recent journal entries. Analyze them with care and empathy.

=== YOUR TASK ===
Analyze these entries and return a JSON object with these four sections:

1. "themes" - Array of 2-4 recurring themes you notice. Each theme is an object:
   { "label": "short theme name", "description": "1-2 sentence observation", "count": number_of_entries_touching_this }
   Be specific to THEIR life, not generic. "Work stress around presentations" not just "Stress".

2. "patterns" - Array of 2-3 behavioral or emotional patterns. Each pattern:
   { "label": "pattern name", "description": "1-2 sentence insight", "sentiment": "positive" | "neutral" | "watch" }
   "watch" means something worth being mindful of (not alarming, just worth noticing).
   Look for: mood swings, recurring triggers, coping mechanisms, growth arcs.

3. "journaling_habits" - Object describing WHEN and HOW they journal:
   { "frequency": "description of how often", "preferred_time": "morning" | "evening" | "varies" | "unknown", "avg_length": "short" | "medium" | "long", "observation": "1 sentence about their journaling style" }

4. "suggestion" - A single gentle, actionable suggestion. Object:
   { "text": "the suggestion (2-3 sentences max)", "type": "reflect" | "try" | "continue" }
   "reflect" = think about something, "try" = experiment with something new, "continue" = keep doing something good.
   Keep reflections grounded in what the user shared. Offer observations and gentle questions, not prescriptions or referrals.
   Frame as an invitation, not advice. Use "you might..." or "it could be interesting to..." language.

=== RULES ===
- Be warm but honest. Don't sugarcoat, but don't alarm.
- Reference SPECIFIC things from their entries (names, events, feelings they mentioned).
- If there are very few entries (< 5), say so in journaling_habits.observation and keep themes/patterns shorter.
- Return ONLY valid JSON. No markdown, no explanation.

=== OUTPUT ===
Return a single JSON object with keys: themes, patterns, journaling_habits, suggestion`;

        const t0 = Date.now();

        try {
          const res = await helperFetch('journal_analyze', {
            messages: [
              { role: 'system', content: analyzeSystemPrompt },
              { role: 'user', content: 'Here are my journal entries:\n\n' + journalBlock },
            ],
            temperature: 0.4,
            max_tokens: 1200,
            response_format: { type: 'json_object' },
          });

          const oj = await res.json();
          const latency = Date.now() - t0;

          if (!res.ok) {
            console.log('[JournalAnalyze] API error', { error: oj.error, latency_ms: latency });
            return j({ error: 'analyze_failed', latency_ms: latency }, 200);
          }

          const rawContent = oj?.choices?.[0]?.message?.content ?? '{}';
          let parsed;
          try {
            parsed = JSON.parse(rawContent);
          } catch {
            console.log('[JournalAnalyze] Parse error', { raw: rawContent.slice(0, 200) });
            return j({ error: 'parse_failed', latency_ms: latency }, 200);
          }

          console.log('[JournalAnalyze] Success', {
            entryCount: cappedEntries.length,
            themesCount: parsed.themes?.length || 0,
            patternsCount: parsed.patterns?.length || 0,
            latency_ms: latency,
          });

          return j({
            analysis: parsed,
            entry_count: cappedEntries.length,
            latency_ms: latency,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[JournalAnalyze] Error', { error: String(err), latency_ms: latency });
          return j({ error: 'analyze_failed', detail: String(err), latency_ms: latency }, 200);
        }
      }

      // --- EXISTING LOGIC BELOW (unchanged) ---
      const baseModel = models().appHelper; // the Worker decides; app builds used to name the model (see models.js)
      if (body.model && body.model !== baseModel) {
        // App builds in users' hands still name a model. Logged so the switch to
        // Worker side config can be checked in production, then ignored.
        console.log('[MODEL] app named a model, Worker config wins', {
          requested: body.model,
          lane,
          using: baseModel,
        });
      }

      const baseTemperature = Number.isFinite(body.temperature)
        ? body.temperature
        : type === 'classify'
          ? 0.1
          : 0.2;

      const baseMaxTokens = Number.isFinite(body.max_tokens)
        ? body.max_tokens
        : Number.isFinite(body.maxTokens)
          ? body.maxTokens
          : Number.isFinite(body.max_completion_tokens)
            ? body.max_completion_tokens
            : type === 'classify'
              ? 160
              : 200;

      // The old Space, World and Chapter chat lanes went with the Worlds
      // rebuild (9 Oct 2026): every phone has the build without them.
      const isGeneralChatLane = lane === 'general_chat' && type !== 'classify';
      const isGeneralChatStreaming = isGeneralChatLane && wantsStreaming;
      const actualModel = baseModel;

      const temperature =
        actualModel === models().legacyOpenAIChat && !Number.isFinite(body.temperature)
          ? 0.7
          : baseTemperature;

      const maxTokensValue = baseMaxTokens;

      console.log('[MODEL]', {
        lane,
        model: actualModel,
        streaming: wantsStreaming,
        maxTokens: maxTokensValue,
      });

      let originalText = '';
      let messages = Array.isArray(body.messages) ? body.messages : [];

      if (type === 'classify') {
        const sysOverride = body.system || body.systemPrompt || null;
        const text = body.text || body.prompt || body.input || body.message || '';
        originalText = String(text || '');

        const masterPrompt = `You are classifying personal thoughts and tasks for a productivity app.
 
 BUCKETS (choose one):
 
 - 'todo': Clear, unhedged action. Has specific verb + object.
 - 'habit': Recurring behavior with explicit frequency.
 - 'log-journal': Emotional reflection.
 - 'log-idea': Brainstorming or conceptual.
 - 'log-general': Everything meaningful but not a todo/habit.
 - 'unsorted': Only gibberish.
 
 Return ONLY JSON:
 {
  "bucket": "...",
  "confidence": 0-100,
  "title": "...",
  "tags": ["a","b"]
 }`;

        messages = [{ role: 'system', content: masterPrompt }];
        if (sysOverride) messages.push({ role: 'system', content: String(sysOverride) });
        messages.push({ role: 'user', content: originalText });
      } else {
        if (messages.length === 0) {
          const sys = body.system || body.systemPrompt || null;
          const text =
            body.text || body.prompt || body.input || body.message || 'Respond succinctly.';
          originalText = String(text || '');
          messages = [];
          if (sys) messages.push({ role: 'system', content: String(sys) });
          messages.push({ role: 'user', content: text });
        } else {
          const lastUser = [...messages].reverse().find((m) => m.role === 'user');
          originalText = lastUser && typeof lastUser.content === 'string' ? lastUser.content : '';
        }
      }

      // ============================================================================
      // GENERAL CHAT (ASK GREMLY) STREAMING
      // ============================================================================
      if (isGeneralChatStreaming && isGeneralChatLane) {
        // Access gate — Phase 4.7
        const access = await checkUserAccess(authenticatedUserId, env);
        if (!access.hasAccess) {
          return denyAccessSSEResponse(access.reason);
        }

        console.log('[GeneralChat:Streaming] Starting SSE stream');

        const lastUserMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';

        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        // Loading message
        (async () => {
          try {
            const loadingMsg = await generateLoadingMessage(lastUserMsg, null, env.OPENAI_API_KEY);
            if (loadingMsg) {
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ searching: true, query: loadingMsg, isLoadingHint: true })}\n\n`,
                ),
              );
            }
          } catch {
            /* fire-and-forget */
          }
        })();

        // Main work IIFE
        (async () => {
          try {
            await writer.write(encoder.encode(': ping\n\n'));

            // URL detection (same as space chat)
            const detectedUrls = extractUrlsFromText(lastUserMsg);
            let urlContext = '';
            let fetchedUrl = null;

            if (detectedUrls.length > 0) {
              const urlToFetch = detectedUrls[0];
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ fetching: true, fetchingUrl: urlToFetch, done: false })}\n\n`,
                ),
              );
              const extracted = await executeTavilyExtract(urlToFetch, env.TAVILY_API_KEY);
              if (extracted && extracted.success) {
                fetchedUrl = { url: extracted.url, title: extracted.title };
                urlContext = `\n\n=== EXTRACTED CONTENT FROM URL ===\nURL: ${extracted.url}\nTitle: ${extracted.title}\n\n${extracted.content}\n\n=== END EXTRACTED CONTENT ===\n\nThe user has shared this link. Summarize the key points and answer any questions they have about it.`;
              } else {
                urlContext = `\n\n[Note: The user shared a link (${urlToFetch}) but I couldn't access its content.]`;
              }
              await writer.write(
                encoder.encode(`data: ${JSON.stringify({ fetching: false, done: false })}\n\n`),
              );
            }

            // Context loading — general lane (no spaceId). Triage needs only the
            // profile and the domain names, so it starts as soon as those are read,
            // while the rest (the life context, the week ahead, today so far) loads
            // alongside it; all of it is in hand before the reply is written.
            let sessionContextStr = '';
            let userProfile = null;
            let cachedDomains = [];
            let generalTodayActivity = null;
            // the week ahead buildChatContext read, for the agent's ids (agent/chat.js)
            const contextKeep = {};
            // their day, for everything here that says today or tomorrow: after
            // midnight it is still yesterday until their day ends (shared/day.js)
            const theirNowRead = authenticatedUserId
              ? personNow(env, authenticatedUserId, userTimezone).catch(() => null)
              : Promise.resolve(null);
            const theirDayRead = theirNowRead.then((n) => n?.today ?? null);
            const tContext = Date.now();
            let contextMs = null;
            const contextRead = authenticatedUserId
              ? Promise.all([
                  buildChatContext(
                    authenticatedUserId,
                    'general',
                    {
                      message: lastUserText(body),
                      timezone: userTimezone,
                      currentChatId: body.chatId || null,
                      keep: contextKeep,
                      today: theirDayRead,
                    },
                    env,
                  ),
                  buildTodayActivity(authenticatedUserId, userTimezone, env, {
                    today: theirDayRead,
                  }).catch((err) => {
                    console.error('[GeneralChat] Context error', err);
                    return null;
                  }),
                ]).then((r) => {
                  contextMs = Date.now() - tContext;
                  return r;
                })
              : Promise.resolve(['', null]);
            if (authenticatedUserId) {
              try {
                [userProfile, cachedDomains] = await Promise.all([
                  getUserProfile(authenticatedUserId, env),
                  getCachedDomainNames(authenticatedUserId, env),
                ]);
              } catch (err) {
                console.error('[GeneralChat] Context error', err);
              }
            }

            // Triage, with the entity matcher running alongside it
            const tLane = Date.now();
            const previousExchange = extractPreviousExchange(messages);
            // the item this chat was opened about ("Talk it through"), sent with every turn
            const anchorEntity = anchorFrom(body.anchorEntity);
            // or the World or Chapter page it was opened from, and what is on it (Worlds rebuild, stage 2)
            const pageAnchor = pageAnchorFrom(body.anchorEntity);
            const pageDetailPromise =
              authenticatedUserId && pageAnchor
                ? fetchPageDetail(env, authenticatedUserId, pageAnchor, todayIsoIn(userTimezone))
                : Promise.resolve('');
            // and what that item holds, read alongside triage and the matcher
            const anchorDetailPromise =
              authenticatedUserId && anchorEntity
                ? fetchItemDetail(env, authenticatedUserId, anchorEntity, {
                    todayIso: todayIsoIn(userTimezone),
                    timezone: userTimezone,
                  })
                : Promise.resolve(null);
            const entityCardPromise = authenticatedUserId
              ? matchEntity({
                  env,
                  userId: authenticatedUserId,
                  message: lastUserMsg,
                  previousExchange,
                  exchanges: extractRecentExchanges(messages),
                  recent: body.recentEntity || null,
                  anchor: anchorEntity,
                  todayIso: todayIsoIn(userTimezone),
                  todayStr: new Intl.DateTimeFormat('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: userTimezone,
                  }).format(new Date()),
                })
              : Promise.resolve(null);

            // Lookups and changes go to the agent for accounts on AGENT_CHAT, from
            // app builds that can draw its card. For those, the search for the
            // items this message names starts now, so it is ready when triage
            // hands the message to the agent (agent/chat.js).
            const agentEligible =
              !!authenticatedUserId &&
              body.agentCard === true &&
              body.chatSurface !== 'brief' &&
              agentChatFor(models().flags.agentChat, authenticatedUserId);
            const agentFound = agentEligible
              ? prefetchForChat(env, {
                  userId: authenticatedUserId,
                  timezone: userTimezone,
                  message: lastUserText(body),
                  today: theirDayRead,
                })
              : null;

            const triageFromClassifier = await triageMessage({
              userMessage: lastUserMsg,
              previousExchange,
              spaceName: undefined,
              runningSummary: body.runningSummary || '',
              chatType: 'general',
              env,
              domainNames: cachedDomains,
              profileSnippet: userProfile?.profileText?.slice(0, 150) || '',
              messageCount: messages.length,
            });
            const triageMs = Date.now() - tLane;

            // the rest of the context, read while triage ran
            [sessionContextStr, generalTodayActivity] = await contextRead;
            sessionContextStr = sessionContextStr || '';
            if (sessionContextStr || userProfile) {
              console.log('[GeneralChat] Context loaded', {
                userId: authenticatedUserId.slice(0, 8),
                contextLength: sessionContextStr.length,
                hasProfile: !!userProfile,
                contextMs,
                triageMs,
              });
            }

            // Lookups and changes on the agent (agent plan step 9): for accounts on
            // AGENT_CHAT, from app builds that can draw its card. The item card is
            // the quick lane's, so the matcher is not waited for. When the agent
            // cannot finish, the quick lane's writer below answers.
            if (agentEligible && AGENT_LANES.includes(triageFromClassifier.lane)) {
              const answered = await answerWithAgent({
                env,
                ctx,
                body,
                userId: authenticatedUserId,
                timezone: userTimezone,
                messages,
                preload: {
                  profileText: userProfile?.profileText,
                  todayActivity: generalTodayActivity,
                  runningSummary: body.runningSummary || '',
                  anchor: anchorEntity,
                  sessionContext: sessionContextStr,
                  week: contextKeep.week,
                  found: agentFound,
                  // the World or Chapter page this chat is on, with what is on it
                  page: pageDetailPromise,
                  // its mode and how personal it is, as the quick lane's writer is told them
                  triage: triageFromClassifier,
                  today: await theirDayRead,
                  dayEndHour: (await theirNowRead)?.dayEndHour,
                },
                send: (obj) => writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)),
                timing: {
                  context_ms: contextMs,
                  triage_ms: triageMs,
                  lane: triageFromClassifier.lane,
                },
              });
              if (answered) return;
            }

            // the card (started alongside triage) decides the reply shape, so it is awaited here
            const entityMatch = await entityCardPromise;
            const entityCard = entityMatch?.card || null;
            const cardMs = Date.now() - tLane;
            const triage = applyEntityCardToTriage(triageFromClassifier, entityCard);
            // as it is now when the matcher ran, else as the app sent it
            const anchor = entityMatch?.anchor || anchorEntity;
            const anchorDetail = anchor && !anchor.gone ? await anchorDetailPromise : null;

            console.log('[GeneralChat:Triage]', {
              mode: triage.mode,
              search: triage.search,
              personal: triage.personal,
              depth: triage.depth,
              // lookup and agent go to the agent for accounts on AGENT_CHAT (above)
              lane: triage.lane || null,
              anchored: anchor ? (anchor.gone ? 'gone' : true) : false,
            });

            const streamContext = { runningSummary: body.runningSummary || '' };

            // Build generation config using general chat persona
            const genConfig = buildGeneralChatConfig(
              triage,
              streamContext,
              body.accountCreatedAt,
              sessionContextStr,
              userProfile?.profileText,
              userTimezone,
              generalTodayActivity,
            );

            // Build messages with URL context if present
            const processedMessages = messages.map((msg, idx, arr) => {
              if (urlContext && idx === arr.length - 1 && msg.role === 'user') {
                return { ...msg, content: msg.content + urlContext };
              }
              return msg;
            });

            genConfig.systemPrompt += turnItemSections({
              match: entityMatch,
              card: entityCard,
              recent: body.recentEntity,
              anchor,
              mode: triage.mode,
              todayIso: todayIsoIn(userTimezone),
              detailText: itemDetailText(anchorDetail, todayIsoIn(userTimezone)),
              // their week, when the app sends it (with their week, or alone as weekly_day):
              // a habit's count this week is made in it
              weeklyDay: weeklyDayOf(body?.week?.weekly_day ?? body?.weekly_day),
            });
            // a World's or a Chapter's own chat: what is on its page
            if (pageAnchor) {
              const pageText = await pageDetailPromise;
              if (pageText) genConfig.systemPrompt += `\n\n${pageText}`;
            }
            // today's thread: the reply to the brief's question (a card's own
            // instructions come first when one is shown)
            if (!entityCard) genConfig.systemPrompt += briefQuestionSection(body.briefQuestion);
            // today's thread with no card: nothing changes, so nothing is claimed
            if (!entityCard && body.chatSurface === 'brief')
              genConfig.systemPrompt += briefNoCardSection();

            const chatMessages = [
              { role: 'system', content: genConfig.systemPrompt },
              ...processedMessages.filter((m) => m.role !== 'system'),
            ];

            // Search policy
            const searchPolicy = getSearchPolicy(triage.search);
            // Ask Gremly's writer (CHAT_MODEL_ASK); every call of this reply uses it
            const askWriter = {
              model: models().ask.model,
              effort: models().ask.effort,
              cacheKey: authenticatedUserId ? `ask:${authenticatedUserId}` : undefined,
            };
            const streamConfig = {
              label: 'general_chat',
              temperature: genConfig.temperature,
              maxOutputTokens: genConfig.maxTokens,
              thinkingLevel: genConfig.thinkingLevel,
              ...askWriter,
            };
            if (searchPolicy.attachTool) {
              streamConfig.tools = [makeWebSearchTool(userTimezone)];
            }

            const t0 = Date.now();

            const geminiRes = await geminiStream(
              genConfig.systemPrompt,
              chatMessages,
              streamConfig,
              env.GOOGLE_API_KEY,
            );

            if (!geminiRes.ok || !geminiRes.body) {
              const errText = geminiRes.error || 'unknown error';
              console.log('[GeneralChat:Streaming] Writer error', {
                model: askWriter.model,
                error: errText,
              });
              await writer.write(
                encoder.encode(`data: ${JSON.stringify({ error: errText, done: true })}\n\n`),
              );
              return;
            }

            // Stream processing — identical to space chat
            const reader = geminiRes.body.getReader();
            let buffer = '';
            let fullContent = '';
            let toolCalls = [];
            let modelResponseParts = [];
            let fillerBuffer = '';
            let fillerFlushed = false;

            try {
              // eslint-disable-next-line no-constant-condition
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || '';

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed === 'data: [DONE]') continue;
                  if (!trimmed.startsWith('data: ')) continue;
                  try {
                    const chunk = parseGeminiChunk(trimmed.slice(6));
                    const delta = chunk.text;
                    if (delta) {
                      fullContent += delta;
                      if (!fullContent.includes('<!--SAVE:')) {
                        if (!fillerFlushed) {
                          fillerBuffer += delta;
                          const hasBreak =
                            /[.?!]\s/.test(fillerBuffer) || fillerBuffer.length > 150;
                          if (hasBreak) {
                            const cleaned = stripFillerOpening(fillerBuffer);
                            if (cleaned) {
                              await writer.write(
                                encoder.encode(
                                  `data: ${JSON.stringify({ delta: cleaned, done: false })}\n\n`,
                                ),
                              );
                            }
                            fillerFlushed = true;
                          }
                        } else {
                          await writer.write(
                            encoder.encode(`data: ${JSON.stringify({ delta, done: false })}\n\n`),
                          );
                        }
                      }
                    }
                    if (chunk.functionCalls) {
                      for (const fc of chunk.functionCalls) {
                        toolCalls.push({
                          id: fc.id,
                          name: fc.name,
                          arguments: JSON.stringify(fc.args),
                        });
                        modelResponseParts.push({
                          functionCall: { name: fc.name, args: fc.args, id: fc.id },
                          thoughtSignature: fc.thoughtSignature,
                        });
                      }
                    }
                  } catch {
                    /* skip */
                  }
                }
              }

              // Flush remaining filler
              if (!fillerFlushed && fillerBuffer) {
                const cleaned = stripFillerOpening(fillerBuffer);
                if (cleaned) {
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify({ delta: cleaned, done: false })}\n\n`),
                  );
                }
              }
              fullContent = stripFillerOpening(fullContent);

              // Web search follow-up (same pattern as space chat)
              let sources = undefined;
              let searchQueries = [];
              const webSearchCalls = toolCalls.filter(
                (tc) => tc.name === 'web_search' && tc.arguments,
              );

              if (webSearchCalls.length > 0) {
                let firstQuery = '';
                try {
                  firstQuery = JSON.parse(webSearchCalls[0].arguments).query || '';
                } catch {
                  const m = webSearchCalls[0].arguments.match(/"query"\s*:\s*"([^"]+)"/);
                  firstQuery = m ? m[1] : '';
                }
                const searchNotice =
                  webSearchCalls.length > 1
                    ? `${firstQuery} (+${webSearchCalls.length - 1} more)`
                    : firstQuery;
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ searching: true, query: searchNotice })}\n\n`,
                  ),
                );

                const searchResults = await Promise.all(
                  webSearchCalls.map(async (tc) => {
                    try {
                      let query;
                      try {
                        query = JSON.parse(tc.arguments).query;
                      } catch {
                        const m = tc.arguments.match(/"query"\s*:\s*"([^"]+)"/);
                        query = m ? m[1] : null;
                      }
                      if (!query) return { toolCallId: tc.id, query: null, results: null };
                      searchQueries.push(query);
                      const results = await executeTavilySearch(query, env.TAVILY_API_KEY);
                      return { toolCallId: tc.id, query, results };
                    } catch {
                      return { toolCallId: tc.id, query: null, results: null };
                    }
                  }),
                );

                const successfulSearches = searchResults.filter(
                  (sr) => sr.results && sr.results.results.length > 0,
                );

                if (successfulSearches.length > 0) {
                  const originalContents = convertMessages(chatMessages);
                  if (fullContent) modelResponseParts.unshift({ text: fullContent });
                  const functionResults = successfulSearches.map((sr) => ({
                    name: 'web_search',
                    id: sr.toolCallId,
                    response: { results: formatSearchBrief(sr.results) },
                  }));
                  const followUpContents = buildFollowUpContents(
                    originalContents,
                    modelResponseParts,
                    functionResults,
                  );

                  const followUpRes = await geminiStream(
                    genConfig.systemPrompt,
                    [],
                    {
                      temperature: genConfig.temperature,
                      maxOutputTokens: Math.max(genConfig.maxTokens, 1200),
                      thinkingLevel: genConfig.thinkingLevel,
                      nativeContents: followUpContents,
                      ...askWriter,
                    },
                    env.GOOGLE_API_KEY,
                  );

                  const followUpReader = followUpRes.body.getReader();
                  let followUpBuffer = '';
                  let followUpFillerBuffer = '';
                  let followUpFillerFlushed = false;
                  let readerDone = false;
                  while (!readerDone) {
                    const result = await followUpReader.read();
                    readerDone = result.done;
                    if (readerDone) break;
                    followUpBuffer += decoder.decode(result.value, { stream: true });
                    const fLines = followUpBuffer.split('\n');
                    followUpBuffer = fLines.pop() || '';
                    for (const fl of fLines) {
                      const ft = fl.trim();
                      if (!ft.startsWith('data:')) continue;
                      const fj = ft.replace(/^data:\s*/, '').trim();
                      if (fj === '[DONE]') continue;
                      try {
                        const fc = parseGeminiChunk(fj);
                        const fd = fc.text;
                        if (fd) {
                          fullContent += fd;
                          if (!followUpFillerFlushed) {
                            followUpFillerBuffer += fd;
                            if (
                              /[.?!]\s/.test(followUpFillerBuffer) ||
                              followUpFillerBuffer.length > 150
                            ) {
                              const cleaned = stripFillerOpening(followUpFillerBuffer);
                              if (cleaned)
                                await writer.write(
                                  encoder.encode(
                                    `data: ${JSON.stringify({ delta: cleaned, done: false })}\n\n`,
                                  ),
                                );
                              followUpFillerFlushed = true;
                            }
                          } else {
                            await writer.write(
                              encoder.encode(
                                `data: ${JSON.stringify({ delta: fd, done: false })}\n\n`,
                              ),
                            );
                          }
                        }
                      } catch {
                        /* skip */
                      }
                    }
                  }
                  if (!followUpFillerFlushed && followUpFillerBuffer) {
                    const cleaned = stripFillerOpening(followUpFillerBuffer);
                    if (cleaned)
                      await writer.write(
                        encoder.encode(
                          `data: ${JSON.stringify({ delta: cleaned, done: false })}\n\n`,
                        ),
                      );
                  }
                  fullContent = stripFillerOpening(fullContent);
                  sources = successfulSearches.flatMap((sr) =>
                    sr.results.results.map((r) => ({ title: r.title, url: r.url })),
                  );
                }
              }

              // Search fallback
              if (webSearchCalls.length > 0 && !fullContent) {
                const fallbackResult = await geminiGenerate(
                  genConfig.systemPrompt +
                    '\n\nAnswer based on your existing knowledge. Do not mention search.',
                  chatMessages,
                  {
                    temperature: genConfig.temperature,
                    maxOutputTokens: genConfig.maxTokens,
                    thinkingLevel: genConfig.thinkingLevel,
                    ...askWriter,
                  },
                  env.GOOGLE_API_KEY,
                );
                fullContent = fallbackResult.ok
                  ? fallbackResult.content
                  : 'I had trouble with that. Could you rephrase?';
                fullContent = stripFillerOpening(fullContent);
                const words = fullContent.split(' ');
                for (let i = 0; i < words.length; i += 3) {
                  const chunk = words.slice(i, i + 3).join(' ') + ' ';
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify({ delta: chunk, done: false })}\n\n`),
                  );
                  await new Promise((r) => setTimeout(r, 15));
                }
              }

              const searchQuery = searchQueries.length > 0 ? searchQueries.join(' | ') : undefined;
              const { suggestion: smartSuggestion, cleanContent } =
                extractSaveSuggestion(fullContent);
              fullContent = cleanContent
                .replace(/<!--SAVE:.*?-->/gs, '')
                .replace(/<!--SAVE:.*$/s, '')
                .trim();
              const save_suggestion = smartSuggestion || null;

              const latency = Date.now() - t0;
              // the Save button under a reply worth keeping (Worlds rebuild, stage 2)
              const keep = await keepCheck(env, body, authenticatedUserId, fullContent);
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({
                    done: true,
                    full_content: fullContent,
                    save_suggestion,
                    entity_card: entityCard || null,
                    ...(keep ? { keep } : {}),
                    // whether the Save items pill and a late card may follow, so the
                    // app knows to wait for them (it watches for this turn's marker)
                    extraction:
                      body.chatId &&
                      authenticatedUserId &&
                      fullContent &&
                      !(models().flags.extractionV2 && NO_EXTRACTION_MODES.includes(triage.mode))
                        ? 'running'
                        : 'skipped',
                    timing: {
                      triage_ms: triageMs,
                      card_ms: cardMs,
                      pre_ms: t0 - tLane,
                      reply_ms: latency,
                    },
                    sources,
                    search_query: searchQuery,
                    latency_ms: latency,
                    fetchedUrl: fetchedUrl,
                  })}\n\n`,
                ),
              );

              console.log('[GeneralChat:Streaming] Complete', {
                model: askWriter.model,
                latency_ms: latency,
                content_length: fullContent.length,
              });

              // Corrections: when they say Gremly has something about their
              // life wrong, the context pipeline applies it straight away.
              // Every message is checked once, on its own turn, whatever the
              // reply's mode and whether or not anything is extracted from it.
              checkTurn({
                env,
                ctx,
                messages,
                reply: fullContent,
                chatId: body.chatId,
                userId: authenticatedUserId,
                surface: body.chatSurface === 'brief' ? 'brief' : 'chat',
                // a correction said in a World's or Chapter's own chat reaches that page's words
                scope: pageScopeOf(body),
                tag: 'GeneralChat',
              });

              // Running summary (fire-and-forget)
              if (body.chatId && authenticatedUserId && fullContent) {
                const summaryPromise = (async () => {
                  try {
                    const prevSummaryRes = await fetch(
                      `${env.SUPABASE_URL}/rest/v1/scope_chats?id=eq.${body.chatId}&select=running_summary`,
                      {
                        headers: {
                          apikey: env.SUPABASE_SERVICE_KEY,
                          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                        },
                      },
                    );
                    const prevData = prevSummaryRes?.ok
                      ? await prevSummaryRes.json().catch(() => [])
                      : [];
                    const previousSummary = prevData?.[0]?.running_summary || null;
                    await generateRunningSummary(
                      messages.filter((m) => m.role !== 'system'),
                      fullContent,
                      body.chatId,
                      null,
                      previousSummary,
                      env,
                      userTimezone,
                    );
                  } catch (err) {
                    console.warn('[GeneralChat] Summary failed:', err.message);
                  }
                })();
                ctx.waitUntil(summaryPromise);

                // A chat about one item keeps that item's chat summary, as the
                // old entity chat did: what the context jobs read about chats
                // on an item (get_recent_entity_chat_summaries) and what the
                // reply is told earlier chats about it covered (itemDetail.js).
                if (anchor && !anchor.gone) {
                  ctx.waitUntil(
                    generateEntityChatSummary(
                      messages.filter((m) => m.role !== 'system'),
                      fullContent,
                      anchor.id,
                      anchor.type,
                      anchor.title,
                      anchorDetail?.space || null,
                      anchorDetail?.summary || null,
                      env,
                      userTimezone,
                    ).catch((err) =>
                      console.warn('[GeneralChat] Item chat summary failed:', err.message),
                    ),
                  );
                }

                // Background extraction (fire-and-forget)
                const extractionV2 = models().flags.extractionV2;
                const extractionPromise = (async () => {
                  try {
                    if (extractionV2 && NO_EXTRACTION_MODES.includes(triage.mode)) {
                      console.log('[GeneralChat] Extraction skipped for mode', {
                        mode: triage.mode,
                      });
                      return;
                    }
                    const chatRes = await fetch(
                      `${env.SUPABASE_URL}/rest/v1/scope_chats?id=eq.${body.chatId}&select=saved_extraction_ids,dismissed_extractions,metadata_json`,
                      {
                        headers: {
                          apikey: env.SUPABASE_SERVICE_KEY,
                          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                        },
                      },
                    );
                    const chatData = chatRes.ok ? await chatRes.json().catch(() => []) : [];
                    const existing = chatData?.[0] || {};
                    const handledIds = [
                      ...(existing.saved_extraction_ids || []),
                      ...(existing.dismissed_extractions || []),
                    ];

                    // Fetch rolling summary + active todos/habits in parallel for dedup
                    const supaHeaders = {
                      apikey: env.SUPABASE_SERVICE_KEY,
                      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                    };
                    // The turn's item list (entityMatch.all) is the one the reply and the
                    // card used, so the pill reconciles against the same picture. The
                    // fetches below run only when the matcher did not (flag off, or failed).
                    const shared = Array.isArray(entityMatch?.all) ? entityMatch.all : null;
                    const [summaryRes, todosRes, habitsRes, notesRes] = await Promise.all([
                      fetch(
                        `${env.SUPABASE_URL}/rest/v1/scope_chats?id=eq.${body.chatId}&select=running_summary`,
                        { headers: supaHeaders },
                      ),
                      shared
                        ? null
                        : fetch(
                            `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${authenticatedUserId}&completed_at=is.null&archived=not.is.true&select=id,title,name,due_day,due_time&order=updated_at.desc&limit=80`,
                            { headers: supaHeaders },
                          ),
                      shared
                        ? null
                        : fetch(
                            `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${authenticatedUserId}&archived_at=is.null&select=id,title,name,frequency&limit=30`,
                            { headers: supaHeaders },
                          ),
                      shared
                        ? null
                        : fetch(
                            `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${authenticatedUserId}&archived=not.is.true&select=id,title,target_date,event_time,views&order=updated_at.desc&limit=20`,
                            { headers: supaHeaders },
                          ),
                    ]);
                    const summaryData = summaryRes.ok
                      ? await summaryRes.json().catch(() => [])
                      : [];
                    const runningSummary = summaryData?.[0]?.running_summary || null;
                    const rowsFromShared = shared ? trackedRowsFromItems(shared) : null;
                    const todosData = shared
                      ? rowsFromShared.todos
                      : todosRes?.ok
                        ? await todosRes.json().catch(() => [])
                        : [];
                    const habitsData = shared
                      ? rowsFromShared.habits
                      : habitsRes?.ok
                        ? await habitsRes.json().catch(() => [])
                        : [];
                    const notesData = shared
                      ? rowsFromShared.notes
                      : notesRes?.ok
                        ? await notesRes.json().catch(() => [])
                        : [];

                    // With entity cards on, the list carries ids so the extractor can
                    // record edits to tracked items (chatPrompts.js, EXTRACTION_EDITS_RULE)
                    const editsOn = extractionV2 && models().flags.entityCards;
                    const { block: existingItemsBlock, tracked } = trackedItemsBlock(
                      { todos: todosData, habits: habitsData, notes: notesData },
                      { editsOn, related: entityMatch?.related, card: entityCard },
                    );

                    const allMsgs = [
                      ...messages.filter((m) => m.role !== 'system'),
                      { role: 'assistant', content: fullContent },
                    ];
                    const recentMsgs = allMsgs.slice(-20);
                    const conversationText = recentMsgs
                      .map((m) => `${m.role === 'user' ? 'User' : 'Gremly'}: ${m.content}`)
                      .join('\n\n');

                    const todayStr = new Intl.DateTimeFormat('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      timeZone: userTimezone,
                    }).format(new Date());
                    let extractionPromptText = buildChatExtractionPrompt({
                      todayStr,
                      runningSummary,
                      conversationText,
                      handledIds,
                      existingItemsBlock,
                    });
                    if (extractionV2) extractionPromptText = withEvidenceRule(extractionPromptText);
                    if (editsOn) extractionPromptText = withEditsRule(extractionPromptText);

                    // CHAT_PILL_SPLIT=on: the pill is its own focused call (new and
                    // changed only) and the title and summary a separate small one,
                    // run together. Off: the single four-job call as before.
                    const pillSplit = models().flags.pillSplit && extractionV2 && editsOn;
                    let extractResult = null;
                    let lateCard = null;
                    try {
                      const extractReq = {
                        messages: [
                          {
                            role: 'system',
                            content: pillSplit
                              ? buildPillPrompt({ todayStr, conversationText, existingItemsBlock })
                              : extractionPromptText,
                          },
                          { role: 'user', content: 'Extract items from the conversation above.' },
                        ],
                        // 500 cut long chats off mid JSON (12 of 116 in the audit); v2 gives room
                        max_tokens: extractionV2 ? 2000 : 500,
                        temperature: pillSplit ? 0 : 0.1,
                      };
                      if (extractionV2) extractReq.response_format = { type: 'json_object' };
                      // the title on its own (the running summary is written once, above)
                      const summaryReq = pillSplit
                        ? {
                            messages: [
                              {
                                role: 'system',
                                content: buildTitlePrompt({ runningSummary, conversationText }),
                              },
                              { role: 'user', content: 'Write the title.' },
                            ],
                            max_tokens: 80,
                            temperature: 0.2,
                            response_format: { type: 'json_object' },
                          }
                        : null;
                      const [extractRes, summaryRes2] = await Promise.all([
                        helperFetch('chat_extraction', extractReq),
                        summaryReq ? helperFetch('chat_title', summaryReq) : null,
                      ]);
                      if (extractRes.ok) {
                        const extractJson = await extractRes.json();
                        const rawContent = extractJson.choices?.[0]?.message?.content || '';
                        extractResult = safeParseJson(rawContent);
                        if (pillSplit && extractResult) {
                          let summary = null;
                          if (summaryRes2?.ok) {
                            const sj = await summaryRes2.json().catch(() => null);
                            summary = safeParseJson(sj?.choices?.[0]?.message?.content || '');
                          }
                          extractResult.chat_summary = summary?.chat_summary || null;
                        }
                        if (
                          extractionV2 &&
                          extractResult &&
                          Array.isArray(extractResult.extractions)
                        ) {
                          // Evidence rule: drop anything not grounded in the user's own words
                          const userTexts = recentMsgs
                            .filter((m) => m.role === 'user')
                            .map((m) => String(m.content || ''));
                          const before = extractResult.extractions.length;
                          extractResult.extractions = extractResult.extractions.filter((x) =>
                            evidenceGrounded(x.evidence, userTexts),
                          );
                          // what the extractor itself marked as an existing item in
                          // other words: a note gets "add to", a todo or habit is
                          // left to its edit (nothing new to save)
                          if (editsOn) {
                            // a second, independent look at anything new against the
                            // same list the reply and the card used
                            extractResult.extractions = reconcileSameAs(
                              await checkNewAgainstTracked(
                                extractResult.extractions,
                                shared || [...tracked.values()],
                              ),
                              tracked,
                            );
                          }
                          if (before !== extractResult.extractions.length) {
                            console.log('[GeneralChat] Extraction evidence check dropped', {
                              dropped: before - extractResult.extractions.length,
                            });
                          }
                        }
                        if (editsOn && extractResult) {
                          // Existing means card, new means pill: the pill keeps only new
                          // things; every change to an existing item the extraction found
                          // (its own edits, add-tos from reconciliation, what the matcher
                          // heard in passing) is a card candidate, and one becomes a card
                          // under the reply, picked up by the app's poll.
                          const userTexts = recentMsgs
                            .filter((m) => m.role === 'user')
                            .map((m) => String(m.content || ''));
                          const candidate = lateCardCandidate(extractResult, tracked, userTexts, {
                            mention: entityMatch?.mention,
                            cardEntityId: entityCard?.entity?.id || null,
                            declinedId:
                              body.recentEntity?.status === 'declined'
                                ? body.recentEntity.id
                                : null,
                            aboutIds: (entityMatch?.related || []).map((c) => c.id),
                          });
                          extractResult.extractions = newItemsOnly(extractResult.extractions);
                          // offered only when their own words asked for it or decided it
                          const offered =
                            candidate.lateCard &&
                            (await offerLateCard({
                              card: candidate.lateCard,
                              message: lastUserMsg,
                              exchanges: extractRecentExchanges(messages),
                              todayStr,
                              todayIso: todayIsoIn(userTimezone),
                            }));
                          lateCard = offered ? candidate.lateCard : null;
                          if (candidate.editItems.length > 0) {
                            console.log(
                              '[GeneralChat] Extraction found changes to existing items',
                              {
                                edits: candidate.editItems.length,
                                candidate: candidate.lateCard
                                  ? candidate.lateCard.entity.title
                                  : null,
                                offered: !!lateCard,
                              },
                            );
                          }
                        }
                      }
                    } catch (parseErr) {
                      console.warn('[GeneralChat] Extraction parse error:', parseErr.message);
                    }
                    if (extractResult) {
                      await fetch(`${env.SUPABASE_URL}/rest/v1/scope_chats?id=eq.${body.chatId}`, {
                        method: 'PATCH',
                        headers: {
                          apikey: env.SUPABASE_SERVICE_KEY,
                          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                          'Content-Type': 'application/json',
                          Prefer: 'return=minimal',
                        },
                        body: JSON.stringify({
                          // a todo's day is a calendar day or nothing
                          extracted_items: withValidDays(extractResult.extractions || []),
                          auto_title: extractResult.chat_summary?.title || null,
                          // the late card for this turn, or none; the app polls for it
                          metadata_json: {
                            ...((existing && existing.metadata_json) || {}),
                            late_card: lateCard
                              ? { card: lateCard, at: new Date().toISOString() }
                              : null,
                            // the turn this extraction is for, so the app stops waiting
                            extracted_turn:
                              typeof body.turnId === 'string' ? body.turnId.slice(0, 40) : null,
                          },
                        }),
                      });
                      console.log('[GeneralChat] Extraction complete', {
                        items: (extractResult.extractions || []).length,
                        title: extractResult.chat_summary?.title,
                      });
                    }
                  } catch (err) {
                    console.warn('[GeneralChat] Extraction failed:', err.message);
                  }
                })();
                ctx.waitUntil(extractionPromise);
              }
            } catch (streamErr) {
              console.log('[GeneralChat:Streaming] Stream error', { error: String(streamErr) });
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ error: String(streamErr), done: true, full_content: fullContent })}\n\n`,
                ),
              );
            }
          } catch (outerErr) {
            console.error('[GeneralChat:Streaming] Outer error', { error: String(outerErr) });
            try {
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ error: String(outerErr), done: true })}\n\n`,
                ),
              );
            } catch {
              /* closed */
            }
          } finally {
            try {
              await writer.close();
            } catch {
              /* already closed */
            }
          }
        })();

        return new Response(readable, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        });
      }
      // ============================================================================
      // END GENERAL CHAT STREAMING
      // ============================================================================

      // ===================================================================
      // NON-STREAMING PATH (classify, entity-chat fallback, etc.)
      // ===================================================================
      const rlFallback = await checkIpRateLimit(request, env, 'misc', 30);
      if (!rlFallback.allowed) return rateLimitResponse('misc', rlFallback.count, rlFallback.limit);

      const lastUserMsgNonStream = messages.filter((m) => m.role === 'user').pop()?.content || '';

      const nonStreamModel = actualModel;
      const nonStreamMaxTokens = maxTokensValue;

      const openaiPayload = { model: nonStreamModel, messages, temperature, stream: false };

      if (nonStreamModel === models().legacyOpenAIChat || nonStreamModel === 'gpt-4o') {
        openaiPayload.max_completion_tokens = nonStreamMaxTokens;
      } else {
        openaiPayload.max_tokens = nonStreamMaxTokens;
      }

      // Use OpenAI for non-space-chat lanes
      const nonStreamUrl = 'https://api.openai.com/v1/chat/completions';
      const nonStreamAuthKey = key;

      const res = await fetch(nonStreamUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${nonStreamAuthKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(openaiPayload),
      });

      const oj = await res.json();

      if (!res.ok) {
        return j(
          { error: (oj && (oj.error?.message || oj.message)) || 'openai_error', code: res.status },
          200,
        );
      }

      // Handle remaining non-space-chat response
      let content = oj?.choices?.[0]?.message?.content ?? oj?.choices?.[0]?.text ?? '';
      let sources = undefined;
      let searchQuery = undefined;

      if (type === 'classify') {
        const rawContent = oj?.choices?.[0]?.message?.content ?? '';
        const cleaned = rawContent
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();

        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          return j({ error: 'classification_unparsable', raw: rawContent }, 200);
        }

        const VALID_BUCKETS = [
          'todo',
          'habit',
          'log-journal',
          'log-idea',
          'log-general',
          'unsorted',
        ];

        let bucket = (parsed.bucket || '').toLowerCase().trim();
        if (!VALID_BUCKETS.includes(bucket)) bucket = 'log-general';

        let confidence = Number(parsed.confidence ?? 50);
        if (!Number.isFinite(confidence)) confidence = 50;
        confidence = Math.max(0, Math.min(100, confidence));

        const tags = Array.isArray(parsed.tags)
          ? parsed.tags.map((t) => String(t)).slice(0, 5)
          : [];

        const title =
          typeof parsed.title === 'string' && parsed.title.trim().length > 0
            ? parsed.title.trim()
            : originalText.split(/\s+/).slice(0, 7).join(' ');

        return j({
          id: String(oj.id || crypto.randomUUID()),
          classification: {
            bucket,
            type: bucket === 'todo' ? 'todo' : bucket === 'habit' ? 'habit' : 'log',
            subtype:
              bucket === 'log-journal'
                ? 'journal'
                : bucket === 'log-idea'
                  ? 'idea'
                  : bucket === 'log-general'
                    ? 'general'
                    : null,
            category: bucket,
            tags,
            confidence,
            title,
          },
          aiTitle: title,
          aiTagsDebug: tags,
        });
      }

      if (type === 'habit-read') {
        return j(await handleHabitRead(body, env, authenticatedUserId, ctx));
      }

      // starters drawn from a note when its chat opens (itemDetail.js)
      if (type === 'item-topics') {
        return j(await handleItemTopics(body, env, authenticatedUserId));
      }

      // =========================
      // === FLOOR SUGGEST ===
      // Given a habit + upcoming calendar events, decide whether a genuine
      // disruption overlaps the plan window and, if so, return 2-3 smaller-
      // session floor ideas. Conservative: returns detected:false most weeks.
      // =========================
      if (type === 'floor-suggest') {
        const FLOOR_FALLBACK = { ok: true, detected: false };
        try {
          const habit = body.habit || {};
          const planWindow = body.planWindow || {};
          const events = Array.isArray(body.events) ? body.events : [];
          const eventNotes = Array.isArray(body.eventNotes) ? body.eventNotes : [];
          const todayISO = typeof body.todayISO === 'string' ? body.todayISO : '';
          const tz = typeof body.timezone === 'string' ? body.timezone : 'UTC';

          // Basic input validation
          if (!habit.id || !habit.name || !planWindow.start || !planWindow.end) {
            return j(FLOOR_FALLBACK);
          }

          const FLOOR_SUGGEST_SYSTEM = `You decide whether an upcoming stretch will make ONE specific habit hard to do, and if so, suggest smaller ways the user could still do it. You are given the habit and two sources of signal about the user's coming days: event-notes the user captured themselves, and synced calendar entries. Your job is judgment.

Treat the user's own event-notes as the primary, most trustworthy signal: they are things the user deliberately recorded as upcoming, and they carry the user's own description and intended dates. A calendar is a secondary, noisier source: it often holds only fragments of a plan and is full of routine obligations. When a calendar entry and an event-note plainly concern the same real-world plan, treat them as one situation and prefer the note's framing and dates for the span. A single calendar entry may be only one piece of a larger plan that the notes describe more fully; reason about what the whole situation is, not just the literal bounds of one calendar entry.

A real disruption is something that genuinely displaces the user's normal routine for one or more of the days they would do this habit: being physically away from home or their usual environment, or an unusual personal commitment that occupies enough of a day to crowd the habit out. Judge each signal on its meaning, not its format.

Do not treat the ordinary working week as a disruption. Recurring meetings and work obligations are normal life, however many there are. Ignore events that are not actually happening (cancelled), events that are observances rather than commitments, and events that concern other people rather than the user. Ignore brief obligations that leave the rest of the day intact.

Weigh the habit itself. Consider what this habit physically requires, its cadence, and how many times per period it targets, and judge whether the disruption genuinely threatens the user's ability to meet that frequency. A habit that needs particular conditions is more exposed to being away than one that can be done anywhere in moments. If the habit is a break_habit (the user is quitting or avoiding something), "hard" means contexts where the temptation or risk is higher, and your suggestions should help the user stay clear rather than do a smaller version.

If and only if you find a real disruption, suggest two or three smaller ways the user could still genuinely do this habit during it. These keep the same frequency goal; they lower the bar for what counts as one session, not the number of sessions. Make each suggestion specific to this habit and this disruption, derived from what the habit actually involves and what the user's situation will be. If the habit carries a saved floor note, you may build on it. For a break_habit, suggest protective tactics rather than smaller doses.

Keep each suggestion to a single short clause: the smallest action that still counts, stated plainly. Do not explain, justify, or add conditions. Aim for roughly six to ten words per suggestion. Brevity matters because these are shown as compact rows on a card; a long suggestion is worse than a short one.

Silence is the correct answer most weeks. If there is no clear, specific disruption overlapping the days for this habit in either source, return detected false. Never invent events, trips, locations, dates, or details not present in the input. Do not flag a disruption from weak or ambiguous signals.

Return ONLY JSON:
{
  "detected": boolean,
  "disruption": { "label": string, "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } | null,
  "lead_line": string | null,
  "ideas": string[],
  "confidence": number
}`;

          // Build payload prioritising eventNotes (primary signal) over events when truncating
          const basePayload = { habit, planWindow, todayISO, timezone: tz, eventNotes, events };
          let userPayload = JSON.stringify(basePayload);
          if (userPayload.length > 4000) {
            // Try with eventNotes intact but drop events
            const withoutEvents = JSON.stringify({
              habit,
              planWindow,
              todayISO,
              timezone: tz,
              eventNotes,
              events: [],
            });
            if (withoutEvents.length <= 4000) {
              userPayload = withoutEvents;
            } else {
              // Hard truncate as last resort
              userPayload = userPayload.slice(0, 4000);
            }
          }
          const truncatedPayload = userPayload;

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          let res;
          try {
            res = await helperFetch(
              'floor_suggest',
              {
                messages: [
                  { role: 'system', content: FLOOR_SUGGEST_SYSTEM },
                  { role: 'user', content: truncatedPayload },
                ],
                temperature: 0.4,
                max_completion_tokens: 500,
                response_format: { type: 'json_object' },
              },
              { signal: controller.signal },
            );
          } finally {
            clearTimeout(timeoutId);
          }

          const t0_fs = Date.now();

          if (!res.ok) {
            console.warn('[FloorSuggest] OpenAI error', { status: res.status, habit_id: habit.id });
            return j({ ...FLOOR_FALLBACK, source: 'api_error' });
          }

          const oj = await res.json();
          const latency = Date.now() - t0_fs;
          const raw = oj?.choices?.[0]?.message?.content ?? '{}';

          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch (_) {
            console.warn('[FloorSuggest] Parse failed', { habit_id: habit.id });
            return j({ ...FLOOR_FALLBACK, source: 'parse_fallback' });
          }

          // ── Validation ──
          try {
            // 1. detected must be exactly true to proceed
            if (parsed.detected !== true) {
              console.log('[FloorSuggest]', {
                habit_id: habit.id,
                detected: false,
                confidence: parsed.confidence ?? null,
                idea_count: 0,
                latency_ms: latency,
              });
              return j({ ok: true, detected: false });
            }

            // 2. confidence gate
            const confidence =
              typeof parsed.confidence === 'number'
                ? Math.max(0, Math.min(1, parsed.confidence))
                : 0;
            if (confidence < 0.55) {
              console.log('[FloorSuggest]', {
                habit_id: habit.id,
                detected: false,
                confidence,
                idea_count: 0,
                latency_ms: latency,
                gate: 'confidence',
              });
              return j({ ok: true, detected: false });
            }

            // 3. lead_line
            const leadLine =
              typeof parsed.lead_line === 'string' ? parsed.lead_line.trim().slice(0, 110) : null;
            if (!leadLine) {
              console.log('[FloorSuggest]', {
                habit_id: habit.id,
                detected: false,
                confidence,
                idea_count: 0,
                latency_ms: latency,
                gate: 'no_lead_line',
              });
              return j({ ok: true, detected: false });
            }

            // 4. ideas — trim at last word boundary before 90 chars (safety backstop only;
            // the prompt should already keep ideas short; this avoids mid-word chops)
            const rawIdeas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
            const ideas = rawIdeas
              .map((s) => {
                if (typeof s !== 'string') return '';
                const trimmed = s.trim();
                if (trimmed.length <= 90) return trimmed;
                const cut = trimmed.slice(0, 90);
                const lastSpace = cut.lastIndexOf(' ');
                return lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
              })
              .filter((s) => s.length > 0)
              .slice(0, 3);
            if (ideas.length === 0) {
              console.log('[FloorSuggest]', {
                habit_id: habit.id,
                detected: false,
                confidence,
                idea_count: 0,
                latency_ms: latency,
                gate: 'no_ideas',
              });
              return j({ ok: true, detected: false });
            }

            // 5. disruption window must overlap planWindow
            const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
            let disruption = null;
            if (
              parsed.disruption &&
              typeof parsed.disruption.label === 'string' &&
              isoDateRe.test(parsed.disruption.start) &&
              isoDateRe.test(parsed.disruption.end) &&
              parsed.disruption.start <= planWindow.end &&
              parsed.disruption.end >= planWindow.start
            ) {
              disruption = {
                label: parsed.disruption.label,
                start: parsed.disruption.start,
                end: parsed.disruption.end,
              };
            }
            if (!disruption) {
              console.log('[FloorSuggest]', {
                habit_id: habit.id,
                detected: false,
                confidence,
                idea_count: ideas.length,
                latency_ms: latency,
                gate: 'invalid_disruption_window',
              });
              return j({ ok: true, detected: false });
            }

            console.log('[FloorSuggest]', {
              habit_id: habit.id,
              detected: true,
              confidence,
              idea_count: ideas.length,
              latency_ms: latency,
            });

            return j({
              ok: true,
              detected: true,
              disruption,
              lead_line: leadLine,
              ideas,
              confidence,
            });
          } catch (validationErr) {
            console.warn('[FloorSuggest] Validation error', {
              habit_id: habit.id,
              error: validationErr.message,
            });
            return j({ ...FLOOR_FALLBACK, source: 'parse_fallback' });
          }
        } catch (err) {
          const isTimeout = err.name === 'AbortError';
          console.warn('[FloorSuggest] Error', {
            error: isTimeout ? 'timeout' : String(err.message),
            habit_id: body?.habit?.id,
          });
          return j({ ...FLOOR_FALLBACK, source: isTimeout ? 'timeout' : 'error' });
        }
      }

      return j({
        id: String((oj.id || '').replace(/^chatcmpl-/, 'cmpl-')),
        content,
        model: oj.model,
        usage: oj.usage || null,
        save_suggestion: null,
        sources,
        search_query: searchQuery,
      });
    } catch (err) {
      return j({ error: 'proxy_error', detail: String(err?.message || 'unknown') }, 200);
    }
  },
};

export default {
  async fetch(request, env, ctx) {
    installAiUsageLogging();
    globalThis.__aiUsageFallbackStore = { env, ctx, worker: 'cortex' };
    // job and userId are filled in once the handler has read the body and
    // checked the session. runId ties together every call this request makes.
    const usage = {
      env,
      ctx,
      worker: 'cortex',
      job: null,
      userId: null,
      runId: crypto.randomUUID(),
    };
    return aiContext.run(usage, () => cortexHandler.fetch(request, env, ctx));
  },
};

/** The day turn in inngest-jobs, for one message in today's thread. */
function askDayTurn(env, userId, body) {
  return fetchInngestWorker(env, '/api/day-turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': env.INNGEST_ADMIN_KEY },
    body: JSON.stringify({
      user_id: userId,
      text: typeof body.text === 'string' ? body.text.slice(0, 800) : '',
      question: typeof body.question === 'string' ? body.question.slice(0, 300) : null,
      history: Array.isArray(body.history) ? body.history.slice(-12) : [],
      date: typeof body.date === 'string' ? body.date : null,
      now: body.now,
      items: Array.isArray(body.items) ? body.items.slice(0, 80) : [],
      meetings: Array.isArray(body.meetings) ? body.meetings.slice(0, 40) : [],
      record: body.record && typeof body.record === 'object' ? body.record : null,
      plan: body.plan && typeof body.plan === 'object' ? body.plan : null,
    }),
  }).catch(() => null);
}

function j(obj, status = 200) {
  return Response.json
    ? Response.json(obj, {
        status,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      })
    : new Response(JSON.stringify(obj), {
        status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      });
}

// Safe JSON parser that handles markdown fences and malformed responses
function safeParseJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  // Strip markdown code fences
  s = s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  // Extract first {...} block if there's extra text
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
