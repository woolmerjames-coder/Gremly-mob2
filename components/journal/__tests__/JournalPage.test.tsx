/**
 * The journal page (components/journal/JournalPage): writing on cards,
 * choosing a page without losing words, prompts of your own, moods, Done and
 * close, and a saved entry shown to read.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { JournalPage, type JournalPageProps, type JournalPageResult } from '../JournalPage';
import { card, newPage, setCardHtml, type JournalPage as Page } from '../../../lib/journal/page';
import { BUILT_IN_PAGES, FREEFORM, pageById } from '../../../lib/journal/pages';

jest.mock('react-native-enriched-html');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

// the stand in editor remembers which formatting buttons were pressed
const { pressedFormats } = jest.requireMock('react-native-enriched-html') as {
  pressedFormats: string[];
};

const DAY = '2026-09-30';
const p = (words: string) => `<html><p>${words}</p></html>`;

function open(props: Partial<JournalPageProps> = {}) {
  const onDone = jest.fn(async (_r: JournalPageResult) => ({ ok: true }) as const);
  const onClose = jest.fn();
  const onPickPage = jest.fn();
  const utils = render(
    <JournalPage
      day={DAY}
      kicker="Journal · evening"
      initial={newPage(pageById(FREEFORM))}
      pages={BUILT_IN_PAGES}
      onDone={onDone}
      onClose={onClose}
      onPickPage={onPickPage}
      {...props}
    />,
  );
  const type = (index: number, words: string) =>
    fireEvent.changeText(utils.getByTestId(`journal-card-${index}-editor`), words);
  const press = async (testID: string) => {
    await act(async () => {
      fireEvent.press(utils.getByTestId(testID));
    });
  };
  const prompts = () =>
    utils
      .queryAllByTestId(/^journal-card-\d+$/)
      .map((c) => c.findAllByType(require('react-native').Text)[0]?.props.children)
      .filter((t) => typeof t === 'string');
  return { ...utils, onDone, onClose, onPickPage, type, press, prompts };
}

beforeEach(() => {
  pressedFormats.length = 0;
});

describe('the page', () => {
  it('opens on the day, with the pages to choose from and one card to write on', () => {
    const { getByText, getByTestId, queryAllByTestId } = open();
    expect(getByText('Journal · evening')).toBeTruthy();
    expect(getByText('Wednesday')).toBeTruthy();
    expect(getByText('30 September')).toBeTruthy();
    expect(getByTestId('journal-page-free').props.accessibilityState).toEqual({ selected: true });
    expect(getByTestId('journal-page-proud')).toBeTruthy();
    expect(queryAllByTestId(/^journal-card-\d+$/)).toHaveLength(1);
    expect(getByTestId('journal-format-count').props.children).toBe('0 words');
  });

  it('shows Done as not ready until something is written', () => {
    const { getByTestId, type } = open();
    const colour = () =>
      StyleSheet.flatten(getByTestId('journal-done').props.style).backgroundColor;
    const quiet = colour();
    type(0, 'Tired but pleased.');
    expect(colour()).not.toBe(quiet);
    expect(getByTestId('journal-format-count').props.children).toBe('3 words');
  });

  it('says so, and saves nothing, when Done is pressed on an empty page', async () => {
    const { press, getByTestId, onDone } = open();
    await press('journal-done');
    expect(getByTestId('journal-note')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('writing and Done', () => {
  it('hands over the plain words, the layout and the moods', async () => {
    const { type, press, onDone } = open();
    type(0, 'Tired but pleased.');
    await press('journal-mood-good');
    await press('journal-done');
    expect(onDone).toHaveBeenCalledTimes(1);
    const result = onDone.mock.calls[0][0];
    expect(result.text).toBe('Tired but pleased.');
    expect(result.moods).toEqual(['good']);
    expect(result.layout).toMatchObject({
      v: 1,
      tpl: FREEFORM,
      cards: [{ q: null, html: p('Tired but pleased.') }],
      text: 'Tired but pleased.',
    });
  });

  it('saves moods alone', async () => {
    const { press, onDone } = open();
    await press('journal-mood-calm');
    await press('journal-mood-tired');
    await press('journal-mood-calm');
    await press('journal-done');
    expect(onDone.mock.calls[0][0]).toMatchObject({ text: '', moods: ['tired'] });
  });

  it('keeps the page open and says why when the save fails', async () => {
    const onDone = jest.fn(async () => ({ ok: false, message: 'offline' }) as const);
    const { type, press, getByText } = open({ onDone });
    type(0, 'Tired.');
    await press('journal-done');
    await waitFor(() => expect(getByText('offline')).toBeTruthy());
  });
});

describe('choosing another page', () => {
  it('puts its prompts on cards and tells the app which page was chosen', async () => {
    const { press, getByText, getByTestId, queryAllByTestId, onPickPage } = open();
    await press('journal-page-proud');
    expect(getByText('What am I proud of today?')).toBeTruthy();
    expect(getByText('What am I grateful for?')).toBeTruthy();
    expect(getByText('Four short answers about today.')).toBeTruthy();
    // four prompts, then free writing
    expect(queryAllByTestId(/^journal-card-\d+$/)).toHaveLength(5);
    expect(getByTestId('journal-page-proud').props.accessibilityState).toEqual({ selected: true });
    expect(onPickPage).toHaveBeenCalledWith('proud');
  });

  it('keeps what was written, on top, and answers stay with their prompts', async () => {
    const { type, press, queryByTestId, getByText, onDone } = open();
    type(0, 'Tired but pleased.');
    await press('journal-page-proud');
    // the first card is still the free writing, and the prompts follow it
    expect(queryByTestId('journal-card-0-remove')).toBeNull();
    expect(getByText('What am I proud of today?')).toBeTruthy();
    type(2, 'Priya covering my call.');
    await press('journal-page-rose');
    await press('journal-done');
    expect(onDone.mock.calls[0][0].text).toBe(
      'Tired but pleased.\n\nWhat am I grateful for?\nPriya covering my call.',
    );
    expect(onDone.mock.calls[0][0].layout.tpl).toBe('rose');
  });

  it('numbers the prompts and ticks one once it is answered', async () => {
    const { type, press, getByTestId } = open();
    await press('journal-page-rose');
    const texts = () => getByTestId('journal-card-1').findAllByType(require('react-native').Text);
    expect(texts()[0].props.children).toBe(2);
    type(1, 'The budget review.');
    // the number gives way to a tick, so the prompt is now the first text
    expect(texts()[0].props.children).toBe('Thorn: the hard part');
  });
});

describe('a prompt of your own', () => {
  it('is added above the free writing, named, answered and saved with its name', async () => {
    const { press, type, getByTestId, onDone } = open();
    await press('journal-add-prompt');
    fireEvent.changeText(getByTestId('journal-card-0-prompt'), 'Who made me laugh?');
    type(0, 'Sam, twice.');
    await press('journal-done');
    expect(onDone.mock.calls[0][0].text).toBe('Who made me laugh?\nSam, twice.');
    expect(onDone.mock.calls[0][0].layout.cards).toEqual([
      { q: 'Who made me laugh?', html: p('Sam, twice.') },
    ]);
  });

  it('can be taken off, and what was written under it stays as free writing', async () => {
    const { press, type, queryAllByTestId, onDone } = open();
    await press('journal-page-rose');
    type(2, 'The spring trip.');
    await press('journal-card-2-remove');
    expect(queryAllByTestId(/^journal-card-\d+$/)).toHaveLength(3);
    await press('journal-done');
    expect(onDone.mock.calls[0][0].text).toBe('The spring trip.');
  });
});

describe('the format bar', () => {
  it('formats the card that was last tapped', async () => {
    const { press, getByTestId } = open();
    await press('journal-page-rose');
    fireEvent(getByTestId('journal-card-1-editor'), 'focus');
    await press('journal-format-bold');
    await press('journal-format-numbers');
    expect(pressedFormats).toEqual(['bold', 'numbers']);
  });

  it('does nothing before a card is tapped', async () => {
    const { press } = open();
    await press('journal-format-italic');
    expect(pressedFormats).toEqual([]);
  });
});

describe('closing without Done', () => {
  it('hands back nothing when the page was not touched', async () => {
    const { press, onClose } = open();
    await press('journal-page-proud');
    await press('journal-close');
    expect(onClose).toHaveBeenCalledWith(null);
  });

  it('hands back what was written, to keep as a draft', async () => {
    const { type, press, onClose } = open();
    type(0, 'Half a thought');
    await press('journal-mood-low');
    await press('journal-close');
    const left = onClose.mock.calls[0][0];
    expect(left.moods).toEqual(['low']);
    expect(left.page.cards[0].html).toBe(p('Half a thought'));
  });

  it('hands back a saved entry only when it was changed', async () => {
    const saved: Page = { tpl: FREEFORM, cards: [card(null, p('Tired.'))] };
    const untouched = open({ initial: saved, initialMoods: ['tired'] });
    await untouched.press('journal-close');
    expect(untouched.onClose).toHaveBeenCalledWith(null);

    const changed = open({ initial: saved, initialMoods: ['tired'] });
    await changed.press('journal-mood-tired');
    await changed.press('journal-close');
    expect(changed.onClose.mock.calls[0][0]).toMatchObject({ moods: [] });
  });
});

describe('a page that starts with words', () => {
  it('shows them, counts them and has Done ready', () => {
    const rose = newPage(pageById('rose'));
    const initial = setCardHtml(rose, rose.cards[0].id, p('The lake at seven.'));
    const { getByTestId } = open({ initial, initialMoods: ['calm'] });
    expect(getByTestId('journal-card-0-editor').props.defaultValue).toBe('The lake at seven.');
    expect(getByTestId('journal-format-count').props.children).toBe('4 words');
    expect(getByTestId('journal-mood-calm').props.accessibilityState).toMatchObject({
      checked: true,
    });
  });
});

describe('looking back at a saved entry', () => {
  const rose = newPage(pageById('rose'));
  const initial = setCardHtml(rose, rose.cards[1].id, p('The budget review.'));

  it('shows only what was written, to read, with its moods', () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const { getByText, queryByTestId, queryAllByTestId, getByTestId } = open({
      initial,
      initialMoods: ['frustrated'],
      reading: true,
      kicker: 'Looking back',
      onEdit,
      onDelete,
    });
    expect(getByText('Looking back')).toBeTruthy();
    expect(queryAllByTestId(/^journal-card-\d+$/)).toHaveLength(1);
    expect(getByText('Thorn: the hard part')).toBeTruthy();
    expect(getByTestId('journal-card-0-text').props.children).toBe(p('The budget review.'));
    // nothing to write with
    expect(queryByTestId('journal-card-0-editor')).toBeNull();
    expect(queryByTestId('journal-pages')).toBeNull();
    expect(queryByTestId('journal-format-bar')).toBeNull();
    expect(queryByTestId('journal-add-prompt')).toBeNull();
    expect(queryByTestId('journal-done')).toBeNull();
    // only the moods it has
    expect(getByTestId('journal-mood-frustrated')).toBeTruthy();
    expect(queryByTestId('journal-mood-calm')).toBeNull();
    fireEvent.press(getByTestId('journal-edit'));
    fireEvent.press(getByTestId('journal-delete'));
    expect(onEdit).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });

  it('closes with nothing to keep', async () => {
    const { press, onClose } = open({ initial, reading: true });
    await press('journal-close');
    expect(onClose).toHaveBeenCalledWith(null);
  });
});
