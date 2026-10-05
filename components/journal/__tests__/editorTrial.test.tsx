/**
 * The editor trial screen (piece 1 of the journal page plan). A short check
 * that it opens and that its buttons do what they say. Goes when the screen goes.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import JournalEditorTrial from '../../../app/(dev)/JournalEditorTrial';

jest.mock('react-native-enriched-html');

// the stand in editor remembers which formatting buttons were pressed
const { pressedFormats } = jest.requireMock('react-native-enriched-html') as {
  pressedFormats: string[];
};
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

beforeEach(() => {
  pressedFormats.length = 0;
});

describe('the editor trial', () => {
  it('shows the cards, the steps and the bar', () => {
    const { getByText, getByTestId } = render(<JournalEditorTrial />);
    expect(getByText('What am I proud of today?')).toBeTruthy();
    expect(getByText('What am I grateful for?')).toBeTruthy();
    expect(getByTestId('journal-format-bar')).toBeTruthy();
    expect(getByTestId('journal-format-count').props.children).toBe('0 words');
  });

  it('counts words across the cards and formats the card last tapped', () => {
    const { getByTestId } = render(<JournalEditorTrial />);
    fireEvent.changeText(getByTestId('journal-trial-editor-proud'), 'The deck is done');
    fireEvent.changeText(getByTestId('journal-trial-editor-free'), 'Tired');
    expect(getByTestId('journal-format-count').props.children).toBe('5 words');
    fireEvent(getByTestId('journal-trial-editor-grateful'), 'focus');
    fireEvent.press(getByTestId('journal-format-bold'));
    expect(pressedFormats).toEqual(['bold']);
  });

  it('shows the plain words that would be saved, prompt first', async () => {
    const { getByTestId } = render(<JournalEditorTrial />);
    fireEvent.changeText(getByTestId('journal-trial-editor-grateful'), 'The run with Sam.');
    fireEvent.changeText(getByTestId('journal-trial-editor-free'), 'Tired.');
    await act(async () => {
      fireEvent.press(getByTestId('journal-trial-show'));
    });
    await waitFor(() => expect(getByTestId('journal-trial-text')).toBeTruthy());
    expect(getByTestId('journal-trial-text').props.children).toBe(
      'What am I grateful for?\nThe run with Sam.\n\nTired.',
    );
  });

  it('fills a long entry to type after', async () => {
    const { getByTestId } = render(<JournalEditorTrial />);
    fireEvent.press(getByTestId('journal-trial-long'));
    await act(async () => {
      fireEvent.press(getByTestId('journal-trial-show'));
    });
    await waitFor(() => expect(getByTestId('journal-trial-text')).toBeTruthy());
    const text = String(getByTestId('journal-trial-text').props.children);
    expect(text).toContain('• Deck sent to Priya');
    expect(text).toContain('1. Start the hard thing before opening email');
  });
});
