// ============================================================================
// chatPrompts.js: prompt builders for the helper calls around a chat turn that
// the audit harness (scripts/chat-audit) needs to run exactly as the Worker does.
// Moved here verbatim from cortex-index.js; the text is unchanged.
// ============================================================================

/**
 * Ask Gremly background extraction (the Save items pill).
 * @param {{todayStr: string, runningSummary: string|null, conversationText: string, handledIds: string[], existingItemsBlock: string}} p
 */
// The evidence rule tested in the chat helper model audit (round 2). Text is
// identical to scripts/chat-audit/prompts/variants.mjs, where it was frozen.
export const EXTRACTION_EVIDENCE_RULE = `EVIDENCE: For every item, include "evidence": the user's own words, copied exactly from a User line, that show the commitment, decision or upcoming event. Something Gremly proposed counts only if the user then took it up in their own words, and the evidence must be those words. If the only support for an item is something Gremly said, do not extract it.
Do not extract plans for later the same day that this conversation is itself arranging, and do not extract anything that restates an item already tracked or already extracted in this conversation.`;

/** Add the evidence rule to a built extraction prompt (the audit's applyExtractionV2). */
export function withEvidenceRule(prompt) {
  const marker = 'WRITING STYLE for title and body fields:';
  const i = prompt.indexOf(marker);
  if (i < 0) return prompt;
  const p = prompt.slice(0, i) + EXTRACTION_EVIDENCE_RULE + '\n\n' + prompt.slice(i);
  return p.replace('"body":"...","due_date"', '"body":"...","evidence":"...","due_date"');
}

// Code side check for the evidence rule: most of the evidence words must occur
// together in one user message, or the item is dropped.
const toks = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .match(/[a-z0-9]+/g) || [];
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

// The extraction's second job (ENTITY_CARDS=on with CHAT_EXTRACTION_V2=on): when the
// user says an item they already track has changed, record an edit to it, not a
// new item. The ids come from the ITEMS ALREADY TRACKED list, which then carries them.
export const EXTRACTION_EDITS_RULE = `EDITS: An item already tracked above, or the same thing in other words, is never extracted again as new. When the user's own words say that one of the items already tracked above has changed (moved to another day or time, renamed, given a different frequency) or is done, record that as an edit to that item using its id from the list, instead of extracting a new item. When the user's own words add details to something one of the notes above already covers (plans, names, places, decisions about that same thing), record an edit to that note with field body_add, whose value is the new details in the user's words, kept to a line or two, instead of a new item. Fields: due_day (YYYY-MM-DD, resolved from today's date; todos and notes), due_time (HH:MM, 24 hour; todos and notes), name, frequency (habits), completed (value "done", todos), body_add (notes). The evidence rule applies to edits too. Never edit an item the user did not clearly refer to, and never resolve a date the user did not give.`;

/** Add the edits job to an extraction prompt that already has the evidence rule. */
export function withEditsRule(prompt) {
  const marker = 'WRITING STYLE for title and body fields:';
  const i = prompt.indexOf(marker);
  if (i < 0) return prompt;
  const p = prompt.slice(0, i) + EXTRACTION_EDITS_RULE + '\n\n' + prompt.slice(i);
  return p.replace(
    '"chat_summary":{"title":"...","summary":"..."}}',
    '"edits":[{"entity_id":"<id from the list>","type":"todo|habit|note","field":"due_day|due_time|name|frequency|completed|body_add","value":"...","evidence":"..."}],"chat_summary":{"title":"...","summary":"..."}}',
  );
}

// body_add appends to a note; a note's text is never replaced from chat.
const EDIT_FIELDS = {
  todo: ['due_day', 'due_time', 'name', 'completed'],
  habit: ['name', 'frequency'],
  note: ['name', 'body_add', 'due_day', 'due_time'],
};

/**
 * Turn the model's edits into pill items the app can offer ("Update X to Y?").
 * `tracked` maps the short id used in the prompt to the item; `userTexts` are the
 * user messages the evidence must be grounded in. Pure.
 */
/** The user's own words name the item: at least one of its content words is in what they said. */
export function titleMentioned(title, userTexts) {
  const t = keyToks(title);
  if (t.length === 0) return false;
  const said = new Set(keyToks((userTexts || []).join(' ')));
  return t.some((w) => said.has(w));
}

