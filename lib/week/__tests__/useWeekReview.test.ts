/**
 * The weekly review's step machine (lib/week/useWeekReview.ts), against a
 * stand in for the week's row and a made up person (Maya, whose weekly day is
 * Sunday): opening it, each step in turn, Not this week, Just plan it, a
 * message typed part way, Carry on, picking it up later, and the end.
 */
import { act, renderHook } from '@testing-library/react-native';
import type { SpaceChatMessage } from '../../types';
import { useWeekReview, chatWeekContext } from '../useWeekReview';
import { resetWeekSession, useWeekSession } from '../review/session';
import { WEEK_COPY, doneLine } from '../review/words';
import { reliefBasis, spreadBasis } from '../model';
import { useThisWeek } from '../thisWeek';
import {
  changeWeekReview,
  createWeekReview,
  getWeekReview,
  getWeekSettings,
  moveWeekReview,
  saveWeeklyDay,
} from '../../repo/weekReviewRepo';
import { callWeekRead, callWeekSpread } from '../../cortex/CortexClient';
import { saveBoard } from '../board/save';
import { applyChange } from '../../changes/apply';
import { intentionNote } from '../../changes/week';
import {
  ID,
  MON,
  NEXT_SUN,
  SAT,
  SUN,
  THU,
  TUE,
  WED,
  WEEK_START,
  madeUpRead,
  madeUpRow,
} from '../review/__tests__/madeUpWeek';

const mockStore: any = { userId: 'maya', updateNote: jest.fn() };
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockStore },
}));
jest.mock('../../repo/weekReviewRepo', () => ({
  changeWeekReview: jest.fn(),
  createWeekReview: jest.fn(),
  getWeekReview: jest.fn(),
  getWeekSettings: jest.fn(),
  moveWeekReview: jest.fn(),
  saveDaysOff: jest.fn(),
  saveWeeklyDay: jest.fn(),
}));
jest.mock('../../cortex/CortexClient', () => ({
  callWeekRead: jest.fn(),
  callWeekSpread: jest.fn(),
}));
// the board's own writes are tested with the store (lib/week/board/__tests__/save.test.ts)
jest.mock('../board/save', () => ({ saveBoard: jest.fn() }));
jest.mock('../../changes/apply', () => ({ applyChange: jest.fn() }));
jest.mock('../../changes/week', () => ({ intentionNote: jest.fn() }));
jest.mock('../../changes/words', () => ({
  rowWords: (c: { title: string }) => `${c.title}: put off until next week`,
}));

/** The weeks' rows as the account holds them, by id. */
let rows: Record<string, any> = {};
let settings: { weekly_day: number | null; days_off: number[] | null };
const mockRevert = jest.fn(async () => undefined);
const mockBoardRevert = jest.fn(async () => undefined);

function harness(extra: Record<string, unknown> = {}) {
  const state = { messages: [] as SpaceChatMessage[] };
  const deps = {
    threadId: 't1' as string | null,
    get messages() {
      return state.messages;
    },
    appendBriefMessage: jest.fn(async (role: string, content: string, meta: any) => {
      const m = {
        id: `m${state.messages.length + 1}`,
        role,
        content,
        metadata_json: meta,
      } as unknown as SpaceChatMessage;
      state.messages = [...state.messages, m];
      return m;
    }),
    patchMessageMetadata: jest.fn(async (id: string, patch: any) => {
      state.messages = state.messages.map((m) =>
        m.id === id
          ? ({ ...m, metadata_json: { ...(m.metadata_json as any), ...patch } } as any)
          : m,
      );
    }),
    tellGremly: jest.fn(async (_text: string) => ({
      answered: true,
      card: false,
      hold: null as string | null,
    })),
    // the thread is told when the review is over, so the brief can carry on
    onEnded: jest.fn(),
    pauseMs: 0,
    ...extra,
  };
  const hook = renderHook(() => useWeekReview(deps as any));
  const go = async (work: (r: ReturnType<typeof useWeekReview>) => unknown) => {
    await act(async () => {
      await work(hook.result.current);
    });
    hook.rerender({});
  };
  /** The thread as it reads: who said what, or which card. */
  const thread = () =>
    state.messages
      .filter((m) => !(m.metadata_json as any)?.superseded)
      .map((m) => {
        const meta = m.metadata_json as any;
        if (meta?.type === 'week-card') return `[${meta.card}]`;
        return `${m.role === 'user' ? 'me' : 'gremly'}: ${m.content}`;
      });
  const last = () => state.messages[state.messages.length - 1];
  const cardOf = (kind: string) =>
    [...state.messages]
      .reverse()
      .find(
        (m) => (m.metadata_json as any)?.card === kind && !(m.metadata_json as any)?.superseded,
      );
  const offer = () =>
    [...state.messages].reverse().find((m) => (m.metadata_json as any)?.type === 'brief-offer')!;
  const tap = (action: string) =>
    go((r) =>
      r.handleButton(
        offer(),
        (offer().metadata_json as any).buttons.find((b: any) => b.action === action),
      ),
    );
  return { hook, deps, state, go, thread, last, cardOf, tap };
}

/** Set the clock: a local date and time. */
const at = (day: number, hour = 19, minute = 40) =>
  jest.setSystemTime(new Date(2026, 9, day, hour, minute, 0));

