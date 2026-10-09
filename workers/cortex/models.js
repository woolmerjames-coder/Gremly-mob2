// ============================================================================
// models.js: every model the Worker calls, in one place.
//
// Each value has a default that matches what shipped before this file existed
// and a Worker var that overrides it (wrangler.toml [vars] or the dashboard),
// so a model change is a config edit and a deploy, never a code edit.
//
// Shared knobs:
//   CHAT_MODEL     the Gemini model every chat surface streams from: Ask Gremly,
//                  Space, World, Chapter, Habit Builder and Entity chat. Falls
//                  back to GEMINI_FLASH_MODEL, then the default below.
//   CHAT_MODEL_ASK Ask Gremly's writer on its own (default CHAT_MODEL). An OpenAI
//                  model is called through openaiChat.js, and CHAT_EFFORT_ASK
//                  sets how much it thinks before it writes (default none).
//   HELPER_MODEL   the small fast model behind the helper calls around a chat
//                  turn: triage, loading message, summaries, extraction, habit
//                  pre parse and so on. Any single job can be moved on its own
//                  with its MODEL_<JOB> var, which wins over HELPER_MODEL.
//   LEGACY_OPENAI_CHAT_MODEL  the non streaming OpenAI fallback for Space,
//                  World and Chapter chat.
//   WEEKLY_SUMMARY_MODEL  the Anthropic model behind the weekly summary.
//   HELPER_FALLBACK_MODEL  retry a failed helper call once on this model.
//   TRIAGE_ONE_CALL, CHAT_EXTRACTION_V2, SEARCH_REQUIRED_FORCES, CHAT_PILL_SPLIT  behaviour
//                  switches for the chat helper split; see flags below.
//   APP_HELPER_MODEL  the model for the generic non streaming path that app
//                  builds call for saveable detection, summary generation, list
//                  item enrichment and the catch all notepad. The Worker used to
//                  run whatever model the app named; the app names gpt-4o-mini
//                  everywhere, so that is the default and this file changes
//                  nothing. The Worker now decides, so moving these jobs no
//                  longer needs an app release.
//
// The Mind Drop classifier keeps its CLASSIFY_* vars and the tier presets keep
// NANO_MODEL, MINI_MODEL, HAIKU_MODEL, SONNET_MODEL, GEMINI_FLASH_LITE_MODEL
// (see getProviders in aiProvider.js); their defaults live here too.
//
// Gremly rule: the corpus gate applies to any value change here.
// ============================================================================

export const DEFAULTS = {
  chat: 'gemini-3-flash-preview',
  helper: 'gpt-4.1-mini', // was gpt-4.1-nano, removed from the OpenAI API on 2026-10-23
  legacyOpenAIChat: 'gpt-4.1',
  appHelper: 'gpt-4o-mini',
  geminiFlashLite: 'gemini-3.1-flash-lite', // was gemini-3.1-flash-lite-preview, shut down 2026-05-25
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  weeklySummary: 'claude-sonnet-4-5-20250929', // type weekly-summary, direct Anthropic call; its own review is a later pass
  // the agent (agent/run.js): its main model and the one tried when the first step fails.
  // Chosen per surface in step 8 of the agent plan by replay; until then these.
  agent: 'gemini-3.8-flash',
  agentFallback: 'gpt-6-luna',
};

// Helper jobs and the var that moves each one on its own.
export const HELPER_JOB_VARS = {
  triage: 'MODEL_TRIAGE', // triage.js classifyOneCall: mode, signals and the lane in one call (TRIAGE_ONE_CALL)
  triage_mode: 'MODEL_TRIAGE_MODE', // triage.js classifyMode
  triage_signals: 'MODEL_TRIAGE_SIGNALS', // triage.js classifyWithMini: search, personal, depth
  loading_message: 'MODEL_LOADING_MESSAGE', // triage.js generateLoadingMessage
  running_summary: 'MODEL_RUNNING_SUMMARY', // generateRunningSummary, generateEntityChatSummary
  chat_title: 'MODEL_CHAT_TITLE', // Ask Gremly's chat title, written with the Save items pill (CHAT_PILL_SPLIT)
  chat_full_summary: 'MODEL_CHAT_FULL_SUMMARY', // type chat-full-summary
  chat_extraction: 'MODEL_CHAT_EXTRACTION', // Ask Gremly background extraction behind the Save items pill
  general_greeting: 'MODEL_GENERAL_GREETING', // type general-greeting
  entity_chat_short: 'MODEL_ENTITY_CHAT_SHORT', // non streaming entity chat, simple short query
  habit_preparse: 'MODEL_HABIT_PREPARSE', // Habit Builder habitPreParse
  habit_fields: 'MODEL_HABIT_FIELDS', // Habit Builder extractHabitFields
  floor_suggest: 'MODEL_FLOOR_SUGGEST', // type floor-suggest
  journal_analyze: 'MODEL_JOURNAL_ANALYZE', // type journal-analyze
  sweep_headline: 'MODEL_SWEEP_HEADLINE', // type sweep-headline
  classify_phase1: 'MODEL_CLASSIFY_PHASE1', // Mind Drop v2 chain, only when CLASSIFY_V3_ENABLED is false
  entity_match: 'MODEL_ENTITY_MATCH', // entityMatch.js: does the message refer to an existing item
  item_topics: 'MODEL_ITEM_TOPICS', // itemDetail.js: starters drawn from a note when its chat opens
  correction_check: 'MODEL_CORRECTION_CHECK', // context/corrections.js: did they say Gremly has something wrong
  wrap_words: 'MODEL_WRAP_WORDS', // wrap/words.js: Gremly's own words in the evening wrap up
  age_words: 'MODEL_AGE_WORDS', // age/words.js: What got me here, the line on the age up page
  keep_offer: 'MODEL_KEEP_OFFER', // context/keep.js: whether a chat reply is worth a Save button, and where it goes
  chapter_guess: 'MODEL_CHAPTER_GUESS', // context/chapterGuess.js: Gremly's guesses for a Chapter started by hand
};

