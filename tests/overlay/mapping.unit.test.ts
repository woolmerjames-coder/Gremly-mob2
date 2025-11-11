import { toCreateOrUpdateInput } from '../../components/overlay/overlayV2.mapping';
import { initialV2State } from '../../components/overlay/overlayV2.state';

test('journal tag produces mood', () => {
  const s = { ...initialV2State, tags: ['journal'], mood: undefined } as any;
  s.log.body = 'my journal entry';
  const out = toCreateOrUpdateInput('log', s, null as any);
  expect(out.type).toBe('note');
  expect(out.mood).toBe('neu');
});

test('list tag overrides fmt to checkboxes', () => {
  const s = { ...initialV2State, tags: ['list'], format: 'bullet' } as any;
  s.log.body = 'my list';
  const out = toCreateOrUpdateInput('log', s, null as any);
  expect(out.fmt).toBe('checkboxes');
});

test('explicit format preserved when no list tag', () => {
  const s = { ...initialV2State, tags: [], format: 'bullet' } as any;
  s.log.body = 'bullet note';
  const out = toCreateOrUpdateInput('log', s, null as any);
  expect(out.fmt).toBe('bullet');
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
});
