/**
 * @jest-environment node
 *
 * The chat helper split behind flags: every default is today's behaviour;
 * each flag changes exactly what it says.
 */
import { configureModels, resolveModels } from '../models.js';
import { getSearchPolicy } from '../gremlyPersona.js';
import { helperFetch } from '../helperClient.js';
import { triageMessage, buildOneCallSystemPrompt } from '../triage.js';
import {
  withEvidenceRule,
  evidenceGrounded,
  NO_EXTRACTION_MODES,
  buildChatExtractionPrompt,
} from '../chatPrompts.js';

const jsonResponse = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    return handler(url, body, calls.length);
  };
  return calls;
}
afterEach(() => {
  configureModels({});
  delete globalThis.fetch;
});

test('flags default to today', () => {
  const m = resolveModels({});
  expect(m.flags).toEqual({
    triageOneCall: false,
    extractionV2: false,
    searchRequiredForces: true,
    entityCards: false,
  });
  expect(m.helperFallback).toBe('');
});

test('required search forces a search by default and only attaches the tool when switched off', () => {
  configureModels({});
  expect(getSearchPolicy('required')).toEqual({ attachTool: true, toolChoice: 'required' });
  configureModels({ SEARCH_REQUIRED_FORCES: 'off' });
  expect(getSearchPolicy('required')).toEqual({ attachTool: true, toolChoice: 'auto' });
  expect(getSearchPolicy('maybe')).toEqual({ attachTool: true, toolChoice: 'auto' });
  expect(getSearchPolicy('none')).toEqual({ attachTool: false, toolChoice: null });
});

test('two calls by default; one call with TRIAGE_ONE_CALL=on', async () => {
  configureModels({ OPENAI_API_KEY: 'k' });
  let calls = stubFetch((url, body) =>
    jsonResponse({
      choices: [
        {
          message: {
            content:
              body.max_tokens === 30
                ? '{"mode":"research"}'
                : '{"personal":"deep","depth":"standard","search":"maybe"}',
          },
        },
      ],
    }),
  );
  const opts = {
    userMessage: 'Best coffee near me?',
    previousExchange: null,
    spaceName: null,
    runningSummary: null,
    chatType: 'general',
    env: { OPENAI_API_KEY: 'k' },
    domainNames: [],
    profileSnippet: '',
    messageCount: 1,
  };
  let t = await triageMessage(opts);
  expect(calls).toHaveLength(2);
  expect(t).toEqual({
    mode: 'research',
    personal: 'deep',
    depth: 'standard',
    search: 'maybe',
    source: 'classifier',
  });

  configureModels({ OPENAI_API_KEY: 'k', TRIAGE_ONE_CALL: 'on' });
  calls = stubFetch(() =>
    jsonResponse({
      choices: [
        {
          message: {
            content: '{"mode":"quick_ask","personal":"none","depth":"brief","search":"none"}',
          },
        },
      ],
    }),
  );
  t = await triageMessage(opts);
  expect(calls).toHaveLength(1);
  expect(calls[0].body.max_tokens).toBe(80);
  expect(calls[0].body.messages[0].content).toBe(buildOneCallSystemPrompt([], '', 1));
  expect(t).toEqual({
    mode: 'quick_ask',
    personal: 'none',
    depth: 'brief',
    search: 'none',
    source: 'classifier',
  });
});

test('one call: an invalid answer falls back field by field, a failed call falls back whole', async () => {
  configureModels({ OPENAI_API_KEY: 'k', TRIAGE_ONE_CALL: 'on' });
  const opts = {
    userMessage: 'hi',
    chatType: 'general',
    env: {},
    domainNames: [],
    profileSnippet: '',
    messageCount: 1,
  };
  stubFetch(() =>
    jsonResponse({ choices: [{ message: { content: '{"mode":"nonsense","depth":"brief"}' } }] }),
  );
  expect(await triageMessage(opts)).toEqual({
    mode: 'exploratory',
    personal: 'light',
    depth: 'brief',
    search: 'none',
    source: 'classifier',
  });
  stubFetch(() => jsonResponse({ error: { message: 'down' } }, 500));
  expect(await triageMessage(opts)).toMatchObject({ mode: 'exploratory', source: 'fallback' });
});

test('helper fallback: off by default, one retry on the fallback model when set', async () => {
  configureModels({ OPENAI_API_KEY: 'k' });
  let calls = stubFetch(() => jsonResponse({ error: { message: 'down' } }, 503));
  let res = await helperFetch('triage_mode', {
    messages: [{ role: 'user', content: 'x' }],
    max_tokens: 30,
  });
  expect(res.status).toBe(503);
  expect(calls).toHaveLength(1);

  configureModels({
    OPENAI_API_KEY: 'k',
    GOOGLE_API_KEY: 'g',
    HELPER_FALLBACK_MODEL: 'gemini-3.8-flash',
  });
  calls = stubFetch((url) =>
    url.includes('openai')
      ? jsonResponse({ error: { message: 'down' } }, 503)
      : jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata: {} }),
  );
  res = await helperFetch('triage_mode', {
    messages: [{ role: 'user', content: 'x' }],
    max_tokens: 30,
  });
  expect(res.ok).toBe(true);
  expect(calls).toHaveLength(2);
  expect(calls[0].url).toContain('openai');
  expect(calls[1].url).toContain('gemini-3.8-flash');
  expect((await res.json()).choices[0].message.content).toBe('ok');
});

test('extraction v2 pieces: evidence rule text, grounding check, skipped modes', () => {
  const base = buildChatExtractionPrompt({
    todayStr: 'Tuesday, September 29, 2026',
    runningSummary: null,
    conversationText: 'User: hi',
    handledIds: [],
    existingItemsBlock: '',
  });
  const v2 = withEvidenceRule(base);
  expect(v2).toContain('EVIDENCE: For every item, include "evidence"');
  expect(v2).toContain('"body":"...","evidence":"...","due_date"');
  expect(v2.indexOf('EVIDENCE:')).toBeLessThan(
    v2.indexOf('WRITING STYLE for title and body fields:'),
  );
  expect(base).not.toContain('EVIDENCE:');
  expect(evidenceGrounded('I need to cancel Hulu', ['ugh I need to cancel the Hulu thing'])).toBe(
    true,
  );
  expect(evidenceGrounded('book the dentist', ['what should I do today'])).toBe(false);
  expect(evidenceGrounded('', ['anything'])).toBe(false);
  expect(NO_EXTRACTION_MODES).toEqual([
    'chit_chat',
    'playful',
    'app_help',
    'venting',
    'emotional',
    'celebration',
  ]);
});