export function editsToPillItems(edits, tracked, userTexts) {
  if (!Array.isArray(edits)) return [];
  const out = [];
  for (const e of edits) {
    const item = tracked.get(String(e?.entity_id || ''));
    if (!item) continue;
    // an edit to something the user never spoke about is the extractor's idea, not theirs
    if (!titleMentioned(item.title, userTexts)) continue;
    const field = String(e.field || '');
    if (!EDIT_FIELDS[item.type]?.includes(field)) continue;
    const value = String(e.value ?? '').trim();
    if (!value) continue;
    if (field === 'due_day' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    if (field === 'due_time' && !/^\d{2}:\d{2}$/.test(value)) continue;
    if (!evidenceGrounded(e.evidence, userTexts)) continue;
    const from =
      field === 'name'
        ? item.title
        : field === 'completed' || field === 'body_add'
          ? null
          : (item[field] ?? null);
    if (from !== null && String(from) === value) continue;
    out.push({
      id: Math.random().toString(36).slice(2, 10),
      type: 'edit',
      entity_id: item.id,
      entity_type: item.type,
      entity_title: item.title,
      field,
      from,
      to: field === 'completed' ? 'done' : value,
      title: field === 'body_add' ? `Add to ${item.title}` : `Update ${item.title}`,
      body: null,
      evidence: String(e.evidence || ''),
      confidence: 90,
    });
  }
  return out;
}

/**
 * The change the matcher heard in passing, as a Save items pill item, so the
 * offer is there even when the extractor misses it. Same shape as
 * editsToPillItems.
 */
export function mentionEditItem(mention) {
  const e = mention?.entity;
  const c = mention?.change;
  if (!e || !c || !c.field || !c.to) return null;
  if (!EDIT_FIELDS[e.type]?.includes(c.field)) return null;
  return {
    id: Math.random().toString(36).slice(2, 10),
    type: 'edit',
    entity_id: e.id,
    entity_type: e.type,
    entity_title: e.title,
    field: c.field,
    from: c.from ?? null,
    to: c.to,
    title: c.field === 'body_add' ? `Add to ${e.title}` : `Update ${e.title}`,
    body: null,
    evidence: '',
    confidence: 90,
  };
}

/**
 * When this turn showed a card for one of the user's items, a "new" item the
 * extractor pulled from the same message is that item again in other words.
 * Drop new extractions that share wording with the card's item and rest on
 * the message that produced the card; things said in earlier turns stay.
 */
export function withoutCardDuplicates(extractions, card, lastUserText) {
  const title = card?.entity?.title;
  if (!title || !Array.isArray(extractions)) return extractions || [];
  const cardToks = new Set(keyToks(title));
  if (cardToks.size === 0) return extractions;
  return extractions.filter((e) => {
    if (e?.type === 'edit') return true;
    const t = keyToks(e?.title || '');
    let hit = 0;
    for (const w of t) if (cardToks.has(w)) hit++;
    if (hit === 0) return true;
    const fromThisTurn =
      !e?.evidence || !lastUserText || evidenceGrounded(e.evidence, [lastUserText]);
    return !fromThisTurn;
  });
}

/**
 * The pill reconciles against what the user already has before it offers
 * anything new. A new extraction that shares two words with an existing item
 * is that item in other words: for a note it becomes "add to" that note, for
 * a todo or habit it is dropped (an edit, if any, is offered separately).
 */
export function reconcileWithExisting(extractions, tracked) {
  if (!Array.isArray(extractions) || !tracked || tracked.size === 0) return extractions || [];
  const existing = [...tracked.values()].map((it) => ({ it, toks: new Set(keyToks(it.title)) }));
  const out = [];
  for (const e of extractions) {
    if (!e || e.type === 'edit') {
      out.push(e);
      continue;
    }
    const t = keyToks(e.title || '');
    let best = null;
    let bestHits = 0;
    for (const x of existing) {
      let hit = 0;
      for (const w of t) if (x.toks.has(w)) hit++;
      if (hit > bestHits) {
        bestHits = hit;
        best = x.it;
      }
    }
    const same =
      bestHits >= 2 ||
      (t.length > 0 &&
        bestHits === t.length &&
        bestHits >= 1 &&
        t.length <= 2 &&
        best &&
        new Set(keyToks(best.title)).size <= 2);
    if (!same) {
      out.push(e);
      continue;
    }
    if (best.type === 'note') {
      const text = [e.title, e.body].filter(Boolean).join(': ');
      out.push({
        id: Math.random().toString(36).slice(2, 10),
        type: 'edit',
        entity_id: best.id,
        entity_type: 'note',
        entity_title: best.title,
        field: 'body_add',
        from: null,
        to: text,
        title: `Add to ${best.title}`,
        body: null,
        evidence: String(e.evidence || ''),
        confidence: 80,
        reconciled_from: e.title,
      });
    }
    // a todo or habit already covers it: nothing new to save
  }
  // one add-to per note: the extractor's own edit wins over a converted one
  const own = new Set(
    out
      .filter((e) => e?.type === 'edit' && e.field === 'body_add' && !e.reconciled_from)
      .map((e) => e.entity_id),
  );
  const seen = new Set();
  return out.filter((e) => {
    if (e?.type !== 'edit' || e.field !== 'body_add') return true;
    if (e.reconciled_from && own.has(e.entity_id)) return false;
    if (seen.has(e.entity_id)) return false;
    seen.add(e.entity_id);
    return true;
  });
}

/**
 * The pill's final list: new items and add-tos from reconciliation, plus the
 * extractor's own edits, with one add-to per note (the extractor's own wins)
 * and one edit per item and field.
 */
export function mergePillItems(extractions, editItems) {
  const own = new Set(
    (editItems || []).filter((e) => e.field === 'body_add').map((e) => e.entity_id),
  );
  const kept = (extractions || []).filter(
    (e) =>
      !(e?.type === 'edit' && e.field === 'body_add' && e.reconciled_from && own.has(e.entity_id)),
  );
  const seen = new Set();
  return [...kept, ...(editItems || [])].filter((e) => {
    if (e?.type !== 'edit') return true;
    const key = `${e.entity_id}:${e.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const KEY_STOP = new Set([
  'the',
  'a',
  'an',
  'to',
  'for',
  'of',
  'in',
  'on',
  'and',
  'with',
  'my',
  'me',
  'up',
  'do',
  'get',
  'finish',
  'complete',
  'build',
  'make',
  'start',
]);
function keyToks(s) {
  return (
    String(s || '')
      .toLowerCase()
      .replace(/[’']/g, '')
      .match(/[a-z0-9]+/g) || []
  )
    .filter((t) => t.length > 2 && !KEY_STOP.has(t))
    .map((t) => t.replace(/(ing|ed|es|s)$/, ''));
}

// Turns whose reply mode should never show the Save items pill: extraction is
// skipped on them when CHAT_EXTRACTION_V2 is on.
export const NO_EXTRACTION_MODES = [
  'chit_chat',
  'playful',
  'app_help',
  'venting',
  'emotional',
  'celebration',
];

export function buildChatExtractionPrompt({
  todayStr,
  runningSummary,
  conversationText,
  handledIds,
  existingItemsBlock,
}) {
  return `Today is ${todayStr}.

You are analyzing a conversation to identify items worth saving in a productivity app.
${runningSummary ? `\nCONVERSATION CONTEXT (summary of earlier messages not shown below):\n${runningSummary}\n` : ''}
CONVERSATION:
${conversationText}

${handledIds.length > 0 ? 'ALREADY HANDLED (skip these): ' + handledIds.join(', ') : ''}
${existingItemsBlock}
Extract ONLY items where the user showed clear commitment or intent:
TODO: Actions the user committed to (concrete verb + object). NOT AI suggestions the user didn't affirm.
HABIT: Only with explicit frequency or stop/quit intent + trackable behavior.
NOTE: Ideas the user was excited about, decisions reached, recommendations they engaged with.
EVENT: Upcoming dates, deadlines, exams, appointments, trips, or time-bound milestones the user mentioned. Extract these even without exact dates. Capturing that something is coming up is valuable context for other conversations.
DO NOT EXTRACT: explorations, emotional processing, unaffirmed AI suggestions, small talk, or items that match or closely paraphrase something already tracked in the system above.

TEMPORAL METADATA (EVENT items only — set all to null for todo/habit/note):
- date_text: The user's exact words about timing, preserved verbatim (e.g. "next Thursday", "sometime in June", "before the end of the semester")
- resolved_date: Best estimate as YYYY-MM-DD. Today is ${todayStr}. For vague references, pick the midpoint of the likely range.
- date_confidence: "exact" if user gave a specific date, "approximate" if they gave a rough timeframe, "unknown" if mentioned without any timing
- date_range_start: Earliest plausible YYYY-MM-DD
- date_range_end: Latest plausible YYYY-MM-DD

WRITING STYLE for title and body fields:
- Title should be a short action phrase: "Book restaurant for Saturday" not "Restaurant Booking Task"
- Body should be a brief casual note, one sentence max
- Never write "the user" or "user" — write as if jotting a note for them: "Getting up early for a 20-min run" not "User committed to getting up early"
- If no meaningful body beyond the title, set body to null

Also generate a chat title (3-6 words) and a one-sentence summary that covers the ENTIRE conversation — not just the most recent messages. Use the CONVERSATION CONTEXT above to include earlier topics. The summary should capture the full arc of what was discussed.
Return ONLY valid JSON:
{"extractions":[{"id":"<8chars>","type":"todo|habit|note|event","title":"...","body":"...","due_date":"YYYY-MM-DD or null","frequency":"string or null","confidence":0-100,"date_text":"string or null","resolved_date":"YYYY-MM-DD or null","date_confidence":"exact|approximate|unknown or null","date_range_start":"YYYY-MM-DD or null","date_range_end":"YYYY-MM-DD or null"}],"chat_summary":{"title":"...","summary":"..."}}`;
}
