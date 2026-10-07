/**
 * The evening wrap up in today's thread (lib/wrapup/useWrapUp): every path of
 * the approved prototype, from Gremly opening on the day to good night.
 */
import { renderHook, act } from '@testing-library/react-native';
import type { SpaceChatMessage } from '../../types';
import type { BriefOfferMeta, OfferButton, WrapUpState } from '../../brief/types';

const mockState: Record<string, any> = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
}));
let mockCards: { candidate: { id: string; kind: string } }[] = [];
jest.mock('../../store/selectors', () => ({
  WEEKLY_SKIP_BUDGET: 3,
  selectWrapUp: () => ({ cards: mockCards }),
}));
const mockMascot = jest.fn();
jest.mock('../../store/useMascotStore', () => ({
  useMascotStore: { getState: () => ({ requestMode: mockMascot }) },
}));
jest.mock('../../repo/dailyThreadRepo', () => ({ patchDailyThreadMeta: jest.fn() }));
// their week as the app holds it: not read yet unless a test says so
const mockWeek: Record<string, unknown> = { loaded: false, weeklyDay: 0, review: null };
jest.mock('../../week/thisWeek', () => ({ useThisWeek: { getState: () => mockWeek } }));
jest.mock('../../brief/todayThread', () => ({
  useTodayThread: { getState: () => ({ patchMeta: jest.fn(), thread: null }) },
}));
jest.mock('../../brief/feeding', () => ({
  withFeedAnimation: (credit: () => Promise<unknown>) => credit(),
}));
jest.mock('../../brief/dcoRefresh', () => ({ scheduleDcoRefresh: jest.fn() }));
const mockApplyDecision = jest.fn();
jest.mock('../../changes/sweep', () => ({
  applySweepDecision: (...a: unknown[]) => mockApplyDecision(...a),
}));
const mockApplyChange = jest.fn();
jest.mock('../../changes/apply', () => ({
  applyChange: (...a: unknown[]) => mockApplyChange(...a),
}));
jest.mock('../../changes/model', () => ({
  ...jest.requireActual('../../changes/model'),
  checkChange: (raw: unknown) => ({ ok: true, change: raw }),
}));
jest.mock('../../changes/snapshot', () => ({ contextFor: () => ({}) }));
const mockMeetings = jest.fn();
jest.mock('../../plan/storePlan', () => ({
  meetingsFromStore: (day: string) => mockMeetings(day),
}));
const mockAnswer = jest.fn();
const mockAsked = jest.fn();
jest.mock('../../story/storyApi', () => ({
  answerQuestion: (...a: unknown[]) => mockAnswer(...a),
  markQuestionAsked: (...a: unknown[]) => mockAsked(...a),
}));
const mockInsert = jest.fn();
const mockUpsert = jest.fn();
jest.mock('../../supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: unknown) => mockInsert(table, row),
      upsert: (rows: unknown, opts: unknown) => mockUpsert(table, rows, opts),
    }),
  },
}));
const mockCompleted = jest.fn();
jest.mock('../../sweep/engine', () => ({
  markSweepCompleted: (...a: unknown[]) => mockCompleted(...a),
}));
const mockSaveJournal = jest.fn();
const mockUpdateJournal = jest.fn();
const mockSetMoods = jest.fn();
let mockJournalNote: string | null = null;
jest.mock('../journal', () => ({
  saveJournal: (...a: unknown[]) => mockSaveJournal(...a),
  updateJournal: (...a: unknown[]) => mockUpdateJournal(...a),
  setJournalMoods: (...a: unknown[]) => mockSetMoods(...a),
  journalFor: () => mockJournalNote,
  journalTitle: (weekday: string, written: boolean) =>
    written ? `${weekday} evening` : 'Evening reflection',
}));
// Gremly's own words: none unless a test gives them, so the fixed lines are said
const mockWrapWords = jest.fn();
jest.mock('../../cortex/CortexClient', () => ({
  callWrapWords: (...a: unknown[]) => mockWrapWords(...a),
}));
const mockFetchQuestions = jest.fn();
jest.mock('../questions', () => ({
  ...jest.requireActual('../questions'),
  fetchWrapQuestions: () => mockFetchQuestions(),
}));
// a milestone's check ins that are due tonight (lib/wrapup/checkIns.ts): none unless a test says so
const mockFetchCheckIns = jest.fn();
const mockAnswerCheckIn = jest.fn();
const mockSkipCheckIn = jest.fn();
jest.mock('../checkIns', () => ({
  ...jest.requireActual('../checkIns'),
  fetchCheckInQuestions: (day: string) => mockFetchCheckIns(day),
  answerCheckIn: (...a: unknown[]) => mockAnswerCheckIn(...a),
  skipCheckIn: (...a: unknown[]) => mockSkipCheckIn(...a),
}));
// when the wrap up was last touched: in the evening, unless a test says earlier
let mockTouchedTonight = true;
jest.mock('../teaser', () => ({
  touchedTonight: () => mockTouchedTonight,
}));
let mockLate = false;
// before the evening: the wrap up started at 2pm
let mockEarly = false;
jest.mock('../day', () => ({
  wrapNow: () => ({
    day: '2026-09-30',
    tomorrow: '2026-10-01',
    words: {
      weekday: 'Wednesday',
      tomorrow: mockLate ? 'Thursday' : 'tomorrow',
      late: mockLate,
      early: mockEarly,
    },
    evening: !mockEarly,
    part: mockEarly ? 'afternoon' : 'evening',
    dayEndHour: 3,
    dayStartMs: Date.parse('2026-09-30T10:00:00Z'),
  }),
}));

import { useWrapUp } from '../useWrapUp';
import { currentWrap, resetWrapSession, useWrapSession, recordDecision } from '../session';
import { WRAP_COPY } from '../words';
import { checkInQuestion } from '../checkIns';
import { newPage, setCardHtml, toLayout } from '../../journal/page';
import { pageById } from '../../journal/pages';
import { draftKey, keepDraft, useJournalSession } from '../../journal/session';

const DAY = '2026-09-30';
const TOMORROW = '2026-10-01';

let seq = 0;
function msg(role: string, content: string, meta: Record<string, unknown>): SpaceChatMessage {
  seq += 1;
  return {
    id: `m${seq}`,
    chat_id: 't1',
    role,
    content,
    metadata_json: meta,
  } as unknown as SpaceChatMessage;
}

/** The hook over a thread that grows as it adds to it, as the screen's does. */
function setup(extra: Record<string, unknown> = {}, saved: WrapUpState | null = null) {
  let messages: SpaceChatMessage[] = (extra.messages as SpaceChatMessage[]) ?? [];
  const calls = {
    openCards: jest.fn(),
    planWeek: jest.fn(),
    seeWeek: jest.fn(),
    planDay: jest.fn(),
    onPaywall: jest.fn(),
    restoreDraft: jest.fn(),
  };
  const build = () => ({
    threadId: 't1',
    saved,
    pauseMs: 0,
    canCreate: true,
    ...calls,
    ...extra,
    // the thread as it is now, not as it was handed in
    messages,
    appendBriefMessage: async (role: string, content: string, meta: Record<string, unknown>) => {
      const m = msg(role, content, meta);
      messages = [...messages, m];
      hook.rerender(build());
      return m;
    },
    patchMessageMetadata: async (id: string, patch: Record<string, unknown>) => {
      messages = messages.map((m) =>
        m.id === id
          ? ({
              ...m,
              metadata_json: { ...(m.metadata_json as object), ...patch },
            } as SpaceChatMessage)
          : m,
      );
      hook.rerender(build());
    },
  });
  const hook = renderHook((props: any) => useWrapUp(props), { initialProps: build() });
  return {
    hook,
    calls,
    get messages() {
      return messages;
    },
    /** What was said, in order: [type, content] */
    said: () => messages.map((m) => [(m.metadata_json as any).type, m.content]),
    last: () => messages[messages.length - 1],
    /** The newest offer and one of its buttons */
    button: (action: string): [SpaceChatMessage, OfferButton] => {
      for (let i = messages.length - 1; i >= 0; i--) {
        const meta = messages[i].metadata_json as unknown as BriefOfferMeta;
        if (meta.type !== 'brief-offer') continue;
        const b = meta.buttons.find((x) => x.action === action);
        if (b) return [messages[i], b];
      }
      throw new Error(`no ${action} button`);
    },
    card: (type: string) => {
      const found = [...messages].reverse().find((m) => (m.metadata_json as any).type === type);
      if (!found) throw new Error(`no ${type}`);
      return found;
    },
  };
}

function record(id: string, out: 'kept' | 'let_go' | 'left' = 'kept', more = {}) {
  return {
    cid: `c-${id}`,
    op: 'keep' as const,
    type: 'todo' as const,
    id,
    title: `Todo ${id}`,
    out,
    label: 'Kept',
    at: '2026-09-30T20:41:00.000Z',
    ...more,
  };
}
const card = (id: string, kind = 'todo') => ({ candidate: { id, kind } });

beforeEach(() => {
  jest.clearAllMocks();
  resetWrapSession();
  Object.assign(mockWeek, { loaded: false, weeklyDay: 0, review: null });
  useJournalSession.setState({ open: null, drafts: {}, lastPage: 'free' });
  seq = 0;
  mockLate = false;
  mockEarly = false;
  mockTouchedTonight = true;
  mockCards = [card('a'), card('b'), card('n', 'note')];
  mockJournalNote = null;
  Object.keys(mockState).forEach((k) => delete mockState[k]);
  Object.assign(mockState, {
    userId: 'u1',
    userName: 'Sam Lee',
    todos: [],
    habits: [],
    habitProgress: [],
    notes: [],
    skipsUsedLast7Days: 0,
    totalSweepCount: 4,
    isFedToday: false,
    refreshSkipBudget: jest.fn().mockResolvedValue(undefined),
    addGaugeContribution: jest.fn().mockResolvedValue({ newValue: 0.5, justFed: false }),
    setSweepPreferences: jest.fn(),
  });
  mockMeetings.mockReturnValue([]);
  mockWrapWords.mockResolvedValue(null);
  mockCompleted.mockResolvedValue({ streak: 5 });
  mockInsert.mockResolvedValue({ error: null });
  mockUpsert.mockResolvedValue({ error: null });
  mockFetchQuestions.mockResolvedValue([]);
  mockFetchCheckIns.mockResolvedValue([]);
  mockAnswerCheckIn.mockResolvedValue(true);
  mockSkipCheckIn.mockResolvedValue(undefined);
  mockAnswer.mockResolvedValue(true);
  mockAsked.mockResolvedValue(undefined);
  mockApplyChange.mockResolvedValue({ ok: true, cid: 'x', summary: '', revert: jest.fn() });
  mockApplyDecision.mockImplementation(async (d: { candidateId: string }) => ({
    ok: true,
    record: record(d.candidateId),
    revert: jest.fn().mockResolvedValue(undefined),
  }));
  mockSaveJournal.mockResolvedValue({
    ok: true,
    noteId: 'note-1',
    title: 'Wednesday evening',
    revert: jest.fn().mockResolvedValue(undefined),
    moods: Promise.resolve(null),
  });
});

