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
Do not extract plans for later the same day that this conversation is itself arranging, and do not extract anything that restates an item already tracked or already extracted in this conversation. Extract each thing once: when one sentence gives both something to do and the occasion it is for, that is a single item.`;

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
export const EXTRACTION_EDITS_RULE = `EDITS: The list of items already tracked above is what the user already has. Anything that is one of those items, in the same words or in different ones, is never extracted as new. When the user's own words say that a tracked item has changed (a different day, time, name or frequency) or is done, record an edit to that item, using its id from the list, instead of a new item. When the user's own words add to what one of the tracked notes already covers (anything further about that same subject), record an edit to that note with field body_add, whose value is the new details in the user's words, kept to a line or two, instead of a new item. Fields: due_day (YYYY-MM-DD, resolved from today's date; todos and notes), due_time (HH:MM, 24 hour; todos and notes), name, frequency (habits), completed (value "done", todos), body_add (notes). The evidence rule applies to edits too. Never edit an item the user did not clearly refer to, and never resolve a date the user did not give. If a new item you list is nonetheless a tracked item in other words, put that item's id in its same_as field, else omit same_as.`;

/** Add the edits job to an extraction prompt that already has the evidence rule. */
export function withEditsRule(prompt) {
  const marker = 'WRITING STYLE for title and body fields:';
  const i = prompt.indexOf(marker);
  if (i < 0) return prompt;
  const p = prompt.slice(0, i) + EXTRACTION_EDITS_RULE + '\n\n' + prompt.slice(i);
  return p
    .replace(
      '"chat_summary":{"title":"...","summary":"..."}}',
      '"edits":[{"entity_id":"<id from the list>","type":"todo|habit|note","field":"due_day|due_time|name|frequency|completed|body_add","value":"...","evidence":"..."}],"chat_summary":{"title":"...","summary":"..."}}',
    )
    .replace(
      '"evidence":"...","due_date"',
      '"evidence":"...","same_as":"<id from the list, only when it is that item>","due_date"',
    );
}

// body_add appends to a note; a note's text is never replaced from chat.
const EDIT_FIELDS = {
  todo: ['due_day', 'due_time', 'name', 'completed', 'body_add'],
  habit: ['name', 'frequency', 'logged'],
  note: ['name', 'body_add', 'due_day', 'due_time'],
};

/**
 * Turn the model's edits into pill items the app can offer ("Update X to Y?").
 * `tracked` maps the short id used in the prompt to the item; `userTexts` are the
 * user messages the evidence must be grounded in. Pure.
 */
