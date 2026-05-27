/**
 * summaryTemplates — the typed template kit for v0.5.
 *
 * Each template declares:
 *   - family            : for the VARIETY composition rule (no two consecutive same family)
 *   - fill_fields       : the PROSE fields FILL must return, with word caps + semantic descriptions
 *                          (drives the FILL prompt AND validation; no examples, semantic only)
 *   - assemble()        : merges FILL prose with the detector's deterministic body data into a SummaryCard
 *                          (deterministic numbers/lists come from fill_input and are NEVER LLM-authored)
 *   - validate()        : enforces caps + required fields; FILL retries once on failure, then drops the card
 *
 * Schemas for hero_spine_v1 / then_now_split_v1 / letter_v1 are pixel-specified by the canonical
 * mockup. rank_list_v1 / constellation_v1 / big_number_v1 are derived from spec §5 for the Phase 3
 * inspection surface; their PRODUCT mockups are a Phase 4 prerequisite before the native renderer.
 */

import type {
  TemplateId,
  SummaryCard,
  Candidate,
  RecommendationKind,
  HeroSpineBody,
  ThenNowSplitBody,
  RankListBody,
  ConstellationBody,
  BigNumberBody,
  LetterBody,
} from './summaryTypes';

export interface FillFieldSpec {
  key: string;
  max_words: number;
  required: boolean;
  semantic: string; // description only; NO examples per house rule
}

export interface TemplateDef {
  id: TemplateId;
  family: string;
  fill_fields: FillFieldSpec[];
  assemble(prose: Record<string, unknown>, candidate: Candidate): SummaryCard;
  validate(card: SummaryCard): { ok: boolean; errors: string[] };
}

export function countWords(s: unknown): number {
  if (typeof s !== 'string') return 0;
  const t = s.trim();
  return t.length === 0 ? 0 : t.split(/\s+/).length;
}

// Common prose fields present on every non-hero, non-letter card.
const COMMON_FILL_FIELDS: FillFieldSpec[] = [
  {
    key: 'eyebrow_icon',
    max_words: 3,
    required: true,
    semantic: 'A single Lucide icon name fitting the finding.',
  },
  {
    key: 'eyebrow_text',
    max_words: 6,
    required: true,
    semantic: 'A short kicker naming what the card is about.',
  },
  {
    key: 'hero_sentence',
    max_words: 14,
    required: true,
    semantic: 'The headline of the card, interpreting not transcribing the data.',
  },
  {
    key: 'hero_continuation',
    max_words: 8,
    required: false,
    semantic: 'Optional italic accent continuing the headline.',
  },
  {
    key: 'insight',
    max_words: 55,
    required: true,
    semantic:
      'The reframe in the detector’s mandated shape; give the user somewhere to stand, grounded only in the supplied evidence.',
  },
];

function commonValidate(card: SummaryCard): string[] {
  const e: string[] = [];
  if (!card.type) e.push('missing type');
  if (!card.eyebrow_icon) e.push('missing eyebrow_icon');
  if (countWords(card.eyebrow_text) > 6) e.push('eyebrow_text > 6 words');
  if (!card.hero_sentence) e.push('missing hero_sentence');
  if (countWords(card.hero_sentence) > 14) e.push('hero_sentence > 14 words');
  if (card.hero_continuation && countWords(card.hero_continuation) > 8)
    e.push('hero_continuation > 8 words');
  if (!card.insight) e.push('missing insight');
  if (countWords(card.insight) > 55) e.push('insight > 55 words');
  if (card.recommendation && countWords(card.recommendation.text) > 30)
    e.push('recommendation > 30 words');
  if (!card.data_lineage_footer) e.push('missing data_lineage_footer');
  if (countWords(card.data_lineage_footer) > 18) e.push('data_lineage_footer > 18 words');
  return e;
}

function commonAssemble(prose: Record<string, unknown>, candidate: Candidate) {
  const recText = prose['recommendation_text'];
  const recommendation =
    candidate.recommendation_kind && typeof recText === 'string' && recText.trim()
      ? { kind: candidate.recommendation_kind as RecommendationKind, text: recText.trim() }
      : undefined;
  return {
    type: candidate.template_id,
    source_detector: candidate.detector_id,
    valence: candidate.valence,
    eyebrow_icon: String(prose['eyebrow_icon'] ?? ''),
    eyebrow_text: String(prose['eyebrow_text'] ?? ''),
    hero_sentence: String(prose['hero_sentence'] ?? ''),
    hero_continuation: prose['hero_continuation'] ? String(prose['hero_continuation']) : undefined,
    insight: String(prose['insight'] ?? ''),
    recommendation,
    concept_ref: null,
    data_lineage_footer: candidate.data_lineage,
  };
}

