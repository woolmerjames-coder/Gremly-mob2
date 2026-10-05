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
// the person's own pages: the copy on the phone is real, the account is stood in for
const mockSaveOwnPage = jest.fn();
const mockDeleteOwnPage = jest.fn();
jest.mock('../../../lib/journal/ownPages', () => ({
  ...jest.requireActual('../../../lib/journal/ownPages'),
  useOwnPagesSync: () => undefined,
  saveOwnPage: (...a: unknown[]) => mockSaveOwnPage(...a),
  deleteOwnPage: (...a: unknown[]) => mockDeleteOwnPage(...a),
}));
// photos: the page's own handling is real, the library and the account are stood in for
let mockSavedPhotos: { id: string; url: string; position: number }[] = [];
const mockChoosePhotos = jest.fn();
const mockSaveEntryPhotos = jest.fn();
const mockRemovePhotoFiles = jest.fn();
jest.mock('../../../lib/journal/photos', () => ({
  ...jest.requireActual('../../../lib/journal/photos'),
  useEntryPhotos: (noteId: string | null | undefined) => (noteId ? mockSavedPhotos : []),
  choosePhotos: (...a: unknown[]) => mockChoosePhotos(...a),
  saveEntryPhotos: (...a: unknown[]) => mockSaveEntryPhotos(...a),
  removePhotoFiles: (...a: unknown[]) => mockRemovePhotoFiles(...a),
}));
// what Gremly kept from an entry, as his reader wrote it down
let mockTook: Record<string, unknown>[] = [];
const mockTookAsked: (string | null | undefined)[] = [];
jest.mock('../../../lib/journal/took', () => ({
  ...jest.requireActual('../../../lib/journal/took'),
  useEntryFacts: (noteId: string | null | undefined) => {
    mockTookAsked.push(noteId);
    return noteId ? mockTook : [];
  },
}));
// whether they can still make new things: a tester, a subscriber, or inside the trial
let mockAccess = true;
jest.mock('../../../lib/subscriptions/useSubscriptionStatus', () => ({
  useSubscriptionStatus: () => ({ hasAccess: mockAccess, isLoading: false }),
}));
jest.mock('react-native-enriched-html');