const types = (t: ReturnType<typeof setup>) => t.messages.map((m) => (m.metadata_json as any).type);

describe('the wrap up: opening', () => {
  it('opens on the day and offers the cards', async () => {
    mockMeetings.mockReturnValue([{}, {}]);
    const t = setup();
    await act(() => t.hook.result.current.open());
    expect(types(t)).toEqual(['brief-event', 'brief-text', 'sweep-recap', 'brief-offer']);
    expect(t.messages[1].content).toBe("Evening, Sam. Here's your Wednesday.");
    expect((t.messages[2].metadata_json as any).counts.meetings).toBe(2);
    const offer = t.last().metadata_json as unknown as BriefOfferMeta;
    expect(t.last().content).toBe(
      'Three things to sort tonight, about a minute. Want to go through them?',
    );
    expect(offer.buttons.map((b) => b.action)).toEqual(['sweep', 'sweep_skip', 'not_tonight']);
    expect(currentWrap()).toMatchObject({ step: 'offer', items: ['a', 'b', 'n'], path: null });
    expect(mockMascot).toHaveBeenCalledWith('waving');
    // every message belongs to the evening
    expect(t.messages.every((m) => (m.metadata_json as any).wrap === true)).toBe(true);
    // nothing is settled until the cards are
    expect(mockCompleted).not.toHaveBeenCalled();
  });

  it('says what was planned and did not happen', async () => {
    mockState.todos = [{ id: 'p1', name: 'Book the car service' }];
    const plan = msg('system', '', {
      type: 'brief-plan',
      status: 'locked',
      date: DAY,
      items: [{ id: 'p1', kind: 'todo', title: 'Book the car service', start: 900, end: 915 }],
    });
    const t = setup({ messages: [plan] });
    await act(() => t.hook.result.current.open());
    expect(t.messages.map((m) => m.content)).toContain(
      "One thing you planned didn't happen: Book the car service.",
    );
  });

  it('goes straight on when there is nothing to sort, and the Sweep still counts', async () => {
    mockCards = [];
    const t = setup();
    await act(() => t.hook.result.current.open());
    // no offer and no habits: the journal is asked
    expect(types(t)).toEqual([
      'brief-event',
      'brief-text',
      'sweep-recap',
      'brief-text',
      'brief-offer',
    ]);
    expect(t.messages[3].content).toBe('Nothing to sort tonight.');
    expect(t.last().content).toBe(WRAP_COPY.journalAsk);
    expect(currentWrap()).toMatchObject({ step: 'journal', path: 'clear' });
    expect(mockCompleted).toHaveBeenCalledTimes(1);
    expect(mockState.setSweepPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ sweepStreak: 5, totalSweepCount: 5 }),
    );
  });

  it('leaves out moving it all on when the weekly skips are used', async () => {
    mockState.skipsUsedLast7Days = 3;
    const t = setup();
    await act(() => t.hook.result.current.open());
    const offer = t.last().metadata_json as unknown as BriefOfferMeta;
    expect(offer.buttons.map((b) => b.action)).toEqual(['sweep', 'not_tonight']);
    expect(offer.hint).toBeUndefined();
  });

  it('opening again adds nothing while the offer is waiting', async () => {
    const t = setup();
    await act(() => t.hook.result.current.open());
    const n = t.messages.length;
    await act(() => t.hook.result.current.open());
    expect(t.messages).toHaveLength(n);
  });
});

describe('the wrap up: the cards', () => {
  async function atOffer() {
    const t = setup();
    await act(() => t.hook.result.current.open());
    return t;
  }
  async function sweepNow(t: ReturnType<typeof setup>) {
    await act(() => t.hook.result.current.handleButton(...t.button('sweep')));
  }

  it('Sweep now shows the tap and opens the cards', async () => {
    const t = await atOffer();
    await sweepNow(t);
    expect(t.last()).toMatchObject({ role: 'user', content: 'Sweep now' });
    expect(t.calls.openCards).toHaveBeenCalledTimes(1);
    expect(currentWrap()?.step).toBe('cards');
  });

  it('back with every card sorted: the receipt, feeding, the Sweep marked done, then what is next', async () => {
    const t = await atOffer();
    await sweepNow(t);
    act(() => {
      recordDecision(record('a'), jest.fn());
      recordDecision(record('b', 'let_go'), jest.fn());
      recordDecision(record('n'), jest.fn());
    });
    await act(() => t.hook.result.current.backFromCards());
    expect(types(t).slice(-3)).toEqual(['sweep-receipt', 'brief-text', 'brief-offer']);
    expect(t.messages[t.messages.length - 2].content).toBe(
      "All sorted. One let go, and that's fine.",
    );
    // three cards sorted feed what the old Sweep gave for three
    expect(mockState.addGaugeContribution).toHaveBeenCalledWith('sweep', expect.any(Number));
    expect(mockState.addGaugeContribution.mock.calls[0][1]).toBeCloseTo(0.26 + (2 / 6) * 0.19, 5);
    expect(mockCompleted).toHaveBeenCalledWith('u1', expect.anything(), { kept: 2, cleared: 1 });
    expect(currentWrap()).toMatchObject({ path: 'cards', credited: 3, step: 'journal' });
  });

  it('back part way: what is saved, and finish or leave', async () => {
    const t = await atOffer();
    await sweepNow(t);
    act(() => recordDecision(record('a'), jest.fn()));
    await act(() => t.hook.result.current.backFromCards());
    expect(types(t).slice(-2)).toEqual(['sweep-receipt', 'brief-offer']);
    expect(t.last().content).toBe(
      'One sorted and saved. Want to finish the last two, or leave them for tomorrow?',
    );
    expect(currentWrap()?.step).toBe('partial');
    expect(mockCompleted).not.toHaveBeenCalled();

    // Finish them: the cards again
    await act(() => t.hook.result.current.handleButton(...t.button('sweep')));
    expect(t.calls.openCards).toHaveBeenCalledTimes(2);
  });

  it('keeps one receipt in the thread: the earlier one is put away', async () => {
    const t = await atOffer();
    await sweepNow(t);
    act(() => recordDecision(record('a'), jest.fn()));
    await act(() => t.hook.result.current.backFromCards());
    await act(() => t.hook.result.current.handleButton(...t.button('sweep')));
    act(() => recordDecision(record('b'), jest.fn()));
    await act(() => t.hook.result.current.backFromCards());
    const receipts = t.messages.filter((m) => (m.metadata_json as any).type === 'sweep-receipt');
    expect(receipts.map((m) => !!(m.metadata_json as any).superseded)).toEqual([true, false]);
    // feeding is credited for the cards since the last time, not twice
    const amounts = mockState.addGaugeContribution.mock.calls.map((c: any[]) => c[1]);
    expect(amounts[0]).toBeCloseTo(0.26, 5);
    expect(amounts[1]).toBeCloseTo(0.19 / 6, 5);
  });

  it('Leave them: they wait for the morning, and the evening carries on', async () => {
    const t = await atOffer();
    await sweepNow(t);
    act(() => recordDecision(record('a'), jest.fn()));
    await act(() => t.hook.result.current.backFromCards());
    await act(() => t.hook.result.current.handleButton(...t.button('sweep_leave')));
    expect(t.messages.map((m) => m.content)).toContain(WRAP_COPY.leaveRest);
    expect(mockCompleted).toHaveBeenCalledTimes(1);
    expect(currentWrap()?.step).toBe('journal');
  });

  it('closed with nothing decided: the same choices again, with no words', async () => {
    const t = await atOffer();
    await sweepNow(t);
    await act(() => t.hook.result.current.backFromCards());
    expect(t.last().content).toBe('');
    expect((t.last().metadata_json as any).kind).toBe('wrap_up');
    expect(currentWrap()?.step).toBe('offer');
    expect(t.messages.some((m) => (m.metadata_json as any).type === 'sweep-receipt')).toBe(false);
  });

  it('puts a decision back from the receipt', async () => {
    const t = await atOffer();
    await sweepNow(t);
    const revert = jest.fn().mockResolvedValue(undefined);
    act(() => recordDecision(record('a'), revert));
    expect(t.hook.result.current.undoable['c-a']).toBe(true);
    await act(() => t.hook.result.current.undoDecision('c-a'));
    expect(revert).toHaveBeenCalledTimes(1);
    expect(currentWrap()?.decisions[0].undone_at).toBeTruthy();
    expect(t.hook.result.current.undoable['c-a']).toBeUndefined();
  });
});

/** A night with no cards, so each test starts at the step it is about. */
async function clearNight(extra: Record<string, unknown> = {}) {
  mockCards = [];
  const t = setup(extra);
  await act(() => t.hook.result.current.open());
  return t;
}

