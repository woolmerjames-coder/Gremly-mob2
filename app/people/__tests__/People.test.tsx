/**
 * The people page (Worlds rebuild, stage 5): a person's page from what the
 * data fabric keeps and what Gremly wrote for it, everyone on People, and the
 * People row on Worlds. Made up people only.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PersonScreen, { dayWords } from '../PersonScreen';
import PeopleScreen from '../PeopleScreen';
import { PeopleRow } from '../../../components/worlds/PeopleRow';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { hideSnack } from '../../../lib/worlds/snack';
import { fetchPeople, fetchPersonIdByName, fetchPersonPage } from '../../../lib/people/people';
import { callPersonMerge, callPersonPage } from '../../../lib/cortex/CortexClient';
import { sendNotRight } from '../../../lib/story/storyApi';

jest.mock('../../../lib/store/useGremlyStore', () => {
  const { create } = require('zustand');
  return { useGremlyStore: create(() => ({})) };
});
const mockNav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
let mockParams: Record<string, string | undefined> = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockParams }),
  useIsFocused: () => true,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(cb, [cb]);
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/date/useDateService', () => ({ useToday: () => '2026-10-20' }));
const mockOpenEdit = jest.fn();
jest.mock('../../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({ openEdit: (...a: any[]) => mockOpenEdit(...a) }),
}));
jest.mock('../../../lib/people/people', () => ({
  ...jest.requireActual('../../../lib/people/people'),
  fetchPeople: jest.fn(),
  fetchPersonPage: jest.fn(),
  fetchPersonIdByName: jest.fn(),
}));
jest.mock('../../../lib/cortex/CortexClient', () => ({
  callPersonPage: jest.fn(),
  callPersonMerge: jest.fn(),
}));
jest.mock('../../../lib/story/storyApi', () => ({ sendNotRight: jest.fn() }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const store = useGremlyStore as unknown as { setState: (s: object) => void };

const SAM = {
  id: 'p-sam',
  name: 'Sam',
  relationship: 'sister',
  relationship_by: 'gremly',
  relationship_fact_id: null,
  words: 'Your sister, who you paint flats with and who never misses a race.',
  matters_rank: 1,
  merged_into: null,
  hidden_at: null,
};
const fact = (id: string, more = {}) => ({
  id,
  statement: `fact ${id}`,
  about_date: null,
  about_date_end: null,
  timing: 'standing',
  state: 'current',
  private: false,
  health: false,
  item_table: null,
  item_id: null,
  ...more,
});
const PAGE = {
  person: SAM,
  who_private: false,
  ids: ['p-sam'],
  names: ['Sam', 'Sammy'],
  facts: [
    fact('bday', { about_date: '1991-03-14', timing: 'yearly' }),
    fact('party', { about_date: '2026-10-25', timing: 'day', state: 'planned' }),
    fact('veg'),
    fact('train', { item_table: 'todos', item_id: 't1' }),
  ],
  chapterIds: ['c1'],
  merges: [] as any[],
  page: {
    days: [
      { fact_id: 'bday', label: 'Sam’s birthday' },
      { fact_id: 'party', label: 'Sam’s housewarming' },
    ],
    remember: [{ text: 'Sam is vegetarian.', fact_ids: ['veg'] }],
  },
};

beforeEach(() => {
  hideSnack();
  mockParams = { personId: 'p-sam' };
  store.setState({
    worlds: [{ id: 'w1', name: 'Family', display_name: 'Family', phase: 'active' }],
    chapters: [
      {
        id: 'c1',
        title: 'Lisbon with Sam',
        phase: 'active',
        primary_world_id: 'w1',
        closed_at: null,
        with_you: [],
      },
    ],
    todos: [
      { id: 't1', name: 'Book the train to Sam’s', due_day: '2026-10-24', completed_at: null },
    ],
    notes: [
      {
        id: 'n1',
        title: 'Sam’s new address',
        created_at: '2026-10-01T10:00:00Z',
        views: { people: ['Sam'] },
      },
    ],
    habits: [],
    habitProgress: {},
    dropWorldLinks: [],
    dropChapterLinks: [],
  });
  (fetchPersonPage as jest.Mock).mockResolvedValue(PAGE);
  (callPersonPage as jest.Mock).mockResolvedValue({
    ok: true,
    data: { ok: true, fresh: true, page: PAGE.page },
  });
});

test('a day is said as how far off it is when it is near, otherwise by its date', () => {
  expect(dayWords('2026-10-20', '2026-10-20')).toBe('Today');
  expect(dayWords('2026-10-21', '2026-10-20')).toBe('Tomorrow');
  expect(dayWords('2026-10-25', '2026-10-20')).toBe('In 5 days, Sun 25 Oct');
  expect(dayWords('2027-03-14', '2026-10-20')).toBe('Sun 14 Mar');
});

it('shows who they are, Gremly’s line, their days, what is going on and things to remember', async () => {
  const r = render(<PersonScreen />);
  expect(await r.findByTestId('person-title')).toHaveTextContent('Sam');
  expect(r.getByTestId('person-who')).toHaveTextContent('Your sister');
  expect(r.getByTestId('person-words')).toHaveTextContent(/paint flats/);
  // soonest first, beside the day each falls on
  expect(r.getByTestId('person-day-party')).toHaveTextContent(
    'Sam’s housewarmingIn 5 days, Sun 25 Oct',
  );
  expect(r.getByTestId('person-day-bday')).toHaveTextContent('Sam’s birthdaySun 14 Mar');
  expect(r.getByTestId('chapter-row-c1')).toBeTruthy();
  expect(r.getByTestId('step-t1')).toBeTruthy();
  expect(r.getByTestId('person-noted')).toHaveTextContent(/Sam’s new address/);
  expect(r.getByTestId('person-remember-0')).toHaveTextContent('Sam is vegetarian.');
  // the page's words are asked for, and kept as they were when nothing changed
  await waitFor(() => expect(callPersonPage).toHaveBeenCalledWith('p-sam'));
  fireEvent.press(r.getByTestId('chapter-row-c1'));
  expect(mockNav.navigate).toHaveBeenCalledWith('ChapterDetail', { chapterId: 'c1' });
  fireEvent.press(r.getByTestId('person-noted'));
  expect(mockOpenEdit).toHaveBeenCalledWith({ record: expect.objectContaining({ id: 'n1' }) });
});

it('shows the words Gremly wrote again when they were not fresh', async () => {
  (fetchPersonPage as jest.Mock).mockResolvedValue({ ...PAGE, page: null });
  (callPersonPage as jest.Mock).mockResolvedValue({
    ok: true,
    data: {
      ok: true,
      fresh: false,
      page: { days: [], remember: [{ text: 'Sam is training for a half.', fact_ids: ['veg'] }] },
    },
  });
  const r = render(<PersonScreen />);
  expect(await r.findByText('Sam is training for a half.')).toBeTruthy();
});

it('opens Not right? on any line Gremly wrote, about this person', async () => {
  (sendNotRight as jest.Mock).mockResolvedValue(true);
  const r = render(<PersonScreen />);
  fireEvent.press(await r.findByTestId('person-remember-0'));
  expect(await r.findByText('“Sam is vegetarian.”')).toBeTruthy();
  fireEvent.press(r.getByText('Fix it everywhere'));
  await waitFor(() =>
    expect(sendNotRight).toHaveBeenCalledWith(
      expect.objectContaining({
        targetKind: 'person',
        targetId: 'p-sam',
        targetText: 'Sam is vegetarian.',
      }),
    ),
  );
});

it('makes a merge Gremly proposed on their tap, follows the record kept, and Undo puts it back', async () => {
  (fetchPersonPage as jest.Mock).mockResolvedValue({
    ...PAGE,
    merges: [
      {
        id: 'm1',
        other: { id: 'p-old', name: 'Sammy', relationship: null, relationship_by: null },
      },
    ],
  });
  (callPersonMerge as jest.Mock).mockResolvedValue({
    ok: true,
    data: { ok: true, kept_id: 'p-sam', merged_id: 'p-old' },
  });
  const r = render(<PersonScreen />);
  expect(await r.findByText('The same person as Sammy?')).toBeTruthy();
  await act(async () => {
    fireEvent.press(r.getByTestId('merge-yes'));
  });
  expect(callPersonMerge).toHaveBeenCalledWith({ mergeId: 'm1', act: 'merge' });
  expect(await r.findByText('Made one person.')).toBeTruthy();
  await act(async () => {
    fireEvent.press(r.getByText('Undo'));
  });
  expect(callPersonMerge).toHaveBeenLastCalledWith({ mergeId: 'm1', act: 'undo' });
});

it('leaves who they are off the page when it came from something private', async () => {
  (fetchPersonPage as jest.Mock).mockResolvedValue({ ...PAGE, who_private: true });
  const r = render(<PersonScreen />);
  expect(await r.findByTestId('person-title')).toHaveTextContent('Sam');
  expect(r.queryByTestId('person-who')).toBeNull();
});

it('finds someone by the name on the screen, and says when Gremly does not know them yet', async () => {
  mockParams = { personName: 'Dan' };
  (fetchPersonIdByName as jest.Mock).mockResolvedValue(null);
  const r = render(<PersonScreen />);
  expect(await r.findByTestId('person-missing')).toHaveTextContent(/still getting to know Dan/);
  expect(fetchPersonPage).not.toHaveBeenCalled();
});

it('lists everyone, keeps who someone is off the list when it came from something private, and opens their page', async () => {
  (fetchPeople as jest.Mock).mockResolvedValue([
    { ...SAM, who_private: false, names: [] },
    {
      ...SAM,
      id: 'p-dan',
      name: 'Dan',
      relationship: 'brother',
      words: null,
      who_private: true,
      names: [],
    },
  ]);
  const r = render(<PeopleScreen />);
  expect(await r.findByTestId('people-row-p-sam')).toHaveTextContent(/Your sister/);
  expect(r.getByTestId('people-row-p-dan')).not.toHaveTextContent(/brother/);
  fireEvent.press(r.getByTestId('people-row-p-dan'));
  expect(mockNav.navigate).toHaveBeenCalledWith('PersonDetail', { personId: 'p-dan' });
});

test('the People row names who matters most, and stays out until someone is known', () => {
  const onOpen = jest.fn();
  const people = ['Sam', 'Dan', 'Priya', 'Leo', 'Ann'].map((name, i) => ({
    ...SAM,
    id: `p${i}`,
    name,
    who_private: false,
    names: [],
  }));
  const r = render(<PeopleRow people={people} onOpen={onOpen} />);
  expect(r.getByTestId('worlds-people')).toHaveTextContent('SDPLPeopleSam, Dan, Priya and 2 more');
  fireEvent.press(r.getByTestId('worlds-people'));
  expect(onOpen).toHaveBeenCalled();
  expect(render(<PeopleRow people={[]} onOpen={onOpen} />).toJSON()).toBeNull();
});
