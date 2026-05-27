/**
 * summaryFill — stage 4. Per-card, on the shipping model (Sonnet).
 *
 * One LLM call per card so a single schema violation drops just that card instead of poisoning
 * the deck, and so per-card failure is visible in the proving ground. FILL writes ONLY prose
 * fields; every number and list is deterministic, carried on candidate.fill_input, merged by the
 * template's assemble(). The prompt contains semantic rules and word caps but NO examples.
 */

import { jsonrepair } from 'jsonrepair';
import type { Candidate, SummaryCard } from './summaryTypes';
import { TEMPLATE_REGISTRY, type FillFieldSpec } from './summaryTemplates';

const DEFAULT_FILL_MODEL = 'claude-sonnet-4-6';

const TONE_RULES = [
  'Write in second person, directly to the user.',
  'Interpret, do not transcribe. Never simply restate a number the user can already see; give it meaning.',
  'Ground every claim only in the supplied evidence. Never invent a quote, a name, a number, or an event.',
  'Never console with a win that is not in the data. If the data is hard, be honest and kind, not falsely positive.',
  'No em dashes and no en dashes anywhere. Use commas or full stops.',
  'When referring to the companion, write "your Gremly" with a capital G.',
  'Never use the word should. Offer somewhere to stand, not an instruction.',
  'No streak language. Progress is a rolling window, never a streak that can break.',
  'Stay within the word cap on every field. Shorter is better than longer.',
  'Return only minified JSON with exactly the requested keys. No text outside the JSON, no markdown fences.',
].join('\n');

function buildPrompt(candidate: Candidate): { system: string; user: string } {
  const def = TEMPLATE_REGISTRY[candidate.template_id];
  const fieldLines = def.fill_fields
    .map((f: FillFieldSpec) => {
      const cap =
        f.max_words > 0
          ? ` (max ${f.max_words} words${f.required ? '' : ', optional'})`
          : f.required
            ? ''
            : ' (optional)';
      return `- ${f.key}${cap}: ${f.semantic}`;
    })
    .join('\n');

  const needsRec =
    candidate.recommendation_kind !== null &&
    def.fill_fields.some((f) => f.key === 'recommendation_text');

  const system = [
    'You write a single card in an honest, shame-free weekly reflection for the user of an app called Gremly.',
    "The app captures a person's notes, todos, habits and life threads. Your job is to turn structured findings into a few honest, warm, interpretive sentences.",
    '',
    "Required shape for this card's insight:",
    candidate.reframe_template,
    '',
    'Rules:',
    TONE_RULES,
  ].join('\n');

  const user = [
    'Fields to write (return as JSON with exactly these keys):',
    fieldLines,
    needsRec
      ? `- recommendation_text (max 30 words): a concrete next step matching the recommendation kind "${candidate.recommendation_kind}".`
      : '',
    '',
    'Evidence for this card (facts only; you may reference but must not alter any number or name):',
    JSON.stringify(candidate.fill_input),
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user };
}

async function callSonnet(
  env: Record<string, string>,
  system: string,
  user: string,
): Promise<Record<string, unknown>> {
  const model = env.SUMMARY_FILL_MODEL || DEFAULT_FILL_MODEL;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0.5,
      messages: [{ role: 'user', content: user }],
      system,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`FILL call failed: ${res.status} ${body.slice(0, 300)}`);
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

export interface FillOutcome {
  card: SummaryCard | null;
  attempts: number;
  errors: string[];
}

/**
 * Fill one card. Calls Sonnet, assembles the card (merging prose with deterministic body),
 * validates against the template, retries once on validation/parse failure, then drops (null).
 */
export async function fillCard(
  env: Record<string, string>,
  candidate: Candidate,
  fillModelLabel?: string,
): Promise<FillOutcome> {
  const def = TEMPLATE_REGISTRY[candidate.template_id];
  const { system, user } = buildPrompt(candidate);
  const errors: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const prose = await callSonnet(
        env,
        system,
        attempt === 1
          ? user
          : `${user}\n\nThe previous attempt was invalid. Return valid JSON within every word cap.`,
      );
      const card = def.assemble(prose, candidate);
      // Verbatim pass-throughs (grounding_quote, journal_quote) are set by assemble() from
      // fill_input, not generated by the model. They are exempt from word-cap validation.
      const v = def.validate(card);
      if (v.ok) return { card, attempts: attempt, errors };
      errors.push(`attempt ${attempt}: ${v.errors.join('; ')}`);
    } catch (err) {
      errors.push(`attempt ${attempt}: ${(err as Error).message}`);
    }
  }
  void fillModelLabel;
  return { card: null, attempts: 2, errors };
}
