/**
 * @jest-environment node
 */
// The week-read route's answer (workers/cortex/weekRead.js): pings while the
// read is made, then the answer, as server-sent events.

import { weekReadResponse } from '../weekRead.js';

async function events(res) {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => JSON.parse(block.replace(/^data: /, '')));
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const REVIEW = {
  id: 'r1',
  week_start: '2026-10-05',
  read: { challenge: { headline: 'A full week' } },
};
const ON = {
  kind: 'weekly',
  week_start: '2026-10-05',
  span_start: '2026-10-05',
  span_end: '2026-10-11',
};

describe('the week-read answer', () => {
  it('pings at once, then hands back the read', async () => {
    const waited = [];
    const res = weekReadResponse({
      ask: async () => json({ made: true, on: ON, review: REVIEW }),
      waitUntil: (p) => waited.push(p),
    });
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(await events(res)).toEqual([
      { ping: true },
      { done: true, made: true, on: ON, review: REVIEW },
    ]);
    // the asking is handed to the worker's own lifetime, so it outlives the phone
    expect(waited).toHaveLength(1);
    await waited[0];
  });

  it('keeps pinging while the read is being made', async () => {
    let finish;
    const asked = new Promise((resolve) => {
      finish = resolve;
    });
    const res = weekReadResponse({ ask: () => asked, pingEvery: 5 });
    setTimeout(() => finish(json({ made: false, on: ON, review: REVIEW })), 40);
    const got = await events(res);
    expect(got.filter((e) => e.ping).length).toBeGreaterThan(2);
    expect(got[got.length - 1]).toEqual({ done: true, made: false, on: ON, review: REVIEW });
  });

  it('says what went wrong when the read could not be made', async () => {
    const cases = [
      [async () => null, 'could not reach the weekly read'],
      [
        async () => json({ error: 'the read came back without a challenge' }, 500),
        'the read came back without a challenge',
      ],
      [async () => new Response('not json', { status: 502 }), 'the weekly read failed'],
      [
        async () => {
          throw new Error('boom');
        },
        'failed',
      ],
    ];
    for (const [ask, error] of cases) {
      const got = await events(weekReadResponse({ ask }));
      expect(got[got.length - 1]).toEqual({ done: true, error });
    }
  });

  it('carries on asking when the phone stops listening', async () => {
    let asked = false;
    const waited = [];
    const res = weekReadResponse({
      ask: async () => {
        await new Promise((r) => setTimeout(r, 20));
        asked = true;
        return json({ made: true, on: ON, review: REVIEW });
      },
      waitUntil: (p) => waited.push(p),
    });
    await res.body.cancel();
    await waited[0];
    expect(asked).toBe(true);
  });
});
