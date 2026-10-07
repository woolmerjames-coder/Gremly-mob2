/**
 * Gremly's speech bubble on Today (components/brief/BriefReadyBubble.tsx).
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { BriefReadyBubble } from '../BriefReadyBubble';

describe('BriefReadyBubble', () => {
  it('says its line as one piece of text, and opens the thread when tapped', () => {
    const onPress = jest.fn();
    const r = render(
      <BriefReadyBubble lead="Ready to wrap up?" rest="Tap here" onPress={onPress} />,
    );
    expect(r.getByText('Ready to wrap up? Tap here')).toBeTruthy();
    expect(r.queryByTestId('today-brief-ready-dismiss')).toBeNull();
    fireEvent.press(r.getByTestId('today-brief-ready'));
    expect(onPress).toHaveBeenCalled();
  });

  it('can be put away with its X when it offers that', () => {
    const onPress = jest.fn();
    const onDismiss = jest.fn();
    const r = render(
      <BriefReadyBubble
        lead="Ready to wrap up?"
        rest="Tap here"
        onPress={onPress}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(r.getByTestId('today-brief-ready-dismiss'));
    expect(onDismiss).toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });
});
