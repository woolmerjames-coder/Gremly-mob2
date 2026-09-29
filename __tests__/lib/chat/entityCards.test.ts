/**
 * Entity card wording helpers: what the card and the Save items pill say.
 */
import {
  formatDay,
  formatTime,
  entitySubtitle,
  describeChange,
  editPillTitle,
} from '../../../lib/chat/entityCards';

const dentist = {
  id: 't1',
  type: 'todo' as const,
  title: 'Dentist',
  due_day: '2031-10-01',
  due_time: '14:00',
};

describe('entity card wording', () => {
  test('formatDay and formatTime read like the mockup', () => {
    expect(formatDay('2031-10-01')).toBe('Wed 1 Oct');
    expect(formatDay(null)).toBe('');
    expect(formatTime('14:00')).toBe('2:00pm');
    expect(formatTime('09:05')).toBe('9:05am');
    expect(formatTime('00:30')).toBe('12:30am');
    expect(formatTime(null)).toBe('');
  });

  test('subtitle per type', () => {
    expect(entitySubtitle(dentist)).toBe('Todo · Wed 1 Oct, 2:00pm');
    expect(entitySubtitle({ id: 'h', type: 'habit', title: 'Run', frequency: 'weekdays' })).toBe(
      'Habit · weekdays',
    );
    expect(entitySubtitle({ id: 'n', type: 'note', title: 'Packing' })).toBe('Note');
  });

  test('describeChange gives the two halves of the change row', () => {
    expect(
      describeChange(dentist, { field: 'due_day', from: '2031-10-01', to: '2031-10-02' }),
    ).toEqual({ from: 'Wed 1 Oct', to: 'Thu 2 Oct', label: 'Move to' });
    expect(describeChange(dentist, { field: 'due_time', from: null, to: '15:30' })).toEqual({
      from: 'No time',
      to: '3:30pm',
      label: 'Change time to',
    });
    expect(
      describeChange(dentist, { field: 'name', from: 'Dentist', to: 'Dentist checkup' }),
    ).toEqual({ from: 'Dentist', to: 'Dentist checkup', label: 'Rename to' });
    expect(describeChange(dentist, { field: 'completed', from: null, to: 'done' })).toEqual({
      from: 'Open',
      to: 'Done',
      label: 'Mark as',
    });
  });

  test('the pill wording for an edit', () => {
    expect(editPillTitle({ entity_title: 'Dentist', field: 'due_day', to: '2031-10-02' })).toBe(
      'Update Dentist to Thu 2 Oct',
    );
    expect(
      editPillTitle({ entity_title: 'Morning run', field: 'frequency', to: 'three days a week' }),
    ).toBe('Update Morning run to three days a week');
  });
});
