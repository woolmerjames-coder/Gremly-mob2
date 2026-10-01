// Prompt variants under test. The Worker's prompts are untouched; a variant is
// the Worker prompt plus a block of semantic rules (no examples). If a variant
// wins on the practice set it is frozen, confirmed once on the locked set, and
// only then ported into the Worker behind the corpus gate.

// Triage v2: the rules the adjudication found missing from the definitions.
export const TRIAGE_RULES_V2 = `
Deciding between modes:
- A request for Gremly to produce something for the user (a list, a plan, a schedule, a recipe, a draft) is action_ready, even when producing it needs knowledge. Research is for information, options and recommendations the user will weigh themselves.
- A complaint or correction about Gremly itself (a wrong answer, something it forgot, something it keeps bringing up) is app_help when the user asks why Gremly behaves that way; otherwise classify the request that is still unanswered. Frustration aimed at Gremly is never venting or emotional.
- A feeling mentioned in passing before a clear request is context: use the mode of the request. The feeling wins only when it is the main thing being said.

Deciding depth:
- A vague opener that asks for help without saying with what is brief: Gremly should ask one question offering a few choices rather than guess at a plan.
- Detailed only when the user explicitly asks for a breakdown, a full plan, step by step, or a comparison in detail.

Deciding search:
- required only when the reply will name specific businesses, venues, products, prices, opening hours or local rules, or the effects, doses or interactions of a named substance.
- maybe for the general character of a place, its climate, broad ideas, and vague health questions.
- none for follow ups about timing, standard nutrition values, and anything about the user's own life, plans or the app.`;

export function applyTriageV2(oneCallPrompt) {
  const marker = 'Return ONLY JSON:';
  const i = oneCallPrompt.lastIndexOf(marker);
  return oneCallPrompt.slice(0, i).trimEnd() + '\n' + TRIAGE_RULES_V2 + '\n\n' + oneCallPrompt.slice(i);
}

// Extraction v2: every item must be grounded in the user's own words. The
// harness (and later the Worker) drops any item whose evidence does not appear
// in a user message, so nothing Gremly said can become a saved item on its own.
export const EXTRACTION_RULES_V2 = `
EVIDENCE: For every item, include "evidence": the user's own words, copied exactly from a User line, that show the commitment, decision or upcoming event. Something Gremly proposed counts only if the user then took it up in their own words, and the evidence must be those words. If the only support for an item is something Gremly said, do not extract it.
Do not extract plans for later the same day that this conversation is itself arranging, and do not extract anything that restates an item already tracked or already extracted in this conversation.`;

export function applyExtractionV2(prompt) {
  const marker = 'WRITING STYLE for title and body fields:';
  const i = prompt.indexOf(marker);
  let p = prompt.slice(0, i) + EXTRACTION_RULES_V2.trim() + '\n\n' + prompt.slice(i);
  p = p.replace('"body":"...","due_date"', '"body":"...","evidence":"...","due_date"');
  return p;
}

// Code side check for the evidence rule: most of the evidence words must occur
// together in one user message.
const toks = (s) => (String(s || '').toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) || []);
export function evidenceGrounded(evidence, userMessages) {
  const e = toks(evidence);
  if (e.length < 2) return false;
  for (const m of userMessages) {
    const set = new Set(toks(m));
    const hit = e.filter((t) => set.has(t)).length;
    if (hit / e.length >= 0.7) return true;
  }
  return false;
}
