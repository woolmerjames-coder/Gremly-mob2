/**
 * Tonight's journal entry (lib/wrapup/journal): saved as the old Sweep saved
 * it, dated by the person's day, with an Undo that takes it back out.
 */
const mockCreateNote = jest.fn();
const mockUpdateNote = jest.fn();
const mockDeleteNote = jest.fn();
let mockNotes: Record<string, unknown>[] = [];

jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => ({
      createNote: mockCreateNote,
      updateNote: mockUpdateNote,
      deleteNote: mockDeleteNote,
      notes: mockNotes,
    }),
  },
}));
jest.mock('../../cortex/getSessionToken', () => ({ getSessionToken: async () => 'token' }));
jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://cortex.test' },
  getEnv: () => undefined,
}));

import {
  journalFor,
  journalTitle,
  knownMoods,
  saveJournal,
  setJournalMoods,
  updateJournal,
} from '../journal';
import { LAYOUT_KEY, type JournalLayout } from '../../journal/page';

const createNote = mockCreateNote;
const updateNote = mockUpdateNote;
const deleteNote = mockDeleteNote;

const DAY = '2026-09-30';
const entry = (text: string, moods: string[] = []) =>
  saveJournal({ text, moods: moods as never, day: DAY, weekday: 'Wednesday' });

beforeEach(() => {
  mockNotes = [];
  createNote.mockImplementation(async (n: Record<string, unknown>) => {
    const made = { id: 'n1', ...n };
    mockNotes.push(made);
    return made;
  });
  updateNote.mockResolvedValue(undefined);
  deleteNote.mockResolvedValue(undefined);
  (global as any).fetch = jest.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    return {
      ok: true,
      json: async () =>
        body.type === 'enrich-phase2'
          ? { tags: ['running'], people: ['Sam Lee'], mood: ['tired', 'good', 'nonsense'] }
          : { smart_title: 'A long day, a good run' },
    };
  });
});