beforeEach(() => {
  jest.useFakeTimers();
  at(4); // Sunday 4 October 2026, 7:40pm: Maya's weekly day
  rows = {};
  settings = { weekly_day: 0, days_off: [0, 6] };
  mockStore.userId = 'maya';
  mockStore.updateNote = jest.fn(async () => undefined);
  mockStore.todos = [];
  mockStore.habits = [];
  mockStore.habitPlans = [];
  mockStore.worlds = [];
  mockStore.dropWorldLinks = [];
  resetWeekSession();
  useThisWeek.setState({ weeklyDay: 0, daysOff: [0, 6], review: null, loaded: false });
  (getWeekSettings as jest.Mock).mockImplementation(async () => settings);
  (getWeekReview as jest.Mock).mockImplementation(
    async (_user: string, weekStart: string) =>
      Object.values(rows).find((r) => r.week_start === weekStart) ?? null,
  );
  (changeWeekReview as jest.Mock).mockImplementation(async (id: string, change: any) => {
    if (!rows[id]) return null;
    rows[id] = { ...rows[id], ...change(rows[id]) };
    return rows[id];
  });
  (createWeekReview as jest.Mock).mockImplementation(async (_user: string, row: any) => {
    rows['row-new'] = madeUpRow({ id: 'row-new', read: null, ...row });
    return rows['row-new'];
  });
  (moveWeekReview as jest.Mock).mockImplementation(async (id: string, to: any) => {
    rows[id] = { ...rows[id], ...to };
    return rows[id];
  });
  (saveWeeklyDay as jest.Mock).mockImplementation(async (_user: string, day: number) => {
    settings.weekly_day = day;
  });
  (applyChange as jest.Mock).mockImplementation(async (change: any) => ({
    cid: change.cid,
    ok: true,
    summary: '',
    revert: mockRevert,
    ...(change.op === 'intention' ? { createdId: 'note-intention' } : {}),
  }));
  (intentionNote as jest.Mock).mockReturnValue(null);
  mockRevert.mockImplementation(async () => undefined);
  mockBoardRevert.mockImplementation(async () => undefined);
  // no spread comes back unless a test gives one
  (callWeekSpread as jest.Mock).mockResolvedValue({ ok: false, error: 'no spread in this test' });
  (saveBoard as jest.Mock).mockImplementation(async (diff: any) => ({
    todos: diff.place.length,
    later: diff.later.length,
    habitDays: diff.habits.reduce((n: number, h: any) => n + h.add.length + h.remove.length, 0),
    failed: 0,
    revert: mockBoardRevert,
  }));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * A review under way: opened with the read already made and Let's do it
 * tapped, or, when the row says it was started before, picked up where it was.
 */
async function started(over: Record<string, unknown> = {}) {
  rows['row-1'] = madeUpRow(over);
  const h = harness();
  await h.go((r) => r.open());
  if (over.status !== 'started') await h.tap('week_start');
  return h;
}

/** Open the week's board and tap Done on it. */
async function finishBoard(h: ReturnType<typeof harness>) {
  await h.go(async (r) => {
    r.board.open();
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
  await h.go((r) => r.board.done());
}

describe('the last line', () => {
  it('names the check ins still to come, and not one settled or already gone', async () => {
    const checkIn = (id: string, goal: string, date: string, status: 'open' | 'done') => ({
      id,
      goal,
      goal_date: '2026-11-01',
      date,
      title: `How is ${goal} going`,
      status,
    });
    const h = await started({
      status: 'started',
      answers: { step: 'needs_you' },
      checkins: [
        checkIn('c-1', 'Run a 10k', '2026-10-09', 'open'),
        checkIn('c-2', 'Finish the shed', '2026-10-07', 'done'),
        checkIn('c-3', 'Learn the piece', '2026-10-02', 'open'),
        // dated today: tonight's wrap up may be done already, so it is not promised
        checkIn('c-4', 'Read the book', '2026-10-04', 'open'),
      ],
    });
    await h.go((r) => r.needsYou.done());
    await finishBoard(h);
    expect(h.thread().slice(-1)).toEqual([
      `gremly: ${doneLine({ habits: false, checkIns: [{ goal: 'Run a 10k', date: '2026-10-09' }] })}`,
    ]);
    expect(h.thread().slice(-1)[0]).toContain('how “Run a 10k” is going on Fri 9 Oct');
  });
});

describe('opening the review', () => {
  it('on their weekly day is the mark, the time and Gremly asking for ten minutes', async () => {
    rows['row-1'] = madeUpRow();
    const h = harness();
    await h.go((r) => r.open());
    expect(h.thread()).toEqual([
      '[opening]',
      'gremly: Sunday evening, the best time to look at the week together. Got ten minutes?',
    ]);
    expect((h.cardOf('opening')!.metadata_json as any).at).toBe('Sunday, 7:40 PM');
    // nothing is started, asked for or saved by looking
    expect(rows['row-1'].status).toBe('ready');
    expect(callWeekRead).not.toHaveBeenCalled();
    expect(h.hook.result.current.underWay).toBe(false);
    // asked twice, the offer is not put twice
    await h.go((r) => r.open());
    expect(h.thread()).toHaveLength(2);
  });

  it('starts on Let’s do it with the read made ahead: no wait, straight to the challenge', async () => {
    const h = await started();
    expect(callWeekRead).not.toHaveBeenCalled();
    expect(rows['row-1']).toMatchObject({ status: 'started', answers: { step: 'challenge' } });
    expect(h.thread().slice(2)).toEqual([
      "me: Let's do it",
      "gremly: I've had a look at everything. Here's how this week looks to me.",
      '[challenge]',
    ]);
    expect(h.hook.result.current.underWay).toBe(true);
    // the step's own card is the last thing in the thread: nothing to carry on from
    expect(h.hook.result.current.canCarryOn).toBe(false);
    expect(h.hook.result.current.placeholder).toBe('Tell Gremly anything');
  });

  it('asks for the read behind the loading card when the week has none', async () => {
    let finish: (v: unknown) => void = () => undefined;
    (callWeekRead as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const h = harness();
    await h.go((r) => r.open());
    let tapping: Promise<void> = Promise.resolve();
    await act(async () => {
      tapping = h.hook.result.current.handleButton(
        h.last(),
        (h.last().metadata_json as any).buttons[0],
      );
      // as far as the wait for the read
      for (let i = 0; i < 30; i++) await Promise.resolve();
    });
    h.hook.rerender({});
    // waiting: Gremly has said so, and the loading card shows
    expect(h.hook.result.current.loading).toBe(true);
    expect(h.thread().slice(2)).toEqual([
      "me: Let's do it",
      'gremly: Give me a minute to look at everything.',
    ]);
    expect((callWeekRead as jest.Mock).mock.calls[0][0]).toEqual({ date: '2026-10-04' });
    rows['row-1'] = madeUpRow();
    await act(async () => {
      finish({
        ok: true,
        data: {
          made: true,
          on: {
            kind: 'weekly',
            promoted: true,
            fresh: false,
            week_start: WEEK_START,
            span_start: WEEK_START,
            span_end: '2026-10-11',
          },
          review: rows['row-1'],
        },
      });
      await tapping;
    });
    h.hook.rerender({});
    expect(h.hook.result.current.loading).toBe(false);
    expect(rows['row-1'].status).toBe('started');
    expect(h.last().metadata_json).toMatchObject({ type: 'week-card', card: 'challenge' });
  });

  it('offers to try again when the read cannot be made, and looks at the week first', async () => {
    (callWeekRead as jest.Mock).mockResolvedValue({ ok: false, error: 'timed out' });
    const h = harness();
    await h.go((r) => r.open());
    await h.tap('week_start');
    expect(h.thread().slice(-1)).toEqual([`gremly: ${WEEK_COPY.loadFailed}`]);
    expect(h.hook.result.current.loading).toBe(false);
    expect(h.hook.result.current.underWay).toBe(false);

    // a read that was nearly made was kept in the meantime: it is found
    // before asking again, so nothing is asked for a second time
    rows['row-1'] = madeUpRow();
    await h.tap('week_retry');
    expect(callWeekRead).toHaveBeenCalledTimes(1);
    expect(rows['row-1'].status).toBe('started');
    expect(h.thread().slice(-3)).toEqual([
      'me: Try again',
      "gremly: I've had a look at everything. Here's how this week looks to me.",
      '[challenge]',
    ]);
  });

  it('uses a read that was kept even though the call for it failed', async () => {
    // the phone stopped waiting, and the worker finished the read and kept it
    (callWeekRead as jest.Mock).mockImplementation(async () => {
      rows['row-1'] = madeUpRow();
      return { ok: false, error: 'the connection went quiet' };
    });
    const h = harness();
    await h.go((r) => r.open());
    await h.tap('week_start');
    expect(callWeekRead).toHaveBeenCalledTimes(1);
    expect(rows['row-1'].status).toBe('started');
    expect(h.last().metadata_json).toMatchObject({ type: 'week-card', card: 'challenge' });
  });

  it('asks again on Try again when the week still has no read', async () => {
    (callWeekRead as jest.Mock).mockResolvedValueOnce({ ok: false, error: 'timed out' });
    const h = harness();
    await h.go((r) => r.open());
    await h.tap('week_start');
    (callWeekRead as jest.Mock).mockImplementation(async () => {
      rows['row-1'] = madeUpRow();
      return {
        ok: true,
        data: { made: true, on: useWeekSession.getState().on, review: rows['row-1'] },
      };
    });
    await h.tap('week_retry');
    expect(callWeekRead).toHaveBeenCalledTimes(2);
    expect(h.thread().slice(-4)).toEqual([
      'me: Try again',
      'gremly: Give me a minute to look at everything.',
      "gremly: I've had a look at everything. Here's how this week looks to me.",
      '[challenge]',
    ]);
  });

  it('picks a review up where it was when an old Let’s do it is tapped after it was started', async () => {
    rows['row-1'] = madeUpRow();
    const h = harness();
    await h.go((r) => r.open());
    // started somewhere else in the meantime, and already on the shape
    rows['row-1'] = madeUpRow({ status: 'started', answers: { step: 'shape' } });
    await h.tap('week_start');
    expect(rows['row-1'].answers.step).toBe('shape');
    expect(h.thread().slice(-5)).toEqual([
      "me: Let's do it",
      `gremly: ${WEEK_COPY.resumed}`,
      '[challenge]',
      '[priorities]',
      '[shape]',
    ]);
  });

  it('can be left for now after a read that failed', async () => {
    (callWeekRead as jest.Mock).mockResolvedValue({ ok: false, error: 'timed out' });
    const h = harness();
    await h.go((r) => r.open());
    await h.tap('week_start');
    expect(h.deps.onEnded).not.toHaveBeenCalled();
    await h.tap('week_stop');
    expect(h.thread().slice(-2)).toEqual(['me: Not now', `gremly: ${WEEK_COPY.stopped}`]);
    // the thread is the day's again
    expect(h.deps.onEnded).toHaveBeenCalledTimes(1);
  });
});

describe('not this week', () => {
  it('is kept on the week, so the review stops being put forward', async () => {
    rows['row-1'] = madeUpRow();
    const h = harness();
    await h.go((r) => r.open());
    await h.tap('week_skip');
    expect(rows['row-1'].status).toBe('skipped');
    expect(h.thread().slice(-2)).toEqual([
      'me: Not this week',
      "gremly: No problem. Your week stays as it is, and I'll ask again next Sunday.",
    ]);
    expect(useThisWeek.getState().review?.status).toBe('skipped');
    expect(callWeekRead).not.toHaveBeenCalled();
    // the thread is the day's again
    expect(h.deps.onEnded).toHaveBeenCalledTimes(1);
  });

  it('makes the week’s row when Gremly has made no read for it yet', async () => {
    const h = harness();
    await h.go((r) => r.open());
    await h.tap('week_skip');
    expect(createWeekReview).toHaveBeenCalledWith('maya', {
      week_start: WEEK_START,
      span_start: WEEK_START,
      status: 'skipped',
      kind: 'weekly',
    });
  });

  it('writes nothing for the midweek extra or a week brought forward: only the weekly review is skipped', async () => {
    at(7); // Wednesday
    const h = harness();
    await h.go((r) => r.open());
    expect(h.thread()[1]).toContain('the rest of this week');
    await h.tap('week_skip');
    expect(createWeekReview).not.toHaveBeenCalled();
    expect(changeWeekReview).not.toHaveBeenCalled();
    expect(h.thread().slice(-1)).toEqual(['gremly: No problem. Your week stays as it is.']);
  });
});

describe('going through the steps', () => {
  it('settles each in turn, saves it on the week, and ends with the week planned', async () => {
    const h = await started();
    const r = () => h.hook.result.current;

    // the challenge: about right
    await h.go(() => r().challenge.agree());
    expect(rows['row-1'].answers).toMatchObject({
      step: 'priorities',
      challenge: { agreed: true },
    });
    expect((h.cardOf('challenge')!.metadata_json as any).settled).toBe("That's about right");
    expect(h.thread().slice(-2)).toEqual([`gremly: ${WEEK_COPY.prioritiesIntro}`, '[priorities]']);

    // what matters most: up to three
    await h.go(() => {
      r().priorities.toggle(0);
      r().priorities.toggle(2);
      r().priorities.toggle(3);
      // a fourth is not taken
      r().priorities.toggle(1);
    });
    expect(useWeekSession.getState().draft?.priorities).toEqual([0, 2, 3]);
    await h.go(() => r().priorities.toggle(3));
    await h.go(() => r().priorities.done());
    expect(rows['row-1'].answers.priorities).toEqual([
      { text: 'Get the reports started', item_ids: [ID.reports] },
      { text: 'Sort the boiler', item_ids: [ID.boiler] },
    ]);
    expect((h.cardOf('priorities')!.metadata_json as any).settled).toBe(
      'Get the reports started, Sort the boiler',
    );

    // the shape: a busy day more, half an hour more on a normal day, a deadline taken off
    await h.go(() => {
      r().shape.toggleBusy(WED);
      r().shape.stepHours('normal_day', 0.5);
      r().shape.stepHours('busy_day', -0.5);
      // never below nothing
      r().shape.stepHours('busy_day', -0.5);
      r().shape.removeDate(`note:${ID.fair}`);
    });
    await h.go(() => r().shape.done());
    expect(rows['row-1'].answers).toMatchObject({
      step: 'intention',
      hours: { normal_day: 2.5, busy_day: 0, weekend_day: 4 },
      busy_days: [TUE, WED, THU],
      dates_out: [`note:${ID.fair}`],
    });
    expect((h.cardOf('shape')!.metadata_json as any).settled).toBe(
      'Busiest on Tue, Wed, Thu. About 2h 30m free on a normal day, no time on a busy one, 4h at weekends.',
    );

    // the intention: one of Gremly's drafts, kept as the week's note
    await h.go(() => r().intention.pick(1));
    await h.go(() => r().intention.done());
    const kept = (applyChange as jest.Mock).mock.calls[0][0];
    expect(kept).toMatchObject({
      op: 'intention',
      type: 'note',
      id: null,
      week_start: WEEK_START,
      fields: { text: 'Leave school by five twice.' },
    });
    expect(rows['row-1'].answers).toMatchObject({
      step: 'ahead',
      intention: 'Leave school by five twice.',
      intention_id: 'note-intention',
    });

    // what is ahead: a step left out, then set up
    await h.go(() => r().ahead.toggleStep(ID.reports, 2));
    await h.go(() => r().ahead.setUp(ID.reports));
    const milestone = (applyChange as jest.Mock).mock.calls[1][0];
    expect(milestone).toMatchObject({
      op: 'milestone',
      week_start: WEEK_START,
      milestone: { goal: 'Reports handed in', date: '2026-10-23' },
    });
    expect(milestone.milestone.steps.map((s: any) => s.title)).toEqual([
      'Gather the grades',
      'Draft the first ten',
    ]);
    expect(rows['row-1'].answers.milestones).toEqual([
      { about: ID.reports, goal: 'Reports handed in', steps: 2 },
    ]);
    expect(useWeekSession.getState().undoable).toEqual({ [`milestone:${ID.reports}`]: true });
    await h.go(() => r().ahead.done());
    expect((h.cardOf('ahead')!.metadata_json as any).settled).toBe(
      'Set up the steps for Reports handed in',
    );
    expect(h.thread().slice(-2)).toEqual([
      'gremly: These two need you most. Tap one to talk it through, or leave them be.',
      '[needs_you]',
    ]);

    // what needs them: enough for these, and on to the week's board
    await h.go(() => r().needsYou.done());
    expect(rows['row-1']).toMatchObject({ status: 'started', answers: { step: 'board' } });
    expect((h.cardOf('needs_you')!.metadata_json as any).settled).toBe(WEEK_COPY.enough);
    expect(h.thread().slice(-1)).toEqual(['[board]']);
    expect(saveBoard).not.toHaveBeenCalled();

    // the board: Done on it writes the week and ends the review
    await finishBoard(h);
    expect(saveBoard).toHaveBeenCalledTimes(1);
    expect(rows['row-1']).toMatchObject({ status: 'done', answers: { step: 'done' } });
    expect(typeof rows['row-1'].completed_at).toBe('string');
    expect((h.cardOf('board')!.metadata_json as any).settled).toBe('Week planned');
    expect(h.thread().slice(-2)).toEqual([
      '[done]',
      `gremly: ${doneLine({ habits: false, checkIns: [] })}`,
    ]);
    expect((h.cardOf('done')!.metadata_json as any).summary).toEqual({
      intention: 'Leave school by five twice.',
      tiles: [
        { num: '0', label: 'todos spread across the week' },
        { num: '0', label: 'habit sessions with a day' },
        { num: '2', label: "steps set up for what's coming" },
      ],
    });
    // the weekly review on its own day never asks about their weekly day
    expect(h.thread().join(' ')).not.toContain('weekly day from now on');
    expect(h.hook.result.current.underWay).toBe(false);
    expect(useThisWeek.getState().review?.status).toBe('done');
  });

  it('passes over a step that is skipped, with nothing kept for it', async () => {
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().challenge.agree());
    await h.go(() => r().priorities.done());
    expect(rows['row-1'].answers.priorities).toEqual([]);
    expect((h.cardOf('priorities')!.metadata_json as any).settled).toBe('Nothing in particular');
    await h.go(() => r().shape.done());
    await h.go(() => r().intention.done());
    // no intention: no note is made
    expect(applyChange).not.toHaveBeenCalled();
    expect(rows['row-1'].answers.intention).toBeNull();
    expect((h.cardOf('intention')!.metadata_json as any).settled).toBe('No intention this week');
    await h.go(() => r().ahead.done());
    expect((h.cardOf('ahead')!.metadata_json as any).settled).toBe('Not now');
  });

  it('leaves out the steps a read has nothing for', async () => {
    const h = await started({
      read: madeUpRead({ priority_options: [], milestones: [], needs_you: [] }),
    });
    const r = () => h.hook.result.current;
    await h.go(() => r().challenge.agree());
    expect(h.last().metadata_json).toMatchObject({ card: 'shape' });
    await h.go(() => r().shape.done());
    await h.go(() => r().intention.done());
    // nothing ahead and nothing stuck: straight to the board
    expect(rows['row-1']).toMatchObject({ status: 'started', answers: { step: 'board' } });
    expect(h.last().metadata_json).toMatchObject({ card: 'board' });
  });

  it('keeps their own words as the intention, ahead of a draft', async () => {
    const h = await started({ status: 'started', answers: { step: 'intention' } });
    const r = () => h.hook.result.current;
    await h.go(() => {
      r().intention.pick(0);
      r().intention.write('Sleep before midnight');
    });
    await h.go(() => r().intention.done());
    expect((applyChange as jest.Mock).mock.calls[0][0].fields.text).toBe('Sleep before midnight');
    expect(rows['row-1'].answers.intention).toBe('Sleep before midnight');
  });

  it('takes a milestone back with one tap while the review is still on it', async () => {
    const h = await started({ status: 'started', answers: { step: 'ahead' } });
    const r = () => h.hook.result.current;
    await h.go(() => r().ahead.setUp(ID.reports));
    expect(rows['row-1'].answers.milestones).toHaveLength(1);
    // set up: its steps can no longer be tapped in or out
    await h.go(() => r().ahead.toggleStep(ID.reports, 0));
    expect(useWeekSession.getState().draft?.stepsOut[ID.reports] ?? []).toEqual([]);
    await h.go(() => r().ahead.undo(ID.reports));
    expect(mockRevert).toHaveBeenCalledTimes(1);
    expect(rows['row-1'].answers.milestones).toEqual([]);
    expect(useWeekSession.getState().undoable).toEqual({});
  });

  it('opens a settled card again with Change, saves it, and stays where the review had got to', async () => {
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().challenge.agree());
    await h.go(() => r().priorities.toggle(0));
    await h.go(() => r().priorities.done());
    const before = h.thread().length;
    // on the shape now: the priorities are opened again
    await h.go(() => r().edit('priorities'));
    expect(useWeekSession.getState().editing).toBe('priorities');
    await h.go(() => r().priorities.toggle(3));
    await h.go(() => r().priorities.done());
    expect(rows['row-1'].answers.priorities.map((p: any) => p.text)).toEqual([
      'Get the reports started',
      'Two swims',
    ]);
    expect(rows['row-1'].answers.step).toBe('shape');
    expect((h.cardOf('priorities')!.metadata_json as any).settled).toBe(
      'Get the reports started, Two swims',
    );
    // nothing new is said, and the review is still on the shape
    expect(h.thread()).toHaveLength(before);
    expect(useWeekSession.getState().editing).toBeNull();
    // a step not yet settled cannot be opened with Change
    await h.go(() => r().edit('intention'));
    expect(useWeekSession.getState().editing).toBeNull();
  });
});

describe('just plan it', () => {
  it('takes Gremly’s picks and guesses for every step not done, and goes to the board', async () => {
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().challenge.agree());
    await h.go(() => r().justPlan());
    expect(rows['row-1']).toMatchObject({
      status: 'started',
      answers: {
        step: 'board',
        guessed: true,
        // his own picks, his guess at the hours, and the busy days he read
        priorities: [
          { text: 'Get the reports started', item_ids: [ID.reports] },
          { text: 'Clear the marking', item_ids: [ID.marking] },
        ],
        hours: { normal_day: 2, busy_day: 0.5, weekend_day: 4 },
        busy_days: [TUE, THU],
        intention: null,
      },
    });
    // their own days are kept without a word from them: nothing says they answered
    expect(rows['row-1'].answers.keep).toBeUndefined();
    // the week is not planned until they finish the board
    expect(rows['row-1'].completed_at).toBeNull();
    // nothing is set up for them, and no intention is made in their name
    expect(applyChange).not.toHaveBeenCalled();
    expect(rows['row-1'].answers.milestones).toBeUndefined();
    expect(h.thread().slice(-3)).toEqual([
      'me: Just plan it',
      `gremly: ${WEEK_COPY.guessed}`,
      '[board]',
    ]);
    expect(r().underWay).toBe(true);
    // on the board there is nothing left to guess: it does nothing there
    await h.go(() => r().justPlan());
    expect(h.thread().slice(-1)).toEqual(['[board]']);
    await finishBoard(h);
    expect(rows['row-1'].status).toBe('done');
    expect(h.thread().slice(-2)).toEqual([
      '[done]',
      `gremly: ${doneLine({ habits: false, checkIns: [] })}`,
    ]);
    expect((h.cardOf('priorities')!.metadata_json as any).settled).toBe(
      'Get the reports started, Clear the marking',
    );
  });

  it('keeps what they already settled themselves', async () => {
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().challenge.agree());
    await h.go(() => r().priorities.toggle(3));
    await h.go(() => r().priorities.done());
    await h.go(() => r().justPlan());
    expect(rows['row-1'].answers.priorities).toEqual([{ text: 'Two swims', item_ids: [] }]);
    expect(rows['row-1'].answers.hours).toEqual({ normal_day: 2, busy_day: 0.5, weekend_day: 4 });
  });
});

describe('a message typed while the review is under way', () => {
  it('goes to Gremly as the review’s own, and the review waits for Carry on', async () => {
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().challenge.agree());
    let taken = false;
    await h.go(async () => {
      taken = await r().takeTyped('My sister is staying on Thursday');
    });
    expect(taken).toBe(true);
    expect(h.deps.tellGremly).toHaveBeenCalledWith('My sister is staying on Thursday');
    // their message is in the thread, marked as the review's
    const mine = h.state.messages.find((m) => m.content === 'My sister is staying on Thursday')!;
    expect(mine.metadata_json).toEqual({
      type: 'brief-reply',
      button_id: 'typed',
      action: 'week_typed',
      week: true,
    });
    // kept for the week's spread to weigh
    expect(rows['row-1'].answers.said).toEqual([
      { step: 'priorities', text: 'My sister is staying on Thursday' },
    ]);
    // the review has not moved: the button is how it carries on
    expect(rows['row-1'].answers.step).toBe('priorities');
    expect(r().canCarryOn).toBe(true);
  });

  it('brings the step’s card back on Carry on, with what was picked kept', async () => {
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().challenge.agree());
    await h.go(() => r().priorities.toggle(2));
    await h.go(() => r().takeTyped('What does the boiler one cover?'));
    const old = h.cardOf('priorities')!;
    await h.go(() => r().carryOn());
    const again = h.cardOf('priorities')!;
    expect(again.id).not.toBe(old.id);
    // the earlier copy is put away, so there is one card to act on
    expect((h.state.messages.find((m) => m.id === old.id)!.metadata_json as any).superseded).toBe(
      true,
    );
    expect(r().isLive(again.metadata_json as any, again.id)).toBe(true);
    expect(useWeekSession.getState().draft?.priorities).toEqual([2]);
    expect(r().canCarryOn).toBe(false);
    expect(rows['row-1'].answers.step).toBe('priorities');
  });

  it('moves on from the challenge on Carry on: what they typed was their say on it', async () => {
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().takeTyped('You have missed the school trip on Friday'));
    expect(r().canCarryOn).toBe(true);
    await h.go(() => r().carryOn());
    expect(rows['row-1'].answers.step).toBe('priorities');
    expect(h.last().metadata_json).toMatchObject({ card: 'priorities' });
    // they did not say it was about right, so nothing says they did
    expect((h.cardOf('challenge')!.metadata_json as any).settled).toBeNull();
  });

  it('waits for their answer when Gremly’s reply asked something the step needs: no Carry on until then', async () => {
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().challenge.agree());
    h.deps.tellGremly.mockResolvedValueOnce({
      answered: true,
      card: false,
      hold: 'Which evening is the concert?',
    });
    await h.go(() => r().takeTyped('I have a concert this week'));
    expect(useWeekSession.getState().hold).toBe('Which evening is the concert?');
    expect(r().canCarryOn).toBe(false);
    expect(r().placeholder).toBe('Answer Gremly to carry on');
    // Gremly is told what the review is waiting on with their answer
    expect(r().context()?.under_way?.hold).toBe('Which evening is the concert?');
    // they answer: the button comes back
    await h.go(() => r().takeTyped('Wednesday'));
    expect(useWeekSession.getState().hold).toBeNull();
    expect(r().canCarryOn).toBe(true);
    expect(r().placeholder).toBe('Tell Gremly anything');
  });

  it('waits its turn when sent while a step is being saved, and is not lost', async () => {
    const h = await started();
    const r = () => h.hook.result.current;
    let saveNow: () => void = () => undefined;
    (changeWeekReview as jest.Mock).mockImplementationOnce(
      (id: string, change: any) =>
        new Promise((resolve) => {
          saveNow = () => {
            rows[id] = { ...rows[id], ...change(rows[id]) };
            resolve(rows[id]);
          };
        }),
    );
    let taken = false;
    await act(async () => {
      void r().challenge.agree();
      for (let i = 0; i < 10; i++) await Promise.resolve();
      const typing = r()
        .takeTyped('My sister is staying on Thursday')
        .then((t) => {
          taken = t;
        });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      // the step is still being saved: Gremly has not been sent it yet
      expect(h.deps.tellGremly).not.toHaveBeenCalled();
      saveNow();
      await typing;
    });
    h.hook.rerender({});
    expect(taken).toBe(true);
    expect(h.deps.tellGremly).toHaveBeenCalledWith('My sister is staying on Thursday');
    // it went after the step it waited for
    expect(rows['row-1'].answers.said).toEqual([
      { step: 'priorities', text: 'My sister is staying on Thursday' },
    ]);
  });

  it('says so when Gremly cannot be reached, and stays where it is', async () => {
    const h = await started();
    h.deps.tellGremly.mockResolvedValueOnce({ answered: false, card: false, hold: null });
    await h.go((r) => r.takeTyped('Is Thursday very full?'));
    expect(h.thread().slice(-2)).toEqual([
      'me: Is Thursday very full?',
      `gremly: ${WEEK_COPY.noAnswer}`,
    ]);
    expect(rows['row-1'].answers.said).toBeUndefined();
    expect(rows['row-1'].answers.step).toBe('challenge');
  });

  it('is not the review’s when no review is under way', async () => {
    rows['row-1'] = madeUpRow();
    const h = harness();
    await h.go((r) => r.open());
    let taken = true;
    await h.go(async (r) => {
      taken = await r.takeTyped('What is on today?');
    });
    expect(taken).toBe(false);
    expect(h.deps.tellGremly).not.toHaveBeenCalled();
  });

  it('takes what they say Gremly has wrong after Not quite, and shows it on his read', async () => {
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().challenge.disagree());
    expect(h.thread().slice(-2)).toEqual(['me: Not quite', `gremly: ${WEEK_COPY.tellMe}`]);
    expect(r().placeholder).toBe("Anything I've missed?");
    expect(rows['row-1'].answers.challenge).toEqual({ agreed: false });
    await h.go(() => r().takeTyped('The reports moved to November'));
    expect(rows['row-1'].answers.challenge).toEqual({
      agreed: false,
      note: 'The reports moved to November',
    });
    expect(useWeekSession.getState().fixing).toBe(false);
  });

  it('sends a deadline typed on the shape to Gremly: code reads no date from words', async () => {
    const h = await started({ status: 'started', answers: { step: 'shape' } });
    await h.go((r) => r.shape.addDate('  Passport renewal by the 20th '));
    expect(h.deps.tellGremly).toHaveBeenCalledWith('Passport renewal by the 20th');
    expect(rows['row-1'].answers.said).toEqual([
      { step: 'shape', text: 'Passport renewal by the 20th' },
    ]);
  });
});

