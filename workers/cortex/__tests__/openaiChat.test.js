/**
 * @jest-environment node
 *
 * An OpenAI writer behind the Gemini chat client: geminiStream and
 * geminiGenerate send an OpenAI model's call to the Responses API and give
 * back Gemini's shapes, so every chat surface reads it unchanged.
 */
import {
  geminiGenerate,
  geminiStream,
  parseGeminiChunk,
  buildFollowUpContents,
} from '../geminiClient.js';
import {
  geminiShapedStream,
  geminiUsageFrom,
  responsesBody,
  responsesInputFrom,
} from '../openaiChat.js';
import { configureModels } from '../models.js';

function sse(chunks) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

async function readAll(stream) {
  const dec = new TextDecoder();
  const reader = stream.getReader();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

// what a chat surface does with a stream: each data line through parseGeminiChunk
async function readAsSurface(body) {
  const text = await readAll(body);
  let reply = '';
  const calls = [];
  let usage = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const c = parseGeminiChunk(line.slice(6));
    if (c.text) reply += c.text;
    if (c.functionCalls) calls.push(...c.functionCalls);
    const u = JSON.parse(line.slice(6)).usageMetadata;
    if (u) usage = u;
  }
  return { reply, calls, usage };
}

const ev = (obj) => `event: ${obj.type}\ndata: ${JSON.stringify(obj)}\n\n`;
const USAGE = {
  input_tokens: 8000,
  input_tokens_details: { cached_tokens: 6000 },
  output_tokens: 120,
  output_tokens_details: { reasoning_tokens: 20 },
};

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  configureModels({});
});

describe('Responses input from Gemini contents', () => {
  test('text turns, a function call and its result', () => {
    const contents = buildFollowUpContents(
      [
        { role: 'user', parts: [{ text: 'Hi' }] },
        { role: 'model', parts: [{ text: 'Hello' }] },
        { role: 'user', parts: [{ text: 'Best ramen near me?' }] },
      ],
      [
        { text: 'Let me look.' },
        { functionCall: { name: 'web_search', args: { query: 'ramen SF' }, id: 'call_a' } },
      ],
      [{ name: 'web_search', id: 'call_a', response: { results: 'Marufuku' } }],
    );
    expect(responsesInputFrom(contents)).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'Best ramen near me?' },
      { role: 'assistant', content: 'Let me look.' },
      {
        type: 'function_call',
        call_id: 'call_a',
        name: 'web_search',
        arguments: '{"query":"ramen SF"}',
      },
      { type: 'function_call_output', call_id: 'call_a', output: '{"results":"Marufuku"}' },
    ]);
  });

  test('a call and a result with no ids are paired by order', () => {
    const input = responsesInputFrom([
      {
        role: 'model',
        parts: [
          { functionCall: { name: 'web_search', args: { query: 'a' } } },
          { functionCall: { name: 'web_search', args: { query: 'b' } } },
        ],
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'web_search', response: { r: 1 } } },
          { functionResponse: { name: 'web_search', response: { r: 2 } } },
        ],
      },
    ]);
    const calls = input.filter((i) => i.type === 'function_call').map((i) => i.call_id);
    const outs = input.filter((i) => i.type === 'function_call_output').map((i) => i.call_id);
    expect(outs).toEqual(calls);
    expect(new Set(calls).size).toBe(2);
  });
});

describe('the Responses request', () => {
  test('instructions, effort, cache key and function tools; no temperature', () => {
    const body = responsesBody(
      'You are Gremly.',
      [{ role: 'user', parts: [{ text: 'Hi' }] }],
      {
        model: 'gpt-6-luna',
        effort: 'none',
        temperature: 0.7,
        maxOutputTokens: 2000,
        cacheKey: 'ask:u1',
        tools: [
          { googleSearch: {} },
          { type: 'function', function: { name: 'web_search', description: 'd', parameters: {} } },
        ],
      },
      true,
    );
    expect(body).toMatchObject({
      model: 'gpt-6-luna',
      instructions: 'You are Gremly.',
      reasoning: { effort: 'none' },
      max_output_tokens: 2000,
      prompt_cache_key: 'ask:u1',
      store: false,
      stream: true,
    });
    expect(body.temperature).toBeUndefined();
    expect(body.tools).toEqual([
      { type: 'function', name: 'web_search', description: 'd', parameters: {}, strict: false },
    ]);
  });

  test('a writer that thinks gets room above the reply cap', () => {
    const body = responsesBody('', [], {
      model: 'gpt-6-luna',
      effort: 'low',
      maxOutputTokens: 2000,
    });
    expect(body.max_output_tokens).toBe(4000);
    expect(body.stream).toBeUndefined();
  });
});

