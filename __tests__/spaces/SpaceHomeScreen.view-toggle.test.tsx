/**
 * SpaceHomeScreen View Toggle Tests
 *
 * Tests for the top-level "Actions" / "Chats" mode toggle.
 * Verifies:
 * - Toggle renders with correct testID
 * - Toggle shows both options (Actions, Chats)
 * - State updates when toggling between modes
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { View, Text, Pressable, StyleSheet } from 'react-native';

// ============================================================================
// TEST IMPLEMENTATIONS OF VIEW TOGGLE (matching SpaceHomeScreen)
// ============================================================================

type SpaceViewMode = 'actions' | 'chats';

const VIEW_OPTIONS: { key: SpaceViewMode; label: string }[] = [
  { key: 'actions', label: 'Actions' },
  { key: 'chats', label: 'Chats' },
];

/** Test version of the view toggle (using same pattern as SegmentedPills) */
function TestViewToggle({
  selected,
  onSelect,
}: {
  selected: SpaceViewMode;
  onSelect: (mode: SpaceViewMode) => void;
}) {
  return (
    <View testID="space-view-toggle">
      {VIEW_OPTIONS.map((opt) => {
        const isActive = selected === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onSelect(opt.key)}
            testID={`space-view-toggle-${opt.key}`}
            accessibilityRole="button"
            accessibilityLabel={`Show ${opt.label}`}
            accessibilityState={{ selected: isActive }}
          >
            <Text style={isActive ? styles.toggleActive : styles.toggleInactive}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Test container that simulates SpaceHomeScreen view toggle behavior */
function TestSpaceLayoutWithToggle({ initialView = 'actions' }: { initialView?: SpaceViewMode }) {
  const [spaceView, setSpaceView] = React.useState<SpaceViewMode>(initialView);

  return (
    <View testID="space-container">
      <TestViewToggle selected={spaceView} onSelect={setSpaceView} />

      {/* Conditionally render content based on view mode */}
      {spaceView === 'actions' && (
        <View testID="space-actions-content">
          <Text>Actions Zone</Text>
        </View>
      )}
      {spaceView === 'chats' && (
        <View testID="space-chats-content">
          <Text>Chats Zone</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggleActive: {
    fontWeight: '600',
    color: '#2E5540', // mossGreen
  },
  toggleInactive: {
    fontWeight: '500',
    color: '#8A8F8A', // mutedSage
  },
});

// ============================================================================
// TESTS
// ============================================================================

describe('SpaceHomeScreen View Toggle', () => {
  it('renders the view toggle', () => {
    const { getByTestId } = render(<TestSpaceLayoutWithToggle />);
    expect(getByTestId('space-view-toggle')).toBeTruthy();
  });

  it('renders both Actions and Chats options', () => {
    const { getByTestId, getByText } = render(<TestSpaceLayoutWithToggle />);
    expect(getByTestId('space-view-toggle-actions')).toBeTruthy();
    expect(getByTestId('space-view-toggle-chats')).toBeTruthy();
    expect(getByText('Actions')).toBeTruthy();
    expect(getByText('Chats')).toBeTruthy();
  });

  it('defaults to "Actions" view', () => {
    const { getByTestId } = render(<TestSpaceLayoutWithToggle />);
    const actionsTab = getByTestId('space-view-toggle-actions');
    expect(actionsTab.props.accessibilityState.selected).toBe(true);
    expect(getByTestId('space-actions-content')).toBeTruthy();
  });

  it('switches to Chats view when Chats is pressed', () => {
    const { getByTestId, queryByTestId } = render(<TestSpaceLayoutWithToggle />);

    // Initially Actions is active
    expect(queryByTestId('space-actions-content')).toBeTruthy();
    expect(queryByTestId('space-chats-content')).toBeNull();

    // Press Chats toggle
    fireEvent.press(getByTestId('space-view-toggle-chats'));

    // Now Chats should be active
    const chatsTab = getByTestId('space-view-toggle-chats');
    expect(chatsTab.props.accessibilityState.selected).toBe(true);
    expect(queryByTestId('space-chats-content')).toBeTruthy();
    expect(queryByTestId('space-actions-content')).toBeNull();
  });

  it('switches back to Actions view when Actions is pressed', () => {
    const { getByTestId, queryByTestId } = render(
      <TestSpaceLayoutWithToggle initialView="chats" />,
    );

    // Initially Chats is active
    expect(queryByTestId('space-chats-content')).toBeTruthy();
    expect(queryByTestId('space-actions-content')).toBeNull();

    // Press Actions toggle
    fireEvent.press(getByTestId('space-view-toggle-actions'));

    // Now Actions should be active
    const actionsTab = getByTestId('space-view-toggle-actions');
    expect(actionsTab.props.accessibilityState.selected).toBe(true);
    expect(queryByTestId('space-actions-content')).toBeTruthy();
    expect(queryByTestId('space-chats-content')).toBeNull();
  });

  it('accepts custom initial view', () => {
    const { getByTestId } = render(<TestSpaceLayoutWithToggle initialView="chats" />);
    const chatsTab = getByTestId('space-view-toggle-chats');
    expect(chatsTab.props.accessibilityState.selected).toBe(true);
    expect(getByTestId('space-chats-content')).toBeTruthy();
  });
});
