/**
 * The journal page's host (components/journal/JournalPageHost): what the page
 * opens with, who saves it, and what happens to a page closed before Done.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockDeleteNote = jest.fn();
let mockNotes: Record<string, unknown>[] = [];
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => ({ notes: mockNotes, deleteNote: mockDeleteNote }) },
}));
const mockSavePage = jest.fn();
jest.mock('../../../lib/journal/save', () => ({
  savePage: (...a: unknown[]) => mockSavePage(...a),
}));
jest.mock('../../../lib/wrapup/day', () => ({
  wrapNow: () => ({ day: '2026-09-30', part: 'evening' }),
}));
jest.mock('react-native-enriched-html');

import { JournalPageHost } from '../JournalPageHost';
import { LAYOUT_KEY, newPage, setCardHtml, toLayout } from '../../../lib/journal/page';
import { FREEFORM, pageById } from '../../../lib/journal/pages';
import { draftFor, keepDraft, openJournal, useJournalSession } from '../../../lib/journal/session';

const DAY = '2026-09-30';
const p = (words: string) => `<html><p>${words}</p></html>`;

/** A saved page entry for a day, written on Rose, thorn, bud */
function savedEntry(id: string, day: string, words: string) {
  const rose = newPage(pageById('rose'));
  const layout = toLayout(setCardHtml(rose, rose.cards[1].id, p(words)));
  return {
    id,
    subtype: 'journal',
    created_at: `${day}T20:00:00Z`,
    body: layout.text,
    mood: ['frustrated'],
    views: { sweep_reflection: true, sweep_date: day, [LAYOUT_KEY]: layout },
  };
}

function host() {
  const utils = render(<JournalPageHost />);
  const press = async (testID: string) => {
    await act(async () => {
      fireEvent.press(utils.getByTestId(testID));
    });
  };
  const type = (index: number, words: string) =>
    fireEvent.changeText(utils.getByTestId(`journal-card-${index}-editor`), words);
  const open = (request: Parameters<typeof openJournal>[0]) => act(() => openJournal(request));
  return { ...utils, press, type, open };
}

beforeEach(() => {
  mockNotes = [];
  mockSavePage.mockResolvedValue({ ok: true, noteId: 'n1' });
  mockDeleteNote.mockResolvedValue(undefined);
  useJournalSession.setState({ open: null, drafts: {}, lastPage: FREEFORM });
});

describe('before anything asks for it', () => {
  it('shows nothing', () => {
    expect(host().queryByTestId('journal-page')).toBeNull();
  });
});

describe('a new page for today', () => {
  it('opens on the page used last, named for the part of the day', () => {
    useJournalSession.setState({ lastPage: 'rose' });
    const h = host();
    h.open({ day: DAY });
    expect(h.getByText('Journal · evening')).toBeTruthy();
    expect(h.getByText('Wednesday')).toBeTruthy();
    expect(h.getByText('Rose: the best part of today')).toBeTruthy();
  });

  it('starts with words carried over from the chat box', () => {
    const h = host();
    h.open({ day: DAY, carry: 'Tired but pleased.' });
    expect(h.getByTestId('journal-card-0-editor').props.defaultValue).toBe('Tired but pleased.');
  });

  it('remembers the page chosen, for next time', async () => {
    const h = host();
    h.open({ day: DAY });
    await h.press('journal-page-clear');
    expect(useJournalSession.getState().lastPage).toBe('clear');
  });

  it('saves it as the day’s entry on Done, then closes', async () => {
    const h = host();
    h.open({ day: DAY, part: 'afternoon' });
    h.type(0, 'Tired but pleased.');
    await h.press('journal-done');
    expect(mockSavePage).toHaveBeenCalledWith({
      day: DAY,
      part: 'afternoon',
      entryId: null,
      goal: null,
      written: expect.objectContaining({ text: 'Tired but pleased.', moods: [] }),
    });
    expect(h.queryByTestId('journal-page')).toBeNull();
  });

  it('stays open with its words when the save fails', async () => {
    mockSavePage.mockResolvedValue({ ok: false, message: 'offline' });
    const h = host();
    h.open({ day: DAY });
    h.type(0, 'Tired.');
    await h.press('journal-done');
    expect(h.getByTestId('journal-page')).toBeTruthy();
    expect(h.getByText('offline')).toBeTruthy();
  });

  it('lets whoever opened it do the saving', async () => {
    const save = jest.fn(async () => ({ ok: true }) as const);
    const h = host();
    h.open({ day: DAY, save });
    h.type(0, 'Tired.');
    await h.press('journal-done');
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ text: 'Tired.' }));
    expect(mockSavePage).not.toHaveBeenCalled();
    expect(h.queryByTestId('journal-page')).toBeNull();
  });
});

