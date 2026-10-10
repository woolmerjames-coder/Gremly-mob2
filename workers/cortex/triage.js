import { helperFetch } from './helperClient.js';
import { models } from './models.js';
import { withAiNote } from '../shared/aiUsage.js';

/**
 * Chat Triage Classifier (Worker JS version)
 *
 * Classifies a user message before the main chat generation call: two
 * parallel helper calls (mode, then search, personal and depth), or one call
 * that returns all four with TRIAGE_ONE_CALL=on. In Ask Gremly the one call
 * also returns the lane (quick, lookup or agent): what Gremly must do before
 * it can reply. The lane is recorded with the call in ai_usage and nothing
 * acts on it yet (step 6 of the agent plan; general chat routes on it in
 * step 9).
 */

// ============================================================================
// VALIDATION ARRAYS
// ============================================================================

const VALID_MODES = [
  'emotional',
  'venting',
  'accountability',
  'celebration',
  'update',
  'prioritization',
  'action_ready',
  'exploratory',
  'comparison',
  'research',
  'quick_ask',
  'chit_chat',
  'app_help',
  'playful',
  'capture',
];

const VALID_SEARCH = ['required', 'maybe', 'none'];

const VALID_PERSONAL = ['deep', 'light', 'none'];
const VALID_DEPTH = ['brief', 'standard', 'detailed'];
export const VALID_LANES = ['quick', 'lookup', 'agent'];

// The chat types that ask for a lane: Ask Gremly only. Space, World, Chapter
// and item chat keep today's triage, since the agent is not planned there, and
// today's thread has no triage once it moves onto the agent (step 7).
export const LANE_CHAT_TYPES = ['general'];

// ============================================================================
// PRESET MAPPING
// ============================================================================

export const PRESET_TO_TRIAGE = {
  break_down: {
    mode: 'action_ready',
    search: 'none',
    personal: 'deep',
    depth: 'detailed',
    source: 'preset',
  },
  action_steps: {
    mode: 'action_ready',
    search: 'none',
    personal: 'deep',
    depth: 'detailed',
    source: 'preset',
  },
  research: {
    mode: 'research',
    search: 'required',
    personal: 'light',
    depth: 'standard',
    source: 'preset',
  },
  think_through: {
    mode: 'exploratory',
    search: 'none',
    personal: 'deep',
    depth: 'standard',
    source: 'preset',
  },
  whats_blocking: {
    mode: 'emotional',
    search: 'none',
    personal: 'deep',
    depth: 'standard',
    source: 'preset',
  },
  expand: {
    mode: 'exploratory',
    search: 'none',
    personal: 'light',
    depth: 'standard',
    source: 'preset',
  },
  stay_consistent: {
    mode: 'research',
    search: 'maybe',
    personal: 'deep',
    depth: 'standard',
    source: 'preset',
  },
  approach: {
    mode: 'exploratory',
    search: 'maybe',
    personal: 'light',
    depth: 'standard',
    source: 'preset',
  },
};

// ============================================================================
// FALLBACKS
// ============================================================================

const FALLBACK_MODE = 'exploratory';
const FALLBACK_SEARCH = 'none';
// Today's path, so a lane that could not be read changes nothing.
const FALLBACK_LANE = 'quick';

const FALLBACK_TRIAGE = {
  mode: FALLBACK_MODE,
  search: FALLBACK_SEARCH,
  personal: 'light',
  depth: 'standard',
  source: 'fallback',
};

// ============================================================================
// CLASSIFIER SYSTEM PROMPTS
// ============================================================================

export const MODE_SYSTEM_PROMPT = `Classify a chat message in a productivity companion app into exactly one response mode.

MODES:
- emotional: Processing feelings, overwhelm, shame, frustration, self-doubt
- venting: Letting off steam, not seeking solutions
- accountability: Reporting they missed or skipped something
- celebration: Sharing a win or progress
- update: Reporting back on something neutrally
- prioritization: Has multiple things, needs help choosing or ordering
- action_ready: Knows what they want, needs it broken down or planned
- exploratory: Thinking out loud, uncertain, processing internally. The user is working through their own thoughts and is not asking the AI to provide information or options. They are reflecting, not requesting.
- comparison: Weighing two or more specific options
- research: The user wants the AI to provide information, options, suggestions, or recommendations. They are asking the AI to contribute knowledge, not just listen or help them think. If the user would benefit from the AI knowing things, this is research.
- quick_ask: Simple direct question, short factual answer
- chit_chat: Greeting, thanks, small talk, banter
- app_help: Asking how the app or its features work
- playful: Testing personality, jokes, meta questions about the AI
- capture: Dropping a task or reminder mid-conversation

When a message has both emotional and task signals, prioritize emotional.

Return ONLY JSON: {"mode":"..."}`;

