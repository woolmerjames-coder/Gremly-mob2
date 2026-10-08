import {
  chapterGremly,
  chapterKept,
  chapterSteps,
  closedChapters,
  countdown,
  dayRange,
  dueWords,
  filedIndex,
  hasEnded,
  leadChapter,
  liveChapters,
  nextStep,
  openChapters,
  shownWorlds,
  hiddenWorlds,
  stepsLine,
  stepsOnClosedChapters,
  waitingChapters,
  whenLine,
  worldLoose,
  worldTint,
} from '../model';
import type { Chapter, DropChapterLink, DropWorldLink, World } from '../../supabase/types';
import type { Habit, Note, Todo } from '../../types';

const TODAY = '2026-10-08'; // a Thursday

const world = (o: Partial<World>): World =>
  ({
    id: 'w',
    name: 'Home',
    display_name: null,
    phase: 'active',
    created_at: '2026-04-01T00:00:00Z',
    mascot_slug: null,
    visual_style: null,
    ...o,
  }) as World;
const chapter = (o: Partial<Chapter>): Chapter =>
  ({
    id: 'c',
    title: 'Trip',
    phase: 'active',
    closed_at: null,
    start_date: null,
    end_date: null,
    primary_world_id: 'w',
    created_at: '2026-09-01T00:00:00Z',
    mascot_slug: null,
    ...o,
  }) as Chapter;
const todo = (o: Partial<Todo>): Todo =>
  ({
    id: 't',
    type: 'todo',
    name: 'Step',
    created_at: '2026-10-01T00:00:00Z',
    completed_at: null,
    due_day: null,
    archived: false,
    ...o,
  }) as Todo;
const note = (o: Partial<Note>): Note =>
  ({
    id: 'n',
    type: 'note',
    title: 'Note',
    created_at: '2026-10-01T00:00:00Z',
    archived: false,
    has_list: false,
    list_items: null,
    ...o,
  }) as Note;
const wl = (drop_id: string, drop_type: 'todo' | 'note' | 'habit', world_id = 'w') =>
  ({ drop_id, drop_type, world_id }) as DropWorldLink;
const cl = (drop_id: string, drop_type: 'todo' | 'note' | 'habit', chapter_id = 'c') =>
  ({ drop_id, drop_type, chapter_id }) as DropChapterLink;

describe('Worlds that show', () => {
  it('leaves out hidden Worlds and the old suggestions, oldest first', () => {
    const ws = [
      world({ id: 'b', phase: 'active', created_at: '2026-05-01T00:00:00Z' }),
      world({ id: 'a', phase: 'dormant', created_at: '2026-04-01T00:00:00Z' }),
      world({ id: 'h', phase: 'archived' }),
      world({ id: 's', phase: 'candidate' }),
    ];
    expect(shownWorlds(ws).map((w) => w.id)).toEqual(['a', 'b']);
    expect(hiddenWorlds(ws).map((w) => w.id)).toEqual(['h']);
  });

  it('gives each World the same colour every time, and keeps one that was chosen', () => {
    expect(worldTint(world({ id: 'abc' }))).toBe(worldTint(world({ id: 'abc' })));
    expect(worldTint(world({ id: 'abc', visual_style: { color: 'rose' } }))).toBe('rose');
  });
});

describe('countdown', () => {
  it('counts to a single date', () => {
    expect(countdown({ start_date: null, end_date: '2026-10-20' }, TODAY)).toEqual({
      kind: 'days',
      n: 12,
      label: 'days to go',
    });
    expect(countdown({ start_date: null, end_date: '2026-10-09' }, TODAY)).toEqual({
      kind: 'days',
      n: 1,
      label: 'day to go',
    });
    expect(countdown({ start_date: null, end_date: TODAY }, TODAY)).toEqual({
      kind: 'word',
      big: 'Today',
      label: 'is the day',
    });
  });

  it('counts a stretch of days to its start, then says which day it is', () => {
    expect(countdown({ start_date: '2026-10-10', end_date: '2026-10-14' }, TODAY)).toEqual({
      kind: 'days',
      n: 2,
      label: 'days to go',
    });
    expect(countdown({ start_date: '2026-10-07', end_date: '2026-10-11' }, TODAY)).toEqual({
      kind: 'word',
      big: 'Day 2',
      label: 'of 5',
    });
  });

  it('shows nothing once the date has passed, or with no date', () => {
    expect(countdown({ start_date: null, end_date: '2026-10-01' }, TODAY)).toBeNull();
    expect(countdown({ start_date: '2026-01-01', end_date: null }, TODAY)).toBeNull();
    expect(countdown({ start_date: null, end_date: null }, TODAY)).toBeNull();
  });
});

describe('when a Chapter is, in words', () => {
  it('reads its dates', () => {
    expect(whenLine({ start_date: '2026-11-20', end_date: '2026-11-22' }, TODAY)).toBe(
      'Fri 20 to Sun 22 Nov',
    );
    expect(whenLine({ start_date: null, end_date: '2026-12-12' }, TODAY)).toBe('By Sat 12 Dec');
    expect(whenLine({ start_date: '2026-01-01', end_date: null }, TODAY)).toBe('Since 1 Jan');
    expect(whenLine({ start_date: null, end_date: null }, TODAY)).toBe('No date yet');
    expect(dayRange('2026-11-30', '2026-12-01')).toBe('Mon 30 Nov to Tue 1 Dec');
  });
});

