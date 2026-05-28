/**
 * summaryWriter (v0.7) — Sonnet writes with pre-supplied facts and citation requirement.
 *
 * Architectural premise: Sonnet's hallucinations come from generating plausible-sounding
 * additions to fill prose. We address this by (a) pre-supplying every factual atom the
 * writer might otherwise invent (weekdays alongside dates, durations, entity identity
 * disambiguation), and (b) requiring source references on factual content in output.
 *
 * What stays free:  through-line choice, card selection, framing, interpretive prose,
 *                   tone, voice, the closing observation.
 * What is bound:    every factual atom in output (dates, named people, counts, durations,
 *                   weekday names, quotes) must trace to a source in inputs.
 *
 * Mechanism:
 *   1. The writer prompt declares: every card carries a sources array on factual elements.
 *      Each source is one of:
 *        { type: 'observation',   id: '<analyst-observation-uuid>' }
 *        { type: 'journal_quote', date: '<yyyy-mm-dd>' }
 *        { type: 'hard_fact',     path: '<dotted.path.in.facts>' }
 *        { type: 'date',          value: '<yyyy-mm-dd>' }
 *   2. The atom validator (deterministic) walks the output:
 *        - every YYYY-MM-DD date in prose must be in inputs
 *        - every standalone number >= 10 must be in inputs
 *        - every weekday word near a date must agree with that date's pre-computed weekday
 *        - every body.quote substring-matches an input journal quote
 *        - the user's own first name does not appear as a form of address
 *   3. The source validator (deterministic) walks every SourceRef in the deck and confirms
 *      the referenced observation_id / quote_id / fact path / date exists in inputs.
 *   4. The quality checker (Haiku, separate call) judges narrative coherence + visual-first
 *      compliance + letter tone semantically.
 *
 * Retry-once-then-fail-loud is unchanged.
 */

import { jsonrepair } from 'jsonrepair';
import type {
  HardFacts,
  SummaryBrief,
  Deck,
  Card,
  CardShape,
  HeroBody,
  MomentBody,
  PeopleBody,
  PatternBody,
  QuestionBody,
  StatBody,
  TimelineBody,
  LetterBody,
  SourceRef,
  QualityIssue,
} from './summaryTypes';

const DEFAULT_WRITER_MODEL = 'claude-sonnet-4-6';
const DEFAULT_CHECKER_MODEL = 'claude-haiku-4-5-20251001';

// ── Writer system prompt ───────────────────────────────────────────────────

const WRITER_SYSTEM = `You write the entire weekly summary deck for a single user of Gremly, an AI-powered life companion app.

The deck is ONE coherent narrative: a hero card naming the week's character, 2 to 5 middle cards illustrating the arc, and a closing letter that weaves the named threads. You decide which cards exist, what shape each card is, and how the through-line builds.

The analyst has already done the editorial curation. The week_shape brief is the editorial direction. The classification names the week's character. The highlight names the focal moment. The concern names what is structurally underneath.

WHAT STAYS YOUR JUDGMENT (no source needed):
- Which through-line to anchor the deck on
- Which observations to surface and which to skip
- Card shape selection per anchor
- Framing, voice, tone, interpretive prose
- Closing observations and interpretive footers

WHAT IS BOUND (must trace to inputs via sources):
- Every named person (from facts.entities; the user's own name is never used to address the user)
- Every date appearing in prose (from facts.week.date_lookup or analyst observations)
- Every weekday word in prose (the input gives you the weekday for every date; never guess)
- Every standalone number (from facts hard fields or analyst evidence)
- Every duration claim (from facts.durations; do not derive your own)
- Every verbatim journal quote (must substring-match a facts.journal_quotes entry)
- Compound factual claims (any statement of the form "X happened, then Y" requires citation of the observation or facts that establish it)

Hard rules:

- Never fabricate. If a fact is not in the inputs, do not write it.
- No em dashes and no en dashes anywhere. Use commas, full stops, or restructure.
- When referring to the companion, write "your Gremly" with a capital G.
- Never use the word "should".
- No streak language. Rolling windows only.
- No weekday words in any prose field. The seven weekday names ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday") appear ONLY in structured day_of_week fields where they are echoed from the input data (mood_arc cells, timeline events, people beats). In any prose (headlines, subtitles, footers, attributions, grounding paragraphs, letter paragraphs, card eyebrows, item labels), write dates as month and day or as yyyy-mm-dd, without the weekday name. The user interface renders the weekday from the date.
- Second person. Direct. Warm.
- Visual-first: each card has ONE visual anchor: a quote, a number, a list, a timeline, a set of people, a stat strip. Prose supports the visual; it does not lead.

Output JSON only, matching the schema below. No markdown fences. No prose outside the JSON.`;

// ── Schema reference ──────────────────────────────────────────────────────

