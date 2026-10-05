/**
 * The journal page's session (lib/journal/session) and its own saving
 * (lib/journal/save): opening it, drafts, the page used last.
 */
const mockSaveJournal = jest.fn();
const mockUpdateJournal = jest.fn();
jest.mock('../../wrapup/journal', () => ({
  saveJournal: (...a: unknown[]) => mockSaveJournal(...a),
  updateJournal: (...a: unknown[]) => mockUpdateJournal(...a),
}));

import { htmlToText } from '../html';
import { newPage, setCardHtml, toLayout } from '../page';
import { FREEFORM, pageById } from '../pages';
import { savePage } from '../save';
import {
  closeJournal,
  draftFor,
  draftKey,
  dropDraft,
  keepDraft,
  keepFor,
  openJournal,
  pageOfDraft,
  setLastPage,
  useJournalSession,
} from '../session';

const DAY = '2026-09-30';
const p = (words: string) => `<html><p>${words}</p></html>`;

beforeEach(() => {
  useJournalSession.setState({ open: null, drafts: {}, lastPage: FREEFORM });
});

describe('opening the page', () => {
  it('shows what was asked for, afresh each time', () => {
    openJournal({ day: DAY, part: 'evening' });
    const first = useJournalSession.getState().open;
    expect(first).toMatchObject({ day: DAY, part: 'evening' });
    openJournal({ day: DAY, entryId: 'n1', reading: true });
    const second = useJournalSession.getState().open;
    expect(second).toMatchObject({ entryId: 'n1', reading: true });
    expect(second?.turn).not.toBe(first?.turn);
  });

  it('closes', () => {
    openJournal({ day: DAY });
    closeJournal();
    expect(useJournalSession.getState().open).toBeNull();
  });

  it('remembers the page used last', () => {
    setLastPage('rose');
    expect(useJournalSession.getState().lastPage).toBe('rose');
  });
});

describe('a page closed before Done', () => {
  const written = () => {
    const page = newPage(pageById('rose'));
    return setCardHtml(page, page.cards[1].id, p('The budget review.'));
  };

  it('is kept for its day, and for a saved entry with that entry', () => {
    expect(draftKey({ day: DAY })).toBe(`day:${DAY}`);
    expect(draftKey({ day: DAY, entryId: 'n1' })).toBe('entry:n1');
    expect(draftKey({ day: DAY, entryId: null })).toBe(`day:${DAY}`);
  });

  it('is kept with the goal for a new check in, and with the entry once that is saved', () => {
    expect(draftKey({ day: DAY, goalId: 'g1' })).toBe('goal:g1');
    expect(draftKey({ day: DAY, entryId: 'n1', goalId: 'g1' })).toBe('entry:n1');
  });

  it('comes back with its cards, its page and its moods', () => {
    keepDraft(draftKey({ day: DAY }), { page: written(), moods: ['frustrated'] });
    const draft = draftFor(`day:${DAY}`);
    expect(draft).toMatchObject({ tpl: 'rose', moods: ['frustrated'] });
    const page = pageOfDraft(draft!);
    expect(page.tpl).toBe('rose');
    expect(page.cards.map((c) => `${c.q} | ${htmlToText(c.html)}`)).toEqual([
      'Rose: the best part of today | ',
      'Thorn: the hard part | The budget review.',
      'Bud: something with promise | ',
      'null | ',
    ]);
  });

  it('keeps what was done to the photos, and nothing when they were not touched', () => {
    const key = draftKey({ day: DAY });
    keepDraft(key, {
      page: written(),
      moods: [],
      photos: { added: ['file:///one.jpg'], removed: ['a'] },
    });
    expect(draftFor(key)?.photos).toEqual({ added: ['file:///one.jpg'], removed: ['a'] });
    keepDraft(key, { page: written(), moods: [], photos: { added: [], removed: [] } });
    expect(draftFor(key)?.photos).toBeUndefined();
  });

  it('keeps one draft per day, the latest', () => {
    const key = draftKey({ day: DAY });
    keepDraft(key, { page: written(), moods: [] });
    keepDraft(key, { page: newPage(pageById(FREEFORM)), moods: ['calm'] });
    expect(draftFor(key)).toMatchObject({ tpl: FREEFORM, moods: ['calm'] });
    expect(Object.keys(useJournalSession.getState().drafts)).toHaveLength(1);
  });

  it('is dropped once saved, and dropping one that is not there changes nothing', () => {
    const key = draftKey({ day: DAY });
    keepDraft(key, { page: written(), moods: [] });
    dropDraft(key);
    expect(draftFor(key)).toBeNull();
    const before = useJournalSession.getState();
    dropDraft('day:2020-01-01');
    expect(useJournalSession.getState()).toBe(before);
  });

  it('always comes back with free writing at the end', () => {
    const key = draftKey({ day: DAY });
    useJournalSession.setState({
      drafts: {
        [key]: {
          tpl: 'rose',
          cards: [{ q: 'Thorn: the hard part', html: p('x') }],
          moods: [],
          at: '',
        },
      },
    });
    const page = pageOfDraft(draftFor(key)!);
    expect(page.cards[page.cards.length - 1].q).toBeNull();
  });
});

