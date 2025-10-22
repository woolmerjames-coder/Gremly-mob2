/**
 * Chat Wiring Smoke Test
 * Verifies ChatThreadScreen integrates with Cortex and Repo correctly.
 * Shallow render with mocked providers - no navigation, no network.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ChatThreadScreen from '../app/spaces/ChatThreadScreen';
import * as AuthProvider from '../providers/AuthProvider';
import * as RepoProvider from '../providers/RepoProvider';
import * as cortexDecideModule from '../lib/cortex/cortexDecide';

// Mock navigation
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
} as any;

const mockRoute = {
  params: { chatId: 'chat-123' },
  key: 'chat-key',
  name: 'ChatThread',
} as any;

// Mock providers
jest.mock('../providers/AuthProvider');
jest.mock('../providers/RepoProvider');
jest.mock('../lib/cortex/cortexDecide');

describe('Chat Wiring Smoke Test', () => {
  let mockRepo: any;
  let mockCortexDecide: jest.SpyInstance;

  beforeEach(() => {
    // Mock auth provider
    jest.spyOn(AuthProvider, 'useAuth').mockReturnValue({
      userId: 'user-123',
      user: { id: 'user-123' } as any,
      session: null,
      loading: false,
      error: null,
      signInWithEmail: jest.fn(),
      devSignIn: jest.fn(),
      signOut: jest.fn(),
      clearError: jest.fn(),
      waitForSession: jest.fn().mockResolvedValue(null),
    });

    // Mock repo with all methods used by ChatThreadScreen
    mockRepo = {
      create: jest.fn().mockResolvedValue({ id: 'item-1' }),
      getOrCreateList: jest.fn().mockResolvedValue({
        id: 'list-shopping',
        name: 'Shopping',
        key: 'shopping',
      }),
      addListItem: jest.fn().mockResolvedValue(undefined),
      listSpaces: jest.fn().mockResolvedValue([
        { id: 'space-work', name: 'Work' },
        { id: 'space-home', name: 'Home' },
      ]),
      writeEvent: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(RepoProvider, 'useRepo').mockReturnValue(mockRepo as any);

    // Mock cortexDecide
    mockCortexDecide = cortexDecideModule.cortexDecide as jest.Mock;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('G1 - Shopping list intent integration', () => {
    it('should call cortexDecide, execute actions, and show confirmations', async () => {
      // Mock G1 response: shopping list with auto mode
      mockCortexDecide.mockResolvedValue({
        actions: [
          {
            type: 'add.to.list',
            payload: {
              listKey: 'shopping',
              item: 'oats',
              spaceId: null,
            },
          },
        ],
        mode: 'auto',
        confidence: 0.92,
        explanation: 'Added to your shopping list',
      });

      const { getByPlaceholderText, getByText } = render(
        <ChatThreadScreen navigation={mockNavigation} route={mockRoute} />,
      );

      // Wait for chat to load
      await waitFor(() => {
        expect(getByPlaceholderText(/Type a message/i)).toBeTruthy();
      });

      const input = getByPlaceholderText(/Type a message/i);
      const sendButton = getByText(/Send/i);

      // Simulate user typing and sending
      fireEvent.changeText(input, 'add oats to my shopping list');
      fireEvent.press(sendButton);

      // Wait for async operations
      await waitFor(() => {
        // Verify cortexDecide was called with correct context
        expect(mockCortexDecide).toHaveBeenCalledWith(
          { text: 'add oats to my shopping list' },
          expect.objectContaining({
            userId: 'user-123',
            uiSurface: 'chat',
          }),
        );
      });

      // Verify repo methods were called in correct order
      await waitFor(() => {
        expect(mockRepo.getOrCreateList).toHaveBeenCalledWith(
          'shopping',
          expect.objectContaining({
            userId: 'user-123',
          }),
        );
      });

      await waitFor(() => {
        expect(mockRepo.addListItem).toHaveBeenCalledWith('list-shopping', 'oats');
      });

      // Verify event was logged
      await waitFor(() => {
        expect(mockRepo.writeEvent).toHaveBeenCalledWith(
          'cortex_decision',
          expect.objectContaining({
            source: 'chat',
            text: 'add oats to my shopping list',
            mode: 'auto',
            confidence: 0.92,
          }),
          expect.objectContaining({
            userId: 'user-123',
          }),
        );
      });
    });

    it('should handle todo creation action', async () => {
      mockCortexDecide.mockResolvedValue({
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Review PRs',
              due: null,
              spaceId: 'space-work',
            },
          },
        ],
        mode: 'auto',
        confidence: 0.88,
        explanation: 'Created a todo for you',
      });

      const { getByPlaceholderText, getByText } = render(
        <ChatThreadScreen navigation={mockNavigation} route={mockRoute} />,
      );

      await waitFor(() => {
        expect(getByPlaceholderText(/Type a message/i)).toBeTruthy();
      });

      const input = getByPlaceholderText(/Type a message/i);
      const sendButton = getByText(/Send/i);

      fireEvent.changeText(input, 'remind me to review PRs');
      fireEvent.press(sendButton);

      await waitFor(() => {
        expect(mockRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'todo',
            title: 'Review PRs',
            space_id: 'space-work',
            ai_placed: true,
          }),
        );
      });
    });

    it('should handle habit creation action', async () => {
      mockCortexDecide.mockResolvedValue({
        actions: [
          {
            type: 'create.habit',
            payload: {
              name: 'Meditation',
              freq: 'daily',
              spaceId: null,
            },
          },
        ],
        mode: 'auto',
        confidence: 0.85,
        explanation: 'Created a daily habit',
      });

      const { getByPlaceholderText, getByText } = render(
        <ChatThreadScreen navigation={mockNavigation} route={mockRoute} />,
      );

      await waitFor(() => {
        expect(getByPlaceholderText(/Type a message/i)).toBeTruthy();
      });

      const input = getByPlaceholderText(/Type a message/i);
      const sendButton = getByText(/Send/i);

      fireEvent.changeText(input, 'start meditating daily');
      fireEvent.press(sendButton);

      await waitFor(() => {
        expect(mockRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'habit',
            name: 'Meditation',
            frequency: 'daily',
            ai_placed: true,
          }),
        );
      });
    });
  });

  describe('Error handling', () => {
    it('should not crash when cortexDecide fails', async () => {
      mockCortexDecide.mockRejectedValue(new Error('Cortex unavailable'));

      const { getByPlaceholderText, getByText } = render(
        <ChatThreadScreen navigation={mockNavigation} route={mockRoute} />,
      );

      await waitFor(() => {
        expect(getByPlaceholderText(/Type a message/i)).toBeTruthy();
      });

      const input = getByPlaceholderText(/Type a message/i);
      const sendButton = getByText(/Send/i);

      fireEvent.changeText(input, 'test message');
      fireEvent.press(sendButton);

      // Should not throw - fail safe
      await waitFor(() => {
        expect(mockCortexDecide).toHaveBeenCalled();
      });

      // Event logging should not be called if cortex failed
      expect(mockRepo.writeEvent).not.toHaveBeenCalled();
    });

    it('should continue when action execution fails', async () => {
      mockCortexDecide.mockResolvedValue({
        actions: [
          {
            type: 'add.to.list',
            payload: {
              listKey: 'shopping',
              item: 'milk',
              spaceId: null,
            },
          },
        ],
        mode: 'auto',
        confidence: 0.9,
      });

      // Mock getOrCreateList to fail
      mockRepo.getOrCreateList.mockRejectedValue(new Error('DB error'));

      const { getByPlaceholderText, getByText } = render(
        <ChatThreadScreen navigation={mockNavigation} route={mockRoute} />,
      );

      await waitFor(() => {
        expect(getByPlaceholderText(/Type a message/i)).toBeTruthy();
      });

      const input = getByPlaceholderText(/Type a message/i);
      const sendButton = getByText(/Send/i);

      fireEvent.changeText(input, 'buy milk');
      fireEvent.press(sendButton);

      // Should not crash
      await waitFor(() => {
        expect(mockRepo.getOrCreateList).toHaveBeenCalled();
      });

      // Event should still be logged even if action failed
      await waitFor(() => {
        expect(mockRepo.writeEvent).toHaveBeenCalled();
      });
    });
  });

  describe('Ask mode handling', () => {
    it('should show suggestions when mode is ask', async () => {
      mockCortexDecide.mockResolvedValue({
        actions: [],
        mode: 'ask',
        confidence: 0.55,
        suggestions: ['Create a todo', 'Add to notes'],
        explanation: 'Not quite sure what you meant',
      });

      const { getByPlaceholderText, getByText, findByText } = render(
        <ChatThreadScreen navigation={mockNavigation} route={mockRoute} />,
      );

      await waitFor(() => {
        expect(getByPlaceholderText(/Type a message/i)).toBeTruthy();
      });

      const input = getByPlaceholderText(/Type a message/i);
      const sendButton = getByText(/Send/i);

      fireEvent.changeText(input, 'ambiguous request');
      fireEvent.press(sendButton);

      // Should show AI response with suggestions
      await waitFor(async () => {
        const aiMessage = await findByText(/not quite sure/i);
        expect(aiMessage).toBeTruthy();
      });
    });
  });
});