const WRITER_SCHEMA_REFERENCE = `OUTPUT SCHEMA:

Return one JSON object:

{
  "classification": "<EXACT classification string from the brief>",
  "through_line": "<short phrase you choose that anchors the deck>",
  "cards": [
    /* card 1: ALWAYS shape='hero' */
    /* cards 2..N-1: 2 to 5 middle cards from {moment, people, pattern, question, stat, timeline} */
    /* card N: ALWAYS shape='letter' */
  ],
  "surfaced_anchors": [
    { "subject": "<noun phrase>", "observation_id": "<uuid or null>", "card_index": <1..N-2>, "card_shape": "<shape>" }
  ]
}

A SourceRef is one of:
  { "type": "observation",   "id": "<analyst observation UUID present in inputs>" }
  { "type": "journal_quote", "date": "<yyyy-mm-dd of a quote in facts.journal_quotes>" }
  { "type": "hard_fact",     "path": "<dotted path inside facts, like fed.days_in_window>" }
  { "type": "date",          "value": "<yyyy-mm-dd present in facts.week.date_lookup>" }

CARD SHAPES (eight; pick one per card based on what the data supports; do not invent shapes):

shape: 'hero'  ALWAYS card 1.
  eyebrow: short label, often a short form of the classification.
  headline: the interpretive lead sentence that names the week's character.
  body: {
    subtitle: one sentence expanding the headline,
    classification_chip: the classification echoed as a small chip,
    mood_arc: echo the mood_arc cells provided in facts (same day_label, day_of_week, valence per cell),
    stat_strip: 3 to 4 stats; each entry { value, label, source } where source cites the hard_fact path,
    sources: array of SourceRef listing observations or hard facts the hero draws from
  }

shape: 'moment'  When ONE dated journal quote carries the focal moment. The quote IS the card.
  eyebrow: short label, often a date with a brief characterization. No weekday word.
  (no headline; the quote is the visual anchor)
  body: {
    quote: VERBATIM journal text from facts.journal_quotes (substring match required),
    attribution: small text under the quote: the date (as month and day, or yyyy-mm-dd) and a brief context fragment if useful. Do NOT include the weekday name; the UI renders that from the date,
    source_journal_quote_id: the id of the facts.journal_quotes entry the quote came from,
    source_observation_id: optional; the analyst observation that surfaced this quote
  }

shape: 'people'  When one or more named people drove the week's emotional shape.
  eyebrow: short label.
  (no card-level headline; the headline lives inside body)
  body: {
    headline: a single sentence naming the arc,
    people: array of { name, relationship?, emphasized? }; names from facts.entities.other_people only,
    beats: optional array of { label, date, day_of_week, source } where source cites the observation that grounds the beat,
    sources: SourceRef array for the card overall
  }

shape: 'pattern'  When a short list IS the story. Minimal annotation.
  eyebrow: short label.
  (no card-level headline; the headline lives inside body)
  body: {
    headline: single sentence framing the list,
    items: 3 to 6 entries of { label, meta?, source } where source cites the fact or observation behind the item,
    footer: optional one-line interpretive comment (no source required; interpretation stays free)
  }

shape: 'question'  When the week IS asking a question. The question is the visual anchor.
  eyebrow: short label.
  (no headline; the question is the visual anchor)
  body: {
    question: one sharp sentence ending with a question mark,
    grounding: 1 to 2 sentences of supporting context,
    sources: SourceRef array; the analyst observations the synthesis draws from
  }

shape: 'stat'  When ONE big number carries a story.
  eyebrow: short label.
  (no headline; the number is the visual anchor)
  body: {
    number: the big number,
    unit: the unit of measurement for the number,
    context: short interpretive context,
    source: SourceRef to the fact or observation the number came from
  }

shape: 'timeline'  When a short arc IS the story.
  eyebrow: short label.
  (no card-level headline; the headline lives inside body)
  body: {
    headline: single sentence framing the arc,
    events: 2 to 5 entries of { date, day_of_week, label, source } where day_of_week and source are required,
    footer: optional interpretive comment
  }

shape: 'letter'  ALWAYS the last card. Keep it short.
  eyebrow: a short closing label.
  (no headline)
  body: {
    paragraphs: 1 to 2 paragraphs, each { text, sources } where sources cites the observations, dates, or facts referenced in that paragraph; aim for 30 to 50 words per paragraph,
    signature: { name: "Your Gremly", level: <from facts>, state: <from facts> }
  }

ON EACH MIDDLE CARD include an "anchor" field:
  { "subject": "<the central noun of the card>", "observation_id": "<uuid from observations OR null>" }

The hero does not need an anchor. The letter does not need an anchor.

CITATION RULES:

- Every entry that names a source (stat_strip items, pattern items, timeline events, moment quote, stat number) must populate its required source field with a valid SourceRef.
- The card-level sources array lists observations and facts the card synthesizes from; it is required on hero, people, question, and on every letter paragraph.
- Interpretive prose (subtitle on hero, footer on pattern or timeline, grounding sentences on question, prose between facts inside letter paragraphs) does NOT require its own citation. The card-level sources array covers it.
- Source values must reference inputs that actually exist: an observation id must be in the analyst observations list; a journal_quote date must match a facts.journal_quotes entry; a hard_fact path must be a real path inside the facts object; a date value must be a key in facts.week.date_lookup.

If you cannot honestly produce a deck because critical context is missing, return:
  { "classification": "<from brief or ''>", "through_line": "insufficient data", "cards": [], "surfaced_anchors": [] }

Return ONLY the JSON. No markdown fences. No prose outside the JSON.`;

// ── Quality-checker system prompt (Haiku) ──────────────────────────────────

const CHECKER_SYSTEM = `You are a quality editor for Gremly's weekly summary deck.

You read the analyst BRIEF (the editorial direction) and the DECK (the writer's output). You judge whether the deck honors the brief and the product's standards.

A good deck:
- Has ONE coherent narrative arc, anchored by the analyst's classification. The hero names the week's character; middle cards build the arc; the letter weaves the named threads.
- Each middle card has ONE clear visual anchor (a quote, a number, a list, a timeline, a set of people, a stat). Prose supports the anchor; it does not pad or lead.
- Surfaces what the analyst's highlight and concern actually name, without softening, moralizing, or burying them under surface metrics.
- The letter names the specific anchors from the middle cards (people, dates, quote fragments) when they exist. The letter is written in second person and never addresses the user by their own first name. The other_people in facts.entities are the names the letter weaves.
- Honest about what the week was. Doesn't perform warmth. Doesn't lecture. Doesn't end with a coaching nudge.
- Tone adheres: no em dashes, no en dashes, no "should", no streak language, "your Gremly" with capital G, second person.

THREE SPECIFIC THINGS TO BE RUTHLESS ABOUT:

1. QUESTION CARD SHARPNESS. A question card has no headline; the body.question is the visual anchor. The question must be one sharp sentence ending in a question mark. If the question is two sentences, or starts with a statement before the question, or runs over about fifteen words, flag it.

2. SHAPE FIT. If the analyst's highlight points to a single dated journal quote that carries the focal moment, the writer must use a MOMENT card rather than burying that quote inside a timeline or pattern card. If a single decisive number carries a story, the writer must use a STAT card. If the writer used a denser shape for content that wanted to be a moment or a stat, flag it and name the source quote or number plus the shape that fits.

3. LETTER TONE. The letter is a note from a companion, not an editorial wrap-up. It reads as someone speaking directly to the person at the end of their week, naming what they noticed, naming specific people and moments by name, closing without instruction. If the letter reads more like a thoughtful essay about the user than a note to the user, flag it. If the closing line directs the user toward an action (including questions phrased rhetorically to prompt next steps), flag it as a coaching nudge.

Read the BRIEF and the DECK. Return JSON only.

If the deck is good, return:
{ "ok": true, "issues": [] }

If you find issues, return:
{ "ok": false, "issues": [
  { "card_index": <number 0..N-1 or null>, "issue": "<concrete description>", "fix_hint": "<the concrete change required>" }
] }

Be specific. Vague single-sentence characterizations are insufficient. Each issue names the card by index, describes the concrete defect by quoting or paraphrasing what the prose actually contains and naming what is missing or extra relative to the criterion, and the fix_hint gives the concrete change required in writing terms, not an abstract concern.

You are checking, not rewriting. The writer will use your feedback.

Return ONLY the JSON. No markdown fences. No prose outside the JSON.`;

// ── User prompt assembly ───────────────────────────────────────────────────

