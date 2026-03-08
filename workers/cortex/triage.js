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

// ============================================================================
// PRESET MAPPING
// ============================================================================

export const PRESET_TO_TRIAGE = {
  break_down: { mode: 'action_ready', search: 'none', source: 'preset' },
  action_steps: { mode: 'action_ready', search: 'none', source: 'preset' },
  research: { mode: 'research', search: 'required', source: 'preset' },
  think_through: { mode: 'exploratory', search: 'none', source: 'preset' },
  whats_blocking: { mode: 'emotional', search: 'none', source: 'preset' },
  expand: { mode: 'exploratory', search: 'none', source: 'preset' },
  stay_consistent: { mode: 'research', search: 'maybe', source: 'preset' },
  approach: { mode: 'exploratory', search: 'maybe', source: 'preset' },
};

// ============================================================================
// FALLBACKS
// ============================================================================

const FALLBACK_MODE = 'exploratory';
const FALLBACK_SEARCH = 'none';

const FALLBACK_TRIAGE = {
  mode: FALLBACK_MODE,
  search: FALLBACK_SEARCH,
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
- exploratory: Thinking out loud, floating possibilities, not committed
- comparison: Weighing two or more specific options
- research: Wants external information, facts, recommendations
- quick_ask: Simple direct question, short factual answer
- chit_chat: Greeting, thanks, small talk, banter
- app_help: Asking how the app or its features work
- playful: Testing personality, jokes, meta questions about the AI
- capture: Dropping a task or reminder mid-conversation

When a message has both emotional and task signals, prioritize emotional.

Return ONLY JSON: {"mode":"..."}`;

const SEARCH_SYSTEM_PROMPT = `Determine whether a chat message in a productivity companion app needs web search to answer well.

SEARCH LEVELS:
- required: Cannot answer well without current or specific external information
- maybe: Could benefit from search but answerable without
- none: No external information needed

When in doubt between required and maybe, choose required. A shallow answer is worse than searching.

Return ONLY JSON: {"search":"..."}`;

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

function buildClassifierInput(userMessage, previousExchange, spaceName) {
  const parts = [];

  if (spaceName) {
    parts.push(`SPACE: ${spaceName}`);
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

async function classifySearch(userInput, apiKey) {
  const result = await callNano(SEARCH_SYSTEM_PROMPT, userInput, apiKey);
  if (result && typeof result.search === 'string' && VALID_SEARCH.includes(result.search)) {
    return result.search;
  }
  return FALLBACK_SEARCH;
}

// ============================================================================
// EXPORTED FUNCTION
// ============================================================================

export async function triageMessage(options) {
  const { userMessage, previousExchange, spaceName, preset, chatType, env } = options;

  // Preset short-circuit for entity chat
  if (chatType === 'entity' && preset && PRESET_TO_TRIAGE[preset]) {
    return PRESET_TO_TRIAGE[preset];
  }

  try {
    const classifierInput = buildClassifierInput(userMessage, previousExchange, spaceName);

    const [mode, search] = await Promise.all([
      classifyMode(classifierInput, env.OPENAI_API_KEY),
      classifySearch(classifierInput, env.OPENAI_API_KEY),
    ]);

    return { mode, search, source: 'classifier' };
  } catch (err) {
    console.error('[Triage] Promise.all failed', err);
    return FALLBACK_TRIAGE;
  }
}