import { JournalPageHost } from '../JournalPageHost';
import { getDateService } from '../../../lib/date/DateService';
import { eventBus } from '../../../lib/events/EventBus';
import { LAYOUT_KEY, newPage, setCardHtml, toLayout } from '../../../lib/journal/page';
import { useOwnPagesStore } from '../../../lib/journal/ownPages';
import { FREEFORM, pageById, type JournalPageDef } from '../../../lib/journal/pages';
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
  mockAccess = true;
  mockTook = [];
  mockTookAsked.length = 0;
  mockSavedPhotos = [];
  mockChoosePhotos.mockResolvedValue({ ok: true, uris: [] });
  mockSaveEntryPhotos.mockResolvedValue({ failed: 0 });
  mockRemovePhotoFiles.mockResolvedValue(undefined);
  mockSavePage.mockResolvedValue({ ok: true, noteId: 'n1' });
  mockDeleteNote.mockResolvedValue(undefined);
  useJournalSession.setState({ open: null, drafts: {}, lastPage: FREEFORM });
  useOwnPagesStore.setState({ owner: 'u1', pages: [] });
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

  it('keeps words carried in from the chat box, even when the page was not touched', async () => {
    const h = host();
    h.open({ day: DAY, carry: 'Tired but pleased.' });
    await h.press('journal-close');
    expect(draftFor(`day:${DAY}`)).not.toBeNull();
    h.open({ day: DAY });
    expect(h.getByTestId('journal-card-0-editor').props.defaultValue).toBe('Tired but pleased.');
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

describe('pages of the person’s own', () => {
  const sunday: JournalPageDef = {
    id: 'p1',
    name: 'Sunday reset',
    about: '',
    prompts: ['What went well?', 'What next?'],
    icon: 'own',
    own: true,
  };

  it('are among the pages to choose from, and a new page opens on the one used last', () => {
    useOwnPagesStore.setState({ pages: [sunday] });
    useJournalSession.setState({ lastPage: 'p1' });
    const h = host();
    h.open({ day: DAY });
    expect(h.getByTestId('journal-page-p1').props.accessibilityState).toEqual({ selected: true });
    expect(h.getByText('What went well?')).toBeTruthy();
    expect(h.getByText('Your page.')).toBeTruthy();
  });

  it('opens on Freeform when the page used last has gone', () => {
    useJournalSession.setState({ lastPage: 'p1' });
    const h = host();
    h.open({ day: DAY });
    expect(h.getByTestId('journal-page-free').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('shows an entry written on one back on that page', () => {
    useOwnPagesStore.setState({ pages: [sunday] });
    const written = newPage(sunday);
    const layout = toLayout(setCardHtml(written, written.cards[0].id, p('The walk.')));
    mockNotes = [
      {
        id: 'n7',
        subtype: 'journal',
        created_at: `${DAY}T20:00:00Z`,
        body: layout.text,
        views: { sweep_reflection: true, sweep_date: DAY, [LAYOUT_KEY]: layout },
      },
    ];
    const h = host();
    h.open({ day: DAY });
    expect(h.getByTestId('journal-page-p1').props.accessibilityState).toEqual({ selected: true });
    // a question that belongs to the page is not one to rename
    expect(h.queryByTestId('journal-card-0-prompt')).toBeNull();
  });

  it('keeps a new one on the account, and makes it the page used last', async () => {
    mockSaveOwnPage.mockImplementation(async () => {
      useOwnPagesStore.setState({ pages: [sunday] });
      return { ok: true, page: sunday };
    });
    const h = host();
    h.open({ day: DAY });
    await h.press('journal-page-make-own');
    fireEvent.changeText(h.getByTestId('journal-own-name'), 'Sunday reset');
    fireEvent.changeText(h.getByTestId('journal-own-question-0'), 'What went well?');
    fireEvent.changeText(h.getByTestId('journal-own-question-1'), 'What next?');
    await h.press('journal-own-save');
    expect(mockSaveOwnPage).toHaveBeenCalledWith({
      id: null,
      name: 'Sunday reset',
      prompts: ['What went well?', 'What next?', ''],
    });
    expect(h.getByTestId('journal-page-p1').props.accessibilityState).toEqual({ selected: true });
    expect(useJournalSession.getState().lastPage).toBe('p1');
  });

  it('deletes one from the account, and the next new page no longer opens on it', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useOwnPagesStore.setState({ pages: [sunday] });
    useJournalSession.setState({ lastPage: 'p1' });
    mockDeleteOwnPage.mockImplementation(async () => {
      useOwnPagesStore.setState({ pages: [] });
      return { ok: true };
    });
    const h = host();
    h.open({ day: DAY });
    await h.press('journal-own-edit');
    await h.press('journal-own-delete');
    await act(async () => {
      (alert.mock.calls[0][2] ?? [])[1].onPress?.();
    });
    expect(mockDeleteOwnPage).toHaveBeenCalledWith('p1');
    expect(h.queryByTestId('journal-page-p1')).toBeNull();
    expect(useJournalSession.getState().lastPage).toBe(FREEFORM);
    alert.mockRestore();
  });
});

describe('looking back through the journal from today’s page', () => {
  beforeEach(() => {
    // the page is for the person's day, which here is the day under test
    jest.spyOn(getDateService(), 'ritualDay').mockReturnValue(DAY);
    mockNotes = [
      savedEntry('n22', '2026-09-22', 'The slow start.'),
      savedEntry('n24', '2026-09-24', 'The budget review.'),
    ];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens an older day to read, keeps today’s page, and comes back to it', async () => {
    const save = jest.fn(async () => ({ ok: true }) as const);
    const h = host();
    h.open({ day: DAY, part: 'evening', save });
    h.type(0, 'Tired but pleased.');
    await h.press('journal-date');
    await h.press('journal-cal-day-2026-09-24');
    await h.press('journal-cal-open-n24');

    // the older entry, to read, with today's page kept
    expect(h.getByText('Looking back')).toBeTruthy();
    expect(h.getByText('24 September')).toBeTruthy();
    expect(h.getByTestId('journal-card-0-text')).toBeTruthy();
    expect(draftFor(`day:${DAY}`)).not.toBeNull();

    await h.press('journal-back-to-today');
    expect(h.getByText('Journal · evening')).toBeTruthy();
    expect(h.getByTestId('journal-card-0-editor').props.defaultValue).toBe('Tired but pleased.');
    // it is still the wrap up's page: Done goes to whoever opened it
    await h.press('journal-done');
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ text: 'Tired but pleased.' }));
    expect(mockSavePage).not.toHaveBeenCalled();
  });

  it('does not add the words carried in from the chat box a second time on the way back', async () => {
    const h = host();
    h.open({ day: DAY, carry: 'Tired but pleased.' });
    await h.press('journal-date');
    await h.press('journal-cal-day-2026-09-24');
    await h.press('journal-cal-open-n24');
    await h.press('journal-back-to-today');
    expect(h.getByTestId('journal-card-0-editor').props.defaultValue).toBe('Tired but pleased.');
  });

  it('steps from one entry to the next, with today’s page still waiting', async () => {
    const h = host();
    h.open({ day: DAY });
    await h.press('journal-date');
    await h.press('journal-cal-day-2026-09-24');
    await h.press('journal-cal-open-n24');
    expect(h.getByText('Tue 22')).toBeTruthy();
    await h.press('journal-step-before');
    expect(h.getByText('22 September')).toBeTruthy();
    expect(h.getByText('Thu 24')).toBeTruthy();
    expect(h.getByTestId('journal-step-before').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(h.getByTestId('journal-back-to-today')).toBeTruthy();
  });

  it('keeps the way back through Edit on an older entry', async () => {
    const h = host();
    h.open({ day: DAY });
    await h.press('journal-date');
    await h.press('journal-cal-day-2026-09-24');
    await h.press('journal-cal-open-n24');
    await h.press('journal-edit');
    expect(h.getByText('Journal · saved')).toBeTruthy();
    await h.press('journal-date');
    await h.press('journal-cal-day-2026-09-30');
    expect(h.getByText('Back to today')).toBeTruthy();
    await h.press('journal-cal-today-open');
    expect(h.getByText('Journal · evening')).toBeTruthy();
  });
});

describe('an entry opened on its own, as the Hub opens it', () => {
  beforeEach(() => {
    jest.spyOn(getDateService(), 'ritualDay').mockReturnValue(DAY);
    mockNotes = [
      savedEntry('n22', '2026-09-22', 'The slow start.'),
      savedEntry('n24', '2026-09-24', 'The budget review.'),
    ];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('has the entries either side, and no Back to today', () => {
    const h = host();
    h.open({ day: '2026-09-24', entryId: 'n24', reading: true });
    expect(h.getByText('Tue 22')).toBeTruthy();
    expect(h.queryByTestId('journal-back-to-today')).toBeNull();
  });

  it('can start today’s page from the calendar', async () => {
    const h = host();
    h.open({ day: '2026-09-24', entryId: 'n24', reading: true });
    await h.press('journal-date');
    await h.press('journal-cal-day-2026-09-30');
    expect(h.getByText('Nothing written yet today.')).toBeTruthy();
    expect(h.getByText('Write today')).toBeTruthy();
    await h.press('journal-cal-today-open');
    expect(h.getByText('Journal · evening')).toBeTruthy();
    expect(h.getByText('30 September')).toBeTruthy();
  });

  it('says today’s page is saved once it is, and opens it to add more', async () => {
    mockNotes = [...mockNotes, savedEntry('n30', DAY, 'The walk.')];
    const h = host();
    h.open({ day: '2026-09-24', entryId: 'n24', reading: true });
    await h.press('journal-date');
    await h.press('journal-cal-day-2026-09-30');
    expect(h.getByText('Saved today. Open it to add more.')).toBeTruthy();
    await h.press('journal-cal-today-open');
    expect(h.getByText('Journal · saved')).toBeTruthy();
  });
});

describe('a check in on a goal and the calendar', () => {
  it('has no calendar: it is not a day’s page', () => {
    const h = host();
    h.open({ day: DAY, goal: { goal_id: 'g1', goal_name: 'Run a 10k', space_id: 's1' } });
    expect(h.queryByTestId('journal-date')).toBeNull();
  });
});

describe('someone whose trial has ended', () => {
  let asked: jest.Mock;
  let stop: () => void;

  beforeEach(() => {
    mockAccess = false;
    asked = jest.fn();
    stop = eventBus.on('cortex:read_only', asked);
    mockNotes = [savedEntry('n24', '2026-09-24', 'The budget review.')];
  });

  afterEach(() => stop());

  it('is shown the way to subscribe instead of a new page', () => {
    const h = host();
    h.open({ day: DAY });
    expect(h.queryByTestId('journal-page')).toBeNull();
    expect(useJournalSession.getState().open).toBeNull();
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('can still read what they wrote, and change it', async () => {
    const h = host();
    h.open({ day: '2026-09-24', entryId: 'n24', reading: true });
    expect(h.getByTestId('journal-page')).toBeTruthy();
    await h.press('journal-edit');
    expect(h.getByTestId('journal-card-0-editor')).toBeTruthy();
    expect(asked).not.toHaveBeenCalled();
  });

  it('is left to the wrap up when the wrap up opened the page', () => {
    const h = host();
    h.open({ day: DAY, save: jest.fn(async () => ({ ok: true }) as const) });
    expect(h.getByTestId('journal-page')).toBeTruthy();
    expect(asked).not.toHaveBeenCalled();
  });
});

describe('photos', () => {
  const address = (name: string) =>
    `https://x.supabase.co/storage/v1/object/public/log-photos/u1/n7/${name}.jpg`;
  const A = { id: 'a', url: address('a'), position: 0 };
  const settle = () => act(async () => undefined);

  it('are sent once a new entry is saved, to the entry it was saved as', async () => {
    mockChoosePhotos.mockResolvedValue({ ok: true, uris: ['file:///one.jpg'] });
    const h = host();
    h.open({ day: DAY });
    h.type(0, 'Tired but pleased.');
    await h.press('journal-format-photo');
    await h.press('journal-done');
    expect(h.queryByTestId('journal-page')).toBeNull();
    expect(mockSaveEntryPhotos).toHaveBeenCalledWith('n1', [], {
      added: ['file:///one.jpg'],
      removed: [],
    });
  });

  it('are sent to the entry the wrap up saved, when the wrap up does the saving', async () => {
    mockChoosePhotos.mockResolvedValue({ ok: true, uris: ['file:///one.jpg'] });
    const save = jest.fn(async () => ({ ok: true, noteId: 'wrap-1' }) as const);
    const h = host();
    h.open({ day: DAY, save });
    h.type(0, 'Tired.');
    await h.press('journal-format-photo');
    await h.press('journal-done');
    expect(mockSaveEntryPhotos).toHaveBeenCalledWith('wrap-1', [], expect.anything());
  });

  it('are left alone when none were chosen or taken off', async () => {
    const h = host();
    h.open({ day: DAY });
    h.type(0, 'Tired.');
    await h.press('journal-done');
    expect(mockSaveEntryPhotos).not.toHaveBeenCalled();
  });

  it('are not sent when the entry was not saved', async () => {
    mockSavePage.mockResolvedValue({ ok: false, message: 'offline' });
    mockChoosePhotos.mockResolvedValue({ ok: true, uris: ['file:///one.jpg'] });
    const h = host();
    h.open({ day: DAY });
    h.type(0, 'Tired.');
    await h.press('journal-format-photo');
    await h.press('journal-done');
    expect(mockSaveEntryPhotos).not.toHaveBeenCalled();
    // the page is still up, with the photo on it
    expect(h.getByTestId('journal-photo-0')).toBeTruthy();
  });

  it('show on a saved entry, and one taken off is deleted when the change is saved', async () => {
    mockNotes = [savedEntry('n7', DAY, 'The budget review.')];
    mockSavedPhotos = [A];
    // a change to a saved entry is saved as that entry
    mockSavePage.mockResolvedValue({ ok: true, noteId: 'n7' });
    const h = host();
    h.open({ day: DAY });
    expect(h.getByTestId('journal-photo-0')).toBeTruthy();
    await h.press('journal-photo-0-remove');
    await h.press('journal-done');
    expect(mockSaveEntryPhotos).toHaveBeenCalledWith('n7', [A], { added: [], removed: ['a'] });
  });

  it('tell the person when one could not be added, after the page has closed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSaveEntryPhotos.mockResolvedValue({ failed: 1 });
    mockChoosePhotos.mockResolvedValue({ ok: true, uris: ['file:///one.jpg'] });
    const h = host();
    h.open({ day: DAY });
    h.type(0, 'Tired.');
    await h.press('journal-format-photo');
    await h.press('journal-done');
    await settle();
    expect(alert).toHaveBeenCalledWith(
      'Photos not added',
      'One photo could not be added. Your entry is saved. Open it to add the photo again.',
    );
    alert.mockRestore();
  });

  it('are kept with a page closed before Done, and come back with it', async () => {
    mockChoosePhotos.mockResolvedValue({ ok: true, uris: ['file:///one.jpg'] });
    const h = host();
    h.open({ day: DAY });
    await h.press('journal-format-photo');
    await h.press('journal-close');
    expect(draftFor(`day:${DAY}`)?.photos).toEqual({ added: ['file:///one.jpg'], removed: [] });
    h.open({ day: DAY });
    expect(h.getByTestId('journal-photo-0')).toBeTruthy();
  });

  it('start the page when they were chosen in the add sheet, and are kept if it is closed', async () => {
    const h = host();
    h.open({ day: DAY, carryPhotos: ['file:///one.jpg', 'file:///two.jpg'] });
    expect(h.queryAllByTestId(/^journal-photo-\d+$/)).toHaveLength(2);
    await h.press('journal-close');
    expect(draftFor(`day:${DAY}`)?.photos?.added).toHaveLength(2);
  });

  it('are only shown on an entry being read', () => {
    mockNotes = [savedEntry('n7', '2026-09-24', 'The budget review.')];
    mockSavedPhotos = [A];
    const h = host();
    h.open({ day: DAY, entryId: 'n7', reading: true });
    expect(h.getByTestId('journal-photo-0')).toBeTruthy();
    expect(h.queryByTestId('journal-photo-0-remove')).toBeNull();
  });

  it('have their files deleted when the entry is deleted', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockNotes = [savedEntry('n7', '2026-09-24', 'The budget review.')];
    mockSavedPhotos = [A];
    const h = host();
    h.open({ day: DAY, entryId: 'n7', reading: true });
    await h.press('journal-delete');
    await act(async () => {
      (alert.mock.calls[0][2] ?? [])[1].onPress?.();
    });
    await settle();
    expect(mockDeleteNote).toHaveBeenCalledWith('n7');
    expect(mockRemovePhotoFiles).toHaveBeenCalledWith([A]);
    alert.mockRestore();
  });
});

describe('what Gremly took', () => {
  const fact = {
    id: 'f1',
    statement: 'The budget review went badly.',
    quote: null,
    private: false,
    standing: 'held',
  };

  it('is shown under an entry being read', () => {
    mockNotes = [savedEntry('n24', '2026-09-24', 'The budget review.')];
    mockTook = [fact];
    const h = host();
    h.open({ day: DAY, entryId: 'n24', reading: true });
    expect(h.getByText('What Gremly took')).toBeTruthy();
    expect(h.getByText('The budget review went badly.')).toBeTruthy();
  });

  it('is not asked for while an entry is being written or changed', () => {
    mockNotes = [savedEntry('n7', DAY, 'The budget review.')];
    mockTook = [fact];
    const h = host();
    h.open({ day: DAY });
    expect(h.queryByTestId('journal-took')).toBeNull();
    expect(mockTookAsked.every((id) => !id)).toBe(true);
  });
});
