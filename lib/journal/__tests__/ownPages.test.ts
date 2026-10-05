/**
 * Pages of the person's own (lib/journal/ownPages): what is kept from what
 * they fill in, bringing them from the account, saving and deleting, and the
 * copy on the phone belonging to one person.
 */
type Result = { data?: unknown; error?: unknown };
type Op = 'select' | 'insert' | 'update' | 'delete';

let mockUser: string | null = 'u1';
let mockResults: Record<Op, Result>;
let mockCalls: { op: string; args: unknown[] }[] = [];
let mockAuthListener: ((event: string) => void) | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('../../supabase/client', () => {
  /** A query as the app builds it: it answers with the result set for what it does */
  const query = () => {
    let op: Op = 'select';
    const q: Record<string, unknown> = {};
    const step =
      (name: string, sets?: Op) =>
      (...args: unknown[]) => {
        if (sets) op = sets;
        mockCalls.push({ op: name, args });
        return q;
      };
    q.select = step('select');
    q.insert = step('insert', 'insert');
    q.update = step('update', 'update');
    q.delete = step('delete', 'delete');
    q.eq = step('eq');
    q.order = step('order');
    q.single = step('single');
    q.then = (yes: (r: Result) => unknown, no: (e: unknown) => unknown) =>
      Promise.resolve(mockResults[op]).then(yes, no);
    return q;
  };
  return {
    supabase: {
      from: (table: string) => {
        mockCalls.push({ op: 'from', args: [table] });
        return query();
      },
      auth: {
        getSession: async () => ({
          data: { session: mockUser ? { user: { id: mockUser } } : null },
        }),
        onAuthStateChange: (listener: (event: string) => void) => {
          mockAuthListener = listener;
          return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
        },
      },
    },
  };
});

import { renderHook } from '@testing-library/react-native';
import {
  OWN_PAGES_MAX,
  cleanForm,
  deleteOwnPage,
  loadOwnPages,
  ownPages,
  saveOwnPage,
  useOwnPagesStore,
  useOwnPagesSync,
} from '../ownPages';
import { FREEFORM, allPages, pageIn } from '../pages';
import { newPage } from '../page';
import { draftFor, keepDraft, useJournalSession } from '../session';

const row = (id: string, name: string, prompts: string[]) => ({ id, name, prompts });
const called = (op: string) => mockCalls.filter((c) => c.op === op).map((c) => c.args);

