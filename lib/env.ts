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
  FEATURE_CHAT: process.env.EXPO_PUBLIC_FEATURE_CHAT ?? 'off',
  UNIFIED_OVERLAY: process.env.EXPO_PUBLIC_UNIFIED_OVERLAY ?? 'on',
  CANONICAL_TYPES: process.env.EXPO_PUBLIC_CANONICAL_TYPES ?? 'off',
  CANONICAL_CONVERSIONS: process.env.EXPO_PUBLIC_CANONICAL_CONVERSIONS ?? 'off',
  FEATURE_BUDDY: process.env.EXPO_PUBLIC_FEATURE_BUDDY ?? 'off',
  FEATURE_OVERLAY_V2: process.env.EXPO_PUBLIC_FEATURE_OVERLAY_V2 ?? 'off',
  FEATURE_COMMITMENTS: process.env.EXPO_PUBLIC_FEATURE_COMMITMENTS ?? 'off',

  TODAY_SUGGESTIONS: process.env.EXPO_PUBLIC_TODAY_SUGGESTIONS ?? 'on',
  TODAY_CELEBRATION: process.env.EXPO_PUBLIC_TODAY_CELEBRATION ?? 'on',
  TODAY_EVENING_TEASER: process.env.EXPO_PUBLIC_TODAY_EVENING_TEASER ?? 'on',
  TODAY_V3: process.env.EXPO_PUBLIC_TODAY_V3 ?? 'on',
  TODAY_V4_LANES: process.env.EXPO_PUBLIC_TODAY_V4_LANES ?? 'off',
  TODAY_FOCUS_CARD: process.env.EXPO_PUBLIC_TODAY_FOCUS_CARD ?? 'on',
  TODAY_DROP_ZONE: process.env.EXPO_PUBLIC_TODAY_DROP_ZONE ?? 'on',
  TODAY_SWEEP_PREVIEW: process.env.EXPO_PUBLIC_TODAY_SWEEP_PREVIEW ?? 'on',
  EVENING_SWEEP_V1: process.env.EXPO_PUBLIC_EVENING_SWEEP_V1 ?? 'off',
  DEBUG_TODAY_TIMEWINDOW: process.env.EXPO_PUBLIC_DEBUG_TODAY_TIMEWINDOW,

  CORTEX_URL: process.env.EXPO_PUBLIC_CORTEX_URL,
  CORTEX_ENGINE: process.env.EXPO_PUBLIC_CORTEX_ENGINE ?? 'LLM',
  CORTEX_MODEL: process.env.EXPO_PUBLIC_CORTEX_MODEL ?? 'gpt-4o-mini',
  CORTEX_CLASSIFY_CATCHALL: process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL ?? 'off',
  CORTEX_TIMEOUT_MS: process.env.EXPO_PUBLIC_CORTEX_TIMEOUT_MS,
  CORTEX_RATE_WINDOW_S: process.env.EXPO_PUBLIC_CORTEX_RATE_WINDOW_S,
  CORTEX_RATE_MAX: process.env.EXPO_PUBLIC_CORTEX_RATE_MAX,
  DEBUG_CORTEX: process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? 'off',

  // Optimistic UX settings (Phase 10)
  CORTEX_OPTIMISTIC: process.env.EXPO_PUBLIC_CORTEX_OPTIMISTIC ?? 'on',
  CORTEX_BG_TIMEOUT_MS: process.env.EXPO_PUBLIC_CORTEX_BG_TIMEOUT_MS,
  CORTEX_BG_RETRIES: process.env.EXPO_PUBLIC_CORTEX_BG_RETRIES,
  CORTEX_MIN_THINK_MS: process.env.EXPO_PUBLIC_CORTEX_MIN_THINK_MS,
  CORTEX_MAX_THINK_MS: process.env.EXPO_PUBLIC_CORTEX_MAX_THINK_MS,

  // Mascot settings (Phase 10.6)
  MASCOT: process.env.EXPO_PUBLIC_MASCOT ?? 'on',
  MASCOT_DEBUG: process.env.EXPO_PUBLIC_MASCOT_DEBUG ?? 'off',

  OPENAI_API_KEY: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
};