describe('one of the needs you cards, talked through', () => {
  it('opens with Gremly’s own question, sends a tapped reason as their words, and keeps what was decided', async () => {
    const h = await started({ status: 'started', answers: { step: 'needs_you' } });
    const r = () => h.hook.result.current;
    await h.go(() => r().needsYou.talk(0));
    expect(useWeekSession.getState().talking).toBe(0);
    expect(h.thread().slice(-2)).toEqual([
      "me: Let's talk about this one: Sort the boiler",
      'gremly: What is making this one hard to get done?',
    ]);
    expect(r().context()?.under_way?.about).toMatchObject({
      title: 'Sort the boiler',
      item_ids: [ID.boiler],
    });
    await h.tap('week_reason');
    expect(h.deps.tellGremly).toHaveBeenCalledWith('Feels too big');
    expect(h.thread().slice(-1)).toEqual(['me: Feels too big']);
    // Gremly's card is accepted: the decision is kept against the one they opened
    await h.go(() =>
      r().onApplied([
        { cid: 'c1', op: 'later', type: 'todo', id: ID.boiler, title: 'Sort the boiler' } as any,
      ]),
    );
    expect(rows['row-1'].answers.needs_you).toEqual([
      {
        title: 'Sort the boiler',
        item_ids: [ID.boiler],
        decision: 'Sort the boiler: put off until next week',
      },
    ]);
    // back to the others
    expect(r().canCarryOn).toBe(true);
    await h.go(() => r().carryOn());
    expect(useWeekSession.getState().talking).toBeNull();
    expect(h.last().metadata_json).toMatchObject({ card: 'needs_you' });
  });

  it('follows an intention changed on Gremly’s card', async () => {
    const h = await started({
      status: 'started',
      answers: { step: 'ahead', intention: 'Old words' },
    });
    (intentionNote as jest.Mock).mockReturnValue({ id: 'note-9', body: 'Finish early on Friday' });
    await h.go((r) =>
      r.onApplied([
        {
          cid: 'c1',
          op: 'intention',
          type: 'note',
          id: 'note-9',
          title: 'Finish early on Friday',
          fields: { text: 'Finish early on Friday' },
        } as any,
      ]),
    );
    expect(rows['row-1'].answers).toMatchObject({
      intention: 'Finish early on Friday',
      intention_id: 'note-9',
    });
    expect(useWeekSession.getState().draft?.intention).toEqual({
      pick: null,
      own: 'Finish early on Friday',
    });
  });
});

