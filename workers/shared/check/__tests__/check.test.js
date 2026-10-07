/**
 * The check: the code steps, the words question and the outcome, with made up
 * records. Every name and record is made up.
 */
import {
  codeCheck,
  compareValue,
  digitsIn,
  numbersOf,
  runCheck,
  checkRunRow,
  wordsRequest,
  wordsProblem,
} from '../index.js';

const records = new Map([
  [
    'c1',
    {
      label: 'c1 | today | 2026-10-08 14:00 to 15:00 | Design review',
      dates: ['2026-10-08'],
      times: ['14:00', '15:00'],
      exact: ['time', 'date'],
    },
  ],
  [
    't1',
    {
      label: 't1 | Send the Q4 deck | about 30 min | due today',
      dates: ['2026-10-08'],
      numbers: [30],
    },
  ],
  [
    'f1',
    {
      label: 'f1 | planned | 2026-10-10 to 2026-10-12 | Alex visits Rowan in Leeds',
      spans: [['2026-10-10', '2026-10-12']],
      names: ['Rowan'],
    },
  ],
  [
    'f2',
    {
      label: 'f2 | current [private] | no date | Alex is seeing a physio for a knee',
      private: true,
      health: true,
    },
  ],
  [
    'p1',
    {
      label: 'p1 | Rowan | also Ro | brother',
      names: ['Rowan', 'Ro'],
      exact: ['person'],
    },
  ],
  [
    's1',
    {
      label: 's1 | busy 14:00 to 15:00; clear 08:00 to 14:00, 15:00 to 21:00',
      times: ['14:00', '15:00', '08:00', '21:00'],
      numbers: [1],
      dates: ['2026-10-08'],
      exact: ['time', 'number', 'date'],
    },
  ],
]);

const sentence = (text, refs = [], stated = []) => ({ text, refs, stated });

describe('the stated values', () => {
  it('match a field of their kind, wherever the record keeps it', () => {
    expect(compareValue({ kind: 'time', value: '14:00' }, records.get('c1'))).toBe('match');
    expect(compareValue({ kind: 'time', value: '9:00' }, records.get('s1'))).toBe('differs');
    expect(compareValue({ kind: 'date', value: '2026-10-11' }, records.get('f1'))).toBe('match');
    expect(compareValue({ kind: 'number', value: '30' }, records.get('t1'))).toBe('match');
    expect(compareValue({ kind: 'person', value: 'ro' }, records.get('p1'))).toBe('match');
  });

  it('are wrong only where the record keeps that kind exactly; otherwise left to the words question', () => {
    expect(compareValue({ kind: 'time', value: '16:30' }, records.get('c1'))).toBe('differs');
    expect(compareValue({ kind: 'person', value: 'Sam' }, records.get('p1'))).toBe('differs');
    // the todo's title may hold a number code never reads
    expect(compareValue({ kind: 'number', value: '4' }, records.get('t1'))).toBe('unheld');
    expect(compareValue({ kind: 'date', value: '2026-10-20' }, records.get('f1'))).toBe('unheld');
  });

  it('must be in the agreed form', () => {
    expect(compareValue({ kind: 'time', value: '2pm' }, records.get('c1'))).toBe('malformed');
    expect(compareValue({ kind: 'date', value: 'Friday' }, records.get('f1'))).toBe('malformed');
    expect(compareValue({ kind: 'date', value: '2026-02-30' }, records.get('f1'))).toBe(
      'malformed',
    );
    expect(compareValue({ kind: 'number', value: 'three' }, records.get('t1'))).toBe('malformed');
  });
});

describe('digits', () => {
  it('are every number written in digits in the sentence', () => {
    expect(digitsIn('From 2:30pm, the 10k and 1.5 hours')).toEqual([2, 30, 10, 1, 5]);
    // a time written with a full stop is still an hour and its minutes
    expect(digitsIn('Lunch at 9.30')).toEqual([9, 30]);
  });

  it('a stated time accounts for its hour on either clock and its minutes; a date for its parts', () => {
    expect(numbersOf({ kind: 'time', value: '14:30' })).toEqual([14, 2, 30]);
    expect(numbersOf({ kind: 'time', value: '00:15' })).toEqual([0, 12, 15]);
    expect(numbersOf({ kind: 'date', value: '2026-10-09' })).toEqual([2026, 26, 10, 9]);
    expect(numbersOf({ kind: 'number', value: '1.5' })).toEqual([1.5, 1, 5, 1, 5]);
    expect(numbersOf({ kind: 'number', value: '1200' })).toEqual(
      expect.arrayContaining([1200, 1, 200]),
    );
  });
});

