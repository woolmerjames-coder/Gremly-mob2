/**
 * @jest-environment node
 */
// One model call with tools, the same for Gemini and OpenAI
// (workers/cortex/agent/providers.js).

import {
  callModel,
  geminiContents,
  geminiTool,
  openaiMessages,
  providerOf,
  readGemini,
  readOpenAI,
  readResponses,
  responsesInput,
} from '../providers.js';

const TOOLS = [
  {
    name: 'find_items',
    description: 'Search.',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
  },
];

const turns = [
  { role: 'user', text: 'earlier', provider: null },
  { role: 'assistant', text: 'earlier reply', provider: null },
  { role: 'user', text: 'move the dentist' },
];

let sent;
beforeEach(() => {
  sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body), headers: init.headers });
    if (String(url).endsWith('/v1/responses')) {
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'enc' },
            {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_9',
              name: 'find_items',
              arguments: '{"query":"dentist"}',
            },
          ],
        }),
      );
    }
    if (String(url).includes('generativelanguage')) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'thinking aloud', thought: true },
                  {
                    functionCall: { name: 'find_items', args: { query: 'dentist' } },
                    thoughtSignature: 'sig1',
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      );
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'find_items', arguments: '{"query":"dentist"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    );
  };
});

describe('which provider', () => {
  it('follows the model name', () => {
    expect(providerOf('gemini-3.8-flash')).toBe('google');
    expect(providerOf('gpt-6-luna')).toBe('openai');
    expect(providerOf('claude-sonnet-5-5')).toBe('anthropic');
  });
});

describe('Gemini', () => {
  it('sends the tools, lets the model call them, and reads its calls with their signatures', async () => {
    const r = await callModel({
      model: 'gemini-3.8-flash',
      system: 'SYS',
      turns,
      tools: TOOLS,
      keys: { google: 'k' },
    });
    expect(sent[0].url).toContain('/gemini-3.8-flash:generateContent');
    expect(sent[0].headers['x-goog-api-key']).toBe('k');
    expect(sent[0].body).toMatchObject({
      systemInstruction: { parts: [{ text: 'SYS' }] },
      tools: [{ functionDeclarations: TOOLS }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      generationConfig: { thinkingConfig: { thinkingLevel: 'low' } },
    });
    expect(sent[0].body.contents).toEqual([
      { role: 'user', parts: [{ text: 'earlier' }] },
      { role: 'model', parts: [{ text: 'earlier reply' }] },
      { role: 'user', parts: [{ text: 'move the dentist' }] },
    ]);
    expect(r).toMatchObject({
      ok: true,
      provider: 'google',
      text: '',
      calls: [{ id: 'g1', nativeId: null, name: 'find_items', args: { query: 'dentist' } }],
    });
  });

  it('declares a tool that takes nothing without parameters, which Gemini refuses when empty', async () => {
    const bare = {
      name: 'offer_week',
      description: 'Put the button.',
      parameters: { type: 'object', properties: {} },
    };
    expect(geminiTool(bare)).toEqual({ name: 'offer_week', description: 'Put the button.' });
    expect(geminiTool(TOOLS[0])).toBe(TOOLS[0]);
    await callModel({
      model: 'gemini-3.8-flash',
      system: 'SYS',
      turns,
      tools: [...TOOLS, bare],
      keys: { google: 'k' },
    });
    expect(sent.at(-1).body.tools[0].functionDeclarations).toEqual([
      TOOLS[0],
      { name: 'offer_week', description: 'Put the button.' },
    ]);
  });

  it('sends its own parts back unchanged, then the tool results', () => {
    const raw = readGemini({
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: 'find_items', args: {} }, thoughtSignature: 's' }],
          },
        },
      ],
    }).raw;
    const c = geminiContents([
      { role: 'user', text: 'x' },
      { role: 'assistant', text: '', calls: [], raw, provider: 'google' },
      { role: 'tool', results: [{ id: 'g1', nativeId: null, name: 'find_items', text: 'found' }] },
    ]);
    expect(c[1]).toEqual({
      role: 'model',
      parts: [{ functionCall: { name: 'find_items', args: {} }, thoughtSignature: 's' }],
    });
    expect(c[2]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { name: 'find_items', response: { result: 'found' } } }],
    });
  });

  it('turns tools off for the last step', async () => {
    await callModel({
      model: 'gemini-3.8-flash',
      system: 'S',
      turns,
      tools: TOOLS,
      final: true,
      keys: { google: 'k' },
    });
    expect(sent[0].body.toolConfig).toEqual({ functionCallingConfig: { mode: 'NONE' } });
  });
});

