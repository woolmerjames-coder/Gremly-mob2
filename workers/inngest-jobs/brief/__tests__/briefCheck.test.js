/**
 * @jest-environment node
 *
 * The brief under the check (data fabric stage 3): each line, the offer and
 * the catch up are held to their records; one that fails goes back once,
 * alone with its records, and one that fails again is left out and reported
 * as dropped. The models are replaced; every name and record is made up.
 */
import { writeBrief, renderBriefInput, briefRewritePrompt } from '../writer';
import { decideOffer } from '../offer';
import { jsonCall, modelFor } from '../../context/llm';

jest.mock('../../context/llm', () => ({ jsonCall: jest.fn(), modelFor: jest.fn() }));
jest.mock('../../context/daily', () => ({ buildDcoV4: jest.fn(), writeDco: jest.fn() }));

const g = {
  today: '2026-10-08',
  now: 450,
  part: 'morning',
  person: { first_name: 'Alex', pronouns: null },
  ret: null,
  meetings: [{ id: 'cal-1', title: 'Design review', start: 840, end: 900 }],
  allDay: [],
  clashes: [],
  busy: [{ from: 840, to: 900 }],
  free: [
    { from: 480, to: 840 },
    { from: 900, to: 1320 },
  ],
  dayShape: null,
  todosDue: [{ id: 'todo-1', title: 'Send the Q4 deck' }],
  habitsForToday: [{ id: 'hab-1', title: 'Run', done: 1, target: 3, behind: true, lighter: null }],
  claims: [],
  reach: null,
  anchors: [],
  overdue: 0,
  unsorted: 0,
  sweep: null,
  reaction: null,
  question: null,
};
const offer = decideOffer({
  returnDay: false,
  overdue: 0,
  unsorted: 0,
  candidates: 2,
  freeWindows: g.free,
  now: g.now,
});

const S = (text, refs = [], stated = []) => ({ text, refs, stated });
// the brief's own prompt comes in two parts, a line sent back in one
const sys = (system) => (typeof system === 'string' ? system : `${system.fixed}${system.varying}`);

beforeEach(() => {
  modelFor.mockImplementation((env, job) => ({
    provider: 'openai',
    model: job.endsWith('Fallback') ? `${job}-fallback-model` : `${job}-model`,
  }));
});

describe('the records the brief is held to', () => {
  it('give Up next its date, from the daily picture, with nothing asking for it to be said', () => {
    const none = renderBriefInput(g, offer);
    expect(none.text).not.toContain('UP NEXT');
    const { records, text } = renderBriefInput(
      {
        ...g,
        upNext: {
          title: 'Lisbon at half term',
          world: 'Travel',
          date: '2026-10-23',
          which: 'starts',
          days_until: 15,
        },
      },
      offer,
    );
    expect(text).toContain(
      'UP NEXT AMONG THEIR CHAPTERS (u1): "Lisbon at half term", in their World Travel, starts on Friday 2026-10-23.',
    );
    expect(records.get('u1')).toMatchObject({
      dates: ['2026-10-23'],
      numbers: [15],
      exact: ['date'],
    });
  });

  it('give each meeting, todo and habit what code can compare, and the shape of the day its times', () => {
    const { records, text } = renderBriefInput(g, offer);
    expect(records.get('c1')).toMatchObject({
      times: ['14:00', '15:00'],
      dates: ['2026-10-08'],
      exact: ['date', 'time'],
    });
    expect(records.get('h1')).toMatchObject({ numbers: [1, 3, 2], exact: [] });
    expect(records.get('s1').times).toEqual(
      expect.arrayContaining(['08:00', '14:00', '15:00', '22:00']),
    );
    expect(records.get('n1')).toMatchObject({ dates: ['2026-10-08'], times: ['07:30'] });
    expect(text).toContain('SHAPE OF THE REST OF TODAY (s1), WORKED OUT IN CODE');
    // every ref the model is shown has a record
    for (const ref of text.match(/\b[a-z]\d+\b/g).filter((r) => /^[ctdhpraswfmkebno]\d+$/.test(r)))
      expect(records.has(ref)).toBe(true);
  });
});

