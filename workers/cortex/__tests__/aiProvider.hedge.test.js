/**
 * aiProvider: hedged fallback for realtime calls (used by classify-v3).
 */
import { aiClassify } from '../aiProvider.js';

const OPENAI = 'api.openai.com';
const GEMINI = 'generativelanguage.googleapis.com';

function openaiReply(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }], usage: {} }),
  };
}
function geminiReply(text) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: {} }),
    text: async () => text,
  };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function mockFetch({ geminiMs, geminiBody, openaiMs, openaiBody }) {
  global.fetch = jest.fn(async (url) => {
    const u = String(url);
    if (u.includes(GEMINI)) {
      await wait(geminiMs);
      return geminiReply(geminiBody);
    }
    if (u.includes(OPENAI)) {
      await wait(openaiMs);
      return openaiReply(openaiBody);
    }
    throw new Error(`unexpected ${u}`);
  });
}

const env = { CONTEXT_CACHE: { get: async () => null, put: async () => {} } };
const base = {
  mode: 'realtime',
  env,
  systemPrompt: 'sys',
  messages: [{ role: 'user', content: 'x' }],
  endpoint: 'test',
  primary: { provider: 'gemini', model: 'gemini-test', apiKey: 'k', responseFormat: 'json' },
  fallback: { provider: 'openai', model: 'gpt-test', apiKey: 'k', responseFormat: 'json' },
  primaryTimeoutMs: 2000,
  fallbackTimeoutMs: 2000,
  hedgeAfterMs: 100,
  validate: (p) => (p && p.ok === true ? { valid: true } : { valid: false, reason: 'shape' }),
};

afterEach(() => {
  delete global.fetch;
});

it('uses the primary when it answers before the hedge point', async () => {
  mockFetch({
    geminiMs: 10,
    geminiBody: '{"ok":true,"from":"gemini"}',
    openaiMs: 10,
    openaiBody: '{"ok":true,"from":"openai"}',
  });
  const r = await aiClassify(base);
  expect(r.parsed).toEqual({ ok: true, from: 'gemini' });
  expect(r.wasFallback).toBe(false);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it('races the fallback when the primary is slow and uses whichever answers first', async () => {
  mockFetch({
    geminiMs: 600,
    geminiBody: '{"ok":true,"from":"gemini"}',
    openaiMs: 20,
    openaiBody: '{"ok":true,"from":"openai"}',
  });
  const t0 = Date.now();
  const r = await aiClassify(base);
  expect(r.parsed).toEqual({ ok: true, from: 'openai' });
  expect(r.wasFallback).toBe(true);
  expect(r.fallbackReason).toBe('hedge');
  expect(Date.now() - t0).toBeLessThan(500);
});

it('keeps waiting for a slow primary when the fallback answer is invalid', async () => {
  mockFetch({
    geminiMs: 300,
    geminiBody: '{"ok":true,"from":"gemini"}',
    openaiMs: 20,
    openaiBody: '{"nope":1}',
  });
  const r = await aiClassify(base);
  expect(r.parsed).toEqual({ ok: true, from: 'gemini' });
  expect(r.wasFallback).toBe(false);
});

it('falls back straight away when the primary fails before the hedge point', async () => {
  mockFetch({
    geminiMs: 10,
    geminiBody: 'not json',
    openaiMs: 10,
    openaiBody: '{"ok":true,"from":"openai"}',
  });
  const r = await aiClassify(base);
  expect(r.parsed).toEqual({ ok: true, from: 'openai' });
  expect(r.wasFallback).toBe(true);
});

it('does not hedge when hedgeAfterMs is not set', async () => {
  mockFetch({
    geminiMs: 300,
    geminiBody: '{"ok":true,"from":"gemini"}',
    openaiMs: 10,
    openaiBody: '{"ok":true,"from":"openai"}',
  });
  const r = await aiClassify({ ...base, hedgeAfterMs: undefined });
  expect(r.parsed).toEqual({ ok: true, from: 'gemini' });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
