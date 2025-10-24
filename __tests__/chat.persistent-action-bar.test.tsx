/**
 * Chat Persistent Action Bar
 * Verifies the bar opens Unified Overlay with the current spaceId.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../design/theme';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ChatThreadScreen from '../app/spaces/ChatThreadScreen';
// Mock heavy overlay to reduce render cost
jest.mock('../components/overlay/UnifiedCreateOverlay', () => ({
  UnifiedCreateOverlay: () => null,
}));

// Mock lucide-react-native to avoid SVG issues in tests
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    Plus: View,
    Send: View,
    Brain: View,
    Check: View,
    FileText: View,
    Flame: View,
    Pen: View,
  };
});

// Mock providers and hooks used by ChatThreadScreen
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    userId: 'test-user',
    user: { id: 'test-user' },
    waitForSession: jest.fn().mockResolvedValue(null),
  }),
}));

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({ writeEvent: jest.fn() }),
}));

jest.mock('../hooks/useChatMessages', () => ({
  useChatMessages: () => ({
    messages: [],
    loading: false,
    error: null,
    sendUserMessage: jest.fn().mockResolvedValue(undefined),
    appendAssistantMessage: jest.fn().mockResolvedValue(undefined),
  }),
}));

// Spyable overlay controller
const mockOpenCreate = jest.fn();
jest.mock('../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({
    state: { visible: false, mode: 'create', initialEntity: undefined, initialSpaceId: undefined },
    openCreate: mockOpenCreate,
    openEdit: jest.fn(),
    close: jest.fn(),
  }),
}));

describe('Chat Persistent Action Bar', () => {
  const mockNavigation: any = { navigate: jest.fn(), goBack: jest.fn() };
  const mockRoute: any = {
    key: 'ChatThread',
    name: 'ChatThread',
    params: { chatId: 'chat-abc', spaceId: 'space-xyz' },
  };

  beforeEach(() => {
    mockOpenCreate.mockClear();
    process.env.EXPO_PUBLIC_FEATURE_CHAT = 'on';
  });

  it('opens Unified Overlay with the current spaceId when pressed', async () => {
    const { getByText } = render(
      <SafeAreaProvider>
        <ThemeProvider>
          <ChatThreadScreen navigation={mockNavigation} route={mockRoute} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    const cta = getByText(/Set up an action in this Space/i);
    fireEvent.press(cta);

    await waitFor(() => {
      expect(mockOpenCreate).toHaveBeenCalledWith({ spaceId: 'space-xyz' });
    });
  });
});