// What Gremly must do before it can reply well. Semantic rules only: no
// examples and no word lists. The labelling guide for the replay
// (scripts/chat-audit/data/LABEL_GUIDE_LANE.md) restates these definitions.
export const LANE_RULES = `LANE: what Gremly must do before it can reply well.
- quick: Gremly can reply from the conversation and what it already holds about this person: their story and context, today's plan and what they have done today, the last three days, and what it recalls that bears on the message. Facts about the outside world that a web search can supply also count as quick. Nothing of theirs is asked to change.
- lookup: Replying well needs facts about the person's own things or past that Gremly may not hold: a particular item of theirs, what is planned on a day other than today, how something has gone over time, what they have of some kind, or something from an earlier conversation. Nothing of theirs is asked to change.
- agent: The person asks Gremly to make a change to their own things in the app, such as creating, editing, rescheduling, completing, logging, skipping or removing something, or planning things into their days, whether one change or several. Also any message that asks for several separate things to be done.

These count as asking for a change, so they are agent: saying they need or mean to do something new that Gremly could keep for them; accepting or answering Gremly's own offer or question about a change; following up a change they asked for that has not been made; a question, complaint or suggestion about a change to something of theirs that Gremly could make, such as whether it can or why it has not, since they want that change made. The lane follows what they want done to their things, not how the message is worded.
These are quick: mentioning something that could change one of their existing things without asking Gremly to change it; telling Gremly something about themselves, or correcting what it believes about them.
When a message asks for a change and also needs a lookup, it is agent. When unsure, choose quick.`;

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max) + '…';
}