describe('the wrap up journal', () => {
  it("saves a written entry as the old Sweep did, for the person's day", async () => {
    const res = await entry('  Tired but pleased. ');
    expect(res.ok).toBe(true);
    expect(createNote).toHaveBeenCalledWith({
      subtype: 'journal',
      title: 'Wednesday evening',
      body: 'Tired but pleased.',
      mood: null,
      origin: 'manual',
      canonicalType: 'log',
      journal_subtype: 'reflection',
      tags: ['reflection', 'sweep'],
      views: { sweep_origin: true, sweep_reflection: true, sweep_date: DAY, sweep_moods: [] },
    });
  });

  it('reads the entry in the background: a title, tags, people and the moods it knows', async () => {
    const res = await entry('Tired but pleased.');
    if (!res.ok) throw new Error('not saved');
    expect(await res.moods).toEqual(['tired', 'good']);
    expect(updateNote).toHaveBeenCalledWith(
      'n1',
      expect.objectContaining({
        title: 'A long day, a good run',
        tags: ['reflection', 'sweep', 'running', '@sam-lee'],
        mood: ['tired', 'good'],
      }),
    );
  });

  it('takes the moods Gremly read with their day over the words alone', async () => {
    const res = await saveJournal({
      text: 'Tired but pleased.',
      moods: [],
      day: DAY,
      weekday: 'Wednesday',
      dayMoods: Promise.resolve(['grateful', 'nonsense'] as never),
    });
    if (!res.ok) throw new Error('not saved');
    expect(await res.moods).toEqual(['grateful']);
    expect(updateNote).toHaveBeenCalledWith('n1', expect.objectContaining({ mood: ['grateful'] }));
  });

  it('falls back to the words alone when Gremly gave no moods', async () => {
    const res = await saveJournal({
      text: 'Tired but pleased.',
      moods: [],
      day: DAY,
      weekday: 'Wednesday',
      dayMoods: Promise.resolve(null),
    });
    if (!res.ok) throw new Error('not saved');
    expect(await res.moods).toEqual(['tired', 'good']);
  });

  it('keeps the moods they picked over the ones read from their words', async () => {
    const res = await entry('Fine.', ['calm']);
    if (!res.ok) throw new Error('not saved');
    expect(await res.moods).toBeNull();
    expect(updateNote.mock.calls[0][1].mood).toBeUndefined();
  });

  it('saves moods alone with no background read', async () => {
    const res = await entry('', ['good', 'tired']);
    expect(res.ok).toBe(true);
    expect(createNote.mock.calls[0][0]).toMatchObject({
      title: 'Evening reflection',
      body: undefined,
      mood: ['good', 'tired'],
    });
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('saves nothing for an empty entry', async () => {
    expect(await entry('  ')).toEqual({ ok: false, message: 'Nothing to save.' });
    expect(createNote).not.toHaveBeenCalled();
  });

  it('says so when the save fails', async () => {
    createNote.mockRejectedValueOnce(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await entry('Hi')).toEqual({ ok: false, message: 'offline' });
    warn.mockRestore();
  });

  it('takes the entry back out with its Undo', async () => {
    const res = await entry('', ['good']);
    if (!res.ok) throw new Error('not saved');
    await res.revert();
    expect(deleteNote).toHaveBeenCalledWith('n1');
  });

  it('leaves an entry alone once it was taken back out', async () => {
    const res = await entry('Tired.');
    if (!res.ok) throw new Error('not saved');
    mockNotes = [];
    expect(await res.moods).toBeNull();
    expect(updateNote).not.toHaveBeenCalled();
  });

  it('changes the moods on the entry', async () => {
    mockNotes = [{ id: 'n1', views: { sweep_reflection: true, sweep_date: DAY, other: 1 } }];
    await setJournalMoods('n1', DAY, ['calm', 'made-up' as never]);
    expect(updateNote).toHaveBeenCalledWith('n1', {
      mood: ['calm'],
      views: {
        sweep_reflection: true,
        sweep_date: DAY,
        other: 1,
        sweep_origin: true,
        sweep_moods: ['calm'],
      },
    });
  });

  it('finds the entry already written for a day', () => {
    const list = [
      { id: 'a', subtype: 'journal', views: { sweep_reflection: true, sweep_date: '2026-09-29' } },
      {
        id: 'b',
        subtype: 'journal',
        views: { sweep_reflection: true, sweep_date: DAY },
        archived: true,
      },
      { id: 'c', subtype: 'journal', views: { sweep_reflection: true, sweep_date: DAY } },
      { id: 'd', subtype: 'idea', views: {} },
    ];
    expect(journalFor(list, DAY)).toBe('c');
    expect(journalFor(list, '2026-10-01')).toBeNull();
  });

  it('names the entry and keeps only moods the app knows', () => {
    expect(journalTitle('Wednesday', true)).toBe('Wednesday evening');
    expect(journalTitle('Wednesday', false)).toBe('Evening reflection');
    // one written before the evening is named for that part of the day
    expect(journalTitle('Wednesday', true, 'afternoon')).toBe('Wednesday afternoon');
    expect(journalTitle('Wednesday', false, 'morning')).toBe('Morning reflection');
    expect(knownMoods(['Good', 'good', 'sleepy', 'TIRED'])).toEqual(['good', 'tired']);
    expect(knownMoods('calm')).toEqual(['calm']);
    expect(knownMoods(null)).toEqual([]);
  });
});

describe('an entry written on the journal page', () => {
  const layout = (text: string): JournalLayout => ({
    v: 1,
    tpl: 'proud',
    cards: [{ q: 'What am I proud of today?', html: '<html><p>The deck.</p></html>' }],
    text,
  });
  const TEXT = 'What am I proud of today?\nThe deck.';

  it('is the same entry as the wrap up makes, with the page kept beside the words', async () => {
    const res = await saveJournal({
      text: TEXT,
      moods: ['good'],
      day: DAY,
      weekday: 'Wednesday',
      page: layout(TEXT),
    });
    expect(res.ok).toBe(true);
    expect(createNote.mock.calls[0][0]).toMatchObject({
      subtype: 'journal',
      body: TEXT,
      mood: ['good'],
      views: {
        sweep_origin: true,
        sweep_reflection: true,
        sweep_date: DAY,
        sweep_moods: ['good'],
        [LAYOUT_KEY]: layout(TEXT),
      },
    });
    // so the wrap up finds it as the day's entry
    expect(journalFor(mockNotes as never, DAY)).toBe('n1');
  });

  it('keeps its page when the background read adds to it', async () => {
    (global as any).fetch = jest.fn(async (_url: string, init: { body: string }) => ({
      ok: true,
      json: async () =>
        JSON.parse(init.body).type === 'enrich-phase2'
          ? { tags: ['work'], mood: ['good'] }
          : { smart_title: 'The deck, done', confirmation_message: 'Nice one.' },
    }));
    const res = await saveJournal({
      text: TEXT,
      moods: [],
      day: DAY,
      weekday: 'Wednesday',
      page: layout(TEXT),
    });
    if (!res.ok) throw new Error('not saved');
    await res.moods;
    expect(updateNote.mock.calls[0][1].views).toEqual({
      sweep_origin: true,
      sweep_reflection: true,
      sweep_date: DAY,
      sweep_moods: [],
      [LAYOUT_KEY]: layout(TEXT),
      confirmation_message: 'Nice one.',
      ai_mood: ['good'],
    });
  });
});

describe('changing an entry that is already saved', () => {
  const page = (text: string): JournalLayout => ({
    v: 1,
    tpl: 'free',
    cards: [{ q: null, html: `<html><p>${text}</p></html>` }],
    text,
  });
  const saved = (extra: Record<string, unknown> = {}) => ({
    id: 'n1',
    subtype: 'journal',
    title: 'A long day',
    body: 'Tired.',
    tags: ['reflection', 'sweep'],
    views: { sweep_origin: true, sweep_reflection: true, sweep_date: DAY, sweep_moods: [] },
    ...extra,
  });

  it('saves the new words, moods and page onto what the entry holds', async () => {
    mockNotes = [saved()];
    const res = await updateJournal({
      noteId: 'n1',
      text: ' Tired but pleased. ',
      moods: ['good', 'nonsense' as never],
      page: page('Tired but pleased.'),
    });
    expect(res.ok).toBe(true);
    expect(updateNote.mock.calls[0]).toEqual([
      'n1',
      {
        body: 'Tired but pleased.',
        mood: ['good'],
        views: {
          sweep_origin: true,
          sweep_reflection: true,
          sweep_date: DAY,
          sweep_moods: ['good'],
          [LAYOUT_KEY]: page('Tired but pleased.'),
        },
      },
    ]);
  });

  it('reads it again when the words changed, for a title and tags that fit', async () => {
    mockNotes = [saved()];
    const res = await updateJournal({ noteId: 'n1', text: 'Tired but pleased.', moods: [] });
    if (!res.ok) throw new Error('not saved');
    expect(await res.moods).toEqual(['tired', 'good']);
    expect(updateNote).toHaveBeenLastCalledWith(
      'n1',
      expect.objectContaining({
        title: 'A long day, a good run',
        tags: ['reflection', 'sweep', 'running', '@sam-lee'],
        mood: ['tired', 'good'],
      }),
    );
  });

  it('does not read it again when only the moods or the page changed', async () => {
    mockNotes = [saved()];
    const res = await updateJournal({
      noteId: 'n1',
      text: 'Tired.',
      moods: ['calm'],
      page: page('Tired.'),
    });
    if (!res.ok) throw new Error('not saved');
    expect(await res.moods).toBeNull();
    expect(updateNote).toHaveBeenCalledTimes(1);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('takes the page off an entry that is now plain words', async () => {
    mockNotes = [saved({ views: { sweep_reflection: true, [LAYOUT_KEY]: page('Tired.') } })];
    await updateJournal({ noteId: 'n1', text: 'Tired.', moods: [] });
    expect(updateNote.mock.calls[0][1].views).toEqual({ sweep_reflection: true, sweep_moods: [] });
  });

  it('leaves the marks, tags and title of an entry that is not from a wrap up', async () => {
    mockNotes = [
      saved({
        title: 'Check-in: Run a 10k',
        tags: ['run a 10k'],
        views: { goal_checkin: { goal_id: 'g1', goal_name: 'Run a 10k' } },
      }),
    ];
    const res = await updateJournal({
      noteId: 'n1',
      text: 'Eleven miles today.',
      moods: ['good'],
      page: page('Eleven miles today.'),
    });
    if (!res.ok) throw new Error('not saved');
    await res.moods;
    // no wrap up marks are added, so it is not taken for the day's page
    expect(updateNote.mock.calls[0][1].views).toEqual({
      goal_checkin: { goal_id: 'g1', goal_name: 'Run a 10k' },
      [LAYOUT_KEY]: page('Eleven miles today.'),
    });
    const reread = updateNote.mock.calls[1][1];
    expect(reread.title).toBeUndefined();
    expect(reread.tags).toEqual(['run a 10k', 'running', '@sam-lee']);
  });

  it('saves nothing for an entry emptied of words and moods', async () => {
    mockNotes = [saved()];
    expect(await updateJournal({ noteId: 'n1', text: '  ', moods: [] })).toEqual({
      ok: false,
      message: 'Nothing to save.',
    });
    expect(updateNote).not.toHaveBeenCalled();
  });

  it('says so when the entry has gone, or the save fails', async () => {
    expect(await updateJournal({ noteId: 'gone', text: 'Hi', moods: [] })).toEqual({
      ok: false,
      message: 'It is no longer in your journal.',
    });
    mockNotes = [saved()];
    updateNote.mockRejectedValueOnce(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await updateJournal({ noteId: 'n1', text: 'Hi', moods: [] })).toEqual({
      ok: false,
      message: 'offline',
    });
    warn.mockRestore();
  });
});
