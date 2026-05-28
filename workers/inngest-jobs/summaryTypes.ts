/**
 * summaryTypes — v0.7 contract.
 *
 * Architectural shift from v0.6: schemas strip slots that invite redundancy, and every
 * factual atom in the output carries a source reference back to inputs. Sonnet's narrative
 * work (through-line selection, framing, voice, interpretive footers, letter prose between
 * facts) stays unconstrained. Sonnet's factual claims (dates, quotes, named people, counts,
 * durations, weekday names) must trace to a specific input.
 *
 * The line: atoms cite, syntheses do not.
 *
 * Schema simplifications:
 *   moment   — drops headline and body.context; the quote and tiny attribution are the card
 *   question — drops headline; the question itself is the visual anchor
 *   stat     — drops headline; the big number is the visual anchor
 *   letter   — shortened (1 to 2 paragraphs, total ~100 words max in render guidance), and
 *              each paragraph carries its own sources array
 *
 * Pre-computed inputs (in HardFacts) so the model never has to infer:
 *   week.date_lookup        — every date in inputs to its weekday name
 *   user.address_as         — "second person only; do not use the user's first name"
 *   entities.user_name      — explicit user name with a marker that this name in any
 *                              observation refers to a different person
 *   entities.other_people   — known people in the user's life with their relationship
 *   mood_arc[].day_of_week  — weekday on each mood cell
 *   day_by_day[].day_of_week
 *   journal_quotes[].day_of_week
 */

// ── Identifiers ────────────────────────────────────────────────────────────

export type Valence = 'positive' | 'negative' | 'mixed' | 'neutral';

export type CardShape =
  | 'hero'
  | 'moment'
  | 'people'
  | 'pattern'
  | 'question'
  | 'stat'
  | 'timeline'
  | 'letter';

// ── Quality issue (emitted by the Haiku quality checker; consumed by polish) ──

export interface QualityIssue {
  card_index: number | null;
  issue: string;
  fix_hint: string;
}

// ── Source reference (citations) ───────────────────────────────────────────

/**
 * Source reference attached to a factual atom in output prose.
 *   observation    — points to an analyst observation by UUID
 *   journal_quote  — points to a specific journal quote by date (verbatim text exists in facts.journal_quotes)
 *   hard_fact      — points to a path inside HardFacts (e.g. "fed.days_in_window", "totals.todos_completed")
 *   date           — points to a specific date present in inputs
 */
export type SourceRef =
  | { type: 'observation'; id: string }
  | { type: 'journal_quote'; date: string }
  | { type: 'hard_fact'; path: string }
  | { type: 'date'; value: string };

// ── Hard-fact shapes ───────────────────────────────────────────────────────

export interface MoodArcCell {
  day_label: string; // 'F 22'
  date: string; // '2026-05-22'
  day_of_week: string; // 'Friday' (pre-computed; eliminates weekday hallucination)
  valence: Valence | null;
  moods: string[];
}

export interface DayActivity {
  date: string;
  day_of_week: string;
  drops: number;
  journals: number;
  sweeps: number;
  todos_created: number;
  todos_completed: number;
  is_fed: boolean;
}

export interface WorldChip {
  name: string;
  direction: 'up' | 'down' | 'flat';
  delta_text: string;
}

export interface JournalQuote {
  id: string; // synthetic id used in SourceRef; format 'q_<date>_<index>'
  date: string;
  day_of_week: string;
  text: string;
  source: 'journal' | 'drop_note';
}

export interface EvidenceFacts {
  rescheduled_todos: Array<{
    title: string;
    count: number;
    age_days: number;
  }>;
  habit_cadence_mismatches: Array<{
    title: string;
    target_per_week: number;
    actual_per_week: number;
    weeks_observed: number;
    hit_rate_pct: number;
  }>;
  chapter_closures: Array<{
    title: string;
    days_since_close: number;
    reopens: number;
  }>;
  aligned_worlds_count: number;
}

/**
 * Identity + relationship block. Solves the "user named James, son named James" disambiguation
 * problem by data, not by example.
 */
export interface EntitiesBlock {
  user_name: string | null; // the user's own first name (may be null if not captured)
  user_address_rule: string; // imperative rule for the writer about second-person address
  other_people: Array<{
    name: string;
    relationship?: string; // 'partner', 'mother', 'son', etc. when known from profile or observations
    source: 'user_profile' | 'observations';
  }>;
}

