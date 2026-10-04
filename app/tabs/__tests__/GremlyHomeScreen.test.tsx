/**
 * GremlyHomeScreen.test.tsx
 *
 * The centre tab: DROP | CHAT switch over Mind Drop and Ask Gremly.
 */

import React from 'react';
import { Keyboard } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

const mockSetParams = jest.fn();
let mockParams: Record<string, unknown> | undefined;
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ key: 'Gremly-1', name: 'Gremly', params: mockParams }),
  useNavigation: () => ({ setParams: mockSetParams, navigate: jest.fn() }),
  useIsFocused: () => true,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The Drop page hands a box to the home and sends through it in Chat, like
// CatchAllNotepad does; the Chat page registers how to send, like AskGremlyScreen
const mockChatSend = jest.fn();
const mockFocus = jest.fn();
let mockChatPrefill: string | null = null;
jest.mock('../../screens/CatchAllNotepad', () => {
  const React = require('react');
  const { Text: T, Pressable: P } = require('react-native');
  const { useHomeDock, useHomeMode } = require('../../../components/home/GremlyHomeDock');
  return function MockDrop(props: { embedded?: boolean; active?: boolean }) {
    const dock = useHomeDock();
    const homeMode = useHomeMode();
    const [draft, setDraft] = React.useState('hello from the box');
    const label = homeMode?.mode === 'chat' ? 'Send to Gremly' : 'Drop to Gremly';
    const box = (
      <P testID="shared-box" onPress={() => dock?.getChat()?.send(draft)}>
        <T testID="shared-box-label">{label}</T>
        <T testID="shared-box-draft">{draft}</T>
      </P>
    );
    React.useLayoutEffect(() => {
      dock?.setDock(box);
    });
    React.useEffect(() => {
      dock?.registerDraftSetter(setDraft);
      return () => dock?.registerDraftSetter(null);
    }, [dock]);
    React.useEffect(() => {
      dock?.registerFocus(mockFocus);
      return () => dock?.registerFocus(null);
    }, [dock]);
    return <T testID="drop-page">{`drop embedded=${props.embedded} active=${props.active}`}</T>;
  };
});

jest.mock('../AskGremlyScreen', () => {
  const React = require('react');
  const { Text: T } = require('react-native');
  const { useHomeDock } = require('../../../components/home/GremlyHomeDock');
  return function MockChat(props: { embedded?: boolean }) {
    const dock = useHomeDock();
    React.useEffect(() => {
      dock?.registerChat({ send: mockChatSend, isSending: () => false });
      if (mockChatPrefill) dock?.prefillDraft(mockChatPrefill);
      return () => dock?.registerChat(null);
    }, [dock]);
    return <T testID="chat-page">{`chat embedded=${props.embedded}`}</T>;
  };
});

const mockMarkHomeChatOpened = jest.fn();
const mockMarkHomeSwipeHintSeen = jest.fn();
let mockState: Record<string, unknown>;
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: (s: Record<string, unknown>) => unknown) => selector(mockState),
}));
jest.mock('../../../lib/store/lifecycleSelectors', () => ({
  useNeedsMindDropTutorial: () => false,
}));
// the evening wrap up waiting to be noticed (lib/wrapup/teaser.ts)
let mockWrapNudge = false;
jest.mock('../../../lib/wrapup/useEveningTeaser', () => ({
  useEveningTeaser: () => ({ nudge: mockWrapNudge, offer: mockWrapNudge, cards: 0 }),
}));

import GremlyHomeScreen from '../GremlyHomeScreen';

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = undefined;
  mockChatPrefill = null;
  mockWrapNudge = false;
  mockState = {
    hasOpenedHomeChat: false,
    hasSeenHomeSwipeHint: true,
    markHomeChatOpened: mockMarkHomeChatOpened,
    markHomeSwipeHintSeen: mockMarkHomeSwipeHintSeen,
  };
});

describe('Talk it through and the first week line', () => {
  afterEach(() => jest.useRealTimers());

  it('opens the keyboard once Chat has slid over, when opened from Talk it through', () => {
    jest.useFakeTimers();
    mockParams = {
      mode: 'chat',
      talkKey: 'talk-1',
      talkAbout: { id: 't1', type: 'todo', title: 'Walk Bella', label: 'To-do' },
    };
    render(<GremlyHomeScreen />);
    expect(mockFocus).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(mockFocus).toHaveBeenCalledTimes(1);
  });

  it('does not open the keyboard when Chat opens for another reason', () => {
    jest.useFakeTimers();
    mockParams = { mode: 'chat', prefillPrompt: 'Help me plan', autoSendKey: 'k1' };
    render(<GremlyHomeScreen />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockFocus).not.toHaveBeenCalled();
  });

  it('says what each side is for in the first week, and not after', () => {
    mockState.accountCreatedAt = new Date(Date.now() - 2 * 86400000).toISOString();
    const first = render(<GremlyHomeScreen />);
    expect(first.getByTestId('home-first-week-caption').props.accessibilityLabel).toBe(
      'Drop anything in and Gremly sorts it',
    );
    first.unmount();
    mockState.accountCreatedAt = new Date(Date.now() - 9 * 86400000).toISOString();
    const later = render(<GremlyHomeScreen />);
    expect(later.queryByTestId('home-first-week-caption')).toBeNull();
  });
});

