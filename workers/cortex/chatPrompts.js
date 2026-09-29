// ============================================================================
// chatPrompts.js: prompt builders for the helper calls around a chat turn that
// the audit harness (scripts/chat-audit) needs to run exactly as the Worker does.
// Moved here verbatim from cortex-index.js; the text is unchanged.
// ============================================================================

/**
 * Ask Gremly background extraction (the Save items pill).
 * @param {{todayStr: string, runningSummary: string|null, conversationText: string, handledIds: string[], existingItemsBlock: string}} p
 */
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
