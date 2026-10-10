/**
 * AskStrip: the one way a drop card asks (Mind Drop rethink stage 6). The
 * question with Gremly's face, the answers as buttons at least 38 high, a
 * chosen answer that fills moss while the others fade and runs after .26s,
 * Something else with a one line field and Go, and a foot with the hint and
 * Not now. With reduced motion on, it opens and closes at once.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    { get: (_t, name) => () => React.createElement(View, { testID: `icon-${String(name)}` }) },
  );
});
const mockReduced = { value: true };
jest.mock('../../../design/animations', () => ({
  useReducedMotion: () => mockReduced.value,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

import { AskStrip, ASK_CHOSEN_MS, type AskButton } from '../AskStrip';

const buttons = (a = jest.fn(), b = jest.fn()): AskButton[] => [
  { key: 'booked', label: 'It’s booked', testID: 'ask-booked', onPress: a },
  { key: 'book', label: 'I need to book it', testID: 'ask-book', onPress: b },
];

beforeEach(() => {
  mockReduced.value = true;
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('AskStrip', () => {
  it('shows the question, the answers, the hint and Not now', () => {
    const r = render(
      <AskStrip
        open
        question="Is the dentist already booked?"
        buttons={buttons()}
        hint="Keep as one is the safe choice"
        onNotNow={jest.fn()}
        testID="ask"
      />,
    );
    expect(r.getByText('Is the dentist already booked?')).toBeTruthy();
    expect(r.getByText('It’s booked')).toBeTruthy();
    expect(r.getByText('I need to book it')).toBeTruthy();
    expect(r.getByText('Keep as one is the safe choice')).toBeTruthy();
    expect(r.getByTestId('ask-not-now')).toBeTruthy();
  });

  it('announces a new question to VoiceOver as it opens, and an answer that did not go through (final check item 22)', () => {
    const { AccessibilityInfo } = require('react-native');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const r = render(
      <AskStrip open question="Is the dentist already booked?" buttons={buttons()} testID="ask" />,
    );
    expect(announce).toHaveBeenCalledWith('Is the dentist already booked?');
    r.rerender(
      <AskStrip
        open
        question="Is the dentist already booked?"
        buttons={buttons()}
        error="That did not go through. Try again in a moment."
        testID="ask"
      />,
    );
    expect(announce).toHaveBeenLastCalledWith('That did not go through. Try again in a moment.');
    announce.mockRestore();
  });

  it('gives every answer at least 38 points, and Not now at least 32', () => {
    const r = render(
      <AskStrip open question="Q?" buttons={buttons()} onNotNow={jest.fn()} testID="ask" />,
    );
    expect(r.getByTestId('ask-booked')).toHaveStyle({ minHeight: 38, borderRadius: 12 });
    expect(r.getByTestId('ask-not-now')).toHaveStyle({ minHeight: 32 });
  });

  it('on a tap: the chosen answer fills moss, the others fade, and it runs after .26s', () => {
    const a = jest.fn();
    const b = jest.fn();
    const r = render(<AskStrip open question="Q?" buttons={buttons(a, b)} testID="ask" />);
    fireEvent.press(r.getByTestId('ask-booked'));
    expect(r.getByTestId('ask-booked')).toHaveStyle({ backgroundColor: '#2E5540' });
    expect(r.getByTestId('ask-book')).toHaveStyle({ opacity: 0.25 });
    expect(a).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(ASK_CHOSEN_MS);
    });
    expect(a).toHaveBeenCalledTimes(1);
    // a second tap does nothing
    fireEvent.press(r.getByTestId('ask-book'));
    act(() => {
      jest.advanceTimersByTime(ASK_CHOSEN_MS);
    });
    expect(b).not.toHaveBeenCalled();
  });

  it('Something else opens a one line field, and Go sends what they typed', () => {
    const said = jest.fn();
    const r = render(
      <AskStrip open question="Q?" buttons={buttons()} onFreeText={said} testID="ask" />,
    );
    expect(r.queryByTestId('ask-field')).toBeNull();
    fireEvent.press(r.getByTestId('ask-something-else'));
    expect(r.queryByTestId('ask-something-else')).toBeNull();
    const go = r.getByTestId('ask-go');
    expect(go.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.changeText(r.getByTestId('ask-field'), '  a gift for Jo  ');
    fireEvent.press(r.getByTestId('ask-go'));
    act(() => {
      jest.advanceTimersByTime(ASK_CHOSEN_MS);
    });
    expect(said).toHaveBeenCalledWith('a gift for Jo');
  });

  it('Not now runs at once', () => {
    const later = jest.fn();
    const r = render(
      <AskStrip open question="Q?" buttons={buttons()} onNotNow={later} testID="ask" />,
    );
    fireEvent.press(r.getByTestId('ask-not-now'));
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('says when an answer did not go through, in place of the hint, and lets them choose again', () => {
    const a = jest.fn();
    const r = render(<AskStrip open question="Q?" buttons={buttons(a)} hint="Hint" testID="ask" />);
    fireEvent.press(r.getByTestId('ask-booked'));
    r.rerender(
      <AskStrip
        open
        question="Q?"
        buttons={buttons(a)}
        hint="Hint"
        error="That did not go through."
        testID="ask"
      />,
    );
    expect(r.getByText('That did not go through.')).toBeTruthy();
    expect(r.queryByText('Hint')).toBeNull();
    expect(r.getByTestId('ask-booked')).not.toHaveStyle({ backgroundColor: '#2E5540' });
  });

  it('with reduced motion on, shows at once and goes at once', () => {
    const r = render(<AskStrip open question="Q?" buttons={buttons()} testID="ask" />);
    expect(r.getByTestId('ask')).toBeTruthy();
    r.rerender(<AskStrip open={false} question="Q?" buttons={buttons()} testID="ask" />);
    expect(r.queryByTestId('ask')).toBeNull();
  });

  it('with motion on, lays the strip out to be revealed', () => {
    mockReduced.value = false;
    const r = render(<AskStrip open question="Q?" buttons={buttons()} testID="ask" />);
    expect(r.getByText('Q?')).toBeTruthy();
    expect(r.getByText('It’s booked')).toBeTruthy();
  });
});
