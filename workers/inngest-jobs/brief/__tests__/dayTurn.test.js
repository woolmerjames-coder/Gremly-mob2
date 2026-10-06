/**
 * The day turn: what the model is told, and the code checks on what it
 * returns. Only changes the input supports reach the card, each worded here.
 */
import {
  claimsDone,
  changeLabel,
  checkChanges,
  checkChecklist,
  readTurnRequest,
  renderTurnInput,
} from '../dayTurn';

jest.mock('../../context/daily', () => ({ buildDcoV4: jest.fn(), writeDco: jest.fn() }));

// 2 October, 9:04am: James in today's thread
const BODY = {
  text: 'I need to call my parents at 12 and leave for the airport at 12:30',
  question: null,
  date: '2026-10-02',
  now: 544,
  history: [
    { role: 'assistant', content: "Here's what I'd do with the morning." },
    { role: 'user', content: 'ok' },
  ],
  items: [
    {
      id: 'mum',
      kind: 'todo',
      title: 'Call Mum',
      due_day: '2026-10-02',
      due_time: null,
      minutes: 20,
      note: 'in the plan',
    },
    {
      id: 'deck',
      kind: 'todo',
      title: 'Send the Sage Future deck',
      due_day: '2026-10-03',
      due_time: null,
      minutes: 60,
      note: 'upcoming',
    },
    { id: 'pushups', kind: 'habit', title: 'Pushups', minutes: 10, note: 'habit today' },
  ],
  meetings: [
    { title: 'Team huddle', start: 480, end: 510 },
    { title: 'Timesheets', start: 960, end: 990 },
  ],
  record: {
    travel: { label: 'Flying to San Diego', departs: null },
    blocks: [],
    plan_end: 1320,
  },
  plan: {
    status: 'proposal',
    items: [{ id: 'mum', kind: 'todo', title: 'Call Mum', start: 710, end: 730 }],
  },
};

describe('the day turn: what it is told', () => {
  it('takes a date only when it is a real day', () => {
    expect(readTurnRequest(BODY).date).toBe('2026-10-02');
    for (const date of ['2026-13-01', '2026-02-30', '2026-10-2', 'today', null, 20261002]) {
      expect(readTurnRequest({ ...BODY, date }).date).toBeNull();
    }
    const req = readTurnRequest({
      ...BODY,
      plan: null,
      items: [
        { id: 'a', kind: 'todo', title: 'One', due_day: '2026-02-30' },
        { id: 'b', kind: 'todo', title: 'Two', due_day: '2026-10-03' },
      ],
    });
    expect(req.items.map((x) => x.due_day)).toEqual([null, '2026-10-03']);
  });

  it('gives every item a ref and shows the day, the plan and what they said', () => {
    const req = readTurnRequest(BODY);
    expect(req.items.map((x) => [x.ref, x.id])).toEqual([
      ['i1', 'mum'],
      ['i2', 'deck'],
      ['i3', 'pushups'],
    ]);
    const text = renderTurnInput(req, { first_name: 'James' });
    expect(text).toContain('TODAY: Friday 2026-10-02. TIME NOW: 9:04am.');
    // in the small hours, the rest of their day is the night
    const late = renderTurnInput({ ...req, now: 50, dayEndHour: 3 }, { first_name: 'James' });
    expect(late).toContain(
      'TIME NOW: 12:50am, after midnight; their Friday ends at 3am, so their tomorrow is Saturday 2026-10-03, and any time of day they name for later is on Saturday, after they have slept.',
    );
    expect(text).toContain(
      'TRAVEL TODAY: Flying to San Diego; the time they set off is not known yet.',
    );
    expect(text).toContain(
      'THE PLAN ON SCREEN, A PROPOSAL (ref | time | title):\ni1 | 11:50am | Call Mum',
    );
    expect(text).toContain('i3 | habit | Pushups');
    expect(text).toContain('James: ok');
    expect(text).toContain(`WHAT JAMES JUST SAID: "${BODY.text}"`);
  });

  it('an item in the plan that is not in the list still gets a ref', () => {
    const req = readTurnRequest({
      ...BODY,
      items: [],
      plan: {
        status: 'locked',
        items: [{ id: 'x', kind: 'habit', title: 'Run', start: 1080, end: 1125 }],
      },
    });
    expect(req.items).toEqual([
      expect.objectContaining({ ref: 'i1', id: 'x', note: 'in the plan' }),
    ]);
  });
});

