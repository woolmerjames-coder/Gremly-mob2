/**
 * @jest-environment node
 */
// Usage logging shared by cortex and inngest-jobs: the row each call writes,
// the route/step job name, the run id, the first chunk time of a stream, and
// Tavily searches.

import {
  aiContext,
  installAiUsageLogging,
  jobName,
  priceFor,
  setAiUsage,
  withAiStep,
} from '../aiUsage';

const rows = [];
let provider = async () => new Response('{}');

// The logger binds the fetch it finds when it is installed, so the stand-in
// goes in before installAiUsageLogging runs. It sends usage rows to `rows`
// and everything else to `provider`.
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.includes('/rest/v1/ai_usage')) {
    rows.push(JSON.parse(init.body));
    return new Response(null, { status: 201 });
  }
  return provider(url, init);
};

installAiUsageLogging();

const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';

function request(fields, fn) {
  const pending = [];
  const store = {
    env: { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'key' },
    ctx: { waitUntil: (p) => pending.push(p) },
    worker: 'cortex',
    job: null,
    userId: null,
    runId: 'run-1',
    ...fields,
  };
  return aiContext.run(store, async () => {
    const out = await fn();
    await Promise.all(pending);
    return out;
  });
}

function sse(chunks, gapMs = 30) {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for (const c of chunks) {
        await new Promise((r) => setTimeout(r, gapMs));
        controller.enqueue(enc.encode(c));
      }
      controller.close();
    },
  });
}

beforeEach(() => {
  rows.length = 0;
  provider = async () => new Response('{}');
});

describe('jobName', () => {
  it('is the route alone, or route/step when the call has a step', () => {
    expect(jobName({ job: 'general_chat' })).toBe('general_chat');
    expect(jobName({ job: 'general_chat', step: 'triage_mode' })).toBe('general_chat/triage_mode');
    expect(jobName({ step: 'reply' })).toBe('unknown/reply');
    expect(jobName(null)).toBeNull();
  });
});

describe('withAiStep', () => {
  it('runs the function as it is outside a request', async () => {
    await expect(withAiStep('reply', async () => 7)).resolves.toBe(7);
  });

  it('names the step, and keeps a step already set when asked to', () =>
    request({ job: 'general_chat' }, () =>
      withAiStep('entity_match', () => {
        expect(aiContext.getStore().step).toBe('entity_match');
        withAiStep('reply', () => expect(aiContext.getStore().step).toBe('entity_match'), {
          keep: true,
        });
        withAiStep('reply', () => expect(aiContext.getStore().step).toBe('reply'));
      }),
    ));
});

describe('priceFor', () => {
  it('prices Gemini 3.6 Flash at the promotional rate until 2027', () => {
    expect(priceFor('gemini-3.6-flash', Date.parse('2026-10-02'))).toEqual([0.75, 0.075, 0, 3.75]);
    expect(priceFor('gemini-3.6-flash', Date.parse('2027-01-02'))).toEqual([1.5, 0.15, 0, 7.5]);
  });

  it('tells 3.5 Flash from 3.5 Flash-Lite', () => {
    expect(priceFor('gemini-3.5-flash')).toEqual([1.5, 0.15, 0, 9]);
    expect(priceFor('gemini-3.5-flash-lite')).toEqual([0.3, 0.03, 0, 2.5]);
  });
});

describe('the row each call writes', () => {
  it('logs a helper call under route/step with the user and run', async () => {
    provider = async () =>
      new Response(
        JSON.stringify({
          model: 'gpt-6-luna',
          usage: { prompt_tokens: 1000, completion_tokens: 100 },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    await request({}, async () => {
      setAiUsage({ job: 'general_chat' });
      setAiUsage({ userId: USER });
      const res = await withAiStep('triage_mode', () =>
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          body: JSON.stringify({ model: 'gpt-6-luna' }),
        }),
      );
      expect((await res.json()).model).toBe('gpt-6-luna');
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      worker: 'cortex',
      job: 'general_chat/triage_mode',
      user_id: USER,
      run_id: 'run-1',
      provider: 'openai',
      model: 'gpt-6-luna',
      input_tokens: 1000,
      output_tokens: 100,
      ok: true,
      meta: null,
    });
    expect(rows[0].cost_usd).toBeCloseTo(0.00015, 8);
  });

  it('records when the first chunk of a streamed reply arrived', async () => {
    provider = async () =>
      new Response(
        sse([
          'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}],"modelVersion":"gemini-3-flash-preview"}\n\n',
          'data: {"candidates":[{"content":{"parts":[{"text":" there"}]}}],"usageMetadata":{"promptTokenCount":9000,"candidatesTokenCount":200,"thoughtsTokenCount":50},"modelVersion":"gemini-3-flash-preview"}\n\n',
        ]),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    let text = '';
    await request({ job: 'general_chat', userId: USER }, async () => {
      const res = await withAiStep('reply', () =>
        fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:streamGenerateContent?alt=sse',
          { method: 'POST', body: '{}' },
        ),
      );
      text = await res.text();
    });
    expect(text).toContain('there');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      job: 'general_chat/reply',
      provider: 'google',
      model: 'gemini-3-flash-preview',
      input_tokens: 9000,
      output_tokens: 250,
      thinking_tokens: 50,
    });
    expect(rows[0].meta.first_chunk_ms).toBeGreaterThanOrEqual(20);
    expect(rows[0].latency_ms).toBeGreaterThanOrEqual(rows[0].meta.first_chunk_ms);
  });

  it('logs a Tavily search with no tokens and no price', async () => {
    provider = async () => new Response(JSON.stringify({ results: [] }));
    await request({ job: 'general_chat', userId: USER }, () =>
      fetch('https://api.tavily.com/search', { method: 'POST', body: '{"query":"x"}' }),
    );
    expect(rows[0]).toMatchObject({
      job: 'general_chat',
      provider: 'tavily',
      model: 'tavily-search',
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: null,
    });
  });

  it('leaves the user out when the id is not a uuid', async () => {
    await request({ job: 'classify', userId: 'not-a-user' }, () =>
      fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: '{}' }),
    );
    expect(rows[0].user_id).toBeNull();
  });

  it('does not log calls to anything else', async () => {
    await request({ job: 'general_chat' }, () => fetch('https://example.com/x'));
    expect(rows).toHaveLength(0);
  });
});
