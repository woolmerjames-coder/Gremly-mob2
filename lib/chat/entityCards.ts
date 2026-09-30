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
import { recordChange, type ChangeSource } from './changeHistory';
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

/** Several days in one phrase: "Mon 28 Sep and today". */
export function formatDays(days: string[]): string {
  const words = days.map((d, i) => {
    const w = formatDay(d);
    return i > 0 && (w === 'Today' || w === 'Tomorrow') ? w.toLowerCase() : w;
  });
  if (words.length < 2) return words[0] || '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The days a check-in logs: all of them when the card names several. */
export function loggedDaysOf(change: EntityCardChange): string[] {
  return change.days?.length ? change.days : [change.to];
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
      return entity.type === 'todo'
        ? { from: 'Current notes', to: change.to, label: 'Add to its notes' }
        : { from: 'Current note', to: change.to, label: 'Add to note' };
    case 'completed':
      return { from: 'Open', to: 'Done', label: 'Mark as' };
    case 'logged':
      return { from: 'Not logged', to: formatDays(loggedDaysOf(change)), label: 'Log for' };
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
    case 'logged':
      return 'Yes, log it';
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

export interface ApplyChangeOptions {
  /** Where the yes came from, for the item's history. Chat unless said. */
  source?: ChangeSource;
  /** A time that came with the day change just made: one line in the history, not two. */
  sameChange?: boolean;
}

/**
 * Apply a confirmed edit through the store. Resolves with an undo function.
 * Throws when the item no longer exists. The change goes into the item's
 * history (lib/chat/changeHistory) in the same write, and Undo takes it out;
 * marking done and habit check-ins are not history, the item shows those.
 */
export async function applyEntityChange(
  entity: EntityCardEntity,
  change: EntityCardChange,
  opts: ApplyChangeOptions = {},
): Promise<AppliedChange> {
  const store = useGremlyStore.getState();
  const source = opts.source ?? 'chat';
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
      body: todo.body ?? null,
    };
    const updates =
      change.field === 'due_day'
        ? { due_day: change.to, due_date: change.to }
        : change.field === 'due_time'
          ? { due_time: change.to }
          : change.field === 'body_add'
            ? { body: todo.body?.trim() ? `${todo.body.trimEnd()}\n\n${change.to}` : change.to }
            : { name: change.to, title: change.to };
    const history = recordChange(todo.views, entity, change, source, todo.body, opts.sameChange);
    await store.updateTodo(todo.id, { ...updates, views: history.views });
    return {
      revert: () => {
        const now = useGremlyStore.getState();
        const current = now.todos.find((t) => t.id === todo.id)?.views ?? history.views;
        return now.updateTodo(todo.id, {
          ...(change.field === 'due_day'
            ? { due_day: before.due_day, due_date: before.due_date }
            : change.field === 'due_time'
              ? { due_time: before.due_time }
              : change.field === 'body_add'
                ? { body: before.body }
                : { name: before.name, title: before.title }),
          views: history.undo(current),
        });
      },
      summary:
        change.field === 'name'
          ? `Renamed to ${words.to}.`
          : change.field === 'body_add'
            ? `Added to ${title}.`
            : `${title} is now ${words.to}.`,
      entity: after,
    };
  }

  if (entity.type === 'habit') {
    const habit = store.habits.find((h) => h.id === entity.id);
    if (!habit) throw new Error('That habit is no longer here.');
    if (change.field === 'logged') {
      // a check-in for each day they said; the store ignores a day already logged
      const days = loggedDaysOf(change);
      for (const day of days) await store.logHabitCompletionForDate(habit.id, day);
      return {
        revert: async () => {
          const now = useGremlyStore.getState();
          for (const day of days) await now.removeHabitCompletionForDate(habit.id, day);
        },
        summary: `Logged ${habit.name} for ${formatDays(days)}.`,
        entity: after,
      };
    }
    const before = { name: habit.name, frequency: habit.frequency };
    const updates = change.field === 'frequency' ? { frequency: change.to } : { name: change.to };
    const history = recordChange(habit.views, entity, change, source, habit.notes, opts.sameChange);
    await store.updateHabit(habit.id, { ...updates, views: history.views });
    return {
      revert: () => {
        const now = useGremlyStore.getState();
        const current = now.habits.find((h) => h.id === habit.id)?.views ?? history.views;
        return now.updateHabit(habit.id, {
          ...(change.field === 'frequency'
            ? { frequency: before.frequency }
            : { name: before.name }),
          views: history.undo(current),
        });
      },
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
  };
  // MindDrop keeps a copy of a note's day and time in views; keep it in step
  const withViews = (patch: Record<string, unknown>) =>
    views && ('target_date' in views || 'event_time' in views)
      ? { ...patch, views: { ...views, ...patch } }
      : patch;
  const fieldUpdates: Record<string, unknown> =
    change.field === 'body'
      ? { body: change.to }
      : change.field === 'body_add'
        ? { body: note.body?.trim() ? `${note.body.trimEnd()}\n\n${change.to}` : change.to }
        : change.field === 'due_day'
          ? withViews({ target_date: change.to })
          : change.field === 'due_time'
            ? withViews({ event_time: change.to })
            : { title: change.to };
  const history = recordChange(
    fieldUpdates.views ?? views,
    entity,
    change,
    source,
    note.body,
    opts.sameChange,
  );
  const updates = { ...fieldUpdates, views: history.views };
  await store.updateNote(note.id, updates as Partial<typeof note>);
  const title = note.title || entity.title;
  // Undo puts back MindDrop's copy of the day or time as it was, and takes the
  // history line out, leaving anything else in views that changed since
  const viewsCopyBack = (key: 'target_date' | 'event_time') =>
    views && key in views ? { [key]: views[key] } : {};
  return {
    revert: () => {
      const now = useGremlyStore.getState();
      const current = now.notes.find((n) => n.id === note.id)?.views ?? history.views;
      const undone = history.undo(current);
      return now.updateNote(note.id, {
        ...(change.field === 'body' || change.field === 'body_add'
          ? { body: before.body, views: undone }
          : change.field === 'due_day'
            ? {
                target_date: before.target_date,
                views: { ...undone, ...viewsCopyBack('target_date') },
              }
            : change.field === 'due_time'
              ? {
                  event_time: before.event_time,
                  views: { ...undone, ...viewsCopyBack('event_time') },
                }
              : { title: before.title, views: undone }),
      } as Partial<typeof note>);
    },
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
 * message so a follow up like "move it to Friday" can mean it, with what became
 * of it (tapped, undone, turned down, still waiting) and how many messages ago.
 * A list they have not picked from gives nothing.
 */
export function recentEntityFor(messages: SpaceChatMessage[]): RecentEntity | null {
  let turnsAgo = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user') turnsAgo++;
    if (!isEntityCardMessage(m)) continue;
    const meta = m.metadata_json as {
      card: EntityCard;
      status?: EntityCardStatus;
      summary?: string | null;
    };
    if (meta.card.kind === 'choose') return null;
    return {
      ...declinedOrShown(
        meta.card.entity,
        meta.status || 'pending',
        meta.summary ?? null,
        turnsAgo,
      ),
      card:
        meta.card.kind === 'edit'
          ? { kind: 'edit' }
          : {
              kind: 'view',
              intent: meta.card.intent ?? null,
              already: !!meta.card.already,
            },
    };
  }
  return null;
}

/**
 * The most recent card still waiting for a tap that proposes exactly this
 * change to this item. Saying yes in words to an offer means that card, so the
 * app taps it rather than showing the same card twice.
 */
export function pendingTwinOf(
  messages: SpaceChatMessage[],
  card: EntityCard,
): SpaceChatMessage | null {
  if (card.kind !== 'edit') return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!isEntityCardMessage(m)) continue;
    const meta = m.metadata_json as { card: EntityCard; status?: EntityCardStatus };
    if (meta.card.kind !== 'edit') return null;
    if ((meta.status || 'pending') !== 'pending') return null;
    const same =
      meta.card.entity.id === card.entity.id &&
      meta.card.change.field === card.change.field &&
      String(meta.card.change.to) === String(card.change.to);
    return same ? m : null;
  }
  return null;
}

