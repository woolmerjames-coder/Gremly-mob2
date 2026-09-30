/**
 * applyEntityChange writes the change into the item's history in the same
 * update, from chat or Mind Drop, and Undo takes the line back out.
 */
const mockState: any = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
}));

import { applyEntityChange } from '../entityCards';
import { changeLogOf, originalTextOf } from '../changeHistory';

const DROP = 'Dentist appointment booked for Friday at 10am';

function reset() {
  mockState.todos = [
    { id: 't1', name: 'Car MOT', title: 'Car MOT', body: 'need to sort the car MOT', views: {} },
  ];
  mockState.notes = [
    {
      id: 'n1',
      title: 'Dentist Appointment',
      body: DROP,
      target_date: '2026-10-02',
      event_time: '10:00',
      views: { target_date: '2026-10-02', event_time: '10:00', minddrop_stage: 'enriched' },
    },
  ];
  mockState.habits = [{ id: 'h1', name: 'Run', frequency: 'weekly', notes: null, views: {} }];
  const updater = (list: string) =>
    jest.fn(async (id: string, updates: any) => {
      mockState[list] = mockState[list].map((x: any) => (x.id === id ? { ...x, ...updates } : x));
    });
  mockState.updateTodo = updater('todos');
  mockState.updateNote = updater('notes');
  mockState.updateHabit = updater('habits');
  mockState.completeTodo = jest.fn(async () => {});
  mockState.logHabitCompletionForDate = jest.fn(async () => {});
  mockState.removeHabitCompletionForDate = jest.fn(async () => {});
}

const note = () => mockState.notes[0];

describe('the history an applied change leaves', () => {
  beforeEach(reset);

  it('a check-in for several days logs each of them, and Undo takes each back out', async () => {
    const habit = { id: 'h1', type: 'habit' as const, title: 'Run', frequency: 'weekly' };
    const applied = await applyEntityChange(habit, {
      field: 'logged',
      from: null,
      to: '2031-10-02',
      days: ['2031-10-01', '2031-10-02'],
    });
    expect(mockState.logHabitCompletionForDate.mock.calls).toEqual([
      ['h1', '2031-10-01'],
      ['h1', '2031-10-02'],
    ]);
    expect(applied.summary).toMatch(/^Logged Run for .*1 Oct.* and .*2 Oct/);
    await applied.revert();
    expect(mockState.removeHabitCompletionForDate.mock.calls).toEqual([
      ['h1', '2031-10-01'],
      ['h1', '2031-10-02'],
    ]);
    // one day, as before
    await applyEntityChange(habit, { field: 'logged', from: null, to: '2031-10-03' });
    expect(mockState.logHabitCompletionForDate).toHaveBeenLastCalledWith('h1', '2031-10-03');
  });

  it('a Mind Drop move on an appointment: one write, the day, its copy in views, and the history', async () => {
    const entity = {
      id: 'n1',
      type: 'note' as const,
      title: 'Dentist Appointment',
      due_day: '2026-10-02',
      due_time: '10:00',
    };
    const day = await applyEntityChange(
      entity,
      { field: 'due_day', from: '2026-10-02', to: '2026-10-05' },
      { source: 'minddrop' },
    );
    await applyEntityChange(
      day.entity,
      { field: 'due_time', from: '10:00', to: '15:00' },
      { source: 'minddrop', sameChange: true },
    );
    expect(mockState.updateNote).toHaveBeenCalledTimes(2);
    expect(note()).toMatchObject({ target_date: '2026-10-05', event_time: '15:00', body: DROP });
    expect(note().views).toMatchObject({
      target_date: '2026-10-05',
      event_time: '15:00',
      minddrop_stage: 'enriched',
    });
    const log = changeLogOf(note().views);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      source: 'minddrop',
      was: 'Fri 2 Oct, 10:00am',
      now: 'Mon 5 Oct, 3:00pm',
    });
    expect(originalTextOf(note().views)).toBe(DROP);
  });

  it('Undo puts the day back and takes the line out, keeping what else changed in views', async () => {
    const entity = {
      id: 'n1',
      type: 'note' as const,
      title: 'Dentist Appointment',
      due_day: '2026-10-02',
      due_time: '10:00',
    };
    const applied = await applyEntityChange(entity, {
      field: 'due_day',
      from: '2026-10-02',
      to: '2026-10-05',
    });
    mockState.notes = [{ ...note(), views: { ...note().views, private_journal: true } }];
    await applied.revert();
    expect(note().target_date).toBe('2026-10-02');
    expect(note().views.target_date).toBe('2026-10-02');
    expect(note().views.private_journal).toBe(true);
    expect(note().views.change_log).toBeUndefined();
    expect(note().views.original_text).toBeUndefined();
  });

  it('a rename from chat on a todo says it came from chat, and Undo clears it', async () => {
    const applied = await applyEntityChange(
      { id: 't1', type: 'todo', title: 'Car MOT' },
      { field: 'name', from: 'Car MOT', to: 'Book the MOT' },
    );
    const todo = mockState.todos[0];
    expect(todo.name).toBe('Book the MOT');
    expect(changeLogOf(todo.views)[0]).toMatchObject({
      source: 'chat',
      was: 'Car MOT',
      now: 'Book the MOT',
    });
    expect(originalTextOf(todo.views)).toBe('need to sort the car MOT');
    await applied.revert();
    expect(mockState.todos[0].name).toBe('Car MOT');
    expect(changeLogOf(mockState.todos[0].views)).toEqual([]);
  });

  it('a habit frequency change is logged too', async () => {
    await applyEntityChange(
      { id: 'h1', type: 'habit', title: 'Run' },
      { field: 'frequency', from: 'weekly', to: 'daily' },
      { source: 'minddrop' },
    );
    expect(changeLogOf(mockState.habits[0].views)[0]).toMatchObject({
      field: 'frequency',
      was: 'weekly',
      now: 'daily',
    });
  });

  it('marking done is not history: the item shows that itself', async () => {
    await applyEntityChange(
      { id: 't1', type: 'todo', title: 'Car MOT' },
      { field: 'completed', from: null, to: 'done' },
    );
    expect(mockState.completeTodo).toHaveBeenCalledWith('t1');
    expect(mockState.updateTodo).not.toHaveBeenCalled();
  });
});