describe('the brief under the check', () => {
  it('keeps what holds, sends back what does not once, and reports what it leaves out', async () => {
    const rewrites = [];
    jsonCall.mockImplementation(async (env, { system, user, schema }) => {
      if (schema.properties?.not_held)
        return { output: { not_held: false, what: null }, model: 'check-model' };
      if (sys(system).includes('ONE SENTENCE AGAIN')) {
        rewrites.push(user);
        if (user.includes('Q4'))
          return { output: S('Send the deck today.', ['t1']), model: 'brief-model' };
        return {
          output: S('The review is at 4pm.', ['c1'], [{ kind: 'time', value: '16:00', ref: 'c1' }]),
          model: 'brief-model',
        };
      }
      return {
        output: {
          lines: [
            S(
              'A clear morning, then the design review at 2pm. [c1, s1]',
              ['c1', 's1'],
              [{ kind: 'time', value: '14:00', ref: 'c1' }],
            ),
            // the Q4 is a number it does not list: sent back, and the rewrite holds
            S('Send the Q4 deck first.', ['t1']),
            // a time the meeting does not hold, twice
            S('The review runs to 5pm.', ['c1'], [{ kind: 'time', value: '17:00', ref: 'c1' }]),
          ],
          offer: S(
            'Want me to fit a few things in from 8am?',
            ['o1', 's1'],
            [{ kind: 'time', value: '08:00', ref: 's1' }],
          ),
          question_line: null,
          question_choices: [],
          catch_up: S(''),
        },
        model: 'brief-model',
      };
    });
    const out = await writeBrief({}, g, offer);
    expect(out.lines).toEqual([
      { text: 'A clear morning, then the design review at 2pm.', ids: ['cal-1'] },
      { text: 'Send the deck today.', ids: ['todo-1'] },
    ]);
    expect(out.dropped).toHaveLength(1);
    expect(out.dropped[0].text).toBe('The review runs to 5pm.');
    expect(out.offer).toBe('Want me to fit a few things in from 8am?');
    expect(out.offerDropped).toBeNull();
    expect(out.check.counts).toEqual({ checked: 4, sent_back: 2, left_out: 1 });
    // each goes back alone, with only its own records
    expect(rewrites[0]).toContain('t1 | Send the Q4 deck');
    expect(rewrites[0]).not.toContain('Design review');
  });

  it('reports the offer as dropped when it fails twice, so the fixed words stand in', async () => {
    jsonCall.mockImplementation(async (env, { system, schema }) => {
      if (schema.properties?.not_held)
        return { output: { not_held: false, what: null }, model: 'check-model' };
      if (sys(system).includes('ONE SENTENCE AGAIN'))
        return {
          output: S(
            'Fit things in from 9:15?',
            ['s1'],
            [{ kind: 'time', value: '09:15', ref: 's1' }],
          ),
          model: 'brief-model',
        };
      return {
        output: {
          lines: [S('A clear morning.', ['s1'])],
          offer: S(
            'Want to plan from 9:15?',
            ['s1'],
            [{ kind: 'time', value: '09:15', ref: 's1' }],
          ),
          question_line: null,
          question_choices: [],
          catch_up: S(''),
        },
        model: 'brief-model',
      };
    });
    const out = await writeBrief({}, g, offer);
    expect(out.offer).toBeNull();
    expect(out.offerDropped.text).toBe('Want to plan from 9:15?');
    expect(out.offerDropped.bad.length).toBeGreaterThan(0);
  });

  it("tells a line sent back the brief's rules and which line it is", () => {
    const p = briefRewritePrompt({ first_name: 'Alex' }, 'offer');
    expect(p).toContain('offer: one or two sentences that end the brief');
    expect(p).toContain('You are given the offer you wrote');
  });
});
