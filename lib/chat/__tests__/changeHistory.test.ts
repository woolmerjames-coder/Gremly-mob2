/**
 * An item's history: what a confirmed chat or Mind Drop change leaves on the
 * item, how Undo takes it back out, and the words the overlay shows.
 */
import {
  CHANGE_LOG_MAX,
  agoWords,
  changeDetail,
  changeLine,
  changeLogOf,
  createdDay,
  dateStillUpdated,
  historyWords,
  originLine,
  originalLabelWords,
  originalTextOf,
  recordChange,
  showsOriginalLabel,
  type ChangeEntry,
} from '../changeHistory';

const dentist = { title: 'Dentist', due_day: '2026-10-02', due_time: '10:00' };
const DROP = 'Dentist appointment booked for Friday at 10am';

describe('recording a change', () => {
  it('logs the change and keeps a copy of the words first written', () => {
    const r = recordChange(
      { minddrop_stage: 'enriched' },
      dentist,
      { field: 'due_day', from: '2026-10-02', to: '2026-10-05' },
      'minddrop',
      DROP,
    );
    expect(r.views.minddrop_stage).toBe('enriched');
    expect(originalTextOf(r.views)).toBe(DROP);
    const [entry] = changeLogOf(r.views);
    expect(entry).toMatchObject({
      field: 'due_day',
      from: '2026-10-02',
      to: '2026-10-05',
      was: 'Fri 2 Oct, 10:00am',
      now: 'Mon 5 Oct, 10:00am',
      source: 'minddrop',
    });
  });

  it('keeps the first copy of the words when a later change comes', () => {
    const first = recordChange(
      {},
      dentist,
      { field: 'name', from: null, to: 'Dentist check' },
      'chat',
      DROP,
    );
    const second = recordChange(
      first.views,
      dentist,
      { field: 'due_time', from: '10:00', to: '15:00' },
      'chat',
      'something they wrote since',
    );
    expect(originalTextOf(second.views)).toBe(DROP);
    expect(changeLogOf(second.views)).toHaveLength(2);
  });

  it('Undo takes only its own line out, and the copy goes with the last line', () => {
    const a = recordChange({}, dentist, { field: 'name', from: null, to: 'A' }, 'chat', DROP);
    const b = recordChange(a.views, dentist, { field: 'name', from: 'A', to: 'B' }, 'chat', DROP);
    const afterB = b.undo({ ...b.views, private_journal: true });
    expect(changeLogOf(afterB).map((e) => e.now)).toEqual(['A']);
    expect(afterB.private_journal).toBe(true);
    const afterA = a.undo(afterB);
    expect(afterA.change_log).toBeUndefined();
    expect(afterA.original_text).toBeUndefined();
    expect(afterA.private_journal).toBe(true);
  });

  it('a time that came with the day joins that line, and Undo puts the line back as it was', () => {
    const day = recordChange(
      {},
      dentist,
      { field: 'due_day', from: '2026-10-02', to: '2026-10-05' },
      'minddrop',
      DROP,
    );
    const time = recordChange(
      day.views,
      { ...dentist, due_day: '2026-10-05' },
      { field: 'due_time', from: '10:00', to: '15:00' },
      'minddrop',
      DROP,
      true,
    );
    const log = changeLogOf(time.views);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ was: 'Fri 2 Oct, 10:00am', now: 'Mon 5 Oct, 3:00pm' });
    expect(changeLogOf(time.undo(time.views))[0].now).toBe('Mon 5 Oct, 10:00am');
  });

  it('keeps the newest lines when the history is full', () => {
    let views: unknown = {};
    for (let i = 0; i < CHANGE_LOG_MAX + 3; i++) {
      views = recordChange(
        views,
        dentist,
        { field: 'name', from: null, to: `N${i}` },
        'chat',
        DROP,
      ).views;
    }
    const log = changeLogOf(views);
    expect(log).toHaveLength(CHANGE_LOG_MAX);
    expect(log[log.length - 1].now).toBe(`N${CHANGE_LOG_MAX + 2}`);
  });

  it('leaves out anything that does not read as a line', () => {
    expect(changeLogOf({ change_log: [{ id: 'x' }, null, 'no'] })).toEqual([]);
    expect(changeLogOf(null)).toEqual([]);
  });
});