describe('the day turn: the change set', () => {
  const req = readTurnRequest(BODY);

  it('2 October: one card with Call Mum at 12 and leaving for the airport at 12:30', () => {
    const { changes, dropped } = checkChanges(
      {
        changes: [
          {
            kind: 'retime',
            ref: 'i1',
            title: null,
            day: null,
            time: '12:00',
            end_time: null,
            minutes: null,
            travel: false,
          },
          {
            kind: 'add_block',
            ref: null,
            title: 'Leave for the airport',
            day: null,
            time: '12:30',
            end_time: null,
            minutes: null,
            travel: true,
          },
          // the same item again, moved in the plan: one change per item
          {
            kind: 'plan_move',
            ref: 'i1',
            title: null,
            day: null,
            time: '12:00',
            end_time: null,
            minutes: null,
            travel: false,
          },
        ],
      },
      req,
    );
    expect(changes.map((c) => [c.cid, c.kind, c.label])).toEqual([
      ['c1', 'retime', 'Call Mum at 12pm'],
      ['c2', 'add_block', 'Leave for the airport at 12:30pm'],
    ]);
    expect(changes[0]).toMatchObject({ id: 'mum', item: 'todo', start: 720, day: '2026-10-02' });
    expect(changes[1]).toMatchObject({ start: 750, travel: true });
    expect(dropped).toEqual(['plan_move']);
  });

  it('drops what the input does not support', () => {
    const { changes, dropped } = checkChanges(
      {
        changes: [
          {
            kind: 'retime',
            ref: 'i9',
            title: null,
            day: null,
            time: '12:00',
            end_time: null,
            minutes: null,
            travel: false,
          },
          {
            kind: 'retime',
            ref: 'i1',
            title: null,
            day: null,
            time: 'noon',
            end_time: null,
            minutes: null,
            travel: false,
          },
          {
            kind: 'move_day',
            ref: 'i2',
            title: null,
            day: '2026-09-30',
            end_time: null,
            time: null,
            minutes: null,
            travel: false,
          },
          {
            kind: 'skip_habit',
            ref: 'i1',
            title: null,
            day: null,
            time: null,
            end_time: null,
            minutes: null,
            travel: false,
          },
          {
            kind: 'plan_remove',
            ref: 'i2',
            title: null,
            day: null,
            time: null,
            end_time: null,
            minutes: null,
            travel: false,
          },
          {
            kind: 'create_todo',
            ref: null,
            title: '',
            day: null,
            time: null,
            end_time: null,
            minutes: null,
            travel: false,
          },
          {
            kind: 'remove_block',
            ref: 'b1',
            title: null,
            day: null,
            time: null,
            end_time: null,
            minutes: null,
            travel: false,
          },
        ],
      },
      req,
    );
    expect(changes).toEqual([]);
    expect(dropped).toHaveLength(7);
  });

  it('a set time on another day becomes something to do that day', () => {
    const { changes } = checkChanges(
      {
        changes: [
          {
            kind: 'add_block',
            ref: null,
            title: 'Haircut',
            day: '2026-10-03',
            time: '10:00',
            end_time: null,
            minutes: null,
            travel: false,
          },
        ],
      },
      req,
    );
    expect(changes).toEqual([
      expect.objectContaining({
        kind: 'create_todo',
        title: 'Haircut',
        day: '2026-10-03',
        start: 600,
        label: 'Add "Haircut" for tomorrow at 10am',
      }),
    ]);
  });

  it('words each kind from the change itself', () => {
    const today = '2026-10-02';
    expect(
      changeLabel({ kind: 'move_day', title: 'Send the deck', day: '2026-10-03' }, today),
    ).toBe('Move Send the deck to tomorrow');
    expect(
      changeLabel({ kind: 'move_day', title: 'Send the deck', day: '2026-10-05' }, today),
    ).toBe('Move Send the deck to Monday');
    expect(changeLabel({ kind: 'create_todo', title: 'Pack', day: today, start: 600 }, today)).toBe(
      'Add "Pack" at 10am',
    );
    expect(changeLabel({ kind: 'skip_habit', title: 'Pushups' }, today)).toBe('Skip Pushups today');
    expect(changeLabel({ kind: 'rename', title: 'Call Mum and Dad', was: 'Call Mum' }, today)).toBe(
      'Rename Call Mum to "Call Mum and Dad"',
    );
  });

  it('keeps the checklist short and plain', () => {
    expect(
      checkChecklist({
        checklist: [
          { ask: 'Call parents at 12', status: 'proposed' },
          { ask: 'Move timesheets', status: 'not_possible' },
          { ask: '', status: 'noted' },
          { ask: 'Something', status: 'maybe' },
        ],
      }),
    ).toEqual([
      { ask: 'Call parents at 12', status: 'proposed' },
      { ask: 'Move timesheets', status: 'not_possible' },
      { ask: 'Something', status: 'noted' },
    ]);
  });
});

describe('the day turn: no false done', () => {
  it('spots a reply that says a change is already made', () => {
    expect(claimsDone("I've moved Call Mum to 12.")).toBe(true);
    expect(claimsDone('I have set up changes to skip your run.')).toBe(true);
    expect(claimsDone('All set, see you at 12.')).toBe(true);
    expect(claimsDone("I'd move Call Mum to 12 and add leaving at 12:30.")).toBe(false);
    expect(claimsDone("I'd cancel the sample task since the appointment was cancelled.")).toBe(
      false,
    );
    expect(claimsDone('Timesheets cannot be moved from here.')).toBe(false);
  });
});