function buildWriterUserPrompt(brief: SummaryBrief, facts: HardFacts): string {
  const sections: string[] = [];

  sections.push(
    `USER CONTEXT:
- tenure_days: ${facts.user.tenure_days}
- is_first_weekly: ${facts.user.is_first_weekly}
- onboarding: ${facts.user.onboarding_at ?? '(unknown)'}
- gremly_level: ${facts.user.gremly_level}
- current_tier: ${facts.user.current_tier}
- pronouns: ${facts.user.pronouns ?? '(unspecified)'}`,
  );

  sections.push(
    `WEEK RANGE:
- canonical: ${facts.week.canonical_start} to ${facts.week.canonical_end}
- display (clamped to onboarding): ${facts.week.display_start} to ${facts.week.display_end}
- days_in_display: ${facts.week.days_in_display}

DATE LOOKUP (every date appearing in inputs to its weekday; use these when you mention a weekday):
${JSON.stringify(facts.week.date_lookup, null, 0)}`,
  );

  sections.push(
    `ENTITIES (who's who; the writer uses these names; the user is never addressed by their own name):
${JSON.stringify(facts.entities, null, 2)}`,
  );

  if (brief.week_shape) {
    sections.push(
      `WEEK_SHAPE BRIEF (the analyst's editorial direction):
- classification: ${JSON.stringify(brief.week_shape.classification)}
- dominant_theme: ${JSON.stringify(brief.week_shape.dominant_theme)}
- mood_arc_text: ${JSON.stringify(brief.week_shape.mood_arc_text)}
- highlight: ${JSON.stringify(brief.week_shape.highlight)}
- concern: ${JSON.stringify(brief.week_shape.concern)}`,
    );
  } else {
    sections.push(`WEEK_SHAPE BRIEF: (missing; no analyst classification for this week)`);
  }

  sections.push(
    `HARD FACTS (objective ground truth; cite via hard_fact path like "fed.days_in_window"):

mood_arc:
${JSON.stringify(facts.mood_arc, null, 0)}

day_by_day_activity:
${JSON.stringify(facts.day_by_day, null, 0)}

worlds:
${JSON.stringify(facts.worlds, null, 0)}

fed:
- days_in_window: ${facts.fed.days_in_window}
- target: ${facts.fed.target}
- graduated_this_window: ${facts.fed.graduated_this_window}

totals:
- drops: ${facts.totals.drops}
- journals: ${facts.totals.journals}
- todos_completed: ${facts.totals.todos_completed}

durations (use these directly; do not derive your own):
- days_since_onboarding: ${facts.durations.days_since_onboarding}
- days_since_last_fed: ${facts.durations.days_since_last_fed ?? '(no fed day recorded)'}
- consecutive_zero_fed_weeks: ${facts.durations.consecutive_zero_fed_weeks ?? '(not applicable)'}

journal_quotes (VERBATIM; cite via journal_quote with date; quote field on moment cards must substring-match one of these):
${JSON.stringify(facts.journal_quotes, null, 0)}`,
  );

  sections.push(
    `DETERMINISTIC EVIDENCE (supporting detail; cite via hard_fact path when used):

rescheduled_todos (top by count):
${JSON.stringify(facts.evidence.rescheduled_todos, null, 0)}

habit_cadence_mismatches:
${JSON.stringify(facts.evidence.habit_cadence_mismatches, null, 0)}

chapter_closures:
${JSON.stringify(facts.evidence.chapter_closures, null, 0)}

aligned_worlds_count: ${facts.evidence.aligned_worlds_count}`,
  );

  // Observations grouped by kind, with IDs prominent
  const grouped = new Map<string, typeof brief.observations>();
  for (const o of brief.observations) {
    if (o.kind === 'week_shape') continue;
    const arr = grouped.get(o.kind) ?? [];
    arr.push(o);
    grouped.set(o.kind, arr);
  }
  const order = [
    'cross_reference',
    'magic_moment',
    'behavioral_fingerprint',
    'temporal_observation',
    'theme',
    'new_theme_candidate',
    'world_signal_candidate',
  ];
  const obsSection: string[] = [
    'ANALYST OBSERVATIONS (the depth, full curated set; cite via observation id):',
  ];
  const seenKinds = new Set<string>();
  for (const k of order) {
    const arr = grouped.get(k);
    if (!arr || arr.length === 0) continue;
    seenKinds.add(k);
    obsSection.push(`\n${k.toUpperCase()} (${arr.length}):`);
    for (const o of arr) {
      obsSection.push(`  id: ${o.id}`);
      if (o.claim_summary) obsSection.push(`  claim: ${JSON.stringify(o.claim_summary)}`);
      obsSection.push(`  evidence: ${JSON.stringify(o.evidence_snapshot)}`);
      obsSection.push('');
    }
  }
  for (const [k, arr] of grouped.entries()) {
    if (seenKinds.has(k)) continue;
    obsSection.push(`\n${k.toUpperCase()} (${arr.length}):`);
    for (const o of arr) {
      obsSection.push(`  id: ${o.id}`);
      if (o.claim_summary) obsSection.push(`  claim: ${JSON.stringify(o.claim_summary)}`);
      obsSection.push(`  evidence: ${JSON.stringify(o.evidence_snapshot)}`);
      obsSection.push('');
    }
  }
  sections.push(obsSection.join('\n'));

  if (brief.prior_surfaced.length > 0) {
    sections.push(
      `PREVIOUSLY SURFACED ANCHORS (last 6 weeks; you may evolve, skip, or ignore):
${JSON.stringify(brief.prior_surfaced, null, 0)}`,
    );
  } else {
    sections.push(`PREVIOUSLY SURFACED ANCHORS: (none; this user has no prior weekly summaries)`);
  }

  sections.push(WRITER_SCHEMA_REFERENCE);

  return sections.join('\n\n');
}

// ── API calls ──────────────────────────────────────────────────────────────

async function callAnthropic(
  apiKey: string,
  model: string,
  system: string,
  userMessage: string,
  maxTokens: number,
  temperature: number,
): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`anthropic call failed (${model}): ${res.status} ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join('')
    .trim();
  const jsonStr = text.startsWith('```')
    ? text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    : text;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return JSON.parse(jsonrepair(jsonStr));
  }
}

async function callWriter(
  env: Record<string, string>,
  userPrompt: string,
): Promise<Record<string, unknown>> {
  const model = env.SUMMARY_WRITER_MODEL || env.SUMMARY_FILL_MODEL || DEFAULT_WRITER_MODEL;
  return callAnthropic(env.ANTHROPIC_API_KEY, model, WRITER_SYSTEM, userPrompt, 4096, 0.4);
}

interface QualityCheckResult {
  ok: boolean;
  issues: QualityIssue[];
}

async function callQualityChecker(
  env: Record<string, string>,
  brief: SummaryBrief,
  deck: unknown,
): Promise<QualityCheckResult> {
  const model = env.SUMMARY_CHECKER_MODEL || DEFAULT_CHECKER_MODEL;
  const userPrompt = `BRIEF:
${JSON.stringify(
  {
    week_shape: brief.week_shape,
    observation_summaries: brief.observations.map((o) => ({
      id: o.id,
      kind: o.kind,
      claim: o.claim_summary,
    })),
  },
  null,
  2,
)}

DECK:
${JSON.stringify(deck, null, 2)}

Judge the deck against the criteria. Return JSON only.`;
  const raw = await callAnthropic(
    env.ANTHROPIC_API_KEY,
    model,
    CHECKER_SYSTEM,
    userPrompt,
    1500,
    0.2,
  );
  const ok = raw['ok'] === true;
  const issues = Array.isArray(raw['issues']) ? (raw['issues'] as QualityIssue[]) : [];
  return { ok, issues };
}

// ── Deterministic fact-check + source-ref validation ───────────────────────

const VALID_SHAPES = new Set<CardShape>([
  'hero',
  'moment',
  'people',
  'pattern',
  'question',
  'stat',
  'timeline',
  'letter',
]);

function isHero(c: { shape: unknown }): boolean {
  return c.shape === 'hero';
}
function isLetter(c: { shape: unknown }): boolean {
  return c.shape === 'letter';
}

