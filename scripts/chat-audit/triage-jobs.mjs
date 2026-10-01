// The triage jobs exactly as the Worker runs them (workers/cortex/triage.js),
// plus the one call variant under test.
import { WORKER, url } from './paths.mjs';

const triage = await import(url(WORKER + 'triage.js'));
export const { MODE_SYSTEM_PROMPT, LOADING_SYSTEM_PROMPT, buildClassifierInput, buildSignalsSystemPrompt } = triage;

export const VALID = {
  mode: ['emotional', 'venting', 'accountability', 'celebration', 'update', 'prioritization', 'action_ready', 'exploratory', 'comparison', 'research', 'quick_ask', 'chit_chat', 'app_help', 'playful', 'capture'],
  search: ['required', 'maybe', 'none'],
  personal: ['deep', 'light', 'none'],
  depth: ['brief', 'standard', 'detailed'],
};
// What the Worker falls back to when a call fails or returns something invalid.
export const FALLBACK = { mode: 'exploratory', search: 'none', personal: 'light', depth: 'standard' };

// Mirrors safeParseJsonTriage in triage.js: find the first {...} and parse it.
export function parseJson(raw) {
  try {
    const m = String(raw || '').match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

/** Worker request settings per job (max_tokens, temperature). */
export const SETTINGS = {
  triage_mode: { maxTokens: 30, temperature: 0.1 },
  triage_signals: { maxTokens: 50, temperature: 0.1 },
  triage_one_call: { maxTokens: 80, temperature: 0.1 },
  loading_message: { maxTokens: 15, temperature: 0.6 },
};

export function classifierInputFor(turn) {
  const prev = turn.prev_u && turn.prev_a ? { userMsg: turn.prev_u, assistantMsg: turn.prev_a } : null;
  return buildClassifierInput(turn.text, prev, turn.space || null, null);
}

export function messageCountFor(turn) {
  // The Worker passes the number of messages in the conversation so far.
  return Math.max(1, (turn.seq - 1) * 2 + 1);
}

// One call variant: the two Worker prompts joined, asking for one JSON object.
// Built from the exported prompt text so the definitions cannot drift; only
// the framing lines and the return line are new. No examples, semantic rules only.
export function buildOneCallSystemPrompt(domainNames, profileSnippet, messageCount) {
  const mode = MODE_SYSTEM_PROMPT.replace(/Return ONLY JSON:[\s\S]*$/, '').trim();
  const signals = buildSignalsSystemPrompt(domainNames, profileSnippet, messageCount).replace(/Return ONLY JSON:[\s\S]*$/, '').trim();
  const modeBody = mode.replace(/^Classify a chat message in a productivity companion app into exactly one response mode\.\s*/, '');
  const signalsBody = signals.replace(/^Classify three signals for a chat message in a productivity companion app\. The AI has personal context about this user\.\s*/, '');
  return `Classify a chat message in a productivity companion app: one response mode and three signals. The AI has personal context about this user.

${modeBody}

${signalsBody}

Return ONLY JSON: {"mode":"...","personal":"...","depth":"...","search":"..."}`;
}