const RECOMMENDATION_FIELD: FillFieldSpec = {
  key: 'recommendation_text',
  max_words: 30,
  required: false,
  semantic: 'A concrete next step matching the recommendation kind; never uses the word should.',
};

// ───────────────────────────────────────────────────────────────────────────

export const TEMPLATE_REGISTRY: Record<TemplateId, TemplateDef> = {
  // ── hero_spine_v1 ──────────────────────────────────────────────────────────
  hero_spine_v1: {
    id: 'hero_spine_v1',
    family: 'hero',
    fill_fields: [
      {
        key: 'eyebrow_icon',
        max_words: 3,
        required: true,
        semantic: 'A single Lucide icon name for the week.',
      },
      {
        key: 'vibe_label',
        max_words: 4,
        required: true,
        semantic: 'A short lead-in label above the headline.',
      },
      {
        key: 'hero_sentence',
        max_words: 14,
        required: true,
        semantic: 'The emotional shape of the week in a few honest words.',
      },
      {
        key: 'subtitle',
        max_words: 18,
        required: true,
        semantic:
          'One sentence expanding the shape of the week from the supplied counts and mood pattern.',
      },
    ],
    assemble(prose, candidate) {
      const fi = candidate.fill_input as { hero_body: HeroSpineBody };
      const body: HeroSpineBody = {
        ...fi.hero_body,
        vibe_label: String(prose['vibe_label'] ?? 'This week'),
        subtitle: String(prose['subtitle'] ?? ''),
      };
      return {
        type: 'hero_spine_v1',
        source_detector: 'hero_spine',
        valence: 'neutral',
        eyebrow_icon: String(prose['eyebrow_icon'] ?? 'Sparkles'),
        eyebrow_text: '',
        hero_sentence: String(prose['hero_sentence'] ?? ''),
        insight: '',
        concept_ref: null,
        data_lineage_footer: candidate.data_lineage,
        body,
      };
    },
    validate(card) {
      const e: string[] = [];
      if (countWords(card.hero_sentence) > 14) e.push('hero_sentence > 14 words');
      const b = card.body as HeroSpineBody;
      if (!b || !Array.isArray(b.stats) || b.stats.length === 0) e.push('hero body missing stats');
      if (!b || !Array.isArray(b.mood_arc) || b.mood_arc.length !== 7)
        e.push('hero mood_arc must be 7 cells');
      if (countWords(b?.vibe_label) > 4) e.push('vibe_label > 4 words');
      if (countWords(b?.subtitle) > 18) e.push('subtitle > 18 words');
      return { ok: e.length === 0, errors: e };
    },
  },

  // ── then_now_split_v1 ───────────────────────────────────────────────────────
  then_now_split_v1: {
    id: 'then_now_split_v1',
    family: 'split',
    fill_fields: [
      ...COMMON_FILL_FIELDS,
      RECOMMENDATION_FIELD,
      {
        key: 'left_label',
        max_words: 4,
        required: true,
        semantic: 'Label for the intended/before side.',
      },
      {
        key: 'right_label',
        max_words: 4,
        required: true,
        semantic: 'Label for the settled/after side.',
      },
    ],
    assemble(prose, candidate) {
      // cadence_calibration_mismatch: left = intended target, right = settled actual.
      const fi = candidate.fill_input as {
        worst?: { title?: string; target?: number; hit_rate_pct?: number; avg_per_week?: number };
      };
      const w = fi.worst ?? {};
      const body: ThenNowSplitBody = {
        left: {
          label: String(prose['left_label'] ?? 'Intended'),
          value: `${w.target ?? 0}/week`,
          sub: String(w.title ?? ''),
          tone: 'positive',
        },
        right: {
          label: String(prose['right_label'] ?? 'Settled'),
          value: `${w.avg_per_week ?? 0}/week`,
          sub: `hit target ${w.hit_rate_pct ?? 0}% of weeks`,
          tone: 'amber',
        },
      };
      return { ...commonAssemble(prose, candidate), body };
    },
    validate(card) {
      const e = commonValidate(card);
      const b = card.body as ThenNowSplitBody;
      if (!b?.left?.value || !b?.right?.value) e.push('split missing left/right value');
      return { ok: e.length === 0, errors: e };
    },
  },

  // ── rank_list_v1 ──────────────────────────────────────────────────────────
  rank_list_v1: {
    id: 'rank_list_v1',
    family: 'list',
    fill_fields: [...COMMON_FILL_FIELDS, RECOMMENDATION_FIELD],
    assemble(prose, candidate) {
      // reschedule_as_soft_no: items grouped by tier.
      const fi = candidate.fill_input as {
        items?: { title: string; count: number; age_days: number; tier: string }[];
      };
      const items = fi.items ?? [];
      const tierOrder = ['10+ reschedules', '5-9 reschedules'];
      const tiers = tierOrder
        .map((tier_label) => ({
          tier_label,
          items: items
            .filter((i) => i.tier === tier_label)
            .map((i) => ({
              primary: i.title,
              secondary: `${i.count}x rescheduled · ${i.age_days}d old`,
            })),
        }))
        .filter((t) => t.items.length > 0);
      const body: RankListBody = { tiers };
      return { ...commonAssemble(prose, candidate), body };
    },
    validate(card) {
      const e = commonValidate(card);
      const b = card.body as RankListBody;
      if (!b?.tiers || b.tiers.length === 0) e.push('rank_list missing tiers');
      return { ok: e.length === 0, errors: e };
    },
  },

  // ── constellation_v1 ─────────────────────────────────────────────────────────
  constellation_v1: {
    id: 'constellation_v1',
    family: 'graph',
    fill_fields: [...COMMON_FILL_FIELDS],
    assemble(prose, candidate) {
      // cross_domain_alignment: aligned worlds as nodes.
      const fi = candidate.fill_input as { worlds?: { name: string; delta: string }[] };
      const nodes = (fi.worlds ?? []).map((w) => ({
        label: w.name,
        sublabel: w.delta === 'growing' ? 'growing' : 'holding steady',
      }));
      const body: ConstellationBody = { nodes };
      return { ...commonAssemble(prose, candidate), body };
    },
    validate(card) {
      const e = commonValidate(card);
      const b = card.body as ConstellationBody;
      if (!b?.nodes || b.nodes.length < 3) e.push('constellation needs >= 3 nodes');
      return { ok: e.length === 0, errors: e };
    },
  },

  // ── big_number_v1 ─────────────────────────────────────────────────────────
  big_number_v1: {
    id: 'big_number_v1',
    family: 'stat',
    fill_fields: [
      ...COMMON_FILL_FIELDS,
      {
        key: 'context_line',
        max_words: 24,
        required: true,
        semantic:
          'A single line giving the dominating number its meaning, naming the closed chapter.',
      },
    ],
    assemble(prose, candidate) {
      // decisive_closure: the dominating number is zero re-opens.
      const fi = candidate.fill_input as { chapter_title?: string; days_since_close?: number };
      const body: BigNumberBody = {
        number: '0',
        unit: 're-opens',
        context_line: String(
          prose['context_line'] ??
            `since closing "${fi.chapter_title ?? ''}" ${fi.days_since_close ?? 0} days ago`,
        ),
      };
      return { ...commonAssemble(prose, candidate), body };
    },
    validate(card) {
      const e = commonValidate(card);
      const b = card.body as BigNumberBody;
      if (!b?.number) e.push('big_number missing number');
      if (countWords(b?.context_line) > 24) e.push('context_line > 24 words');
      return { ok: e.length === 0, errors: e };
    },
  },

  // ── letter_v1 ────────────────────────────────────────────────────────────────
  letter_v1: {
    id: 'letter_v1',
    family: 'letter',
    fill_fields: [
      {
        key: 'eyebrow_icon',
        max_words: 3,
        required: true,
        semantic: 'A Lucide icon for the closing note.',
      },
      {
        key: 'paragraphs',
        max_words: 0,
        required: true,
        semantic:
          'Two or three short paragraphs to Monday-them, referencing the week’s actual threads by name and ending on at most one or two concrete gentle next steps. Return as an array of strings.',
      },
    ],
    assemble(prose, candidate) {
      const fi = candidate.fill_input as {
        signature: { name: string; level: number; state: string };
      };
      const paras = Array.isArray(prose['paragraphs'])
        ? (prose['paragraphs'] as unknown[]).map(String)
        : [];
      const body: LetterBody = { paragraphs: paras, signature: fi.signature };
      return {
        type: 'letter_v1',
        source_detector: 'letter',
        valence: 'neutral',
        eyebrow_icon: String(prose['eyebrow_icon'] ?? 'Mail'),
        eyebrow_text: '',
        hero_sentence: '',
        insight: '',
        concept_ref: null,
        data_lineage_footer: candidate.data_lineage,
        body,
      };
    },
    validate(card) {
      const e: string[] = [];
      const b = card.body as LetterBody;
      if (!b?.paragraphs || b.paragraphs.length < 2 || b.paragraphs.length > 3)
        e.push('letter needs 2-3 paragraphs');
      if (!b?.signature?.name) e.push('letter missing signature');
      return { ok: e.length === 0, errors: e };
    },
  },

  // ── single_sentence_v1 ───────────────────────────────────────────────────────
  single_sentence_v1: {
    id: 'single_sentence_v1',
    family: 'statement',
    fill_fields: [
      {
        key: 'eyebrow_icon',
        max_words: 3,
        required: true,
        semantic: 'A single Lucide icon name fitting the finding.',
      },
      {
        key: 'eyebrow_text',
        max_words: 6,
        required: true,
        semantic: 'A short kicker naming what the card is about.',
      },
      {
        key: 'hero_sentence',
        max_words: 22,
        required: true,
        semantic:
          'The single interpretation stated as one declarative sentence the user could not have written about themselves. Lead with the insight, not the event.',
      },
      {
        key: 'grounding',
        max_words: 28,
        required: false,
        semantic: 'One concrete observed detail that the claim rests on.',
      },
      {
        key: 'data_lineage_footer',
        max_words: 14,
        required: true,
        semantic: 'The evidence basis, plainly.',
      },
    ],
    assemble(prose, candidate) {
      const groundingQuote = candidate.fill_input['grounding_quote'] as string | undefined;
      return {
        type: 'single_sentence_v1',
        source_detector: candidate.detector_id,
        valence: candidate.valence,
        eyebrow_icon: String(prose['eyebrow_icon'] ?? ''),
        eyebrow_text: String(prose['eyebrow_text'] ?? ''),
        hero_sentence: String(prose['hero_sentence'] ?? ''),
        insight: String(prose['grounding'] ?? ''),
        concept_ref: null,
        data_lineage_footer: candidate.data_lineage,
        body: { grounding_quote: groundingQuote ?? null } as never,
      };
    },
    validate(card) {
      const e: string[] = [];
      if (!card.eyebrow_icon) e.push('missing eyebrow_icon');
      if (!card.hero_sentence) e.push('missing hero_sentence');
      if (countWords(card.hero_sentence) > 22) e.push('hero_sentence > 22 words');
      if (card.insight && countWords(card.insight) > 28) e.push('grounding > 28 words');
      if (!card.data_lineage_footer) e.push('missing data_lineage_footer');
      if (countWords(card.data_lineage_footer) > 14) e.push('data_lineage_footer > 14 words');
      return { ok: e.length === 0, errors: e };
    },
  },

  // ── evidence_chain_v1 ───────────────────────────────────────────────────────
  evidence_chain_v1: {
    id: 'evidence_chain_v1',
    family: 'chain',
    fill_fields: [
      {
        key: 'eyebrow_icon',
        max_words: 3,
        required: true,
        semantic: 'A single Lucide icon name fitting the finding.',
      },
      {
        key: 'eyebrow_text',
        max_words: 6,
        required: true,
        semantic: 'A short kicker naming what the card is about.',
      },
      {
        key: 'hero_sentence',
        max_words: 20,
        required: true,
        semantic: 'The interpretation as headline.',
      },
      {
        key: 'insight',
        max_words: 45,
        required: true,
        semantic: "What this reveals that the user can't see from inside it.",
      },
      {
        key: 'evidence_points',
        max_words: 0,
        required: true,
        semantic:
          'The chain of concrete observations, drawn from cluster_evidence_refs, that builds to the insight. Return as an array of 3-4 strings, each at most 12 words.',
      },
      {
        key: 'data_lineage_footer',
        max_words: 14,
        required: true,
        semantic: 'The evidence basis, plainly.',
      },
    ],
    assemble(prose, candidate) {
      const rawPoints = Array.isArray(prose['evidence_points'])
        ? (prose['evidence_points'] as unknown[]).map(String)
        : [];
      const groundingQuote = candidate.fill_input['grounding_quote'] as string | undefined;
      return {
        type: 'evidence_chain_v1',
        source_detector: candidate.detector_id,
        valence: candidate.valence,
        eyebrow_icon: String(prose['eyebrow_icon'] ?? ''),
        eyebrow_text: String(prose['eyebrow_text'] ?? ''),
        hero_sentence: String(prose['hero_sentence'] ?? ''),
        insight: String(prose['insight'] ?? ''),
        concept_ref: null,
        data_lineage_footer: candidate.data_lineage,
        body: { evidence_points: rawPoints, grounding_quote: groundingQuote ?? null } as never,
      };
    },
    validate(card) {
      const e: string[] = [];
      if (!card.eyebrow_icon) e.push('missing eyebrow_icon');
      if (!card.hero_sentence) e.push('missing hero_sentence');
      if (countWords(card.hero_sentence) > 20) e.push('hero_sentence > 20 words');
      if (!card.insight) e.push('missing insight');
      if (countWords(card.insight) > 45) e.push('insight > 45 words');
      const b = card.body as { evidence_points?: string[] };
      if (!b?.evidence_points || b.evidence_points.length < 3 || b.evidence_points.length > 4)
        e.push('evidence_chain needs 3-4 evidence_points');
      for (const pt of b?.evidence_points ?? [])
        if (countWords(pt) > 12) e.push(`evidence_point > 12 words: "${pt.slice(0, 20)}"`);
      if (!card.data_lineage_footer) e.push('missing data_lineage_footer');
      if (countWords(card.data_lineage_footer) > 14) e.push('data_lineage_footer > 14 words');
      return { ok: e.length === 0, errors: e };
    },
  },

  // ── photo_lead_v1 ────────────────────────────────────────────────────────────
  photo_lead_v1: {
    id: 'photo_lead_v1',
    family: 'media',
    fill_fields: [
      {
        key: 'eyebrow_icon',
        max_words: 3,
        required: true,
        semantic: 'A single Lucide icon name fitting the finding.',
      },
      {
        key: 'eyebrow_text',
        max_words: 6,
        required: true,
        semantic: 'A short kicker naming what the card is about.',
      },
      {
        key: 'hero_sentence',
        max_words: 18,
        required: true,
        semantic: "What the moment MEANT — the interpretation, not 'you did X'.",
      },
      {
        key: 'insight',
        max_words: 40,
        required: true,
        semantic: 'The pattern the moment is evidence for.',
      },
      {
        key: 'caption',
        max_words: 10,
        required: false,
        semantic: 'A short caption for the moment.',
      },
      {
        key: 'data_lineage_footer',
        max_words: 14,
        required: true,
        semantic: 'The evidence basis, plainly.',
      },
    ],
    assemble(prose, candidate) {
      const quote =
        (candidate.fill_input['journal_quote'] as string | undefined) ??
        (candidate.fill_input['grounding_quote'] as string | undefined) ??
        null;
      return {
        type: 'photo_lead_v1',
        source_detector: candidate.detector_id,
        valence: candidate.valence,
        eyebrow_icon: String(prose['eyebrow_icon'] ?? ''),
        eyebrow_text: String(prose['eyebrow_text'] ?? ''),
        hero_sentence: String(prose['hero_sentence'] ?? ''),
        insight: String(prose['insight'] ?? ''),
        concept_ref: null,
        data_lineage_footer: candidate.data_lineage,
        body: { quote, caption: prose['caption'] ? String(prose['caption']) : null } as never,
      };
    },
    validate(card) {
      const e: string[] = [];
      if (!card.eyebrow_icon) e.push('missing eyebrow_icon');
      if (!card.hero_sentence) e.push('missing hero_sentence');
      if (countWords(card.hero_sentence) > 18) e.push('hero_sentence > 18 words');
      if (!card.insight) e.push('missing insight');
      if (countWords(card.insight) > 40) e.push('insight > 40 words');
      const b = card.body as { caption?: string };
      if (b?.caption && countWords(b.caption) > 10) e.push('caption > 10 words');
      if (!card.data_lineage_footer) e.push('missing data_lineage_footer');
      if (countWords(card.data_lineage_footer) > 14) e.push('data_lineage_footer > 14 words');
      return { ok: e.length === 0, errors: e };
    },
  },
};

/** Convenience: the family for a template (VARIETY rule). */
export function templateFamily(id: TemplateId): string {
  return TEMPLATE_REGISTRY[id].family;
}
