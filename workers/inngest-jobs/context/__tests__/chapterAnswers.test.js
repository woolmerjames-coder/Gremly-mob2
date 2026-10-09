/**
 * @jest-environment node
 *
 * An answer to a question about a Chapter (context/chapterAnswers.js): a
 * Chapter started on their yes, closed on their word that it is over, moved
 * to the days they give, or kept going; never on anything their words do not
 * say.
 */
import { chapterAnswerPlan, answerChapterQuestion } from '../chapterAnswers.js';
import { jsonCall } from '../llm.js';
import { db } from '../db.js';
import { memoryDb } from './memoryDb.js';
import { writeMemory } from '../memory.js';

jest.mock('../llm.js', () => ({ jsonCall: jest.fn(), modelFor: (env, job) => ({ model: job }) }));
jest.mock('../db.js', () => ({
  ...jest.requireActual('../db.js'),
  db: jest.fn(),
  personIdentity: async () => ({ first_name: 'Robin', pronouns: null }),
}));
jest.mock('../filing.js', () => ({ personToday: async () => '2026-10-08' }));
jest.mock('../memory.js', () => ({ writeMemory: jest.fn(async () => ({ outcome: 'written' })) }));

const TODAY = '2026-10-08';
const open = { id: 'ch-1', title: 'Training for the 10K', phase: 'active', start_date: '2026-01-01', end_date: '2026-05-17', end_date_source: 'synthesis', closed_at: null };
const close = { id: 'q-1', kind: 'close_chapter', question: 'Is Training for the 10K over?', proposed_change: { type: 'close', chapter_id: 'ch-1' } };
const start = {
  id: 'q-2',
  kind: 'start_chapter',
  question: 'Would you like to make "Porto trip" a Chapter?',
  proposed_change: { type: 'start', title: 'Porto trip', world_id: 'w-1', start_date: '2026-11-10', end_date: '2026-11-14' },
  rests_on: [
    { table: 'todos', id: 't-1' },
    { table: 'notes', id: 'n-1' },
  ],
  created_at: '2026-10-07T08:00:00Z',
};

describe('what an answer does', () => {
  it('closes a Chapter only on their word that it is over or not happening', () => {
    expect(chapterAnswerPlan({ question: close, output: { answers: true, outcome: 'over' }, chapter: open, today: TODAY }).close).toBe(true);
    expect(chapterAnswerPlan({ question: close, output: { answers: true, outcome: 'not_happening' }, chapter: open, today: TODAY }).close).toBe(true);
    for (const outcome of ['unsure', 'later', null])
      expect(chapterAnswerPlan({ question: close, output: { answers: true, outcome }, chapter: open, today: TODAY }).close).toBe(false);
    expect(chapterAnswerPlan({ question: close, output: { answers: false, outcome: 'over' }, chapter: open, today: TODAY }).close).toBe(false);
    // one already closed is left as it is
    expect(chapterAnswerPlan({ question: close, output: { answers: true, outcome: 'over' }, chapter: { ...open, phase: 'closed' }, today: TODAY }).close).toBe(false);
  });

  it('moves it to the days they give, and takes a passed end away when they say it is still going', () => {
    expect(
      chapterAnswerPlan({ question: close, output: { answers: true, outcome: 'moved', start_date: null, end_date: '2026-11-30' }, chapter: open, today: TODAY }).dates,
    ).toEqual({ end_date: '2026-11-30' });
    expect(chapterAnswerPlan({ question: close, output: { answers: true, outcome: 'moved', end_date: 'soon' }, chapter: open, today: TODAY }).dates).toBeNull();
    expect(chapterAnswerPlan({ question: close, output: { answers: true, outcome: 'going' }, chapter: open, today: TODAY }).clearEnd).toBe(true);
    // a day they set themselves is theirs
    expect(chapterAnswerPlan({ question: close, output: { answers: true, outcome: 'going' }, chapter: { ...open, end_date_source: 'user' }, today: TODAY }).clearEnd).toBe(false);
  });

  it('starts a Chapter only on their yes, with the days they give over the ones suggested', () => {
    expect(chapterAnswerPlan({ question: start, output: { answers: true, outcome: 'later' }, today: TODAY }).start).toBeNull();
    expect(chapterAnswerPlan({ question: start, output: { answers: true, outcome: 'no' }, today: TODAY }).start).toBeNull();
    expect(
      chapterAnswerPlan({ question: start, output: { answers: true, outcome: 'start', start_date: '2026-11-11', end_date: null }, today: TODAY }).start,
    ).toEqual({ title: 'Porto trip', world_id: 'w-1', start_date: '2026-11-11', end_date: '2026-11-14', start_said: true, end_said: false });
  });
});