function inputAllowedNumbers(brief: SummaryBrief, facts: HardFacts): Set<string> {
  const nums = new Set<string>();
  const re = /\b(\d{1,5})\b/g;
  const scan = (s: string): void => {
    for (const m of s.matchAll(re)) nums.add(m[1]);
  };
  scan(JSON.stringify(brief));
  scan(JSON.stringify(facts.evidence));
  scan(JSON.stringify(facts.totals));
  scan(JSON.stringify(facts.fed));
  scan(JSON.stringify(facts.durations));
  scan(`${facts.user.gremly_level}`);
  scan(`${facts.user.tenure_days}`);
  for (const d of facts.day_by_day) {
    nums.add(`${d.drops}`);
    nums.add(`${d.sweeps}`);
    nums.add(`${d.todos_completed}`);
  }
  return nums;
}

function quoteSubstringMatch(quote: string, allowed: string[]): boolean {
  const normalize = (s: string): string =>
    s
      .normalize('NFKD')
      .replace(/['\u2018\u2019]/g, "'")
      .replace(/["\u201c\u201d]/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const q = normalize(quote);
  if (q.length < 8) return true;
  for (const a of allowed) if (normalize(a).includes(q)) return true;
  return false;
}

// ── Weekday-in-prose ban (v0.7a structural fix) ────────────────────────────

const WEEKDAY_WORDS = new Set([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]);

const WEEKDAY_REGEX = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g;

/**
 * Walk every string field of an object, calling cb(path, str) for each. The path is dotted
 * with [index] for array entries (e.g., "body.events[2].label").
 */
function walkStrings(value: unknown, path: string, cb: (path: string, str: string) => void): void {
  if (typeof value === 'string') {
    cb(path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, cb));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walkStrings(v, path ? `${path}.${k}` : k, cb);
    }
  }
}

/**
 * The only fields where a weekday word is allowed:
 *   - Structured day_of_week fields echoed from the supplied inputs (mood_arc cells,
 *     timeline events, people beats). These are validated against date_lookup elsewhere.
 *   - The verbatim journal quote on a moment card (body.quote). This is user input copied
 *     verbatim from the original journal entry and may legitimately contain a weekday word
 *     because the user wrote one. Verbatim is verbatim.
 *
 * Everywhere else, a weekday word is prose hallucination territory and is rejected.
 */
function isStructuredWeekdayField(path: string): boolean {
  if (path.endsWith('.day_of_week')) return true;
  if (path === 'body.quote') return true;
  return false;
}

function validateNoWeekdayInProse(deck: unknown, errors: string[]): void {
  const cards = (deck as { cards?: Array<Record<string, unknown>> }).cards ?? [];
  cards.forEach((card, i) => {
    walkStrings(card, '', (path, str) => {
      if (isStructuredWeekdayField(path)) return;
      const matches = [...str.matchAll(WEEKDAY_REGEX)];
      if (matches.length === 0) return;
      const distinct = [...new Set(matches.map((m) => m[1]))];
      errors.push(
        `card[${i}] prose field "${path}" contains weekday word(s) [${distinct.join(', ')}]; weekdays appear only in structured day_of_week fields, never in prose. UI renders weekday from date.`,
      );
    });
  });
}

interface FactCheckResult {
  ok: boolean;
  errors: string[];
}

/** Validate source references against inputs (the new mechanism). */
function validateSourceRefs(
  deck: unknown,
  brief: SummaryBrief,
  facts: HardFacts,
  errors: string[],
): void {
  const obsIds = new Set(brief.observations.map((o) => o.id));
  const quoteDates = new Set(facts.journal_quotes.map((q) => q.date));
  const quoteIds = new Set(facts.journal_quotes.map((q) => q.id));
  const validHardFactPaths = new Set([
    'fed.days_in_window',
    'fed.target',
    'fed.graduated_this_window',
    'totals.drops',
    'totals.journals',
    'totals.todos_created',
    'totals.todos_completed',
    'durations.days_since_onboarding',
    'durations.days_since_last_fed',
    'durations.consecutive_zero_fed_weeks',
    'user.gremly_level',
    'user.current_tier',
    'user.tenure_days',
    'evidence.aligned_worlds_count',
    // Aliases (Sonnet often uses these short forms because they appear as section headings
    // in the user prompt; treat them as equivalent to the canonical paths above).
    'aligned_worlds_count',
    'day_by_day_activity',
  ]);
  // Also allow indexed paths into evidence arrays and worlds
  const isValidHardFactPath = (path: string): boolean => {
    if (validHardFactPaths.has(path)) return true;
    if (
      /^evidence\.(rescheduled_todos|habit_cadence_mismatches|chapter_closures)\[\d+\]\.\w+$/.test(
        path,
      )
    )
      return true;
    if (/^worlds\[\d+\]\.\w+$/.test(path)) return true;
    if (/^mood_arc\[\d+\]\.\w+$/.test(path)) return true;
    if (/^day_by_day\[\d+\]\.\w+$/.test(path)) return true;
    if (/^day_by_day_activity\[\d+\]\.\w+$/.test(path)) return true;
    return false;
  };
  const dateLookup = facts.week.date_lookup;

  const checkSource = (s: SourceRef, where: string): void => {
    if (!s || typeof s !== 'object' || !('type' in s)) {
      errors.push(`${where}: SourceRef missing 'type'`);
      return;
    }
    if (s.type === 'observation') {
      if (!obsIds.has(s.id))
        errors.push(`${where}: observation id "${s.id}" not in analyst observations`);
    } else if (s.type === 'journal_quote') {
      const d = (s as { date?: string }).date;
      const id = (s as { id?: string }).id;
      if (d && !quoteDates.has(d))
        errors.push(`${where}: journal_quote date "${d}" not in facts.journal_quotes`);
      if (id && !quoteIds.has(id))
        errors.push(`${where}: journal_quote id "${id}" not in facts.journal_quotes`);
      if (!d && !id) errors.push(`${where}: journal_quote source missing date or id`);
    } else if (s.type === 'hard_fact') {
      if (!isValidHardFactPath(s.path))
        errors.push(`${where}: hard_fact path "${s.path}" not recognized`);
    } else if (s.type === 'date') {
      if (!dateLookup[s.value])
        errors.push(`${where}: date "${s.value}" not in facts.week.date_lookup`);
    } else {
      errors.push(`${where}: unknown SourceRef type "${(s as { type: string }).type}"`);
    }
  };

  const checkArray = (arr: unknown, where: string): void => {
    if (!Array.isArray(arr)) {
      errors.push(`${where}: sources is not an array`);
      return;
    }
    arr.forEach((s, i) => checkSource(s as SourceRef, `${where}[${i}]`));
  };

  const cards = (deck as { cards?: unknown[] }).cards ?? [];
  cards.forEach((card, i) => {
    const c = card as { shape?: string; body?: Record<string, unknown> };
    const body = c.body ?? {};
    switch (c.shape) {
      case 'hero':
        checkArray(body['sources'], `card[${i}/hero].sources`);
        if (Array.isArray(body['stat_strip'])) {
          (body['stat_strip'] as Array<{ source?: SourceRef }>).forEach((s, j) => {
            if (s?.source) checkSource(s.source, `card[${i}/hero].stat_strip[${j}].source`);
            else errors.push(`card[${i}/hero].stat_strip[${j}] missing source`);
          });
        }
        break;
      case 'moment': {
        const b = body as { source_journal_quote_id?: string; source_observation_id?: string };
        if (!b.source_journal_quote_id)
          errors.push(`card[${i}/moment] missing source_journal_quote_id`);
        else if (!quoteIds.has(b.source_journal_quote_id))
          errors.push(
            `card[${i}/moment] source_journal_quote_id "${b.source_journal_quote_id}" not in facts.journal_quotes`,
          );
        if (b.source_observation_id && !obsIds.has(b.source_observation_id))
          errors.push(
            `card[${i}/moment] source_observation_id "${b.source_observation_id}" not in observations`,
          );
        break;
      }
      case 'people':
        checkArray(body['sources'], `card[${i}/people].sources`);
        if (Array.isArray(body['beats'])) {
          (body['beats'] as Array<{ source?: SourceRef }>).forEach((b, j) => {
            if (b?.source) checkSource(b.source, `card[${i}/people].beats[${j}].source`);
            else errors.push(`card[${i}/people].beats[${j}] missing source`);
          });
        }
        break;
      case 'pattern':
        if (Array.isArray(body['items'])) {
          (body['items'] as Array<{ source?: SourceRef }>).forEach((it, j) => {
            if (it?.source) checkSource(it.source, `card[${i}/pattern].items[${j}].source`);
            else errors.push(`card[${i}/pattern].items[${j}] missing source`);
          });
        }
        break;
      case 'question':
        checkArray(body['sources'], `card[${i}/question].sources`);
        break;
      case 'stat': {
        const b = body as { source?: SourceRef };
        if (!b.source) errors.push(`card[${i}/stat] missing source`);
        else checkSource(b.source, `card[${i}/stat].source`);
        break;
      }
      case 'timeline':
        if (Array.isArray(body['events'])) {
          (body['events'] as Array<{ source?: SourceRef }>).forEach((e, j) => {
            if (e?.source) checkSource(e.source, `card[${i}/timeline].events[${j}].source`);
            else errors.push(`card[${i}/timeline].events[${j}] missing source`);
          });
        }
        break;
      case 'letter':
        if (Array.isArray(body['paragraphs'])) {
          (body['paragraphs'] as Array<{ sources?: unknown }>).forEach((p, j) => {
            checkArray(p?.sources, `card[${i}/letter].paragraphs[${j}].sources`);
          });
        }
        break;
    }
  });
}

/** Validate factual atoms in prose against inputs (the existing mechanism, strengthened). */
function validateAtoms(
  deck: unknown,
  brief: SummaryBrief,
  facts: HardFacts,
  errors: string[],
): void {
  const flat = JSON.stringify(deck);

  // Dates
  const allowedDates = new Set<string>();
  for (const k of Object.keys(facts.week.date_lookup)) allowedDates.add(k);
  for (const q of facts.journal_quotes) allowedDates.add(q.date);
  const briefDates = JSON.stringify(brief).matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g);
  for (const m of briefDates) allowedDates.add(m[1]);
  for (const m of flat.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)) {
    if (!allowedDates.has(m[1])) errors.push(`fabricated date: ${m[1]}`);
  }

  // Numbers
  // Before scanning, strip patterns that contain numbers as structural components rather
  // than as content: ISO dates (2026-05-13 — the "13" is a day-of-month, not a fabrication)
  // and mood_arc day labels (W 13 — same). Without this, every date in the deck would
  // produce a spurious "fabricated number" hit.
  const flatForNumScan = flat
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, '')
    .replace(/\b[MTWFSU]\s\d{1,2}\b/g, '');
  const allowedNumbers = inputAllowedNumbers(brief, facts);
  for (const m of flatForNumScan.matchAll(/\b(\d{2,5})\b/g)) {
    const n = m[1];
    if (parseInt(n, 10) < 10) continue;
    if (/^20\d{2}$/.test(n)) continue;
    if (!allowedNumbers.has(n)) errors.push(`fabricated number: ${n}`);
  }

  // Body.quote substring match (existing mechanism)
  const allowedQuoteTexts = facts.journal_quotes.map((q) => q.text);
  const cards =
    (deck as { cards?: Array<{ shape?: string; body?: { quote?: unknown } }> }).cards ?? [];
  cards.forEach((c, i) => {
    if (c.shape !== 'moment') return;
    if (
      typeof c.body?.quote === 'string' &&
      !quoteSubstringMatch(c.body.quote, allowedQuoteTexts)
    ) {
      errors.push(`card[${i}] body.quote not a substring of any input journal quote`);
    }
  });

  // Weekday/date agreement for structured day_of_week fields (existing)
  validateWeekdayDateAgreement(deck, facts, errors);

  // Weekday-in-prose ban (v0.7a structural fix). Weekday words appear ONLY in structured
  // day_of_week fields; anywhere else is hallucination territory and rejected outright.
  validateNoWeekdayInProse(deck, errors);

  // User's own first name not used as a form of address
  if (facts.entities.user_name) {
    const userName = facts.entities.user_name;
    const re = new RegExp(`\\b${userName}\\b`, 'g');
    cards.forEach((c, i) => {
      if (c.shape !== 'letter') return;
      const body = c.body as { paragraphs?: Array<{ text?: string }> } | undefined;
      const paras = body?.paragraphs ?? [];
      paras.forEach((p, j) => {
        if (typeof p.text === 'string' && re.test(p.text)) {
          // Allow if the name is referring to another person also named the same.
          // We accept this only if entities.other_people contains the same name with
          // a relationship marker (i.e. there's an explicit different person with the
          // same name). Otherwise flag.
          const hasOtherSameName = facts.entities.other_people.some((p2) => p2.name === userName);
          if (!hasOtherSameName) {
            errors.push(
              `card[${i}/letter].paragraphs[${j}] addresses the user by first name "${userName}"`,
            );
          }
        }
      });
    });
  }

  // Tone hard rules
  if (/[\u2014\u2013]/.test(flat)) errors.push('output contains em or en dash');
  if (/\bshould\b/i.test(flat.replace(/"shape"\s*:\s*"\w+"/g, ''))) {
    errors.push('output contains the word "should"');
  }
}