describe('open, waiting and closed', () => {
  const chapters = [
    chapter({ id: 'far', end_date: '2026-12-12' }),
    chapter({ id: 'near', start_date: '2026-10-20', end_date: '2026-10-24' }),
    chapter({ id: 'none' }),
    chapter({ id: 'over', end_date: '2026-10-01' }),
    chapter({
      id: 'closed',
      phase: 'closed',
      closed_at: '2026-09-20T00:00:00Z',
      end_date: '2026-09-19',
    }),
    chapter({
      id: 'old',
      phase: 'closed',
      closed_at: '2026-05-02T00:00:00Z',
      end_date: '2026-05-01',
    }),
    chapter({ id: 'suggested', phase: 'suggested', end_date: '2026-10-09' }),
  ];

  it('lists running Chapters by their next date, then the ones that have ended', () => {
    expect(openChapters(chapters, TODAY).map((c) => c.id)).toEqual(['near', 'far', 'none', 'over']);
    expect(liveChapters(chapters, TODAY).map((c) => c.id)).toEqual(['near', 'far', 'none']);
    expect(waitingChapters(chapters, TODAY).map((c) => c.id)).toEqual(['over']);
    expect(hasEnded(chapters[3], TODAY)).toBe(true);
  });

  it('never shows a suggestion as a Chapter', () => {
    expect(openChapters(chapters, TODAY).some((c) => c.id === 'suggested')).toBe(false);
  });

  it('puts the most recent closed Chapter first', () => {
    expect(closedChapters(chapters).map((c) => c.id)).toEqual(['closed', 'old']);
  });

  it('leads with the nearest date, as the brief does', () => {
    expect(leadChapter(chapters, TODAY)?.id).toBe('near');
  });

  it('leads with a running Chapter when none has a date ahead', () => {
    const undated = [chapter({ id: 'a', start_date: '2026-01-01' })];
    expect(leadChapter(undated, TODAY)?.id).toBe('a');
    expect(leadChapter([], TODAY)).toBeNull();
  });

  it('wears its own Gremly, or its World’s', () => {
    expect(
      chapterGremly(
        chapter({ mascot_slug: 'beach_gremly' }),
        world({ mascot_slug: 'chef_gremly' }),
      ),
    ).toBe('beach_gremly');
    expect(chapterGremly(chapter({}), world({ mascot_slug: 'chef_gremly' }))).toBe('chef_gremly');
    expect(chapterGremly(chapter({}), null)).toBe('gremly-mascot');
  });
});

describe('what belongs where', () => {
  const todos = [
    todo({ id: 't1', due_day: '2026-10-12' }),
    todo({ id: 't2', due_day: '2026-10-09' }),
    todo({ id: 't3' }),
    todo({ id: 't4', completed_at: '2026-10-05T10:00:00Z' }),
    todo({ id: 't5', archived: true }),
    todo({ id: 'loose' }),
    todo({ id: 'loose-done', completed_at: '2026-10-05T10:00:00Z' }),
  ];
  const notes = [
    note({ id: 'n1', created_at: '2026-10-05T00:00:00Z' }),
    note({ id: 'list', has_list: true, created_at: '2026-09-01T00:00:00Z' }),
    note({ id: 'n-loose' }),
  ];
  const filed = filedIndex(
    [
      wl('t1', 'todo'),
      wl('loose', 'todo'),
      wl('loose-done', 'todo'),
      wl('n-loose', 'note'),
      wl('n1', 'note'),
    ],
    [
      cl('t1', 'todo'),
      cl('t2', 'todo'),
      cl('t3', 'todo'),
      cl('t4', 'todo'),
      cl('t5', 'todo'),
      cl('n1', 'note'),
      cl('list', 'note'),
    ],
  );

  it('orders steps by when they are due, undated next, ticked last', () => {
    const steps = chapterSteps('c', todos, filed);
    expect(steps.map((t) => t.id)).toEqual(['t2', 't1', 't3', 't4']);
    expect(nextStep(steps)?.id).toBe('t2');
    expect(stepsLine(steps)).toBe('1 of 4 steps done');
  });

  it('keeps lists first on a Chapter', () => {
    expect(chapterKept('c', notes, filed).map((n) => n.id)).toEqual(['list', 'n1']);
  });

  it('shows on a World only what is in none of its Chapters', () => {
    const loose = worldLoose('w', { todos, notes, habits: [] as Habit[] }, filed);
    expect(loose.todos.map((t) => t.id)).toEqual(['loose']);
    expect(loose.kept.map((n) => n.id)).toEqual(['n-loose']);
  });

  it('takes the steps of a closed Chapter out of Today', () => {
    const closed = [chapter({ id: 'c', phase: 'closed', closed_at: '2026-10-01T00:00:00Z' })];
    expect([...stepsOnClosedChapters(closed, filed)].sort()).toEqual([
      't1',
      't2',
      't3',
      't4',
      't5',
    ]);
    expect(stepsOnClosedChapters([chapter({ id: 'c' })], filed).size).toBe(0);
  });

  it('says when a step is due', () => {
    expect(dueWords({ due_day: TODAY }, TODAY)).toBe('Due today');
    expect(dueWords({ due_day: '2026-10-09' }, TODAY)).toBe('Due tomorrow');
    expect(dueWords({ due_day: '2026-10-12' }, TODAY)).toBe('Due Mon 12 Oct');
    expect(dueWords({ due_day: '2026-10-01' }, TODAY)).toBe('Was due Thu 1 Oct');
    expect(dueWords({ due_day: null }, TODAY)).toBe('');
  });
});
