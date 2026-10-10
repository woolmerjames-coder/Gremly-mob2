/**
 * CardAsk and CardDupe: a drop card's questions, asked on the card (Mind Drop
 * rethink stage 6). The answers go through askActions (mocked here, tested in
 * askActions.test.ts) and the relation actions (tested in
 * relationActions.test.ts).
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    { get: (_t, name) => () => React.createElement(View, { testID: `icon-${String(name)}` }) },
  );
});
const mockReduced = { value: true };
jest.mock('../../../design/animations', () => ({ useReducedMotion: () => mockReduced.value }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
const mockState: any = { todos: [], habits: [], notes: [], habitProgress: [], weeklyDay: 0 };
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
}));
jest.mock('../../../lib/minddrop/askActions', () => ({
  answerAsk: jest.fn(),
  notNow: jest.fn(),
}));
const mockPickers: Record<string, (event: { type: string }, at?: Date) => void> = {};
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (p: { testID: string; onChange: (event: { type: string }, at?: Date) => void }) => {
      mockPickers[p.testID] = p.onChange;
      return React.createElement(View, { testID: p.testID });
    },
  };
});
jest.mock('../../../lib/minddrop/bookedReminder', () => ({
  remindersAheadNow: jest.fn(),
  remindBefore: jest.fn(),
}));
jest.mock('../../../lib/minddrop/splitActions', () => ({
  splitDropNow: jest.fn(),
  keepSplitAsOne: jest.fn(),
  logSplitAnswer: jest.fn(),
  numberWord: (n: number) => ['zero', 'one', 'two', 'three', 'four'][n] ?? String(n),
}));
const mockGone: { value: string | null } = { value: null };
jest.mock('../../../lib/minddrop/relationActions', () => ({
  applyDropRelation: jest.fn(),
  leavingCardIds: jest.fn(),
  currentEntity: (e: any) =>
    mockGone.value ? { entity: null, gone: mockGone.value } : { entity: e, gone: null },
  changeNow: () => null,
}));

import { ASK_SWAP_MS, CardAsk, CardDupe, GLIDE_MS } from '../CardAsk';
import { ASK_CHOSEN_MS, ASK_CLOSE_MS } from '../AskStrip';
import { answerAsk, notNow } from '../../../lib/minddrop/askActions';
import { applyDropRelation, leavingCardIds } from '../../../lib/minddrop/relationActions';
import { cardDupeAsk, cardStripAsk } from '../../../lib/minddrop/asks';
import { keepSplitAsOne, logSplitAnswer, splitDropNow } from '../../../lib/minddrop/splitActions';
import { remindBefore, remindersAheadNow } from '../../../lib/minddrop/bookedReminder';
import { buildFallbackClarification } from '../../../lib/minddrop/clarification';
import { DIDNT_GO, PlainError } from '../../../lib/minddrop/plainError';
import { parseISO } from 'date-fns';
import { eventBus } from '../../../lib/events/EventBus';
import { getDateService } from '../../../lib/date/DateService';
import { TOAST_AFTER_CARDS_MS } from '../../../lib/minddrop/popupTiming';
import type { UnifiedDrop } from '../../../types/UnifiedDrop';

const ds = getDateService();
let today = '';

const options = [
  {
    id: 'opt_1',
    label: 'It’s booked',
    action: {
      bucket: 'log',
      subtype: 'event',
      target_date: true,
      scheduled_date: false,
      followUp: 'when',
    },
  },
  {
    id: 'opt_2',
    label: 'I need to book it',
    action: { bucket: 'todo', subtype: null, target_date: false, scheduled_date: false },
  },
];

const unclear = (): UnifiedDrop =>
  ({
    id: 'n1',
    kind: 'note',
    title: 'Dentist',
    text: 'dentist',
    created_at: `${today}T09:00:00`,
    needs_clarification: true,
    clarification_question: 'Is the dentist already booked?',
    clarification_options: options,
    views: {
      minddrop_stage: 'settled',
      needs_clarification: true,
      ask_since: today,
      ask_on_card: true,
    },
  }) as unknown as UnifiedDrop;

const vet = {
  id: 't1',
  type: 'todo' as const,
  title: 'Call the vet about the booster',
  due_day: null,
  due_time: null,
};
const other = {
  id: 't2',
  type: 'todo' as const,
  title: 'Call the vet about Pepper',
  due_day: null,
  due_time: null,
};
const classified = {
  bucket: 'todo',
  subtype: null,
  habitSubtype: null,
  needsClarification: false,
  ambiguityType: null,
  clarificationQuestion: null,
  clarificationOptions: null,
};
const related = (relation: Record<string, unknown>): UnifiedDrop =>
  ({
    id: 'd1',
    kind: 'todo',
    title: 'Vet on Friday',
    text: 'move the vet to friday',
    created_at: `${today}T09:00:00`,
    views: {
      minddrop_stage: 'saved',
      ask_since: today,
      ask_on_card: true,
      relation: { status: 'pending', classified, surface: 'card', confidence: 90, ...relation },
    },
  }) as unknown as UnifiedDrop;
const moveTo = () =>
  related({
    kind: 'edit',
    intent: 'edit',
    entity: vet,
    others: [other],
    change: { field: 'due_day', from: null, to: ds.addDays(today, 2) },
  });

const tick = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  mockReduced.value = true;
  jest.useFakeTimers();
  today = ds.today();
  mockGone.value = null;
  mockState.todos = [
    { id: 't1', name: 'Call the vet about the booster', due_day: today },
    { id: 't2', name: 'Call the vet about Pepper', due_day: null },
  ];
  (answerAsk as jest.Mock).mockResolvedValue(null);
  (notNow as jest.Mock).mockResolvedValue(undefined);
  (leavingCardIds as jest.Mock).mockReturnValue(['d1']);
  // no reminder still ahead unless a test says so
  (remindersAheadNow as jest.Mock).mockReturnValue([]);
  (remindBefore as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('an unclear drop asks on its card', () => {
  it('shows the question, its answers and Something else, and answers through answerAsk', async () => {
    const item = unclear();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    expect(r.getByText('Is the dentist already booked?')).toBeTruthy();
    expect(r.getByText('I need to book it')).toBeTruthy();
    expect(r.getByText('Something else')).toBeTruthy();
    fireEvent.press(r.getByTestId('minddrop-ask-n1-option-opt_2'));
    await tick(ASK_CHOSEN_MS);
    expect(answerAsk).toHaveBeenCalledWith('n1', {
      kind: 'clarify',
      optionId: 'opt_2',
      isFreeText: undefined,
      when: null,
    });
  });

  it('sends what they type as their own answer', async () => {
    const item = unclear();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-something-else'));
    fireEvent.changeText(r.getByTestId('minddrop-ask-n1-field'), 'a check up on the 20th');
    fireEvent.press(r.getByTestId('minddrop-ask-n1-go'));
    await tick(ASK_CHOSEN_MS);
    expect(answerAsk).toHaveBeenCalledWith('n1', {
      kind: 'clarify',
      optionId: 'a check up on the 20th',
      isFreeText: true,
      when: null,
    });
  });

  it('a booked answer asks When is it? next, with three days and Not now', async () => {
    const item = unclear();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-option-opt_1'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    expect(answerAsk).not.toHaveBeenCalled();
    expect(r.getByText('When is it?')).toBeTruthy();
    expect(r.getByText('Tomorrow')).toBeTruthy();
    expect(r.getByText('Next week')).toBeTruthy();
    expect(r.getByText('You can add a time later')).toBeTruthy();
    fireEvent.press(r.getByTestId('minddrop-ask-n1-when-tomorrow'));
    await tick(ASK_CHOSEN_MS);
    expect(answerAsk).toHaveBeenCalledWith('n1', {
      kind: 'clarify',
      optionId: 'opt_1',
      isFreeText: undefined,
      when: { date: ds.addDays(today, 1), time: null },
    });
  });

  it('Pick a date opens a calendar, and Save files it on the day picked, with a time when one is set', async () => {
    const item = unclear();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-option-opt_1'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-when-pick'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    const day = ds.addDays(today, 10);
    act(() => mockPickers['minddrop-ask-n1-picker-calendar']({ type: 'set' }, parseISO(day)));
    fireEvent.press(r.getByTestId('minddrop-ask-n1-picker-time'));
    act(() =>
      mockPickers['minddrop-ask-n1-picker-time-wheel']({ type: 'set' }, parseISO(`${day}T09:30`)),
    );
    expect(r.getByText(/^Save for .*, 9:30 AM$/)).toBeTruthy();
    fireEvent.press(r.getByTestId('minddrop-ask-n1-pick-save'));
    await tick(ASK_CHOSEN_MS);
    expect(remindersAheadNow).toHaveBeenCalledWith(day, '09:30');
    expect(answerAsk).toHaveBeenCalledWith('n1', {
      kind: 'clarify',
      optionId: 'opt_1',
      isFreeText: undefined,
      when: { date: day, time: '09:30' },
    });
  });

  it('asks Want a reminder? once the day is set, and saves the one picked after the answer', async () => {
    (remindersAheadNow as jest.Mock).mockReturnValue(['evening', 'hour']);
    let answered = (_v: unknown) => {};
    (answerAsk as jest.Mock).mockReturnValue(
      new Promise((r) => {
        answered = r;
      }),
    );
    const item = unclear();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-option-opt_1'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-when-next-week'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    expect(r.getByText('Want a reminder?')).toBeTruthy();
    expect(r.getByText('The evening before')).toBeTruthy();
    expect(r.getByText('An hour before')).toBeTruthy();
    expect(r.getByText('No thanks')).toBeTruthy();
    fireEvent.press(r.getByTestId('minddrop-ask-n1-remind-evening'));
    await tick(ASK_CHOSEN_MS);
    // it waits for the answer to go through
    expect(remindBefore).not.toHaveBeenCalled();
    await act(async () => answered(null));
    await tick(0);
    expect(remindBefore).toHaveBeenCalledWith('n1', 'evening');
  });

  it('offers An hour before only when it is still ahead, and No thanks closes it', async () => {
    (remindersAheadNow as jest.Mock).mockReturnValue(['evening']);
    const item = unclear();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-option-opt_1'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-when-next-week'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    expect(r.queryByText('An hour before')).toBeNull();
    fireEvent.press(r.getByTestId('minddrop-ask-n1-remind-no'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    expect(remindBefore).not.toHaveBeenCalled();
  });

  it('says so when the reminder did not save, and lets them try again', async () => {
    (remindersAheadNow as jest.Mock).mockReturnValue(['evening']);
    (remindBefore as jest.Mock).mockRejectedValue(new Error('offline'));
    const item = unclear();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-option-opt_1'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-when-next-week'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-remind-evening'));
    await tick(ASK_CHOSEN_MS);
    await tick(0);
    expect(r.getByText('That did not go through. Try again in a moment.')).toBeTruthy();
    expect(r.getByText('Want a reminder?')).toBeTruthy();
  });

  it('asks with the fixed copy when the saved question is not usable, and sends the answer it showed', async () => {
    const item = {
      ...unclear(),
      clarification_question: null,
      clarification_options: null,
      views: { ...unclear().views, ambiguity_type: 'date_type' },
    } as unknown as UnifiedDrop;
    const shown = buildFallbackClarification('date_type');
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    expect(r.getByText(shown.question)).toBeTruthy();
    fireEvent.press(r.getByTestId('minddrop-ask-n1-option-opt_2'));
    await tick(ASK_CHOSEN_MS);
    expect(answerAsk).toHaveBeenCalledWith('n1', {
      kind: 'clarify',
      optionId: 'opt_2',
      isFreeText: undefined,
      when: null,
      fallbackOption: shown.options[1],
    });
  });

  it('Not now on When is it? files it without a day', async () => {
    const item = unclear();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-option-opt_1'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-not-now'));
    expect(answerAsk).toHaveBeenCalledWith('n1', {
      kind: 'clarify',
      optionId: 'opt_1',
      isFreeText: undefined,
      when: null,
    });
  });

  it('Not now keeps it as it is', () => {
    const item = unclear();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-not-now'));
    expect(notNow).toHaveBeenCalledWith('n1');
    expect(answerAsk).not.toHaveBeenCalled();
  });

  it('says so when the answer changed nothing, rather than sitting there', async () => {
    const item = unclear();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-n1-option-opt_2'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    expect(r.getByText('That did not go through. Try again in a moment.')).toBeTruthy();
  });

  it('closes once the question has gone from the item', async () => {
    const item = unclear();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    r.rerender(<CardAsk item={item} ask={null} />);
    await tick(ASK_SWAP_MS);
    expect(r.queryByTestId('minddrop-ask-n1')).toBeNull();
  });
});

describe('a drop about something they already have', () => {
  it('asks with the item it means, and a yes holds the cards, then slides them away with the toast', async () => {
    const said: unknown[] = [];
    const offs = [
      eventBus.on('minddrop:cards_leaving', (p) => said.push(['leaving', p])),
      eventBus.on('minddrop:cards_go', (p) => said.push(['go', p])),
      eventBus.on('minddrop:relation_done', (p) => said.push(['toast', p.title])),
      eventBus.on('gremly:speak', (p) => said.push(['bubble', p.message])),
    ];
    const undo = jest.fn();
    (answerAsk as jest.Mock).mockResolvedValue({
      summary: 'Moved the vet to Sunday.',
      confirm: 'Moved',
      toast: { icon: 'moved', title: 'Moved “Call the vet”', detail: 'Drop archived' },
      targetId: 't1',
      targetType: 'todo',
      undo,
    });
    const item = moveTo();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    expect(r.getByText('Is this the one?')).toBeTruthy();
    expect(r.getByText('Call the vet about the booster')).toBeTruthy();
    expect(r.getByText('Yes, move it')).toBeTruthy();
    expect(r.getByText('Not that one')).toBeTruthy();

    fireEvent.press(r.getByTestId('minddrop-ask-d1-yes'));
    await tick(ASK_CHOSEN_MS);
    expect(answerAsk).toHaveBeenCalledWith('d1', {
      kind: 'relation',
      yes: true,
      picked: undefined,
    });
    expect(said[0]).toEqual(['leaving', { ids: ['d1'], hold: true }]);
    // the bubble speaks once the strip has closed, as the cards go
    expect(said).not.toContainEqual(['bubble', 'Moved the vet to Sunday.']);
    await tick(ASK_CLOSE_MS);
    expect(said).toContainEqual(['bubble', 'Moved the vet to Sunday.']);
    await tick(TOAST_AFTER_CARDS_MS);
    expect(said).toContainEqual(['go', { ids: ['d1'] }]);
    expect(said).toContainEqual(['toast', 'Moved “Call the vet”']);
    offs.forEach((off) => off());
  });

  it('says why when the yes could not be made, and lets the cards stay', async () => {
    const stays: unknown[] = [];
    const off = eventBus.on('minddrop:cards_stay', (p) => stays.push(p));
    (answerAsk as jest.Mock).mockRejectedValue(new PlainError('That one is already done.'));
    const item = moveTo();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-d1-yes'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    expect(r.getByText('That one is already done.')).toBeTruthy();
    expect(stays).toEqual([{ ids: ['d1'] }]);
    off();
  });

  it('never shows an error’s own words: anything but our plain messages reads That did not go through', async () => {
    (answerAsk as jest.Mock).mockRejectedValue(
      new Error('new row violates row-level security policy for table "todos"'),
    );
    const item = moveTo();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-d1-yes'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    expect(r.getByText(DIDNT_GO)).toBeTruthy();
    expect(r.queryByText(/row-level security/)).toBeNull();
  });

  it('Not that one offers the others that fit, then None of these keeps it as new', async () => {
    const item = moveTo();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-d1-no'));
    await tick(ASK_CHOSEN_MS);
    await tick(ASK_SWAP_MS);
    expect(r.getByText('Which one did you mean?')).toBeTruthy();
    expect(r.getByText('Call the vet about Pepper')).toBeTruthy();
    fireEvent.press(r.getByTestId('minddrop-ask-d1-none'));
    await tick(ASK_CHOSEN_MS);
    expect(answerAsk).toHaveBeenCalledWith('d1', { kind: 'relation', yes: false });
  });

  it('a which one answer shows its candidates as buttons', async () => {
    const item = related({
      kind: 'choose',
      intent: 'edit',
      candidates: [vet, other],
      change: null,
      value: null,
    });
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    expect(r.getByText('Which one did you mean?')).toBeTruthy();
    fireEvent.press(r.getByTestId('minddrop-ask-d1-pick-t2'));
    await tick(ASK_CHOSEN_MS);
    expect(answerAsk).toHaveBeenCalledWith('d1', {
      kind: 'relation',
      yes: true,
      picked: expect.objectContaining({ id: 't2' }),
    });
  });

  it('a which one about a habit shows the habit picked with its week, its next dot filling, after Log it', async () => {
    const run = { id: 'h1', type: 'habit' as const, title: 'Run', frequency: '3x per week' };
    const walk = { id: 'h2', type: 'habit' as const, title: 'Walk', frequency: 'daily' };
    mockState.habits = [{ id: 'h1', name: 'Run', cadence: 'weekly', target_per_period: 3 }];
    mockState.habitProgress = [];
    (answerAsk as jest.Mock).mockResolvedValue({
      summary: 'Logged Run for today.',
      confirm: 'Logged',
      toast: {
        icon: 'logged',
        title: 'Logged “Run” for today',
        detail: 'Your journal entry stays',
      },
      targetId: 'h1',
      targetType: 'habit',
      undo: jest.fn(),
    });
    // with motion on, the dot gets its moment before the strip closes
    mockReduced.value = false;
    const item = related({
      kind: 'choose',
      intent: 'logged',
      candidates: [run, walk],
      change: null,
      value: null,
    });
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    expect(r.queryByTestId('minddrop-ask-d1-item')).toBeNull();
    fireEvent.press(r.getByTestId('minddrop-ask-d1-pick-h1'));
    await tick(ASK_CHOSEN_MS);
    expect(r.getByTestId('minddrop-ask-d1-item')).toBeTruthy();
    expect(r.getByLabelText('1 of 3 this week')).toBeTruthy();
  });

  it('says so when the item has gone since, and offers to keep it as new', async () => {
    mockGone.value = 'That one is already done.';
    const item = moveTo();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    expect(r.getByText('That one is already done.')).toBeTruthy();
    fireEvent.press(r.getByTestId('minddrop-ask-d1-keep-new'));
    await tick(ASK_CHOSEN_MS);
    expect(answerAsk).toHaveBeenCalledWith('d1', { kind: 'relation', yes: false });
  });

  it('never asks one that came after the settle', () => {
    const item = moveTo();
    (item.views as any).relation.surface = 'sweep';
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    expect(r.queryByTestId('minddrop-ask-d1')).toBeNull();
  });
});

describe('the quiet duplicate line', () => {
  const dupe = () => {
    const item = related({ kind: 'same', intent: 'same', entity: vet, others: [], extra: null });
    (item.views as any).minddrop_stage = 'settled';
    return item;
  };

  it('says the one they have is due today, and asks nothing', () => {
    const item = dupe();
    expect(cardStripAsk(item)).toBeNull();
    const r = render(<CardDupe item={item} ask={cardDupeAsk(item)!} />);
    expect(r.getByText(/^You already have this/)).toBeTruthy();
    expect(r.getByText('due today')).toBeTruthy();
  });

  it('Keep just one glides the drop into the one they had, which pulses once it arrives, then the toast', async () => {
    const said: unknown[] = [];
    const offs = [
      eventBus.on('minddrop:cards_leaving', (p) => said.push(['leaving', p])),
      eventBus.on('minddrop:card_pulse', (p) => said.push(['pulse', p])),
      eventBus.on('minddrop:relation_done', (p) => said.push(['toast', p.title])),
    ];
    (applyDropRelation as jest.Mock).mockResolvedValue({
      summary: 'Kept Call the vet about the booster.',
      confirm: 'Kept one',
      toast: {
        icon: 'kept',
        title: 'Kept “Call the vet about the booster”',
        detail: 'Drop archived',
      },
      targetId: 't1',
      targetType: 'todo',
      undo: jest.fn(),
    });
    const item = dupe();
    const r = render(<CardDupe item={item} ask={cardDupeAsk(item)!} />);
    fireEvent.press(r.getByTestId('minddrop-dupe-d1-keep-one'));
    await tick(ASK_SWAP_MS);
    expect(applyDropRelation).toHaveBeenCalledWith('d1');
    expect(said[0]).toEqual(['leaving', { ids: ['d1'], hold: true, as: 'into', into: 't1' }]);
    await tick(ASK_CLOSE_MS);
    // the drop is gliding: the one they had pulses when it arrives
    expect(said).not.toContainEqual(['pulse', { id: 't1' }]);
    await tick(GLIDE_MS);
    expect(said).toContainEqual(['pulse', { id: 't1' }]);
    await tick(TOAST_AFTER_CARDS_MS);
    expect(said).toContainEqual(['toast', 'Kept “Call the vet about the booster”']);
    offs.forEach((off) => off());
  });

  it('two quick taps on Keep just one keep one, once', async () => {
    (applyDropRelation as jest.Mock).mockReturnValue(new Promise(() => {}));
    const item = dupe();
    const r = render(<CardDupe item={item} ask={cardDupeAsk(item)!} />);
    const keep = r.getByTestId('minddrop-dupe-d1-keep-one');
    fireEvent.press(keep);
    fireEvent.press(keep);
    expect(applyDropRelation).toHaveBeenCalledTimes(1);
  });

  it('a which one about a duplicate is not shown on the card; Sweep asks it', () => {
    const item = related({
      kind: 'choose',
      intent: 'same',
      candidates: [vet, other],
      change: null,
      value: null,
    });
    (item.views as any).minddrop_stage = 'settled';
    expect(cardStripAsk(item)).toBeNull();
    expect(cardDupeAsk(item)).toBeNull();
  });
});

describe('an unsure split asks on its card', () => {
  const unsure = (over: Record<string, unknown> = {}): UnifiedDrop =>
    ({
      id: 's1',
      kind: 'todo',
      title: 'Clean out the garage and sort the donations',
      text: 'clean out the garage and sort the donations pile',
      created_at: `${today}T09:00:00`,
      views: {
        // asked from the sort, before its details are in
        minddrop_stage: 'saved',
        ask_since: today,
        split: {
          status: 'pending',
          pieces: [
            { text: 'clean out the garage', kind: 'todo' },
            { text: 'sort the donations pile', kind: 'todo' },
          ],
        },
        ...over,
      },
    }) as unknown as UnifiedDrop;

  it('asks One job or two? with its pieces shown, Split into two and Keep as one', () => {
    const item = unsure();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    expect(r.getByText('One job or two?')).toBeTruthy();
    expect(r.getByText('Clean out the garage')).toBeTruthy();
    expect(r.getByText('Sort the donations pile')).toBeTruthy();
    expect(r.getByText('Split into two')).toBeTruthy();
    expect(r.getByText('Keep as one')).toBeTruthy();
    expect(r.getByText('Keep as one is the safe choice')).toBeTruthy();
  });

  it('Split holds the card while its pieces are saved, then the card gives way to them', async () => {
    const said: unknown[] = [];
    const offs = [
      eventBus.on('minddrop:cards_leaving', (p) => said.push(['leaving', p])),
      eventBus.on('minddrop:cards_go', (p) => said.push(['go', p])),
    ];
    (splitDropNow as jest.Mock).mockResolvedValue([]);
    const item = unsure();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-s1-split'));
    await tick(ASK_CHOSEN_MS);
    expect(splitDropNow).toHaveBeenCalledWith('s1');
    expect(said[0]).toEqual(['leaving', { ids: ['s1'], hold: true, as: 'fade' }]);
    await tick(ASK_CLOSE_MS);
    expect(said).toContainEqual(['go', { ids: ['s1'] }]);
    offs.forEach((off) => off());
  });

  it('says why when the split could not be made, and the card stays', async () => {
    const stays: unknown[] = [];
    const off = eventBus.on('minddrop:cards_stay', (p) => stays.push(p));
    (splitDropNow as jest.Mock).mockRejectedValue(
      new PlainError('This one has already been sorted.'),
    );
    const item = unsure();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-s1-split'));
    await tick(ASK_CHOSEN_MS);
    expect(stays).toEqual([{ ids: ['s1'] }]);
    expect(r.getByText('This one has already been sorted.')).toBeTruthy();
    off();
  });

  it('Keep as one keeps the one item', async () => {
    (keepSplitAsOne as jest.Mock).mockResolvedValue(true);
    const item = unsure();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByTestId('minddrop-ask-s1-keep-one'));
    await tick(ASK_CHOSEN_MS);
    expect(keepSplitAsOne).toHaveBeenCalledWith('s1');
    expect(splitDropNow).not.toHaveBeenCalled();
  });

  it('Not now keeps it as one, and logs what the classifier said and what was tapped', async () => {
    const item = unsure();
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    fireEvent.press(r.getByText('Not now'));
    await tick(0);
    expect(notNow).toHaveBeenCalledWith('s1');
    expect(logSplitAnswer).toHaveBeenCalledWith('unsure', 'not_now', 2, { type: 'todo', id: 's1' });
  });

  it('says three when there are three', () => {
    const item = unsure({
      split: {
        status: 'pending',
        pieces: [
          { text: 'a', kind: 'todo' },
          { text: 'b', kind: 'habit' },
          { text: 'c', kind: 'question' },
        ],
      },
    });
    const r = render(<CardAsk item={item} ask={cardStripAsk(item)} />);
    expect(r.getByText('One job or three?')).toBeTruthy();
    expect(r.getByText('Split into three')).toBeTruthy();
  });
});
