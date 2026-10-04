/**
 * The shared box in Chat (Gremly home) is the Drop page's box: the same size
 * and the same big button, so the box and Gremly stay still when the pages
 * slide between Drop and Chat. Chat's greeting and chips sit on the Chat page.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  HomeDockContext,
  HomeModeContext,
  type HomeDockApi,
  type HomeModeState,
} from '../../../components/home/GremlyHomeDock';

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => ({ repo: { upsertNote: jest.fn() } }),
}));
jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()) }),
  };
});
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 100 }));
jest.mock('@/src/config/featureFlags', () => ({ MIND_DROP_V2: true }));

import CatchAllNotepad from '../CatchAllNotepad';

const send = jest.fn();

function SharedBox({ mode }: { mode: 'drop' | 'chat' }) {
  const [dock, setDock] = React.useState<React.ReactNode>(null);
  const api = React.useMemo<HomeDockApi>(
    () => ({
      setDock,
      registerChat: () => {},
      getChat: () => ({ send, isSending: () => false }),
      setChatSending: () => {},
      setChatPlaceholder: () => {},
      setChatScrolling: () => {},
      prefillDraft: () => {},
      registerDraftSetter: () => {},
      focusInput: () => {},
      registerFocus: () => {},
    }),
    [],
  );
  const modeState = React.useMemo<HomeModeState>(
    () => ({ mode, chatSending: false, chatScrolling: false, chatPlaceholder: null }),
    [mode],
  );
  // the page is kept, as the Gremly home keeps it, so handing over the box
  // does not render it again
  const page = React.useMemo(() => <CatchAllNotepad embedded />, []);
  return (
    <HomeDockContext.Provider value={api}>
      <HomeModeContext.Provider value={modeState}>
        {page}
        {dock}
      </HomeModeContext.Provider>
    </HomeDockContext.Provider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.clear();
});

describe('the shared box in Chat', () => {
  it('keeps the Drop page box and its big button, so nothing moves between the pages', () => {
    const drop = render(<SharedBox mode="drop" />);
    expect(drop.getByTestId('minddrop-submit-button').props.accessibilityLabel).toBe(
      'Drop to Gremly',
    );
    drop.unmount();
    render(<SharedBox mode="chat" />);
    expect(screen.getByTestId('minddrop-submit-button').props.accessibilityLabel).toBe(
      'Send to Gremly',
    );
    expect(screen.queryByTestId('minddrop-inline-send')).toBeNull();
  });

  it('sends what is typed to the Chat page', () => {
    render(<SharedBox mode="chat" />);
    fireEvent.changeText(screen.getByTestId('minddrop-input'), 'Is Friday free?');
    fireEvent.press(screen.getByTestId('minddrop-submit-button'));
    expect(send).toHaveBeenCalledWith('Is Friday free?');
  });
});