describe('GremlyHomeScreen', () => {
  it('opens on Drop, with the Drop page embedded and Chat not mounted yet', () => {
    const { getByTestId, queryByTestId } = render(<GremlyHomeScreen />);
    expect(getByTestId('drop-page').props.children).toBe('drop embedded=true active=true');
    expect(queryByTestId('chat-page')).toBeNull();
    expect(getByTestId('home-switch-drop').props.accessibilityState).toEqual({ selected: true });
  });

  it('shows the new dot on CHAT until Chat has been opened', () => {
    const { getByTestId } = render(<GremlyHomeScreen />);
    expect(getByTestId('home-chat-new-dot')).toBeTruthy();
  });

  it('hides the new dot once Chat has been opened before', () => {
    mockState.hasOpenedHomeChat = true;
    const { queryByTestId } = render(<GremlyHomeScreen />);
    expect(queryByTestId('home-chat-new-dot')).toBeNull();
  });

  it('shows the dot in the evening while the wrap up is waiting', () => {
    mockState.hasOpenedHomeChat = true;
    mockWrapNudge = true;
    const { getByTestId } = render(<GremlyHomeScreen />);
    expect(getByTestId('home-chat-new-dot')).toBeTruthy();
  });

  it('tapping CHAT mounts the Chat page, selects it and marks Chat as opened', () => {
    const { getByTestId } = render(<GremlyHomeScreen />);
    fireEvent.press(getByTestId('home-switch-chat'));
    expect(getByTestId('chat-page').props.children).toBe('chat embedded=true');
    expect(getByTestId('home-switch-chat').props.accessibilityState).toEqual({ selected: true });
    expect(getByTestId('drop-page').props.children).toBe('drop embedded=true active=false');
    expect(mockMarkHomeChatOpened).toHaveBeenCalledTimes(1);
  });

  it('opens Chat when another screen asks for it, then clears the request', () => {
    mockParams = { mode: 'chat', prefillPrompt: 'hello', autoSendKey: 'minddrop-1' };
    const { getByTestId } = render(<GremlyHomeScreen />);
    expect(getByTestId('chat-page')).toBeTruthy();
    expect(mockSetParams).toHaveBeenCalledWith({ mode: undefined });
  });

  it("shows the Drop page's input box once, under both pages", () => {
    const { getAllByTestId, getByTestId } = render(<GremlyHomeScreen />);
    expect(getAllByTestId('shared-box')).toHaveLength(1);
    expect(getByTestId('shared-box-label').props.children).toBe('Drop to Gremly');
  });

  it('in Chat, the same box relabels and sends to the Chat page', () => {
    const { getByTestId } = render(<GremlyHomeScreen />);
    fireEvent.press(getByTestId('home-switch-chat'));
    expect(getByTestId('shared-box-label').props.children).toBe('Send to Gremly');
    fireEvent.press(getByTestId('shared-box'));
    expect(mockChatSend).toHaveBeenCalledWith('hello from the box');
  });

  it('puts a prompt from another screen into the shared box', () => {
    // AskGremlyScreen calls prefillDraft for a prompt that should not auto-send
    mockChatPrefill = 'Plan the week with me';
    const { getByTestId } = render(<GremlyHomeScreen />);
    fireEvent.press(getByTestId('home-switch-chat'));
    expect(getByTestId('shared-box-draft').props.children).toBe('Plan the week with me');
  });

  it('tucks the switch away while typing in Chat, and brings it back after', () => {
    const handlers: Record<string, () => void> = {};
    const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((
      event: string,
      handler: () => void,
    ) => {
      handlers[event] = handler;
      return { remove: jest.fn() };
    }) as any);
    const { getByTestId, queryByTestId } = render(<GremlyHomeScreen />);
    const show = handlers.keyboardWillShow ?? handlers.keyboardDidShow;
    const hide = handlers.keyboardWillHide ?? handlers.keyboardDidHide;

    // typing in Drop keeps the switch (you might want to move to Chat)
    act(() => show());
    expect(queryByTestId('home-switch-chat')).toBeTruthy();
    act(() => hide());

    fireEvent.press(getByTestId('home-switch-chat'));
    act(() => show());
    expect(queryByTestId('home-switch-chat')).toBeNull();
    act(() => hide());
    expect(queryByTestId('home-switch-chat')).toBeTruthy();
    spy.mockRestore();
  });

  it('shows the one-time hint on first visit and records it as seen', () => {
    jest.useFakeTimers();
    mockState.hasSeenHomeSwipeHint = false;
    const { getByTestId, queryByText } = render(<GremlyHomeScreen />);
    // the hint waits for the pager to have a size
    fireEvent(getByTestId('gremly-home-pager'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 600 } },
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(queryByText('Swipe or tap for Chat')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(6000);
    });
    expect(mockMarkHomeSwipeHintSeen).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