describe('answering', () => {
  beforeEach(() => {
    jsonCall.mockReset();
    writeMemory.mockResolvedValue({ outcome: 'written' });
  });

  it('closes the Chapter on their yes', async () => {
    const mem = memoryDb({ chapters: [{ ...open, owner_id: 'u' }] });
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({ output: { answers: true, outcome: 'over', start_date: null, end_date: null }, model: 'm' });
    const r = await answerChapterQuestion({}, { userId: 'u', question: close, said: "Yes, it's over" });
    expect(r).toMatchObject({ answers: true, closed: 'ch-1', memory: 'written' });
    expect(mem.tables.chapters[0]).toMatchObject({ phase: 'closed', closed_at: expect.any(String) });
    // its memory is written, as when it is closed in the app
    expect(writeMemory).toHaveBeenCalledWith({}, 'u', 'ch-1');
    expect(jsonCall.mock.calls[0][1].user).toContain('IT WAS ABOUT: the Chapter "Training for the 10K", 2026-01-01 to 2026-05-17');
  });

  it('a memory that cannot be written never stops the close', async () => {
    const mem = memoryDb({ chapters: [{ ...open, owner_id: 'u' }] });
    db.mockReturnValue(mem);
    writeMemory.mockRejectedValueOnce(new Error('no model'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jsonCall.mockResolvedValue({ output: { answers: true, outcome: 'over', start_date: null, end_date: null }, model: 'm' });
    const r = await answerChapterQuestion({}, { userId: 'u', question: close, said: 'Done' });
    expect(r).toMatchObject({ closed: 'ch-1', memory: 'failed' });
    warn.mockRestore();
  });

  it('a suggestion resting on facts files the items those facts were read from', async () => {
    const mem = memoryDb({
      chapters: [],
      chapter_world_links: [],
      drop_chapter_links: [],
      life_facts: [
        { id: 'f-1', user_id: 'u', source_table: 'todos', source_id: 't-7' },
        { id: 'f-2', user_id: 'u', source_table: 'scope_chat_messages', source_id: 'm-1' },
        { id: 'f-3', user_id: 'u', source_table: 'todos', source_id: 't-1' },
      ],
    });
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({ output: { answers: true, outcome: 'start', start_date: null, end_date: null }, model: 'm' });
    const question = {
      ...start,
      rests_on: [
        { table: 'todos', id: 't-1' },
        { table: 'life_facts', id: 'f-1' },
        { table: 'life_facts', id: 'f-2' },
        { table: 'life_facts', id: 'f-3' },
      ],
    };
    const r = await answerChapterQuestion({}, { userId: 'u', question, said: 'Yes please' });
    const made = mem.tables.chapters[0];
    expect(r.started).toEqual({ chapter_id: made.id, filed: 2 });
    expect(mem.tables.drop_chapter_links.map((l) => [l.drop_type, l.drop_id])).toEqual([
      ['todo', 't-1'],
      ['todo', 't-7'],
    ]);
  });

  it('starts the Chapter they said yes to, with what the suggestion rested on in it', async () => {
    const mem = memoryDb({ chapters: [], chapter_world_links: [], drop_chapter_links: [] });
    db.mockReturnValue(mem);
    jsonCall.mockResolvedValue({ output: { answers: true, outcome: 'start', start_date: null, end_date: null }, model: 'm' });
    const r = await answerChapterQuestion({}, { userId: 'u', question: start, said: 'Yes, make it a Chapter' });
    const made = mem.tables.chapters[0];
    expect(made).toMatchObject({ owner_id: 'u', title: 'Porto trip', phase: 'upcoming', source: 'question', primary_world_id: 'w-1', start_date: '2026-11-10', end_date: '2026-11-14' });
    expect(r.started).toEqual({ chapter_id: made.id, filed: 2 });
    expect(mem.tables.drop_chapter_links.map((l) => [l.drop_type, l.drop_id, l.chapter_id])).toEqual([
      ['todo', 't-1', made.id],
      ['note', 'n-1', made.id],
    ]);
    expect(mem.tables.chapter_world_links).toEqual([expect.objectContaining({ chapter_id: made.id, world_id: 'w-1' })]);
  });
});