describe('picking a review up later', () => {
  const part = {
    status: 'started',
    answers: { step: 'shape', challenge: { agreed: true }, priorities: [] },
  };

  it('on a later day puts every card so far back in the new thread, with the same read', async () => {
    rows['row-1'] = madeUpRow(part as any);
    at(7); // Wednesday: by the date this would be the extra
    const h = harness();
    await h.go((r) => r.open());
    expect(callWeekRead).not.toHaveBeenCalled();
    expect(h.thread()).toEqual([
      `gremly: ${WEEK_COPY.resumed}`,
      '[challenge]',
      '[priorities]',
      '[shape]',
    ]);
    // still the weekly review, planning from today, and the extra is not used
    expect(useWeekSession.getState().on).toMatchObject({
      kind: 'weekly',
      resumed: true,
      span_start: WED,
    });
    expect(rows['row-1']).toMatchObject({ kind: 'weekly', status: 'started' });
    expect(h.hook.result.current.underWay).toBe(true);
    expect(h.hook.result.current.context()?.under_way).toMatchObject({
      step: 'shape',
      first: WED,
      last: '2026-10-11',
    });
    // busy days already gone are not on the card
    expect(useWeekSession.getState().draft?.busy).toEqual([THU]);
  });

  it('in the thread that holds it adds nothing when its card is still the last thing there', async () => {
    const h = await started();
    const before = h.thread().length;
    await h.go((r) => r.open());
    expect(h.thread()).toHaveLength(before);
  });

  it('in the thread that holds it brings the card back when something came after it', async () => {
    const h = await started();
    await h.go((r) => r.takeTyped('One second'));
    const before = h.thread().length;
    await h.go((r) => r.open());
    expect(h.thread()).toHaveLength(before);
    expect(h.last().metadata_json).toMatchObject({ card: 'challenge' });
  });

  it('reads the week a thread already holds, so its cards can be drawn after the app was closed', async () => {
    rows['row-1'] = madeUpRow(part as any);
    const h = harness();
    await act(async () => {
      await h.deps.appendBriefMessage('system', '', {
        type: 'week-card',
        card: 'shape',
        week_start: WEEK_START,
        week: true,
      });
    });
    h.hook.rerender({});
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    h.hook.rerender({});
    expect(useWeekSession.getState().row?.id).toBe('row-1');
    expect(h.hook.result.current.underWay).toBe(true);
    const shape = h.cardOf('shape')!;
    expect(h.hook.result.current.isLive(shape.metadata_json as any, shape.id)).toBe(true);
  });
});

describe('once the week is planned', () => {
  it('the Week button shows the week again, once', async () => {
    rows['row-1'] = madeUpRow({
      status: 'done',
      completed_at: '2026-10-04T20:00:00Z',
      answers: {
        step: 'done',
        intention: 'Fewer things, finished.',
        priorities: [{ text: 'Two swims', item_ids: [] }],
      },
    });
    at(6, 9, 0); // Tuesday morning
    const h = harness();
    await h.go((r) => r.open());
    expect(h.thread()).toEqual([`gremly: ${WEEK_COPY.yourWeek}`, '[done]']);
    expect(h.last().metadata_json).toMatchObject({
      recap: true,
      summary: { intention: 'Fewer things, finished.' },
    });
    await h.go((r) => r.open());
    expect(h.thread()).toHaveLength(2);
    expect(h.hook.result.current.underWay).toBe(false);
  });

  it('out of their weekly window with the extra still free, shows the week and offers to plan the rest again', async () => {
    rows['row-1'] = madeUpRow({
      status: 'done',
      completed_at: '2026-10-04T20:00:00Z',
      answers: {
        step: 'done',
        challenge: { agreed: true },
        guessed: true,
        hours: { normal_day: 3, busy_day: 1, weekend_day: 5 },
        intention: 'Fewer things, finished.',
      },
    });
    at(7, 12, 30); // Wednesday
    const h = harness();
    await h.go((r) => r.open());
    expect(h.thread()).toEqual([
      `gremly: ${WEEK_COPY.yourWeek}`,
      '[done]',
      `gremly: ${WEEK_COPY.planAgainLine}`,
    ]);
    // asked again, nothing is put twice
    await h.go((r) => r.open());
    expect(h.thread()).toHaveLength(3);
    (callWeekRead as jest.Mock).mockImplementation(async () => {
      rows['row-1'] = { ...rows['row-1'], kind: 'extra', span_start: WED };
      return {
        ok: true,
        data: { made: true, on: useWeekSession.getState().on, review: rows['row-1'] },
      };
    });
    await h.tap('week_start');
    expect(h.thread()[3]).toBe(`me: ${WEEK_COPY.planAgain}`);
    expect(callWeekRead).toHaveBeenCalledWith({ date: WED });
    // under way again from the fresh read, as the week's one extra
    expect(rows['row-1']).toMatchObject({ status: 'started', kind: 'extra' });
    // what they settled is where the cards start; what was said of the old read is gone
    expect(rows['row-1'].answers).toMatchObject({
      step: 'challenge',
      intention: 'Fewer things, finished.',
      hours: { normal_day: 3, busy_day: 1, weekend_day: 5 },
    });
    expect(rows['row-1'].answers.challenge).toBeUndefined();
    expect(rows['row-1'].answers.guessed).toBeUndefined();
    expect(h.last().metadata_json).toMatchObject({ type: 'week-card', card: 'challenge' });
    expect(h.hook.result.current.underWay).toBe(true);
  });

  it('planned again in the thread its first go ended in, leaves that go’s cards as what was settled', async () => {
    at(7, 12, 30); // Wednesday: a review begun on Sunday is finished today
    const h = await started({ status: 'started', answers: { step: 'needs_you' } });
    const r = () => h.hook.result.current;
    await h.go(() => r().needsYou.done());
    await finishBoard(h);
    expect(rows['row-1']).toMatchObject({ status: 'done', kind: 'weekly' });
    const firstGo = h.cardOf('priorities')!;
    expect(r().isLive(firstGo.metadata_json as any, firstGo.id)).toBe(true);
    await h.go(() => r().open());
    expect(h.thread().slice(-1)).toEqual([`gremly: ${WEEK_COPY.planAgainLine}`]);
    (callWeekRead as jest.Mock).mockImplementation(async () => {
      rows['row-1'] = { ...rows['row-1'], kind: 'extra', span_start: WED };
      return {
        ok: true,
        data: { made: true, on: useWeekSession.getState().on, review: rows['row-1'] },
      };
    });
    rows['row-1'].answers = {
      ...rows['row-1'].answers,
      keep: 'some',
      freed: [ID.boiler],
      relieved: { [WED]: 'left' },
    };
    await h.tap('week_start');
    expect(rows['row-1'].answers.step).toBe('challenge');
    // what they said of their own days was for the days as they stood then
    expect(rows['row-1'].answers).toMatchObject({
      keep: undefined,
      freed: undefined,
      relieved: undefined,
    });
    // the new go's card is the one to act on; the first go's cards are history
    const now = h.cardOf('challenge')!;
    expect(r().isLive(now.metadata_json as any, now.id)).toBe(true);
    expect(r().isLive(firstGo.metadata_json as any, firstGo.id)).toBe(false);
  });

  it('opens only the week they planned once the extra is used', async () => {
    rows['row-1'] = madeUpRow({ kind: 'extra', status: 'done', answers: { step: 'done' } });
    at(8, 12, 30); // Thursday
    const h = harness();
    await h.go((r) => r.open());
    expect(h.thread()).toEqual([`gremly: ${WEEK_COPY.yourWeek}`, '[done]']);
  });

  it('leaves the week as it is on Not now', async () => {
    rows['row-1'] = madeUpRow({ status: 'done', answers: { step: 'done' } });
    at(7, 12, 30); // Wednesday
    const h = harness();
    await h.go((r) => r.open());
    await h.tap('week_skip');
    expect(h.thread().slice(-2)).toEqual([
      'me: Not now',
      'gremly: No problem. Your week stays as it is.',
    ]);
    expect(rows['row-1']).toMatchObject({ status: 'done', kind: 'weekly' });
    expect(createWeekReview).not.toHaveBeenCalled();
  });

  it('the day before their weekly day shows this week, then offers next week early', async () => {
    rows['row-1'] = madeUpRow({ status: 'done', answers: { step: 'done' } });
    at(10, 10, 0); // Saturday
    const h = harness();
    await h.go((r) => r.open());
    expect(h.thread()).toEqual([
      `gremly: ${WEEK_COPY.yourWeek}`,
      '[done]',
      "gremly: Want to plan next week a day early? I'll take a fresh look at everything first. Got ten minutes?",
    ]);
    // next week, brought forward: its own week, a fresh read
    expect(useWeekSession.getState().on).toMatchObject({
      kind: 'brought_forward',
      week_start: '2026-10-12',
    });
    (callWeekRead as jest.Mock).mockImplementation(async () => {
      rows['row-2'] = madeUpRow({
        id: 'row-2',
        week_start: '2026-10-12',
        span_start: '2026-10-12',
        kind: 'brought_forward',
        read: madeUpRead({
          first: '2026-10-12',
          last: '2026-10-18',
          milestones: [],
          busy_days: [],
        }),
      });
      return {
        ok: true,
        data: { made: true, on: useWeekSession.getState().on, review: rows['row-2'] },
      };
    });
    await h.tap('week_start');
    expect(callWeekRead).toHaveBeenCalledWith({ date: SAT });
    expect(rows['row-2'].status).toBe('started');
    // this week's finished review is untouched
    expect(rows['row-1'].status).toBe('done');
  });
});

