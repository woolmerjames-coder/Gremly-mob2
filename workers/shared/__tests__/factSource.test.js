/**
 * @jest-environment node
 */
// How Gremly knows a fact, in words (workers/shared/factSource.js): the kind
// of record it came from, the day where the person is, and what was said.

import { localDay, sourcePlace, sourceWords } from '../factSource.js';

const ANSWER = {
  said_by: 'user',
  source_table: 'user_corrections',
  source_kind: 'question',
  source_question: 'How is work going these days?',
  source_quote: 'Busy but good. Might be moving to the Lisbon office in the new year, we will see',
  // late on Tuesday 29 September in Los Angeles, already Wednesday in UTC
  observed_at: '2026-09-30T05:10:00Z',
};

describe('the day a fact was learned', () => {
  it('is the date where they are, not the date in UTC', () => {
    expect(localDay(ANSWER.observed_at, 'America/Los_Angeles')).toBe('2026-09-29');
    expect(localDay(ANSWER.observed_at, 'UTC')).toBe('2026-09-30');
    expect(localDay(ANSWER.observed_at)).toBe('2026-09-30');
  });

  it('is nothing when there is no moment to read, and UTC when the timezone is not one', () => {
    expect(localDay(null, 'UTC')).toBe('');
    expect(localDay('not a date', 'UTC')).toBe('');
    expect(localDay(ANSWER.observed_at, 'Nowhere/Made_Up')).toBe('2026-09-30');
  });
});

describe('where a fact came from', () => {
  it('names the kind of record', () => {
    expect(sourcePlace({ source_table: 'notes', source_kind: 'journal' })).toBe('their journal');
    expect(sourcePlace({ source_table: 'notes', source_kind: 'event' })).toBe(
      'an event they saved',
    );
    expect(sourcePlace({ source_table: 'notes', source_kind: 'idea' })).toBe('a note they saved');
    expect(sourcePlace({ source_table: 'scope_chat_messages', source_kind: 'daily' })).toBe(
      'their thread for the day with Gremly',
    );
    expect(sourcePlace({ source_table: 'scope_chat_messages', source_kind: 'general' })).toBe(
      'a chat with Gremly',
    );
    expect(sourcePlace({ source_table: 'todos' })).toBe('a todo they added');
    expect(sourcePlace({ source_table: 'habits' })).toBe('a habit they set up');
    expect(sourcePlace({ source_table: 'space_milestones' })).toBe('a milestone they set');
    expect(sourcePlace({ source_table: 'synced_calendar_events' })).toBe('their calendar');
    expect(sourcePlace({ source_table: 'user_profile_overrides' })).toBe(
      'what they told Gremly about themselves',
    );
  });

  it("names Gremly's question when the fact is their answer to one", () => {
    expect(sourcePlace(ANSWER)).toBe(
      'their answer when Gremly asked "How is work going these days?"',
    );
    expect(
      sourcePlace({ source_table: 'gremly_questions', source_question: 'Friday or Monday?' }),
    ).toBe('their answer when Gremly asked "Friday or Monday?"');
    // the question itself has gone: still an answer, with no words put in Gremly's mouth
    expect(sourcePlace({ ...ANSWER, source_question: null })).toBe(
      "their answer to one of Gremly's questions",
    );
  });

  it('tells a correction they tapped from something said in a chat', () => {
    expect(sourcePlace({ source_table: 'user_corrections', source_kind: 'not_right' })).toBe(
      'something they put right in what Gremly had',
    );
    expect(sourcePlace({ source_table: 'user_corrections', source_kind: 'brief' })).toBe(
      'something they told Gremly in a chat',
    );
    expect(sourcePlace({ source_table: 'user_corrections', source_kind: 'chat' })).toBe(
      'something they told Gremly in a chat',
    );
  });

  it('is nothing for a row with no source: a story item, a Chapter, an older database', () => {
    expect(sourcePlace({})).toBe('');
    expect(sourcePlace(null)).toBe('');
    expect(sourcePlace({ source_table: 'a table not known here' })).toBe('');
    expect(sourceWords({ source: 'story', body: 'A year by the sea' })).toBe('');
  });
});

describe('how Gremly knows, in words', () => {
  it('says where, the day where they are, and their own words', () => {
    expect(sourceWords(ANSWER, { today: '2026-10-03', timezone: 'America/Los_Angeles' })).toBe(
      'their answer when Gremly asked "How is work going these days?", on Tue 29 Sep 2026; their words: "Busy but good. Might be moving to the Lisbon office in the new year, we will see"',
    );
  });

  it('marks today and yesterday', () => {
    const o = { timezone: 'America/Los_Angeles' };
    expect(sourceWords(ANSWER, { ...o, today: '2026-09-29' })).toContain(
      'on Tue 29 Sep 2026 (today)',
    );
    expect(sourceWords(ANSWER, { ...o, today: '2026-09-30' })).toContain(
      'on Tue 29 Sep 2026 (yesterday)',
    );
  });

  it("gives an item's words as what it reads, not as something they said", () => {
    expect(
      sourceWords(
        {
          said_by: 'app_record',
          source_table: 'todos',
          source_quote: "Book Jo's birthday dinner for Friday 9th",
          observed_at: '2026-09-27T17:05:00Z',
        },
        { timezone: 'America/Los_Angeles' },
      ),
    ).toBe(
      'a todo they added, on Sun 27 Sep 2026; it reads: "Book Jo\'s birthday dinner for Friday 9th"',
    );
  });

  it('leaves out what is not kept, and cuts long words short', () => {
    expect(sourceWords({ source_table: 'habits' })).toBe('a habit they set up');
    const long = sourceWords(
      {
        said_by: 'user',
        source_table: 'notes',
        source_kind: 'journal',
        source_quote: 'word '.repeat(80),
      },
      { quote: 40 },
    );
    expect(long.endsWith('…"')).toBe(true);
    expect(long.length).toBeLessThan(80);
  });
});