describe('the wrap up: habits', () => {
  beforeEach(() => {
    mockState.habits = [
      { id: 'h1', name: 'Blinkist', start_date: '2026-09-01', cadence: 'daily' },
      { id: 'h2', name: 'Stretch', start_date: '2026-09-01', cadence: 'daily' },
      { id: 'h3', name: 'No coffee', start_date: '2026-09-01', subtype: 'break_habit' },
    ];
    mockState.habitProgress = ['2026-09-27', '2026-09-28', '2026-09-29'].map((d) => ({
      habit_id: 'h1',
      occurred_day: d,
    }));
  });

  it('checks in on the habits still open, on one card', async () => {
    const t = await clearNight();
    const card = t.card('sweep-habits').metadata_json as any;
    expect(card.habits.map((h: any) => [h.title, h.kind])).toEqual([
      ['Blinkist', 'build'],
      ['Stretch', 'build'],
      ['No coffee', 'break'],
    ]);
    expect(currentWrap()?.step).toBe('habits');
  });

  it("logs what happened on the person's day through the change model, then asks about the day", async () => {
    const t = await clearNight();
    await act(() =>
      t.hook.result.current.habits.save(t.card('sweep-habits'), ['h1'], { h3: 'held' }),
    );
    expect(mockApplyChange.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [{ op: 'log', type: 'habit', id: 'h1', days: [DAY], cid: 'habit-h1' }, { source: 'sweep' }],
      [{ op: 'log', type: 'habit', id: 'h3', days: [DAY], cid: 'habit-h3' }, { source: 'sweep' }],
    ]);
    expect(t.card('sweep-habits').metadata_json).toMatchObject({
      status: 'saved',
      done: ['h1'],
      held: { h3: 'held' },
    });
    expect(t.messages.map((m) => m.content)).toContain(
      "Logged. That's four days running for Blinkist. Well done holding No coffee.",
    );
    expect(t.last().content).toBe(WRAP_COPY.journalAsk);
  });

  describe('a habit they planned for today in their week', () => {
    // DAY is Wednesday 30 September; with Sunday as their weekly day the week runs to Sunday 4 October
    beforeEach(() => {
      mockState.habits = [
        {
          id: 'h1',
          name: 'Strength',
          start_date: '2026-09-01',
          cadence: 'weekly',
          target_per_period: 3,
          time_estimate_minutes: 45,
        },
        { id: 'h2', name: 'Stretch', start_date: '2026-09-01', cadence: 'daily' },
      ];
      mockState.habitProgress = [];
      mockState.todos = [];
      mockState.habitPlans = [{ habit_id: 'h1', planned_date: DAY, status: 'planned' }];
      mockState.setHabitPlan = jest.fn(async (id: string, day: string) => {
        mockState.habitPlans = [
          ...mockState.habitPlans,
          { habit_id: id, planned_date: day, status: 'planned' },
        ];
      });
      mockState.removeHabitPlan = jest.fn(async (id: string, day: string) => {
        mockState.habitPlans = mockState.habitPlans.filter(
          (p: any) => !(p.habit_id === id && p.planned_date === day),
        );
      });
      Object.assign(mockWeek, { loaded: true, weeklyDay: 0, daysOff: [6, 0], review: null });
    });

    it('is given the day it can move to on the card: the day left with the most room', async () => {
      const t = await clearNight();
      const card = t.card('sweep-habits').metadata_json as any;
      expect(card.habits.map((h: any) => [h.id, h.move_to])).toEqual([
        // Saturday is a day off: four free hours against two on Thursday and Friday
        ['h1', '2026-10-03'],
        // a daily habit is on every day: there is nowhere to move it
        ['h2', undefined],
      ]);
    });

    it('gives two such habits different days when one day cannot take both', async () => {
      const long = (id: string, name: string) => ({
        id,
        name,
        start_date: '2026-09-01',
        cadence: 'weekly',
        target_per_period: 2,
        time_estimate_minutes: 150,
      });
      mockState.habits = [long('h1', 'Long run'), long('h3', 'Garden')];
      mockState.habitPlans = [
        { habit_id: 'h1', planned_date: DAY, status: 'planned' },
        { habit_id: 'h3', planned_date: DAY, status: 'planned' },
      ];
      const t = await clearNight();
      const card = t.card('sweep-habits').metadata_json as any;
      // each fits a day off (four hours) and neither a weekday (two): one to Saturday, one to Sunday
      expect(card.habits.map((h: any) => [h.id, h.move_to])).toEqual([
        ['h1', '2026-10-03'],
        ['h3', '2026-10-04'],
      ]);
    });

    it('moves it when the card is saved that way, and says so in the thread', async () => {
      const t = await clearNight();
      await act(() =>
        t.hook.result.current.habits.save(t.card('sweep-habits'), [], {}, { h1: '2026-10-03' }),
      );
      expect(mockState.habitPlans.map((p: any) => p.planned_date)).toEqual(['2026-10-03']);
      expect(mockApplyChange).not.toHaveBeenCalled();
      expect(t.card('sweep-habits').metadata_json).toMatchObject({
        status: 'saved',
        done: [],
        moved: { h1: '2026-10-03' },
      });
      expect(t.said()).toContainEqual(['brief-event', 'Moved Strength to Saturday']);
      expect(t.last().content).toBe(WRAP_COPY.journalAsk);
    });

    it('never moves a habit that was logged for today, or to a day the card did not offer', async () => {
      const t = await clearNight();
      await act(() =>
        t.hook.result.current.habits.save(
          t.card('sweep-habits'),
          ['h1'],
          {},
          { h1: '2026-10-03', h2: '2026-10-02' },
        ),
      );
      expect(mockState.setHabitPlan).not.toHaveBeenCalled();
      expect(mockState.removeHabitPlan).not.toHaveBeenCalled();
      expect((t.card('sweep-habits').metadata_json as any).moved).toBeUndefined();
    });

    it('says nothing moved when the new day could not be saved', async () => {
      mockState.setHabitPlan = jest.fn(async () => undefined);
      const t = await clearNight();
      await act(() =>
        t.hook.result.current.habits.save(t.card('sweep-habits'), [], {}, { h1: '2026-10-03' }),
      );
      expect(mockState.habitPlans.map((p: any) => p.planned_date)).toEqual([DAY]);
      expect((t.card('sweep-habits').metadata_json as any).moved).toBeUndefined();
      expect(
        t.said().some(([type, text]) => type === 'brief-event' && text.startsWith('Moved')),
      ).toBe(false);
    });
  });

  it('logs nothing for Nothing tonight, or for a habit that did not hold', async () => {
    const t = await clearNight();
    await act(() => t.hook.result.current.habits.save(t.card('sweep-habits'), [], { h3: 'not' }));
    expect(mockApplyChange).not.toHaveBeenCalled();
    expect(t.messages.map((m) => m.content)).toContain(
      'No worries about No coffee, tomorrow is a fresh one.',
    );
  });

  it('keeps a habit that did not hold with the day, apart from the habits done', async () => {
    const t = await clearNight();
    await act(() => t.hook.result.current.habits.save(t.card('sweep-habits'), [], { h3: 'not' }));
    expect(mockUpsert).toHaveBeenCalledWith(
      'habit_not_held',
      [{ owner_id: 'u1', habit_id: 'h3', day: DAY }],
      { onConflict: 'owner_id,habit_id,day', ignoreDuplicates: true },
    );
    expect(mockInsert).not.toHaveBeenCalledWith('habit_progress', expect.anything());
  });
});

describe('the wrap up: the journal', () => {
  it('saves a typed reply straight to the journal, and feeds Gremly once', async () => {
    const t = await clearNight();
    expect(t.hook.result.current.awaiting).toBe('journal');
    let used = false;
    await act(async () => {
      used = await t.hook.result.current.takeTyped('Tired but pleased.');
    });
    expect(used).toBe(true);
    expect(mockSaveJournal).toHaveBeenCalledWith({
      text: 'Tired but pleased.',
      moods: [],
      day: DAY,
      weekday: 'Wednesday',
      part: 'evening',
      // the moods Gremly reads with the day, when his words come back
      dayMoods: expect.any(Promise),
    });
    const said = t.said();
    expect(said).toContainEqual(['brief-reply', 'Tired but pleased.']);
    expect(said).toContainEqual(['brief-text', WRAP_COPY.journalSaved]);
    expect(t.card('sweep-journal').metadata_json).toMatchObject({
      status: 'saved',
      note_id: 'note-1',
      text: 'Tired but pleased.',
    });
    expect(mockState.addGaugeContribution).toHaveBeenCalledWith('journal', 0.2);
    expect(currentWrap()).toMatchObject({ journal: 'written', journal_fed: true });
    expect(t.hook.result.current.awaiting).toBeNull();
    expect(t.hook.result.current.undoable['journal:note-1']).toBe(true);
  });

  it('shows the moods read from their words when they arrive', async () => {
    mockSaveJournal.mockResolvedValue({
      ok: true,
      noteId: 'note-1',
      title: 'Wednesday evening',
      revert: jest.fn(),
      moods: Promise.resolve(['tired', 'good']),
    });
    const t = await clearNight();
    await act(async () => {
      await t.hook.result.current.takeTyped('Tired but pleased.');
    });
    expect((t.card('sweep-journal').metadata_json as any).moods).toEqual(['tired', 'good']);
  });

  it('after the X, the next message is not the journal', async () => {
    const t = await clearNight();
    act(() => t.hook.result.current.cancelAwaiting());
    let used = true;
    await act(async () => {
      used = await t.hook.result.current.takeTyped('What is on tomorrow?');
    });
    expect(used).toBe(false);
    expect(mockSaveJournal).not.toHaveBeenCalled();
    // Write a few lines arms it again, with nothing added to the thread
    const n = t.messages.length;
    await act(() => t.hook.result.current.handleButton(...t.button('journal_write')));
    expect(t.hook.result.current.awaiting).toBe('journal');
    expect(t.messages).toHaveLength(n);
  });

  it('keeps their words when the entry could not be saved', async () => {
    mockSaveJournal.mockResolvedValue({ ok: false, message: 'offline' });
    const t = await clearNight();
    await act(async () => {
      await t.hook.result.current.takeTyped('Tired but pleased.');
    });
    expect(t.calls.restoreDraft).toHaveBeenCalledWith('Tired but pleased.');
    expect(t.messages.map((m) => m.content)).toContain(WRAP_COPY.journalFailed);
    expect(t.hook.result.current.awaiting).toBe('journal');
    expect(mockState.addGaugeContribution).not.toHaveBeenCalled();
    expect(currentWrap()?.journal).toBeNull();
  });

  it('just pick a mood: nothing is saved until Save', async () => {
    const t = await clearNight();
    await act(() => t.hook.result.current.handleButton(...t.button('journal_mood')));
    expect(t.card('sweep-journal').metadata_json).toMatchObject({ status: 'mood' });
    expect(mockSaveJournal).not.toHaveBeenCalled();

    await act(() =>
      t.hook.result.current.journal.saveMoods(t.card('sweep-journal'), ['good', 'tired'] as never),
    );
    expect(mockSaveJournal).toHaveBeenCalledWith(
      expect.objectContaining({ text: '', moods: ['good', 'tired'], day: DAY }),
    );
    expect(t.card('sweep-journal').metadata_json).toMatchObject({
      status: 'saved',
      note_id: 'note-1',
      moods: ['good', 'tired'],
    });
    expect(t.messages.map((m) => m.content)).toContain(WRAP_COPY.journalMoodSaved);
    expect(currentWrap()?.journal).toBe('mood');
  });

  it('skip tonight carries on with nothing saved', async () => {
    const t = await clearNight();
    await act(() => t.hook.result.current.handleButton(...t.button('journal_skip')));
    expect(mockSaveJournal).not.toHaveBeenCalled();
    expect(currentWrap()).toMatchObject({ journal: 'skipped', step: 'close' });
  });

  it('takes the entry back out with Undo', async () => {
    const revert = jest.fn().mockResolvedValue(undefined);
    mockSaveJournal.mockResolvedValue({
      ok: true,
      noteId: 'note-1',
      title: 'Wednesday evening',
      revert,
      moods: Promise.resolve(null),
    });
    const t = await clearNight();
    await act(async () => {
      await t.hook.result.current.takeTyped('Tired but pleased.');
    });
    await act(() => t.hook.result.current.journal.undo(t.card('sweep-journal')));
    expect(revert).toHaveBeenCalledTimes(1);
    expect(t.card('sweep-journal').metadata_json).toMatchObject({ status: 'removed' });
  });

  it('is passed over when tonight already has an entry', async () => {
    mockJournalNote = 'note-0';
    const t = await clearNight();
    expect(t.messages.some((m) => m.content === WRAP_COPY.journalAsk)).toBe(false);
    expect(currentWrap()?.step).toBe('close');
  });

  it('sends them to the paywall when they cannot make new items, keeping their words', async () => {
    const t = await clearNight({ canCreate: false });
    await act(async () => {
      await t.hook.result.current.takeTyped('Tired but pleased.');
    });
    expect(t.calls.onPaywall).toHaveBeenCalledTimes(1);
    expect(t.calls.restoreDraft).toHaveBeenCalledWith('Tired but pleased.');
    expect(mockSaveJournal).not.toHaveBeenCalled();
  });
});