describe('the page saving an entry itself', () => {
  const written = () => {
    const page = newPage(pageById(FREEFORM));
    const filled = setCardHtml(page, page.cards[0].id, p('Tired.'));
    return { text: 'Tired.', layout: toLayout(filled), moods: ['tired' as const] };
  };

  it('makes a new page the day’s entry, named for the day and the part of it', async () => {
    mockSaveJournal.mockResolvedValue({ ok: true, noteId: 'n1' });
    const w = written();
    expect(await savePage({ day: DAY, part: 'afternoon', written: w })).toEqual({
      ok: true,
      noteId: 'n1',
    });
    expect(mockSaveJournal).toHaveBeenCalledWith({
      text: 'Tired.',
      moods: ['tired'],
      day: DAY,
      weekday: 'Wednesday',
      part: 'afternoon',
      page: w.layout,
    });
    expect(mockUpdateJournal).not.toHaveBeenCalled();
  });

  it('changes a saved entry in place', async () => {
    mockUpdateJournal.mockResolvedValue({ ok: true });
    const w = written();
    expect(await savePage({ day: DAY, entryId: 'n7', written: w })).toEqual({
      ok: true,
      noteId: 'n7',
    });
    expect(mockUpdateJournal).toHaveBeenCalledWith({
      noteId: 'n7',
      text: 'Tired.',
      moods: ['tired'],
      page: w.layout,
    });
    expect(mockSaveJournal).not.toHaveBeenCalled();
  });

  it('passes on why it was not saved', async () => {
    mockSaveJournal.mockResolvedValue({ ok: false, message: 'offline' });
    expect(await savePage({ day: DAY, written: written() })).toEqual({
      ok: false,
      message: 'offline',
    });
  });
});

describe('whose drafts they are', () => {
  const key = draftKey({ day: DAY });
  const keep = () => keepDraft(key, { page: newPage(pageById('rose')), moods: [] });

  it('keeps them for the same person', () => {
    useJournalSession.setState({ owner: 'u1', drafts: {}, lastPage: 'rose' });
    keep();
    keepFor('u1');
    expect(draftFor(key)).not.toBeNull();
    expect(useJournalSession.getState().lastPage).toBe('rose');
  });

  it('starts empty for someone else on the same phone', () => {
    useJournalSession.setState({ owner: 'u1', drafts: {}, lastPage: 'rose' });
    keep();
    keepFor('u2');
    expect(draftFor(key)).toBeNull();
    expect(useJournalSession.getState()).toMatchObject({ owner: 'u2', lastPage: FREEFORM });
  });

  it('takes what was kept before anyone was known as this person’s', () => {
    useJournalSession.setState({ owner: null, drafts: {}, lastPage: 'rose' });
    keep();
    keepFor('u1');
    expect(draftFor(key)).not.toBeNull();
    expect(useJournalSession.getState()).toMatchObject({ owner: 'u1', lastPage: 'rose' });
  });
});
