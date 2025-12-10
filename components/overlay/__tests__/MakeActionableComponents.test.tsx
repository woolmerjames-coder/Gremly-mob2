/**
 * Tests for Make Actionable UI components
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: (component: any) => component,
    },
    View,
    FadeIn: {
      delay: () => undefined,
    },
    createAnimatedComponent: (component: any) => component,
  };
});

import { MakeActionableButton } from '../MakeActionableButton';
import { ChecklistProgress } from '../ChecklistProgress';
import { ChecklistView } from '../ChecklistView';
import { RevertToTextButton } from '../RevertToTextButton';
import { TodoPreviewModal } from '../TodoPreviewModal';
import type { ListItem, ExtractedListItem } from '../../../lib/lists';

describe('MakeActionableButton', () => {
  it('renders with correct text', () => {
    const { getByText } = render(<MakeActionableButton onPress={() => {}} />);
    expect(getByText('Make actionable')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<MakeActionableButton onPress={onPress} />);

    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('has correct accessibility role', () => {
    const { getByRole } = render(<MakeActionableButton onPress={() => {}} />);
    expect(getByRole('button')).toBeTruthy();
  });
});

describe('ChecklistProgress', () => {
  it('shows "0 / 3 done" for 3 unchecked items', () => {
    const items: ListItem[] = [
      { id: '1', text: 'Item 1', checked: false },
      { id: '2', text: 'Item 2', checked: false },
      { id: '3', text: 'Item 3', checked: false },
    ];

    const { getByText } = render(<ChecklistProgress items={items} />);
    expect(getByText('0 / 3 done')).toBeTruthy();
  });

  it('shows "2 / 3 done" for 2 checked out of 3', () => {
    const items: ListItem[] = [
      { id: '1', text: 'Item 1', checked: true },
      { id: '2', text: 'Item 2', checked: true },
      { id: '3', text: 'Item 3', checked: false },
    ];

    const { getByText } = render(<ChecklistProgress items={items} />);
    expect(getByText('2 / 3 done')).toBeTruthy();
  });

  it('shows "3 / 3 done" when all complete', () => {
    const items: ListItem[] = [
      { id: '1', text: 'Item 1', checked: true },
      { id: '2', text: 'Item 2', checked: true },
      { id: '3', text: 'Item 3', checked: true },
    ];

    const { getByText } = render(<ChecklistProgress items={items} />);
    expect(getByText('3 / 3 done')).toBeTruthy();
  });
});

describe('ChecklistView', () => {
  const mockItems: ListItem[] = [
    { id: '1', text: 'Task one', checked: false },
    { id: '2', text: 'Task two', checked: true },
    { id: '3', text: 'Task three', checked: false },
  ];

  it('renders all items', () => {
    const { getByText } = render(<ChecklistView items={mockItems} onToggle={() => {}} />);

    expect(getByText('Task one')).toBeTruthy();
    expect(getByText('Task two')).toBeTruthy();
    expect(getByText('Task three')).toBeTruthy();
  });

  it('calls onToggle with correct itemId when checkbox pressed', () => {
    const onToggle = jest.fn();
    const { getByLabelText } = render(<ChecklistView items={mockItems} onToggle={onToggle} />);

    fireEvent.press(getByLabelText('Task one'));
    expect(onToggle).toHaveBeenCalledWith('1');
  });

  it('does not call onToggle when readOnly=true', () => {
    const onToggle = jest.fn();
    const { getByLabelText } = render(
      <ChecklistView items={mockItems} onToggle={onToggle} readOnly />,
    );

    fireEvent.press(getByLabelText('Task one'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('RevertToTextButton', () => {
  it('renders with correct text', () => {
    const { getByText } = render(<RevertToTextButton onPress={() => {}} />);
    expect(getByText('Revert to text')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<RevertToTextButton onPress={onPress} />);

    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('TodoPreviewModal', () => {
  const mockItems: ExtractedListItem[] = [
    { id: '1', text: 'Pack passport', checked: false, isActionable: true },
    { id: '2', text: 'Book hotel', checked: false, isActionable: true },
    { id: '3', text: 'Tip: pack light', checked: false, isActionable: false },
  ];

  it('pre-selects actionable items', () => {
    const { getByText } = render(
      <TodoPreviewModal
        visible={true}
        items={mockItems}
        spaceName="Trip"
        spaceId="space-1"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    // Should show 2 tasks selected (the actionable ones)
    expect(getByText(/2 tasks will be added/)).toBeTruthy();
  });

  it('allows toggling item selection', () => {
    const { getByText } = render(
      <TodoPreviewModal
        visible={true}
        items={mockItems}
        spaceName="Trip"
        spaceId="space-1"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    // Toggle off first item
    fireEvent.press(getByText('Pack passport'));

    // Should now show 1 task
    expect(getByText(/1 task will be added/)).toBeTruthy();
  });

  it('disables confirm button when nothing selected', () => {
    const onConfirm = jest.fn();
    const { getByText } = render(
      <TodoPreviewModal
        visible={true}
        items={mockItems}
        spaceName="Trip"
        spaceId="space-1"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    // Toggle off both actionable items
    fireEvent.press(getByText('Pack passport'));
    fireEvent.press(getByText('Book hotel'));

    // Try to press create button
    fireEvent.press(getByText('Create Tasks'));

    // Should not have called onConfirm
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm with selected items', () => {
    const onConfirm = jest.fn();
    const { getByText } = render(
      <TodoPreviewModal
        visible={true}
        items={mockItems}
        spaceName="Trip"
        spaceId="space-1"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    // Press create button (2 items pre-selected)
    fireEvent.press(getByText(/Create 2 Tasks/));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith([
      { id: '1', text: 'Pack passport', checked: false, isActionable: true },
      { id: '2', text: 'Book hotel', checked: false, isActionable: true },
    ]);
  });

  it('calls onCancel when X pressed', () => {
    const onCancel = jest.fn();
    render(
      <TodoPreviewModal
        visible={true}
        items={mockItems}
        spaceName="Trip"
        spaceId="space-1"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );

    // The X button should have accessibilityLabel (we need to add it to the component)
    // For now, use Cancel button
    const { getByText } = render(
      <TodoPreviewModal
        visible={true}
        items={mockItems}
        spaceName="Trip"
        spaceId="space-1"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );

    fireEvent.press(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