export interface HardFacts {
  user: {
    user_id: string;
    tenure_days: number;
    is_first_weekly: boolean;
    onboarding_at: string | null;
    current_tier: string;
    gremly_level: number;
    name: string | null;
    pronouns: string | null;
  };
  week: {
    canonical_start: string;
    canonical_end: string;
    display_start: string;
    display_end: string;
    days_in_display: number;
    /** Every date appearing anywhere in inputs, mapped to its weekday name. */
    date_lookup: Record<string, string>;
  };
  fed: {
    days_in_window: number;
    target: 7;
    graduated_this_window: boolean;
  };
  totals: {
    drops: number;
    journals: number;
    todos_created: number;
    todos_completed: number;
  };
  /** Pre-computed durations the writer would otherwise have to derive (and might botch). */
  durations: {
    days_since_onboarding: number;
    consecutive_zero_fed_weeks: number | null; // null when not applicable
    days_since_last_fed: number | null;
  };
  entities: EntitiesBlock;
  mood_arc: MoodArcCell[];
  day_by_day: DayActivity[];
  worlds: WorldChip[];
  journal_quotes: JournalQuote[];
  evidence: EvidenceFacts;
}

// ── Analyst brief (unchanged shape; depended on heavily for sources) ──────

export interface WeekShapeBrief {
  classification: string;
  dominant_theme: string;
  mood_arc_text: string;
  highlight: string;
  concern: string;
}

export interface AnalystObservationFull {
  id: string;
  kind: string;
  claim_summary: string;
  evidence_snapshot: Record<string, unknown>;
}

export interface PriorSurfacedAnchor {
  subject: string;
  observation_id_or_null: string | null;
  surfaced_at: string;
  classification_that_week: string | null;
}

export interface SummaryBrief {
  user_id: string;
  week_shape: WeekShapeBrief | null;
  observations: AnalystObservationFull[];
  prior_surfaced: PriorSurfacedAnchor[];
}

// ── Card body shapes (simplified, with sources) ────────────────────────────

export interface HeroBody {
  subtitle: string;
  classification_chip: string;
  mood_arc: { day_label: string; day_of_week: string; valence: Valence | null }[];
  stat_strip: { value: string; label: string; source: SourceRef }[];
  sources: SourceRef[];
}

/**
 * Moment card: just the quote and tiny attribution. No headline. No context field.
 * The quote is the visual anchor; nothing competes with it.
 */
export interface MomentBody {
  quote: string; // verbatim journal text
  attribution: string; // small text under quote
  source_journal_quote_id: string; // points to a facts.journal_quotes entry
  source_observation_id?: string; // analyst observation that surfaced this
}

export interface PeopleBody {
  headline: string; // interpretive framing
  people: { name: string; relationship?: string; emphasized?: boolean }[];
  beats?: { label: string; date: string; day_of_week: string; source: SourceRef }[];
  sources: SourceRef[];
}

export interface PatternBody {
  headline: string;
  items: { label: string; meta?: string; source: SourceRef }[];
  footer?: string; // interpretive; no source required
}

/**
 * Question card: the question is the visual anchor. There is no separate headline.
 * Grounding gives 1 to 2 sentences of support drawn from analyst observations.
 */
export interface QuestionBody {
  question: string; // one sentence ending with a question mark
  grounding: string; // 1 to 2 sentences of support
  sources: SourceRef[]; // observations the synthesis draws from
}

/**
 * Stat card: the number is the visual anchor. There is no separate headline.
 * Context is one short interpretive line; the number's source is required.
 */
export interface StatBody {
  number: string;
  unit: string;
  context: string;
  source: SourceRef;
}

export interface TimelineBody {
  headline: string;
  events: { date: string; day_of_week: string; label: string; source: SourceRef }[];
  footer?: string;
}

/**
 * Letter: short. One or two paragraphs. Each paragraph carries its own sources for the
 * factual atoms it contains (named people, dates, quote fragments). Interpretive sentences
 * inside a paragraph stay free.
 */
export interface LetterBody {
  paragraphs: Array<{
    text: string;
    sources: SourceRef[];
  }>;
  signature: { name: string; level: number; state: string };
}

export type CardBody =
  | HeroBody
  | MomentBody
  | PeopleBody
  | PatternBody
  | QuestionBody
  | StatBody
  | TimelineBody
  | LetterBody;

// ── Card and Deck ───────────────────────────────────────────────────────────

export interface Card {
  shape: CardShape;
  eyebrow: string;
  /**
   * Headline is only present on shapes where it adds value beyond the visual anchor.
   * For moment / question / stat cards, the visual anchor IS the lead and headline is absent.
   */
  headline?: string;
  body: CardBody;
  anchor?: {
    subject: string;
    observation_id?: string;
  };
}

export interface Deck {
  classification: string;
  through_line: string;
  cards: Card[];
  surfaced_anchors: SurfacedAnchor[];
}

export interface SurfacedAnchor {
  subject: string;
  observation_id: string | null;
  card_index: number;
  card_shape: CardShape;
}

export interface AdaptiveSummaryContent {
  content_version: 4;
  generated_for_week: string;
  classification: string;
  through_line: string;
  cards: Card[];
  metadata: {
    deck_size: number;
    card_shapes: CardShape[];
    fill_model: string;
    fill_attempts: number;
    fill_errors: string[];
    run_mode: 'shadow';
    user_tenure_days: number;
    is_first_weekly: boolean;
    fed_days_in_window: number;
  };
}
