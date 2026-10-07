/**
 * @jest-environment node
 */
// The weekly pipe's order (data fabric stage 4b): the synthesis, then what is
// left of the Sunday classifier, then the read, then the words and the
// memories. A step that fails does not cost the person the rest.

import { createWeekFunctions } from '../index';

function capture() {
  const made = [];
  return {
    made,
    inngest: {
      createFunction: (config, trigger, handler) => {
        made.push({ config, trigger, handler });
        return { id: config.id };
      },
    },
  };
}

function fakeStep({ fail = [] } = {}) {
  const order = [];
  return {
    order,
    invoke: async (name, { function: fn, data }) => {
      order.push(`invoke:${name}`);
      if (fail.includes(name)) throw new Error(`${name} broke`);
      if (name === 'words') return { written: 3, left_out: 1, failed: 0, data };
      if (name === 'memories') return { chapters: 2 };
      if (name === 'people')
        return { checked: { checked: 3, who_cleared: 1 }, asked: { written: true } };
      if (name === 'classifier') return { classifier_counts: { chapter_updates: 1 } };
      return { applied: true, fn: fn.id };
    },
    // the read's steps are stood in for: no database here
    run: async (name) => {
      order.push(`run:${name}`);
      if (fail.includes(name)) throw new Error(`${name} broke`);
      if (name === 'read-ahead')
        return {
          on: { week_start: '2026-09-28', kind: 'weekly' },
          read: null,
          skipped: 'the week has its read',
        };
      return null;
    },
  };
}

const USER = '11111111-2222-4333-8444-555555555555';
const event = { data: { user_id: USER, day: '2026-10-04' } };

function pipeHandler() {
  const { inngest, made } = capture();
  createWeekFunctions(inngest, {
    synthesis: { id: 'synthesis' },
    classifier: { id: 'classifier' },
    words: { id: 'words' },
    memories: { id: 'memories' },
    people: { id: 'people' },
  });
  return made.find((f) => f.config.id === 'weekly-pipe').handler;
}

describe('the weekly pipe', () => {
  it('runs the synthesis, the classifier, the read, then the words, the memories and the people', async () => {
    const step = fakeStep();
    const out = await pipeHandler()({ event, step, env: {} });
    expect(step.order).toEqual([
      'invoke:synthesis',
      'invoke:classifier',
      'run:read-ahead',
      'invoke:words',
      'invoke:memories',
      'invoke:people',
    ]);
    expect(out).toMatchObject({
      classifier: { counts: { chapter_updates: 1 } },
      words: { written: 3, left_out: 1, failed: 0 },
      memories: { chapters: 2 },
      people: { checked: 3, who_cleared: 1, asked: true },
      read: { skipped: 'the week has its read' },
    });
  });

  it('goes on when the classifier or the words fail, and says so', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const step = fakeStep({ fail: ['classifier', 'words'] });
    const out = await pipeHandler()({ event, step, env: {} });
    expect(out.classifier).toEqual({ error: 'classifier broke' });
    expect(out.words).toEqual({ error: 'words broke' });
    expect(out.memories).toEqual({ chapters: 2 });
    expect(step.order).toContain('run:read-ahead');
    expect(warn.mock.calls.map((c) => c[0]).join('\n')).toMatch(
      /\[ALERT\]\[WeekPipe\] the classifier did not finish/,
    );
    warn.mockRestore();
  });

  it('goes on to the words and the memories when the read fails, and says so', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const step = fakeStep({ fail: ['read-ahead'] });
    const out = await pipeHandler()({ event, step, env: {} });
    expect(step.order).toEqual([
      'invoke:synthesis',
      'invoke:classifier',
      'run:read-ahead',
      'invoke:words',
      'invoke:memories',
      'invoke:people',
    ]);
    expect(out.read).toEqual({
      made: false,
      skipped: null,
      error: 'read-ahead broke',
      week_start: null,
      kind: null,
    });
    expect(out.words).toMatchObject({ written: 3 });
    expect(warn.mock.calls.map((c) => c[0]).join('\n')).toMatch(
      /\[ALERT\]\[WeekPipe\] the read did not finish/,
    );
    warn.mockRestore();
  });

  it('still runs as before when no classifier, words or memories are given', async () => {
    const { inngest, made } = capture();
    createWeekFunctions(inngest, { synthesis: { id: 'synthesis' } });
    const step = fakeStep();
    await made.find((f) => f.config.id === 'weekly-pipe').handler({ event, step, env: {} });
    expect(step.order).toEqual(['invoke:synthesis', 'run:read-ahead']);
  });
});