describe('OpenAI reasoning models, on the Responses API', () => {
  it('sends the tools and low reasoning, stores nothing, and reads the calls', async () => {
    const r = await callModel({
      model: 'gpt-6-luna',
      system: 'SYS',
      turns,
      tools: TOOLS,
      keys: { openai: 'k' },
    });
    expect(sent[0].url).toBe('https://api.openai.com/v1/responses');
    expect(sent[0].body).toMatchObject({
      model: 'gpt-6-luna',
      instructions: 'SYS',
      reasoning: { effort: 'low' },
      store: false,
      tool_choice: 'auto',
      tools: [
        {
          type: 'function',
          name: 'find_items',
          description: 'Search.',
          parameters: TOOLS[0].parameters,
          strict: false,
        },
      ],
    });
    expect(sent[0].body.input).toEqual([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'earlier reply' },
      { role: 'user', content: 'move the dentist' },
    ]);
    expect(r).toMatchObject({
      ok: true,
      provider: 'openai-responses',
      calls: [{ id: 'call_9', name: 'find_items', args: { query: 'dentist' } }],
    });
  });

  it('sends every output item back as it came, reasoning included, then each result', () => {
    const raw = readResponses({
      output: [
        { type: 'reasoning', id: 'rs_1', encrypted_content: 'enc' },
        { type: 'function_call', call_id: 'call_9', name: 'find_items', arguments: '{}' },
      ],
    }).raw;
    const input = responsesInput([
      { role: 'user', text: 'x' },
      { role: 'assistant', raw, provider: 'openai-responses' },
      { role: 'tool', results: [{ id: 'call_9', name: 'find_items', text: 'found' }] },
    ]);
    expect(input.slice(1)).toEqual([
      ...raw,
      { type: 'function_call_output', call_id: 'call_9', output: 'found' },
    ]);
  });

  it('reads the reply text from the message items', () => {
    expect(
      readResponses({
        output: [
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done.' }] },
        ],
      }).text,
    ).toBe('Done.');
  });
});

describe('OpenAI models without reasoning, on chat completions', () => {
  it('sends the tools and reads the calls', async () => {
    const r = await callModel({
      model: 'gpt-4.1-mini',
      system: 'SYS',
      turns,
      tools: TOOLS,
      keys: { openai: 'k' },
    });
    expect(sent[0].body).toMatchObject({
      model: 'gpt-4.1-mini',
      tools: [{ type: 'function', function: TOOLS[0] }],
      tool_choice: 'auto',
    });
    expect(sent[0].body.reasoning_effort).toBeUndefined();
    expect(sent[0].body.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(r).toMatchObject({
      ok: true,
      provider: 'openai',
      calls: [{ id: 'call_1', name: 'find_items', args: { query: 'dentist' } }],
    });
  });

  it('sends the assistant message back as it came, then each result against its call', () => {
    const raw = readOpenAI({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: 'call_1', type: 'function', function: { name: 'find_items', arguments: '{}' } },
            ],
          },
        },
      ],
    }).raw;
    const m = openaiMessages('S', [
      { role: 'user', text: 'x' },
      { role: 'assistant', raw, provider: 'openai' },
      { role: 'tool', results: [{ id: 'call_1', name: 'find_items', text: 'found' }] },
    ]);
    expect(m[2]).toEqual(raw);
    expect(m[3]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: 'found' });
  });

  it('builds a call another provider made in its own shape', () => {
    const m = openaiMessages('S', [
      {
        role: 'assistant',
        text: '',
        calls: [{ id: 'g1', name: 'get_day', args: {} }],
        provider: 'google',
        raw: [],
      },
    ]);
    expect(m[1]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'g1', type: 'function', function: { name: 'get_day', arguments: '{}' } }],
    });
  });
});

describe('failures', () => {
  it('say what went wrong without throwing', async () => {
    globalThis.fetch = async () => new Response('busy', { status: 503 });
    expect(
      await callModel({
        model: 'gemini-3.8-flash',
        system: 'S',
        turns,
        tools: [],
        keys: { google: 'k' },
      }),
    ).toEqual({
      ok: false,
      status: 503,
      error: 'busy',
    });
    expect(
      await callModel({ model: 'gpt-6-luna', system: 'S', turns, tools: [], keys: {} }),
    ).toEqual({ ok: false, error: 'no OpenAI key' });
    expect(
      (await callModel({ model: 'claude-sonnet-5-5', system: 'S', turns, tools: [], keys: {} })).ok,
    ).toBe(false);
  });
});