const Q1 = {
  id: 'q1',
  question: 'Is the dentist on Friday or Monday?',
  choices: ['Friday', 'Monday'],
  created_at: '2026-09-20T00:00:00Z',
  asked_at: null,
  record_table: 'notes',
  record_id: 'n1',
  private: false,
};
const Q2 = {
  id: 'q2',
  question: 'Which day is the anniversary itself?',
  choices: [],
  created_at: '2026-09-21T00:00:00Z',
  asked_at: null,
  record_table: null,
  record_id: null,
  private: false,
};

/** Past the journal, so the questions come next. */
async function toQuestions(t: ReturnType<typeof setup>) {
  await act(() => t.hook.result.current.handleButton(...t.button('journal_skip')));
}

describe('the wrap up: the journal page', () => {
  /** A page written on Rose, thorn, bud, as the page hands it over on Done */
  const written = (moods: string[] = []) => {
    const rose = newPage(pageById('rose'));
    let page = setCardHtml(rose, rose.cards[0].id, '<html><p>The lake at seven.</p></html>');
    page = setCardHtml(page, rose.cards[1].id, '<html><p>The budget review.</p></html>');
    const layout = toLayout(page);
    return { text: layout.text, layout, moods: moods as never };
  };
  const TEXT =
    'Rose: the best part of today\nThe lake at seven.\n\nThorn: the hard part\nThe budget review.';
  const onScreen = () => useJournalSession.getState().open;

  it('Open my journal opens the page for the day, and leaves the offer as it is', async () => {
    const t = await clearNight();
    const n = t.messages.length;
    await act(() => t.hook.result.current.handleButton(...t.button('journal_page')));
    expect(onScreen()).toMatchObject({ day: DAY, part: 'evening', save: expect.any(Function) });
    expect(onScreen()?.carry).toBeUndefined();
    expect(t.messages).toHaveLength(n);
    expect(mockSaveJournal).not.toHaveBeenCalled();
  });

  it('takes along what was already typed in the box', async () => {
    const t = await clearNight();
    act(() => t.hook.result.current.journal.openPage('Tired but pleased.'));
    expect(onScreen()).toMatchObject({ day: DAY, carry: 'Tired but pleased.' });
  });

  it('Done saves the entry with its page, then the thread shows it and carries on', async () => {
    const t = await clearNight();
    await act(() => t.hook.result.current.handleButton(...t.button('journal_page')));
    const w = written(['calm']);
    let res: unknown;
    await act(async () => {
      res = await onScreen()!.save!(w);
    });
    // it says which entry it saved, so the page can send that entry's photos
    expect(res).toEqual({ ok: true, noteId: 'note-1' });
    expect(mockSaveJournal).toHaveBeenCalledWith({
      text: TEXT,
      moods: ['calm'],
      day: DAY,
      weekday: 'Wednesday',
      part: 'evening',
      page: w.layout,
      dayMoods: expect.any(Promise),
    });
    const said = t.said();
    expect(said).toContainEqual(['brief-event', WRAP_COPY.journalWrote]);
    expect(said).toContainEqual(['brief-text', WRAP_COPY.journalSaved]);
    expect(t.card('sweep-journal').metadata_json).toMatchObject({
      status: 'saved',
      note_id: 'note-1',
      text: TEXT,
      moods: ['calm'],
      parts: [
        { q: 'Rose: the best part of today', text: 'The lake at seven.' },
        { q: 'Thorn: the hard part', text: 'The budget review.' },
      ],
    });
    // the journal's buttons are answered, and the evening moves on to the close
    const asked = t.messages.find(
      (m) =>
        (m.metadata_json as any).type === 'brief-offer' &&
        (m.metadata_json as any).kind === 'journal',
    );
    expect((asked?.metadata_json as any).chosen.id).toBe('journal_page');
    expect(currentWrap()).toMatchObject({ journal: 'written', journal_fed: true });
    expect(t.hook.result.current.awaiting).toBeNull();
    expect(t.hook.result.current.undoable['journal:note-1']).toBe(true);
    expect(mockState.addGaugeContribution).toHaveBeenCalledWith('journal', 0.2);
    expect(currentWrap()?.step).not.toBe('journal');
  });

  it('counts moods alone on the page as the reflection, with nothing for Gremly to read', async () => {
    const t = await clearNight();
    act(() => t.hook.result.current.journal.openPage());
    const empty = toLayout(newPage(pageById('free')));
    await act(async () => {
      await onScreen()!.save!({ text: '', layout: empty, moods: ['tired'] as never });
    });
    expect(mockSaveJournal.mock.calls[0][0]).toMatchObject({ text: '', moods: ['tired'] });
    expect(mockWrapWords).not.toHaveBeenCalledWith(
      expect.objectContaining({ moment: 'journal_reply' }),
    );
    expect(currentWrap()?.journal).toBe('mood');
  });

  it('stays out of the thread when the page could not be saved, so the page keeps its words', async () => {
    mockSaveJournal.mockResolvedValue({ ok: false, message: 'offline' });
    const t = await clearNight();
    act(() => t.hook.result.current.journal.openPage());
    const n = t.messages.length;
    let res: unknown;
    await act(async () => {
      res = await onScreen()!.save!(written());
    });
    expect(res).toEqual({ ok: false, message: 'offline' });
    expect(t.messages).toHaveLength(n);
    expect(t.hook.result.current.awaiting).toBe('journal');
    expect(currentWrap()?.journal).toBeNull();
  });

  it('opens a page that is half written when more is typed in the box, with those words', async () => {
    const t = await clearNight();
    keepDraft(draftKey({ day: DAY }), { page: newPage(pageById('rose')), moods: [] });
    let used = false;
    await act(async () => {
      used = await t.hook.result.current.takeTyped('One more thought.');
    });
    expect(used).toBe(true);
    expect(onScreen()).toMatchObject({ day: DAY, carry: 'One more thought.' });
    expect(mockSaveJournal).not.toHaveBeenCalled();
    expect(t.said()).not.toContainEqual(['brief-reply', 'One more thought.']);
  });

  it('sends them to the paywall when they cannot make new items', async () => {
    const t = await clearNight({ canCreate: false });
    await act(() => t.hook.result.current.handleButton(...t.button('journal_page')));
    expect(t.calls.onPaywall).toHaveBeenCalled();
    expect(onScreen()).toBeNull();
  });

  it('opens a saved entry from its card, and the card follows what is changed', async () => {
    mockUpdateJournal.mockResolvedValue({ ok: true, moods: Promise.resolve(['good']) });
    const t = await clearNight();
    await act(async () => {
      await t.hook.result.current.takeTyped('Tired but pleased.');
    });
    act(() => t.hook.result.current.journal.openSaved(t.card('sweep-journal')));
    expect(onScreen()).toMatchObject({ day: DAY, entryId: 'note-1' });
    const w = written();
    let res: unknown;
    await act(async () => {
      res = await onScreen()!.save!(w);
    });
    // it says which entry it saved, so the page can send that entry's photos
    expect(res).toEqual({ ok: true, noteId: 'note-1' });
    expect(mockUpdateJournal).toHaveBeenCalledWith({
      noteId: 'note-1',
      text: TEXT,
      moods: [],
      page: w.layout,
    });
    expect(t.card('sweep-journal').metadata_json).toMatchObject({
      text: TEXT,
      parts: [
        { q: 'Rose: the best part of today', text: 'The lake at seven.' },
        { q: 'Thorn: the hard part', text: 'The budget review.' },
      ],
      // the moods read from the new words, once they arrive
      moods: ['good'],
    });
    // no second entry is made
    expect(mockSaveJournal).toHaveBeenCalledTimes(1);
  });

  it('leaves the card as it was when the change could not be saved', async () => {
    mockUpdateJournal.mockResolvedValue({ ok: false, message: 'offline' });
    const t = await clearNight();
    await act(async () => {
      await t.hook.result.current.takeTyped('Tired but pleased.');
    });
    act(() => t.hook.result.current.journal.openSaved(t.card('sweep-journal')));
    let res: unknown;
    await act(async () => {
      res = await onScreen()!.save!(written());
    });
    expect(res).toEqual({ ok: false, message: 'offline' });
    expect((t.card('sweep-journal').metadata_json as any).text).toBe('Tired but pleased.');
  });
});

describe("the wrap up: Gremly's questions", () => {
  beforeEach(() => {
    mockFetchQuestions.mockResolvedValue([Q1, Q2]);
    mockState.notes = [{ id: 'n1', title: 'Dentist Appointment', target_date: '2026-10-02' }];
  });

  it('asks up to two, one at a time, and shows the item an answer was about', async () => {
    const t = await clearNight();
    await toQuestions(t);
    expect(t.messages[t.messages.length - 2].content).toBe(
      "Two quick things I'd like to get right, then you're done.",
    );
    expect(t.last().content).toBe(Q1.question);
    expect(t.hook.result.current.awaiting).toBe('question');
    expect(currentWrap()).toMatchObject({ step: 'questions', questions: ['q1', 'q2'] });

    const [offer] = t.button('answer');
    const monday = (offer.metadata_json as unknown as BriefOfferMeta).buttons[1];
    await act(() => t.hook.result.current.handleButton(offer, monday));
    expect(mockAnswer).toHaveBeenCalledWith('q1', 'Monday');
    const said = t.said();
    expect(said).toContainEqual(['brief-reply', 'Monday']);
    expect(said).toContainEqual([
      'brief-text',
      "Thanks, saved. Here's the note, in case it needs changing.",
    ]);
    expect(said).toContainEqual(['brief-event', WRAP_COPY.savedEvent]);
    expect((t.card('sweep-item').metadata_json as any).item).toMatchObject({
      id: 'n1',
      kind: 'note',
      title: 'Dentist Appointment',
    });
    // then the second
    expect(t.last().content).toBe(Q2.question);
  });

  it('takes a typed reply as the answer', async () => {
    mockFetchQuestions.mockResolvedValue([Q2]);
    const t = await clearNight();
    await toQuestions(t);
    let used = false;
    await act(async () => {
      used = await t.hook.result.current.takeTyped('Saturday the 3rd');
    });
    expect(used).toBe(true);
    expect(mockAnswer).toHaveBeenCalledWith('q2', 'Saturday the 3rd');
    expect(t.said()).toContainEqual(['brief-text', WRAP_COPY.answered]);
    // no more questions: the close
    expect(currentWrap()?.step).toBe('close');
  });

  it('a skipped question waits a few days, and the next one is asked', async () => {
    const t = await clearNight();
    await toQuestions(t);
    await act(() => t.hook.result.current.handleButton(...t.button('skip')));
    expect(mockAsked).toHaveBeenCalledWith('q1');
    expect(mockAnswer).not.toHaveBeenCalled();
    expect(t.said()).toContainEqual(['brief-text', WRAP_COPY.questionSkipped]);
    expect(t.last().content).toBe(Q2.question);
  });

  it('says so when an answer could not be saved, and moves on', async () => {
    mockAnswer.mockResolvedValue(false);
    mockFetchQuestions.mockResolvedValue([Q1]);
    const t = await clearNight();
    await toQuestions(t);
    await act(() => t.hook.result.current.handleButton(...t.button('answer')));
    expect(t.said()).toContainEqual(['brief-text', WRAP_COPY.answerFailed]);
    expect(t.messages.some((m) => (m.metadata_json as any).type === 'sweep-item')).toBe(false);
    expect(currentWrap()?.step).toBe('close');
  });

  it('never asks about an item the Sweep just decided', async () => {
    mockCards = [card('n1', 'note')];
    mockFetchQuestions.mockResolvedValue([Q1]);
    const t = setup();
    await act(() => t.hook.result.current.open());
    await act(() => t.hook.result.current.handleButton(...t.button('sweep')));
    act(() => recordDecision(record('n1'), jest.fn()));
    await act(() => t.hook.result.current.backFromCards());
    await toQuestions(t);
    expect(t.messages.some((m) => m.content === Q1.question)).toBe(false);
    expect(currentWrap()?.step).toBe('close');
  });

  it('carries on to the close when the questions cannot be read', async () => {
    mockFetchQuestions.mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = await clearNight();
    await toQuestions(t);
    expect(currentWrap()?.step).toBe('close');
    warn.mockRestore();
  });
});