function safeParseJsonTriage(raw) {
  try {
    let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const match = cleaned.match(/\{[^}]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export function buildClassifierInput(userMessage, previousExchange, spaceName, runningSummary) {
  const parts = [];

  if (spaceName) {
    parts.push(`SPACE: ${spaceName}`);
  }

  if (runningSummary && runningSummary.length > 10) {
    parts.push(`CONVERSATION SO FAR: ${truncate(runningSummary, 200)}`);
  }

  if (previousExchange?.userMsg && previousExchange?.assistantMsg) {
    parts.push(
      `LAST EXCHANGE:\nUser: ${truncate(previousExchange.userMsg, 150)}\nGremly: ${truncate(previousExchange.assistantMsg, 150)}`,
    );
  }

  parts.push(`MESSAGE:\n${truncate(userMessage, 300)}`);

  return parts.join('\n\n');
}

async function callNano(systemPrompt, userInput, apiKey) {
  try {
    const res = await helperFetch('triage_mode', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput },
      ],
      max_tokens: 30,
      temperature: 0.1,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[Triage] Nano API error', { status: res.status, error: errText });
      return null;
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;

    return safeParseJsonTriage(content);
  } catch (err) {
    console.error('[Triage] Nano call failed', err);
    return null;
  }
}

export async function callMini(systemPrompt, userInput, apiKey) {
  try {
    const res = await helperFetch('triage_signals', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput },
      ],
      max_tokens: 50,
      temperature: 0.1,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[Triage] Mini API error', { status: res.status, error: errText });
      return null;
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;

    return safeParseJsonTriage(content);
  } catch (err) {
    console.error('[Triage] Mini call failed', err);
    return null;
  }
}

export const LOADING_SYSTEM_PROMPT = `Generate a very short loading message (3-6 words) for a productivity companion app that is about to respond to a user's chat message. The loading message should feel warm, specific to what they asked, and slightly playful. It will be shown briefly while the AI generates its response.

Rules:
- 3-6 words maximum
- No punctuation except "..." at the end
- Be specific to the topic, not generic
- Never "Thinking..." or "Processing..." or "One moment..."
- Sound like a personality, not a system message

Return ONLY the loading text. Nothing else. No JSON, no quotes, no explanation.`;

export async function generateLoadingMessage(userInput, spaceName, apiKey) {
  try {
    const contextualInput = spaceName ? `SPACE: ${spaceName}\n\nMESSAGE: ${userInput}` : userInput;

    const res = await helperFetch('loading_message', {
      messages: [
        { role: 'system', content: LOADING_SYSTEM_PROMPT },
        { role: 'user', content: contextualInput },
      ],
      max_tokens: 15,
      temperature: 0.6,
    });

    if (!res.ok) return null;

    const json = await res.json();
    const content = (json.choices?.[0]?.message?.content || '').trim();

    if (!content || content.length > 60 || content.startsWith('{') || content.startsWith('"')) {
      return null;
    }

    return content;
  } catch {
    return null;
  }
}

// ============================================================================
// INDIVIDUAL CLASSIFIERS
// ============================================================================

async function classifyMode(userInput, apiKey) {
  const result = await callNano(MODE_SYSTEM_PROMPT, userInput, apiKey);
  if (result && typeof result.mode === 'string' && VALID_MODES.includes(result.mode)) {
    return result.mode;
  }
  return FALLBACK_MODE;
}

/** The system prompt for the search, personal and depth signals. Exported for the audit harness. */
export function buildSignalsSystemPrompt(domainNames, profileSnippet, messageCount) {
  const contextLines = [];
  if (domainNames && domainNames.length > 0) {
    contextLines.push(`User's life domains: ${domainNames.join(', ')}`);
  }
  if (profileSnippet) {
    contextLines.push(`Profile: ${profileSnippet}`);
  }
  contextLines.push(`Conversation length: ${messageCount} messages`);

  const contextHint = contextLines.join('\n');

  const systemPrompt = `Classify three signals for a chat message in a productivity companion app. The AI has personal context about this user.

CONTEXT AVAILABLE TO THE AI:
${contextHint}

SIGNAL 1 — PERSONALIZATION: How much should the response reference what the AI knows about this person?
- deep: Question is about THEIR life, plans, situation, preferences. Response should heavily reference their context.
  Consider the user's active life domains listed above. If the topic of their message falls within a domain the AI has context about, the AI can meaningfully personalize — that favors deep.
- light: General question but a natural personal connection exists. Weave in if it fits.
- none: Pure information or generic question. Personal context would feel forced.

SIGNAL 2 — DEPTH: How much response does this message need on a mobile chat screen?
- brief: 1-3 sentences. Simple questions, acknowledgments, venting, short emotional expressions, follow-ups, greetings.
  Messages that ask the AI to contribute information, options, or recommendations need enough space to be genuinely useful — those are standard, not brief.
- standard: 2-4 short paragraphs. Most help requests, recommendations, emotional support. The default for anything needing real substance.
- detailed: Structured multi-part response. ONLY for explicit requests: "break down", "step by step", "compare in detail", "full plan", "walk me through". Genuinely complex multi-part questions. Most messages are NOT detailed.

SIGNAL 3 — SEARCH: Does the AI need to search the web to answer this well?
- required: The user needs information that exists in the real world and changes over time, varies by location, or requires verified specifics to be trustworthy. The AI should not guess or rely on potentially outdated training data.
- maybe: The AI can give a reasonable answer from general knowledge, but searching would add specificity, verification, or better recommendations.
- none: The message is about the user's own feelings, decisions, tasks, progress, habits, or internal situation. Or it is a greeting, a simple factual question the AI can confidently answer, or a conversation about the app itself.

The AI is a productivity companion. Its users frequently ask about places, food, travel, health, fitness, products, and local information. These questions deserve verified answers. A confidently wrong recommendation is worse than searching. When the message involves the external world — places, businesses, prices, conditions, products, health — choose required or maybe. When the message is purely about the user's internal world, choose none. When in doubt, choose maybe.

When unsure on depth, choose brief or standard. Detailed is rare.

Return ONLY JSON: {"personal":"...","depth":"...","search":"..."}`;
  return systemPrompt;
}

async function classifyWithMini(userInput, domainNames, profileSnippet, messageCount, apiKey) {
  const systemPrompt = buildSignalsSystemPrompt(domainNames, profileSnippet, messageCount);

  const result = await callMini(systemPrompt, userInput, apiKey);

  return {
    personal:
      result?.personal && VALID_PERSONAL.includes(result.personal) ? result.personal : 'light',
    depth: result?.depth && VALID_DEPTH.includes(result.depth) ? result.depth : 'standard',
    search: result?.search && VALID_SEARCH.includes(result.search) ? result.search : 'none',
  };
}

// ============================================================================
// EXPORTED FUNCTION
// ============================================================================

// One call variant (TRIAGE_ONE_CALL=on): the two prompts joined, asking for one
// JSON object. Built from the same prompt text so the definitions cannot drift;
// only the framing and return lines are new. Tested in the chat helper model
// audit; without the lane it is identical to scripts/chat-audit/triage-jobs.mjs
// buildOneCallSystemPrompt. With { lane: true } the lane rules follow the
// signals and the answer carries a lane too.
export function buildOneCallSystemPrompt(domainNames, profileSnippet, messageCount, opts = {}) {
  const lane = !!opts.lane;
  const mode = MODE_SYSTEM_PROMPT.replace(/Return ONLY JSON:[\s\S]*$/, '').trim();
  const signals = buildSignalsSystemPrompt(domainNames, profileSnippet, messageCount)
    .replace(/Return ONLY JSON:[\s\S]*$/, '')
    .trim();
  const modeBody = mode.replace(
    /^Classify a chat message in a productivity companion app into exactly one response mode\.\s*/,
    '',
  );
  const signalsBody = signals.replace(
    /^Classify three signals for a chat message in a productivity companion app\. The AI has personal context about this user\.\s*/,
    '',
  );
  if (!lane) {
    return `Classify a chat message in a productivity companion app: one response mode and three signals. The AI has personal context about this user.

${modeBody}

${signalsBody}

Return ONLY JSON: {"mode":"...","personal":"...","depth":"...","search":"..."}`;
  }
  return `Classify a chat message in a productivity companion app: one response mode, three signals and a lane. The AI has personal context about this user.

${modeBody}

${signalsBody}

${LANE_RULES}

Return ONLY JSON: {"mode":"...","personal":"...","depth":"...","search":"...","lane":"..."}`;
}

/**
 * Read the one call's answer. A field that is missing or not one of its
 * values takes its fallback, and is named in `fellBack` so the usage log
 * shows it rather than hiding it.
 * @returns {{mode: string, personal: string, depth: string, search: string, lane?: string, fellBack: string[]}}
 */
export function readOneCall(content, opts = {}) {
  const result = safeParseJsonTriage(content || '');
  const fellBack = [];
  const pick = (field, valid, fallback) => {
    const v = result?.[field];
    if (typeof v === 'string' && valid.includes(v)) return v;
    fellBack.push(field);
    return fallback;
  };
  const out = {
    mode: pick('mode', VALID_MODES, FALLBACK_MODE),
    personal: pick('personal', VALID_PERSONAL, 'light'),
    depth: pick('depth', VALID_DEPTH, 'standard'),
    search: pick('search', VALID_SEARCH, 'none'),
  };
  if (opts.lane) out.lane = pick('lane', VALID_LANES, FALLBACK_LANE);
  return { ...out, fellBack };
}

async function classifyOneCall(userInput, domainNames, profileSnippet, messageCount, opts = {}) {
  // Its own helper job (MODEL_TRIAGE), so switching TRIAGE_ONE_CALL off puts
  // the two calls back on their own models. What it decided goes on its usage
  // row (ai_usage job <route>/triage, meta.triage), so each message's lane can
  // be read beside the call that chose it.
  let settle = () => {};
  const decided = new Promise((resolve) => {
    settle = resolve;
  });
  try {
    const res = await withAiNote(decided, () =>
      helperFetch('triage', {
        messages: [
          {
            role: 'system',
            content: buildOneCallSystemPrompt(domainNames, profileSnippet, messageCount, opts),
          },
          { role: 'user', content: userInput },
        ],
        max_tokens: 80,
        temperature: 0.1,
      }),
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[Triage] one call failed', res.status, errText.slice(0, 200));
      return null;
    }
    const json = await res.json();
    const { fellBack, ...decision } = readOneCall(json.choices?.[0]?.message?.content, opts);
    if (fellBack.length) console.error('[Triage] one call answer fell back', { fellBack });
    settle({ triage: fellBack.length ? { ...decision, fell_back: fellBack } : decision });
    return decision;
  } finally {
    settle(null);
  }
}

export async function triageMessage(options) {
  const {
    userMessage,
    previousExchange,
    spaceName,
    runningSummary,
    preset,
    chatType,
    env,
    domainNames,
    profileSnippet,
    messageCount,
  } = options;

  // Preset short-circuit for entity chat
  if (chatType === 'entity' && preset && PRESET_TO_TRIAGE[preset]) {
    return PRESET_TO_TRIAGE[preset];
  }

  // The lane comes with the one call only; two calls stay exactly as today.
  const wantsLane = LANE_CHAT_TYPES.includes(chatType) && models().flags.triageOneCall;
  const fallback = wantsLane ? { ...FALLBACK_TRIAGE, lane: FALLBACK_LANE } : FALLBACK_TRIAGE;

  try {
    const classifierInput = buildClassifierInput(
      userMessage,
      previousExchange,
      spaceName,
      runningSummary,
    );

    if (models().flags.triageOneCall) {
      const one = await classifyOneCall(
        classifierInput,
        domainNames || [],
        profileSnippet || '',
        messageCount || 0,
        { lane: wantsLane },
      );
      if (one) return { ...one, source: 'classifier' };
      return fallback;
    }

    const [mode, miniSignals] = await Promise.all([
      classifyMode(classifierInput, env.OPENAI_API_KEY),
      classifyWithMini(
        classifierInput,
        domainNames || [],
        profileSnippet || '',
        messageCount || 0,
        env.OPENAI_API_KEY,
      ),
    ]);

    return {
      mode,
      search: miniSignals.search,
      personal: miniSignals.personal,
      depth: miniSignals.depth,
      source: 'classifier',
    };
  } catch (err) {
    console.error('[Triage] failed', err);
    return fallback;
  }
}
