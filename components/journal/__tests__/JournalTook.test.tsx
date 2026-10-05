/**
 * What Gremly took, on screen (components/journal/JournalTook): the line, the
 * list, and the sheet the saved card opens.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { JournalTookLine, JournalTookList, JournalTookSheet } from '../JournalTook';
import type { EntryFact } from '../../../lib/journal/took';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

const fact = (id: string, extra: Partial<EntryFact> = {}): EntryFact => ({
  id,
  statement: `Fact ${id}`,
  quote: null,
  private: false,
  standing: 'held',
  ...extra,
});

describe('the line', () => {
  it('says how many, and opens the list', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(<JournalTookLine count={2} onPress={onPress} />);
    expect(getByText('Gremly took two things from this')).toBeTruthy();
    fireEvent.press(getByTestId('journal-took-line'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('the list', () => {
  it('shows each thing with the words it came from', () => {
    const { getByText } = render(
      <JournalTookList facts={[fact('a', { quote: 'Eleven miles today' }), fact('b')]} />,
    );
    expect(getByText('Fact a')).toBeTruthy();
    expect(getByText('From: “Eleven miles today”')).toBeTruthy();
    expect(getByText('Fact b')).toBeTruthy();
  });

  it('says when he is unsure of one, has updated one since, or keeps one to himself', () => {
    const { getByText, queryByText, getByTestId } = render(
      <JournalTookList
        facts={[
          fact('a', { standing: 'unsure' }),
          fact('b', { standing: 'updated' }),
          fact('c', { private: true }),
        ]}
      />,
    );
    expect(getByText('He is not sure of this yet.')).toBeTruthy();
    expect(getByText('He has updated this since.')).toBeTruthy();
    expect(getByText('Private')).toBeTruthy();
    // one he still holds as written has no note under it
    expect(getByTestId('journal-took-c')).toBeTruthy();
    expect(queryByText(/not sure/)).toBeTruthy();
  });
});

describe('the sheet', () => {
  it('has the list, what it is for, and closes from outside it', () => {
    const onClose = jest.fn();
    const { getByText, getByTestId } = render(
      <JournalTookSheet facts={[fact('a')]} onClose={onClose} />,
    );
    expect(getByText('What Gremly took from this')).toBeTruthy();
    expect(getByText('Fact a')).toBeTruthy();
    expect(
      getByText('He uses these when he talks with you and when he plans your day.'),
    ).toBeTruthy();
    fireEvent.press(getByTestId('journal-took-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