// Helper: Convert string flag to boolean ('on' | 'off' | 'true' | 'false' → boolean)
const flag = (v?: string): boolean => {
  if (!v) return false;
  const normalized = v.toLowerCase();
  if (normalized === 'off' || normalized === 'false' || normalized === '0') {
    return false;
  }
  return normalized === 'on' || normalized === 'true' || normalized === '1';
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

// Validate chat feature configuration
// Only enforce cortex URL when FEATURE_CHAT is explicitly enabled and not in test environment
const featureChatExplicit = process.env.EXPO_PUBLIC_FEATURE_CHAT !== undefined;
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

if (featureChatExplicit && flag(raw.FEATURE_CHAT) && !isTestEnv) {
  if (!raw.CORTEX_URL) {
    throw new Error(
      '[env] EXPO_PUBLIC_CORTEX_URL is required when FEATURE_CHAT=on. Please check your .env file.',
    );
  }
}

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
    chat: flag(raw.FEATURE_CHAT),
    unifiedOverlay: flag(raw.UNIFIED_OVERLAY),
    // New overlay v2 feature gate
    overlayV2: raw.FEATURE_OVERLAY_V2 === 'on',
    canonicalTypes: raw.CANONICAL_TYPES === 'on',
    canonicalConversions: raw.CANONICAL_CONVERSIONS === 'on',
    buddy: flag(raw.FEATURE_BUDDY),

    // Today v2 feature flags (Phase 9)
    today: {
      suggestions: flag(raw.TODAY_SUGGESTIONS),
      celebration: flag(raw.TODAY_CELEBRATION),
      eveningTeaser: flag(raw.TODAY_EVENING_TEASER),
      v3: flag(raw.TODAY_V3),
      v4Lanes: flag(raw.TODAY_V4_LANES),
      focusCard: flag(raw.TODAY_FOCUS_CARD),
      dropZone: flag(raw.TODAY_DROP_ZONE),
      sweepPreview: flag(raw.TODAY_SWEEP_PREVIEW),
    },

    sweep: {
      eveningV1: flag(raw.EVENING_SWEEP_V1),
    },
    commitments: flag(raw.FEATURE_COMMITMENTS ?? 'off'),

    // Mascot feature flags (Phase 10.6)
    mascot: {
      enabled: flag(raw.MASCOT),
      debug: flag(raw.MASCOT_DEBUG),
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
    // Optimistic UX settings
    optimistic: flag(raw.CORTEX_OPTIMISTIC),
    bgTimeoutMs: raw.CORTEX_BG_TIMEOUT_MS ? Number(raw.CORTEX_BG_TIMEOUT_MS) : 5000,
    bgRetries: raw.CORTEX_BG_RETRIES ? Number(raw.CORTEX_BG_RETRIES) : 2,
    minThinkMs: raw.CORTEX_MIN_THINK_MS ? Number(raw.CORTEX_MIN_THINK_MS) : 1000,
    maxThinkMs: raw.CORTEX_MAX_THINK_MS ? Number(raw.CORTEX_MAX_THINK_MS) : 1500,
  },

  // API keys
  openaiApiKey: raw.OPENAI_API_KEY || null,
} as const;

// Type exports for convenience
export type RepoBackend = typeof env.repoBackend;
export type TimeWindow = 'morning' | 'midday' | 'evening';

export const getEnv = (key: string): string | undefined => {
  const value = process.env[key as keyof NodeJS.ProcessEnv];
  return typeof value === 'string' ? value : undefined;
};

// Helper functions for optimistic UX settings
export const getOptimisticFlag = (): boolean => env.cortex.optimistic;
export const getBgTimeoutMs = (): number => env.cortex.bgTimeoutMs;
export const getBgRetries = (): number => env.cortex.bgRetries;
export const getMinThinkMs = (): number => env.cortex.minThinkMs;
export const getMaxThinkMs = (): number => env.cortex.maxThinkMs;
