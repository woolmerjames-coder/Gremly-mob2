/**
 * @jest-environment node
 *
 * The Inngest functions of data fabric stage 4b (context/functions.js): the
 * words, the memories and a new person's first Worlds.
 */
import { createContextFunctions } from '../functions.js';
import { writeWords } from '../words.js';
import { writeMemory, chaptersWantingMemory } from '../memory.js';
import { makeFirstWorlds } from '../firstWorlds.js';

jest.mock('../words.js', () => ({ writeWords: jest.fn() }));
jest.mock('../memory.js', () => ({ writeMemory: jest.fn(), chaptersWantingMemory: jest.fn() }));
jest.mock('../firstWorlds.js', () => ({
  makeFirstWorlds: jest.fn(),
  firstWorldsEvents: jest.fn(),
  filedTotals: jest.requireActual('../firstWorlds.js').filedTotals,
}));

function functions(deps) {
  const made = [];
  const inngest = {
    createFunction: (config, trigger, handler) => {
      const fn = { id: config.id, config, trigger, handler };
      made.push(fn);
      return fn;
    },
  };
  const out = createContextFunctions(inngest, deps);
  const byId = (id) => made.find((f) => f.id === id);
  return { out, byId };
}

const step = (over = {}) => {
  const order = [];
  return {
    order,
    run: async (name, fn) => {
      order.push(`run:${name}`);
      return fn();
    },
    invoke: async (name, { function: fn, data }) => {
      order.push(`invoke:${name}`);
      if (over[name]) return over[name](data);
      return fn.handler({ event: { data }, step: step(), env: { CONTEXT_PIPELINE: 'on' } });
    },
  };
};

const ON = { CONTEXT_PIPELINE: 'on' };
const U = '11111111-2222-4333-8444-555555555555';
const C1 = '22222222-2222-4222-8222-222222222222';

describe('the stage 4b functions', () => {
  beforeEach(() => jest.resetAllMocks());

  it('are listed, and the words and memories are handed to the weekly pipe', () => {
    const { out } = functions({});
    const ids = out.functions.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining(['context-words', 'context-memories', 'context-first-worlds']),
    );
    expect(out.words.id).toBe('context-words');
    expect(out.memories.id).toBe('context-memories');
  });

  it('write words only for the Worlds and Chapters named, and nothing in shadow', async () => {
    writeWords.mockResolvedValue({ written: 1 });
    const { byId } = functions({});
    await byId('context-words').handler({
      event: {
        data: {
          user_id: U,
          reason: 'changed',
          targets: [
            { table: 'chapters', id: C1 },
            { table: 'todos', id: C1 },
            { table: 'worlds', id: 'x' },
          ],
        },
      },
      step: step(),
      env: ON,
    });
    expect(writeWords).toHaveBeenLastCalledWith(ON, U, {
      targets: [{ table: 'chapters', id: C1 }],
      reason: 'changed',
      dryRun: false,
    });
    await byId('context-words').handler({
      event: { data: { user_id: U } },
      step: step(),
      env: { CONTEXT_PIPELINE: 'shadow' },
    });
    expect(writeWords).toHaveBeenLastCalledWith(expect.anything(), U, {
      targets: null,
      reason: 'by_hand',
      dryRun: true,
    });
  });

  it('write each closed Chapter’s memory in a step of its own, and one that fails does not stop the rest', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    chaptersWantingMemory.mockResolvedValue(['a', 'b']);
    writeMemory.mockImplementationOnce(async () => {
      throw new Error('no model');
    });
    writeMemory.mockResolvedValueOnce({ outcome: 'pass', field: 'epigraph', model: 'memory' });
    const { byId } = functions({});
    const s = step();
    const out = await byId('context-memories').handler({
      event: { data: { user_id: U } },
      step: s,
      env: ON,
    });
    expect(s.order).toEqual(['run:which', 'run:memory-a', 'run:memory-b']);
    expect(out.memories).toEqual([
      { id: 'a', error: 'no model' },
      { id: 'b', outcome: 'pass', field: 'epigraph', model: 'memory' },
    ]);
    warn.mockRestore();
  });

  it('make first Worlds, file what they have, then write their words', async () => {
    makeFirstWorlds.mockResolvedValue({
      made: [{ id: 'w1', name: 'Singing' }],
      model: 'm',
      problems: [],
    });
    writeWords.mockResolvedValue({ written: 1, left_out: 0, empty: 0 });
    const backfill = { id: 'drop-assignment-backfill' };
    const { byId } = functions({ backfill });
    const s = step({
      'file-what-they-have': () => ({
        drops: 12,
        batches: [
          {
            filed_world: 5,
            filed_chapter: 1,
            filed_nowhere: 2,
            person_placed: 0,
            skipped: { error: 1 },
          },
          { filed_world: 3, filed_chapter: 0, filed_nowhere: 0, person_placed: 0, skipped: {} },
        ],
      }),
    });
    const out = await byId('context-first-worlds').handler({
      event: { data: { user_id: U } },
      step: s,
      env: ON,
    });
    expect(s.order).toEqual(['run:make', 'invoke:file-what-they-have', 'invoke:their-words']);
    expect(out).toMatchObject({
      made: [{ id: 'w1' }],
      filed: {
        drops: 12,
        filed: { world: 8, chapter: 1, nowhere: 2, by_them: 0 },
        skipped: { error: 1 },
        problem: null,
      },
      words: { written: 1 },
    });
    expect(writeWords).toHaveBeenCalledWith(
      expect.anything(),
      U,
      expect.objectContaining({ reason: 'first_worlds' }),
    );
  });

  it('raise an alert when filing what they have skipped every drop, and still write their words', async () => {
    makeFirstWorlds.mockResolvedValue({ made: [{ id: 'w1', name: 'Singing' }], problems: [] });
    writeWords.mockResolvedValue({ written: 1, left_out: 0, empty: 0 });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { byId } = functions({ backfill: { id: 'b' } });
    const s = step({
      'file-what-they-have': () => ({ drops: 2, batches: [{ skipped: { no_model: 2 } }] }),
    });
    const out = await byId('context-first-worlds').handler({
      event: { data: { user_id: U } },
      step: s,
      env: ON,
    });
    expect(out.filed.problem).toBe('all 2 drops were skipped: no_model 2');
    expect(warn.mock.calls.some(([m]) => /\[ALERT\]\[FirstWorlds\].*all 2 drops/.test(m))).toBe(
      true,
    );
    expect(s.order).toContain('invoke:their-words');
    const whole = step({ 'file-what-they-have': () => ({ drops: 4, skipped: 'empty_graph' }) });
    const again = await byId('context-first-worlds').handler({
      event: { data: { user_id: U } },
      step: whole,
      env: ON,
    });
    expect(again.filed.problem).toBe('the whole run was skipped: empty_graph');
    warn.mockRestore();
  });

  it('stop at once when none were made, and do nothing for someone not live', async () => {
    makeFirstWorlds.mockResolvedValue({ made: [], skipped: 'they have Worlds', problems: [] });
    const { byId } = functions({ backfill: { id: 'b' } });
    const s = step();
    expect(
      await byId('context-first-worlds').handler({
        event: { data: { user_id: U } },
        step: s,
        env: ON,
      }),
    ).toMatchObject({ skipped: 'they have Worlds' });
    expect(s.order).toEqual(['run:make']);
    expect(
      await byId('context-first-worlds').handler({
        event: { data: { user_id: U } },
        step: step(),
        env: { CONTEXT_PIPELINE: 'shadow' },
      }),
    ).toEqual({ skipped: 'the pipeline is not live for them' });
  });
});
