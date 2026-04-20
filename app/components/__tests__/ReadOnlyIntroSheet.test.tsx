/**
 * Tests for ReadOnlyIntroSheet component.
 *
 * Covers: visibility toggle, callback wiring, accessible text rendering.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../MascotLottie', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="mascot-lottie" /> };
});

import ReadOnlyIntroSheet from '../ReadOnlyIntroSheet';

describe('ReadOnlyIntroSheet', () => {
  const onDismiss = jest.fn();
  const onSubscribe = jest.fn();

  beforeEach(() => {
    onDismiss.mockClear();
    onSubscribe.mockClear();
  });

  it('does not show content when not visible', () => {
    const { queryByText } = render(
      <ReadOnlyIntroSheet visible={false} onDismiss={onDismiss} onSubscribe={onSubscribe} />,
    );
    // RN test renderer for Modal hides children when visible=false
    expect(queryByText('Keep going together')).toBeNull();
  });

  it('renders key copy when visible', () => {
    const { getByText } = render(
      <ReadOnlyIntroSheet visible={true} onDismiss={onDismiss} onSubscribe={onSubscribe} />,
    );
    expect(getByText('Keep going together')).toBeTruthy();
    expect(getByText('Maybe later')).toBeTruthy();
    expect(getByText(/Your Gremly is fed/)).toBeTruthy();
  });

  it('calls onSubscribe when primary button pressed', () => {
    const { getByText } = render(
      <ReadOnlyIntroSheet visible={true} onDismiss={onDismiss} onSubscribe={onSubscribe} />,
    );
    fireEvent.press(getByText('Keep going together'));
    expect(onSubscribe).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when "Maybe later" pressed', () => {
    const { getByText } = render(
      <ReadOnlyIntroSheet visible={true} onDismiss={onDismiss} onSubscribe={onSubscribe} />,
    );
    fireEvent.press(getByText('Maybe later'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