describe('the code steps', () => {
  it('pass a sentence whose values and digits are all on its list and match', () => {
    const r = codeCheck(
      sentence(
        'The design review runs 2pm to 3pm.',
        ['c1'],
        [
          { kind: 'time', value: '14:00', ref: 'c1' },
          { kind: 'time', value: '15:00', ref: 'c1' },
        ],
      ),
      records,
    );
    expect(r.problems).toEqual([]);
    expect(r.sentence.refs).toEqual(['c1']);
  });

  it('drop a ref the writer was never given, and fail a value that rests on it', () => {
    const r = codeCheck(
      sentence('Lunch at 1pm.', ['c1', 'c9'], [{ kind: 'time', value: '13:00', ref: 'c9' }]),
      records,
    );
    expect(r.droppedRefs).toEqual(['c9']);
    expect(r.sentence.refs).toEqual(['c1']);
    expect(r.problems.map((p) => p.step)).toEqual(['ref', 'ref']);
  });

  it('send back a sentence that cites a record it was never given, even with nothing stated', () => {
    // the old ID check dropped this line; it rests on something no record holds
    const r = codeCheck(sentence('And the dentist.', ['t9'], []), records);
    expect(r.sentence.refs).toEqual([]);
    expect(r.problems.map((p) => p.step)).toEqual(['ref']);
  });

  it('fail a time its exact record does not hold', () => {
    const r = codeCheck(
      sentence(
        'The design review is at 4pm.',
        ['c1'],
        [{ kind: 'time', value: '16:00', ref: 'c1' }],
      ),
      records,
    );
    expect(r.problems).toHaveLength(1);
  });

  it('fail a number in digits that the list does not state', () => {
    const r = codeCheck(sentence('Three things today, 3 of them quick.', ['t1'], []), records);
    expect(r.problems).toHaveLength(1);
  });

  it("add a stated value's record to the refs", () => {
    const r = codeCheck(
      sentence(
        'Rowan arrives Saturday.',
        [],
        [
          { kind: 'person', value: 'Rowan', ref: 'p1' },
          { kind: 'date', value: '2026-10-10', ref: 'f1' },
        ],
      ),
      records,
    );
    expect(r.problems).toEqual([]);
    expect(r.sentence.refs).toEqual(['p1', 'f1']);
  });

  it('leave a value no field holds to the words question when the record has words that might', () => {
    const r = codeCheck(
      sentence('Send the Q4 deck.', ['t1'], [{ kind: 'number', value: '4', ref: 't1' }]),
      records,
    );
    expect(r.problems).toEqual([]);
    expect(r.unheld).toHaveLength(1);
  });

  it('keep a glanceable line off anything private or about health', () => {
    const s = sentence('A quieter day around the knee.', ['f2'], []);
    const seen = codeCheck(s, records, { glanceable: true });
    expect(seen.problems.map((p) => p.step)).toEqual(['glanceable']);
    expect(seen.sensitive).toBe(true);
    expect(codeCheck(s, records, { glanceable: false }).problems).toEqual([]);
  });

  it('keep a glanceable line resting on nothing from passing', () => {
    const r = codeCheck(sentence('Go gently today.', [], []), records, { glanceable: true });
    expect(r.problems.map((p) => p.step)).toEqual(['unfounded']);
    expect(codeCheck(sentence('Go gently today.'), records).problems).toEqual([]);
  });

  it('read a sentence whose refs or stated list came back as something else as having none', () => {
    const r = codeCheck({ text: 'Design review at 2pm.', refs: 'c1', stated: 'x' }, records);
    expect(r.sentence.refs).toEqual([]);
    expect(r.problems.map((p) => p.step)).toEqual(['digits']);
  });
});

