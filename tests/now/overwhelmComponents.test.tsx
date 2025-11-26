/**
 * Tests for Overwhelm UI components
 */

import React from 'react';
import { render, screen } from '../utils/renderWithProviders';
import { OverwhelmSelectSheet } from '../../components/now/OverwhelmSelectSheet';
import { OverwhelmPlanSheet } from '../../components/now/OverwhelmPlanSheet';
import { OverwhelmFocusOverlay } from '../../components/now/OverwhelmFocusOverlay';
import type { NowActiveItem } from '../../lib/now/nowTypes';
import type { OverwhelmPlanItem } from '../../lib/now/useOverwhelmFlow';

describe('OverwhelmSelectSheet', () => {
  const mockItems: NowActiveItem[] = [
    { id: 'habit-1', type: 'habit', name: 'Morning Meditation', locked: false, cadence: 'daily' },
    { id: 'todo-1', type: 'todo', name: 'Finish report', locked: false },
  ];

  it('renders title when visible', () => {
    render(
      <OverwhelmSelectSheet
        visible={true}
        items={mockItems}
        selectedIds={[]}
        onToggleSelect={jest.fn()}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Pick your 3 most important items')).toBeTruthy();
  });

  it('shows selection count', () => {
    render(
      <OverwhelmSelectSheet
        visible={true}
        items={mockItems}
        selectedIds={['habit-1']}
        onToggleSelect={jest.fn()}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('1/3 selected')).toBeTruthy();
  });

  it('displays all items', () => {
    render(
      <OverwhelmSelectSheet
        visible={true}
        items={mockItems}
        selectedIds={[]}
        onToggleSelect={jest.fn()}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Morning Meditation')).toBeTruthy();
    expect(screen.getByText('Finish report')).toBeTruthy();
  });

  it('shows empty state when no items', () => {
    render(
      <OverwhelmSelectSheet
        visible={true}
        items={[]}
        selectedIds={[]}
        onToggleSelect={jest.fn()}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('No items available')).toBeTruthy();
  });
});

describe('OverwhelmPlanSheet', () => {
  const mockPlan: OverwhelmPlanItem[] = [
    {
      itemId: 'habit-1',
      title: 'Morning Meditation',
      steps: ['Find a quiet spot', 'Set a timer for 5 minutes', 'Start breathing'],
      encouragement: 'Small steps lead to big changes!',
    },
  ];

  it('shows loading state', () => {
    render(
      <OverwhelmPlanSheet
        visible={true}
        plan={null}
        isLoading={true}
        onEnterFocus={jest.fn()}
        onChangeSelection={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Gremly is preparing tiny steps...')).toBeTruthy();
  });

  it('displays plan items', () => {
    render(
      <OverwhelmPlanSheet
        visible={true}
        plan={mockPlan}
        isLoading={false}
        onEnterFocus={jest.fn()}
        onChangeSelection={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Morning Meditation')).toBeTruthy();
    expect(screen.getByText(/Find a quiet spot/)).toBeTruthy();
    expect(screen.getByText(/Set a timer for 5 minutes/)).toBeTruthy();
    expect(screen.getByText('Small steps lead to big changes!')).toBeTruthy();
  });

  it('shows action buttons', () => {
    render(
      <OverwhelmPlanSheet
        visible={true}
        plan={mockPlan}
        isLoading={false}
        onEnterFocus={jest.fn()}
        onChangeSelection={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Lock these in')).toBeTruthy();
    expect(screen.getByText('Change selection')).toBeTruthy();
    expect(screen.getByText('Close')).toBeTruthy();
  });
});

describe('OverwhelmFocusOverlay', () => {
  const mockPlan: OverwhelmPlanItem[] = [
    {
      itemId: 'habit-1',
      title: 'Morning Meditation',
      steps: ['Find a quiet spot', 'Set a timer for 5 minutes'],
      encouragement: 'You got this!',
    },
  ];

  it('renders header when visible', () => {
    render(<OverwhelmFocusOverlay visible={true} plan={mockPlan} onExit={jest.fn()} />);

    expect(screen.getByText('Focus on these steps')).toBeTruthy();
    expect(screen.getByText('Take it one micro-step at a time')).toBeTruthy();
  });

  it('displays plan items', () => {
    render(<OverwhelmFocusOverlay visible={true} plan={mockPlan} onExit={jest.fn()} />);

    expect(screen.getByText('Morning Meditation')).toBeTruthy();
    expect(screen.getByText('Find a quiet spot')).toBeTruthy();
    expect(screen.getByText('Set a timer for 5 minutes')).toBeTruthy();
  });

  it('shows encouragement with emoji', () => {
    render(<OverwhelmFocusOverlay visible={true} plan={mockPlan} onExit={jest.fn()} />);

    expect(screen.getByText(/💪 You got this!/)).toBeTruthy();
  });

  it('shows done button', () => {
    render(<OverwhelmFocusOverlay visible={true} plan={mockPlan} onExit={jest.fn()} />);

    expect(screen.getByText("I'm ready to start")).toBeTruthy();
  });

  it('shows empty state when no plan', () => {
    render(<OverwhelmFocusOverlay visible={true} plan={null} onExit={jest.fn()} />);

    expect(screen.getByText('No focus items available')).toBeTruthy();
  });
});
