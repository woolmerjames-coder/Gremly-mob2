import {
  toCreateOrUpdateInput,
  sanitizeSuggestedTags,
} from '../../components/overlay/overlayV2.mapping';
import { initialV2State } from '../../components/overlay/overlayV2.state';

test('journal tag produces mood', () => {
  const s = { ...initialV2State, tags: ['journal'], mood: undefined } as any;
  s.log.body = 'my journal entry';
  const out = toCreateOrUpdateInput('log', s, null as any);
  expect(out.type).toBe('note');
  expect(out.mood).toBe('neu');
  expect(out.tags).toEqual(['journal']);
});

test('list tag overrides fmt to checkboxes', () => {
  const s = { ...initialV2State, tags: ['list'], format: 'bullet' } as any;
  s.log.body = 'my list';
  const out = toCreateOrUpdateInput('log', s, null as any);
  expect(out.fmt).toBe('checkboxes');
  expect(out.tags).toEqual(['list']);
});

test('explicit format preserved when no list tag', () => {
  const s = { ...initialV2State, tags: [], format: 'bullet' } as any;
  s.log.body = 'bullet note';
  const out = toCreateOrUpdateInput('log', s, null as any);
  expect(out.fmt).toBe('bullet');
  expect(out.tags).toEqual([]);
});

test('note reminder maps to date', () => {
  const s = { ...initialV2State, reminderAt: '2025-11-10T12:00:00.000Z' } as any;
  s.log.body = 'remind me';
  const out = toCreateOrUpdateInput('log', s, null as any);
  expect(out.date).toBe('2025-11-10T12:00:00.000Z');
});

test('todo due_day and due_time map correctly (Gremly date model)', () => {
  const s = { ...initialV2State } as any;
  s.baseType = 'todo';
  s.todo.details = 'do this';
  s.todo.due_day = '2025-11-11';
  s.todo.due_time = '08:00:00';
  const out = toCreateOrUpdateInput('todo', s, null as any);
  // Gremly date model: due_at is always null, use due_day/due_time instead
  expect(out.due_at).toBeNull();
  expect(out.due_day).toBe('2025-11-11');
  expect(out.due_time).toBe('08:00:00');
  expect(out.name).toBe('do this');
  expect(out.tags).toEqual([]);
});

test('invalid reminder strings are dropped', () => {
  const s = { ...initialV2State } as any;
  s.baseType = 'todo';
  s.todo.details = 'call mom';
  s.reminderAt = '09:00';
  const out = toCreateOrUpdateInput('todo', s, null as any);
  expect(out.due_at).toBeNull();
});

test('habit payload strips journal tag', () => {
  const s = { ...initialV2State } as any;
  s.baseType = 'habit';
  s.habit.notes = 'read daily';
  s.tags = ['journal'];
  const out = toCreateOrUpdateInput('habit', s, null as any);
  expect(out.tags).toEqual([]);
});

test('sanitizeSuggestedTags infers running and filters hash noise', () => {
  const text = "See if there's a common running route near here";
  const ai = ['*journal', '#common', '#here', '#near'];
  const result = sanitizeSuggestedTags(text, ai);
  expect(result).toEqual(['running']);
});

test('todo payload strips stopword tags before save', () => {
  const s = { ...initialV2State } as any;
  s.baseType = 'todo';
  s.todo.details = "See if there's a common running route near here";
  s.tags = ['running', 'common', '*journal'];
  const out = toCreateOrUpdateInput('todo', s, null as any);
  expect(out.tags).toEqual(['running']);
  expect(out.name).toBe("See if there's a common running route near here");
});

test('todo with AI title uses title for name, details for details field', () => {
  const s = { ...initialV2State } as any;
  s.baseType = 'todo';
  s.todo.title = 'Dinner in Zipolite'; // Short AI-generated title
  s.todo.details = 'Find somewhere great for dinner in Zipolite'; // Full original sentence
  const out = toCreateOrUpdateInput('todo', s, null as any);

  // Assert: name and title get the short AI title
  expect(out.name).toBe('Dinner in Zipolite');
  expect(out.title).toBe('Dinner in Zipolite');

  // Assert: details field contains the full sentence
  expect(out.details).toBe('Find somewhere great for dinner in Zipolite');

  // Assert: title and details are different
  expect(out.title).not.toBe(out.details);
});

test('todo without AI title derives name from details', () => {
  const s = { ...initialV2State } as any;
  s.baseType = 'todo';
  s.todo.title = ''; // No AI title yet
  s.todo.details = 'Call mom about weekend plans';
  const out = toCreateOrUpdateInput('todo', s, null as any);

  // Assert: name is derived from first line of details
  expect(out.name).toBe('Call mom about weekend plans');
  expect(out.title).toBe('Call mom about weekend plans');
  expect(out.details).toBe('Call mom about weekend plans');
});

test('todo details field is included in save payload', () => {
  const s = { ...initialV2State } as any;
  s.baseType = 'todo';
  s.todo.title = 'Short title';
  s.todo.details = 'Longer description with more context';
  const out = toCreateOrUpdateInput('todo', s, null as any);

  // Assert: details is present in the output
  expect(out).toHaveProperty('details');
  expect(out.details).toBe('Longer description with more context');
  expect(out.type).toBe('todo');
});
