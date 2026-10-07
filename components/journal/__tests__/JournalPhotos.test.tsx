/**
 * The photos on a journal entry (components/journal/JournalPhotos): the
 * tiles, taking one off, adding another, and looking at one large.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { JournalPhotoViewer, JournalPhotos } from '../JournalPhotos';
import type { PagePhoto } from '../../../lib/journal/photos';

const photo = (n: number, saved = false): PagePhoto => ({
  key: `file:///photo-${n}.jpg`,
  url: `file:///photo-${n}.jpg`,
  saved,
});
const FOUR = [photo(1), photo(2), photo(3), photo(4)];

describe('the tiles', () => {
  it('are not there when the entry has no photos', () => {
    const { queryByTestId } = render(<JournalPhotos photos={[]} onOpen={jest.fn()} />);
    expect(queryByTestId('journal-photos')).toBeNull();
  });

  it('show each photo, to look at large', () => {
    const onOpen = jest.fn();
    const { getByTestId, queryAllByTestId, getByText } = render(
      <JournalPhotos photos={FOUR} onOpen={onOpen} />,
    );
    expect(getByText('Photos')).toBeTruthy();
    expect(queryAllByTestId(/^journal-photo-\d+$/)).toHaveLength(4);
    expect(getByTestId('journal-photo-2').props.accessibilityLabel).toBe(
      'Look at this photo, 3 of 4',
    );
    fireEvent.press(getByTestId('journal-photo-2'));
    expect(onOpen).toHaveBeenCalledWith(2);
  });

  it('can be taken off and added to while writing', () => {
    const onRemove = jest.fn();
    const onAdd = jest.fn();
    const { getByTestId } = render(
      <JournalPhotos photos={FOUR} onOpen={jest.fn()} onRemove={onRemove} onAdd={onAdd} />,
    );
    fireEvent.press(getByTestId('journal-photo-1-remove'));
    expect(onRemove).toHaveBeenCalledWith(FOUR[1]);
    fireEvent.press(getByTestId('journal-photo-add'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('are only shown while looking back', () => {
    const { queryByTestId } = render(<JournalPhotos photos={FOUR} onOpen={jest.fn()} />);
    expect(queryByTestId('journal-photo-0-remove')).toBeNull();
    expect(queryByTestId('journal-photo-add')).toBeNull();
  });
});

describe('one photo, large', () => {
  it('closes on a tap', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <JournalPhotoViewer photos={FOUR} index={1} onStep={jest.fn()} onClose={onClose} />,
    );
    fireEvent.press(getByTestId('journal-photo-viewer-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('steps to the photo before and after, and stops at each end', () => {
    const onStep = jest.fn();
    const { getByTestId, getByText, rerender } = render(
      <JournalPhotoViewer photos={FOUR} index={0} onStep={onStep} onClose={jest.fn()} />,
    );
    expect(getByText(/1 of 4/)).toBeTruthy();
    expect(getByTestId('journal-photo-viewer-before').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    fireEvent.press(getByTestId('journal-photo-viewer-after'));
    expect(onStep).toHaveBeenCalledWith(1);
    rerender(<JournalPhotoViewer photos={FOUR} index={3} onStep={onStep} onClose={jest.fn()} />);
    expect(getByTestId('journal-photo-viewer-after').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('has no stepping for a single photo, and shows nothing for one that is not there', () => {
    const one = render(
      <JournalPhotoViewer photos={[photo(1)]} index={0} onStep={jest.fn()} onClose={jest.fn()} />,
    );
    expect(one.queryByTestId('journal-photo-viewer-after')).toBeNull();
    const none = render(
      <JournalPhotoViewer photos={[]} index={0} onStep={jest.fn()} onClose={jest.fn()} />,
    );
    expect(none.queryByTestId('journal-photo-viewer')).toBeNull();
  });
});