beforeEach(() => {
  mockUser = 'u1';
  mockCalls = [];
  mockAuthListener = null;
  mockResults = {
    select: { data: [], error: null },
    insert: { data: null, error: null },
    update: { data: null, error: null },
    delete: { data: null, error: null },
  };
  useOwnPagesStore.setState({ owner: null, pages: [] });
  useJournalSession.setState({ open: null, drafts: {}, lastPage: FREEFORM, owner: null });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('what is kept from what they fill in', () => {
  it('trims the name and the questions, and drops the ones left empty', () => {
    expect(
      cleanForm({
        name: '  Sunday reset ',
        prompts: [' What went well? ', '', '  ', 'What next?'],
      }),
    ).toEqual({ name: 'Sunday reset', prompts: ['What went well?', 'What next?'] });
  });

  it('gives a page with no name a plain one', () => {
    expect(cleanForm({ name: '  ', prompts: ['What went well?'] })?.name).toBe('My page');
  });

  it('is nothing without a question', () => {
    expect(cleanForm({ name: 'Sunday reset', prompts: ['', '  '] })).toBeNull();
  });

  it('cuts a name, a question and the list to the lengths the page has room for', () => {
    const clean = cleanForm({
      name: 'A very long name for a page of mine',
      prompts: Array.from({ length: 9 }, (_, i) => `${i} ${'why '.repeat(30)}`),
    });
    expect(clean?.name).toBe('A very long name for a pag');
    expect(clean?.prompts).toHaveLength(6);
    expect(clean?.prompts.every((q) => q.length <= 70)).toBe(true);
  });
});

describe('bringing them from the account', () => {
  it('shows them after the built in pages, oldest first, as pages of their own', async () => {
    mockResults.select = {
      data: [
        row('p1', 'Sunday reset', ['What went well?', 'What next?']),
        row('p2', 'Work', ['Wins']),
      ],
      error: null,
    };
    await loadOwnPages();
    expect(called('from')[0]).toEqual(['journal_pages']);
    expect(called('order')[0]).toEqual(['created_at', { ascending: true }]);
    expect(ownPages().map((p) => p.name)).toEqual(['Sunday reset', 'Work']);
    const all = allPages(ownPages());
    expect(all.slice(-2).map((p) => [p.id, p.own, p.icon])).toEqual([
      ['p1', true, 'own'],
      ['p2', true, 'own'],
    ]);
    expect(pageIn(all, 'p1').prompts).toEqual(['What went well?', 'What next?']);
  });

  it('leaves out a row that is not a page', async () => {
    mockResults.select = {
      data: [
        row('p1', 'Sunday reset', ['What went well?']),
        row('p2', 'Empty', []),
        { name: 'No id' },
      ],
      error: null,
    };
    await loadOwnPages();
    expect(ownPages().map((p) => p.id)).toEqual(['p1']);
  });

  it('keeps the copy on the phone when the account cannot be reached', async () => {
    useOwnPagesStore.setState({ owner: 'u1', pages: allPages([]).slice(1, 2) });
    mockResults.select = { data: null, error: new Error('offline') };
    await loadOwnPages();
    expect(ownPages()).toHaveLength(1);
  });

  it('does nothing while nobody is signed in', async () => {
    mockUser = null;
    await loadOwnPages();
    expect(called('from')).toHaveLength(0);
  });
});

describe('the copy on the phone belongs to one person', () => {
  const kept = () =>
    keepDraft('day:2026-09-30', { page: newPage(pageIn(allPages(), 'rose')), moods: [] });

  it('starts empty for someone else signing in, drafts and last page included', async () => {
    useOwnPagesStore.setState({ owner: 'u1', pages: allPages([]).slice(1, 2) });
    useJournalSession.setState({ owner: 'u1', lastPage: 'rose' });
    kept();
    mockUser = 'u2';
    mockResults.select = { data: null, error: new Error('offline') };
    await loadOwnPages();
    expect(ownPages()).toEqual([]);
    expect(useOwnPagesStore.getState().owner).toBe('u2');
    expect(draftFor('day:2026-09-30')).toBeNull();
    expect(useJournalSession.getState().lastPage).toBe(FREEFORM);
  });

  it('keeps everything for the same person signing back in', async () => {
    useJournalSession.setState({ owner: 'u1', lastPage: 'rose' });
    kept();
    await loadOwnPages();
    expect(draftFor('day:2026-09-30')).not.toBeNull();
    expect(useJournalSession.getState().lastPage).toBe('rose');
  });

  it('takes what was kept before the phone knew whose it was as this person’s', async () => {
    useJournalSession.setState({ owner: null, lastPage: 'rose' });
    kept();
    await loadOwnPages();
    expect(draftFor('day:2026-09-30')).not.toBeNull();
    expect(useJournalSession.getState()).toMatchObject({ owner: 'u1', lastPage: 'rose' });
  });
});

describe('keeping a page', () => {
  it('saves a new one to the account, then shows it with the others', async () => {
    mockResults.insert = { data: row('p9', 'Sunday reset', ['What went well?']), error: null };
    const res = await saveOwnPage({ name: ' Sunday reset ', prompts: ['What went well? ', ''] });
    expect(called('insert')[0]).toEqual([
      { name: 'Sunday reset', prompts: ['What went well?'], user_id: 'u1' },
    ]);
    expect(res).toEqual({
      ok: true,
      page: {
        id: 'p9',
        name: 'Sunday reset',
        about: '',
        prompts: ['What went well?'],
        icon: 'own',
        own: true,
      },
    });
    expect(ownPages().map((p) => p.id)).toEqual(['p9']);
  });

  it('saves changes to one they have, in its place', async () => {
    useOwnPagesStore.setState({
      owner: 'u1',
      pages: [
        { id: 'p1', name: 'Old', about: '', prompts: ['A'], icon: 'own', own: true },
        { id: 'p2', name: 'Work', about: '', prompts: ['Wins'], icon: 'own', own: true },
      ],
    });
    mockResults.update = { data: row('p1', 'Sunday reset', ['A', 'B']), error: null };
    const res = await saveOwnPage({ id: 'p1', name: 'Sunday reset', prompts: ['A', 'B'] });
    expect(called('update')[0]).toEqual([{ name: 'Sunday reset', prompts: ['A', 'B'] }]);
    expect(called('eq')[0]).toEqual(['id', 'p1']);
    expect(called('insert')).toHaveLength(0);
    expect(res.ok).toBe(true);
    expect(ownPages().map((p) => `${p.id} ${p.name}`)).toEqual(['p1 Sunday reset', 'p2 Work']);
  });

  it('asks for a question before it saves anything', async () => {
    expect(await saveOwnPage({ name: 'Sunday reset', prompts: [' '] })).toEqual({
      ok: false,
      message: 'Add at least one question',
    });
    expect(called('from')).toHaveLength(0);
  });

  it('says so and keeps nothing when the account cannot be reached', async () => {
    mockResults.insert = { data: null, error: new Error('offline') };
    expect(await saveOwnPage({ name: 'Sunday reset', prompts: ['A'] })).toEqual({
      ok: false,
      message: 'Your page was not saved. Check your signal and try again.',
    });
    expect(ownPages()).toEqual([]);
  });

  it('has room for a dozen, and still lets one of them be changed', async () => {
    const full = Array.from({ length: OWN_PAGES_MAX }, (_, i) => ({
      id: `p${i}`,
      name: `Page ${i}`,
      about: '',
      prompts: ['A'],
      icon: 'own' as const,
      own: true,
    }));
    useOwnPagesStore.setState({ owner: 'u1', pages: full });
    expect(await saveOwnPage({ name: 'One more', prompts: ['A'] })).toEqual({
      ok: false,
      message: 'You have 12 pages of your own. Delete one to make another.',
    });
    expect(called('from')).toHaveLength(0);
    mockResults.update = { data: row('p0', 'Renamed', ['A']), error: null };
    expect((await saveOwnPage({ id: 'p0', name: 'Renamed', prompts: ['A'] })).ok).toBe(true);
  });
});

describe('deleting a page', () => {
  beforeEach(() => {
    useOwnPagesStore.setState({
      owner: 'u1',
      pages: [{ id: 'p1', name: 'Old', about: '', prompts: ['A'], icon: 'own', own: true }],
    });
  });

  it('takes it off the account, then out of the pages to choose from', async () => {
    expect(await deleteOwnPage('p1')).toEqual({ ok: true });
    expect(called('delete')).toHaveLength(1);
    expect(called('eq')[0]).toEqual(['id', 'p1']);
    expect(ownPages()).toEqual([]);
  });

  it('says so and keeps it when the account cannot be reached', async () => {
    mockResults.delete = { data: null, error: new Error('offline') };
    expect(await deleteOwnPage('p1')).toEqual({
      ok: false,
      message: 'Your page was not deleted. Check your signal and try again.',
    });
    expect(ownPages()).toHaveLength(1);
  });
});

describe('keeping in step with who is signed in', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('loads when the app opens, and again when someone signs in', async () => {
    mockResults.select = { data: [row('p1', 'Sunday reset', ['A'])], error: null };
    const { unmount } = renderHook(() => useOwnPagesSync());
    await settle();
    expect(ownPages().map((p) => p.id)).toEqual(['p1']);

    mockResults.select = {
      data: [row('p1', 'Sunday reset', ['A']), row('p2', 'Work', ['B'])],
      error: null,
    };
    mockAuthListener?.('TOKEN_REFRESHED');
    await settle();
    expect(ownPages()).toHaveLength(1);
    mockAuthListener?.('SIGNED_IN');
    await settle();
    expect(ownPages()).toHaveLength(2);

    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