describe("the wrap up: a milestone's check ins", () => {
  // set up in their weekly review, for tonight
  const CHECK = checkInQuestion({
    id: 'c1',
    goal: 'Send the grant application',
    goal_date: '2026-10-20',
    date: DAY,
    title: 'See how the draft is coming along',
    status: 'open',
    row_id: 'row-1',
  });
  // what its question's message keeps of it, to settle the answer with
  const ASKED = {
    row_id: 'row-1',
    id: 'c1',
    goal: 'Send the grant application',
    goal_date: '2026-10-20',
  };
  beforeEach(() => {
    mockFetchCheckIns.mockResolvedValue([CHECK]);
    mockState.notes = [{ id: 'n1', title: 'Dentist Appointment', target_date: '2026-10-02' }];
  });

  it('asks a check in that is due as tonight’s question, to be typed or skipped', async () => {
    const t = await clearNight();
    await toQuestions(t);
    expect(mockFetchCheckIns).toHaveBeenCalledWith(DAY);
    expect(t.messages[t.messages.length - 2].content).toBe("One check in, then you're done.");
    expect(t.last().content).toBe(
      'You set a check in on “Send the grant application”. How is it going?',
    );
    const offer = t.last().metadata_json as unknown as BriefOfferMeta;
    // it is not one of Gremly's questions, so it carries itself and no question id
    expect(offer).toMatchObject({ kind: 'question', milestone_checkin: ASKED, wrap: true });
    expect(offer.question_id).toBeUndefined();
    expect(offer.buttons.map((b) => [b.label, b.action])).toEqual([
      ['Type an answer', 'answer_other'],
      ['Skip', 'skip'],
    ]);
    expect(t.hook.result.current.awaiting).toBe('question');
    expect(currentWrap()).toMatchObject({ step: 'questions', questions: ['checkin:c1'] });
    // it is theirs, so Gremly is not asked to choose or word anything
    expect(mockWrapWords).not.toHaveBeenCalledWith(
      expect.objectContaining({ moment: 'questions' }),
    );
  });

  it('writes the typed answer to their journal as a check in, never to Gremly’s questions', async () => {
    const askGremly = jest.fn();
    const t = await clearNight({ askGremly });
    await toQuestions(t);
    let used = false;
    await act(async () => {
      used = await t.hook.result.current.takeTyped('The draft is half done, on track.');
    });
    expect(used).toBe(true);
    expect(mockAnswerCheckIn).toHaveBeenCalledWith(ASKED, 'The draft is half done, on track.');
    expect(mockAnswer).not.toHaveBeenCalled();
    expect(askGremly).not.toHaveBeenCalled();
    const said = t.said();
    expect(said).toContainEqual(['brief-reply', 'The draft is half done, on track.']);
    expect(said).toContainEqual(['brief-text', "Thanks. That's in your journal as a check in."]);
    expect(said).toContainEqual(['brief-event', 'Saved your check in']);
    // nothing else to ask: the close
    expect(currentWrap()?.step).toBe('close');
  });

  it('says so when the answer could not be saved, and carries on', async () => {
    mockAnswerCheckIn.mockResolvedValue(false);
    const t = await clearNight();
    await toQuestions(t);
    await act(async () => {
      await t.hook.result.current.takeTyped('Going fine.');
    });
    expect(t.said()).toContainEqual(['brief-text', WRAP_COPY.checkInFailed]);
    expect(t.said()).not.toContainEqual(['brief-event', WRAP_COPY.checkInSavedEvent]);
    expect(currentWrap()?.step).toBe('close');
  });

  it('marks a skipped check in on its review, not as one of Gremly’s questions', async () => {
    const t = await clearNight();
    await toQuestions(t);
    await act(() => t.hook.result.current.handleButton(...t.button('skip')));
    expect(mockSkipCheckIn).toHaveBeenCalledWith(ASKED);
    expect(mockAsked).not.toHaveBeenCalled();
    expect(t.said()).toContainEqual(['brief-text', "No problem. I'll leave that one."]);
    expect(currentWrap()?.step).toBe('close');
  });

  it('settles a check in the same after the app was closed with its question on screen', async () => {
    const t = await clearNight();
    await toQuestions(t);
    // The app starts again: the thread and the wrap up's place are kept,
    // tonight's questions held in memory are not.
    const typed = setup({ messages: t.messages });
    await act(async () => {
      expect(await typed.hook.result.current.takeTyped('Half done.')).toBe(true);
    });
    expect(mockAnswerCheckIn).toHaveBeenCalledWith(ASKED, 'Half done.');
    expect(mockAnswer).not.toHaveBeenCalled();
    expect(currentWrap()?.step).toBe('close');
  });

  it('takes what is typed as the answer again once the wrap up is opened after a restart', async () => {
    const t = await clearNight();
    await toQuestions(t);
    // a real restart: nothing is waiting on the box any more
    useWrapSession.setState({ awaiting: null });
    const back = setup({ messages: t.messages });
    const n = back.messages.length;
    await act(() => back.hook.result.current.open());
    // the question is still there with its buttons: nothing is said twice
    expect(back.messages).toHaveLength(n);
    expect(back.hook.result.current.awaiting).toBe('question');
    await act(async () => {
      expect(await back.hook.result.current.takeTyped('Half done.')).toBe(true);
    });
    expect(mockAnswerCheckIn).toHaveBeenCalledWith(ASKED, 'Half done.');
  });

  it('puts the question’s buttons back after a restart when a chat turn took them away', async () => {
    const t = await clearNight();
    await toQuestions(t);
    useWrapSession.setState({ awaiting: null });
    // typed under the question after a restart: it went to chat, and Gremly replied
    const turn = [msg('user', 'What is on tomorrow?', {}), msg('assistant', 'Two meetings.', {})];
    const back = setup({ messages: [...t.messages, ...turn] });
    await act(() => back.hook.result.current.resume());
    const again = back.last().metadata_json as unknown as BriefOfferMeta;
    expect(back.last().content).toBe('');
    // the same check in, from its own message, to answer or skip as before
    expect(again).toMatchObject({ kind: 'question', milestone_checkin: ASKED, wrap: true });
    expect(again.buttons.map((b) => b.action)).toEqual(['answer_other', 'skip']);
    expect(back.hook.result.current.awaiting).toBe('question');
    await act(() => back.hook.result.current.handleButton(...back.button('skip')));
    expect(mockSkipCheckIn).toHaveBeenCalledWith(ASKED);
    expect(currentWrap()?.step).toBe('close');
  });

  it('goes on to the close after a restart when no question is still waiting', async () => {
    const t = await clearNight();
    await toQuestions(t);
    // answered, and the app closed before the next step was taken
    const answered = t.messages.map((m, i) =>
      i === t.messages.length - 1
        ? ({
            ...m,
            metadata_json: { ...(m.metadata_json as object), chosen: { id: 'typed', at: 'now' } },
          } as SpaceChatMessage)
        : m,
    );
    const back = setup({ messages: [...answered, msg('user', 'Half done.', {})] });
    await act(() => back.hook.result.current.open());
    expect(currentWrap()?.step).toBe('close');
    expect((back.last().metadata_json as any).kind).not.toBe('question');
  });

  it('and a skip after the app was closed is still marked on its review', async () => {
    const t = await clearNight();
    await toQuestions(t);
    const back = setup({ messages: t.messages });
    await act(() => back.hook.result.current.handleButton(...back.button('skip')));
    expect(mockSkipCheckIn).toHaveBeenCalledWith(ASKED);
    expect(mockAsked).not.toHaveBeenCalled();
    expect(currentWrap()?.step).toBe('close');
  });

  it('comes before Gremly’s own questions, which take the room that is left', async () => {
    mockFetchQuestions.mockResolvedValue([Q1, Q2]);
    const t = await clearNight();
    await toQuestions(t);
    expect(t.messages[t.messages.length - 2].content).toBe(
      "A check in first, then one thing I'd like to get right.",
    );
    expect(t.last().content).toBe(CHECK.question);
    expect(currentWrap()).toMatchObject({ questions: ['checkin:c1', 'q1'] });
    await act(async () => {
      await t.hook.result.current.takeTyped('On track.');
    });
    // then his own, answered as his questions always are
    expect(t.last().content).toBe(Q1.question);
    const [offer] = t.button('answer');
    const monday = (offer.metadata_json as unknown as BriefOfferMeta).buttons[1];
    await act(() => t.hook.result.current.handleButton(offer, monday));
    expect(mockAnswer).toHaveBeenCalledWith('q1', 'Monday');
    expect(currentWrap()?.step).toBe('close');
  });

  it('leaves no room for his questions when two check ins are due', async () => {
    const second = checkInQuestion({
      ...(CHECK.checkin as NonNullable<typeof CHECK.checkin>),
      id: 'c2',
      goal: 'Run the 10k',
    });
    mockFetchCheckIns.mockResolvedValue([CHECK, second]);
    mockFetchQuestions.mockResolvedValue([Q1]);
    const t = await clearNight();
    await toQuestions(t);
    expect(currentWrap()).toMatchObject({ questions: ['checkin:c1', 'checkin:c2'] });
    // and the line before them counts them as what they are
    expect(t.messages[t.messages.length - 2].content).toBe("Two check ins, then you're done.");
  });

  it('still asks Gremly’s questions when the check ins cannot be read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockFetchCheckIns.mockRejectedValue(new Error('offline'));
    mockFetchQuestions.mockResolvedValue([Q2]);
    const t = await clearNight();
    await toQuestions(t);
    expect(t.last().content).toBe(Q2.question);
    expect(warn.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/check ins/);
    warn.mockRestore();
  });
});

