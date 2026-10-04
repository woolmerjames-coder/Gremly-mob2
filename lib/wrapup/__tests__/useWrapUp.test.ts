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
jest.mock('../../supabase/client', () => ({
  supabase: { from: (table: string) => ({ insert: (row: unknown) => mockInsert(table, row) }) },
}));
const mockCompleted = jest.fn();
jest.mock('../../sweep/engine', () => ({
  markSweepCompleted: (...a: unknown[]) => mockCompleted(...a),
}));
const mockSaveJournal = jest.fn();
const mockSetMoods = jest.fn();
let mockJournalNote: string | null = null;
jest.mock('../journal', () => ({
  saveJournal: (...a: unknown[]) => mockSaveJournal(...a),
  setJournalMoods: (...a: unknown[]) => mockSetMoods(...a),
  journalFor: () => mockJournalNote,
  journalTitle: (weekday: string, written: boolean) =>
    written ? `${weekday} evening` : 'Evening reflection',
}));
const mockFetchQuestions = jest.fn();
jest.mock('../questions', () => ({
  ...jest.requireActual('../questions'),
  fetchWrapQuestions: () => mockFetchQuestions(),
}));
let mockLate = false;
jest.mock('../day', () => ({
  wrapNow: () => ({
    day: '2026-09-30',
    tomorrow: '2026-10-01',
    words: { weekday: 'Wednesday', tomorrow: mockLate ? 'Thursday' : 'tomorrow', late: mockLate },
    evening: true,
    dayEndHour: 3,
    dayStartMs: Date.parse('2026-09-30T10:00:00Z'),
  }),
}));

import { useWrapUp } from '../useWrapUp';
import { currentWrap, resetWrapSession, useWrapSession, recordDecision } from '../session';
import { WRAP_COPY } from '../words';

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
    openWeek: jest.fn(),
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
  seq = 0;
  mockLate = false;
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
  mockCompleted.mockResolvedValue({ streak: 5 });
  mockInsert.mockResolvedValue({ error: null });
  mockFetchQuestions.mockResolvedValue([]);
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
    expect(offer.buttons.map((b) => b.action)).toEqual([
      'sweep',
      'sweep_skip',
      'plan_week',
      'not_tonight',
    ]);
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
    expect(offer.buttons.map((b) => b.action)).toEqual(['sweep', 'plan_week', 'not_tonight']);
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

  it('logs nothing for Nothing tonight, or for a habit that did not hold', async () => {
    const t = await clearNight();
    await act(() => t.hook.result.current.habits.save(t.card('sweep-habits'), [], { h3: 'not' }));
    expect(mockApplyChange).not.toHaveBeenCalled();
    expect(t.messages.map((m) => m.content)).toContain(
      'No worries about No coffee, tomorrow is a fresh one.',
    );
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

describe("the wrap up: Gremly's questions", () => {
  beforeEach(() => {
    mockFetchQuestions.mockResolvedValue([Q1, Q2]);
    mockState.notes = [{ id: 'n1', title: 'Dentist Appointment', target_date: '2026-10-02' }];
  });

  it('asks up to two, one at a time, and shows the item an answer was about', async () => {
    const t = await clearNight();
    await toQuestions(t);
    expect(t.messages[t.messages.length - 2].content).toBe(
      "Two quick questions, then you're done.",
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

describe('the wrap up: the close', () => {
  it('says what tomorrow holds, and feeds for a night with nothing to sort', async () => {
    mockMeetings.mockImplementation((day: string) => (day === TOMORROW ? [{}, {}, {}] : []));
    const t = await clearNight();
    await toQuestions(t);
    expect(t.last().content).toBe(
      "That's Wednesday wrapped up. Tomorrow has three meetings, and nothing else lined up yet.",
    );
    expect(
      (t.last().metadata_json as unknown as BriefOfferMeta).buttons.map((b) => b.action),
    ).toEqual(['plan_tomorrow', 'night']);
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
    mockApplyDecision.mockImplementation(
      async (d: { candidateId: string; dueDateStr: string }) => ({
        ok: true,
        record: record(d.candidateId, 'kept', { fields: { day: d.dueDateStr } }),
        revert: jest.fn().mockResolvedValue(undefined),
      }),
    );
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
      "That's Wednesday wrapped up. Tomorrow has Todo a and Todo b lined up.",
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

  it('coming back after Not tonight offers the cards again, with no second journal ask', async () => {
    const t = setup();
    await act(() => t.hook.result.current.open());
    await act(() => t.hook.result.current.handleButton(...t.button('not_tonight')));
    await act(() => t.hook.result.current.open());
    expect(t.last().content).toBe('Sure. Three things to sort, about a minute.');
    expect((t.last().metadata_json as any).kind).toBe('wrap_up');
    expect(currentWrap()?.step).toBe('offer');
  });

  it('Plan my week opens the week planner and leaves the offer as it is', async () => {
    const t = setup();
    await act(() => t.hook.result.current.open());
    const n = t.messages.length;
    await act(() => t.hook.result.current.handleButton(...t.button('plan_week')));
    expect(t.calls.openWeek).toHaveBeenCalledTimes(1);
    expect(t.messages).toHaveLength(n);
    expect((t.last().metadata_json as any).chosen).toBeUndefined();
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