describe('a page closed before Done', () => {
  it('is kept for the day and comes back when the page is opened again', async () => {
    const h = host();
    h.open({ day: DAY });
    await h.press('journal-page-rose');
    h.type(1, 'The budget review.');
    await h.press('journal-mood-frustrated');
    await h.press('journal-close');
    expect(h.queryByTestId('journal-page')).toBeNull();
    expect(draftFor(`day:${DAY}`)).toMatchObject({ tpl: 'rose', moods: ['frustrated'] });

    h.open({ day: DAY });
    expect(h.getByTestId('journal-card-1-editor').props.defaultValue).toBe('The budget review.');
    expect(h.getByTestId('journal-mood-frustrated').props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it('is not kept when nothing was written', async () => {
    const h = host();
    h.open({ day: DAY });
    await h.press('journal-close');
    expect(draftFor(`day:${DAY}`)).toBeNull();
  });

  it('is gone once the page is saved', async () => {
    const page = newPage(pageById(FREEFORM));
    keepDraft(`day:${DAY}`, { page: setCardHtml(page, page.cards[0].id, p('Half')), moods: [] });
    const h = host();
    h.open({ day: DAY });
    await h.press('journal-done');
    expect(mockSavePage.mock.calls[0][0].written.text).toBe('Half');
    expect(draftFor(`day:${DAY}`)).toBeNull();
  });

  it('takes more words from the chat box when it is opened again', () => {
    const page = newPage(pageById(FREEFORM));
    keepDraft(`day:${DAY}`, { page: setCardHtml(page, page.cards[0].id, p('First.')), moods: [] });
    const h = host();
    h.open({ day: DAY, carry: 'One more thought.' });
    expect(h.getByTestId('journal-card-0-editor').props.defaultValue).toBe(
      'First.\nOne more thought.',
    );
  });
});

describe('a day whose page is already written', () => {
  it('opens that entry to change, with its cards and moods', async () => {
    mockNotes = [savedEntry('n7', DAY, 'The budget review.')];
    const h = host();
    h.open({ day: DAY });
    expect(h.getByText('Journal · saved')).toBeTruthy();
    expect(h.getByText('Thorn: the hard part')).toBeTruthy();
    expect(h.getByTestId('journal-card-0-editor').props.defaultValue).toBe('The budget review.');
    await h.press('journal-done');
    expect(mockSavePage.mock.calls[0][0]).toMatchObject({ day: DAY, entryId: 'n7' });
  });

  it('keeps unsaved changes with that entry', async () => {
    mockNotes = [savedEntry('n7', DAY, 'The budget review.')];
    const h = host();
    h.open({ day: DAY });
    await h.press('journal-mood-calm');
    await h.press('journal-close');
    expect(draftFor('entry:n7')).toMatchObject({ moods: ['frustrated', 'calm'] });
    expect(draftFor(`day:${DAY}`)).toBeNull();
  });
});

describe('looking back at a saved entry', () => {
  beforeEach(() => {
    mockNotes = [savedEntry('n3', '2026-09-24', 'The budget review.')];
  });

  it('shows it to read, on its own day', () => {
    const h = host();
    h.open({ day: DAY, entryId: 'n3', reading: true });
    expect(h.getByText('Looking back')).toBeTruthy();
    expect(h.getByText('Thursday')).toBeTruthy();
    expect(h.getByText('24 September')).toBeTruthy();
    expect(h.queryByTestId('journal-card-0-editor')).toBeNull();
    expect(h.getByTestId('journal-card-0-text')).toBeTruthy();
  });

  it('opens it to change from Edit', async () => {
    const h = host();
    h.open({ day: DAY, entryId: 'n3', reading: true });
    await h.press('journal-edit');
    expect(h.getByText('Journal · saved')).toBeTruthy();
    expect(h.getByTestId('journal-card-0-editor')).toBeTruthy();
    await h.press('journal-done');
    expect(mockSavePage.mock.calls[0][0]).toMatchObject({ day: '2026-09-24', entryId: 'n3' });
  });

  it('asks before deleting, and then takes it out of the journal', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const h = host();
    h.open({ day: DAY, entryId: 'n3', reading: true });
    await h.press('journal-delete');
    expect(mockDeleteNote).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] ?? [];
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Delete']);
    await act(async () => {
      buttons[1].onPress?.();
    });
    expect(mockDeleteNote).toHaveBeenCalledWith('n3');
    expect(h.queryByTestId('journal-page')).toBeNull();
  });

  it('shows nothing for an entry that has gone', () => {
    const h = host();
    h.open({ day: DAY, entryId: 'gone', reading: true });
    expect(h.queryByTestId('journal-page')).toBeNull();
    expect(useJournalSession.getState().open).toBeNull();
  });
});

describe('a check in on a goal', () => {
  const goal = { goal_id: 'g1', goal_name: 'Run a 10k', space_id: 's1' };

  it('starts a new entry named for the goal, even when the day’s page is written', async () => {
    mockNotes = [savedEntry('n7', DAY, 'The budget review.')];
    const h = host();
    h.open({ day: DAY, goal });
    expect(h.getByText('Check in · Run a 10k')).toBeTruthy();
    expect(h.getByTestId('journal-card-0-editor').props.defaultValue).toBe('');
    h.type(0, 'Eleven miles today.');
    await h.press('journal-done');
    expect(mockSavePage).toHaveBeenCalledWith({
      day: DAY,
      part: 'evening',
      entryId: null,
      goal,
      written: expect.objectContaining({ text: 'Eleven miles today.' }),
    });
    expect(h.queryByTestId('journal-page')).toBeNull();
  });

  it('keeps one closed before Done with the goal, apart from the day’s page', async () => {
    const h = host();
    h.open({ day: DAY, goal });
    h.type(0, 'Eleven miles today.');
    await h.press('journal-close');
    expect(draftFor('goal:g1')).not.toBeNull();
    expect(draftFor(`day:${DAY}`)).toBeNull();

    h.open({ day: DAY });
    expect(h.getByTestId('journal-card-0-editor').props.defaultValue).toBe('');
    await h.press('journal-close');
    h.open({ day: DAY, goal });
    expect(h.getByTestId('journal-card-0-editor').props.defaultValue).toBe('Eleven miles today.');
  });

  it('shows a saved one under its goal, to read and to change', async () => {
    mockNotes = [
      {
        id: 'c1',
        subtype: 'journal',
        created_at: '2026-09-24T18:00:00Z',
        body: 'Eleven miles today.',
        views: { goal_checkin: { goal_id: 'g1', goal_name: 'Run a 10k' } },
      },
    ];
    const h = host();
    h.open({ day: DAY, entryId: 'c1', reading: true });
    expect(h.getByText('Check in · Run a 10k')).toBeTruthy();
    expect(h.getByText('Thursday')).toBeTruthy();
    await h.press('journal-edit');
    expect(h.getByText('Check in · Run a 10k')).toBeTruthy();
    await h.press('journal-done');
    // changed in place: it is already with its goal
    expect(mockSavePage.mock.calls[0][0]).toMatchObject({ entryId: 'c1', goal: null });
  });
});
