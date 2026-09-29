/**
 * @jest-environment node
 *
 * helperFetch: the OpenAI request is unchanged for today's model, takes the
 * reasoning family's shape for a reasoning model, and is translated to Gemini
 * (and back into the OpenAI reply shape) for a Gemini model.
 */
import { helperFetch, providerFor } from '../helperClient.js';
import { configureModels } from '../models.js';

const BODY = {
  messages: [
    { role: 'system', content: 'Classify.' },
    { role: 'user', content: 'MESSAGE:\nhello' },
  ],
  max_tokens: 30,
  temperature: 0.1,
};

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return handler(url, init);
  };
  return calls;
}
const jsonResponse = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  configureModels({});
  delete globalThis.fetch;
});

test('providerFor follows the model name', () => {
  expect(providerFor('gpt-4.1-mini')).toBe('openai');
  expect(providerFor('gpt-6-luna')).toBe('openai');
  expect(providerFor('gemini-3.8-flash')).toBe('gemini');
  expect(providerFor('claude-haiku-4-5-20251001')).toBe('anthropic');
});

test("today's model: the request goes out exactly as the call site built it", async () => {
  configureModels({ OPENAI_API_KEY: 'sk-test' });
  const calls = stubFetch(() =>
    jsonResponse({ choices: [{ message: { content: '{"mode":"research"}' } }] }),
  );
  const res = await helperFetch('triage_mode', BODY);
  expect(res.ok).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
  expect(calls[0].init.headers.Authorization).toBe('Bearer sk-test');
  expect(calls[0].body).toEqual({ ...BODY, model: 'gpt-4.1-mini' });
  const json = await res.json();
  expect(json.choices[0].message.content).toBe('{"mode":"research"}');
});

test('a reasoning model gets the reasoning shape: no temperature, headroom, effort', async () => {
  configureModels({ OPENAI_API_KEY: 'k', HELPER_MODEL: 'gpt-6-luna' });
  const calls = stubFetch(() => jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
  await helperFetch('triage_mode', BODY);
  const b = calls[0].body;
  expect(b.model).toBe('gpt-6-luna');
  expect(b.temperature).toBeUndefined();
  expect(b.max_tokens).toBeUndefined();
  expect(b.max_completion_tokens).toBe(1024);
  expect(b.reasoning_effort).toBe('none');
  expect(b.messages).toEqual(BODY.messages);
});

test('gpt-5 nano asks for minimal effort', async () => {
  configureModels({ OPENAI_API_KEY: 'k', MODEL_LOADING_MESSAGE: 'gpt-5-nano' });
  const calls = stubFetch(() =>
    jsonResponse({ choices: [{ message: { content: 'Thinking it over' } }] }),
  );
  await helperFetch('loading_message', { ...BODY, max_tokens: 15 });
  expect(calls[0].body.reasoning_effort).toBe('minimal');
  expect(calls[0].body.max_completion_tokens).toBe(1024);
});

test('one job can move on its own while the rest stay', async () => {
  configureModels({ OPENAI_API_KEY: 'k', MODEL_CHAT_EXTRACTION: 'gpt-6-luna' });
  const calls = stubFetch(() => jsonResponse({ choices: [{ message: { content: '{}' } }] }));
  await helperFetch('chat_extraction', BODY);
  await helperFetch('triage_mode', BODY);
  expect(calls[0].body.model).toBe('gpt-6-luna');
  expect(calls[1].body.model).toBe('gpt-4.1-mini');
});

test('a Gemini model: translated request, OpenAI shaped reply', async () => {
  configureModels({ GOOGLE_API_KEY: 'g-key', HELPER_MODEL: 'gemini-3.8-flash' });
  const calls = stubFetch(() =>
    jsonResponse({
      candidates: [{ content: { parts: [{ text: '{"mode":"quick_ask"}' }] } }],
      usageMetadata: { promptTokenCount: 320, candidatesTokenCount: 6, thoughtsTokenCount: 90 },
    }),
  );
  const res = await helperFetch('triage_mode', {
    ...BODY,
    response_format: { type: 'json_object' },
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toContain('gemini-3.8-flash:generateContent');
  expect(calls[0].init.headers['x-goog-api-key']).toBe('g-key');
  const b = calls[0].body;
  expect(b.systemInstruction.parts[0].text).toBe('Classify.');
  expect(b.contents).toEqual([{ role: 'user', parts: [{ text: 'MESSAGE:\nhello' }] }]);
  expect(b.generationConfig).toMatchObject({
    temperature: 0.1,
    maxOutputTokens: 1024,
    responseMimeType: 'application/json',
  });
  expect(b.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  expect(res.ok).toBe(true);
  const json = await res.json();
  expect(json.choices[0].message.content).toBe('{"mode":"quick_ask"}');
  expect(json.usage).toEqual({ prompt_tokens: 320, completion_tokens: 6 });
});

test('a Gemini call with no system message sends no systemInstruction', async () => {
  configureModels({ GOOGLE_API_KEY: 'g', HELPER_MODEL: 'gemini-3.8-flash' });
  const calls = stubFetch(() =>
    jsonResponse({
      candidates: [{ content: { parts: [{ text: 'Summary.' }] } }],
      usageMetadata: {},
    }),
  );
  await helperFetch('running_summary', {
    messages: [{ role: 'user', content: 'Summarize this' }],
    max_tokens: 350,
    temperature: 0.3,
  });
  expect(calls[0].body.systemInstruction).toBeUndefined();
  expect(calls[0].body.contents[0].parts[0].text).toBe('Summarize this');
});

test('a Gemini failure comes back as a non ok Response the call sites already handle', async () => {
  configureModels({ GOOGLE_API_KEY: 'g', HELPER_MODEL: 'gemini-3.8-flash' });
  stubFetch(() => jsonResponse({ error: { message: 'quota' } }, 429));
  const res = await helperFetch('triage_mode', BODY);
  expect(res.ok).toBe(false);
  expect(res.status).toBe(429);
});