describe('the wrap up: the close', () => {
  it('says what tomorrow holds, and feeds for a night with nothing to sort', async () => {
    mockMeetings.mockImplementation((day: string) => (day === TOMORROW ? [{}, {}, {}] : []));
    // every todo planned for tomorrow counts, not only what moved there tonight
    mockState.todos = ['t1', 't2', 't3', 't4', 't5'].map((id) => ({
      id,
      name: id,
      due_day: TOMORROW,
    }));
    const t = await clearNight();
    await toQuestions(t);
    expect(t.last().content).toBe(
      "That's Wednesday closed out, nicely done. Time to rest now. Tomorrow has three meetings, and five todos planned.",
    );
    expect(
      (t.last().metadata_json as unknown as BriefOfferMeta).buttons.map((b) => b.action),
    ).toEqual(['night', 'plan_tomorrow']);
    // 26%, once
    expect(mockState.addGaugeContribution).toHaveBeenCalledTimes(1);
    expect(mockState.addGaugeContribution).toHaveBeenCalledWith('sweep', 0.26);
  });

  it('Plan tomorrow starts the planner for tomorrow, then offers good night', async () => {
    const t = await clearNight();
    await toQuestions(t);
    await act(() => t.hook.result.current.handleButton(...t.button('plan_tomorrow')));
    expect(t.calls.planDay).toHaveBeenCalledWith(TOMORROW);
    await act(() => t.hook.result.current.afterPlan());
    expect(t.last().content).toBe('');
    expect(
      (t.last().metadata_json as unknown as BriefOfferMeta).buttons.map((b) => b.action),
    ).toEqual(['night']);
  });

  describe('their week', () => {
    const closeActions = (t: { last: () => SpaceChatMessage }) =>
      (t.last().metadata_json as unknown as BriefOfferMeta).buttons.map((b) => b.action);
    // DAY is a Wednesday: with Wednesday as their weekly day the review is of the week from Thursday
    const weeklyWednesday = (review: Record<string, unknown> | null = null) =>
      Object.assign(mockWeek, { loaded: true, weeklyDay: 3, review });

    it('offers the weekly review at the close on their weekly day and the two evenings after', async () => {
      weeklyWednesday();
      const t = await clearNight();
      await toQuestions(t);
      expect(closeActions(t)).toEqual(['night', 'plan_tomorrow', 'plan_week']);
      expect((t.last().metadata_json as unknown as BriefOfferMeta).hint).toBe(
        "Your week isn't planned yet.",
      );
      // Monday is their weekly day: Wednesday is the second evening after
      resetWrapSession();
      Object.assign(mockWeek, { loaded: true, weeklyDay: 1, review: null });
      const second = await clearNight();
      await toQuestions(second);
      expect(closeActions(second)).toContain('plan_week');
    });

    it('says nothing of the week on other evenings, once they said not this week, or before it is read', async () => {
      // Sunday is their weekly day: Wednesday is three days after
      Object.assign(mockWeek, { loaded: true, weeklyDay: 0, review: null });
      const t = await clearNight();
      await toQuestions(t);
      expect(closeActions(t)).toEqual(['night', 'plan_tomorrow']);

      resetWrapSession();
      weeklyWednesday({ week_start: TOMORROW, status: 'skipped' });
      const skipped = await clearNight();
      await toQuestions(skipped);
      expect(closeActions(skipped)).toEqual(['night', 'plan_tomorrow']);

      resetWrapSession();
      Object.assign(mockWeek, { loaded: false, weeklyDay: 3, review: null });
      const unread = await clearNight();
      await toQuestions(unread);
      expect(closeActions(unread)).toEqual(['night', 'plan_tomorrow']);
    });

    it('Plan my week finishes the wrap up and starts the review in the thread', async () => {
      weeklyWednesday();
      const t = await clearNight();
      await toQuestions(t);
      await act(() => t.hook.result.current.handleButton(...t.button('plan_week')));
      expect(t.said().slice(-2)).toEqual([
        ['brief-reply', 'Plan my week'],
        ['brief-text', "Let's plan your week."],
      ]);
      // the evening's own work is done: no goodnight is said, the review ends the night
      expect(currentWrap()).toMatchObject({ step: 'done' });
      expect(currentWrap()?.finished_at).toBeTruthy();
      expect(t.calls.planWeek).toHaveBeenCalledTimes(1);
      expect(t.calls.seeWeek).not.toHaveBeenCalled();
      expect(t.messages.some((m) => (m.metadata_json as any).type === 'sweep-end')).toBe(false);
    });

    it('Plan my week on an offer from before the close opens the review and leaves the wrap up where it is', async () => {
      // an earlier build put the button on the opening offer, and that offer is still in the thread
      const t = setup();
      await act(() => t.hook.result.current.open());
      const opening = t.last();
      const meta = opening.metadata_json as unknown as BriefOfferMeta;
      const planWeek = {
        id: 'plan_week',
        label: 'Plan my week',
        action: 'plan_week',
      } as OfferButton;
      const old = {
        ...opening,
        metadata_json: { ...meta, buttons: [...meta.buttons, planWeek] },
      } as unknown as SpaceChatMessage;
      const step = currentWrap()?.step;
      const back = setup({ messages: [...t.messages.slice(0, -1), old] });
      await act(() => back.hook.result.current.handleButton(old, planWeek));
      expect(back.calls.planWeek).toHaveBeenCalledTimes(1);
      // the evening is not ended: nothing of it has been done yet
      expect(currentWrap()?.step).toBe(step);
      expect(currentWrap()?.finished_at).toBeFalsy();
      expect(back.said().slice(-1)).toEqual([['brief-reply', 'Plan my week']]);
    });

    it('offers the week they planned once the review is done, and leaves the close as it is', async () => {
      weeklyWednesday({ week_start: TOMORROW, status: 'done' });
      const t = await clearNight();
      await toQuestions(t);
      expect(closeActions(t)).toEqual(['night', 'plan_tomorrow', 'see_week']);
      const n = t.messages.length;
      await act(() => t.hook.result.current.handleButton(...t.button('see_week')));
      expect(t.calls.seeWeek).toHaveBeenCalledTimes(1);
      // good night is still there for when they come back
      expect(t.messages).toHaveLength(n);
      expect((t.last().metadata_json as any).chosen).toBeUndefined();
      expect(currentWrap()?.step).toBe('close');
    });

    it('still offers the week after tomorrow is planned', async () => {
      weeklyWednesday();
      const t = await clearNight();
      await toQuestions(t);
      await act(() => t.hook.result.current.handleButton(...t.button('plan_tomorrow')));
      await act(() => t.hook.result.current.afterPlan());
      expect(closeActions(t)).toEqual(['night', 'plan_week']);
    });
  });

  it('good night ends the thread for the day', async () => {
    mockState.isFedToday = true;
    const t = await clearNight();
    await toQuestions(t);
    await act(() => t.hook.result.current.handleButton(...t.button('night')));
    expect(t.said().slice(-3)).toEqual([
      ['brief-reply', 'Night, Gremly'],
      ['brief-text', 'Night, Sam. Sleep well.'],
      ['sweep-end', ''],
    ]);
    expect(currentWrap()).toMatchObject({ step: 'done' });
    expect(currentWrap()?.finished_at).toBeTruthy();
    expect(mockMascot).toHaveBeenLastCalledWith('fed');
  });
});