export function editsToPillItems(edits, tracked, userTexts) {
  if (!Array.isArray(edits)) return [];
  const out = [];
  for (const e of edits) {
    const item = tracked.get(String(e?.entity_id || ''));
    if (!item) continue;
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
        : field === 'completed' || field === 'body_add' || field === 'logged'
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
 * What the extractor is told when this turn already showed a card for one of
 * the user's items, so the pill does not offer that item or that change again.
 * Appended to the tracked items block. `short` maps an item id to the id used
 * in that block.
 */
export function cardTrackedNote(card, short) {
  const e = card?.entity;
  if (!e || !e.id || !e.title) return '';
  const id = typeof short === 'function' ? short(e.id) : String(e.id).slice(0, 8);
  const c = card.change;
  const what = c
    ? c.field === 'completed'
      ? ' and has already offered to mark it done'
      : ` and has already offered to change its ${c.field} to ${c.to}`
    : '';
  return `\nTHIS TURN'S CARD: the app has just shown the user a card for [${e.type} id:${id}] ${e.title}${what}. That item is tracked: never extract it as new, and do not record that same change as an edit.\n`;
}

/**
 * What the extractor is told about the tracked items this turn's message is
 * about, as the matcher judged them, so anything new said about them is an
 * edit or an addition to that item rather than a new item. Appended to the
 * tracked items block.
 */
export function aboutTrackedNote(related, short) {
  const list = (related || []).filter((c) => c && c.id && c.title);
  if (list.length === 0) return '';
  const key = (id) => (typeof short === 'function' ? short(id) : String(id).slice(0, 8));
  const lines = list.map((c) => `- [${c.type} id:${key(c.id)}] ${c.title}`);
  return `\nTHE LATEST MESSAGE IS ABOUT THESE TRACKED ITEMS:\n${lines.join('\n')}\nWhat it says about those items is an edit to that item or an addition to that note, never a new item; anything else the message brings up is judged on its own.\n`;
}

/**
 * The pill reconciles against what the user already has before offering
 * anything new: the extractor marks a new item that is a tracked item in other
 * words with same_as. For a note that becomes "add to" the note; for a todo or
 * habit there is nothing new to save (an edit, if any, is offered separately).
 */
export function reconcileSameAs(extractions, tracked) {
  if (!Array.isArray(extractions)) return extractions || [];
  const out = [];
  for (const e of extractions) {
    const same = e && e.type !== 'edit' && e.same_as ? tracked?.get(String(e.same_as)) : null;
    if (!same) {
      out.push(e);
      continue;
    }
    if (same.type === 'note') {
      const text = [e.title, e.body].filter(Boolean).join(': ');
      out.push({
        id: Math.random().toString(36).slice(2, 10),
        type: 'edit',
        entity_id: same.id,
        entity_type: 'note',
        entity_title: same.title,
        field: 'body_add',
        from: null,
        to: text,
        title: `Add to ${same.title}`,
        body: null,
        evidence: String(e.evidence || ''),
        confidence: 80,
        reconciled_from: e.title,
      });
    }
  }
  return out;
}

/**
 * Existing means card, new means pill. Of the changes to existing items the
 * extraction found after the reply (its own edits, add-tos from reconciliation,
 * what the matcher heard in passing), one becomes a card under the reply: the
 * one about an item the matcher said the message was about, else the first.
 * Never the item this turn's card already covers, never one the user has just
 * turned down. `tracked` maps short ids to items and gives the card its details.
 */
export function lateCardFrom(editItems, tracked, opts = {}) {
  const skip = new Set([opts.cardEntityId, opts.declinedId].filter(Boolean));
  const about = new Set(opts.aboutIds || []);
  const items = [...(tracked?.values?.() || [])];
  const itemOf = (id) => items.find((t) => t.id === id) || {};
  const list = (editItems || []).filter(
    (e) =>
      e &&
      e.entity_id &&
      !skip.has(e.entity_id) &&
      // a check-in for a day already logged is nothing to offer
      !(e.field === 'logged' && (itemOf(e.entity_id).logged_days || []).includes(String(e.to))),
  );
  if (list.length === 0) return null;
  const pick = list.find((e) => about.has(e.entity_id)) || list[0];
  const item = itemOf(pick.entity_id);
  return {
    kind: 'edit',
    entity: {
      id: pick.entity_id,
      type: pick.entity_type || item.type || 'todo',
      title: pick.entity_title || item.title || '',
      due_day: item.due_day ?? null,
      due_time: item.due_time ?? null,
      frequency: item.frequency ?? null,
      space_id: item.space_id ?? null,
    },
    change: { field: pick.field, from: pick.from ?? null, to: pick.to },
    confidence: pick.confidence ?? 85,
    late: true,
  };
}

/** What stays in the pill once existing items go to a card: the new things. */
export function newItemsOnly(extractions) {
  return (extractions || []).filter((e) => e && e.type !== 'edit');
}

/**
 * The pill's final list: new items and add-tos from reconciliation, plus the
 * extractor's own edits, with one add-to per note (the extractor's own wins)
 * and one edit per item and field. Kept for callers that still mix the two.
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

// ── The split pill (CHAT_PILL_SPLIT=on) ─────────────────────────────────────
// The one extraction call above does four jobs at once: new items, event
// timing, edits and the chat summary. Split, the pill call answers one
// question, what is new or changed relative to the user's list, and the summary
// is its own small call. Both run after the reply, in parallel.

/**
 * The pill's own prompt: new items and changes to listed items, nothing else.
 * Output field names match the single call so the app and the worker need no
 * change. `existingItemsBlock` is the tracked list with any about and card notes.
 */
export function buildPillPrompt({ todayStr, conversationText, existingItemsBlock }) {
  return `Today is ${todayStr}.

You read a conversation between a user and Gremly, their companion in a personal productivity app, and answer one question: what in it is new to the user's list, and what has changed about items already on the list. Nothing else.

THE USER'S LIST
${existingItemsBlock || '(nothing tracked yet)'}
CONVERSATION
${conversationText}

NEW ITEMS
Something is new when the user's own words commit to it, decide it, ask Gremly to keep or remind them of it, or say it may be coming up, and it is not on the list above in any words. An intention they state for themselves counts as a commitment however hedged it is. Kinds: todo, an action they have committed to or asked to be reminded of; habit, a behaviour they mean to repeat, with how often, or to stop; note, an idea, a decision or a recommendation they took up; event, something that may happen on or around a time they mention, whether decided or still being considered, with or without an exact date. Not new: feelings, questions and thinking out loud with nothing to keep, what Gremly suggested and they did not take up, small talk, plans for later the same day that this conversation is itself arranging, and anything that is a listed item in other words. Sharing a subject with a listed item does not make something that item; it is the same only when doing, keeping or noting one would make the other redundant, and if they would still need to do or keep the proposed thing after the listed item was done, it is new. Each thing once: when a sentence gives both something to do and the occasion it is for, that is one item. When you are unsure whether something is a listed item in other words, list it and put that item's id in its same_as field, and it will be checked; otherwise leave same_as out.

CHANGES
When the user's own words say a listed item has changed, moved, been renamed, repeats differently, or is done, record a change to it by its id from the list; when they say they did a listed habit, record a change with field logged and the day they did it. Progress on something is not completion. A plan for when they will now do a listed item is a change to its day. Details about the subject a listed note already covers are an addition to that note, field body_add, the details in their words, a line or two; details they ask to have kept with a todo are an addition to that todo the same way. Never change an item the user did not clearly refer to, and never resolve a date they did not give. Fields: due_day (YYYY-MM-DD, todos and notes), due_time (HH:MM, 24 hour, todos and notes), name, frequency (habits), logged (YYYY-MM-DD, habits, the day they did it), completed (value "done", todos), body_add (notes and todos).

EVIDENCE
For every new item and every change, evidence is the user's own words, copied exactly from one User line, that show it. Words Gremly said do not count unless the user took them up in their own words, and then the evidence is the user's words.

TIMING, for events only (null for every other kind): date_text, the user's words about when, verbatim; resolved_date, the most likely day as YYYY-MM-DD, the middle of the range when they were vague; date_confidence, exact when they gave a specific day, approximate when a rough time, unknown when no timing; date_range_start and date_range_end, the earliest and latest plausible days.

WRITING
A title is a short phrase in the user's own terms, an action for a todo. A body is one casual sentence, or null when the title says it all. Write as a note for them, never about "the user".

Return ONLY valid JSON:
{"extractions":[{"id":"<8 random characters>","type":"todo|habit|note|event","title":"...","body":"...","evidence":"...","same_as":"<id from the list, only when it is that item>","due_date":"YYYY-MM-DD or null","frequency":"string or null","confidence":0-100,"date_text":"string or null","resolved_date":"YYYY-MM-DD or null","date_confidence":"exact|approximate|unknown or null","date_range_start":"YYYY-MM-DD or null","date_range_end":"YYYY-MM-DD or null"}],"edits":[{"entity_id":"<id from the list>","type":"todo|habit|note","field":"due_day|due_time|name|frequency|logged|completed|body_add","value":"...","evidence":"..."}]}`;
}

/** The chat's title and running summary, on their own. */
export function buildSummaryPrompt({ runningSummary, conversationText }) {
  return `You write the title and the running summary of a conversation between a user and Gremly, their companion in a personal productivity app.
${runningSummary ? `\nSUMMARY OF EARLIER MESSAGES (not shown below):\n${runningSummary}\n` : ''}
CONVERSATION:
${conversationText}

The title is three to six words in the user's own terms. The summary is one sentence covering the whole conversation from its start, including what the earlier summary covers, so someone reading only the summary knows what was discussed and decided.
Return ONLY valid JSON: {"chat_summary":{"title":"...","summary":"..."}}`;
}
