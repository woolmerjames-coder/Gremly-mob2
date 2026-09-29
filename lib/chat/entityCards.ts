/**
 * Entity card in chat: applying and undoing the change the user confirmed.
 *
 * The worker proposes (lib/types EntityCard); this module is the only place
 * that turns a proposal into a store change, and only when the user tapped.
 * Everything goes through the Zustand store's own update actions, so the
 * usual sync, optimistic update and rollback apply.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date/DateService';
import type { EntityCard, EntityCardChange, EntityCardEntity } from '../types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Thu 1 Oct" from YYYY-MM-DD, "Today" and "Tomorrow" when they apply. */
export function formatDay(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const ds = getDateService();
  if (ds.isToday(dateStr)) return 'Today';
  if (ds.isTomorrow(dateStr)) return 'Tomorrow';
  const d = ds.fromLocalDate(dateStr);
  if (!d) return dateStr;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "2:00pm" from HH:mm. */
export function formatTime(time: string | null | undefined): string {
  if (!time) return '';
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return time;
  const h = parseInt(m[1], 10);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]}${suffix}`;
}

/** One line under the title: "Todo · Thu 1 Oct, 2:00pm" or "Habit · Weekdays". */
export function entitySubtitle(entity: EntityCardEntity): string {
  const kind = entity.type === 'todo' ? 'Todo' : entity.type === 'habit' ? 'Habit' : 'Note';
  if (entity.type === 'todo') {
    const when = [formatDay(entity.due_day), formatTime(entity.due_time)]
      .filter(Boolean)
      .join(', ');
    return when ? `${kind} · ${when}` : kind;
  }
  if (entity.type === 'habit') return entity.frequency ? `${kind} · ${entity.frequency}` : kind;
  return entity.target_date ? `${kind} · ${formatDay(entity.target_date)}` : kind;
}

/** The two halves of the change row on an edit card. */
export function describeChange(
  entity: EntityCardEntity,
  change: EntityCardChange,
): { from: string; to: string; label: string } {
  switch (change.field) {
    case 'due_day':
      return {
        from: formatDay(change.from) || 'No day',
        to: formatDay(change.to),
        label: 'Move to',
      };
    case 'due_time':
      return {
        from: formatTime(change.from) || 'No time',
        to: formatTime(change.to),
        label: 'Change time to',
      };
    case 'name':
      return { from: change.from || entity.title, to: change.to, label: 'Rename to' };
    case 'frequency':
      return { from: change.from || 'No frequency', to: change.to, label: 'Change to' };
    case 'body':
      return {
        from: change.from ? 'Current note' : 'Empty',
        to: change.to,
        label: 'Update note to',
      };
    case 'completed':
      return { from: 'Open', to: 'Done', label: 'Mark as' };
    default:
      return { from: change.from || '', to: change.to, label: 'Change to' };
  }
}

/** The Save items pill wording for an edit proposed by extraction. */
export function editPillTitle(item: { entity_title: string; field: string; to: string }): string {
  const c = describeChange(
    { id: '', type: 'todo', title: item.entity_title },
    { field: item.field as EntityCardChange['field'], from: null, to: item.to },
  );
  return `Update ${item.entity_title} to ${c.to}`;
}

export interface AppliedChange {
  /** What the item was before, enough to undo. */
  revert: () => Promise<void>;
  /** Plain words for the confirmation line. */
  summary: string;
}

/**
 * Apply a confirmed edit through the store. Resolves with an undo function.
 * Throws when the item no longer exists.
 */
export async function applyEntityChange(
  entity: EntityCardEntity,
  change: EntityCardChange,
): Promise<AppliedChange> {
  const store = useGremlyStore.getState();
  const words = describeChange(entity, change);
  if (entity.type === 'todo') {
    const todo = store.todos.find((t) => t.id === entity.id);
    if (!todo) throw new Error('That todo is no longer here.');
    if (change.field === 'completed') {
      await store.completeTodo(todo.id);
      return {
        revert: () => store.uncompleteTodo(todo.id),
        summary: `${todo.name || todo.title} is done.`,
      };
    }
    const before = {
      name: todo.name,
      title: todo.title,
      due_day: todo.due_day ?? null,
      due_date: todo.due_date ?? null,
      due_time: todo.due_time ?? null,
    };
    const updates =
      change.field === 'due_day'
        ? { due_day: change.to, due_date: change.to }
        : change.field === 'due_time'
          ? { due_time: change.to }
          : { name: change.to, title: change.to };
    await store.updateTodo(todo.id, updates);
    return {
      revert: () =>
        useGremlyStore
          .getState()
          .updateTodo(
            todo.id,
            change.field === 'due_day'
              ? { due_day: before.due_day, due_date: before.due_date }
              : change.field === 'due_time'
                ? { due_time: before.due_time }
                : { name: before.name, title: before.title },
          ),
      summary: `${todo.name || todo.title} is now ${words.to}.`,
    };
  }
  if (entity.type === 'habit') {
    const habit = store.habits.find((h) => h.id === entity.id);
    if (!habit) throw new Error('That habit is no longer here.');
    const before = { name: habit.name, frequency: habit.frequency };
    const updates = change.field === 'frequency' ? { frequency: change.to } : { name: change.to };
    await store.updateHabit(habit.id, updates);
    return {
      revert: () =>
        useGremlyStore
          .getState()
          .updateHabit(
            habit.id,
            change.field === 'frequency' ? { frequency: before.frequency } : { name: before.name },
          ),
      summary:
        change.field === 'frequency'
          ? `${habit.name} is now ${words.to}.`
          : `Renamed to ${words.to}.`,
    };
  }
  const note = store.notes.find((n) => n.id === entity.id);
  if (!note) throw new Error('That note is no longer here.');
  const before = { title: note.title ?? null, body: note.body ?? null };
  const updates = change.field === 'body' ? { body: change.to } : { title: change.to };
  await store.updateNote(note.id, updates);
  return {
    revert: () =>
      useGremlyStore
        .getState()
        .updateNote(
          note.id,
          change.field === 'body' ? { body: before.body } : { title: before.title },
        ),
    summary: change.field === 'body' ? 'Note updated.' : `Renamed to ${words.to}.`,
  };
}

export function isEditCard(card: EntityCard): card is Extract<EntityCard, { kind: 'edit' }> {
  return card.kind === 'edit';
}
