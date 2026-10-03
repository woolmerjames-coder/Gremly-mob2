/**
 * The shared box in Chat (Gremly home): one line with the send arrow inside it,
 * and on Chat's fresh home Gremly's greeting beside him and the chips above
 * the box, which go to the Chat page when tapped.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  HomeDockContext,
  HomeModeContext,
  type ChatHome,
  type HomeDockApi,
  type HomeModeState,
} from '../../../components/home/GremlyHomeDock';
import { homeChipsFor } from '../../../lib/chat/homeChips';

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

const pressChip = jest.fn();

function ChatHomeBox({ chatHome }: { chatHome: ChatHome | null }) {
  const [dock, setDock] = React.useState<React.ReactNode>(null);
  const api = React.useMemo<HomeDockApi>(
    () => ({
      setDock,
      registerChat: () => {},
      getChat: () => ({ send: jest.fn(), isSending: () => false, pressChip }),
      setChatSending: () => {},
      setChatPlaceholder: () => {},
      setChatHome: () => {},
      setChatScrolling: () => {},
      prefillDraft: () => {},
      registerDraftSetter: () => {},
      focusInput: () => {},
      registerFocus: () => {},
    }),
    [],
  );
  const mode = React.useMemo<HomeModeState>(
    () => ({
      mode: 'chat',
      chatSending: false,
      chatScrolling: false,
      chatPlaceholder: null,
      chatHome,
    }),
    [chatHome],
  );
  // the page is kept, as the Gremly home keeps it, so handing over the box
  // does not render it again
  const page = React.useMemo(() => <CatchAllNotepad embedded />, []);
  return (
    <HomeDockContext.Provider value={api}>
      <HomeModeContext.Provider value={mode}>
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
  const home: ChatHome = {
    greeting: 'Morning. Day two in San Diego with Dave.',
    chips: homeChipsFor('morning', 0),
  };

  it("shows Gremly's greeting and the chips on the fresh home, and a chip goes to Chat", () => {
    render(<ChatHomeBox chatHome={home} />);
    expect(screen.getByText('Morning. Day two in San Diego with Dave.')).toBeTruthy();
    expect(screen.getByTestId('home-chip-plan_day')).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-chip-this_week'));
    expect(pressChip).toHaveBeenCalledWith('this_week');
  });

  it('is one line with the send arrow inside it, never the big button', () => {
    render(<ChatHomeBox chatHome={home} />);
    expect(screen.getByTestId('minddrop-inline-send')).toBeTruthy();
    expect(screen.queryByTestId('minddrop-submit-button')).toBeNull();
  });

  it('shows neither greeting nor chips in a conversation', () => {
    render(<ChatHomeBox chatHome={null} />);
    expect(screen.queryByTestId('chat-home-greeting')).toBeNull();
    expect(screen.queryByTestId('home-chips')).toBeNull();
    expect(screen.getByTestId('minddrop-inline-send')).toBeTruthy();
  });
});
