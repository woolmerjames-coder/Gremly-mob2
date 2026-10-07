/**
 * The plan picker's checks: only what is in the pool, windows inside the
 * planning hours, durations from the app when it has them.
 */
import { checkOps, checkPicks, parseHHMM, readRequest, renderPlanInput } from '../planPick';

const BODY = {
  now: 760,
  gap_from: 795,
  pool: [
    { id: 'todo-1', kind: 'todo', title: 'Buy Oat Milk', minutes: 15, why: 'due today' },
    {
      id: 'hab-1',
      kind: 'habit',
      title: 'Run',
      minutes: null,
      why: '0 of 1 this week',
      window: [1020, 1260],
    },
    { id: 'fact-9', kind: 'reach', title: 'Book the car service', why: 'overdue for a service' },
  ],
  meetings: [{ title: 'Search connect', start: 720, end: 750 }],
};

describe('the plan picker', () => {
  it('reads the request and gives each candidate a ref', () => {
    const req = readRequest(BODY);
    expect(req.from).toBe(795);
    expect(req.pool.map((p) => p.ref)).toEqual(['p1', 'p2', 'p3']);
    expect(req.pool[1].minutes).toBeNull();
    const text = renderPlanInput(req, { claims: [], reach: null });
    expect(text).toContain('PLANNING FROM 1:15pm TO 10pm');
    expect(text).toContain('p2 | habit | Run | unknown | 0 of 1 this week | 5pm to 9pm');
    expect(text).toContain('p3 | suggestion from what they said | Book the car service');
  });

  it('passes on what they said has to happen first, when Gremly asked', () => {
    const asked = renderPlanInput(readRequest({ ...BODY, asked: 'The oat milk, we are out' }), {
      claims: [],
      reach: null,
    });
    expect(asked).toContain(
      'WHAT THEY SAID HAS TO HAPPEN OR COMES FIRST: "The oat milk, we are out"',
    );
    const none = renderPlanInput(readRequest(BODY), { claims: [], reach: null });
    expect(none).not.toContain('WHAT THEY SAID');
  });

  it('keeps only picks in the pool, once each, with windows inside the planning hours', () => {
    const req = readRequest(BODY);
    const { picks, dropped } = checkPicks(
      {
        picks: [
          { ref: 'p2', after: '18:00', before: '21:00', minutes: 40, reason: 'Behind this week' },
          { ref: 'p9', after: '14:00', before: '15:00', minutes: 20, reason: 'Invented' },
          { ref: 'p1', after: '09:00', before: '23:30', minutes: 99, reason: 'Due today' },
          { ref: 'p2', after: '18:00', before: '21:00', minutes: 40, reason: 'Again' },
        ],
      },
      req,
    );
    expect(dropped).toEqual(['p9', 'p2']);
    expect(picks).toEqual([
      {
        id: 'hab-1',
        window: [1080, 1260],
        minutes: 40,
        estimated: true,
        reason: 'Behind this week',
      },
      // the app's own minutes win; the window starts no earlier than planning does
      { id: 'todo-1', window: [795, 1320], minutes: 15, estimated: false, reason: 'Due today' },
    ]);
  });

  it('always holds what was kept for today in Sweep, picked or not', () => {
    const req = readRequest({
      ...BODY,
      pool: [
        { ...BODY.pool[0], kept: true },
        { id: 'todo-2', kind: 'todo', title: 'Fix the input box', minutes: null, kept: true },
        BODY.pool[1],
      ],
    });
    const text = renderPlanInput(req, { claims: [], reach: null });
    expect(text).toContain('p1 | todo | Buy Oat Milk | 15 min | kept for today in Sweep just now');
    const { picks } = checkPicks(
      { picks: [{ ref: 'p1', after: '14:00', before: '16:00', minutes: 15, reason: 'Kept' }] },
      req,
    );
    expect(picks.map((p) => [p.id, p.reason])).toEqual([
      ['todo-1', 'Kept'],
      // left out by the model, put back by code
      ['todo-2', 'Kept for today'],
    ]);
    expect(picks[1]).toMatchObject({ window: [795, 1320], minutes: 30, estimated: true });
  });

  it('reads a typed change as operations by item', () => {
    const req = readRequest({ ...BODY, mode: 'edit', text: 'move the run after 6', live_plan: [] });
    expect(
      checkOps(
        {
          is_plan_change: true,
          ops: [
            { op: 'move', ref: 'p2', after: '18:00', before: null },
            { op: 'remove', ref: 'p1', after: null, before: null },
            { op: 'add', ref: 'p7', after: null, before: null },
          ],
        },
        req,
      ),
    ).toEqual({
      isPlanChange: true,
      ops: [
        { op: 'move', id: 'hab-1', window: [1080, 1320] },
        { op: 'remove', id: 'todo-1', window: null },
      ],
    });
    expect(checkOps({ is_plan_change: false, ops: [] }, req)).toEqual({
      isPlanChange: false,
      ops: [],
    });
  });

  it('parses 24-hour times', () => {
    expect(parseHHMM('18:30')).toBe(1110);
    expect(parseHHMM('6pm')).toBeNull();
  });
});

describe('the plan picker on a travel day', () => {
  const travelBody = {
    ...BODY,
    now: 480,
    gap_from: 510,
    plan_end: 750,
    travel: { label: 'Flying to San Diego', departs: 750 },
    fixed: [{ title: 'Leave for the airport', start: 750, end: null, travel: true }],
  };

  it('plans only until they set off and says why', () => {
    const req = readRequest(travelBody);
    expect(req.end).toBe(750);
    const text = renderPlanInput(req, { claims: [], reach: null });
    expect(text).toContain('PLANNING FROM 8:30am TO 12:30pm');
    expect(text).toContain('TRAVEL TODAY: Flying to San Diego; they set off at 12:30pm');
    expect(text).toContain('SET TIMES (fixed, like meetings): 12:30pm Leave for the airport');
    expect(text).not.toContain('10pm');
  });

  it('keeps every window before they set off', () => {
    const req = readRequest(travelBody);
    const { picks } = checkPicks(
      {
        picks: [
          { ref: 'p1', after: '09:00', before: '18:00', minutes: 15, reason: 'due' },
          { ref: 'p2', after: null, before: null, minutes: 30, reason: 'behind' },
        ],
      },
      req,
    );
    expect(picks.every((p) => p.window[1] <= 750)).toBe(true);
  });

  it('an older app with no plan end plans to 10pm as before', () => {
    expect(readRequest(BODY).end).toBe(1320);
  });
});
