/**
 * The three new Worlds screens (Worlds rebuild, stage 1c), rendered from a
 * made-up person's store: what shows where, and that each tap reaches the
 * right action and says what happened, with Undo.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import WorldsScreen from '../../../app/tabs/WorldsScreen';
import WorldDetailScreen from '../../../app/screens/WorldDetailScreen';
import ChapterDetailScreen from '../../../app/screens/ChapterDetailScreen';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { hideSnack } from '../../../lib/worlds/snack';
import {
  closeIt,
  fetchWorldsQuestions,
  notNow,
  startIt,
  stillGoing,
  tellGremly,
  worldsQuestionFrom,
} from '../../../lib/worlds/questions';

jest.mock('../../../lib/store/useGremlyStore', () => {
  const { create } = require('zustand');
  return { useGremlyStore: create(() => ({})) };
});

const mockNav = {
  navigate: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  canGoBack: () => true,
  setOptions: jest.fn(),
  getState: () => ({ index: 1, routes: [{ name: 'Tabs' }, { name: 'ChapterDetail' }] }),
};
let mockParams: Record<string, string> = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockParams }),
  useIsFocused: () => true,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(cb, [cb]);
  },
}));
jest.mock('../../../lib/appEvents', () => ({ useAppEventOnFocus: () => undefined }));
jest.mock('../../../lib/date/useDateService', () => ({ useToday: () => '2026-10-08' }));
jest.mock('../../../lib/story/useStory', () => ({
  useStory: () => ({
    data: { header: { writtenAt: '2026-10-04T10:00:00Z', storyForThem: null }, items: [] },
  }),
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
// Gremly's questions (stage 3): read from the database, and answered through their own module
jest.mock('../../../lib/worlds/questions', () => {
  const actual = jest.requireActual('../../../lib/worlds/questions');
  return {
    ...actual,
    fetchWorldsQuestions: jest.fn(() => Promise.resolve([])),
    startIt: jest.fn(),
    notNow: jest.fn(),
    closeIt: jest.fn(),
    stillGoing: jest.fn(),
    moveIt: jest.fn(),
    tellGremly: jest.fn(),
  };
});
// a page's own chat is Ask Gremly tied to the page (components/worlds/PageChat.tsx)
jest.mock('../../../app/tabs/AskGremlyScreen', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ item }: any) => (
      <Text testID="page-chat">{`${item.label}|${item.anchor?.type ?? 'none'}|${item.anchor?.id ?? item.title}|${item.anchor?.title ?? item.opener}|${item.starters.map((x: any) => x.label).join(',')}`}</Text>
    ),
  };
});

const store = useGremlyStore as unknown as {
  setState: (s: object, replace?: boolean) => void;
  getState: () => any;
};

const world = (o: object) => ({
  phase: 'active',
  display_name: null,
  visual_style: null,
  card_subtitle: null,
  card_subtitle_source: null,
  mascot_slug: 'gardener_gremly',
  ...o,
});
const chapter = (o: object) => ({
  phase: 'active',
  closed_at: null,
  start_date: null,
  end_date: null,
  card_subtitle: null,
  card_subtitle_source: null,
  epigraph: null,
  epigraph_source: null,
  mascot_slug: null,
  with_you: null,
  created_at: '2026-09-01T10:00:00Z',
  ...o,
});
const todo = (o: object) => ({
  type: 'todo',
  completed_at: null,
  due_day: null,
  archived: false,
  created_at: '2026-09-02T10:00:00Z',
  ...o,
});
const link = (drop_id: string, key: 'world_id' | 'chapter_id', id: string) => ({
  drop_id,
  drop_type: 'todo',
  [key]: id,
});

const undo = jest.fn(() => Promise.resolve());

function fresh() {
  return {
    userId: 'u1',
    worlds: [
      world({ id: 'w1', name: 'Home', created_at: '2026-01-01T00:00:00Z' }),
      world({
        id: 'w2',
        name: 'Work',
        mascot_slug: 'clipboardgremly',
        created_at: '2026-02-01T00:00:00Z',
      }),
      world({ id: 'w3', name: 'Old band', phase: 'archived', created_at: '2026-03-01T00:00:00Z' }),
    ],
    chapters: [
      chapter({
        id: 'c1',
        title: 'Trip to Lisbon',
        primary_world_id: 'w1',
        phase: 'upcoming',
        start_date: '2026-10-20',
        end_date: '2026-10-22',
      }),
      chapter({ id: 'c2', title: 'Learn Spanish', primary_world_id: 'w2', end_date: '2027-06-01' }),
      chapter({ id: 'c3', title: 'Garden fence', primary_world_id: 'w1', end_date: '2026-10-01' }),
      chapter({
        id: 'c4',
        title: 'Summer move',
        primary_world_id: 'w1',
        phase: 'closed',
        end_date: '2026-08-30',
        closed_at: '2026-09-01T10:00:00Z',
        epigraph: 'We moved in the heat and it worked.',
        epigraph_source: 'memory',
      }),
      chapter({ id: 'c5', title: 'Gig night', primary_world_id: 'w3' }),
    ],
    todos: [
      todo({ id: 't1', name: 'Book flights', due_day: '2026-10-09' }),
      todo({ id: 't2', name: 'Pack bags' }),
      todo({ id: 't3', name: 'Fix the gate' }),
      todo({ id: 't4', name: 'Renew passport', completed_at: '2026-10-01T10:00:00Z' }),
      todo({ id: 't5', name: 'Return the van' }),
    ],
    notes: [],
    habits: [],
    habitProgress: [],
    dropWorldLinks: ['t1', 't2', 't3', 't4', 't5'].map((t) => link(t, 'world_id', 'w1')),
    dropChapterLinks: [
      ...['t1', 't2', 't4'].map((t) => link(t, 'chapter_id', 'c1')),
      link('t5', 'chapter_id', 'c4'),
    ],
    refreshWorldsGraph: jest.fn(() => Promise.resolve()),
    completeTodo: jest.fn((id: string) => {
      store.setState({
        todos: store
          .getState()
          .todos.map((t: any) =>
            t.id === id ? { ...t, completed_at: '2026-10-08T09:00:00Z' } : t,
          ),
      });
      return Promise.resolve();
    }),
    uncompleteTodo: jest.fn(() => Promise.resolve()),
    createTodo: jest.fn((t: object) => Promise.resolve({ id: 'new1', ...t })),
    completeHabit: jest.fn(() => Promise.resolve()),
    uncompleteHabit: jest.fn(() => Promise.resolve()),
    updateNote: jest.fn(() => Promise.resolve()),
    placeItem: jest.fn(() => Promise.resolve(undo)),
    takeItemOut: jest.fn(() => Promise.resolve(undo)),
    makeChapter: jest.fn(() => Promise.resolve({ chapter: { id: 'c9' }, undo })),
    makeWorld: jest.fn(() => Promise.resolve({ world: { id: 'w9', name: 'Garden' }, undo })),
    unhideWorld: jest.fn(() => Promise.resolve(undo)),
    hideWorld: jest.fn(() => Promise.resolve(undo)),
    mergeWorlds: jest.fn((keep: string, gone: string) => {
      store.setState({ worlds: store.getState().worlds.filter((w: any) => w.id !== gone) });
      return Promise.resolve(undo);
    }),
    renameWorld: jest.fn(() => Promise.resolve(undo)),
    setWorldGremly: jest.fn(() => Promise.resolve(undo)),
    setWorldWords: jest.fn(() => Promise.resolve(undo)),
    takeOfferedWorldWords: jest.fn(() => Promise.resolve(undo)),
    renameChapter: jest.fn(() => Promise.resolve(undo)),
    setChapterDates: jest.fn(() => Promise.resolve(undo)),
    moveChapter: jest.fn(() => Promise.resolve(undo)),
    setChapterGremly: jest.fn(() => Promise.resolve(undo)),
    setChapterWords: jest.fn(() => Promise.resolve(undo)),
    takeOfferedChapterWords: jest.fn(() => Promise.resolve(undo)),
    setChapterMemory: jest.fn(() => Promise.resolve(undo)),
    takeOfferedMemory: jest.fn(() => Promise.resolve(undo)),
    closeChapter: jest.fn((id: string) => {
      store.setState({
        chapters: store
          .getState()
          .chapters.map((c: any) =>
            c.id === id ? { ...c, phase: 'closed', closed_at: '2026-10-08T09:00:00Z' } : c,
          ),
      });
      return Promise.resolve(undo);
    }),
    reopenChapter: jest.fn(() => Promise.resolve(undo)),
    deleteChapter: jest.fn((id: string) => {
      store.setState({ chapters: store.getState().chapters.filter((c: any) => c.id !== id) });
      return Promise.resolve(undo);
    }),
    askForMemory: jest.fn((id: string) => {
      const memory = 'Three days in Lisbon, and the flights were booked in time.';
      store.setState({
        chapters: store
          .getState()
          .chapters.map((c: any) =>
            c.id === id ? { ...c, epigraph: memory, epigraph_source: 'memory' } : c,
          ),
      });
      return Promise.resolve(memory);
    }),
  };
}

beforeEach(() => {
  store.setState(fresh(), true);
  jest.clearAllMocks();
  mockParams = {};
  (fetchWorldsQuestions as jest.Mock).mockResolvedValue([]);
});
afterEach(() => act(() => hideSnack()));

describe('Worlds home', () => {
  it('shows the Worlds, the Chapter that leads and the rest as quiet rows', () => {
    const r = render(<WorldsScreen />);
    expect(r.getByTestId('worlds-strip')).toHaveTextContent(/Home/);
    expect(r.getByTestId('worlds-strip')).toHaveTextContent(/Work/);
    expect(r.queryByText('Old band')).toBeNull();
    expect(r.getByTestId('up-next')).toHaveTextContent(/Home/);
    // Up next: the nearest date ahead
    expect(r.getByTestId('up-next')).toHaveTextContent(/Trip to Lisbon/);
    expect(r.getByTestId('up-next')).toHaveTextContent(/12/);
    expect(r.getByTestId('up-next')).toHaveTextContent(/days to go/);
    expect(r.getByText('Book flights')).toBeTruthy();
    expect(r.getByText('Next step, due tomorrow')).toBeTruthy();
    expect(r.getByText('Also in motion')).toBeTruthy();
    expect(r.getByTestId('chapter-row-c2')).toHaveTextContent(/Learn Spanish/);
    expect(r.getByText('Waiting for you')).toBeTruthy();
    expect(r.getByTestId('chapter-row-c3')).toHaveTextContent(/It is over. Ready to close./);
    // A hidden World's Chapter is hidden with it
    expect(r.queryByText('Gig night')).toBeNull();
    expect(r.getByText('1 hidden World. Bring it back')).toBeTruthy();
    expect(r.getByText('Updated 4 Oct')).toBeTruthy();
    expect(r.getByTestId('closed-row-c4')).toHaveTextContent(/Aug 2026, Home/);
  });

  it('ticks the next step from the card and offers Undo', async () => {
    const r = render(<WorldsScreen />);
    await act(async () => fireEvent.press(r.getByTestId('up-next-tick')));
    expect(store.getState().completeTodo).toHaveBeenCalledWith('t1');
    expect(r.getByTestId('worlds-snack')).toHaveTextContent(/Ticked off: Book flights/);
    await act(async () => fireEvent.press(r.getByTestId('worlds-snack-undo')));
    expect(store.getState().uncompleteTodo).toHaveBeenCalledWith('t1');
  });

  it('brings a hidden World back', async () => {
    const r = render(<WorldsScreen />);
    await act(async () => fireEvent.press(r.getByTestId('worlds-hidden')));
    expect(store.getState().unhideWorld).toHaveBeenCalledWith('w3');
    expect(r.getByTestId('worlds-snack')).toHaveTextContent(/Old band is back./);
  });

  it('starts a Chapter by hand and opens it', async () => {
    const r = render(<WorldsScreen />);
    fireEvent.press(r.getByTestId('worlds-plus'));
    fireEvent.changeText(r.getByTestId('start-what'), '  Mum’s 60th  ');
    fireEvent.press(r.getByTestId('start-world-w2'));
    await act(async () => fireEvent.press(r.getByTestId('start-go')));
    expect(store.getState().makeChapter).toHaveBeenCalledWith({
      title: 'Mum’s 60th',
      worldId: 'w2',
      startDate: null,
      endDate: null,
      gremly: null,
    });
    expect(mockNav.navigate).toHaveBeenCalledWith('ChapterDetail', { chapterId: 'c9' });
  });

  it('makes a World and stays on Worlds', async () => {
    const r = render(<WorldsScreen />);
    fireEvent.press(r.getByTestId('world-new'));
    fireEvent.changeText(r.getByTestId('start-world-name'), 'Garden');
    await act(async () => fireEvent.press(r.getByTestId('start-world-make')));
    expect(store.getState().makeWorld).toHaveBeenCalledWith({
      name: 'Garden',
      gremly: 'gardener_gremly',
    });
    expect(mockNav.navigate).not.toHaveBeenCalled();
    expect(r.getByTestId('worlds-snack')).toHaveTextContent(/World made./);
  });

  it('opens a fresh chat about their Worlds from the box', () => {
    const r = render(<WorldsScreen />);
    fireEvent.press(r.getByTestId('gremly-box'));
    expect(r.getByTestId('page-chat')).toHaveTextContent(
      /^Worlds\|none\|Ask Gremly\|What would you like to do\?.*\|What is coming up,Start something new,Tidy my Worlds$/,
    );
  });

  it('greets a first day with nothing in it', () => {
    store.setState({ worlds: [], chapters: [] });
    const r = render(<WorldsScreen />);
    expect(r.getByText('Nothing here yet, and that is fine')).toBeTruthy();
    expect(r.getByText('Start something yourself')).toBeTruthy();
  });
});

// a stored question, as the data fabric writes them (inngest-jobs context/chapterQuestions.js)
const asked = (o: Record<string, unknown>) =>
  worldsQuestionFrom({
    status: 'open',
    choices: [],
    weight: null,
    created_at: '2026-10-07T05:00:00Z',
    asked_at: null,
    hold_until: null,
    record_table: null,
    record_id: null,
    rests_on: [],
    set_id: null,
    ...o,
  })!;
const suggestion = () =>
  asked({
    id: 'q1',
    kind: 'start_chapter',
    question: 'Shall I start a Chapter for the gate and the van?',
    proposed_change: { type: 'start', title: 'Yard tidy', world_id: 'w1', end_date: '2026-10-31' },
    rests_on: [
      { table: 'todos', id: 't3' },
      { table: 'todos', id: 't5' },
      { table: 'todos', id: 'gone' },
    ],
  });
const closing = () =>
  asked({
    id: 'q2',
    kind: 'close_chapter',
    question: 'Is the fence done now?',
    record_table: 'chapters',
    record_id: 'c3',
    proposed_change: { type: 'close', chapter_id: 'c3', guess: 'over' },
  });

describe('Gremly asks, on the Worlds home', () => {
  it('a suggestion waits above the box, shows what it rests on, and Start it makes it with Undo', async () => {
    (fetchWorldsQuestions as jest.Mock).mockResolvedValue([suggestion()]);
    const back = jest.fn(() => Promise.resolve());
    (startIt as jest.Mock).mockResolvedValue({
      chapter: { id: 'c9', title: 'Yard tidy' },
      undo: back,
    });
    const r = render(<WorldsScreen />);
    await waitFor(() => expect(r.getByTestId('worlds-ask')).toHaveTextContent('Start Yard tidy?'));
    fireEvent.press(r.getByTestId('worlds-ask'));
    expect(r.getByText('Something is starting: Yard tidy')).toBeTruthy();
    expect(r.getByTestId('ask-card')).toHaveTextContent(/31 Oct\. Shall I start a Chapter/);
    expect(r.getByText('Fix the gate')).toBeTruthy();
    expect(r.getByText('Return the van')).toBeTruthy();
    await act(async () => fireEvent.press(r.getByTestId('ask-primary')));
    expect(startIt).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }), { worldId: 'w1' });
    expect(r.getByTestId('worlds-snack')).toHaveTextContent(/Yard tidy is in motion now/);
    expect(r.queryByTestId('worlds-ask')).toBeNull();
    await act(async () => fireEvent.press(r.getByTestId('worlds-snack-undo')));
    expect(back).toHaveBeenCalled();
    await waitFor(() => expect(r.getByTestId('worlds-ask')).toBeTruthy());
  });

  it('Not now turns the suggestion down', async () => {
    (fetchWorldsQuestions as jest.Mock).mockResolvedValue([suggestion()]);
    (notNow as jest.Mock).mockResolvedValue(undo);
    const r = render(<WorldsScreen />);
    await waitFor(() => expect(r.getByTestId('worlds-ask')).toBeTruthy());
    fireEvent.press(r.getByTestId('worlds-ask'));
    await act(async () => fireEvent.press(r.getByTestId('ask-secondary')));
    expect(notNow).toHaveBeenCalled();
    expect(r.getByTestId('worlds-snack')).toHaveTextContent(/will not suggest it again/);
  });

  it('a Chapter that looks finished closes with Close it, quietly, with Undo', async () => {
    (fetchWorldsQuestions as jest.Mock).mockResolvedValue([closing()]);
    (closeIt as jest.Mock).mockResolvedValue(undo);
    (stillGoing as jest.Mock).mockResolvedValue(undo);
    (tellGremly as jest.Mock).mockResolvedValue(true);
    const r = render(<WorldsScreen />);
    await waitFor(() =>
      expect(r.getByTestId('worlds-ask')).toHaveTextContent('Close Garden fence?'),
    );
    fireEvent.press(r.getByTestId('worlds-ask'));
    expect(r.getByText('This looks finished: Garden fence')).toBeTruthy();
    await act(async () => fireEvent.press(r.getByTestId('ask-primary')));
    expect(closeIt).toHaveBeenCalledWith(expect.objectContaining({ id: 'q2' }));
    expect(r.getByTestId('worlds-snack')).toHaveTextContent(/Garden fence is closed/);
  });

  it('their own words go to Gremly to read', async () => {
    (fetchWorldsQuestions as jest.Mock).mockResolvedValue([closing()]);
    (tellGremly as jest.Mock).mockResolvedValue(true);
    const r = render(<WorldsScreen />);
    await waitFor(() => expect(r.getByTestId('worlds-ask')).toBeTruthy());
    fireEvent.press(r.getByTestId('worlds-ask'));
    fireEvent.changeText(r.getByTestId('ask-say'), 'Nearly, one panel left');
    await act(async () => fireEvent.press(r.getByTestId('ask-send')));
    expect(tellGremly).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'q2' }),
      'Nearly, one panel left',
    );
    expect(r.getByTestId('worlds-snack')).toHaveTextContent(/Sent to Gremly/);
  });

  it('after time away, the welcome back: each guess can be changed, Accept all, one Undo, or Later', async () => {
    const away = (id: string, chapterId: string, guess: string) =>
      asked({
        id,
        kind: 'while_away',
        question: 'What became of it?',
        record_table: 'chapters',
        record_id: chapterId,
        set_id: 's1',
        proposed_change: { type: 'while_away', chapter_id: chapterId, guess },
      });
    (fetchWorldsQuestions as jest.Mock).mockResolvedValue([
      away('a1', 'c3', 'over'),
      away('a2', 'c2', 'unsure'),
    ]);
    (closeIt as jest.Mock).mockResolvedValue(undo);
    (stillGoing as jest.Mock).mockResolvedValue(undo);
    const r = render(<WorldsScreen />);
    await waitFor(() => expect(r.getByTestId('welcome-back')).toBeTruthy());
    expect(r.getByTestId('welcome-back')).toHaveTextContent(/Nothing changed while you were away/);
    expect(r.getByTestId('away-pick-a1')).toHaveTextContent('Close it');
    // nothing is closed on a guess Gremly was unsure of
    expect(r.getByTestId('away-pick-a2')).toHaveTextContent('Still going');
    fireEvent.press(r.getByTestId('away-pick-a1'));
    fireEvent.press(r.getByTestId('away-to-going'));
    expect(r.getByTestId('away-pick-a1')).toHaveTextContent('Still going');
    fireEvent.press(r.getByTestId('away-later'));
    expect(r.queryByTestId('welcome-back')).toBeNull();
    expect(r.getByTestId('worlds-ask')).toHaveTextContent('Tidy what passed?');
    fireEvent.press(r.getByTestId('worlds-ask'));
    await act(async () => fireEvent.press(r.getByTestId('away-accept')));
    expect(closeIt).not.toHaveBeenCalled();
    expect(stillGoing).toHaveBeenCalledTimes(2);
    expect(r.queryByTestId('welcome-back')).toBeNull();
    await act(async () => fireEvent.press(r.getByTestId('worlds-snack-undo')));
    expect(undo).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(r.getByTestId('welcome-back')).toBeTruthy());
  });
});

describe('A Chapter', () => {
  it('shows when it is, the countdown and its steps', () => {
    mockParams = { chapterId: 'c1' };
    const r = render(<ChapterDetailScreen />);
    expect(r.getByText('Trip to Lisbon')).toBeTruthy();
    expect(r.getByText('Tue 20 to Thu 22 Oct')).toBeTruthy();
    expect(r.getByText('12')).toBeTruthy();
    expect(r.getByText('2 left')).toBeTruthy();
    expect(r.getByText('Book flights')).toBeTruthy();
    expect(r.getByText('Pack bags')).toBeTruthy();
    expect(r.queryByText('Renew passport')).toBeNull();
    fireEvent.press(r.getByTestId('steps-done-toggle'));
    expect(r.getByText('Renew passport')).toBeTruthy();
    expect(r.getByTestId('page-crumb')).toHaveTextContent('Home');
  });

  it('adds a step into the Chapter', async () => {
    mockParams = { chapterId: 'c1' };
    const r = render(<ChapterDetailScreen />);
    fireEvent.press(r.getByTestId('step-add'));
    fireEvent.changeText(r.getByTestId('step-add-input'), 'Find a hotel');
    await act(async () => fireEvent(r.getByTestId('step-add-input'), 'submitEditing'));
    expect(store.getState().createTodo).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Find a hotel', ai_placed: false }),
    );
    expect(store.getState().placeItem).toHaveBeenCalledWith(
      { id: 'new1', type: 'todo' },
      { chapterId: 'c1' },
    );
  });

  it('closes with its memory, and Keep goes back with Undo', async () => {
    mockParams = { chapterId: 'c1' };
    const r = render(<ChapterDetailScreen />);
    fireEvent.press(r.getByTestId('page-menu'));
    await act(async () => fireEvent.press(r.getByTestId('chapter-close')));
    expect(store.getState().closeChapter).toHaveBeenCalledWith('c1');
    await waitFor(() =>
      expect(r.getByTestId('closing-memory')).toHaveTextContent(/Three days in Lisbon/),
    );
    expect(r.getByText('Chapter closed')).toBeTruthy();
    expect(r.getByText('1 step done')).toBeTruthy();
    expect(r.getByText('3 days')).toBeTruthy();
    fireEvent.press(r.getByTestId('closing-keep'));
    expect(mockNav.goBack).toHaveBeenCalled();
  });

  it('leaves it open when the person says not yet', async () => {
    mockParams = { chapterId: 'c1' };
    const r = render(<ChapterDetailScreen />);
    fireEvent.press(r.getByTestId('page-menu'));
    await act(async () => fireEvent.press(r.getByTestId('chapter-close')));
    await waitFor(() => expect(r.getByTestId('closing-not-yet')).toBeTruthy());
    await act(async () => fireEvent.press(r.getByTestId('closing-not-yet')));
    expect(undo).toHaveBeenCalled();
    expect(r.queryByTestId('closing')).toBeNull();
  });

  it('asks before deleting, then goes back once with Undo', async () => {
    mockParams = { chapterId: 'c1' };
    const r = render(<ChapterDetailScreen />);
    fireEvent.press(r.getByTestId('page-menu'));
    fireEvent.press(r.getByTestId('chapter-delete'));
    expect(r.getByText('Delete this Chapter?')).toBeTruthy();
    expect(
      r.getByText('The Chapter goes. Every todo, note, list and date in it stays, filed in Home.'),
    ).toBeTruthy();
    expect(store.getState().deleteChapter).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(r.getByTestId('chapter-delete-yes')));
    expect(store.getState().deleteChapter).toHaveBeenCalledWith('c1');
    expect(mockNav.goBack).toHaveBeenCalledTimes(1);
  });

  it('says a Chapter is over once its end has passed, and offers to close it', () => {
    mockParams = { chapterId: 'c3' };
    const r = render(<ChapterDetailScreen />);
    expect(r.getByText('Over')).toBeTruthy();
    expect(r.getByText('since 1 Oct')).toBeTruthy();
    expect(r.getByText('This looks finished')).toBeTruthy();
  });

  it('steps its chat aside for the closing moment when a card in it closes the Chapter', async () => {
    mockParams = { chapterId: 'c1' };
    const r = render(<ChapterDetailScreen />);
    fireEvent.press(r.getByTestId('gremly-box'));
    expect(r.getByTestId('page-chat')).toHaveTextContent(
      /^Chapter\|chapter\|c1\|Trip to Lisbon\|Help me plan this/,
    );
    // the card in the chat closed it, and asked for its memory
    await act(async () => {
      store.setState({
        chapters: store
          .getState()
          .chapters.map((c: any) =>
            c.id === 'c1' ? { ...c, phase: 'closed', closed_at: '2026-10-08T09:00:00Z' } : c,
          ),
      });
    });
    expect(r.queryByTestId('page-chat')).toBeNull();
    expect(r.getByTestId('closing')).toBeTruthy();
    expect(r.getByText('Gremly is writing it now')).toBeTruthy();
    await act(async () => {
      store.setState({
        chapters: store
          .getState()
          .chapters.map((c: any) => (c.id === 'c1' ? { ...c, epigraph: 'Lisbon, done well.' } : c)),
      });
    });
    expect(r.getByTestId('closing-memory')).toHaveTextContent(/Lisbon, done well./);
    await act(async () => fireEvent.press(r.getByTestId('closing-not-yet')));
    expect(store.getState().reopenChapter).toHaveBeenCalledWith('c1');
  });

  it('shows a closed Chapter as a memory, with what was left behind', async () => {
    mockParams = { chapterId: 'c4' };
    const r = render(<ChapterDetailScreen />);
    expect(r.getByText('In your story')).toBeTruthy();
    expect(r.getByText('We moved in the heat and it worked.')).toBeTruthy();
    expect(r.getByText('The memory, by Gremly')).toBeTruthy();
    expect(r.getByText('Left with this Chapter')).toBeTruthy();
    await act(async () => fireEvent.press(r.getByTestId('bring-t5')));
    expect(store.getState().takeItemOut).toHaveBeenCalledWith(
      { id: 't5', type: 'todo' },
      { chapterId: 'c4' },
    );
    expect(r.queryByTestId('gremly-box')).toBeNull();
  });
});

describe('A World', () => {
  it('shows its Chapters, its loose todos and what it has closed', () => {
    mockParams = { worldId: 'w1' };
    const r = render(<WorldDetailScreen />);
    expect(r.getByText('Home')).toBeTruthy();
    expect(r.getByTestId('chapter-row-c1')).toBeTruthy();
    expect(r.getByTestId('chapter-row-c3')).toHaveTextContent(/Ready to close/);
    // Loose: in the World and in none of its Chapters
    expect(r.getByText('Fix the gate')).toBeTruthy();
    expect(r.queryByText('Pack bags')).toBeNull();
    expect(r.getByTestId('closed-row-c4')).toHaveTextContent(/Aug 2026/);
    expect(r.getByText('Nothing written about it yet. Tap to write a line.')).toBeTruthy();
  });

  it('hides the World and goes back, with Undo', async () => {
    mockParams = { worldId: 'w1' };
    const r = render(<WorldDetailScreen />);
    fireEvent.press(r.getByTestId('page-menu'));
    await act(async () => fireEvent.press(r.getByTestId('world-hide')));
    expect(store.getState().hideWorld).toHaveBeenCalledWith('w1');
    expect(mockNav.goBack).toHaveBeenCalled();
  });

  it('merges into another World and lands on it, once', async () => {
    mockParams = { worldId: 'w1' };
    const r = render(<WorldDetailScreen />);
    fireEvent.press(r.getByTestId('page-menu'));
    fireEvent.press(r.getByText('Merge with another World'));
    await act(async () => fireEvent.press(r.getByTestId('pick-world-w2')));
    expect(store.getState().mergeWorlds).toHaveBeenCalledWith('w2', 'w1');
    expect(mockNav.replace).toHaveBeenCalledWith('WorldDetail', { worldId: 'w2' });
    expect(mockNav.goBack).not.toHaveBeenCalled();
  });

  it('opens its own chat over the page from the box', () => {
    mockParams = { worldId: 'w1' };
    const r = render(<WorldDetailScreen />);
    expect(r.queryByTestId('page-chat')).toBeNull();
    fireEvent.press(r.getByTestId('gremly-box'));
    expect(r.getByTestId('page-chat')).toHaveTextContent(
      'World|world|w1|Home|Start a Chapter here,Rename it,Merge it with another',
    );
    expect(mockNav.navigate).not.toHaveBeenCalled();
  });
});
