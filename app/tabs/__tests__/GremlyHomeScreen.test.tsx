/**
 * GremlyHomeScreen.test.tsx
 *
 * The centre tab: DROP | CHAT switch over Mind Drop and Ask Gremly.
 */

import React from 'react';
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

jest.mock('../../screens/CatchAllNotepad', () => {
  const { Text: T } = require('react-native');
  return function MockDrop(props: { embedded?: boolean; active?: boolean }) {
    return <T testID="drop-page">{`drop embedded=${props.embedded} active=${props.active}`}</T>;
  };
});

jest.mock('../AskGremlyScreen', () => {
  const { Text: T } = require('react-native');
  return function MockChat(props: { embedded?: boolean }) {
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

import GremlyHomeScreen from '../GremlyHomeScreen';

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = undefined;
  mockState = {
    hasOpenedHomeChat: false,
    hasSeenHomeSwipeHint: true,
    markHomeChatOpened: mockMarkHomeChatOpened,
    markHomeSwipeHintSeen: mockMarkHomeSwipeHintSeen,
  };
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
