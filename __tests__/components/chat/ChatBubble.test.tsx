/**
 * Snapshot tests for ChatBubble component - Phase 10.5
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ChatBubble } from '../../../components/chat/ChatBubble';
import { SpaceChatMessage } from '../../../lib/types';

const mockUserMessage: SpaceChatMessage = {
  id: '1',
  chat_id: 'chat-1',
  user_id: 'user-1',
  role: 'user',
  content: 'Hello, this is a user message!',
  created_at: '2023-01-01T00:00:00Z',
  scope_id: 'space-1',
};

const mockAssistantMessage: SpaceChatMessage = {
  id: '2',
  chat_id: 'chat-1',
  user_id: 'user-1',
  role: 'assistant',
  content:
    'Hi there! This is an assistant response with some longer text to test the bubble styling.',
  metadata_json: { confidence: 0.95 },
  created_at: '2023-01-01T00:01:00Z',
  scope_id: 'space-1',
};

const mockSystemMessage: SpaceChatMessage = {
  id: '3',
  chat_id: 'chat-1',
  user_id: 'user-1',
  role: 'system',
  content: 'System notification message',
  created_at: '2023-01-01T00:02:00Z',
  scope_id: 'space-1',
};

describe('ChatBubble', () => {
  it('renders user message correctly', () => {
    const tree = render(<ChatBubble message={mockUserMessage} />).toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('renders assistant message correctly', () => {
    const tree = render(<ChatBubble message={mockAssistantMessage} />).toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('renders system message correctly', () => {
    const tree = render(<ChatBubble message={mockSystemMessage} />).toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('applies correct styling for user vs assistant messages', () => {
    const { getByTestId: getUserBubble } = render(
      <ChatBubble message={mockUserMessage} testID="user-bubble" />,
    );
    const { getByTestId: getAssistantBubble } = render(
      <ChatBubble message={mockAssistantMessage} testID="assistant-bubble" />,
    );

    const userBubble = getUserBubble('user-bubble');
    const assistantBubble = getAssistantBubble('assistant-bubble');

    // User messages should be right-aligned - check style array contains the alignment
    const userStyle = Array.isArray(userBubble.props.style)
      ? userBubble.props.style
      : [userBubble.props.style];
    expect(userStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          alignItems: 'flex-end',
        }),
      ]),
    );

    // Assistant messages should be left-aligned
    const assistantStyle = Array.isArray(assistantBubble.props.style)
      ? assistantBubble.props.style
      : [assistantBubble.props.style];
    expect(assistantStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          alignItems: 'flex-start',
        }),
      ]),
    );
  });

  it('displays message content correctly', () => {
    const { getByText } = render(<ChatBubble message={mockUserMessage} />);
    expect(getByText('Hello, this is a user message!')).toBeTruthy();
  });

  describe('streaming state', () => {
    it('renders streaming cursor when isStreaming is true', () => {
      const streamingMessage = {
        ...mockAssistantMessage,
        isStreaming: true,
      } as SpaceChatMessage & { isStreaming: boolean };

      const { toJSON } = render(<ChatBubble message={streamingMessage} />);
      expect(toJSON()).toMatchSnapshot();
    });

    it('renders retry UI when streamingCancelled is true', () => {
      const failedMessage = {
        ...mockAssistantMessage,
        streamingCancelled: true,
      } as SpaceChatMessage & { streamingCancelled: boolean };

      const { getByText } = render(<ChatBubble message={failedMessage} />);
      expect(getByText(/Hmm, I lost my train of thought/)).toBeTruthy();
      expect(getByText('Tap to continue')).toBeTruthy();
    });

    it('calls onRetryStream when retry is tapped', () => {
      const onRetryStream = jest.fn();
      const failedMessage = {
        ...mockAssistantMessage,
        streamingCancelled: true,
      } as SpaceChatMessage & { streamingCancelled: boolean };

      const { getByText } = render(
        <ChatBubble message={failedMessage} onRetryStream={onRetryStream} />,
      );
      fireEvent.press(getByText('Tap to continue'));
      expect(onRetryStream).toHaveBeenCalledWith(failedMessage.id);
    });

    it('does not show saveable card when streaming', () => {
      const streamingWithSaveable = {
        ...mockAssistantMessage,
        isStreaming: true,
        saveable: { type: 'todo', title: 'Test todo', description: '' },
      } as SpaceChatMessage & { isStreaming: boolean };

      const { queryByText } = render(<ChatBubble message={streamingWithSaveable} />);
      // SaveButton text should not appear during streaming
      expect(queryByText('Save')).toBeNull();
    });
  });
});