/**
 * Build the resolved model table for one deployment's env.
 * Pure: same env in, same table out. Call sites normally use models() below.
 */
export function resolveModels(env = {}) {
  const geminiFlash = env.GEMINI_FLASH_MODEL || DEFAULTS.chat;
  const helper = env.HELPER_MODEL || DEFAULTS.helper;
  const jobs = {};
  for (const [job, varName] of Object.entries(HELPER_JOB_VARS)) {
    jobs[job] = env[varName] || helper;
  }
  const chat = env.CHAT_MODEL || geminiFlash;
  return {
    chat,
    // Ask Gremly's writer, and its thinking when it is an OpenAI model
    ask: {
      model: env.CHAT_MODEL_ASK || chat,
      effort: env.CHAT_EFFORT_ASK || 'none',
    },
    helper,
    job: jobs,
    legacyOpenAIChat: env.LEGACY_OPENAI_CHAT_MODEL || DEFAULTS.legacyOpenAIChat,
    appHelper: env.APP_HELPER_MODEL || DEFAULTS.appHelper,
    weeklySummary: env.WEEKLY_SUMMARY_MODEL || DEFAULTS.weeklySummary,
    agent: {
      model: env.AGENT_MODEL || DEFAULTS.agent,
      fallback: env.AGENT_FALLBACK_MODEL || DEFAULTS.agentFallback,
      // one surface on its own: AGENT_MODEL_BRIEF, AGENT_MODEL_CHAT
      bySurface: {
        brief: env.AGENT_MODEL_BRIEF || '',
        chat: env.AGENT_MODEL_CHAT || '',
      },
      // how much the model thinks before each step, by surface (AGENT_THINKING_BRIEF,
      // AGENT_THINKING_CHAT); empty keeps the provider's default for the agent, low
      thinkingBySurface: {
        brief: env.AGENT_THINKING_BRIEF || '',
        chat: env.AGENT_THINKING_CHAT || '',
      },
    },
    // Behaviour switches for the chat helper split (docs/2026-09-29-chat-helper-model-audit.md).
    // Every default is today's behaviour; the corpus gate applies before any is flipped.
    flags: {
      // One triage call returning mode and signals instead of two parallel calls.
      triageOneCall: env.TRIAGE_ONE_CALL === 'on',
      // Extraction: evidence rule, 2,000 token cap, JSON mode, and skipped on
      // turns whose mode should never show the Save items pill.
      extractionV2: env.CHAT_EXTRACTION_V2 === 'on',
      // A "required" search signal forces a web search (today). Off: the tool
      // is attached and the reply model decides.
      searchRequiredForces: env.SEARCH_REQUIRED_FORCES !== 'off',
      // The entity card in chat: match a mention to an existing item and show
      // its card with a proposed change for the user to confirm.
      entityCards: env.ENTITY_CARDS === 'on',
      // The Save items pill as its own focused call (new and changed only), with
      // the chat summary as a separate small call, both after the reply.
      pillSplit: env.CHAT_PILL_SPLIT === 'on',
      // Today's thread on the agent (agent/brief.js). Off: the day turn answers,
      // as before. Only app builds that call brief-turn see either.
      agentBrief: env.AGENT_BRIEF === 'on',
      // Ask Gremly's lookups and changes on the agent (agent/chat.js): "on" for
      // everyone, or user ids separated by commas while it is tried; only app
      // builds that can draw the agent's card are sent there.
      agentChat: env.AGENT_CHAT || '',
    },
    // A helper call that fails on its model is retried once on this model, if set.
    helperFallback: env.HELPER_FALLBACK_MODEL || '',
    keys: {
      openai: env.OPENAI_API_KEY || '',
      google: env.GOOGLE_API_KEY || env.GEMINI_API_KEY || '',
      anthropic: env.ANTHROPIC_API_KEY || '',
    },
    tiers: {
      geminiFlash,
      geminiFlashLite: env.GEMINI_FLASH_LITE_MODEL || DEFAULTS.geminiFlashLite,
      nano: env.NANO_MODEL || helper,
      mini: env.MINI_MODEL || helper,
      haiku: env.HAIKU_MODEL || DEFAULTS.haiku,
      sonnet: env.SONNET_MODEL || DEFAULTS.sonnet,
    },
  };
}

// The active table. The Worker's fetch handler sets it from env on every
// request (env is constant for a deployment, so concurrent requests agree).
// Anything that imports this module without configuring it, such as a test or
// a harness, gets the defaults, which are what production ran before this file.
let active = resolveModels({});

export function configureModels(env) {
  active = resolveModels(env || {});
  return active;
}

export function models() {
  return active;
}

/** Model for one helper job, for example helperModel('triage_mode'). */
export function helperModel(job) {
  const m = active.job[job];
  if (!m) throw new Error(`models.js: unknown helper job "${job}"`);
  return m;
}
