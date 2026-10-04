/**
 * models.js: the one place every model the Worker calls is chosen.
 *
 * The defaults are pinned to what production ran before models.js existed, so
 * centralizing the config changed no behaviour. When a model is deliberately
 * changed after the corpus gate, update the pinned value here in the same
 * commit.
 */

import {
  DEFAULTS,
  HELPER_JOB_VARS,
  resolveModels,
  configureModels,
  models,
  helperModel,
} from '../models.js';
import { getProviders, resolveModel } from '../aiProvider.js';
import { GEMINI_MODEL } from '../geminiClient.js';

const KEYS = { OPENAI_API_KEY: 'o', GOOGLE_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' };

describe('models.js defaults match what shipped before centralization', () => {
  test('chat, helper, legacy and app helper defaults', () => {
    const m = resolveModels({});
    expect(m.chat).toBe('gemini-3-flash-preview');
    expect(m.helper).toBe('gpt-4.1-mini');
    expect(m.legacyOpenAIChat).toBe('gpt-4.1');
    expect(m.appHelper).toBe('gpt-4o-mini');
    expect(m.weeklySummary).toBe('claude-sonnet-4-5-20250929');
  });

  test('every helper job defaults to the shared helper model', () => {
    const m = resolveModels({});
    for (const job of Object.keys(HELPER_JOB_VARS)) {
      expect(m.job[job]).toBe(DEFAULTS.helper);
    }
  });

  test('tier presets are unchanged', () => {
    const t = resolveModels({}).tiers;
    expect(t).toEqual({
      geminiFlash: 'gemini-3-flash-preview',
      geminiFlashLite: 'gemini-3.1-flash-lite',
      nano: 'gpt-4.1-mini',
      mini: 'gpt-4.1-mini',
      haiku: 'claude-haiku-4-5-20251001',
      sonnet: 'claude-sonnet-4-6',
    });
  });

  test('geminiClient default follows the chat default', () => {
    expect(GEMINI_MODEL).toBe(DEFAULTS.chat);
  });

  test('getProviders reads its defaults from models.js', () => {
    expect(getProviders('nano', KEYS).primary.model).toBe('gpt-4.1-mini');
    expect(getProviders('mini', KEYS).fallback.model).toBe('gemini-3-flash-preview');
    expect(getProviders('chat', KEYS).primary.model).toBe('gemini-3-flash-preview');
    expect(getProviders('haiku', KEYS).fallback.model).toBe('gemini-3.1-flash-lite');
    expect(getProviders('sonnet', KEYS).primary.model).toBe('claude-sonnet-4-6');
  });

  test('retired model ids still map to the helper default', () => {
    expect(resolveModel('gpt-4.1-nano', {})).toBe(DEFAULTS.helper);
    expect(resolveModel(undefined, {})).toBe(DEFAULTS.helper);
  });
});

describe('Worker vars override the defaults', () => {
  test('shared knobs', () => {
    const m = resolveModels({
      CHAT_MODEL: 'gemini-3.8-flash',
      HELPER_MODEL: 'gpt-6-luna',
      LEGACY_OPENAI_CHAT_MODEL: 'gpt-5.4',
      APP_HELPER_MODEL: 'gpt-5-nano',
    });
    expect(m.chat).toBe('gemini-3.8-flash');
    expect(m.helper).toBe('gpt-6-luna');
    expect(m.job.chat_extraction).toBe('gpt-6-luna');
    expect(m.legacyOpenAIChat).toBe('gpt-5.4');
    expect(m.appHelper).toBe('gpt-5-nano');
  });

  test('CHAT_MODEL falls back to GEMINI_FLASH_MODEL', () => {
    expect(resolveModels({ GEMINI_FLASH_MODEL: 'gemini-3.7-flash' }).chat).toBe('gemini-3.7-flash');
    expect(
      resolveModels({ GEMINI_FLASH_MODEL: 'gemini-3.7-flash', CHAT_MODEL: 'gemini-3.8-flash' })
        .chat,
    ).toBe('gemini-3.8-flash');
  });

  test("Ask Gremly's writer follows CHAT_MODEL unless it has its own", () => {
    expect(resolveModels({ CHAT_MODEL: 'gemini-3.8-flash' }).ask).toEqual({
      model: 'gemini-3.8-flash',
      effort: 'none',
    });
    const m = resolveModels({ CHAT_MODEL_ASK: 'gpt-6-luna', CHAT_EFFORT_ASK: 'low' });
    expect(m.ask).toEqual({ model: 'gpt-6-luna', effort: 'low' });
    expect(m.chat).toBe('gemini-3-flash-preview');
  });

  test('a single job var wins over HELPER_MODEL', () => {
    const m = resolveModels({ HELPER_MODEL: 'gpt-6-luna', MODEL_TRIAGE_MODE: 'gpt-5-nano' });
    expect(m.job.triage_mode).toBe('gpt-5-nano');
    expect(m.job.triage_signals).toBe('gpt-6-luna');
  });

  test('NANO_MODEL and MINI_MODEL still steer the tier presets', () => {
    const t = resolveModels({ HELPER_MODEL: 'gpt-6-luna', NANO_MODEL: 'gpt-5-nano' }).tiers;
    expect(t.nano).toBe('gpt-5-nano');
    expect(t.mini).toBe('gpt-6-luna');
  });

  test('configureModels sets the active table that call sites read', () => {
    configureModels({ HELPER_MODEL: 'gpt-6-luna' });
    expect(models().helper).toBe('gpt-6-luna');
    expect(helperModel('loading_message')).toBe('gpt-6-luna');
    configureModels({});
    expect(helperModel('loading_message')).toBe(DEFAULTS.helper);
  });

  test('unknown helper job is a programming error', () => {
    expect(() => helperModel('no_such_job')).toThrow(/unknown helper job/);
  });
});