describe('the words question', () => {
  it('is given only the sentence, its records and today', () => {
    const req = wordsRequest({
      sentence: { text: 'Rowan visits from Saturday.' },
      records: [{ ref: 'f1', ...records.get('f1') }],
      today: '2026-10-08',
    });
    expect(req.user).toContain('TODAY: Thursday 2026-10-08.');
    expect(req.user).toContain('THE PERSON: their name is not known.');
    expect(
      wordsRequest({
        sentence: { text: 'x' },
        records: [],
        today: '2026-10-08',
        person: { first_name: 'Alex' },
      }).user,
    ).toContain('THE PERSON: their first name is Alex.');
    // the label is the line the writer was shown, its ref included once
    expect(req.user).toContain('RECORDS:\nf1 | planned');
    expect(req.user).not.toContain('Design review');
    expect(req.user).toContain('SENTENCE: Rowan visits from Saturday.');
  });

  it('is a problem only when the answer says not held', () => {
    expect(wordsProblem({ not_held: false, what: null })).toBeNull();
    expect(wordsProblem({ not_held: true, what: 'calls Rowan a cousin' })).toEqual({
      step: 'words',
      say: 'it says something its records do not hold: calls Rowan a cousin',
    });
  });
});

describe('the outcome', () => {
  const held = async () => ({ not_held: false, what: null });

  it('passes a sentence that holds, and asks nothing of an empty one', async () => {
    const ask = jest.fn(held);
    const rewrite = jest.fn();
    const { results, counts } = await runCheck({
      items: [
        {
          key: 'headline',
          sentence: sentence(
            'Design review at 2pm.',
            ['c1'],
            [{ kind: 'time', value: '14:00', ref: 'c1' }],
          ),
          glanceable: true,
        },
        { key: 'return_note', sentence: sentence('', [], []) },
      ],
      records,
      today: '2026-10-08',
      ask,
      rewrite,
    });
    expect(results.get('headline').outcome).toBe('pass');
    expect(results.get('return_note').outcome).toBe('empty');
    expect(ask).toHaveBeenCalledTimes(1);
    expect(rewrite).not.toHaveBeenCalled();
    expect(counts).toEqual({ checked: 1, sent_back: 0, left_out: 0 });
  });

  it('sends a failing sentence back once, alone with its own records, and keeps a rewrite that holds', async () => {
    const rewrite = jest.fn(async ({ records: own }) => {
      expect(own.map((r) => r.ref)).toEqual(['c1']);
      return sentence(
        'Design review at 2pm.',
        ['c1'],
        [{ kind: 'time', value: '14:00', ref: 'c1' }],
      );
    });
    const { results, counts, details } = await runCheck({
      items: [
        {
          key: 'lead_what',
          sentence: sentence(
            'Design review at 4pm.',
            ['c1'],
            [{ kind: 'time', value: '16:00', ref: 'c1' }],
          ),
        },
      ],
      records,
      today: '2026-10-08',
      ask: held,
      rewrite,
    });
    expect(rewrite).toHaveBeenCalledTimes(1);
    expect(results.get('lead_what')).toMatchObject({ outcome: 'rewritten', refs: ['c1'] });
    expect(results.get('lead_what').sentence.text).toBe('Design review at 2pm.');
    expect(counts).toEqual({ checked: 1, sent_back: 1, left_out: 0 });
    expect(details[0].first).toHaveLength(1);
  });

  it('checks a rewrite against its own records only, and leaves out what fails twice', async () => {
    const rewrite = async () =>
      // reaches for a record it was not given this time
      sentence(
        'Lunch with Rowan on Saturday.',
        ['f1'],
        [{ kind: 'date', value: '2026-10-10', ref: 'f1' }],
      );
    const { results, counts, details } = await runCheck({
      items: [
        {
          key: 'headline',
          sentence: sentence(
            'Coffee with Sam.',
            ['c1'],
            [{ kind: 'person', value: 'Sam', ref: 'p1' }],
          ),
          glanceable: true,
        },
      ],
      records,
      today: '2026-10-08',
      ask: held,
      rewrite,
    });
    expect(results.get('headline')).toEqual({ outcome: 'left_out', sentence: null, refs: [] });
    expect(counts.left_out).toBe(1);
    expect(details[0].second.map((p) => p.step)).toContain('ref');
  });

  it('sends back what the words question finds, and leaves out a sentence it could not ask about', async () => {
    let calls = 0;
    const ask = async () => {
      calls++;
      if (calls === 1) return { not_held: true, what: 'calls Rowan a cousin' };
      throw new Error('both models failed');
    };
    const rewrite = async () =>
      sentence(
        'Rowan visits from Saturday.',
        ['f1'],
        [{ kind: 'date', value: '2026-10-10', ref: 'f1' }],
      );
    const { results } = await runCheck({
      items: [
        {
          key: 'also_matters_0',
          sentence: sentence(
            'Your cousin Rowan visits.',
            ['f1'],
            [{ kind: 'person', value: 'Rowan', ref: 'f1' }],
          ),
        },
      ],
      records,
      today: '2026-10-08',
      ask,
      rewrite,
    });
    expect(results.get('also_matters_0').outcome).toBe('left_out');
  });

  it('leaves out at once, without a second try, a glanceable line resting on something private', async () => {
    const rewrite = jest.fn();
    const { results, details } = await runCheck({
      items: [
        { key: 'headline', sentence: sentence('Physio today.', ['f2'], []), glanceable: true },
      ],
      records,
      today: '2026-10-08',
      ask: held,
      rewrite,
    });
    expect(results.get('headline').outcome).toBe('left_out');
    expect(rewrite).not.toHaveBeenCalled();
    expect(details[0].first.map((p) => p.step)).toEqual(['glanceable']);
  });

  it('leaves out a sentence whose words question came back without an answer, at the first try', async () => {
    const rewrite = jest.fn();
    for (const answer of [null, { what: 'x' }, { not_held: 'no' }]) {
      const { results } = await runCheck({
        items: [{ key: 'also_matters_0', sentence: sentence('Rowan visits.', ['f1']) }],
        records,
        today: '2026-10-08',
        ask: async () => answer,
        rewrite,
      });
      expect(results.get('also_matters_0').outcome).toBe('left_out');
    }
    const thrown = await runCheck({
      items: [{ key: 'also_matters_0', sentence: sentence('Rowan visits.', ['f1']) }],
      records,
      today: '2026-10-08',
      ask: async () => {
        throw new Error('both models failed');
      },
      rewrite,
    });
    expect(thrown.results.get('also_matters_0').outcome).toBe('left_out');
    expect(thrown.details[0].first.map((p) => p.step)).toEqual(['unasked']);
    expect(rewrite).not.toHaveBeenCalled();
  });

  it('keeps going when one sentence cannot be read, leaving that one out', async () => {
    const odd = {
      get text() {
        throw new Error('not a sentence');
      },
    };
    const { results } = await runCheck({
      items: [
        { key: 'today_focus_0', sentence: odd },
        {
          key: 'today_focus_1',
          sentence: sentence(
            'Design review at 2pm.',
            ['c1'],
            [{ kind: 'time', value: '14:00', ref: 'c1' }],
          ),
        },
      ],
      records,
      today: '2026-10-08',
      ask: held,
      rewrite: jest.fn(),
    });
    expect(results.get('today_focus_0').outcome).toBe('left_out');
    expect(results.get('today_focus_1').outcome).toBe('pass');
  });

  it('leaves the run a row with each field, its outcome and which steps found it wrong, never words', () => {
    const row = checkRunRow({
      userId: 'u',
      job: 'daily',
      day: '2026-10-08',
      counts: { checked: 3, sent_back: 1, left_out: 1 },
      details: [
        {
          key: 'headline',
          outcome: 'left_out',
          first: [{ step: 'value', say: 'it states person Rowan, which its record does not hold' }],
          second: [
            {
              step: 'words',
              say: 'it says something its records do not hold: calls Rowan a cousin',
            },
          ],
          texts: ['Coffee with Rowan, your cousin.'],
        },
      ],
    });
    expect(row).toMatchObject({
      user_id: 'u',
      job: 'daily',
      checked: 3,
      sent_back: 1,
      left_out: 1,
    });
    expect(row.details).toEqual([
      { field: 'headline', outcome: 'left_out', first: ['value'], second: ['words'] },
    ]);
    expect(JSON.stringify(row)).not.toMatch(/Rowan|cousin/);
  });
});
