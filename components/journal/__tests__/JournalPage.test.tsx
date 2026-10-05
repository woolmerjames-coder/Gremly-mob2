/**
 * The journal page (components/journal/JournalPage): writing on cards,
 * choosing a page without losing words, prompts of your own, moods, Done and
 * close, and a saved entry shown to read.
 */
import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { JournalPage, type JournalPageProps, type JournalPageResult } from '../JournalPage';
import { card, newPage, setCardHtml, type JournalPage as Page } from '../../../lib/journal/page';
import {
  BUILT_IN_PAGES,
  FREEFORM,
  allPages,
  pageById,
  type JournalPageDef,
} from '../../../lib/journal/pages';

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
  const page = (more: Partial<JournalPageProps> = {}) => (
    <JournalPage
      day={DAY}
      kicker="Journal · evening"
      initial={newPage(pageById(FREEFORM))}
      pages={BUILT_IN_PAGES}
      onDone={onDone}
      onClose={onClose}
      onPickPage={onPickPage}
      {...props}
      {...more}
    />
  );
  const utils = render(page());
  /** The app handing the page a new list of pages to choose from */
  const givePages = (pages: JournalPageDef[]) => utils.rerender(page({ pages }));
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
  return { ...utils, onDone, onClose, onPickPage, type, press, prompts, givePages };
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

