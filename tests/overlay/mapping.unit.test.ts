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

test('todo due or reminder maps to due_at', () => {
  const s = { ...initialV2State } as any;
  s.baseType = 'todo';
  s.todo.details = 'do this';
  s.todo.due_at = null;
  s.reminderAt = '2025-11-11T08:00:00.000Z';
  const out = toCreateOrUpdateInput('todo', s, null as any);
  expect(out.due_at).toBe('2025-11-11T08:00:00.000Z');
  expect(out.name).toBe('do this');
  expect(out.tags).toEqual([]);
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