describe('the stream, in Gemini shape', () => {
  test('text across chunk boundaries, a function call and the usage', async () => {
    const raw = [
      ev({ type: 'response.created', response: { id: 'r1' } }),
      ev({ type: 'response.output_text.delta', delta: 'Bella ' }),
      // one event split across two chunks
      ev({ type: 'response.output_text.delta', delta: 'is home.' }).slice(0, 30),
      ev({ type: 'response.output_text.delta', delta: 'is home.' }).slice(30),
      ev({
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          name: 'web_search',
          call_id: 'call_9',
          arguments: '{"query":"dog parks"}',
        },
      }),
      ev({ type: 'response.completed', response: { model: 'gpt-6-luna', usage: USAGE } }),
    ];
    const out = await readAsSurface(geminiShapedStream(sse(raw), () => {}));
    expect(out.reply).toBe('Bella is home.');
    expect(out.calls).toEqual([
      {
        name: 'web_search',
        args: { query: 'dog parks' },
        id: 'call_9',
        thoughtSignature: undefined,
      },
    ]);
    expect(out.usage).toEqual({
      promptTokenCount: 8000,
      cachedContentTokenCount: 6000,
      candidatesTokenCount: 100,
      thoughtsTokenCount: 20,
    });
  });

  test('a failed stream is logged', async () => {
    const logged = [];
    await readAll(
      geminiShapedStream(
        sse([ev({ type: 'response.failed', response: { error: { message: 'overloaded' } } })]),
        (line, data) => logged.push([line, data]),
      ),
    );
    expect(logged).toEqual([['[OpenAIChat] stream failed', { error: 'overloaded' }]]);
  });

  test('usage maps reasoning out of the reply count', () => {
    expect(geminiUsageFrom(null)).toBeNull();
    expect(geminiUsageFrom({ input_tokens: 10, output_tokens: 5 })).toEqual({
      promptTokenCount: 10,
      cachedContentTokenCount: 0,
      candidatesTokenCount: 5,
      thoughtsTokenCount: 0,
    });
  });
});

describe('geminiStream with an OpenAI writer', () => {
  test('goes to the Responses API with the OpenAI key and streams back in Gemini shape', async () => {
    configureModels({ OPENAI_API_KEY: 'sk-test', CHAT_MODEL_ASK: 'gpt-6-luna' });
    const seen = [];
    global.fetch = jest.fn(async (url, init) => {
      seen.push({ url, init });
      return new Response(
        sse([
          ev({ type: 'response.output_text.delta', delta: 'Hi James.' }),
          ev({ type: 'response.completed', response: { usage: USAGE } }),
        ]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const res = await geminiStream(
      'You are Gremly.',
      [
        { role: 'system', content: 'You are Gremly.' },
        { role: 'user', content: 'Hi' },
      ],
      {
        label: 'general_chat',
        temperature: 0.7,
        maxOutputTokens: 2000,
        model: 'gpt-6-luna',
        effort: 'none',
      },
      'google-key',
    );
    const out = await readAsSurface(res.body);
    log.mockRestore();
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://api.openai.com/v1/responses');
    expect(seen[0].init.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(seen[0].init.body);
    expect(body.input).toEqual([{ role: 'user', content: 'Hi' }]);
    expect(body.reasoning).toEqual({ effort: 'none' });
    expect(out.reply).toBe('Hi James.');
  });

  test('a writer that fails to start is tried once on CHAT_MODEL', async () => {
    configureModels({ OPENAI_API_KEY: 'sk-test', CHAT_MODEL: 'gemini-3-flash-preview' });
    const urls = [];
    global.fetch = jest.fn(async (url) => {
      urls.push(url);
      if (url.includes('openai')) return new Response('busy', { status: 503 });
      return new Response(
        sse(['data: {"candidates":[{"content":{"parts":[{"text":"From Gemini."}]}}]}\n\n']),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const res = await geminiStream(
      '',
      [{ role: 'user', content: 'Hi' }],
      { model: 'gpt-6-luna', temperature: 0.5, maxOutputTokens: 100 },
      'google-key',
    );
    const out = await readAsSurface(res.body);
    log.mockRestore();
    expect(urls[0]).toBe('https://api.openai.com/v1/responses');
    expect(urls[1]).toContain('/models/gemini-3-flash-preview:streamGenerateContent');
    expect(out.reply).toBe('From Gemini.');
  });

  test('a Gemini writer is untouched', async () => {
    configureModels({});
    const urls = [];
    global.fetch = jest.fn(async (url) => {
      urls.push(url);
      return new Response(
        sse(['data: {"candidates":[{"content":{"parts":[{"text":"x"}]}}]}\n\n']),
        {
          status: 200,
        },
      );
    });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const res = await geminiStream('', [{ role: 'user', content: 'Hi' }], {}, 'google-key');
    await readAll(res.body);
    log.mockRestore();
    expect(urls).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:streamGenerateContent?alt=sse',
    ]);
  });
});

describe('geminiGenerate with an OpenAI writer', () => {
  test('content, function calls and usage in geminiGenerate shape', async () => {
    configureModels({ OPENAI_API_KEY: 'sk-test' });
    global.fetch = jest.fn(async () =>
      Response.json({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'Here you go.' }] },
          { type: 'function_call', name: 'web_search', call_id: 'c1', arguments: '{"query":"q"}' },
        ],
        usage: USAGE,
      }),
    );
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const out = await geminiGenerate(
      '',
      [{ role: 'user', content: 'Hi' }],
      { model: 'gpt-6-luna' },
      'g',
    );
    log.mockRestore();
    expect(out.ok).toBe(true);
    expect(out.content).toBe('Here you go.');
    expect(out.functionCalls).toEqual([
      { name: 'web_search', args: { query: 'q' }, id: 'c1', thoughtSignature: undefined },
    ]);
    expect(out.parts).toEqual([
      { text: 'Here you go.' },
      { functionCall: { name: 'web_search', args: { query: 'q' }, id: 'c1' } },
    ]);
    expect(out.usage.cachedContentTokenCount).toBe(6000);
  });
});
