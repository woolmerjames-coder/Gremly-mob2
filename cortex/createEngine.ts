import type { CortexInput, CortexOutput, ICortexEngine } from './ICortexEngine';
import { heuristicEngine } from './heuristicEngine';
import { OpenAiEngine } from './openAiEngine';

const parseInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

class DisabledCortexEngine implements ICortexEngine {
  async classify(): Promise<CortexOutput> {
    return {
      type: 'note',
      subtype: 'catchall',
      aiPlaced: false,
      whyString: 'Automatic classification disabled.',
    };
  }
}

class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly timestamps: number[] = [];

  constructor(windowSeconds: number, maxRequests: number) {
    this.windowMs = Math.max(windowSeconds, 0) * 1000;
    this.maxRequests = Math.max(maxRequests, 0);
  }

  allow(): boolean {
    if (this.maxRequests === 0 || this.windowMs === 0) {
      return true;
    }

    const now = Date.now();
    while (this.timestamps.length > 0 && now - this.timestamps[0] > this.windowMs) {
      this.timestamps.shift();
    }

    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }
}

interface ManagedEngineOptions {
  primary: ICortexEngine | null;
  fallback: ICortexEngine;
  limiter: RateLimiter | null;
}

class ManagedCortexEngine implements ICortexEngine {
  private readonly primary: ICortexEngine | null;
  private readonly fallback: ICortexEngine;
  private readonly limiter: RateLimiter | null;

  constructor({ primary, fallback, limiter }: ManagedEngineOptions) {
    this.primary = primary;
    this.fallback = fallback;
    this.limiter = limiter;
  }

  async classify(input: CortexInput): Promise<CortexOutput> {
    const DEBUG = (process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? 'false') === 'true';
    const canUsePrimary = !!this.primary && (!this.limiter || this.limiter.allow());

    if (!canUsePrimary && this.limiter && DEBUG) {
      console.warn('[CORTEX][RATE] limit reached; using heuristic');
    }

    if (canUsePrimary) {
      try {
        return await this.primary!.classify(input);
      } catch (error) {
        if (__DEV__) {
          console.warn(
            '[ManagedCortexEngine] Primary engine failed; falling back to heuristic.',
            error,
          );
        }
      }
    }

    return this.fallback.classify(input);
  }
}

export const createCortexEngine = (): ICortexEngine => {
  const DEBUG =
    String(process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? 'false').toLowerCase() === 'true' ||
    String(process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? '').toLowerCase() === 'on';
  const engineFlag = (process.env.EXPO_PUBLIC_CORTEX_ENGINE ?? 'HEURISTIC').toUpperCase();
  const classifyFlag = process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL ?? 'false';
  const hasKey = !!process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  const hasProxy = !!process.env.EXPO_PUBLIC_CORTEX_URL;
  const hasBackend = hasKey || hasProxy;
  const model = process.env.EXPO_PUBLIC_CORTEX_MODEL ?? 'gpt-4o-mini';

  if (DEBUG) {
    console.log('[createCortexEngine] choose:', {
      engineFlag,
      classifyFlag,
      hasKey,
      hasProxy,
      hasBackend,
      model,
    });
  }

  const classifyCatchall = (() => {
    const v = String(classifyFlag).toLowerCase();
    return v === 'true' || v === 'on' || v === '1';
  })();
  if (!classifyCatchall) {
    if (DEBUG) console.log('[createCortexEngine] classification disabled by flag');
    return new DisabledCortexEngine();
  }

  if (engineFlag === 'LLM' && hasBackend) {
    const timeoutMs = parseInteger(process.env.EXPO_PUBLIC_CORTEX_TIMEOUT_MS, 2500);
    const rateWindow = parseInteger(process.env.EXPO_PUBLIC_CORTEX_RATE_WINDOW_S, 60);
    const rateMax = parseInteger(process.env.EXPO_PUBLIC_CORTEX_RATE_MAX, 5);
    const baseUrl = process.env.EXPO_PUBLIC_OPENAI_BASE_URL;

    if (DEBUG) console.log('[createCortexEngine] using OpenAI engine with rate limiter');

    const primary = new OpenAiEngine({
      apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY || 'proxy',
      model,
      timeoutMs,
      baseUrl,
    });
    const limiter = new RateLimiter(rateWindow, rateMax);

    return new ManagedCortexEngine({ primary, fallback: heuristicEngine, limiter });
  }

  if (DEBUG || engineFlag === 'LLM') {
    console.warn('[createCortexEngine] Using Heuristic engine.', {
      engineFlag,
      hasKey,
      hasProxy,
      hasBackend,
    });
  }
  return heuristicEngine;
};
