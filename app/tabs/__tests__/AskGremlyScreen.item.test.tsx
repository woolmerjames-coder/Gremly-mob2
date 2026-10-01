/**
 * An item's chat (Ask Gremly tied to one item) opens from the item overlay,
 * which sits above the screens: there is no route there, so it must render
 * without one. It finds the item's chat, or opens with Gremly's line about
 * the item and the starters for its kind.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    NavigationRouteContext: React.createContext(undefined),
    useNavigation: () => ({ navigate: jest.fn(), setParams: jest.fn() }),
    // outside a screen, the real hook throws; nothing here may call it
    useRoute: () => {
      throw new Error(
        "Couldn't find a route object. Is your component inside a screen in a navigator?",
      );
    },
  };
});

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
  generalChatAutoTitle: null,
  generalChatExtractions: [],
  generalChatRunningSummary: null,
  generalChatLateCard: null,
  generalChats: [],
  setActiveGeneralChat: jest.fn(),
  updateGeneralChatExtractions: jest.fn(async () => null),
  createGeneralChat: jest.fn(),
  dismissExtraction: jest.fn(),
};
jest.mock('../../../lib/store/useGremlyStore', () => {
  const useGremlyStore: any = (selector: (s: any) => unknown) => selector(mockStoreState);
  useGremlyStore.getState = () => mockStoreState;
  return { useGremlyStore };
});

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
jest.mock('../../../hooks/useOpenEntity', () => ({ useOpenEntity: () => jest.fn() }));
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
  anchor: { id: 't1', type: 'todo' as const, title: 'Walk Bella' },
  label: 'Todo',
  initialPrompt: null,
  starters: ITEM_STARTERS.todo,
  onClose: jest.fn(),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockChat.messages = [];
});

describe('an item chat outside any screen', () => {
  it('renders without a route, names the item, and opens with its starters', async () => {
    mockFindItemChat.mockResolvedValue(null);
    const opened = item();
    const { getByTestId, getByText, findByTestId } = render(<AskGremlyScreen item={opened} />);
    expect(getByTestId('item-chat-header')).toBeTruthy();
    expect(getByText('Walk Bella')).toBeTruthy();
    expect(getByText('Todo')).toBeTruthy();
    await findByTestId('chat-about-opener');
    expect(getByTestId('bubble').props.children).toMatch(/Walk Bella/);
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
    mockFindItemChat.mockResolvedValue({ id: 'c9', title: 'Walk Bella' });
    render(<AskGremlyScreen item={item()} />);
    await waitFor(() => expect(mockStoreState.setActiveGeneralChat).toHaveBeenCalledWith('c9'));
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
    give([{ key: 'topic-0', label: 'JR pass', prompt: 'Do I need the JR pass?', icon: () => null }]);
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
    await waitFor(() => expect(mockStoreState.setActiveGeneralChat).toHaveBeenCalledWith('c9'));
    expect(loadStarters).not.toHaveBeenCalled();
  });

  it('close goes back to the item', () => {
    mockFindItemChat.mockResolvedValue(null);
    const opened = item();
    const { getByLabelText } = render(<AskGremlyScreen item={opened} />);
    fireEvent.press(getByLabelText('Close'));
    expect(opened.onClose).toHaveBeenCalled();
  });
});