describe('the wrap up: the other choices', () => {
  it('Move it all on: todos move, the rest waits, a skip is used, and habits and the journal still come', async () => {
    mockFetchQuestions.mockResolvedValue([Q2]);
    // each move is a decision kept for tomorrow, as the change model records it
    mockApplyDecision.mockImplementation(async (d: { candidateId: string; dueDateStr: string }) => {
      // the todo moves in the store, as keeping it for a day does
      mockState.todos = [
        ...mockState.todos,
        { id: d.candidateId, name: `Todo ${d.candidateId}`, due_day: d.dueDateStr },
      ];
      return {
        ok: true,
        record: record(d.candidateId, 'kept', { fields: { day: d.dueDateStr } }),
        revert: jest.fn().mockResolvedValue(undefined),
      };
    });
    const t = setup();
    await act(() => t.hook.result.current.open());
    mockState.refreshSkipBudget.mockImplementation(async () => {
      mockState.skipsUsedLast7Days = 1;
    });
    await act(() => t.hook.result.current.handleButton(...t.button('sweep_skip')));
    // the two todo cards move, due today or not; the note waits
    expect(mockApplyDecision.mock.calls.map((c) => c[0].candidateId)).toEqual(['a', 'b']);
    expect(mockApplyDecision.mock.calls.every((c) => c[0].dueDateStr === TOMORROW)).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith('sweep_skip_events', {
      owner_id: 'u1',
      target_date: TOMORROW,
      todo_count: 2,
    });
    const said = t.said();
    expect(said).toContainEqual(['brief-event', 'Moved 2 todos to tomorrow']);
    expect(said).toContainEqual([
      'brief-text',
      "Done. Two todos have moved to tomorrow, and the other one will wait for your next Sweep. That's one skip used, two left this week.",
    ]);
    expect(mockCompleted).toHaveBeenCalledTimes(1);
    // straight on to the journal
    expect(t.last().content).toBe(WRAP_COPY.journalAsk);
    // a skip night has no questions and does not feed for the cards
    await toQuestions(t);
    expect(mockFetchQuestions).not.toHaveBeenCalled();
    expect(currentWrap()).toMatchObject({ path: 'skip', step: 'close' });
    expect(mockState.addGaugeContribution).not.toHaveBeenCalled();
    // the close names what was moved to tomorrow
    expect(t.last().content).toBe(
      "That's Wednesday closed out, nicely done. Time to rest now. Tomorrow has Todo a and Todo b planned.",
    );
  });

  it('Not tonight keeps the journal one tap away, and that is all it asks', async () => {
    const t = setup();
    await act(() => t.hook.result.current.open());
    await act(() => t.hook.result.current.handleButton(...t.button('not_tonight')));
    expect(t.last().content).toBe(WRAP_COPY.notTonightReply);
    expect(currentWrap()?.step).toBe('declined');
    expect(mockCompleted).not.toHaveBeenCalled();

    await act(() => t.hook.result.current.handleButton(...t.button('journal_only')));
    expect(t.last().content).toBe(WRAP_COPY.journalAskOnly);
    await act(async () => {
      await t.hook.result.current.takeTyped('Long day.');
    });
    expect(t.last().content).toBe('Night, Sam. Sleep well.');
    expect(currentWrap()).toMatchObject({ step: 'declined', journal: 'written' });
    expect(mockFetchQuestions).not.toHaveBeenCalled();
  });

  describe('Just the journal, with a habit they are breaking', () => {
    const BUILD = { id: 'h1', name: 'Blinkist', start_date: '2026-09-01', cadence: 'daily' };
    const BREAK = {
      id: 'b1',
      name: 'No phone in bed',
      subtype: 'break_habit',
      start_date: '2026-09-01',
      cadence: 'daily',
    };
    const habitCards = (t: ReturnType<typeof setup>) =>
      t.messages.filter((m) => (m.metadata_json as any)?.type === 'sweep-habits');

    /** Not tonight, Just the journal, then the journal written or skipped. */
    async function journalOnly(skip = false) {
      const t = setup();
      await act(() => t.hook.result.current.open());
      await act(() => t.hook.result.current.handleButton(...t.button('not_tonight')));
      await act(() => t.hook.result.current.handleButton(...t.button('journal_only')));
      expect(t.last().content).toBe(WRAP_COPY.journalAskOnly);
      if (skip) await act(() => t.hook.result.current.handleButton(...t.button('journal_skip')));
      else
        await act(async () => {
          await t.hook.result.current.takeTyped('Long day.');
        });
      return t;
    }

    it('still checks in on it, once, after the journal, and says good night when it is saved', async () => {
      mockState.habits = [BUILD, BREAK];
      const t = await journalOnly();
      // the one they are breaking is asked, and the habit they are building is not
      const card = t.card('sweep-habits');
      expect(card.metadata_json).toMatchObject({
        habits: [{ id: 'b1', title: 'No phone in bed', kind: 'break' }],
        after_journal: true,
        status: 'open',
      });
      expect(t.said()).toContainEqual([
        'brief-text',
        'One habit to check in on. Did it hold today?',
      ]);
      // the wrap up itself is over, as on any Not tonight
      expect(currentWrap()).toMatchObject({
        step: 'declined',
        journal_only: false,
        break_asked: true,
        journal: 'written',
      });
      // good night waits for the card
      expect(t.messages.map((m) => m.content)).not.toContain('Night, Sam. Sleep well.');

      await act(() => t.hook.result.current.habits.save(card, [], { b1: 'not' }));
      expect(t.last().content).toBe('Night, Sam. Sleep well.');
      expect(currentWrap()?.step).toBe('declined');
      // one habits card, and the journal is not asked a second time
      expect(habitCards(t)).toHaveLength(1);
      expect(t.messages.filter((m) => m.content === WRAP_COPY.journalAskOnly)).toHaveLength(1);
      expect(mockFetchQuestions).not.toHaveBeenCalled();
    });

    it('checks in on it after a journal they skipped too', async () => {
      mockState.habits = [BREAK];
      const t = await journalOnly(true);
      const card = t.card('sweep-habits');
      await act(() => t.hook.result.current.habits.save(card, [], { b1: 'held' }));
      expect(t.last().content).toBe('Night, Sam. Sleep well.');
      expect(currentWrap()?.step).toBe('declined');
    });

    it('says good night straight away when there is none to check in on', async () => {
      mockState.habits = [BUILD];
      const t = await journalOnly();
      expect(habitCards(t)).toHaveLength(0);
      expect(t.last().content).toBe('Night, Sam. Sleep well.');
    });

    it('leaves the wrap up open to come back to while the card waits, and asks about it once', async () => {
      mockState.habits = [BUILD, BREAK];
      const t = await journalOnly();
      // the card is left unanswered, and they come back to the wrap up
      await act(() => t.hook.result.current.open());
      expect(t.last().content).toBe('Sure. Three things to sort, about a minute.');
      expect(currentWrap()?.step).toBe('offer');
      // on through to the habits: the one they are building, and not the other again
      await act(() => t.hook.result.current.handleButton(...t.button('sweep_skip')));
      const cards = habitCards(t);
      expect(cards).toHaveLength(2);
      expect((cards[1].metadata_json as any).habits.map((h: any) => h.id)).toEqual(['h1']);
      expect((cards[1].metadata_json as any).after_journal).toBeUndefined();
      // the first card can still be answered, and says good night
      await act(() => t.hook.result.current.habits.save(cards[0], [], { b1: 'held' }));
      expect(t.last().content).toBe('Night, Sam. Sleep well.');
    });

    it('does not ask again after Not today, when they come back with nothing else open', async () => {
      mockState.habits = [BREAK];
      const t = await journalOnly();
      await act(() => t.hook.result.current.habits.save(t.card('sweep-habits'), [], { b1: 'not' }));
      await act(() => t.hook.result.current.open());
      await act(() => t.hook.result.current.handleButton(...t.button('sweep_skip')));
      expect(habitCards(t)).toHaveLength(1);
    });
  });

  it('coming back after Not tonight offers the cards again, with no second journal ask', async () => {
    const t = setup();
    await act(() => t.hook.result.current.open());
    await act(() => t.hook.result.current.handleButton(...t.button('not_tonight')));
    await act(() => t.hook.result.current.open());
    expect(t.last().content).toBe('Sure. Three things to sort, about a minute.');
    expect((t.last().metadata_json as any).kind).toBe('wrap_up');
    expect(currentWrap()?.step).toBe('offer');
  });

  it("a Not now from earlier in the day is not tonight's answer: the evening opens afresh", async () => {
    mockEarly = true;
    const t = setup();
    await act(() => t.hook.result.current.open());
    await act(() => t.hook.result.current.handleButton(...t.button('not_tonight')));
    expect(currentWrap()?.step).toBe('declined');
    // the evening comes, and they open it from the nudge
    mockEarly = false;
    mockTouchedTonight = false;
    await act(() => t.hook.result.current.open());
    expect(currentWrap()?.step).toBe('offer');
    const said = t.messages.map((m) => m.content);
    expect(said).toContain("Evening, Sam. Here's your Wednesday.");
    expect(t.last().content).toBe(
      'Three things to sort tonight, about a minute. Want to go through them?',
    );
    const offer = t.last().metadata_json as unknown as BriefOfferMeta;
    expect(offer.buttons.map((b) => b.label)).toContain('Not tonight');
  });

  it('never offers the week at the opening: the weekly review belongs to the close', async () => {
    // even on their weekly day
    Object.assign(mockWeek, { loaded: true, weeklyDay: 3, review: null });
    const t = setup();
    await act(() => t.hook.result.current.open());
    const offer = t.last().metadata_json as unknown as BriefOfferMeta;
    expect(offer.buttons.map((b) => b.action)).not.toContain('plan_week');
  });
});

describe('the wrap up: coming back', () => {
  it('picks up from the state the thread kept', async () => {
    const saved: WrapUpState = {
      started_at: '2026-09-30T20:40:00.000Z',
      step: 'partial',
      path: null,
      items: ['a', 'b', 'n'],
      decisions: [record('a')],
      credited: 1,
    };
    const t = setup({}, saved);
    await act(() => t.hook.result.current.open());
    // no second opener: the buttons for where it was left
    expect(t.said()).toEqual([['brief-offer', '']]);
    expect((t.last().metadata_json as any).kind).toBe('wrap_partial');
    expect(t.hook.result.current.wrap?.decisions).toHaveLength(1);
  });

  it('puts the buttons back after an ordinary chat turn took them away', async () => {
    const t = setup();
    await act(() => t.hook.result.current.open());
    // a typed message and Gremly's reply: no offer is live any more
    const turn = [msg('user', 'What is on tomorrow?', {}), msg('assistant', 'Two meetings.', {})];
    const t2 = setup({ messages: [...t.messages, ...turn] });
    await act(() => t2.hook.result.current.resume());
    expect(t2.last().content).toBe('');
    expect((t2.last().metadata_json as any).kind).toBe('wrap_up');
    // and not twice
    const n = t2.messages.length;
    await act(() => t2.hook.result.current.resume());
    expect(t2.messages).toHaveLength(n);
  });

  it('says once when new things were dropped after it was finished', async () => {
    const t = await clearNight();
    await toQuestions(t);
    await act(() => t.hook.result.current.handleButton(...t.button('night')));
    mockCards = [card('new1')];
    await act(() => t.hook.result.current.open());
    expect(t.last().content).toBe(
      'One new thing since we wrapped up. Sort it now, or leave it for the morning?',
    );
    const n = t.messages.length;
    // sorted: a receipt and All sorted, and the evening is not gone through again
    await act(() => t.hook.result.current.handleButton(...t.button('sweep')));
    act(() => recordDecision(record('new1'), jest.fn()));
    await act(() => t.hook.result.current.backFromCards());
    expect(types(t).slice(n)).toEqual(['brief-reply', 'sweep-receipt', 'brief-text']);
    expect(currentWrap()?.step).toBe('done');
    // and it is not offered a second time
    const m = t.messages.length;
    await act(() => t.hook.result.current.open());
    expect(t.messages).toHaveLength(m);
  });
});

describe('the wrap up: after midnight', () => {
  it('names tomorrow by its weekday, and still writes the day being wrapped up', async () => {
    mockLate = true;
    const t = setup();
    await act(() => t.hook.result.current.open());
    expect(t.messages[1].content).toBe("Still up, Sam? Here's your Wednesday.");
    const offer = t.last().metadata_json as unknown as BriefOfferMeta;
    expect(offer.buttons[1].label).toBe('Move it all to Thursday');
    await act(() => t.hook.result.current.handleButton(...t.button('sweep_skip')));
    expect(mockApplyDecision.mock.calls.every((c) => c[0].dueDateStr === TOMORROW)).toBe(true);
    expect(t.said()).toContainEqual(['brief-event', 'Moved 2 todos to Thursday']);
  });
});

describe('the wrap up: before the evening', () => {
  beforeEach(() => {
    mockEarly = true;
  });

  it('opens on the day so far, and nothing says tonight', async () => {
    const t = setup();
    await act(() => t.hook.result.current.open());
    expect(t.messages[1].content).toBe("Here's your Wednesday so far, Sam.");
    expect(t.last().content).toBe('Three things to sort, about a minute. Want to go through them?');
    const offer = t.last().metadata_json as unknown as BriefOfferMeta;
    expect(offer.buttons.map((b) => b.label)).toEqual([
      'Sweep now',
      'Move it all to tomorrow',
      'Not now',
    ]);
    // every change is stamped, so the evening knows this was earlier in the day
    expect(currentWrap()?.touched_at).toBeTruthy();
  });

  it('Not now leaves it all where it is, with the journal one tap away', async () => {
    const t = setup();
    await act(() => t.hook.result.current.open());
    await act(() => t.hook.result.current.handleButton(...t.button('not_tonight')));
    expect(t.last().content).toBe("No problem. It's all here whenever you want it.");
    expect(currentWrap()?.step).toBe('declined');
    expect(mockCompleted).not.toHaveBeenCalled();
    await act(() => t.hook.result.current.handleButton(...t.button('journal_only')));
    expect(t.last().content).toBe('Of course. How is today going?');
  });

  it("goes through to the close in the day's words", async () => {
    mockState.habits = [{ id: 'h1', name: 'Blinkist', start_date: '2026-09-01', cadence: 'daily' }];
    mockMeetings.mockReturnValue([]);
    const t = await clearNight();
    expect(t.messages[3].content).toBe('Nothing to sort.');
    // the habits card knows it was asked before the evening
    expect(t.card('sweep-habits').metadata_json).toMatchObject({ early: true });
    await act(() => t.hook.result.current.habits.save(t.card('sweep-habits'), [], {}));
    expect(t.messages.map((m) => m.content)).toContain("No problem. There's still time today.");
    expect(t.last().content).toBe('How is today going?');
    const journal = t.last().metadata_json as unknown as BriefOfferMeta;
    expect(journal.buttons.map((b) => b.label)).toEqual([
      'Write a few lines',
      'Open my journal',
      'Just pick a mood',
      'Skip',
    ]);
    await toQuestions(t);
    const close = t.last().metadata_json as unknown as BriefOfferMeta;
    expect(close.buttons.map((b) => b.label)).toEqual(['Thanks, Gremly', 'Plan tomorrow']);
    await act(() => t.hook.result.current.handleButton(...t.button('night')));
    expect(t.said()).toContainEqual(['brief-text', 'Enjoy the rest of your day, Sam.']);
    expect(currentWrap()?.step).toBe('done');
    expect(t.messages.every((m) => !/tonight|night/i.test(m.content ?? ''))).toBe(true);
  });

  it('a journal entry written before the evening is named for that part of the day', async () => {
    const t = await clearNight();
    await act(async () => {
      await t.hook.result.current.takeTyped('Good morning of work.');
    });
    expect(mockSaveJournal).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Good morning of work.', part: 'afternoon' }),
    );
  });
});