describe('the words', () => {
  const at = '2026-09-30T16:00:00.000Z';
  const entry = (over: Partial<ChangeEntry>): ChangeEntry => ({
    id: '1',
    field: 'due_day',
    from: '2026-10-02',
    to: '2026-10-05',
    was: 'Fri 2 Oct, 10:00am',
    now: 'Mon 5 Oct, 3:00pm',
    at,
    source: 'minddrop',
    ...over,
  });
  const now = new Date(at);

  it('says what changed and what it was', () => {
    expect(changeLine(entry({}))).toEqual({ icon: 'moved', title: 'Moved to Mon 5 Oct, 3:00pm' });
    expect(changeDetail(entry({}), now)).toBe('was Fri 2 Oct, 10:00am · from Mind Drop · just now');
    expect(changeDetail(entry({ was: null, source: 'chat' }), now)).toBe(
      'had no day · from chat · just now',
    );
    expect(
      changeLine(
        entry({
          field: 'name',
          from: 'Car MOT',
          to: 'Book the MOT',
          was: 'Car MOT',
          now: 'Book the MOT',
        }),
      ),
    ).toEqual({ icon: 'renamed', title: 'Renamed to “Book the MOT”' });
    expect(
      changeDetail(
        entry({ field: 'name', was: 'Car MOT', now: 'Book the MOT', source: 'chat' }),
        now,
      ),
    ).toBe('was “Car MOT” · from chat · just now');
    expect(
      changeLine(entry({ field: 'body_add', was: null, now: 'bring the insurance card' })).title,
    ).toBe('Added to its notes');
    expect(
      changeDetail(entry({ field: 'body_add', was: null, now: 'bring the insurance card' }), now),
    ).toBe('“bring the insurance card” · from Mind Drop · just now');
  });

  it('says how long ago in plain words', () => {
    const base = new Date(2026, 8, 30, 15, 0);
    expect(agoWords(new Date(2026, 8, 30, 14, 58).toISOString(), base)).toBe('2 min ago');
    expect(agoWords(new Date(2026, 8, 30, 12, 0).toISOString(), base)).toBe('3 hr ago');
    expect(agoWords(new Date(2026, 8, 29, 23, 0).toISOString(), base)).toBe('yesterday');
    expect(agoWords(new Date(2026, 8, 20, 9, 0).toISOString(), base)).toBe('Sun 20 Sep');
  });

  it('writes a day as the date, never Today', () => {
    expect(historyWords(dentist, { field: 'due_time', from: null, to: '15:00' })).toEqual({
      was: null,
      now: 'Fri 2 Oct, 3:00pm',
    });
  });

  it('names where the item began and the label over its first words', () => {
    const made = new Date(2026, 8, 30, 9, 12).toISOString();
    expect(originLine('catchall', made)).toEqual({
      title: 'Dropped into Mind Drop',
      detail: 'Wed 30 Sep, 9:12am',
    });
    expect(originLine('chat_save', made)?.title).toBe('Saved from chat');
    expect(originalLabelWords('catchall')).toBe('Your original drop');
    expect(originalLabelWords('manual', 'drop-1')).toBe('Your original drop');
    expect(originalLabelWords('manual')).toBe('Your original words');
    expect(createdDay(made)).toBe('Wed 30 Sep');
  });
});

describe('what the overlay marks', () => {
  const logged = recordChange(
    {},
    dentist,
    { field: 'due_day', from: '2026-10-02', to: '2026-10-05' },
    'minddrop',
    DROP,
  ).views;

  it('labels the words only while they are the ones first written', () => {
    expect(showsOriginalLabel(logged, DROP)).toBe(true);
    expect(showsOriginalLabel(logged, `  ${DROP}\n`)).toBe(true);
    expect(showsOriginalLabel(logged, 'Dentist moved to Monday afternoon.')).toBe(false);
    expect(showsOriginalLabel({}, DROP)).toBe(false);
  });

  it('says Updated on the date row while the change still holds', () => {
    const log = changeLogOf(logged);
    expect(dateStillUpdated(log, { day: '2026-10-05', time: '10:00' })).toBe(true);
    expect(dateStillUpdated(log, { day: '2026-10-07', time: '10:00' })).toBe(false);
    const timed = changeLogOf(
      recordChange(logged, dentist, { field: 'due_time', from: '10:00', to: '9:30' }, 'chat', DROP)
        .views,
    );
    expect(dateStillUpdated(timed, { day: '2026-10-05', time: '09:30:00' })).toBe(true);
    expect(dateStillUpdated([], { day: '2026-10-05' })).toBe(false);
  });
});
