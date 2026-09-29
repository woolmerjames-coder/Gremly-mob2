/**
 * Entity card in chat: the words on the card, applying and undoing the change
 * the user confirmed, and the two bits of bookkeeping the chat screens share.
 *
 * The worker proposes (lib/types EntityCard); this module is the only place
 * that turns a proposal into a store change, and only when the user tapped.
 * Everything goes through the Zustand store's own update actions, so the
 * usual sync, optimistic update and rollback apply.
 *
 * Mockup is spec (Entity Card in Chat canvas, September 2026): the card sits
 * inside Gremly's message, one tap either way, a plain closing line with Undo.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date/DateService';
import type {
  EntityCard,
  EntityCardChange,
  EntityCardEntity,
  EntityCardStatus,
  RecentEntity,
  SpaceChatMessage,
} from '../types';

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

/** "2:00pm" from HH:mm (a seconds part is ignored). */
export function formatTime(time: string | null | undefined): string {
  if (!time) return '';
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return time;
  const h = parseInt(m[1], 10);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]}${suffix}`;
}

export function entityKind(entity: Pick<EntityCardEntity, 'type'>): string {
  return entity.type === 'todo' ? 'Todo' : entity.type === 'habit' ? 'Habit' : 'Note';
}

/** "Thu 1 Oct, 2:00pm", or "" when the item has no day. Todos and notes. */
export function entityWhen(entity: EntityCardEntity): string {
  if (entity.type === 'habit') return entity.frequency || '';
  return [formatDay(entity.due_day ?? entity.target_date), formatTime(entity.due_time)]
    .filter(Boolean)
    .join(', ');
}

/**
 * One line under the title. With the Space known: "Todo · Health". Otherwise
 * the kind and when it is: "Note · Thu 1 Oct, 2:00pm". An edit card shows the
 * dates in its change row, so it asks for the short form.
 */
export function entitySubtitle(
  entity: EntityCardEntity,
  opts: { spaceName?: string | null; withWhen?: boolean } = {},
): string {
  const parts = [entityKind(entity)];
  if (opts.spaceName) parts.push(opts.spaceName);
  if (opts.withWhen !== false) {
    const when = entityWhen(entity);
    if (when) parts.push(when);
  }
  return parts.join(' · ');
}

/** The two halves of the change row on an edit card. */
export function describeChange(
  entity: EntityCardEntity,
  change: EntityCardChange,
): { from: string; to: string; label: string } {
  switch (change.field) {
    case 'due_day': {
      // keep the time with the day, as the mock does, so the row reads as a whole
      const time = formatTime(entity.due_time);
      const withTime = (day: string) => (day && time ? `${day}, ${time}` : day);
      return {
        from: withTime(formatDay(change.from)) || 'No day',
        to: withTime(formatDay(change.to)),
        label: 'Change to',
      };
    }
    case 'due_time': {
      const day = formatDay(entity.due_day ?? entity.target_date);
      const withDay = (t: string) => (day && t ? `${day}, ${t}` : t);
      return {
        from: withDay(formatTime(change.from)) || 'No time',
        to: withDay(formatTime(change.to)),
        label: 'Change to',
      };
    }
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
    case 'body_add':
      return { from: 'Current note', to: change.to, label: 'Add to note' };
    case 'completed':
      return { from: 'Open', to: 'Done', label: 'Mark as' };
    default:
      return { from: change.from || '', to: change.to, label: 'Change to' };
  }
}

/** The primary button on an edit card: "Yes, move it" for a day change, and so on. */
export function primaryLabel(change: EntityCardChange): string {
  switch (change.field) {
    case 'due_day':
      return 'Yes, move it';
    case 'due_time':
      return 'Yes, change the time';
    case 'name':
      return 'Yes, rename it';
    case 'completed':
      return 'Yes, mark it done';
    case 'body_add':
      return 'Yes, add it';
    default:
      return 'Yes, change it';
  }
}

/** The Save items pill wording for an edit proposed by extraction. */
export function editPillTitle(item: {
  entity_title: string;
  entity_type?: string;
  field: string;
  to: string;
}): string {
  const type = (item.entity_type as EntityCardEntity['type']) || 'todo';
  if (item.field === 'body_add') return `Add to ${item.entity_title}`;
  const c = describeChange(
    { id: '', type, title: item.entity_title },
    { field: item.field as EntityCardChange['field'], from: null, to: item.to },
  );
  return `Update ${item.entity_title} to ${c.to}`;
}

export interface AppliedChange {
  /** What the item was before, enough to undo. */
  revert: () => Promise<void>;
  /** Plain words for the closing line: "Dentist is now Thu 1 Oct, 2:00pm." */
  summary: string;
  /** The item as it reads after the change, for the card's updated state. */
  entity: EntityCardEntity;
}

/** The item as it reads once a change is applied; also used to draw an applied card after a restart. */
export function entityAfterChange(
  entity: EntityCardEntity,
  change: EntityCardChange,
): EntityCardEntity {
  switch (change.field) {
    case 'due_day':
      return { ...entity, due_day: change.to, target_date: change.to };
    case 'due_time':
      return { ...entity, due_time: change.to };
    case 'name':
      return { ...entity, title: change.to };
    case 'frequency':
      return { ...entity, frequency: change.to };
    default:
      return entity;
  }
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
  const after = entityAfterChange(entity, change);

  if (entity.type === 'todo') {
    const todo = store.todos.find((t) => t.id === entity.id);
    if (!todo) throw new Error('That todo is no longer here.');
    const title = todo.name || todo.title;
    if (change.field === 'completed') {
      await store.completeTodo(todo.id);
      return {
        revert: () => store.uncompleteTodo(todo.id),
        summary: `${title} is done.`,
        entity: after,
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
      summary: change.field === 'name' ? `Renamed to ${words.to}.` : `${title} is now ${words.to}.`,
      entity: after,
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
      entity: after,
    };
  }

  // notes: a title, a body, and for appointments and events a day and a time
  const note = store.notes.find((n) => n.id === entity.id);
  if (!note) throw new Error('That note is no longer here.');
  const views = (note.views as Record<string, unknown> | undefined) ?? undefined;
  const before = {
    title: note.title ?? null,
    body: note.body ?? null,
    target_date: note.target_date ?? null,
    event_time: note.event_time ?? null,
    views,
  };
  // MindDrop keeps a copy of a note's day and time in views; keep it in step
  const withViews = (patch: Record<string, unknown>) =>
    views && ('target_date' in views || 'event_time' in views)
      ? { ...patch, views: { ...views, ...patch } }
      : patch;
  const updates =
    change.field === 'body'
      ? { body: change.to }
      : change.field === 'body_add'
        ? { body: note.body?.trim() ? `${note.body.trimEnd()}\n\n${change.to}` : change.to }
        : change.field === 'due_day'
          ? withViews({ target_date: change.to })
          : change.field === 'due_time'
            ? withViews({ event_time: change.to })
            : { title: change.to };
  await store.updateNote(note.id, updates as Partial<typeof note>);
  const title = note.title || entity.title;
  return {
    revert: () =>
      useGremlyStore
        .getState()
        .updateNote(
          note.id,
          (change.field === 'body' || change.field === 'body_add'
            ? { body: before.body }
            : change.field === 'due_day'
              ? { target_date: before.target_date, ...(views ? { views } : {}) }
              : change.field === 'due_time'
                ? { event_time: before.event_time, ...(views ? { views } : {}) }
                : { title: before.title }) as Partial<typeof note>,
        ),
    summary:
      change.field === 'body'
        ? 'Note updated.'
        : change.field === 'body_add'
          ? `Added to ${title}.`
          : change.field === 'name'
            ? `Renamed to ${words.to}.`
            : `${title} is now ${words.to}.`,
    entity: after,
  };
}

export function isEditCard(card: EntityCard): card is Extract<EntityCard, { kind: 'edit' }> {
  return card.kind === 'edit';
}

export function isEntityCardMessage(m: SpaceChatMessage): boolean {
  return m.role === 'system' && m.metadata_json?.type === 'entity-card' && !!m.metadata_json?.card;
}

/**
 * The rows a chat list renders, and the card that belongs under each of
 * Gremly's replies. A card is persisted as its own system message right after
 * the reply it came with; on screen it lives inside that reply, so the list
 * shows one row for the two. A card with no reply before it stays a row.
 */
export function foldEntityCards(messages: SpaceChatMessage[]): {
  rows: SpaceChatMessage[];
  cardFor: Map<string, SpaceChatMessage>;
} {
  const rows: SpaceChatMessage[] = [];
  const cardFor = new Map<string, SpaceChatMessage>();
  for (const m of messages) {
    if (isEntityCardMessage(m)) {
      const prev = rows[rows.length - 1];
      if (prev && prev.role === 'assistant' && !cardFor.has(prev.id)) {
        cardFor.set(prev.id, m);
        continue;
      }
    }
    rows.push(m);
  }
  return { rows, cardFor };
}

/**
 * The item the user was last shown a card for in this chat, sent with the next
 * message so a follow up like "move it to Friday" can mean it. A card the user
 * turned down, or a list they have not picked from, gives nothing.
 */
export function recentEntityFor(messages: SpaceChatMessage[]): RecentEntity | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!isEntityCardMessage(m)) continue;
    const meta = m.metadata_json as {
      card: EntityCard;
      status?: EntityCardStatus;
      summary?: string | null;
    };
    if (meta.status === 'declined') return null;
    if (meta.card.kind === 'choose') return null;
    const e = meta.card.entity;
    return {
      id: e.id,
      type: e.type,
      title: e.title,
      due_day: e.due_day ?? null,
      due_time: e.due_time ?? null,
      frequency: e.frequency ?? null,
      space_id: e.space_id ?? null,
      status: meta.status || 'pending',
      summary: meta.summary ?? null,
    };
  }
  return null;
}