/**
 * A card found after the reply (late) repeats too easily, because the
 * extraction reads the whole conversation each turn: a change this chat
 * already had a card for, whatever became of it (tapped, turned down or
 * still waiting), is not shown again. An add-to counts by item, since the
 * words differ each time; any other change counts by item, field and value.
 * Only an explicit ask (a matcher card) can repeat those.
 */
export function lateCardAlreadyShown(messages: SpaceChatMessage[], card: EntityCard): boolean {
  if (card.kind !== 'edit' || !card.late) return false;
  return messages.some((m) => {
    if (!isEntityCardMessage(m)) return false;
    const c = (m.metadata_json as { card: EntityCard }).card;
    return (
      c.kind === 'edit' &&
      c.entity.id === card.entity.id &&
      c.change.field === card.change.field &&
      (card.change.field === 'body_add' || String(c.change.to) === String(card.change.to))
    );
  });
}

/** A RecentEntity for a card the user has just acted on, before the message state catches up. */
export function declinedOrShown(
  e: EntityCardEntity,
  status: EntityCardStatus,
  summary: string | null = null,
  turnsAgo = 0,
): RecentEntity {
  return {
    id: e.id,
    type: e.type,
    title: e.title,
    due_day: e.due_day ?? null,
    due_time: e.due_time ?? null,
    frequency: e.frequency ?? null,
    space_id: e.space_id ?? null,
    status,
    summary,
    turns_ago: turnsAgo,
  };
}
