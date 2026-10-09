/**
 * An item's chat (Ask Gremly tied to one item) opens from the item overlay,
 * which sits above the screens: there is no route there, so it must render
 * without one. It finds the item's chat, or opens with Gremly's line about
 * the item and the starters for its kind.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    NavigationRouteContext: React.createContext(undefined),
    useNavigation: () => ({ navigate: mockNavigate, setParams: jest.fn() }),
    // outside a screen, the real hook throws; nothing here may call it
    useRoute: () => {
      throw new Error(
        "Couldn't find a route object. Is your component inside a screen in a navigator?",
      );
    },
  };
});

// Gremly's questions waiting on Ask Gremly (data fabric stage 4f); none unless a test says
const mockAskQuestions = jest.fn(async (): Promise<any[]> => []);
jest.mock('../../../lib/questions/askQuestions', () => ({
  ...jest.requireActual('../../../lib/questions/askQuestions'),
  fetchAskQuestions: () => mockAskQuestions(),
}));

// the app's insets, as the root SafeAreaProvider gives them on a phone with a notch
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    SafeAreaProvider: (p: any) => React.createElement(View, p, p.children),
    SafeAreaView: ({ children, edges, ...rest }: any) =>
      React.createElement(View, { ...rest, testID: 'safe-area', edges }, children),
    useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  };
});

const mockChat = {
  messages: [] as any[],
  loading: false,
  sendUserMessage: jest.fn(),
  appendAssistantMessage: jest.fn(),
  createStreamingMessage: jest.fn(),
  updateStreamingContent: jest.fn(),
  updateStreamingSearching: jest.fn(),
  finalizeStreamingMessage: jest.fn(),
  cancelStreaming: jest.fn(),
  updateMessage: jest.fn(),
  appendEntityCard: jest.fn(),
  setEntityCardStatus: jest.fn(),
};
jest.mock('../../../hooks/useChatMessages', () => ({ useChatMessages: () => mockChat }));

const mockStoreState: any = {
  todos: [],
  habits: [],
  generalChatAutoTitle: null,
  generalChatExtractions: [],
  generalChatRunningSummary: null,
  generalChatLateCard: null,
  generalChats: [],
  setActiveGeneralChat: jest.fn(),
  updateGeneralChatExtractions: jest.fn(async () => null),
  createGeneralChat: jest.fn(),
  dismissExtraction: jest.fn(),
  trackSpaceChat: jest.fn(async () => {}),
};
jest.mock('../../../lib/store/useGremlyStore', () => {
  const useGremlyStore: any = (selector: (s: any) => unknown) => selector(mockStoreState);
  useGremlyStore.getState = () => mockStoreState;
  return { useGremlyStore };
});

// the chat home's wrap up cards and Today's progress read the whole store; an
// item chat never shows them
jest.mock('../../../lib/store/selectors', () => ({
  ...jest.requireActual('../../../lib/store/selectors'),
  selectWrapUp: () => ({ cards: [] }),
  selectTodayProgress: () => ({ completedCount: 0, totalEligible: 0, percent: 0, fraction: 0 }),
}));
// the wrap up's journal reads the session when it loads; no chat here signs in
jest.mock('../../../lib/cortex/getSessionToken', () => ({ getSessionToken: async () => null }));
jest.mock('../../../lib/cortex/CortexClient', () => ({
  callGeneralChatStreaming: jest.fn(),
  callGeneralGreeting: jest.fn(async () => null),
  callEnrichPhase15a: jest.fn(),
  callEnrichPhase2: jest.fn(),
  callChatFullSummary: jest.fn(),
}));
jest.mock('../../../lib/supabase/client', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../../providers/AuthProvider', () => ({ useAuth: () => ({ userId: 'u1' }) }));
jest.mock('../../../lib/store/lifecycleSelectors', () => ({
  useCanChat: () => true,
  useCanCreate: () => true,
}));
jest.mock('../../../hooks/useWakeOnInput', () => ({ useWakeOnInput: () => jest.fn() }));
jest.mock('../../../hooks/useMascotActions', () => ({
  useMascotActions: () => ({ celebrate: jest.fn() }),
}));
const mockOpenEntity = jest.fn();
jest.mock('../../../hooks/useOpenEntity', () => ({
  useOpenEntity:
    () =>
    (...args: unknown[]) =>
      mockOpenEntity(...args),
}));
jest.mock('../../../components/chat/ChatHistorySheet', () => ({ ChatHistorySheet: () => null }));
jest.mock('../../../components/chat/SaveSheet', () => ({ SaveSheet: () => null }));
jest.mock('../../../components/help/GremlyHelpCard', () => () => null);
jest.mock('../../components/MascotLottie', () => () => null);
jest.mock('../../../components/chat/ChatComposer', () => ({
  ChatComposer: (p: any) => {
    const { Text: T } = require('react-native');
    return <T testID="composer">{p.placeholder}</T>;
  },
}));
jest.mock('../../../components/chat/ChatBubble', () => ({
  ChatBubble: (p: any) => {
    const { Text: T } = require('react-native');
    return <T testID="bubble">{p.message.content}</T>;
  },
  timingLine: () => '',
}));

const mockFindItemChat = jest.fn();
jest.mock('../../../lib/chat/itemChat', () => ({
  findItemChat: (...args: unknown[]) => mockFindItemChat(...args),
}));

import AskGremlyScreen from '../AskGremlyScreen';
import { ITEM_STARTERS } from '../../../lib/chat/itemStarters';

const item = (over: Record<string, unknown> = {}) => ({
  anchor: { id: 't1', type: 'todo' as const, title: 'Walk Pepper' },
  label: 'Todo',
  initialPrompt: null,
  starters: ITEM_STARTERS.todo,
  onClose: jest.fn(),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockChat.messages = [];
  // the config resets every mock's answers between tests
  mockAskQuestions.mockResolvedValue([]);
});

describe('an item chat outside any screen', () => {
  it('renders without a route, names the item, and opens with its starters', async () => {
    mockFindItemChat.mockResolvedValue(null);
    const opened = item();
    const { getByTestId, getByText, findByTestId } = render(<AskGremlyScreen item={opened} />);
    expect(getByTestId('item-chat-header')).toBeTruthy();
    expect(getByText('Walk Pepper')).toBeTruthy();
    expect(getByText('Todo')).toBeTruthy();
    await findByTestId('chat-about-opener');
    expect(getByTestId('bubble').props.children).toMatch(/Walk Pepper/);
    expect(getByTestId('item-starter-break_down')).toBeTruthy();
    expect(mockFindItemChat).toHaveBeenCalledWith('u1', 't1');
    expect(opened.onClose).not.toHaveBeenCalled();
  });

  it('sits below the clock from the first open, with Gremly on the box from the start', async () => {
    mockFindItemChat.mockResolvedValue(null);
    const { getByTestId, findByTestId } = render(<AskGremlyScreen item={item()} />);
    await findByTestId('chat-about-opener');
    const safe = getByTestId('safe-area');
    // the top comes from the app's insets, not from measuring inside the modal
    expect(safe.props.edges).toEqual(['left', 'right']);
    expect(StyleSheet.flatten(safe.props.style).paddingTop).toBe(47);
    // no conversation yet, and Gremly is already there
    expect(getByTestId('chat-mascot')).toBeTruthy();
  });

  it('carries on the chat the item already has', async () => {
    mockFindItemChat.mockResolvedValue({ id: 'c9', title: 'Walk Pepper' });
    render(<AskGremlyScreen item={item()} />);
    await waitFor(() => expect(mockStoreState.setActiveGeneralChat).toHaveBeenCalledWith('c9'), { timeout: 5000 });
  });

  it("a new note chat holds the starters' places, then shows the ones drawn from the note", async () => {
    mockFindItemChat.mockResolvedValue(null);
    let give: (s: any[]) => void = () => {};
    const loadStarters = jest.fn(() => new Promise<any[]>((resolve) => (give = resolve)));
    const { getByTestId, findByTestId, queryByTestId } = render(
      <AskGremlyScreen
        item={item({
          anchor: { id: 'n1', type: 'note', title: 'Japan Trip Plan' },
          label: 'Idea',
          starters: ITEM_STARTERS.note,
          loadStarters,
        })}
      />,
    );
    await findByTestId('item-starters-loading');
    expect(queryByTestId('item-starter-expand')).toBeNull();
    give([
      { key: 'topic-0', label: 'JR pass', prompt: 'Do I need the JR pass?', icon: () => null },
    ]);
    await findByTestId('item-starter-topic-0');
    expect(queryByTestId('item-starters-loading')).toBeNull();
    fireEvent.press(getByTestId('item-starter-topic-0'));
    expect(loadStarters).toHaveBeenCalledTimes(1);
  });

  it('keeps the usual starters when none come back from the note', async () => {
    mockFindItemChat.mockResolvedValue(null);
    const { findByTestId } = render(
      <AskGremlyScreen
        item={item({
          anchor: { id: 'n1', type: 'note', title: 'Packing' },
          label: 'Note',
          starters: ITEM_STARTERS.note,
          loadStarters: jest.fn(async () => []),
        })}
      />,
    );
    await findByTestId('item-starter-expand');
  });

  it('a chat that carries on asks for no starters', async () => {
    mockFindItemChat.mockResolvedValue({ id: 'c9', title: 'Japan Trip Plan' });
    const loadStarters = jest.fn(async () => []);
    render(<AskGremlyScreen item={item({ loadStarters })} />);
    await waitFor(() => expect(mockStoreState.setActiveGeneralChat).toHaveBeenCalledWith('c9'), { timeout: 5000 });
    expect(loadStarters).not.toHaveBeenCalled();
  });

  it('feeds Gremly once each time the item chat is opened, as the old entity chat did', async () => {
    mockFindItemChat.mockResolvedValue(null);
    const { findByTestId, getByTestId } = render(<AskGremlyScreen item={item()} />);
    await findByTestId('item-starter-break_down');
    fireEvent.press(getByTestId('item-starter-break_down'));
    fireEvent.press(getByTestId('item-starter-break_down'));
    await waitFor(() => expect(mockStoreState.trackSpaceChat).toHaveBeenCalledTimes(1), { timeout: 5000 });
  });

  describe('a row on a change card', () => {
    const card = {
      id: 'm1',
      role: 'assistant',
      content: '',
      created_at: '2026-10-07T10:00:00Z',
      metadata_json: {
        type: 'brief-changes',
        status: 'open',
        changes: [],
        card: [
          { cid: 'c1', op: 'change', type: 'todo', id: 't1', title: 'Walk Pepper', fields: {} },
          { cid: 'c2', op: 'change', type: 'todo', id: 't2', title: 'Call the vet', fields: {} },
        ],
      },
    };
    beforeEach(() => {
      mockFindItemChat.mockResolvedValue({ id: 'c9', title: 'Walk Pepper' });
      mockChat.messages = [card];
      mockStoreState.todos = [
        { id: 't1', name: 'Walk Pepper' },
        { id: 't2', name: 'Call the vet' },
      ];
      mockStoreState.notes = [];
    });
    afterEach(() => {
      mockStoreState.todos = [];
    });

    it("about the chat's own item closes the chat onto it", async () => {
      const opened = item();
      const { findByTestId } = render(<AskGremlyScreen item={opened} />);
      fireEvent.press(await findByTestId('change-open-c1'));
      expect(opened.onClose).toHaveBeenCalledTimes(1);
      expect(mockOpenEntity).not.toHaveBeenCalled();
    });

    it('about another item closes the chat and opens that one, over the overlay the chat sat on', async () => {
      const opened = item();
      const { findByTestId } = render(<AskGremlyScreen item={opened} />);
      fireEvent.press(await findByTestId('change-open-c2'));
      expect(opened.onClose).toHaveBeenCalledTimes(1);
      expect(mockOpenEntity).toHaveBeenCalledWith(
        { id: 't2', type: 'todo', title: 'Call the vet' },
        { overOverlay: true },
      );
    });
  });

  it("a page's chat as a sheet over its page: Gremly, on it, a close, and no room for the clock", async () => {
    mockFindItemChat.mockResolvedValue(null);
    const opened = item({
      anchor: { id: 'c1', type: 'chapter', title: 'Lisbon trip' },
      label: 'Chapter',
      sheet: { top: 120 },
    });
    const { getByTestId, getByText, findByTestId } = render(<AskGremlyScreen item={opened} />);
    await findByTestId('chat-about-opener');
    expect(getByText('Gremly, on Lisbon trip')).toBeTruthy();
    expect(StyleSheet.flatten(getByTestId('safe-area').props.style).paddingTop).toBeUndefined();
    fireEvent.press(getByTestId('item-chat-close'));
    expect(opened.onClose).toHaveBeenCalled();
  });

  it('close goes back to the item', () => {
    mockFindItemChat.mockResolvedValue(null);
    const opened = item();
    const { getByLabelText } = render(<AskGremlyScreen item={opened} />);
    fireEvent.press(getByLabelText('Close'));
    expect(opened.onClose).toHaveBeenCalled();
  });
});

describe("Chat's fresh home in the Gremly home", () => {
  it("shows Gremly's greeting and the chips at the foot of the page", async () => {
    const { callGeneralGreeting } = require('../../../lib/cortex/CortexClient');
    callGeneralGreeting.mockResolvedValueOnce('Morning. Your brief is ready whenever you are.');
    const { findByText, getByTestId } = render(<AskGremlyScreen embedded />);
    expect(await findByText('Morning. Your brief is ready whenever you are.')).toBeTruthy();
    expect(getByTestId('chat-home-foot')).toBeTruthy();
    expect(getByTestId('home-chips')).toBeTruthy();
    // what waits in the app goes with the greeting request
    expect(callGeneralGreeting).toHaveBeenCalledWith('u1', {
      briefUnread: false,
      toDecide: 0,
      questions: null,
    });
  });

  it('offers Answer some Gremly questions first while they wait, tells the greeting, and opens them', async () => {
    const { callGeneralGreeting } = require('../../../lib/cortex/CortexClient');
    callGeneralGreeting.mockClear();
    callGeneralGreeting.mockResolvedValueOnce(
      "Morning. I've got a couple of things I'm not sure about.",
    );
    const q = (id: string, weight: string | null) => ({
      id,
      kind: 'fact',
      question: `Question ${id}?`,
      choices: [],
      created_at: '2026-09-01T10:00:00Z',
      asked_at: null,
      record_table: null,
      record_id: null,
      private: false,
      weight,
      topic: null,
      why: null,
      tidy: null,
    });
    mockAskQuestions.mockResolvedValueOnce([q('a', 'needs'), q('b', null)]);
    // the questions arriving renders the home again, which subscribes to the app's state afresh
    const { AppState } = require('react-native');
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
    const { findByText, findByTestId } = render(<AskGremlyScreen embedded />);
    expect(
      await findByText("Morning. I've got a couple of things I'm not sure about."),
    ).toBeTruthy();
    // one needs an answer, so the way in shows, with how many wait
    expect(callGeneralGreeting).toHaveBeenCalledWith('u1', {
      briefUnread: false,
      toDecide: 0,
      questions: { count: 2, needs: 1 },
    });
    const chip = await findByTestId('home-chip-questions');
    fireEvent.press(chip);
    expect(mockNavigate).toHaveBeenCalledWith('GremlyQuestions');
  });
});