describe('pages of your own', () => {
  const sunday: JournalPageDef = {
    id: 'p1',
    name: 'Sunday reset',
    about: '',
    prompts: ['What went well?', 'What next?'],
    icon: 'own',
    own: true,
  };
  /** Keeps a page as the app would, handing back the page it kept */
  const keeper = (page: JournalPageDef = sunday) =>
    jest.fn(async () => ({ ok: true, page }) as const);

  it('are not offered where the app cannot keep them', () => {
    const { queryByTestId } = open();
    expect(queryByTestId('journal-page-make-own')).toBeNull();
    expect(queryByTestId('journal-keep-page')).toBeNull();
  });

  it('sit with the built in pages, and one can be chosen like any other', async () => {
    const { press, onPickPage, getByText, getByTestId } = open({
      pages: allPages([sunday]),
      onSaveOwn: keeper(),
    });
    await press('journal-page-p1');
    expect(getByText('What went well?')).toBeTruthy();
    expect(getByText('What next?')).toBeTruthy();
    expect(onPickPage).toHaveBeenCalledWith('p1');
    expect(getByText('Your page.')).toBeTruthy();
    expect(getByTestId('journal-own-edit')).toBeTruthy();
  });

  it('can be made from the chip: the page is kept, then put on what is being written', async () => {
    const onSaveOwn = keeper();
    const { press, type, getByTestId, getByText, queryByTestId, onPickPage, onDone } = open({
      onSaveOwn,
    });
    type(0, 'Tired but pleased.');
    await press('journal-page-make-own');
    fireEvent.changeText(getByTestId('journal-own-name'), 'Sunday reset');
    fireEvent.changeText(getByTestId('journal-own-question-0'), 'What went well?');
    fireEvent.changeText(getByTestId('journal-own-question-1'), 'What next?');
    await press('journal-own-save');
    expect(onSaveOwn).toHaveBeenCalledWith({
      id: null,
      name: 'Sunday reset',
      prompts: ['What went well?', 'What next?', ''],
    });
    expect(queryByTestId('journal-own-sheet')).toBeNull();
    expect(onPickPage).toHaveBeenCalledWith('p1');
    expect(getByText('Saved. It opens by itself next time.')).toBeTruthy();
    // what was written stays on top, and the new questions follow it
    expect(getByText('What next?')).toBeTruthy();
    type(1, 'The walk.');
    await press('journal-done');
    expect(onDone.mock.calls[0][0].text).toBe('Tired but pleased.\n\nWhat went well?\nThe walk.');
    expect(onDone.mock.calls[0][0].layout.tpl).toBe('p1');
  });

  it('offers Keep as my page once the prompts on the page are a set of their own', async () => {
    const kept = { ...sunday, prompts: ['What went well?'] };
    const onSaveOwn = keeper(kept);
    const { press, type, getByTestId, queryByTestId, onDone, givePages } = open({ onSaveOwn });
    expect(queryByTestId('journal-keep-page')).toBeNull();
    await press('journal-add-prompt');
    // a prompt with no name yet is not a set worth keeping
    expect(queryByTestId('journal-keep-page')).toBeNull();
    fireEvent.changeText(getByTestId('journal-card-0-prompt'), 'What went well? ');
    type(0, 'The walk.');
    await press('journal-keep-page');
    // the sheet starts with the prompt from the page
    expect(getByTestId('journal-own-question-0').props.value).toBe('What went well?');
    await press('journal-own-save');
    givePages(allPages([kept]));
    // the question is the page's now, no longer one to rename, and there is nothing left to keep
    expect(getByTestId('journal-page-p1').props.accessibilityState).toEqual({ selected: true });
    expect(queryByTestId('journal-card-0-prompt')).toBeNull();
    expect(queryByTestId('journal-keep-page')).toBeNull();
    // the answer stays with its question
    await press('journal-done');
    expect(onDone.mock.calls[0][0].text).toBe('What went well?\nThe walk.');
    expect(onDone.mock.calls[0][0].layout.tpl).toBe('p1');
  });

  it('does not offer to keep a set that is already a page', async () => {
    const { press, queryByTestId } = open({ onSaveOwn: keeper() });
    await press('journal-page-rose');
    expect(queryByTestId('journal-keep-page')).toBeNull();
  });

  it('stays on the sheet, with the page untouched, when it could not be kept', async () => {
    const onSaveOwn = jest.fn(async () => ({ ok: false, message: 'Not saved.' }) as const);
    const { press, getByTestId, queryAllByTestId, onPickPage } = open({ onSaveOwn });
    await press('journal-page-make-own');
    fireEvent.changeText(getByTestId('journal-own-question-0'), 'What went well?');
    await press('journal-own-save');
    expect(getByTestId('journal-own-error').props.children).toBe('Not saved.');
    expect(queryAllByTestId(/^journal-card-\d+$/)).toHaveLength(1);
    expect(onPickPage).not.toHaveBeenCalled();
  });

  it('can be changed from Edit, and the page takes the new questions', async () => {
    const changed = { ...sunday, prompts: ['What went well?', 'What do I drop?'] };
    const onSaveOwn = keeper(changed);
    const { press, getByTestId, getByText, queryByText } = open({
      pages: allPages([sunday]),
      initial: newPage(sunday),
      onSaveOwn,
    });
    await press('journal-own-edit');
    expect(getByTestId('journal-own-name').props.value).toBe('Sunday reset');
    fireEvent.changeText(getByTestId('journal-own-question-1'), 'What do I drop?');
    await press('journal-own-save');
    expect(onSaveOwn).toHaveBeenCalledWith({
      id: 'p1',
      name: 'Sunday reset',
      prompts: ['What went well?', 'What do I drop?'],
    });
    expect(getByText('What do I drop?')).toBeTruthy();
    expect(queryByText('What next?')).toBeNull();
  });

  it('keeps an answer with its question when the question is reworded', async () => {
    const changed = { ...sunday, prompts: ['What went right?', 'What next?'] };
    const { press, type, getByTestId, queryByText, onDone } = open({
      pages: allPages([sunday]),
      initial: newPage(sunday),
      onSaveOwn: keeper(changed),
    });
    type(0, 'The walk.');
    await press('journal-own-edit');
    fireEvent.changeText(getByTestId('journal-own-question-0'), 'What went right?');
    await press('journal-own-save');
    // the old wording has gone from the page, and its answer is under the new one
    expect(queryByText('What went well?')).toBeNull();
    await press('journal-done');
    expect(onDone.mock.calls[0][0].text).toBe('What went right?\nThe walk.');
  });

  it('asks before deleting one, and leaves its questions on the page as your own', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onDeleteOwn = jest.fn(async () => ({ ok: true }) as const);
    const { press, getByTestId, queryByTestId, givePages } = open({
      pages: allPages([sunday]),
      initial: newPage(sunday),
      onSaveOwn: keeper(),
      onDeleteOwn,
    });
    await press('journal-own-edit');
    await press('journal-own-delete');
    expect(onDeleteOwn).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] ?? [];
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Delete']);
    await act(async () => {
      buttons[1].onPress?.();
    });
    expect(onDeleteOwn).toHaveBeenCalledWith('p1');
    // the app no longer has the page among those to choose from
    givePages(BUILT_IN_PAGES);
    expect(queryByTestId('journal-own-sheet')).toBeNull();
    expect(getByTestId('journal-page-free').props.accessibilityState).toEqual({ selected: true });
    // its questions are still there, now yours to rename or remove
    expect(getByTestId('journal-card-0-prompt').props.defaultValue).toBe('What went well?');
    alert.mockRestore();
  });

  it('keeps the sheet up and says why when it could not be deleted', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onDeleteOwn = jest.fn(async () => ({ ok: false, message: 'Not deleted.' }) as const);
    const { press, getByTestId, getByText } = open({
      pages: allPages([sunday]),
      initial: newPage(sunday),
      onSaveOwn: keeper(),
      onDeleteOwn,
    });
    await press('journal-own-edit');
    await press('journal-own-delete');
    await act(async () => {
      (alert.mock.calls[0][2] ?? [])[1].onPress?.();
    });
    expect(getByTestId('journal-own-sheet')).toBeTruthy();
    expect(getByText('Not deleted.')).toBeTruthy();
    alert.mockRestore();
  });

  it('closes the sheet first, and the page only after', async () => {
    const { press, queryByTestId, onClose } = open({ onSaveOwn: keeper() });
    await press('journal-page-make-own');
    await press('journal-close');
    expect(queryByTestId('journal-own-sheet')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await press('journal-close');
    expect(onClose).toHaveBeenCalled();
  });
});