describe('a review on another day than their weekly day', () => {
  /** Wednesday's extra, taken to the end with Just plan it. */
  async function extraDone() {
    at(7, 12, 30); // Wednesday
    (callWeekRead as jest.Mock).mockImplementation(async () => {
      rows['row-1'] = madeUpRow({ kind: 'extra', span_start: WED });
      return {
        ok: true,
        data: { made: true, on: useWeekSession.getState().on, review: rows['row-1'] },
      };
    });
    const h = harness();
    await h.go((r) => r.open());
    expect(h.thread()[1]).toBe(
      "gremly: Want to plan the rest of this week together? I'll take a fresh look at everything first. Got ten minutes?",
    );
    await h.tap('week_start');
    await h.go((r) => r.justPlan());
    await finishBoard(h);
    return h;
  }

  it('asks once, at the end, whether that day should be their weekly day', async () => {
    const h = await extraDone();
    expect(h.thread().slice(-1)).toEqual([
      'gremly: One more thing. You planned this on a Wednesday. Want Wednesday to be your weekly day from now on?',
    ]);
    expect(rows['row-1'].answers.day_asked).toBe(true);
    // the thread is still the review's until that question is answered
    expect(h.deps.onEnded).not.toHaveBeenCalled();
    await h.tap('week_keep_day');
    expect(h.thread().slice(-2)).toEqual(['me: Keep Sunday', 'gremly: Sunday it stays.']);
    expect(saveWeeklyDay).not.toHaveBeenCalled();
    expect(moveWeekReview).not.toHaveBeenCalled();
    expect(h.deps.onEnded).toHaveBeenCalledTimes(1);
  });

  it('moves their weekly day when they say so, and the review counts as the new week’s', async () => {
    (intentionNote as jest.Mock).mockReturnValue({ id: 'note-1', views: { week_review: true } });
    const h = await extraDone();
    await h.tap('week_move_day');
    expect(saveWeeklyDay).toHaveBeenCalledWith('maya', 3);
    // Wednesday is now the weekly day: the week it plans starts on Thursday
    expect(moveWeekReview).toHaveBeenCalledWith('row-1', {
      week_start: THU,
      span_start: THU,
      kind: 'weekly',
    });
    // the week's intention goes with it
    expect(mockStore.updateNote).toHaveBeenCalledWith('note-1', {
      target_date: THU,
      views: { week_review: true, week_start: THU },
    });
    expect(useThisWeek.getState().weeklyDay).toBe(3);
    // the week they are in is now the one just planned, and it is done
    expect(useThisWeek.getState().review).toMatchObject({
      id: 'row-1',
      status: 'done',
      week_start: THU,
    });
    expect(h.thread().slice(-2)).toEqual([
      'me: Make it Wednesday',
      "gremly: Done. Your weekly review is on Wednesdays from now on, and this one counts as this week's.",
    ]);
    expect(h.deps.onEnded).toHaveBeenCalledTimes(1);
  });

  it('takes the thread’s cards with the review to the new week, so they stay its own', async () => {
    const h = await extraDone();
    await h.tap('week_move_day');
    const cards = h.state.messages.filter((m) => (m.metadata_json as any)?.type === 'week-card');
    expect(cards.length).toBeGreaterThan(1);
    for (const c of cards) expect((c.metadata_json as any).week_start).toBe(THU);
    const done = h.cardOf('done')!;
    expect(h.hook.result.current.isLive(done.metadata_json as any, done.id)).toBe(true);
  });

  it('says the day moved and the review stayed when the new week already has one', async () => {
    const h = await extraDone();
    (moveWeekReview as jest.Mock).mockResolvedValueOnce('taken');
    await h.tap('week_move_day');
    expect(useThisWeek.getState().weeklyDay).toBe(3);
    expect(rows['row-1'].week_start).toBe(WEEK_START);
    expect(mockStore.updateNote).not.toHaveBeenCalled();
    expect(h.thread().slice(-1)).toEqual([
      'gremly: Done. Your weekly review is on Wednesdays from now on. The week that starts tomorrow already has a review of its own, so this one stays with the week it was made for.',
    ]);
  });

  it('says the day moved when the review could not be counted for the new week', async () => {
    const h = await extraDone();
    (moveWeekReview as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await h.tap('week_move_day');
    // the day is saved, so it has moved, and Gremly does not say otherwise
    expect(saveWeeklyDay).toHaveBeenCalledWith('maya', 3);
    expect(useThisWeek.getState().weeklyDay).toBe(3);
    expect(rows['row-1'].week_start).toBe(WEEK_START);
    expect(h.thread().slice(-1)).toEqual([
      "gremly: Your weekly review is on Wednesdays from now on. I couldn't count this one as this week's just now, so it stays with the week it was made for.",
    ]);
  });

  it('says so when the review moved and its intention could not be brought across', async () => {
    (intentionNote as jest.Mock).mockImplementation((weekStart: string) =>
      weekStart === WEEK_START ? { id: 'note-1', views: {} } : null,
    );
    mockStore.updateNote = jest.fn(async () => {
      throw new Error('offline');
    });
    const h = await extraDone();
    await h.tap('week_move_day');
    expect(rows['row-1'].week_start).toBe(THU);
    expect(h.thread().slice(-2)).toEqual([
      "gremly: Done. Your weekly review is on Wednesdays from now on, and this one counts as this week's.",
      "gremly: I couldn't bring your intention across with it, so set it again if you want it kept.",
    ]);
  });

  it('says so when the weekly day could not be moved, and changes nothing', async () => {
    const h = await extraDone();
    (saveWeeklyDay as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await h.tap('week_move_day');
    expect(moveWeekReview).not.toHaveBeenCalled();
    expect(useThisWeek.getState().weeklyDay).toBe(0);
    expect(h.thread().slice(-1)[0]).toContain("couldn't move your weekly day");
  });
});

describe('when a step goes wrong', () => {
  it('says so in the thread when a step cannot be saved, and stays on it', async () => {
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().challenge.agree());
    (changeWeekReview as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await h.go(() => r().priorities.done());
    expect(h.thread().slice(-1)).toEqual([`gremly: ${WEEK_COPY.stepFailed}`]);
    expect(rows['row-1'].answers.step).toBe('priorities');
    expect(r().busy).toBe(false);
    // the card is still theirs to settle, and the second time it is
    await h.go(() => r().priorities.done());
    expect(rows['row-1'].answers.step).toBe('shape');
  });

  it('says so when the week cannot be read, and opens nothing on a guess at their weekly day', async () => {
    (getWeekSettings as jest.Mock).mockRejectedValue(new Error('offline'));
    const h = harness();
    await h.go((r) => r.open());
    expect(h.thread()).toEqual([`gremly: ${WEEK_COPY.openFailed}`]);
    expect(useWeekSession.getState().row).toBeNull();
    // opened from the Week button: the day's own offer was never answered, so it is still theirs
    expect(h.deps.onEnded).not.toHaveBeenCalled();
  });

  it('hands the thread back when a yes given elsewhere could not open the review', async () => {
    // Plan my week on the brief's offer: that offer is answered, and the week then cannot be read
    (getWeekSettings as jest.Mock).mockRejectedValue(new Error('offline'));
    const h = harness();
    await h.go((r) => r.startNow());
    expect(h.thread()).toEqual([`gremly: ${WEEK_COPY.openFailed}`]);
    // the brief carries on, so Plan my day comes back with Plan my week beside it
    expect(h.deps.onEnded).toHaveBeenCalledTimes(1);
  });

  it('keeps the thread when a review already under way fails to pick up', async () => {
    const h = await started();
    // something came after its card, and the card cannot be brought back
    await h.go((r) => r.takeTyped('One second'));
    h.deps.patchMessageMetadata.mockRejectedValueOnce(new Error('offline'));
    await h.go((r) => r.startNow());
    expect(h.thread().slice(-1)).toEqual([`gremly: ${WEEK_COPY.openFailed}`]);
    // the review is still theirs to carry on with: the brief stays out of its way
    expect(h.deps.onEnded).not.toHaveBeenCalled();
  });

  it('takes a milestone’s steps back when the review cannot be saved, so a second tap does not make them twice', async () => {
    const h = await started({ status: 'started', answers: { step: 'ahead' } });
    const r = () => h.hook.result.current;
    (changeWeekReview as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await h.go(() => r().ahead.setUp(ID.reports));
    expect(applyChange).toHaveBeenCalledTimes(1);
    expect(mockRevert).toHaveBeenCalledTimes(1);
    expect(rows['row-1'].answers.milestones ?? []).toEqual([]);
    expect(useWeekSession.getState().undoable).toEqual({});
    expect(h.thread().slice(-1)).toEqual([`gremly: ${WEEK_COPY.stepFailed}`]);
    // tapped again, they are made once and can be taken back
    await h.go(() => r().ahead.setUp(ID.reports));
    expect(applyChange).toHaveBeenCalledTimes(2);
    expect(rows['row-1'].answers.milestones).toHaveLength(1);
    expect(useWeekSession.getState().undoable).toEqual({ [`milestone:${ID.reports}`]: true });
  });

  it('puts the note away when they change their intention to none, so the week no longer has one', async () => {
    (intentionNote as jest.Mock).mockReturnValue({ id: 'note-1', body: 'Sleep before midnight' });
    mockStore.archiveNote = jest.fn(async () => {
      (intentionNote as jest.Mock).mockReturnValue(null);
    });
    const h = await started({
      status: 'started',
      answers: { step: 'ahead', intention: 'Sleep before midnight', intention_id: 'note-1' },
    });
    const r = () => h.hook.result.current;
    await h.go(() => r().edit('intention'));
    await h.go(() => r().intention.write(''));
    await h.go(() => r().intention.done());
    expect(mockStore.archiveNote).toHaveBeenCalledWith('note-1', expect.any(String));
    expect(applyChange).not.toHaveBeenCalled();
    expect(rows['row-1'].answers).toMatchObject({
      intention: null,
      intention_id: null,
      step: 'ahead',
    });
    // Gremly is no longer told the week has one
    expect(r().context()?.intention).toBeNull();
  });

  it('keeps the intention, and says so, when its note could not be put away', async () => {
    (intentionNote as jest.Mock).mockReturnValue({ id: 'note-1', body: 'Sleep before midnight' });
    // the store puts the note back when the save fails
    mockStore.archiveNote = jest.fn(async () => undefined);
    const h = await started({
      status: 'started',
      answers: { step: 'ahead', intention: 'Sleep before midnight', intention_id: 'note-1' },
    });
    const r = () => h.hook.result.current;
    await h.go(() => r().edit('intention'));
    await h.go(() => r().intention.write(''));
    await h.go(() => r().intention.done());
    expect(rows['row-1'].answers.intention).toBe('Sleep before midnight');
    expect(h.thread().slice(-1)).toEqual([`gremly: ${WEEK_COPY.stepFailed}`]);
  });
});

describe('with another chat on screen', () => {
  /** Let whatever the hook started run to its end. */
  const settle = (h: ReturnType<typeof harness>) =>
    act(async () => {
      h.hook.rerender({});
      for (let i = 0; i < 80; i++) await Promise.resolve();
    });

  it('keeps the review in hand when a second chat screen opens with no thread of its own', async () => {
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().challenge.agree());
    await h.go(() => r().priorities.toggle(2));
    // a chat about an item opens over the thread: it has no thread of its own
    const other = harness({ threadId: null });
    h.hook.rerender({});
    expect(useWeekSession.getState().threadId).toBe('t1');
    expect(r().underWay).toBe(true);
    const card = h.cardOf('priorities')!;
    expect(r().isLive(card.metadata_json as any, card.id)).toBe(true);
    expect(useWeekSession.getState().draft?.priorities).toEqual([2]);
    // and the other screen has nothing of the review's
    expect(other.hook.result.current.underWay).toBe(false);
    expect(other.hook.result.current.context()?.under_way).toBeUndefined();
  });

  it('adds nothing to another chat when the thread goes off screen during the read, and picks the review up when it is back', async () => {
    let finish: (v: unknown) => void = () => undefined;
    (callWeekRead as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const h = harness();
    await h.go((r) => r.open());
    await act(async () => {
      void h.hook.result.current.handleButton(h.last(), (h.last().metadata_json as any).buttons[0]);
      for (let i = 0; i < 30; i++) await Promise.resolve();
    });
    const before = h.state.messages.length;
    // they go to another chat while Gremly reads
    h.deps.threadId = null;
    h.hook.rerender({});
    rows['row-1'] = madeUpRow();
    await act(async () => {
      finish({
        ok: true,
        data: {
          made: true,
          on: {
            kind: 'weekly',
            promoted: true,
            fresh: false,
            week_start: WEEK_START,
            span_start: WEEK_START,
            span_end: '2026-10-11',
          },
          review: rows['row-1'],
        },
      });
      for (let i = 0; i < 80; i++) await Promise.resolve();
    });
    h.hook.rerender({});
    // the read is kept and the review started, and nothing went into the chat on screen
    expect(rows['row-1'].status).toBe('started');
    expect(h.state.messages).toHaveLength(before);
    expect(useWeekSession.getState().left).toBe(true);
    expect(h.hook.result.current.busy).toBe(false);
    // back in today's thread, the review is there, on the step it had reached
    h.deps.threadId = 't1';
    await settle(h);
    h.hook.rerender({});
    expect(h.thread().slice(before)).toEqual([`gremly: ${WEEK_COPY.resumed}`, '[challenge]']);
    expect(h.hook.result.current.underWay).toBe(true);
    expect(useWeekSession.getState().left).toBe(false);
  });

  it('waits for the thread’s own messages before it picks the review up', async () => {
    const h = await started();
    useWeekSession.setState({ left: true });
    const before = h.state.messages.length;
    (h.deps as any).ready = false;
    await settle(h);
    expect(h.state.messages).toHaveLength(before);
    expect(useWeekSession.getState().left).toBe(true);
    (h.deps as any).ready = true;
    await settle(h);
    expect(useWeekSession.getState().left).toBe(false);
  });

  it('leaves a button in an earlier day’s thread as it is', async () => {
    rows['row-1'] = madeUpRow();
    const h = harness();
    await h.go((r) => r.open());
    const before = h.state.messages.length;
    // the thread is no longer today's
    h.deps.threadId = null;
    h.hook.rerender({});
    await h.tap('week_start');
    expect(h.state.messages).toHaveLength(before);
    expect((h.state.messages[before - 1].metadata_json as any).chosen).toBeUndefined();
    expect(rows['row-1'].status).toBe('ready');
  });
});

describe('when the wrap up begins with a review left part way', () => {
  it('has the thread from then on: typed messages are not the review’s, and Carry on goes until it is opened again', async () => {
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().challenge.agree());
    await h.go(() => r().takeTyped('What does the boiler one cover?'));
    expect(r().canCarryOn).toBe(true);
    // the evening wrap up opens in the same thread
    await h.go(() =>
      h.deps.appendBriefMessage('assistant', 'How did today go?', {
        type: 'brief-text',
        part: 'evening',
        ids: [],
        wrap: true,
      }),
    );
    expect(r().underWay).toBe(false);
    expect(r().canCarryOn).toBe(false);
    expect(r().placeholder).toBeNull();
    let taken = true;
    await h.go(async () => {
      taken = await r().takeTyped('It went fine');
    });
    expect(taken).toBe(false);
    // Gremly is told about their week, and not that a review is under way here
    expect(r().context()?.under_way).toBeUndefined();
    expect(r().context()?.review).toMatchObject({ status: 'started' });
    // the Week button picks it up where it was, and it has the thread again
    await h.go(() => r().open());
    expect(h.last().metadata_json).toMatchObject({ type: 'week-card', card: 'priorities' });
    expect(r().underWay).toBe(true);
    expect(r().context()?.under_way).toMatchObject({ step: 'priorities' });
  });
});

describe('the week’s board', () => {
  const DAYS = [MON, TUE, WED, THU, '2026-10-09', SAT, NEXT_SUN];
  const TODOS = [
    {
      id: ID.marking,
      name: 'The Year 9 marking',
      time_estimate_minutes: 60,
      due_day: TUE,
      created_at: '2026-09-20T09:00:00Z',
    },
    {
      id: ID.boiler,
      name: 'Sort the boiler',
      time_estimate_minutes: 20,
      created_at: '2026-08-10T09:00:00Z',
    },
    {
      id: ID.fair,
      name: 'Bake for the fair',
      time_estimate_minutes: 30,
      created_at: '2026-09-28T09:00:00Z',
    },
  ];
  const HABITS = [
    {
      id: ID.swim,
      name: 'Swim',
      cadence: 'weekly',
      target_per_period: 2,
      time_estimate_minutes: 40,
    },
  ];
  /** Gremly's spread, made for the answers the row holds now unless a basis is given. */
  const spreadNow = (over: Record<string, unknown> = {}) => ({
    version: 'week-spread-test',
    made_at: '2026-10-04T19:45:00.000Z',
    made_on: SUN,
    model: 'gpt-6-luna',
    first: MON,
    last: NEXT_SUN,
    basis: spreadBasis(rows['row-1'].answers, rows['row-1'].read, DAYS, SUN),
    place: [{ id: ID.boiler, day: WED }],
    later: [{ id: ID.fair, back_on: '2026-10-13' }],
    habit_days: [{ id: ID.swim, days: [MON, SAT] }],
    notes: [],
    ...over,
  });
  const spreadComes = () =>
    (callWeekSpread as jest.Mock).mockImplementation(async () => ({
      ok: true,
      data: { on: useWeekSession.getState().on, spread: spreadNow() },
    }));
  /** Let a timer run out, and whatever it started run to its end. */
  async function tick(h: ReturnType<typeof harness>, ms = 0) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
      for (let i = 0; i < 60; i++) await Promise.resolve();
    });
    h.hook.rerender({});
  }
  /** A review that has reached the board, with Gremly's spread in. */
  async function onBoard(answers: Record<string, unknown> = {}) {
    mockStore.todos = TODOS.map((t) => ({ ...t }));
    mockStore.habits = HABITS;
    spreadComes();
    const h = await started({
      status: 'started',
      answers: {
        step: 'board',
        hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
        busy_days: [THU],
        intention: 'Fewer things, finished.',
        ...answers,
      },
    });
    await tick(h);
    return h;
  }

  beforeEach(() => {
    mockStore.todos = TODOS.map((t) => ({ ...t }));
    mockStore.habits = HABITS;
  });

  it('is spread by Gremly once the shape of the week is settled, and again a moment after their answers change', async () => {
    spreadComes();
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().challenge.agree());
    await h.go(() => r().priorities.done());
    await tick(h, 5000);
    // nothing to spread from yet: the week has no shape
    expect(callWeekSpread).not.toHaveBeenCalled();
    await h.go(() => r().shape.done());
    await tick(h);
    expect(callWeekSpread).toHaveBeenCalledTimes(1);
    expect((callWeekSpread as jest.Mock).mock.calls[0][0]).toEqual({
      date: SUN,
      board: { placed: [], later: [], habit_days: [] },
    });
    expect(useWeekSession.getState()).toMatchObject({ fitting: false, spreadFailed: false });
    expect(useWeekSession.getState().row?.spread?.place).toEqual([{ id: ID.boiler, day: WED }]);
    // it stands while what it was made from does
    await tick(h, 20000);
    expect(callWeekSpread).toHaveBeenCalledTimes(1);
    // Their intention is part of what the week is spread from. Ahead of the
    // board nobody is waiting on the spread, so it is asked for a little later.
    await h.go(() => r().intention.pick(1));
    await h.go(() => r().intention.done());
    expect(rows['row-1'].answers.intention).toBeTruthy();
    await tick(h, 5900);
    expect(callWeekSpread).toHaveBeenCalledTimes(1);
    await tick(h, 200);
    expect(callWeekSpread).toHaveBeenCalledTimes(2);
    // they change the hours, and then their mind: a run of changes is one ask
    await h.go(() => r().edit('shape'));
    await h.go(() => r().shape.stepHours('normal_day', 0.5));
    await h.go(() => r().shape.done());
    await tick(h, 3000);
    await h.go(() => r().edit('shape'));
    await h.go(() => r().shape.stepHours('normal_day', 0.5));
    await h.go(() => r().shape.done());
    await tick(h, 5900);
    expect(callWeekSpread).toHaveBeenCalledTimes(2);
    await tick(h, 200);
    expect(callWeekSpread).toHaveBeenCalledTimes(3);
  });

  it('says it is being fitted until the spread is in, and offers to try again when it does not come back', async () => {
    mockStore.habits = HABITS;
    let answer: (v: unknown) => void = () => undefined;
    (callWeekSpread as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const h = await started({ status: 'started', answers: { step: 'board' } });
    const r = () => h.hook.result.current;
    await tick(h);
    expect(useWeekSession.getState().fitting).toBe(true);
    await act(async () => {
      answer({ ok: false, error: 'the line went quiet' });
      for (let i = 0; i < 60; i++) await Promise.resolve();
    });
    expect(useWeekSession.getState()).toMatchObject({ fitting: false, spreadFailed: true });
    // not asked for again by itself
    await tick(h, 10000);
    expect(callWeekSpread).toHaveBeenCalledTimes(1);
    // Try again
    spreadComes();
    await h.go(async () => {
      r().board.retry();
      for (let i = 0; i < 60; i++) await Promise.resolve();
    });
    expect(callWeekSpread).toHaveBeenCalledTimes(2);
    expect(useWeekSession.getState()).toMatchObject({ fitting: false, spreadFailed: false });
    expect(useWeekSession.getState().row?.spread?.version).toBe('week-spread-test');
  });

  it('uses a spread that was kept on the week though the call for it failed', async () => {
    (callWeekSpread as jest.Mock).mockImplementation(async () => {
      // finished and kept after the phone stopped listening
      rows['row-1'] = { ...rows['row-1'], spread: spreadNow() };
      return { ok: false, error: 'timeout' };
    });
    const h = await started({ status: 'started', answers: { step: 'board' } });
    await tick(h);
    expect(useWeekSession.getState().spreadFailed).toBe(false);
    expect(useWeekSession.getState().row?.spread?.place).toEqual([{ id: ID.boiler, day: WED }]);
  });

  it('draws their moves at once and keeps them on the week a moment after the last', async () => {
    const h = await onBoard();
    const r = () => h.hook.result.current;
    await h.go(() => r().board.open());
    expect(useWeekSession.getState().boardOpen).toBe(true);
    await h.go(() => r().board.move(ID.boiler, '2026-10-09'));
    await h.go(() => r().board.toggleHabit(ID.swim, WED));
    expect(useWeekSession.getState().moves).toEqual({
      opened: true,
      placed: { [ID.boiler]: '2026-10-09' },
      later: {},
      habit_days: { [ID.swim]: [MON, WED, SAT] },
    });
    // nothing is written with each tap
    expect(rows['row-1'].answers.board).toBeUndefined();
    await tick(h, 1500);
    expect(rows['row-1'].answers.board).toEqual(useWeekSession.getState().moves);
    // a move to Later gives it a day to come back, and closing the board keeps it at once
    await h.go(() => r().board.move(ID.marking, 'later'));
    await h.go(async () => {
      r().board.close();
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });
    expect(useWeekSession.getState().boardOpen).toBe(false);
    expect(rows['row-1'].answers.board.later).toEqual({ [ID.marking]: '2026-10-12' });
    // no todo, habit day or plan is saved by any of it
    expect(saveBoard).not.toHaveBeenCalled();
    expect(rows['row-1'].status).toBe('started');
  });

  it('writes the whole week on Done, ends the review, and can take it all back', async () => {
    const h = await onBoard();
    const r = () => h.hook.result.current;
    await h.go(() => r().board.open());
    expect(h.deps.onEnded).not.toHaveBeenCalled();
    await h.go(() => r().board.done());
    // the review is over on their weekly day: the thread is told once, so the brief can carry on
    expect(h.deps.onEnded).toHaveBeenCalledTimes(1);
    // only what differs from what is saved: the marking is on its Tuesday already
    expect(saveBoard).toHaveBeenCalledWith({
      place: [{ id: ID.boiler, day: WED }],
      later: [{ id: ID.fair, backOn: '2026-10-13' }],
      habits: [{ id: ID.swim, add: [MON, SAT], remove: [] }],
    });
    expect(useWeekSession.getState().boardOpen).toBe(false);
    expect(rows['row-1']).toMatchObject({
      status: 'done',
      answers: { step: 'done', planned: { todos: 2, later: 1, habit_days: 2 } },
    });
    // where Gremly put things is kept too: his to place again another time
    expect(rows['row-1'].answers.planned.gremly).toEqual({ [ID.boiler]: WED });
    // the plan itself is kept with the week: each day's todos and habits, by id
    expect(Object.keys(rows['row-1'].answers.planned.days)).toEqual(DAYS);
    expect(rows['row-1'].answers.planned.days).toMatchObject({
      [MON]: { todos: [], habits: [ID.swim] },
      [TUE]: { todos: [ID.marking], habits: [] },
      [WED]: { todos: [ID.boiler], habits: [] },
      [SAT]: { todos: [], habits: [ID.swim] },
    });
    const board = h.cardOf('board')!.metadata_json as any;
    expect(board.settled).toBe('Week planned');
    // Gremly's line is kept as it read when the week was planned
    expect(board.intro).toContain(
      "So I've spread one todo across the days, around the one you'd already placed",
    );
    expect((h.cardOf('done')!.metadata_json as any).summary).toEqual({
      intention: 'Fewer things, finished.',
      tiles: [
        { num: '2', label: 'todos spread across the week' },
        { num: '2', label: 'habit sessions with a day' },
        { num: '0', label: "steps set up for what's coming" },
      ],
    });
    expect(useWeekSession.getState().undoable).toEqual({ board: true });
    expect(r().underWay).toBe(false);

    // Undo: everything written goes back, and the review is on the board again
    await h.go(() => r().board.undo());
    expect(mockBoardRevert).toHaveBeenCalledTimes(1);
    expect(rows['row-1']).toMatchObject({
      status: 'started',
      completed_at: null,
      answers: { step: 'board' },
    });
    expect(rows['row-1'].answers.planned).toBeUndefined();
    expect(useWeekSession.getState().undoable).toEqual({});
    expect(h.thread().slice(-2)).toEqual([`gremly: ${WEEK_COPY.boardUndone}`, '[board]']);
    // the summary of a week that is no longer planned is gone from the thread
    expect(h.thread()).not.toContain('[done]');
    expect(r().underWay).toBe(true);
    // and finished again, it is written again
    await h.go(() => r().board.done());
    expect(saveBoard).toHaveBeenCalledTimes(2);
    expect(rows['row-1'].status).toBe('done');
  });

  it('planned again, keeps what was planned for the days gone by, and Undo puts the earlier plan back', async () => {
    // a week planned once already: a day gone by, and one thing done since on a day still ahead
    const before = {
      todos: 9,
      later: 4,
      habit_days: 3,
      days: {
        '2026-10-03': { todos: ['gone-by'], habits: [ID.swim] },
        [WED]: { todos: ['done-since', ID.fair], habits: [] },
      },
    };
    const h = await onBoard({ planned: before });
    const r = () => h.hook.result.current;
    await h.go(() => r().board.done());
    const days = rows['row-1'].answers.planned.days;
    expect(days['2026-10-03']).toEqual(before.days['2026-10-03']);
    // what was planned for the day and is done stays; what is open is where the board has it
    expect(days[WED]).toEqual({ todos: ['done-since', ID.boiler], habits: [] });
    expect(rows['row-1'].answers.planned.todos).toBe(2);
    await h.go(() => r().board.undo());
    expect(rows['row-1'].answers.planned).toEqual(before);
    expect(useWeekSession.getState().plannedBefore).toBeNull();
  });

  it('leaves nothing written when part of the week cannot be saved, and says so', async () => {
    const h = await onBoard();
    const r = () => h.hook.result.current;
    (saveBoard as jest.Mock).mockResolvedValueOnce({
      todos: 1,
      later: 0,
      habitDays: 2,
      failed: 1,
      revert: mockBoardRevert,
    });
    await h.go(() => r().board.done());
    expect(mockBoardRevert).toHaveBeenCalledTimes(1);
    expect(rows['row-1']).toMatchObject({ status: 'started', answers: { step: 'board' } });
    expect(useWeekSession.getState().undoable).toEqual({});
    expect(h.thread().slice(-1)).toEqual([`gremly: ${WEEK_COPY.stepFailed}`]);
  });

  it('takes the week’s writes back when the review itself cannot be marked done', async () => {
    const h = await onBoard();
    const r = () => h.hook.result.current;
    (changeWeekReview as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await h.go(() => r().board.done());
    expect(saveBoard).toHaveBeenCalledTimes(1);
    expect(mockBoardRevert).toHaveBeenCalledTimes(1);
    expect(rows['row-1'].status).toBe('started');
    expect(h.thread().slice(-1)).toEqual([`gremly: ${WEEK_COPY.stepFailed}`]);
  });

  it('tells Gremly the board as it stands, and lets a card of his overtake a move of theirs', async () => {
    const h = await onBoard();
    const r = () => h.hook.result.current;
    expect(r().context()?.under_way).toMatchObject({
      step: 'board',
      placed: [
        { id: ID.marking, day: TUE },
        { id: ID.boiler, day: WED },
      ],
      later: [{ id: ID.fair, back_on: '2026-10-13' }],
      habit_days: [{ id: ID.swim, days: [MON, SAT] }],
    });
    await h.go(() => r().board.move(ID.boiler, '2026-10-09'));
    expect(r().context()?.under_way?.placed).toContainEqual({ id: ID.boiler, day: '2026-10-09' });
    // Gremly's card moves it to Thursday, and they accept: that is saved, and is their latest word
    mockStore.todos = mockStore.todos.map((t: any) =>
      t.id === ID.boiler ? { ...t, due_day: THU } : t,
    );
    await h.go(() =>
      r().onApplied([
        {
          cid: 'c1',
          op: 'change',
          type: 'todo',
          id: ID.boiler,
          title: 'Sort the boiler',
          fields: { day: THU },
        },
      ] as any),
    );
    expect(useWeekSession.getState().moves.placed).toEqual({});
    expect(r().context()?.under_way?.placed).toContainEqual({ id: ID.boiler, day: THU });
  });

  it('does nothing from the board’s buttons before the review has reached it', async () => {
    spreadComes();
    const h = await started();
    const r = () => h.hook.result.current;
    await h.go(() => r().board.open());
    await h.go(() => r().board.move(ID.boiler, WED));
    await h.go(() => r().board.done());
    expect(useWeekSession.getState()).toMatchObject({ boardOpen: false, moves: {} });
    expect(saveBoard).not.toHaveBeenCalled();
    expect(rows['row-1'].answers.step).toBe('challenge');
  });

  // ── the days they gave their todos themselves ──

  /** Five of their own todos on Wednesday, which has two hours: with the marking, six of theirs. */
  const OWN = Array.from({ length: 5 }, (_, i) => ({
    id: `own-${i}`,
    name: `Own ${i}`,
    time_estimate_minutes: 40,
    due_day: WED,
    created_at: '2026-09-20T09:00:00Z',
  }));
  /** Gremly's suggestions for Wednesday, made for the answers the row holds now. */
  const reliefNow = (days?: unknown[]) => ({
    version: 'week-relief-test',
    basis: reliefBasis(rows['row-1'].answers, rows['row-1'].read, DAYS, SUN),
    days: days ?? [
      {
        day: WED,
        over: 80,
        moves: [
          { id: 'own-0', to: THU, back_on: null },
          { id: 'own-1', to: null, back_on: '2026-10-13' },
        ],
        still: 0,
        note: '',
      },
    ],
  });
  /** A review on the board with their own todos on it, and the spread in with its suggestions. */
  async function onOwn(answers: Record<string, unknown> = {}, todos = [...TODOS, ...OWN]) {
    mockStore.todos = todos.map((t) => ({ ...t }));
    mockStore.habits = HABITS;
    (callWeekSpread as jest.Mock).mockImplementation(async () => ({
      ok: true,
      data: { on: useWeekSession.getState().on, spread: spreadNow({ relief: reliefNow() }) },
    }));
    const h = await started({
      status: 'started',
      answers: {
        step: 'board',
        hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
        busy_days: [THU],
        ...answers,
      },
    });
    await tick(h);
    return h;
  }

  it('keeps what they say of their own days, and spreads the week again when they hand them over', async () => {
    const h = await onOwn();
    const r = () => h.hook.result.current;
    expect(callWeekSpread).toHaveBeenCalledTimes(1);
    await h.go(() => r().board.keep('all'));
    expect(rows['row-1'].answers.keep).toBe('all');
    // kept is what the spread was already made for
    await tick(h, 5000);
    expect(callWeekSpread).toHaveBeenCalledTimes(1);
    // the question opened again, and answered the other way
    await h.go(() => r().board.askKeep());
    expect(useWeekSession.getState().asking).toBe(true);
    await h.go(() => r().board.keep('none'));
    expect(rows['row-1'].answers.keep).toBe('none');
    expect(useWeekSession.getState()).toMatchObject({ asking: false, picking: false });
    await tick(h, 1500);
    expect(callWeekSpread).toHaveBeenCalledTimes(2);
  });

  it('lets them free some with a pin, and keeps which on the week when they finish', async () => {
    const todos = [...TODOS, ...OWN.map((t, i) => (i === 4 ? { ...t, due_time: '09:00' } : t))];
    const h = await onOwn({}, todos);
    const r = () => h.hook.result.current;
    await h.go(() => r().board.keep('some'));
    expect(useWeekSession.getState().picking).toBe(true);
    await h.go(() => r().board.togglePin('own-0'));
    await h.go(() => r().board.togglePin('own-1'));
    await h.go(() => r().board.togglePin('own-1'));
    // a todo with a time of day stays on its day; so does anything that is not theirs
    await h.go(() => r().board.togglePin('own-4'));
    await h.go(() => r().board.togglePin(ID.boiler));
    expect(useWeekSession.getState().freedDraft).toEqual(['own-0']);
    // nothing is kept on the week, or spread again, until they finish picking
    expect(rows['row-1'].answers).toMatchObject({ keep: 'some', freed: [] });
    await h.go(() => r().board.keepDone());
    expect(rows['row-1'].answers).toMatchObject({ keep: 'some', freed: ['own-0'] });
    expect(useWeekSession.getState().picking).toBe(false);
    await tick(h, 1500);
    expect(callWeekSpread).toHaveBeenCalledTimes(2);
  });

  it('takes Gremly’s suggested moves for an over-full day as their own, then spreads the week around them', async () => {
    const h = await onOwn({ keep: 'all' });
    const r = () => h.hook.result.current;
    await h.go(() => r().board.relieve(WED, 'moved'));
    expect(useWeekSession.getState().moves).toMatchObject({
      placed: { 'own-0': THU },
      later: { 'own-1': '2026-10-13' },
    });
    expect(rows['row-1'].answers).toMatchObject({
      relieved: { [WED]: 'moved' },
      board: { placed: { 'own-0': THU }, later: { 'own-1': '2026-10-13' } },
    });
    // nothing of it is saved to the todos: the board is written on Done
    expect(saveBoard).not.toHaveBeenCalled();
    await tick(h, 1500);
    expect(callWeekSpread).toHaveBeenCalledTimes(2);
    expect((callWeekSpread as jest.Mock).mock.calls[1][0].board.placed).toContainEqual({
      id: 'own-0',
      day: THU,
    });
  });

  it('goes through their over-full days before spreading again, and leaves one alone when told to', async () => {
    // Tuesday is over too: the marking and two more of theirs
    const more = [5, 6].map((i) => ({ ...OWN[0], id: `own-${i}`, name: `Own ${i}`, due_day: TUE }));
    const h = await onOwn({ keep: 'all' }, [...TODOS, ...OWN, ...more]);
    const r = () => h.hook.result.current;
    rows['row-1'].spread = spreadNow({
      relief: reliefNow([
        {
          day: TUE,
          over: 20,
          moves: [{ id: 'own-5', to: MON, back_on: null }],
          still: 0,
          note: '',
        },
        { day: WED, over: 80, moves: [], still: 80, note: '' },
      ]),
    });
    useWeekSession.setState({ row: { ...rows['row-1'] } });
    await h.go(() => r().board.relieve(TUE, 'moved'));
    expect(rows['row-1'].answers.relieved).toEqual({ [TUE]: 'moved' });
    // Wednesday is still to be looked at: the suggestions in hand stay
    await tick(h, 5000);
    expect(callWeekSpread).toHaveBeenCalledTimes(1);
    await h.go(() => r().board.relieve(WED, 'left'));
    expect(rows['row-1'].answers.relieved).toEqual({ [TUE]: 'moved', [WED]: 'left' });
    // nothing was taken for Wednesday, so nothing of it moved
    expect(useWeekSession.getState().moves.placed).toEqual({ 'own-5': MON });
    await tick(h, 1500);
    expect(callWeekSpread).toHaveBeenCalledTimes(2);
  });

  it('opens the board on an over-full day to change it by hand, and counts it dealt with on the way back', async () => {
    const h = await onOwn({ keep: 'all' });
    const r = () => h.hook.result.current;
    await h.go(() => r().board.relieve(WED, 'changed'));
    expect(useWeekSession.getState()).toMatchObject({
      boardOpen: true,
      boardDay: WED,
      relieving: WED,
    });
    expect(rows['row-1'].answers.relieved).toBeUndefined();
    await h.go(() => r().board.move('own-0', SAT));
    await h.go(async () => {
      r().board.close();
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });
    expect(useWeekSession.getState()).toMatchObject({ boardOpen: false, relieving: null });
    expect(rows['row-1'].answers).toMatchObject({
      relieved: { [WED]: 'changed' },
      board: { placed: { 'own-0': SAT } },
    });
  });

  it('takes nothing when the suggestions in hand were made for other answers', async () => {
    const h = await onOwn({ keep: 'all' });
    const r = () => h.hook.result.current;
    // suggestions made for other answers are not theirs to take
    rows['row-1'].spread = spreadNow({ relief: { ...reliefNow(), basis: 'another' } });
    // read with the week's row, not asked for in this sitting: it says for itself what it was made for
    useWeekSession.setState({ row: { ...rows['row-1'] }, spreadFor: null, reliefFor: null });
    await h.go(() => r().board.relieve(WED, 'moved'));
    expect(rows['row-1'].answers.relieved).toBeUndefined();
    expect(useWeekSession.getState().moves.placed ?? {}).toEqual({});
  });

  // ── what the board was fitted for, and finishing it ──

  it('does not finish the board while the spread for these answers is still on its way', async () => {
    const h = await onBoard();
    const r = () => h.hook.result.current;
    useWeekSession.setState({ fitting: true });
    await h.go(() => r().board.done());
    expect(saveBoard).not.toHaveBeenCalled();
    // made for other answers than the review's are now: about to be made again
    useWeekSession.setState({ fitting: false, spreadFor: 'other answers' });
    await h.go(() => r().board.done());
    expect(saveBoard).not.toHaveBeenCalled();
    expect(rows['row-1'].status).toBe('started');
    // one that did not come back leaves the board theirs to finish by hand
    useWeekSession.setState({ spreadFailed: true });
    await h.go(() => r().board.done());
    expect(saveBoard).toHaveBeenCalledTimes(1);
    expect(rows['row-1'].status).toBe('done');
  });

  it('takes a spread it asked for as made for the answers it asked with, however the worker words them', async () => {
    mockStore.todos = TODOS.map((t) => ({ ...t }));
    (callWeekSpread as jest.Mock).mockImplementation(async () => ({
      ok: true,
      data: {
        on: useWeekSession.getState().on,
        spread: spreadNow({ basis: 'worded another way' }),
      },
    }));
    const h = await started({ status: 'started', answers: { step: 'board' } });
    const r = () => h.hook.result.current;
    await tick(h);
    await tick(h, 20000);
    // asked once: it is not taken for out of date, and asked for again and again
    expect(callWeekSpread).toHaveBeenCalledTimes(1);
    expect(useWeekSession.getState().spreadFor).toBe(
      spreadBasis(rows['row-1'].answers, rows['row-1'].read, DAYS, SUN),
    );
    await h.go(() => r().board.done());
    expect(saveBoard).toHaveBeenCalledTimes(1);
  });

  it('says the spread failed when asking for it throws, and forgets that once one for these answers is in hand', async () => {
    (callWeekSpread as jest.Mock).mockRejectedValue(new Error('no network'));
    const h = await started({ status: 'started', answers: { step: 'board' } });
    await tick(h);
    expect(useWeekSession.getState()).toMatchObject({ fitting: false, spreadFailed: true });
    // the week's row read again, with a spread made for these answers on it
    rows['row-1'] = { ...rows['row-1'], spread: spreadNow() };
    await act(async () => {
      useWeekSession.setState({ row: { ...rows['row-1'] } });
    });
    await tick(h);
    expect(useWeekSession.getState().spreadFailed).toBe(false);
    expect(callWeekSpread).toHaveBeenCalledTimes(1);
  });

  it('spreads the week again when a card changes one of their items, or its changes are taken back', async () => {
    const h = await onBoard();
    const r = () => h.hook.result.current;
    expect(callWeekSpread).toHaveBeenCalledTimes(1);
    const card = [
      { cid: 'c1', op: 'later', type: 'todo', id: ID.boiler, title: 'Sort the boiler' },
    ] as any;
    await h.go(() => r().onApplied(card));
    expect(rows['row-1'].answers.touched).toBe(1);
    await tick(h, 1500);
    expect(callWeekSpread).toHaveBeenCalledTimes(2);
    await h.go(() => r().onUndone());
    expect(rows['row-1'].answers.touched).toBe(2);
    await tick(h, 1500);
    expect(callWeekSpread).toHaveBeenCalledTimes(3);
    // a change to the week's own answers says so for itself
    await h.go(() =>
      r().onApplied([{ cid: 'c2', op: 'week_shape', type: null, id: null, title: '' }] as any),
    );
    expect(rows['row-1'].answers.touched).toBe(2);
  });

  it('puts the row back first on Undo, and leaves the week planned when not all of it can be taken back', async () => {
    const h = await onBoard();
    const r = () => h.hook.result.current;
    await h.go(() => r().board.done());
    mockBoardRevert.mockRejectedValueOnce(new Error('offline'));
    await h.go(() => r().board.undo());
    // still planned, with its plan, and the Undo kept for another try
    expect(rows['row-1']).toMatchObject({ status: 'done', answers: { step: 'done' } });
    expect(rows['row-1'].completed_at).toBeTruthy();
    expect(rows['row-1'].answers.planned).toMatchObject({ todos: 2 });
    expect(useWeekSession.getState().undoable).toEqual({ board: true });
    expect(h.thread().slice(-1)).toEqual([`gremly: ${WEEK_COPY.boardUndoFailed}`]);
    // when the row cannot say the week is back on the board, nothing is taken back at all
    (changeWeekReview as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await h.go(() => r().board.undo());
    expect(mockBoardRevert).toHaveBeenCalledTimes(1);
    expect(rows['row-1'].status).toBe('done');
    expect(useWeekSession.getState().undoable).toEqual({ board: true });
    // tried again, it all goes back
    await h.go(() => r().board.undo());
    expect(mockBoardRevert).toHaveBeenCalledTimes(2);
    expect(rows['row-1']).toMatchObject({ status: 'started', answers: { step: 'board' } });
  });

  it('lets the Undo of a saved board go when the week is planned again', async () => {
    const h = await onBoard();
    const r = () => h.hook.result.current;
    await h.go(() => r().board.done());
    expect(useWeekSession.getState().undoable).toEqual({ board: true });
    at(7, 12, 30); // Wednesday: the rest of the week can be planned again
    await h.go(() => r().open());
    (callWeekRead as jest.Mock).mockImplementation(async () => {
      rows['row-1'] = { ...rows['row-1'], kind: 'extra', span_start: WED };
      return {
        ok: true,
        data: { made: true, on: useWeekSession.getState().on, review: rows['row-1'] },
      };
    });
    await h.tap('week_start');
    expect(rows['row-1']).toMatchObject({ status: 'started', answers: { step: 'challenge' } });
    // that Undo would put back the week as it was before the board now being planned over
    expect(useWeekSession.getState().undoable).toEqual({});
    expect(useWeekSession.getState().plannedBefore).toBeNull();
    await h.go(() => r().board.undo());
    expect(mockBoardRevert).not.toHaveBeenCalled();
  });

  it('leaves an over-full day’s card as it was when they come back from the board with nothing moved', async () => {
    const h = await onOwn({ keep: 'all' });
    const r = () => h.hook.result.current;
    await h.go(() => r().board.relieve(WED, 'changed'));
    await h.go(async () => {
      r().board.close();
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });
    expect(useWeekSession.getState()).toMatchObject({ boardOpen: false, relieving: null });
    expect(rows['row-1'].answers.relieved).toBeUndefined();
  });

  it('moves nothing when a suggestion taken cannot be kept on the week', async () => {
    const h = await onOwn({ keep: 'all' });
    const r = () => h.hook.result.current;
    (changeWeekReview as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await h.go(() => r().board.relieve(WED, 'moved'));
    expect(useWeekSession.getState().moves.placed ?? {}).toEqual({});
    expect(rows['row-1'].answers.relieved).toBeUndefined();
    expect(h.thread().slice(-1)).toEqual([`gremly: ${WEEK_COPY.stepFailed}`]);
  });

  it('starts their own days afresh when the question is answered again: what was moved off them goes back', async () => {
    const h = await onOwn({ keep: 'all' });
    const r = () => h.hook.result.current;
    await h.go(() => r().board.relieve(WED, 'moved'));
    // and a move of something that was never on a day of theirs
    await h.go(() => r().board.move(ID.fair, SAT));
    expect(useWeekSession.getState().moves.placed).toEqual({ 'own-0': THU, [ID.fair]: SAT });
    await h.go(() => r().board.askKeep());
    await h.go(() => r().board.keep('none'));
    expect(useWeekSession.getState().moves).toMatchObject({
      placed: { [ID.fair]: SAT },
      later: {},
    });
    expect(rows['row-1'].answers).toMatchObject({
      keep: 'none',
      board: { placed: { [ID.fair]: SAT }, later: {} },
    });
    expect(rows['row-1'].answers.relieved).toBeUndefined();
  });

  it('keeps their moves on the board when the question is answered for the first time', async () => {
    const h = await onOwn();
    const r = () => h.hook.result.current;
    await h.go(() => r().board.move('own-0', SAT));
    await h.go(() => r().board.keep('all'));
    expect(useWeekSession.getState().moves.placed).toEqual({ 'own-0': SAT });
    expect(rows['row-1'].answers.board.placed).toEqual({ 'own-0': SAT });
  });
});

describe('what Gremly is told with each message', () => {
  it('is nothing until their week has been read, so nothing untrue is sent', () => {
    const h = harness();
    expect(h.hook.result.current.context()).toBeNull();
    expect(chatWeekContext()).toBeNull();
  });

  it('is their week without a review until one is under way in this thread', async () => {
    rows['row-1'] = madeUpRow();
    const h = harness();
    await h.go((r) => r.open());
    const ctx = h.hook.result.current.context();
    expect(ctx).toMatchObject({
      weekly_day: 0,
      days_off: [0, 6],
      review: { week_start: WEEK_START, status: 'ready', kind: 'weekly' },
      extra_used: false,
    });
    expect(ctx?.under_way).toBeUndefined();
    // Ask Gremly gets the same, and never a review under way
    expect(chatWeekContext()).toEqual(ctx);
  });

  it('carries the review once it is under way, and says it is finished once it is', async () => {
    const h = await started();
    expect(h.hook.result.current.context()?.under_way).toMatchObject({
      step: 'challenge',
      first: MON,
      last: '2026-10-11',
    });
    expect(chatWeekContext()?.under_way).toBeUndefined();
    await h.go((r) => r.justPlan());
    expect(h.hook.result.current.context()?.under_way?.step).toBe('board');
    await finishBoard(h);
    expect(h.hook.result.current.context()?.under_way?.step).toBe('done');
  });
});
