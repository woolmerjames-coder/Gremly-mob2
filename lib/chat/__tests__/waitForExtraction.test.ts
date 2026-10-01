import { waitForExtraction, EXTRACTION_POLLS_MS, LEGACY_POLLS_MS } from '../waitForExtraction';

function harness(turns: Array<string | null>, here = () => true) {
  const slept: number[] = [];
  let calls = 0;
  return {
    slept,
    calls: () => calls,
    deps: {
      fetch: async () => turns[Math.min(calls++, turns.length - 1)],
      sleep: async (ms: number) => {
        slept.push(ms);
      },
      stillHere: here,
    },
  };
}

describe("waiting for a turn's Save items and late card", () => {
  it('keeps looking until the extraction for this turn has landed', async () => {
    const h = harness([null, 'old-turn', 'old-turn', 'turn-1']);
    expect(await waitForExtraction('turn-1', 'running', h.deps)).toBe('landed');
    expect(h.calls()).toBe(4);
    // the first look is two seconds after the reply, then more often than before
    expect(h.slept[0]).toBe(2000);
  });

  it('does not wait at all when the Worker says nothing will come', async () => {
    const h = harness(['x']);
    expect(await waitForExtraction('turn-1', 'skipped', h.deps)).toBe('skipped');
    expect(h.calls()).toBe(0);
  });

  it('gives up after about half a minute rather than polling forever', async () => {
    const h = harness([null]);
    expect(await waitForExtraction('turn-1', 'running', h.deps)).toBe('gave_up');
    expect(h.calls()).toBe(EXTRACTION_POLLS_MS.length);
    expect(h.slept.reduce((a, b) => a + b, 0)).toBe(
      EXTRACTION_POLLS_MS[EXTRACTION_POLLS_MS.length - 1],
    );
  });

  it('an older Worker: the two looks the app always made', async () => {
    const h = harness([null]);
    expect(await waitForExtraction('turn-1', undefined, h.deps)).toBe('gave_up');
    expect(h.calls()).toBe(LEGACY_POLLS_MS.length);
    expect(h.slept).toEqual([2000, 3000]);
  });

  it('stops once the user has left the chat', async () => {
    let here = true;
    const h = harness([null], () => here);
    const run = waitForExtraction('turn-1', 'running', {
      ...h.deps,
      sleep: async () => {
        here = false;
      },
    });
    expect(await run).toBe('left');
    expect(h.calls()).toBe(0);
  });
});
