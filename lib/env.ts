/**
 * lib/env.ts — Typed environment configuration layer
 * Phase 9: Today v2 — Centralized env reads with validation and defaults
 *
 * Reads from process.env once, normalizes flags, provides defaults,
 * and throws friendly errors for missing required values.
 */

// Raw environment reads (happens once at module load)
const raw = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  REPO_BACKEND: process.env.EXPO_PUBLIC_REPO_BACKEND ?? 'memory',

  FEATURE_SPACES: process.env.EXPO_PUBLIC_FEATURE_SPACES ?? 'on',
  UNIFIED_OVERLAY: process.env.EXPO_PUBLIC_UNIFIED_OVERLAY ?? 'on',
  FEATURE_BUDDY: process.env.EXPO_PUBLIC_FEATURE_BUDDY ?? 'off',

  TODAY_SUGGESTIONS: process.env.EXPO_PUBLIC_TODAY_SUGGESTIONS ?? 'on',
  TODAY_CELEBRATION: process.env.EXPO_PUBLIC_TODAY_CELEBRATION ?? 'on',
  TODAY_EVENING_TEASER: process.env.EXPO_PUBLIC_TODAY_EVENING_TEASER ?? 'on',
  DEBUG_TODAY_TIMEWINDOW: process.env.EXPO_PUBLIC_DEBUG_TODAY_TIMEWINDOW,

  CORTEX_URL: process.env.EXPO_PUBLIC_CORTEX_URL,
  CORTEX_ENGINE: process.env.EXPO_PUBLIC_CORTEX_ENGINE ?? 'LLM',
  CORTEX_MODEL: process.env.EXPO_PUBLIC_CORTEX_MODEL ?? 'gpt-4o-mini',
  CORTEX_CLASSIFY_CATCHALL: process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL ?? 'off',
  CORTEX_TIMEOUT_MS: process.env.EXPO_PUBLIC_CORTEX_TIMEOUT_MS,
  CORTEX_RATE_WINDOW_S: process.env.EXPO_PUBLIC_CORTEX_RATE_WINDOW_S,
  CORTEX_RATE_MAX: process.env.EXPO_PUBLIC_CORTEX_RATE_MAX,
  DEBUG_CORTEX: process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? 'off',

  OPENAI_API_KEY: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
};

// Helper: Convert string flag to boolean ('on' | 'off' | 'true' | 'false' → boolean)
const flag = (v?: string): boolean => {
  if (!v) return false;
  const normalized = v.toLowerCase();
  return normalized === 'on' || normalized === 'true';
};

// Helper: Ensure value is one of allowed options, fallback if not
const oneOf = <T extends string>(
  v: any,
  allowed: readonly T[],
  fallback: T | undefined,
): T | undefined => {
  return allowed.includes(v as T) ? (v as T) : fallback;
};

// Derived config with validation
const repoBackend = oneOf(raw.REPO_BACKEND, ['memory', 'supabase'] as const, 'memory')!;

// Validate Supabase config when backend is 'supabase'
if (repoBackend === 'supabase') {
  if (!raw.SUPABASE_URL) {
    throw new Error(
      '[env] EXPO_PUBLIC_SUPABASE_URL is required when REPO_BACKEND=supabase. Please check your .env file.',
    );
  }
  if (!raw.SUPABASE_ANON_KEY) {
    throw new Error(
      '[env] EXPO_PUBLIC_SUPABASE_ANON_KEY is required when REPO_BACKEND=supabase. Please check your .env file.',
    );
  }
}

// Parse debug time window (optional)
const debugWindow = raw.DEBUG_TODAY_TIMEWINDOW
  ? oneOf(raw.DEBUG_TODAY_TIMEWINDOW, ['morning', 'midday', 'evening'] as const, undefined)
  : undefined;

/**
 * Typed environment configuration object
 * Use this instead of process.env throughout the app
 */
export const env = {
  // Repository backend
  repoBackend,
  supabaseUrl: raw.SUPABASE_URL || null,
  supabaseAnonKey: raw.SUPABASE_ANON_KEY || null,

  // Feature flags
  feature: {
    spaces: flag(raw.FEATURE_SPACES),
    unifiedOverlay: flag(raw.UNIFIED_OVERLAY),
    buddy: flag(raw.FEATURE_BUDDY),

    // Today v2 feature flags (Phase 9)
    today: {
      suggestions: flag(raw.TODAY_SUGGESTIONS),
      celebration: flag(raw.TODAY_CELEBRATION),
      eveningTeaser: flag(raw.TODAY_EVENING_TEASER),
    },
  },

  // Today v2 dev overrides (Phase 9)
  todayDebugWindow: debugWindow, // undefined unless set to 'morning' | 'midday' | 'evening'

  // Cortex/AI configuration
  cortexUrl: raw.CORTEX_URL || null,
  cortex: {
    engine: raw.CORTEX_ENGINE,
    model: raw.CORTEX_MODEL,
    classifyCatchAll: flag(raw.CORTEX_CLASSIFY_CATCHALL),
    timeoutMs: raw.CORTEX_TIMEOUT_MS ? Number(raw.CORTEX_TIMEOUT_MS) : 12000,
    rate: {
      windowS: raw.CORTEX_RATE_WINDOW_S ? Number(raw.CORTEX_RATE_WINDOW_S) : 60,
      max: raw.CORTEX_RATE_MAX ? Number(raw.CORTEX_RATE_MAX) : 5,
    },
    debug: flag(raw.DEBUG_CORTEX),
  },

  // API keys
  openaiApiKey: raw.OPENAI_API_KEY || null,
} as const;

// Type exports for convenience
export type RepoBackend = typeof env.repoBackend;
export type TimeWindow = 'morning' | 'midday' | 'evening';
