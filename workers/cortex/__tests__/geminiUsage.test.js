/**
 * @jest-environment node
 *
 * tapGeminiUsage passes a Gemini SSE stream through byte for byte and logs the
 * final usageMetadata when the stream ends.
 */
import { tapGeminiUsage } from '../geminiClient.js';

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

describe('tapGeminiUsage', () => {
  test('bytes pass through unchanged and the last usage wins', async () => {
    const lines = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}],"usageMetadata":{"promptTokenCount":900,"candidatesTokenCount":2}}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}],"usageMetadata":{"promptTokenCount":900,"candidatesTokenCount":40,"thoughtsTokenCount":12,"cachedContentTokenCount":512}}\n\n',
    ];
    const logged = [];
    const tapped = tapGeminiUsage(
      sse(lines),
      { model: 'gemini-test', label: 'general_chat', t0: Date.now() },
      (l, d) => logged.push([l, d]),
    );
    const text = await readAll(tapped);
    expect(text).toBe(lines.join(''));
    expect(logged).toHaveLength(1);
    expect(logged[0][0]).toBe('[USAGE]');
    expect(logged[0][1]).toMatchObject({
      model: 'gemini-test',
      label: 'general_chat',
      input: 900,
      cached: 512,
      output: 40,
      thinking: 12,
    });
    expect(typeof logged[0][1].ms).toBe('number');
  });

  test('a chunk split mid line is still parsed', async () => {
    const full =
      'data: {"candidates":[{"content":{"parts":[{"text":"x"}]}}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":3}}\n\n';
    const logged = [];
    const tapped = tapGeminiUsage(
      sse([full.slice(0, 40), full.slice(40)]),
      { model: 'm' },
      (l, d) => logged.push(d),
    );
    await readAll(tapped);
    expect(logged[0]).toMatchObject({ input: 10, output: 3, cached: 0, thinking: 0, label: null });
  });

  test('no usage in the stream logs nulls, never throws', async () => {
    const logged = [];
    const tapped = tapGeminiUsage(
      sse(['data: {"candidates":[]}\n\n', 'data: [DONE]\n\n']),
      { model: 'm' },
      (l, d) => logged.push(d),
    );
    await readAll(tapped);
    expect(logged[0]).toMatchObject({ input: null, output: null });
  });
});
