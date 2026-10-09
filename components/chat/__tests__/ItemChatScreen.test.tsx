/**
 * Opening a chat from an item opens the Ask Gremly chat tied to that item,
 * through EntityChatScreen, the name every entry point uses.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

let mockItemProps: any = null;
jest.mock('../../../app/tabs/AskGremlyScreen', () => {
  const { Text } = require('react-native');
  return function MockAskGremly(props: any) {
    mockItemProps = props.item;
    return <Text testID="ask-gremly">{props.item?.anchor?.title}</Text>;
  };
});

let mockState: any;
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: (s: any) => unknown) => selector(mockState),
}));

const mockFetchItemTopics = jest.fn();
jest.mock('../../../lib/cortex/CortexClient', () => ({
  ...jest.requireActual('../../../lib/cortex/CortexClient'),
  fetchItemTopics: (...args: unknown[]) => mockFetchItemTopics(...args),
}));

import { ItemChatScreen } from '../ItemChatScreen';
import { EntityChatScreen } from '../EntityChatScreen';

beforeEach(() => {
  mockItemProps = null;
  mockState = {
    todos: [{ id: 't1', name: 'Walk Pepper', title: 'Walk Pepper' }],
    habits: [{ id: 'h1', name: 'Run', title: null }],
    notes: [{ id: 'n1', title: 'Pepper Vet Appointment', subtype: 'event' }],
  };
});

describe('ItemChatScreen', () => {
  it('opens the chat tied to the item, named the way the cards name it', () => {
    const onClose = jest.fn();
    render(<ItemChatScreen entityId="n1" entityType="note" onClose={onClose} />);
    expect(mockItemProps.anchor).toEqual({
      id: 'n1',
      type: 'note',
      title: 'Pepper Vet Appointment',
    });
    expect(mockItemProps.label).toBe('Event');
    expect(mockItemProps.initialPrompt).toBeNull();
    expect(mockItemProps.starters.map((s: any) => s.key)).toContain('expand');
    mockItemProps.onClose();
    expect(onClose).toHaveBeenCalled();
  });

  it("a note's chat draws its starters from what the note says; other kinds keep theirs", async () => {
    mockFetchItemTopics.mockResolvedValue([{ label: 'The vet', message: 'What should I ask the vet?' }]);
    render(<ItemChatScreen entityId="n1" entityType="note" onClose={jest.fn()} />);
    const drawn = await mockItemProps.loadStarters();
    expect(mockFetchItemTopics).toHaveBeenCalledWith('n1');
    expect(drawn.map((s: any) => [s.key, s.label, s.prompt])).toEqual([
      ['topic-0', 'The vet', 'What should I ask the vet?'],
    ]);
    render(<ItemChatScreen entityId="t1" entityType="todo" onClose={jest.fn()} />);
    expect(mockItemProps.loadStarters).toBeUndefined();
  });

  it('starts with the message a screen asked for', () => {
    render(
      <ItemChatScreen
        entityId="h1"
        entityType="habit"
        initialPreset="why_skipping"
        onClose={jest.fn()}
      />,
    );
    expect(mockItemProps.anchor.title).toBe('Run');
    expect(mockItemProps.initialPrompt).toMatch(/^I've been struggling/);
  });

  it('says so when the item is no longer there', () => {
    const onClose = jest.fn();
    const { getByTestId, getByLabelText } = render(
      <ItemChatScreen entityId="gone" entityType="todo" onClose={onClose} />,
    );
    expect(getByTestId('item-chat-missing')).toBeTruthy();
    fireEvent.press(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('every place that opened the old entity chat opens this one', () => {
    const { getByTestId } = render(
      <EntityChatScreen entityId="t1" entityType="todo" onClose={jest.fn()} />,
    );
    expect(getByTestId('ask-gremly').props.children).toBe('Walk Pepper');
  });
});
