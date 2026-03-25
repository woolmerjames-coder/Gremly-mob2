/**
 * Chat Triage Classifier (Worker JS version)
 *
 * Two parallel GPT-4.1-nano calls to classify a user message
 * before the main chat generation call.
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

const MODE_SYSTEM_PROMPT = `Classify a chat message in a productivity companion app into exactly one response mode.

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

function buildClassifierInput(userMessage, previousExchange, spaceName, runningSummary) {
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
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-nano',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput },
        ],
        max_tokens: 30,
        temperature: 0.1,
      }),
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

async function callMini(systemPrompt, userInput, apiKey) {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput },
        ],
        max_tokens: 50,
        temperature: 0.1,
      }),
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

const LOADING_SYSTEM_PROMPT = `Generate a very short loading message (3-6 words) for a productivity companion app that is about to respond to a user's chat message. The loading message should feel warm, specific to what they asked, and slightly playful. It will be shown briefly while the AI generates its response.

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

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-nano',
        messages: [
          { role: 'system', content: LOADING_SYSTEM_PROMPT },
          { role: 'user', content: contextualInput },
        ],
        max_tokens: 15,
        temperature: 0.6,
      }),
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

async function classifyWithMini(userInput, domainNames, profileSnippet, messageCount, apiKey) {
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

  try {
    const classifierInput = buildClassifierInput(
      userMessage,
      previousExchange,
      spaceName,
      runningSummary,
    );

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
    console.error('[Triage] Promise.all failed', err);
    return FALLBACK_TRIAGE;
  }
}