describe("the wrap up: Gremly's own words", () => {
  /** Gremly's words for each moment, as the Worker sends them. */
  function words(by: Partial<Record<string, unknown>>) {
    mockWrapWords.mockImplementation(async (req: { moment: string }) => by[req.moment] ?? null);
  }

  it('opens in his words, after the time, with the day in numbers and the cards', async () => {
    words({ open: { line: 'A full day, Sam, and the deck went out.' } });
    mockState.todos = [{ id: 'p1', name: 'Book the car service' }];
    const plan = msg('system', '', {
      type: 'brief-plan',
      status: 'locked',
      date: DAY,
      items: [{ id: 'p1', kind: 'todo', title: 'Book the car service', start: 900, end: 915 }],
    });
    const t = setup({ messages: [plan] });
    await act(() => t.hook.result.current.open());
    expect(types(t).slice(1)).toEqual(['brief-event', 'brief-text', 'sweep-recap', 'brief-offer']);
    expect(t.messages[2].content).toBe('A full day, Sam, and the deck went out.');
    // his words look back on the day themselves: no fixed line for what did not happen
    expect(t.messages.map((m) => m.content)).not.toContain(
      "One thing you planned didn't happen: Book the car service.",
    );
    // he was told the day as the app holds it
    const req = mockWrapWords.mock.calls[0][0];
    expect(req).toMatchObject({
      moment: 'open',
      day: DAY,
      weekday: 'Wednesday',
      part: 'evening',
      cards: 3,
      day_end: '3 AM',
      tomorrow_word: 'tomorrow',
    });
    expect(req.recap.missed).toEqual([{ id: 'p1', title: 'Book the car service' }]);
    expect(t.hook.result.current.typing).toBe(false);
  });

  it('asks about the day, replies to the entry, and closes in his words', async () => {
    words({
      open: { line: 'A quiet one, and everything got done. This will be short.' },
      journal_ask: { line: 'What made today feel good?' },
      journal_reply: {
        journal: true,
        reply: 'That sounds like a lovely slow day. It is saved in your journal.',
      },
      close: { line: 'Wednesday is wrapped up, and tomorrow is open.' },
    });
    const t = await clearNight();
    // no fixed line for a clear night: his opening said it
    expect(t.messages.map((m) => m.content)).not.toContain('Nothing to sort tonight.');
    expect(t.last().content).toBe('What made today feel good?');
    await act(async () => {
      await t.hook.result.current.takeTyped('Slow day, cooked dinner.');
    });
    expect(t.said()).toContainEqual([
      'brief-text',
      'That sounds like a lovely slow day. It is saved in your journal.',
    ]);
    expect(mockWrapWords.mock.calls.find((c) => c[0].moment === 'journal_reply')[0].entry).toBe(
      'Slow day, cooked dinner.',
    );
    expect(t.card('sweep-journal').metadata_json).toMatchObject({
      status: 'saved',
      note_id: 'note-1',
    });
    expect(t.last().content).toBe('Wednesday is wrapped up, and tomorrow is open.');
    const close = mockWrapWords.mock.calls.find((c) => c[0].moment === 'close')[0];
    expect(close.tonight).toMatchObject({ journal: 'written', path: 'clear' });
  });

  it('hands words typed for the journal to him when they were for him, and takes them back out', async () => {
    words({ journal_reply: { journal: false, reply: '' } });
    const revert = jest.fn().mockResolvedValue(undefined);
    mockSaveJournal.mockResolvedValue({
      ok: true,
      noteId: 'note-2',
      title: 'Wednesday evening',
      revert,
      moods: Promise.resolve(null),
    });
    const askGremly = jest.fn().mockResolvedValue({ answered: true, card: false });
    const t = await clearNight({ askGremly });
    await act(async () => {
      await t.hook.result.current.takeTyped('Can you move the dentist to Friday?');
    });
    expect(askGremly).toHaveBeenCalledWith('Can you move the dentist to Friday?', {});
    expect(revert).toHaveBeenCalled();
    expect(t.said()).not.toContainEqual(['brief-text', WRAP_COPY.journalSaved]);
    expect(currentWrap()?.journal).toBeNull();
    // the journal waits as it was
    expect((t.last().metadata_json as any).kind).toBe('journal');
  });

  it('reacts to the cards and the habits, and says goodnight, told what he has said and who he is', async () => {
    mockState.gremlyAge = 61;
    mockState.currentTierName = 'Sage';
    mockState.isFedToday = true;
    mockState.habits = [{ id: 'h1', name: 'Blinkist', start_date: '2026-09-01', cadence: 'daily' }];
    words({
      open: { line: 'A full day, Sam.' },
      sorted: { line: 'Everything has a home now.' },
      habits: { line: 'Blinkist again, lovely.' },
      close: { line: 'Wednesday is wrapped up.' },
      night: { line: 'Rest well, Sam.' },
    });
    const t = setup();
    await act(() => t.hook.result.current.open());
    await act(() => t.hook.result.current.handleButton(...t.button('sweep')));
    act(() => {
      recordDecision(record('a'), jest.fn());
      recordDecision(record('b', 'let_go'), jest.fn());
      recordDecision(record('n'), jest.fn());
    });
    await act(() => t.hook.result.current.backFromCards());
    expect(t.said()).toContainEqual(['brief-text', 'Everything has a home now.']);
    const sorted = mockWrapWords.mock.calls.find((c) => c[0].moment === 'sorted')[0];
    // the cards just fed him, and he knows what he said when it opened
    expect(sorted.tonight.fed_by_cards).toBe(true);
    expect(sorted.said).toContain('A full day, Sam.');
    expect(sorted.gremly).toEqual({
      age: 61,
      tier: 'Sage',
      nature: 'Warm, steady, occasionally profound.',
      fed_today: true,
    });
    await act(() => t.hook.result.current.habits.save(t.card('sweep-habits'), ['h1'], {}));
    expect(t.said()).toContainEqual(['brief-text', 'Blinkist again, lovely.']);
    expect(t.said()).not.toContainEqual(['brief-text', expect.stringContaining('Logged.')]);
    const habits = mockWrapWords.mock.calls.find((c) => c[0].moment === 'habits')[0];
    expect(habits.tonight.logged).toEqual(['Blinkist']);
    expect(habits.said).toContain('Everything has a home now.');
    await toQuestions(t);
    expect(t.last().content).toBe('Wednesday is wrapped up.');
    // his goodnight is asked for as the close is said, knowing the close
    const night = mockWrapWords.mock.calls.filter((c) => c[0].moment === 'night');
    expect(night).toHaveLength(1);
    expect(night[0][0].said).toContain('Wednesday is wrapped up.');
    await act(() => t.hook.result.current.handleButton(...t.button('night')));
    // the tap shows at once, then his words and the end card
    expect(types(t).slice(-3)).toEqual(['brief-reply', 'brief-text', 'sweep-end']);
    expect(t.messages[t.messages.length - 2].content).toBe('Rest well, Sam.');
    expect(mockWrapWords.mock.calls.filter((c) => c[0].moment === 'night')).toHaveLength(1);
    expect(currentWrap()?.step).toBe('done');
  });

  it('says the line before his questions in his words when he chose every one', async () => {
    mockFetchQuestions.mockResolvedValue([Q1, Q2]);
    words({
      questions: {
        intro: 'Just one thing, so I get it right.',
        ask: [{ id: 'q2', question: 'Friday or Saturday?', choices: ['Friday', 'Saturday'] }],
      },
    });
    const t = await clearNight();
    await toQuestions(t);
    expect(t.messages[t.messages.length - 2].content).toBe('Just one thing, so I get it right.');
    expect(t.last().content).toBe('Friday or Saturday?');
  });

  it("chooses tonight's questions, in his words with answers to tap", async () => {
    mockFetchQuestions.mockResolvedValue([Q1, Q2]);
    words({
      questions: {
        ask: [
          {
            id: 'q2',
            question: 'Is the anniversary Friday or Saturday?',
            choices: ['Friday', 'Saturday'],
          },
        ],
      },
    });
    const t = await clearNight();
    await toQuestions(t);
    expect(t.messages[t.messages.length - 2].content).toBe(
      "One quick thing I'd like to get right, then you're done.",
    );
    expect(t.last().content).toBe('Is the anniversary Friday or Saturday?');
    const offer = t.last().metadata_json as unknown as BriefOfferMeta;
    expect(offer.question_id).toBe('q2');
    expect(offer.buttons.map((b) => b.label)).toEqual([
      'Friday',
      'Saturday',
      WRAP_COPY.questionOther,
      WRAP_COPY.questionSkip,
    ]);
    expect(currentWrap()).toMatchObject({ questions: ['q2'] });
  });

  it('hands an answer to him, and waits for the card he puts up before the next question', async () => {
    mockFetchQuestions.mockResolvedValue([Q1, Q2]);
    mockState.notes = [{ id: 'n1', title: 'Dentist Appointment', target_date: '2026-10-02' }];
    const askGremly = jest
      .fn()
      .mockResolvedValueOnce({ answered: true, card: true })
      .mockResolvedValue({ answered: true, card: false });
    const t = await clearNight({ askGremly });
    await toQuestions(t);
    const [offer] = t.button('answer');
    const monday = (offer.metadata_json as unknown as BriefOfferMeta).buttons[1];
    await act(() => t.hook.result.current.handleButton(offer, monday));
    expect(mockAnswer).toHaveBeenCalledWith('q1', 'Monday');
    expect(askGremly).toHaveBeenCalledWith('Monday', {
      answering: {
        question: Q1.question,
        item: expect.objectContaining({ id: 'n1', kind: 'note', title: 'Dentist Appointment' }),
      },
    });
    // his reply and card are his turn's; the wrap up adds only that the answer is saved
    expect(t.said()).toContainEqual(['brief-event', WRAP_COPY.savedEvent]);
    expect(t.said().map((x) => x[1])).not.toContain(
      "Thanks, saved. Here's the note, in case it needs changing.",
    );
    // the card waits for its tap: no second question yet
    expect(t.last().content).not.toBe(Q2.question);
    // the card was tapped and the turn is done: on to the next question
    await act(() => t.hook.result.current.resume());
    expect(t.last().content).toBe(Q2.question);
  });

  it('says its own lines when his words do not come', async () => {
    words({});
    const t = await clearNight();
    expect(t.messages.map((m) => m.content)).toContain('Nothing to sort tonight.');
    expect(t.last().content).toBe(WRAP_COPY.journalAsk);
  });
});