function validateWeekdayDateAgreement(deck: unknown, facts: HardFacts, errors: string[]): void {
  const weekdays = new Set([
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ]);
  const months: Record<string, string> = {
    Jan: '01',
    January: '01',
    Feb: '02',
    February: '02',
    Mar: '03',
    March: '03',
    Apr: '04',
    April: '04',
    May: '05',
    Jun: '06',
    June: '06',
    Jul: '07',
    July: '07',
    Aug: '08',
    August: '08',
    Sep: '09',
    September: '09',
    Oct: '10',
    October: '10',
    Nov: '11',
    November: '11',
    Dec: '12',
    December: '12',
  };
  let defaultYear = '2026';
  for (const k of Object.keys(facts.week.date_lookup)) {
    const m = k.match(/^(20\d{2})-/);
    if (m) {
      defaultYear = m[1];
      break;
    }
  }

  const collectProse = (c: Record<string, unknown>): string => {
    const parts: string[] = [];
    if (typeof c.eyebrow === 'string') parts.push(c.eyebrow);
    if (typeof c.headline === 'string') parts.push(c.headline);
    const body = c.body as Record<string, unknown> | undefined;
    if (!body) return parts.join('  ');
    const walk = (v: unknown): void => {
      if (typeof v === 'string') parts.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        for (const val of Object.values(v as Record<string, unknown>)) walk(val);
      }
    };
    walk(body);
    return parts.join('  ');
  };

  const cards = (deck as { cards?: Array<Record<string, unknown>> }).cards ?? [];
  cards.forEach((card, idx) => {
    const text = collectProse(card);
    if (!text) return;
    type Hit = { pos: number; iso: string };
    const dateHits: Hit[] = [];
    for (const m of text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g))
      dateHits.push({ pos: m.index ?? 0, iso: m[1] });
    for (const m of text.matchAll(
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})\b/g,
    )) {
      const mm = months[m[1]];
      if (!mm) continue;
      const dd = m[2].padStart(2, '0');
      const iso = `${defaultYear}-${mm}-${dd}`;
      if (facts.week.date_lookup[iso]) dateHits.push({ pos: m.index ?? 0, iso });
    }
    if (dateHits.length === 0) return;
    type WHit = { pos: number; word: string };
    const wkHits: WHit[] = [];
    for (const m of text.matchAll(
      /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g,
    )) {
      if (weekdays.has(m[1])) wkHits.push({ pos: m.index ?? 0, word: m[1] });
    }
    for (const wk of wkHits) {
      let nearest: Hit | null = null;
      let dist = 46;
      for (const dt of dateHits) {
        const d = Math.abs(dt.pos - wk.pos);
        if (d < dist) {
          dist = d;
          nearest = dt;
        }
      }
      if (!nearest || dist > 45) continue;
      const expected = facts.week.date_lookup[nearest.iso];
      if (expected && expected !== wk.word) {
        errors.push(
          `card[${idx}] weekday/date mismatch: prose says "${wk.word}" but ${nearest.iso} is a ${expected}`,
        );
      }
    }
  });
}

