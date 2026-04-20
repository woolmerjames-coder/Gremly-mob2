/**
 * ActionButton.test.tsx
 *
 * Tests for the ActionButton component, a Pressable wrapper that
 * signals intentional user interaction to the mascot lifecycle system.
 */

import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ActionButton } from '../../../components/ui/ActionButton';
import { MascotModeProvider } from '../../../contexts/MascotModeContext';

const mockResetInactivity = jest.fn();
const mockSignalAnimationFinish = jest.fn();

function renderWithProvider(ui: React.ReactElement) {
  return render(
    <MascotModeProvider
      value={{
        mode: 'idle',
        resetInactivity: mockResetInactivity,
        signalAnimationFinish: mockSignalAnimationFinish,
      }}
    >
      {ui}
    </MascotModeProvider>,
  );
}

describe('ActionButton', () => {
  beforeEach(() => {
    mockResetInactivity.mockClear();
  });

  it('renders children', () => {
    const { getByText } = renderWithProvider(
      <ActionButton>
        <Text>Press me</Text>
      </ActionButton>,
    );

    expect(getByText('Press me')).toBeTruthy();
  });

  it('calls resetInactivity on press', () => {
    const { getByText } = renderWithProvider(
      <ActionButton>
        <Text>Action</Text>
      </ActionButton>,
    );

    fireEvent.press(getByText('Action'));
    expect(mockResetInactivity).toHaveBeenCalledTimes(1);
  });

  it('calls parent onPress after resetInactivity', () => {
    const onPress = jest.fn();

    const { getByText } = renderWithProvider(
      <ActionButton onPress={onPress}>
        <Text>Tap</Text>
      </ActionButton>,
    );

    fireEvent.press(getByText('Tap'));

    expect(mockResetInactivity).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('calls resetInactivity even when no onPress prop', () => {
    const { getByText } = renderWithProvider(
      <ActionButton>
        <Text>Solo</Text>
      </ActionButton>,
    );

    fireEvent.press(getByText('Solo'));
    expect(mockResetInactivity).toHaveBeenCalledTimes(1);
  });

  it('forwards testID prop', () => {
    const { getByTestId } = renderWithProvider(
      <ActionButton testID="action-btn">
        <Text>Test</Text>
      </ActionButton>,
    );

    expect(getByTestId('action-btn')).toBeTruthy();
  });
});
