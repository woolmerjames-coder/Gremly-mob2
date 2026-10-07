/**
 * The weekly review's read, for the app (the week-read route).
 *
 * inngest-jobs hands back the read the week's row holds when it serves a
 * review started today, and makes one there and then when it does not, which
 * takes most of a minute. A phone gives up on a request that stays silent that
 * long, so the answer goes back as server-sent events: a ping straight away
 * and every few seconds while the read is made, then the answer
 * ({ done: true, made, on, review } or { done: true, error }).
 *
 * If the phone stops listening, the asking carries on for as long as the
 * worker is allowed to (waitUntil gives it about half a minute more), so a
 * read that was nearly made is still finished and kept on the week's row. The
 * app reads the row again before it asks a second time.
 */

const PING_EVERY_MS = 8000;

/**
 * The week's spread (the week-spread route) goes the same way, with its own
 * answer ({ done: true, on, spread }): it takes about twenty seconds, and it
 * too is kept on the week's row when it is finished after the phone has gone.
 *
 * @param {object} p
 * @param {() => Promise<Response|null>} p.ask asks inngest-jobs for the read
 * @param {(work: Promise<unknown>) => void} [p.waitUntil]
 * @param {number} [p.pingEvery] milliseconds between pings
 * @param {string} [p.what] what is being made, for the words of a failure
 * @param {(data: object) => object} [p.answer] what goes back from what inngest-jobs said
 * @returns {Response}
 */
export function weekReadResponse({
  ask,
  waitUntil,
  pingEvery = PING_EVERY_MS,
  what = 'the weekly read',
  answer = (data) => ({ made: !!data.made, on: data.on, review: data.review }),
}) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  let open = true;
  const send = async (obj) => {
    if (!open) return;
    try {
      await writer.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
    } catch {
      // the phone stopped listening; the asking carries on while it can
      open = false;
    }
  };
  const work = (async () => {
    await send({ ping: true });
    const beat = setInterval(() => void send({ ping: true }), pingEvery);
    try {
      const res = await ask();
      const data = res ? await res.json().catch(() => null) : null;
      if (!res) await send({ done: true, error: `could not reach ${what}` });
      else if (!res.ok || !data || data.error)
        await send({
          done: true,
          error: String(data?.error || `${what} failed`).slice(0, 300),
        });
      else await send({ done: true, ...answer(data) });
    } catch (err) {
      console.error(`[WeekRead] ${what} failed`, err);
      await send({ done: true, error: 'failed' });
    } finally {
      clearInterval(beat);
      open = false;
      try {
        await writer.close();
      } catch {
        // already closed
      }
    }
  })();
  if (typeof waitUntil === 'function') waitUntil(work);
  return new Response(readable, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
