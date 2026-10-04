/**
 * The ways into the wrap up as the screens read them (useEveningTeaser): the
 * chip at any hour, the offer once the day is done, the nudge in the evening.
 */
import { renderHook } from '@testing-library/react-native';
import type { WrapUpState } from '../../brief/types';
import { newWrapState } from '../state';

let mockMinutes = 14 * 60;
let mockPlanned: unknown[] = [];
jest.mock('../../brief/useDayCard', () => ({
  useNowMinutes: () => mockMinutes,
  plannedForDay: () => mockPlanned,
}));
let mockWrap: WrapUpState | null = null;
jest.mock('../../brief/todayThread', () => ({
  useTodayThread: (sel: (s: unknown) => unknown) =>
    sel({ thread: { metadata_json: { sweep: mockWrap } } }),
}));
const mockState: Record<string, unknown> = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: (sel: (s: unknown) => unknown) => sel(mockState),
}));
let mockCards: { candidate: { id: string } }[] = [];
let mockProgress = { totalEligible: 3, completedCount: 1 };
jest.mock('../../store/selectors', () => ({
  selectWrapUp: () => ({ cards: mockCards }),
  selectTodayProgress: () => mockProgress,
}));

import { useEveningTeaser } from '../useEveningTeaser';

const read = () => renderHook(() => useEveningTeaser()).result.current;
// the test clock is UTC: 2pm and 8:40pm on the same day
const AFTERNOON = '2026-09-30T14:00:00.000Z';
const TONIGHT = '2026-09-30T20:40:00.000Z';
const wrapAt = (step: WrapUpState['step'], touched_at: string): WrapUpState => ({
  ...newWrapState(AFTERNOON, ['a', 'b']),
  step,
  touched_at,
});

beforeEach(() => {
  mockMinutes = 14 * 60;
  mockPlanned = [];
  mockWrap = null;
  mockCards = [{ candidate: { id: 'a' } }, { candidate: { id: 'b' } }];
  mockProgress = { totalEligible: 3, completedCount: 1 };
  Object.keys(mockState).forEach((k) => delete mockState[k]);
  Object.assign(mockState, {
    dayBoundaryHour: 3,
    gremlyAge: 4,
    isFedToday: false,
    todos: [],
    habits: [],
  });
});

describe('the afternoon', () => {
  it('can be started, with nothing pushed forward', () => {
    expect(read()).toMatchObject({
      start: true,
      offer: false,
      nudge: false,
      evening: false,
      pinned: null,
      done: false,
      planned: false,
    });
  });

  it('is offered once everything on Today is done', () => {
    mockProgress = { totalEligible: 3, completedCount: 3 };
    expect(read()).toMatchObject({
      start: true,
      offer: true,
      nudge: false,
      pinned: 'Wrap up today: 2 things to decide',
    });
  });

  it('an empty Today is not a finished one', () => {
    mockProgress = { totalEligible: 0, completedCount: 0 };
    expect(read().offer).toBe(false);
  });

  it('says today has a plan once something is placed on it', () => {
    mockPlanned = [{ id: 't1' }];
    expect(read().planned).toBe(true);
  });

  it('finished early reads as wrapped up for the rest of the day', () => {
    mockWrap = wrapAt('done', AFTERNOON);
    mockState.isFedToday = true;
    expect(read()).toMatchObject({
      start: false,
      offer: false,
      nudge: false,
      done: true,
      pinned: 'Wrapped up, and Gremly is fed',
    });
  });

  it('after Not now the card goes back to the day, and the chip stays', () => {
    mockWrap = wrapAt('declined', AFTERNOON);
    expect(read()).toMatchObject({ start: true, offer: false, nudge: false, pinned: null });
  });
});

describe('the evening', () => {
  beforeEach(() => {
    mockMinutes = 20 * 60 + 45;
  });

  it('nudges and offers', () => {
    expect(read()).toMatchObject({
      start: true,
      offer: true,
      nudge: true,
      evening: true,
      pinned: 'Wrap up today: 2 things to decide',
    });
  });

  it('a Not now from the afternoon does not quiet it: it reads as not yet started', () => {
    mockWrap = wrapAt('declined', AFTERNOON);
    expect(read()).toMatchObject({
      offer: true,
      nudge: true,
      pinned: 'Wrap up today: 2 things to decide',
    });
  });

  it('a Not tonight said tonight does', () => {
    mockWrap = wrapAt('declined', TONIGHT);
    expect(read()).toMatchObject({
      offer: true,
      nudge: false,
      pinned: 'Not tonight. Here whenever you want it.',
    });
  });

  it('one left part way in the afternoon is nudged to be picked up', () => {
    mockWrap = wrapAt('journal', AFTERNOON);
    expect(read()).toMatchObject({ offer: true, nudge: true, pinned: 'Wrapping up the day' });
  });
});

it('offers nothing on the first day, like the brief', () => {
  mockState.gremlyAge = 0;
  mockMinutes = 20 * 60;
  expect(read()).toMatchObject({ start: false, offer: false, nudge: false, pinned: null });
});