function factCheckDeterministic(
  deck: unknown,
  brief: SummaryBrief,
  facts: HardFacts,
): FactCheckResult {
  const errors: string[] = [];

  if (!deck || typeof deck !== 'object') {
    errors.push('deck is not an object');
    return { ok: false, errors };
  }
  const d = deck as Record<string, unknown>;
  if (!Array.isArray(d.cards)) {
    errors.push('cards is not an array');
    return { ok: false, errors };
  }
  const cards = d.cards as Array<Record<string, unknown>>;
  if (cards.length === 0) {
    if (d.through_line === 'insufficient data') return { ok: true, errors: [] };
    errors.push('cards array is empty');
    return { ok: false, errors };
  }

  if (!isHero(cards[0])) errors.push('card 1 must be shape=hero');
  if (!isLetter(cards[cards.length - 1])) errors.push('last card must be shape=letter');

  cards.forEach((c, i) => {
    const shape = c.shape as CardShape;
    if (!VALID_SHAPES.has(shape)) {
      errors.push(`card[${i}] has unknown shape: ${String(shape)}`);
      return;
    }
    if (typeof c.eyebrow !== 'string') errors.push(`card[${i}] missing eyebrow`);
    // Only the hero requires a CARD-LEVEL headline. People, pattern, and timeline cards
    // carry their headline inside body.headline (checked by validateBodyStructure). The
    // remaining shapes (moment, question, stat, letter) have no headline at all because
    // their visual anchor IS the lead.
    const cardLevelHeadlineRequired = shape === 'hero';
    const cardLevelHeadlineForbidden = ['moment', 'question', 'stat', 'letter'].includes(shape);
    if (cardLevelHeadlineRequired && typeof c.headline !== 'string') {
      errors.push(`card[${i}/${shape}] missing card-level headline`);
    }
    if (
      cardLevelHeadlineForbidden &&
      c.headline &&
      typeof c.headline === 'string' &&
      c.headline.length > 0
    ) {
      errors.push(
        `card[${i}/${shape}] has a card-level headline but the visual anchor is the lead for this shape`,
      );
    }
    const body = c.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      errors.push(`card[${i}] missing body`);
      return;
    }
    validateBodyStructure(shape, body, i, errors);
  });

  validateSourceRefs(deck, brief, facts, errors);
  validateAtoms(deck, brief, facts, errors);
  validateHeroMoodArcLength(deck, facts, errors);

  return { ok: errors.length === 0, errors };
}

/**
 * The hero's mood_arc cells are echoed from facts.mood_arc. Their count must match exactly.
 * Sonnet sometimes pads with extra cells or trims; catch either way.
 */
function validateHeroMoodArcLength(deck: unknown, facts: HardFacts, errors: string[]): void {
  const cards = (deck as { cards?: Array<Record<string, unknown>> }).cards ?? [];
  const hero = cards[0];
  if (!hero || hero.shape !== 'hero') return;
  const body = hero.body as { mood_arc?: unknown } | undefined;
  if (!Array.isArray(body?.mood_arc)) return;
  const got = body.mood_arc.length;
  const want = facts.mood_arc.length;
  if (got !== want) {
    errors.push(`card[0/hero].mood_arc length ${got} != facts length ${want}`);
  }
}

