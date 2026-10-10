/**
 * Entity card in chat: the words on the card, applying and undoing the change
 * the user confirmed, and the two bits of bookkeeping the chat screens share.
 *
 * The worker proposes (lib/types EntityCard); applying goes through the
 * change model (lib/changes), only when the user tapped, and through the
 * Zustand store's own update actions, so the usual sync, optimistic update
 * and rollback apply.
 *
 * Mockup is spec (Entity Card in Chat canvas, September 2026): the card sits
 * inside Gremly's message, one tap either way, a plain closing line with Undo.
 */
import type { ChangeSource } from './changeHistory';
import { applyChange } from '../changes/apply';
import { fromEntityCard } from '../changes/fromLegacy';
import { checkChange } from '../changes/model';
import { contextFor, findItem } from '../changes/snapshot';
import type {
  EntityCard,
  EntityCardChange,
  EntityCardEntity,
  EntityCardStatus,
  RecentEntity,
  SpaceChatMessage,
} from '../types';

export { formatDay, formatDays, formatTime, type DayWordsOptions } from './dayWords';
import { formatDay, formatDays, formatTime, type DayWordsOptions } from './dayWords';

/** The days a check-in logs: all of them when the card names several. */
export function loggedDaysOf(change: EntityCardChange): string[] {
  return change.days?.length ? change.days : [change.to];
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
 * One line under the title: the kind and when it is, "Note · Thu 1 Oct,
 * 2:00pm". An edit card shows the dates in its change row, so it asks for the
 * short form.
 */
export function entitySubtitle(
  entity: EntityCardEntity,
  opts: { withWhen?: boolean } = {},
): string {
  const parts = [entityKind(entity)];
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
  opts: DayWordsOptions = {},
): { from: string; to: string; label: string } {
  const dayWords = (d: string | null | undefined) => formatDay(d, opts);
  switch (change.field) {
    case 'due_day': {
      // keep the time with the day, as the mock does, so the row reads as a whole
      const time = formatTime(entity.due_time);
      const withTime = (day: string) => (day && time ? `${day}, ${time}` : day);
      return {
        from: withTime(dayWords(change.from)) || 'No day',
        to: withTime(dayWords(change.to)),
        label: 'Change to',
      };
    }
    case 'due_time': {
      const day = dayWords(entity.due_day ?? entity.target_date);
      const withDay = (t: string) => (day && t ? `${day}, ${t}` : t);
      return {
        from: withDay(formatTime(change.from)) || 'No time',
        to: withDay(formatTime(change.to)),
        label: 'Change to',
      };
    }
    case 'target_date': {
      // a todo's deadline: Due Fri, as the card's meta line reads it
      const due = (d: string | null | undefined) => {
        const w = dayWords(d);
        return w ? `Due ${w === 'Today' || w === 'Tomorrow' ? w.toLowerCase() : w}` : '';
      };
      return {
        from: due(change.from) || 'No deadline',
        to: due(change.to),
        label: 'Move the deadline to',
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
      return { from: 'Not logged', to: formatDays(loggedDaysOf(change), opts), label: 'Log for' };
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
    case 'target_date':
      return 'Move the deadline';
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
    case 'target_date':
      return { ...entity, target_date: change.to };
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

/** The closing line kept on the card: names the date, so it is still true tomorrow. */
function closingLine(
  entity: EntityCardEntity,
  change: EntityCardChange,
  item: Record<string, any> | null,
): string {
  const words = describeChange(entity, change, { relative: false });
  const title = (entity.type === 'note' ? item?.title : item?.name || item?.title) || entity.title;
  switch (change.field) {
    case 'completed':
      return `${title} is done.`;
    case 'logged':
      return `Logged ${title} for ${formatDays(loggedDaysOf(change), { relative: false })}.`;
    case 'name':
      return `Renamed to ${words.to}.`;
    case 'target_date':
      return `${title} is now due ${formatDay(change.to, { relative: false })}.`;
    case 'body':
      return 'Note updated.';
    case 'body_add':
      return `Added to ${title}.`;
    default:
      return `${title} is now ${words.to}.`;
  }
}

/**
 * Apply a confirmed edit. Resolves with an undo function. Throws when the
 * item no longer exists or the change can't be made. Goes through the change
 * model (lib/changes): the same checks, writes, history and Undo as every
 * other surface. Marking done and habit check-ins are not history, the item
 * shows those.
 */
export async function applyEntityChange(
  entity: EntityCardEntity,
  change: EntityCardChange,
  opts: ApplyChangeOptions = {},
): Promise<AppliedChange> {
  const after = entityAfterChange(entity, change);
  const raw = fromEntityCard(entity, change);
  const item = findItem(entity.type, entity.id);
  const checked = checkChange(raw, contextFor(raw));
  if (!checked.ok) {
    if (checked.reason === 'no_item') throw new Error(`That ${entity.type} is no longer here.`);
    // already the way they asked: nothing to write and nothing to undo
    if (checked.reason === 'no_change') {
      return { revert: async () => {}, summary: closingLine(entity, change, item), entity: after };
    }
    throw new Error('That change did not go through.');
  }
  const outcome = await applyChange(checked.change, {
    source: opts.source ?? 'chat',
    joinHistory: opts.sameChange,
  });
  if (!outcome.ok) throw new Error(outcome.message);
  return { revert: outcome.revert, summary: closingLine(entity, change, item), entity: after };
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
          ? { kind: 'edit', change: meta.card.change }
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