function validateBodyStructure(
  shape: CardShape,
  body: Record<string, unknown>,
  i: number,
  errors: string[],
): void {
  const requireString = (field: string, val: unknown): void => {
    if (typeof val !== 'string' || val.length === 0)
      errors.push(`card[${i}/${shape}].${field} missing or empty`);
  };
  const requireArray = (field: string, val: unknown, minLen = 1): void => {
    if (!Array.isArray(val) || val.length < minLen)
      errors.push(`card[${i}/${shape}].${field} missing or empty`);
  };
  switch (shape) {
    case 'hero': {
      const b = body as Partial<HeroBody>;
      requireString('subtitle', b.subtitle);
      requireString('classification_chip', b.classification_chip);
      requireArray('mood_arc', b.mood_arc);
      requireArray('stat_strip', b.stat_strip);
      requireArray('sources', b.sources);
      break;
    }
    case 'moment': {
      const b = body as Partial<MomentBody>;
      requireString('quote', b.quote);
      requireString('attribution', b.attribution);
      requireString('source_journal_quote_id', b.source_journal_quote_id);
      break;
    }
    case 'people': {
      const b = body as Partial<PeopleBody>;
      requireString('headline', b.headline);
      requireArray('people', b.people);
      requireArray('sources', b.sources);
      break;
    }
    case 'pattern': {
      const b = body as Partial<PatternBody>;
      requireString('headline', b.headline);
      requireArray('items', b.items, 3);
      break;
    }
    case 'question': {
      const b = body as Partial<QuestionBody>;
      requireString('question', b.question);
      requireString('grounding', b.grounding);
      requireArray('sources', b.sources);
      if (typeof b.question === 'string' && !b.question.trim().endsWith('?')) {
        errors.push(`card[${i}/question].question does not end with a question mark`);
      }
      break;
    }
    case 'stat': {
      const b = body as Partial<StatBody>;
      requireString('number', b.number);
      requireString('unit', b.unit);
      requireString('context', b.context);
      if (!b.source) errors.push(`card[${i}/stat].source missing`);
      break;
    }
    case 'timeline': {
      const b = body as Partial<TimelineBody>;
      requireString('headline', b.headline);
      requireArray('events', b.events, 2);
      break;
    }
    case 'letter': {
      const b = body as Partial<LetterBody>;
      if (!Array.isArray(b.paragraphs) || b.paragraphs.length < 1 || b.paragraphs.length > 2)
        errors.push(`card[${i}] letter.paragraphs must have 1 or 2 entries`);
      else {
        for (const p of b.paragraphs) {
          if (!p || typeof p !== 'object') errors.push(`card[${i}] letter paragraph malformed`);
          else {
            if (typeof p.text !== 'string') errors.push(`card[${i}] letter paragraph missing text`);
            if (!Array.isArray(p.sources))
              errors.push(`card[${i}] letter paragraph missing sources array`);
          }
        }
      }
      if (!b.signature || typeof b.signature !== 'object')
        errors.push(`card[${i}] letter.signature missing`);
      break;
    }
  }
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export interface WriteDeckResult {
  deck: Deck | null;
  attempts: number;
  fact_errors: string[];
  quality_issues: QualityIssue[];
  attempt_1_fact_errors: string[];
  attempt_1_quality_issues: QualityIssue[];
  writer_model: string;
  checker_model: string;
  /**
   * The raw parsed JSON returned by the last writer call, regardless of whether validation
   * passed or failed. Populated on every code path that reaches the writer (including the
   * "deck: null" hard-fail case). Lets shadow telemetry persist what the writer actually
   * wrote even when it did not pass validation, so we can study the failure mode rather
   * than losing the data on the failure path.
   */
  last_attempted_raw: unknown | null;
}

export async function writeDeck(
  env: Record<string, string>,
  brief: SummaryBrief,
  facts: HardFacts,
): Promise<WriteDeckResult> {
  const writerModel = env.SUMMARY_WRITER_MODEL || env.SUMMARY_FILL_MODEL || DEFAULT_WRITER_MODEL;
  const checkerModel = env.SUMMARY_CHECKER_MODEL || DEFAULT_CHECKER_MODEL;
  const baseUserPrompt = buildWriterUserPrompt(brief, facts);

  let lastFactErrors: string[] = [];
  let lastQualityIssues: QualityIssue[] = [];
  let attempt1FactErrors: string[] = [];
  let attempt1QualityIssues: QualityIssue[] = [];
  let lastAttemptedRaw: unknown | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let userPrompt: string;
    if (attempt === 1) {
      userPrompt = baseUserPrompt;
    } else {
      const factLines: string[] = [];
      const qualityLines: string[] = [];
      for (const e of lastFactErrors) factLines.push(`  - ${e}`);
      for (const q of lastQualityIssues) {
        const idx = q.card_index === null ? 'deck-wide' : `card[${q.card_index}]`;
        qualityLines.push(`  - ${idx}: ${q.issue}`);
        qualityLines.push(`    avoid by: ${q.fix_hint}`);
      }
      userPrompt = `${baseUserPrompt}

REWRITE GUIDANCE:

A previous attempt at this deck was produced and failed evaluation. You are NOT editing that draft. You are writing the deck again from scratch against the same brief and facts above. Do not anchor on the previous attempt or attempt to make minimal edits to it. Write freshly.

The previous attempt had these specific defects that you must AVOID this time:

${factLines.length > 0 ? `Factual defects (deterministic, non-negotiable):\n${factLines.join('\n')}` : ''}

${qualityLines.length > 0 ? `Editorial defects (each must be avoided in this fresh write):\n${qualityLines.join('\n')}` : ''}

Now write the deck. Same brief, same facts, same schema. Address each defect by writing differently, not by editing the prior draft.

Return only the JSON. No commentary outside the JSON.`;
    }

    let raw: Record<string, unknown>;
    try {
      raw = await callWriter(env, userPrompt);
    } catch (err) {
      lastFactErrors = [`attempt ${attempt}: writer call failed: ${(err as Error).message}`];
      lastQualityIssues = [];
      continue;
    }
    lastAttemptedRaw = raw;

    const fc = factCheckDeterministic(raw, brief, facts);
    lastFactErrors = fc.errors;

    let qc: QualityCheckResult;
    try {
      qc = await callQualityChecker(env, brief, raw);
    } catch (err) {
      qc = {
        ok: false,
        issues: [
          {
            card_index: null,
            issue: `quality checker call failed: ${(err as Error).message}`,
            fix_hint: '(check API key or network)',
          },
        ],
      };
    }
    lastQualityIssues = qc.issues;

    if (attempt === 1) {
      attempt1FactErrors = [...fc.errors];
      attempt1QualityIssues = [...qc.issues];
    }

    // The retry-once logic applies to FACT errors only. Facts are non-negotiable. Quality
    // issues are the job of the polish pass downstream; the writer's role is to produce a
    // factually-clean deck. When fact_check passes, ship the deck even if quality_check
    // flagged issues. The orchestrator inspects quality_issues to decide whether polish
    // runs.
    if (fc.ok) {
      const deck: Deck = {
        classification: String(raw['classification'] ?? brief.week_shape?.classification ?? ''),
        through_line: String(raw['through_line'] ?? ''),
        cards: raw['cards'] as Card[],
        surfaced_anchors: (raw['surfaced_anchors'] as Deck['surfaced_anchors']) ?? [],
      };
      return {
        deck,
        attempts: attempt,
        fact_errors: [],
        quality_issues: qc.issues,
        attempt_1_fact_errors: attempt1FactErrors,
        attempt_1_quality_issues: attempt1QualityIssues,
        writer_model: writerModel,
        checker_model: checkerModel,
        last_attempted_raw: lastAttemptedRaw,
      };
    }
  }

  // Two attempts and fact_check still failing. Hard-fail with the writer's last attempt
  // raw output preserved in last_attempted_raw for telemetry.
  return {
    deck: null,
    attempts: 2,
    fact_errors: lastFactErrors,
    quality_issues: lastQualityIssues,
    attempt_1_fact_errors: attempt1FactErrors,
    attempt_1_quality_issues: attempt1QualityIssues,
    writer_model: writerModel,
    checker_model: checkerModel,
    last_attempted_raw: lastAttemptedRaw,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Polish pass (v0.7a)
//
// Runs ONLY on soft_pass decks (writer produced a valid deck with fact_errors empty
// but Haiku flagged editorial quality_issues). Critique-driven revision: takes the
// existing deck and the per-card critic notes, and rewrites ONLY the cards named in
// the notes. Preserves everything the writer chose (classification, through_line,
// card shapes, card order, anchors, sources). One pass max. If polish fails fact
// validation, caller falls back to the pre-polish deck.
//
// Cost shape: +1 Sonnet call + 1 Haiku call per soft_pass deck.
// ════════════════════════════════════════════════════════════════════════════

const POLISH_SYSTEM = `You are an editorial reviser for Gremly's weekly summary deck.

You receive an existing deck that another writer produced, the analyst brief that guided the writer, the hard facts the writer used, and a list of critic notes identifying specific cards with editorial defects.

Your job: rewrite ONLY the cards named in the critic notes. Address each named defect concretely in the named card. Preserve every other card verbatim, including its shape, eyebrow, sources, anchor, and structured fields.

What you MAY change in a named card:
- The prose (headlines, subtitles, footers, paragraphs, item labels, attributions, grounding sentences, letter paragraphs).
- The wording of question text or grounding text on a question card.
- Letter paragraphs entirely (within the 1 to 2 paragraph constraint).

What you MUST preserve verbatim, in every card (named or not):
- The deck's classification, through_line, and surfaced_anchors.
- Each card's shape.
- Each card's eyebrow if it is not specifically named in the defect.
- The number of cards and their order.
- All sources arrays. All source_journal_quote_id and source_observation_id values.
- All structured day_of_week fields, dates, and numbers cited from facts.
- The classification_chip, mood_arc, and stat_strip on the hero card unless explicitly flagged in a critic note for the hero.

Hard rules (unchanged from the writer):
- No em dashes and no en dashes. Use commas, full stops, or restructure.
- "your Gremly" with a capital G.
- Never use the word "should".
- No streak language. Rolling windows only.
- No weekday words in any prose field. The seven weekday names appear ONLY in structured day_of_week fields, which you do not modify. In any prose, dates are written as month and day or as yyyy-mm-dd, without the weekday name.
- Second person. Direct. Warm.
- Never fabricate. Every factual atom must trace to inputs the writer was given.

When rewriting, address the specific defect named in the critic note for that card. If the note says "question card body contains two sentences before the question", produce a body where the question is a single sharp sentence ending with a question mark, with no preceding statement. If the note says "letter tone reads as editorial reflection rather than note to user", produce paragraphs that speak directly to the user in second person, name specific anchors from the middle cards by name, and close without a coaching nudge.

Output JSON only. The full deck object with the same top-level shape as the input deck (classification, through_line, cards, surfaced_anchors). Cards that were named in critic notes have their prose revised. Cards not named are byte-identical to the input. No markdown fences. No prose outside the JSON.`;

function buildPolishUserPrompt(
  deck: Deck,
  brief: SummaryBrief,
  facts: HardFacts,
  byCard: Map<number, QualityIssue[]>,
): string {
  const critiqueLines: string[] = [];
  const indices = [...byCard.keys()].sort((a, b) => a - b);
  for (const i of indices) {
    const issues = byCard.get(i) ?? [];
    critiqueLines.push(`\nCard [${i}] (shape: ${deck.cards[i]?.shape ?? 'unknown'}):`);
    for (const q of issues) {
      critiqueLines.push(`  - DEFECT: ${q.issue}`);
      if (q.fix_hint) critiqueLines.push(`    FIX: ${q.fix_hint}`);
    }
  }

  return `EXISTING DECK (the writer's output that you are revising):
${JSON.stringify(deck, null, 2)}

ANALYST BRIEF (the editorial direction the writer was given):
${JSON.stringify({ week_shape: brief.week_shape, observations_summary: brief.observations.map((o) => ({ id: o.id, kind: o.kind, claim: o.claim_summary })) }, null, 2)}

ENTITIES (names the writer can use; the user is never addressed by their own first name):
${JSON.stringify(facts.entities, null, 2)}

DATE LOOKUP (every date maps to its weekday; weekdays are STRUCTURED data only, never in prose):
${JSON.stringify(facts.week.date_lookup, null, 0)}

CRITIC NOTES (per-card defects to address; only cards listed here may be rewritten):
${critiqueLines.join('\n')}

Rewrite ONLY the cards named above to address the specific defects. Preserve all other cards byte-for-byte. Return the full revised deck JSON with classification, through_line, cards, and surfaced_anchors at top level.

Return ONLY the JSON. No markdown fences. No commentary outside the JSON.`;
}

async function callPolish(
  env: Record<string, string>,
  userPrompt: string,
): Promise<Record<string, unknown>> {
  const model = env.SUMMARY_WRITER_MODEL || env.SUMMARY_FILL_MODEL || DEFAULT_WRITER_MODEL;
  return callAnthropic(env.ANTHROPIC_API_KEY, model, POLISH_SYSTEM, userPrompt, 4096, 0.3);
}

export type PolishOutcome =
  | 'not_applicable' // no card-specific quality_issues (only deck-wide notes or no notes at all)
  | 'applied' // polish ran, polished deck passed fact validation
  | 'failed_validation' // polish ran but polished deck failed deterministic fact check
  | 'failed_call'; // polish call threw

export interface PolishDeckResult {
  polished_deck: Deck | null;
  polished_raw: unknown | null;
  outcome: PolishOutcome;
  errors: string[];
  post_polish_quality_issues: QualityIssue[] | null;
}

/**
 * Polish a soft_pass deck against per-card critic notes.
 *
 * Returns the polished deck if the polish call ran AND the polished output passes the same
 * deterministic fact-check that the writer's output had to pass. If the polished output
 * fails fact validation, returns polished_deck: null with outcome 'failed_validation' and
 * the validation errors. Caller is expected to fall back to the pre-polish deck in that
 * case.
 */
export async function polishDeck(
  env: Record<string, string>,
  deck: Deck,
  brief: SummaryBrief,
  facts: HardFacts,
  qualityIssues: QualityIssue[],
): Promise<PolishDeckResult> {
  // Group card-specific issues. Deck-wide issues (card_index null) are not polishable here.
  const byCard = new Map<number, QualityIssue[]>();
  for (const q of qualityIssues) {
    if (q.card_index === null) continue;
    const arr = byCard.get(q.card_index) ?? [];
    arr.push(q);
    byCard.set(q.card_index, arr);
  }

  if (byCard.size === 0) {
    return {
      polished_deck: null,
      polished_raw: null,
      outcome: 'not_applicable',
      errors: [],
      post_polish_quality_issues: null,
    };
  }

  const userPrompt = buildPolishUserPrompt(deck, brief, facts, byCard);

  let raw: Record<string, unknown>;
  try {
    raw = await callPolish(env, userPrompt);
  } catch (err) {
    return {
      polished_deck: null,
      polished_raw: null,
      outcome: 'failed_call',
      errors: [`polish call failed: ${(err as Error).message}`],
      post_polish_quality_issues: null,
    };
  }

  // The polished output must pass the same fact check the writer's output had to pass.
  const fc = factCheckDeterministic(raw, brief, facts);
  if (!fc.ok) {
    return {
      polished_deck: null,
      polished_raw: raw,
      outcome: 'failed_validation',
      errors: fc.errors,
      post_polish_quality_issues: null,
    };
  }

  // Re-run quality check on the polished deck for telemetry. We do not loop on its output;
  // one polish pass max, regardless of whether new issues remain.
  let post_polish_quality_issues: QualityIssue[] = [];
  try {
    const qc = await callQualityChecker(env, brief, raw);
    post_polish_quality_issues = qc.issues;
  } catch {
    post_polish_quality_issues = [];
  }

  const polished_deck: Deck = {
    classification: String(raw['classification'] ?? deck.classification),
    through_line: String(raw['through_line'] ?? deck.through_line),
    cards: raw['cards'] as Card[],
    surfaced_anchors:
      (raw['surfaced_anchors'] as Deck['surfaced_anchors']) ?? deck.surfaced_anchors,
  };

  return {
    polished_deck,
    polished_raw: raw,
    outcome: 'applied',
    errors: [],
    post_polish_quality_issues,
  };
}
