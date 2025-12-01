import { isToday, parseISO } from 'date-fns';
import type {
  AppRecord,
  Habit,
  Todo,
  Note,
  ID,
  Space,
  Tag,
  Person,
  EntityType,
  TagsMeta,
} from '../types';
import { genId, nowIso } from '../types';
import { recordZ, spaceInsertSchema, type SpaceInsert } from '../schemas';
import { eventBus } from '../events';
import type {
  IRepo,
  CreateRecordInput,
  UpdateRecordInput,
  GroupedByType,
  ListByTypeOptions,
} from './IRepo';

/**
 * In-memory repository implementation for development and testing.
 * No persistence - data resets on app restart.
 */

const seed = (ownerId: string): AppRecord[] => {
  const createdAt = nowIso();
  const updatedAt = createdAt;

  const h1: Habit = {
    id: genId('habit'),
    type: 'habit',
    name: 'Drink water',
    frequency: 'daily',
    subtype: 'start_habit',
    ai_placed: false,
    why_string: null,
    origin: null,
    tags: null,
    tags_meta: { sticky: [], tombstones: [] },
    created_at: createdAt,
    updated_at: updatedAt,
    owner_id: ownerId,
  };

  const t1: Todo = {
    id: genId('todo'),
    type: 'todo',
    name: 'Call the dentist', // Phase 7+: name is required
    title: 'Call the dentist', // Backwards compatibility
    due_date: null,
    undefined_due: true,
    ai_placed: false,
    why_string: null,
    origin: null,
    tags: null,
    tags_meta: { sticky: [], tombstones: [] },
    created_at: createdAt,
    updated_at: updatedAt,
    owner_id: ownerId,
  };

  const n1: Note = {
    id: genId('note'),
    type: 'note',
    subtype: 'journal',
    title: 'First entry',
    body: 'Kicking off Gremly.',
    ai_placed: false,
    why_string: null,
    origin: null,
    tags: null,
    tags_meta: { sticky: [], tombstones: [] },
    created_at: createdAt,
    updated_at: updatedAt,
    owner_id: ownerId,
  };

  return [h1, t1, n1];
};

function ensureDay(dateIso: string): string {
  return new Date(dateIso).toISOString().split('T')[0];
}

const hasAll = (itemTags: string[] | null | undefined, wanted: string[]) => {
  const set = new Set((itemTags ?? []).map((t) => t.toLowerCase()));
  return wanted.every((w) => set.has(w.toLowerCase()));
};

const normalizeTagsMeta = (meta?: TagsMeta | null): TagsMeta => {
  const toArray = (values?: string[] | null): string[] =>
    Array.isArray(values)
      ? Array.from(
          new Set(
            values
              .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
              .filter(Boolean),
          ),
        )
      : [];

  return {
    sticky: toArray(meta?.sticky ?? null),
    tombstones: toArray(meta?.tombstones ?? null),
  };
};

export class MemoryRepo implements IRepo {
  private data: AppRecord[] = [];
  private spaces: Space[] = [];
  private tags: Tag[] = [];
  private people: Person[] = [];
  private currentUserId: string = 'memory-user';

  // Phase 10.2: Cortex primitives storage
  private cortexPreferences: Map<string, import('./types').CortexPreferences> = new Map();
  private lists: Map<string, import('./types').List> = new Map();
  private listItemsStore: Map<string, import('./types').ListItem> = new Map();
  private events: import('./types').EventLog[] = [];

  // Phase 10.4: Space defaults storage
  private spaceDefaults: Map<string, any> = new Map();

  constructor(userId?: string) {
    this.currentUserId = userId || 'memory-user';
    this.data = seed(this.currentUserId);
  }

  private commit(r: AppRecord) {
    // Ensure shape stays valid
    recordZ.parse(r);
  }

  async create(input: CreateRecordInput): Promise<AppRecord> {
    const now = nowIso();
    // Use provided owner_id or fall back to currentUserId
    const ownerId = input.owner_id || this.currentUserId;
    let rec: AppRecord;

    if (input.type === 'habit') {
      if (!input.frequency) throw new Error('Habit requires frequency');
      if (!input.subtype) throw new Error('Habit requires subtype');
      rec = {
        id: genId('habit'),
        type: 'habit',
        name: (input.name ?? input.title) || 'Untitled Habit', // Support both name and title for transition
        frequency: input.frequency,
        subtype: input.subtype as import('../types').HabitSubtype,
        space_id: input.space_id ?? null,
        ai_placed: !!input.ai_placed,
        created_at: now,
        updated_at: now,
        owner_id: ownerId,
        why_string: input.why_string ?? null,
        origin: input.origin ?? null,
        canonicalType: input.canonicalType,
        labels: input.labels,
        views: input.views,
        drop_id: input.dropId ?? null,
        // Extended habit fields (Phase 7+)
        frequency_value: input.frequency_value,
        reminders: input.reminders,
        notes: input.notes ?? null,
        tags: input.tags ?? null,
        tags_meta: normalizeTagsMeta(input.tags_meta ?? null),
        buddy_id: input.buddy_id ?? null,
        buddy_email: input.buddy_email ?? null,
        stack_with_id: input.stack_with_id ?? null,
        stack_position: input.stack_position ?? null,
        stack_offset_minutes: input.stack_offset_minutes ?? null,
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
        // Break habit specific fields
        taper_plan: input.taper_plan ?? null,
        triggers: input.triggers ?? null,
        replacement_habit_id: input.replacement_habit_id ?? null,
        replacement_text: input.replacement_text ?? null,
      };
    } else if (input.type === 'todo') {
      // Phase 7+: name is the primary required field
      if (!input.name) throw new Error('Todo requires name');
      rec = {
        id: genId('todo'),
        type: 'todo',
        name: input.name,
        title: input.title, // Optional backwards compatibility
        body: input.body,
        space_id: input.space_id ?? null,
        due_date: input.due_date ?? null,
        due_time: input.due_time ?? null, // Phase 7+: HH:mm format
        undefined_due: input.undefined_due ?? undefined, // Optional (legacy)
        subtype: (input.subtype as 'reminder' | 'microproject' | null) ?? null, // AI-only
        reminders: input.reminders ?? null, // ReminderRow[] JSON
        notes: input.notes ?? null, // Additional notes
        tags: input.tags ?? null, // Categories
        tags_meta: normalizeTagsMeta(input.tags_meta ?? null),
        ai_placed: !!input.ai_placed,
        why_string: input.why_string ?? null,
        created_at: now,
        updated_at: now,
        owner_id: ownerId,
        origin: input.origin ?? null,
        canonicalType: input.canonicalType,
        labels: input.labels,
        views: input.views,
        drop_id: input.dropId ?? null,
      };
    } else {
      // note - subtype is optional in database schema (can be null)
      rec = {
        id: genId('note'),
        type: 'note',
        title: input.title,
        body: input.body,
        subtype: (input.subtype as import('../types').NoteSubtype) ?? null,
        space_id: input.space_id ?? null,
        ai_placed: !!input.ai_placed,
        why_string: input.why_string ?? null,
        created_at: now,
        updated_at: now,
        owner_id: ownerId,
        origin: input.origin ?? null,
        canonicalType: input.canonicalType,
        labels: input.labels,
        views: input.views,
        // Journal-specific fields (Phase 7+) - only used when subtype='journal'
        date: input.date ?? null,
        mood: input.mood ?? null,
        fmt: input.fmt ?? null,
        reminders: input.reminders ?? null,
        tags: input.tags ?? null,
        tags_meta: normalizeTagsMeta(input.tags_meta ?? null),
        journal_subtype: input.journal_subtype ?? null,
        source_message_id: input.sourceMessageId ?? null,
        drop_id: input.dropId ?? null,
      };
    }

    this.commit(rec);
    this.data.unshift(rec);

    // Log create operation
    console.log('[REPO_CREATE]', {
      id: rec.id,
      type: rec.type,
      spaceId: rec.space_id,
      title: rec.type === 'habit' || rec.type === 'todo' ? rec.name : rec.title,
    });

    eventBus.emit('ItemSaved', { id: rec.id });

    return rec;
  }

  async update({ id, patch }: UpdateRecordInput): Promise<AppRecord> {
    const idx = this.data.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error('Record not found');

    const original = this.data[idx];
    const merged = { ...original, ...patch, updated_at: nowIso() } as AppRecord;
    if (Object.prototype.hasOwnProperty.call(patch, 'dropId')) {
      (merged as AppRecord & { drop_id?: string | null }).drop_id = (patch as any).dropId ?? null;
      delete (merged as any).dropId;
    }
    if ('tags' in patch) {
      (merged as AppRecord & { tags?: string[] | null }).tags = patch.tags ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'tags_meta')) {
      (merged as AppRecord & { tags_meta?: TagsMeta | null }).tags_meta = normalizeTagsMeta(
        (patch as any).tags_meta ?? null,
      );
    }
    this.commit(merged);
    this.data[idx] = merged;

    // Log update operation with changes
    const changes: any = {};
    if (patch.space_id !== undefined && patch.space_id !== original.space_id) {
      changes.spaceId = { from: original.space_id, to: patch.space_id };
    }
    if (patch.ai_placed !== undefined && patch.ai_placed !== original.ai_placed) {
      changes.ai_placed = { from: original.ai_placed, to: patch.ai_placed };
    }
    if (patch.why_string !== undefined && patch.why_string !== original.why_string) {
      changes.why_string = { from: original.why_string, to: patch.why_string };
    }
    if (patch.archived !== undefined && patch.archived !== original.archived) {
      changes.archived = { from: original.archived, to: patch.archived };
    }

    console.log('[REPO_UPDATE]', { id, changes });

    return merged;
  }

  async remove(id: ID): Promise<void> {
    const item = this.data.find((r) => r.id === id);
    if (item) {
      console.log('[REPO_DELETE]', {
        id,
        reason: 'remove_called',
        type: item.type,
      });
    }
    this.data = this.data.filter((r) => r.id !== id);
  }

  async getById(id: ID): Promise<AppRecord | null> {
    return this.data.find((r) => r.id === id) ?? null;
  }

  async getAll(): Promise<AppRecord[]> {
    return this.data;
  }

  async findNoteBySourceMessageId(sourceMessageId: string): Promise<Note | null> {
    if (!sourceMessageId) return null;
    const match = this.data.find((r): r is Note => {
      if (r.type !== 'note' || r.owner_id !== this.currentUserId) return false;
      return ((r as any).source_message_id ?? null) === sourceMessageId;
    });
    return match ?? null;
  }

  /**
   * Find a todo by its Mind Drop dropId
   * Used to prevent duplicate entity creation when pipeline runs multiple times
   */
  async findTodoByDropId(dropId: string): Promise<Todo | null> {
    if (!dropId) return null;
    const match = this.data.find((r): r is Todo => {
      if (r.type !== 'todo' || r.owner_id !== this.currentUserId) return false;
      return ((r as any).drop_id ?? null) === dropId;
    });
    return match ?? null;
  }

  /**
   * Find a habit by its Mind Drop dropId
   * Used to prevent duplicate entity creation when pipeline runs multiple times
   */
  async findHabitByDropId(dropId: string): Promise<Habit | null> {
    if (!dropId) return null;
    const match = this.data.find((r): r is Habit => {
      if (r.type !== 'habit' || r.owner_id !== this.currentUserId) return false;
      return ((r as any).drop_id ?? null) === dropId;
    });
    return match ?? null;
  }

  async listByType(type: AppRecord['type'], opts?: ListByTypeOptions): Promise<AppRecord[]> {
    let results = this.data.filter((r) => r.type === type && r.owner_id === this.currentUserId);

    // Apply space filter
    if (opts?.unassignedOnly) {
      results = results.filter((r) => r.space_id === null);
    } else if (opts?.spaceId !== undefined) {
      results = results.filter((r) => r.space_id === opts.spaceId);
    }
    // If spaceId is omitted, return all (Everywhere)

    // Apply subtype filter (only for notes)
    if (opts?.subtypes && opts.subtypes.length > 0) {
      results = results.filter((r) => {
        if (r.type === 'note') {
          return opts.subtypes!.includes(r.subtype);
        }
        return true; // Don't filter non-notes
      });
    }

    if (opts?.tagNames && opts.tagNames.length > 0) {
      const wanted = opts.tagNames;
      results = results.filter((r) =>
        hasAll((r as any).tags as string[] | null | undefined, wanted),
      );
    }

    // TODO: Apply tag filter when tagIds is provided
    // For now, tagIds is ignored (stub for future implementation)

    return results;
  }

  async countUnsorted(): Promise<number> {
    return this.data.filter((r) => r.owner_id === this.currentUserId && r.ai_placed === true)
      .length;
  }

  async listBySpace(spaceId: ID, opts?: { tagNames?: string[] }): Promise<AppRecord[]> {
    let items = this.data.filter(
      (r) => r.space_id === spaceId && r.owner_id === this.currentUserId,
    );

    if (opts?.tagNames && opts.tagNames.length > 0) {
      const wanted = opts.tagNames;
      items = items.filter((r) => hasAll((r as any).tags as string[] | null | undefined, wanted));
    }

    return items;
  }

  async search(text: string): Promise<AppRecord[]> {
    const q = text.toLowerCase();
    return this.data.filter((r) => {
      if (r.owner_id !== this.currentUserId) return false;
      // For habits/todos, search in 'name'; for notes, search in 'title'
      const titleMatch =
        r.type === 'habit'
          ? r.name?.toLowerCase().includes(q)
          : r.type === 'todo'
            ? r.name?.toLowerCase().includes(q)
            : r.type === 'note' && r.title?.toLowerCase().includes(q);
      const bodyMatch =
        (r.type === 'todo' || r.type === 'note') && r.body?.toLowerCase().includes(q);
      return titleMatch || bodyMatch;
    });
  }

  async searchInSpace(
    spaceId: ID,
    text: string,
  ): Promise<{ items: AppRecord[]; chats: import('../types').SpaceChat[] }> {
    const items = (await this.search(text)).filter((r) => r.space_id === spaceId);
    // MemoryRepo doesn't store space chats; return empty array for chats
    return { items, chats: [] };
  }

  async listDueToday(_nowIso: string): Promise<AppRecord[]> {
    return this.data.filter((r) => {
      if (r.owner_id !== this.currentUserId) return false;
      if (r.type !== 'todo' && r.type !== 'habit') return false;
      const dueDate = r.type === 'todo' ? r.due_date : null;
      if (!dueDate) return false;
      try {
        return isToday(parseISO(dueDate));
      } catch {
        return false;
      }
    });
  }

  async listUndefinedDue(): Promise<Todo[]> {
    return this.data.filter(
      (r): r is Todo =>
        r.type === 'todo' && r.owner_id === this.currentUserId && r.undefined_due === true,
    );
  }

  async countPlannedToday(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    return this.data.filter((r) => {
      if (r.owner_id !== this.currentUserId) return false;
      if (r.type !== 'todo') return false;
      const dueDate = r.due_date;
      if (!dueDate) return false;
      try {
        return dueDate.startsWith(today);
      } catch {
        return false;
      }
    }).length;
  }

  async countCompletedToday(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    return this.data.filter((r) => {
      if (r.owner_id !== this.currentUserId) return false;
      if (r.type !== 'todo' && r.type !== 'habit') return false;
      const completedAt = (r as any).completed_at;
      if (!completedAt) return false;
      try {
        return completedAt.startsWith(today);
      } catch {
        return false;
      }
    }).length;
  }

  async completeHabit(id: ID, atIso: string): Promise<void> {
    const item = this.data.find((r) => r.id === id && r.owner_id === this.currentUserId);
    if (!item || item.type !== 'habit') throw new Error('Habit not found');
    (item as any).completed_at = atIso;

    // Emit event for UI sync
    eventBus.emit('ItemCompleted', { id, type: 'habit' });
  }

  async completeTodo(id: ID, atIso: string): Promise<void> {
    const item = this.data.find((r) => r.id === id && r.owner_id === this.currentUserId);
    if (!item || item.type !== 'todo') throw new Error('Todo not found');
    (item as any).completed_at = atIso;
    (item as any).status = 'completed';

    // Emit event for UI sync
    eventBus.emit('ItemCompleted', { id, type: 'todo' });
  }

  async undoCompletion(id: ID): Promise<void> {
    const item = this.data.find((r) => r.id === id && r.owner_id === this.currentUserId);
    if (!item) throw new Error('Item not found');
    (item as any).completed_at = null;

    // Emit event for UI sync
    eventBus.emit('ItemUpdated', { id });
  }

  /**
   * Complete a habit for a specific date (for weekly habit tracking).
   */
  async completeHabitForDate(habitId: ID, dateIso: string): Promise<void> {
    const item = this.data.find((r) => r.id === habitId && r.owner_id === this.currentUserId);
    if (!item || item.type !== 'habit') throw new Error('Habit not found');

    const occurredDay = dateIso.split('T')[0];

    // Initialize habit_progress if needed
    if (!(item as any).habit_progress) {
      (item as any).habit_progress = [];
    }

    // Check if already completed for this day
    const existing = (item as any).habit_progress.find(
      (p: { occurred_day: string }) => p.occurred_day === occurredDay,
    );
    if (existing) return;

    // Add progress record
    (item as any).habit_progress.push({
      occurred_day: occurredDay,
      count: 1,
    });

    // Emit event for UI sync
    eventBus.emit('ItemUpdated', { id: habitId });
  }

  /**
   * Silent version of completeHabitForDate - does NOT emit events.
   */
  async completeHabitForDateSilent(habitId: ID, dateIso: string): Promise<void> {
    const item = this.data.find((r) => r.id === habitId && r.owner_id === this.currentUserId);
    if (!item || item.type !== 'habit') throw new Error('Habit not found');

    const occurredDay = dateIso.split('T')[0];

    if (!(item as any).habit_progress) {
      (item as any).habit_progress = [];
    }

    const already = (item as any).habit_progress.some(
      (p: { occurred_day: string }) => p.occurred_day === occurredDay,
    );
    if (already) return;

    (item as any).habit_progress.push({
      occurred_day: occurredDay,
      count: 1,
    });
    // No event emission
  }

  /**
   * Remove a habit completion for a specific date (for weekly habit tracking).
   */
  async removeHabitCompletion(habitId: ID, dateIso: string): Promise<void> {
    const item = this.data.find((r) => r.id === habitId && r.owner_id === this.currentUserId);
    if (!item || item.type !== 'habit') throw new Error('Habit not found');

    const occurredDay = dateIso.split('T')[0];

    if (!(item as any).habit_progress) return;

    // Remove progress record for this day
    (item as any).habit_progress = (item as any).habit_progress.filter(
      (p: { occurred_day: string }) => p.occurred_day !== occurredDay,
    );

    // Emit event for UI sync
    eventBus.emit('ItemUpdated', { id: habitId });
  }

  /**
   * Silent version of removeHabitCompletion - does NOT emit events.
   */
  async removeHabitCompletionSilent(habitId: ID, dateIso: string): Promise<void> {
    const item = this.data.find((r) => r.id === habitId && r.owner_id === this.currentUserId);
    if (!item || item.type !== 'habit') throw new Error('Habit not found');

    const occurredDay = dateIso.split('T')[0];

    if (!(item as any).habit_progress) return;

    (item as any).habit_progress = (item as any).habit_progress.filter(
      (p: { occurred_day: string }) => p.occurred_day !== occurredDay,
    );
    // No event emission
  }

  // =======================================================
  // Phase 10.9 (Today v3) — New helpers
  // =======================================================

  async listTodayMerged(nowIso: string): Promise<
    Array<
      | {
          type: 'todo';
          id: ID;
          name: string;
          due_date?: string | null;
          due_day?: string | null;
          space_id?: ID | null;
          tags?: string[];
          status?: 'active' | 'completed' | 'archived';
          carry_forward?: boolean;
          overdue?: boolean;
          nearDue?: boolean;
          commitment?: boolean;
        }
      | {
          type: 'habit';
          id: ID;
          name: string;
          space_id?: ID | null;
          tags?: string[];
          cadence?: 'day' | 'week' | 'month';
          target_count?: number;
          period_unit?: 'day' | 'week' | 'month';
          time_window?: 'any' | 'morning' | 'midday' | 'evening';
          progress_today?: number;
          commitment?: boolean;
        }
    >
  > {
    const day = ensureDay(nowIso);
    const now = new Date(nowIso);

    const activeTodos = this.data.filter((r) => {
      if (r.owner_id !== this.currentUserId) return false;
      if (r.type !== 'todo') return false;
      const carry = (r as any).carry_forward === true;
      const dueDay = r.due_date ? ensureDay(r.due_date) : null;
      const status = ((r as any).status ?? 'active') as 'active' | 'completed' | 'archived';
      const completedAt = (r as any).completed_at as string | null | undefined;
      if (status === 'completed' || completedAt) return false;
      return dueDay === day || carry;
    });

    const completedTodos = this.data.filter((r) => {
      if (r.owner_id !== this.currentUserId) return false;
      if (r.type !== 'todo') return false;
      const completedAt = (r as any).completed_at as string | null | undefined;
      if (!completedAt) return false;
      return ensureDay(completedAt) === day;
    });

    const mapTodo = (t: any) => {
      let overdue = false;
      let nearDue = false;
      if (t.due_date) {
        const due = new Date(t.due_date);
        if (!Number.isNaN(due.getTime())) {
          overdue = due < now;
          nearDue = !overdue && due.getTime() - now.getTime() < 3 * 60 * 60 * 1000;
        }
      }
      const completedAt = (t as any).completed_at ?? null;
      const status = completedAt
        ? 'completed'
        : ((t.status ?? 'active') as 'active' | 'completed' | 'archived');
      return {
        type: 'todo' as const,
        id: t.id,
        name: t.name,
        due_date: t.due_date ?? null,
        due_day: t.due_date ? ensureDay(t.due_date) : null,
        space_id: t.space_id ?? null,
        tags: [],
        status,
        carry_forward: !!t.carry_forward,
        overdue,
        nearDue,
        completed_at: completedAt,
        commitment: (t as any).commitment === true,
      };
    };

    const todoItems = [...activeTodos, ...completedTodos].map(mapTodo);

    const habits = this.data.filter(
      (r) => r.owner_id === this.currentUserId && r.type === 'habit',
    ) as Array<
      Habit &
        Partial<{
          target_count: number;
          period_unit: 'day' | 'week' | 'month';
          time_window: 'any' | 'morning' | 'midday' | 'evening';
          cadence: 'day' | 'week' | 'month';
        }>
    >;

    const progressRows = ((this as any)._habitProgress || []) as Array<{
      habit_id: string;
      occurred_day: string;
      count: number;
      occurred_at?: string;
    }>;

    const progressByHabit = new Map<string, { total: number; latestAt: string | null }>();
    for (const row of progressRows) {
      if (row.occurred_day === day) {
        const current = progressByHabit.get(row.habit_id) || { total: 0, latestAt: null };
        let latestAt = current.latestAt;
        if (row.occurred_at) {
          if (!latestAt) {
            latestAt = row.occurred_at;
          } else if (new Date(row.occurred_at).getTime() > new Date(latestAt).getTime()) {
            latestAt = row.occurred_at;
          }
        }
        progressByHabit.set(row.habit_id, {
          total: current.total + (row.count ?? 1),
          latestAt,
        });
      }
    }

    const habitItems = habits.map((h) => {
      const target = Math.max(1, (h as any).target_count ?? 1);
      const info = progressByHabit.get(h.id) || { total: 0, latestAt: null };
      const done = info.total;
      const status: 'active' | 'completed' = done >= target && done > 0 ? 'completed' : 'active';
      return {
        type: 'habit' as const,
        id: h.id,
        name: h.name,
        space_id: h.space_id ?? null,
        tags: (h as any).tags ?? [],
        cadence: ((h as any).cadence as any) ?? 'day',
        target_count: target,
        period_unit: ((h as any).period_unit as any) ?? 'day',
        time_window: ((h as any).time_window as any) ?? 'any',
        progress_today: done,
        status,
        completed_at: status === 'completed' ? info.latestAt : null,
        commitment: (h as any).commitment === true,
      };
    });

    return [...habitItems, ...todoItems];
  }

  async logHabitProgress(
    habitId: ID,
    atIso?: string,
    count = 1,
    occurrenceIndex?: number,
  ): Promise<void> {
    const day = ensureDay(atIso ?? new Date().toISOString());
    (this as any)._habitProgress = (this as any)._habitProgress || [];
    (this as any)._habitProgress.push({
      id: `hp_${Date.now()}`,
      owner_id: this.currentUserId,
      habit_id: habitId,
      occurred_at: atIso ?? new Date().toISOString(),
      occurred_day: day,
      count,
      occurrence_index: occurrenceIndex ?? null,
    });
  }

  async getHabitProgressForDate(habitId: ID, dayIso: string): Promise<number> {
    const day = ensureDay(dayIso);
    const rows = ((this as any)._habitProgress || []) as Array<{
      owner_id: string;
      habit_id: string;
      occurred_day: string;
      count: number;
    }>;
    return rows
      .filter(
        (row) =>
          row.owner_id === this.currentUserId &&
          row.habit_id === habitId &&
          row.occurred_day === day,
      )
      .reduce((sum, row) => sum + (row.count ?? 1), 0);
  }

  async getHabitProgressForWeek(
    habitId: ID,
    weekStartIso: string,
    weekEndIso: string,
  ): Promise<number> {
    const weekStart = ensureDay(weekStartIso);
    const weekEnd = ensureDay(weekEndIso);
    const rows = ((this as any)._habitProgress || []) as Array<{
      owner_id: string;
      habit_id: string;
      occurred_day: string;
      count: number;
    }>;
    return rows
      .filter(
        (row) =>
          row.owner_id === this.currentUserId &&
          row.habit_id === habitId &&
          row.occurred_day >= weekStart &&
          row.occurred_day <= weekEnd,
      )
      .reduce((sum, row) => sum + (row.count ?? 1), 0);
  }

  async getHabitProgressDates(
    habitId: ID,
    weekStartIso: string,
    weekEndIso: string,
  ): Promise<string[]> {
    const weekStart = ensureDay(weekStartIso);
    const weekEnd = ensureDay(weekEndIso);
    const rows = ((this as any)._habitProgress || []) as Array<{
      owner_id: string;
      habit_id: string;
      occurred_day: string;
      count: number;
    }>;
    return rows
      .filter(
        (row) =>
          row.owner_id === this.currentUserId &&
          row.habit_id === habitId &&
          row.occurred_day >= weekStart &&
          row.occurred_day <= weekEnd,
      )
      .map((row) => row.occurred_day);
  }

  async getFocusForDate(dayIso: string): Promise<{
    id: ID;
    entry_id: ID | null;
    entry_type: 'todo' | 'habit' | 'note' | null;
    source: 'auto' | 'user' | 'carry_forward';
    created_at: string;
    expires_at: string;
  } | null> {
    const day = ensureDay(dayIso);
    const rows = ((this as any)._focusCards || []) as Array<{
      id: ID;
      owner_id: string;
      entry_id: ID | null;
      entry_type: 'todo' | 'habit' | 'note' | null;
      source: 'auto' | 'user' | 'carry_forward';
      created_at: string;
      expires_at: string;
      focus_day: string;
    }>;

    const matches = rows.filter(
      (row) => row.owner_id === this.currentUserId && row.focus_day === day,
    );
    if (matches.length === 0) return null;

    const latest = matches[matches.length - 1];
    return {
      id: latest.id,
      entry_id: latest.entry_id,
      entry_type: latest.entry_type,
      source: latest.source,
      created_at: latest.created_at,
      expires_at: latest.expires_at,
    };
  }

  async setFocus(params: {
    entry_id: ID | null;
    entry_type: 'todo' | 'habit' | 'note' | null;
    source: 'auto' | 'user' | 'carry_forward';
    expires_at: string;
  }): Promise<void> {
    const day = ensureDay(params.expires_at);
    (this as any)._focusCards = (this as any)._focusCards || [];
    const cards = (this as any)._focusCards as Array<any>;
    (this as any)._focusCards = cards.filter(
      (row) => !(row.owner_id === this.currentUserId && row.focus_day === day),
    );
    (this as any)._focusCards.push({
      id: `fc_${Date.now()}`,
      owner_id: this.currentUserId,
      entry_id: params.entry_id,
      entry_type: params.entry_type,
      source: params.source,
      created_at: new Date().toISOString(),
      expires_at: params.expires_at,
      focus_day: day,
    });
  }

  async clearFocusForDate(dayIso: string): Promise<void> {
    const day = ensureDay(dayIso);
    (this as any)._focusCards = (this as any)._focusCards || [];
    (this as any)._focusCards = ((this as any)._focusCards as Array<any>).filter(
      (row) => !(row.owner_id === this.currentUserId && row.focus_day === day),
    );
  }

  async topFocusCandidates(
    limit: number,
  ): Promise<Array<{ id: ID; type: 'habit' | 'todo'; priority: number }>> {
    const day = ensureDay(new Date().toISOString());

    const todos = this.data
      .filter(
        (r): r is Todo & { status?: string; carry_forward?: boolean } =>
          r.owner_id === this.currentUserId && r.type === 'todo',
      )
      .map((todo) => ({
        id: todo.id as ID,
        type: 'todo' as const,
        priority:
          ((todo as any).carry_forward ? 100 : 0) +
          (todo.due_date && ensureDay(todo.due_date) === day ? 50 : 0),
        status: (todo as any).status ?? 'active',
      }))
      .filter((candidate) => candidate.status === 'active')
      .map(({ status: _status, ...rest }) => rest);

    const habits = this.data
      .filter((r) => r.owner_id === this.currentUserId && r.type === 'habit')
      .map((habit) => ({
        id: habit.id as ID,
        type: 'habit' as const,
        priority: 40,
      }));

    const combined = [...todos, ...habits];
    combined.sort((a, b) => b.priority - a.priority);
    return combined.slice(0, limit);
  }

  async listRecentDrops(
    sinceIso: string,
  ): Promise<Array<{ id: ID; title?: string | null; body?: string | null; created_at: string }>> {
    return this.data
      .filter(
        (row): row is Note & { created_at: string } =>
          row.owner_id === this.currentUserId &&
          row.type === 'note' &&
          !!row.created_at &&
          row.created_at >= sinceIso,
      )
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .slice(0, 100)
      .map((row) => ({
        id: row.id,
        title: (row as any).title,
        body: (row as any).body,
        created_at: row.created_at!,
      }));
  }

  async getTodaySummary(): Promise<{ completed: number; remaining: number }> {
    const day = ensureDay(new Date().toISOString());

    const completed = this.data.filter((row) => {
      if (row.owner_id !== this.currentUserId || row.type !== 'todo') return false;
      const completedAt = (row as any).completed_at;
      return typeof completedAt === 'string' && completedAt.startsWith(day);
    }).length;

    const remaining = this.data.filter((row) => {
      if (row.owner_id !== this.currentUserId || row.type !== 'todo') return false;
      const status = ((row as any).status ?? 'active') as string;
      if (status !== 'active') return false;
      const dueDay = row.due_date ? ensureDay(row.due_date) : null;
      return dueDay === day || (row as any).carry_forward === true;
    }).length;

    return { completed, remaining };
  }

  async sweepApplyAction(
    id: ID,
    type: 'habit' | 'todo',
    action: 'archive' | 'carry_forward' | 'keep',
    details?: { archived_reason?: string },
  ): Promise<void> {
    if (type !== 'todo') return;

    const record = this.data.find(
      (row) => row.id === id && row.owner_id === this.currentUserId && row.type === 'todo',
    ) as
      | (Todo & { status?: string; carry_forward?: boolean; archived_reason?: string })
      | undefined;

    if (!record) return;

    if (action === 'archive') {
      record.status = 'archived';
      record.archived_reason = details?.archived_reason ?? 'swept';
      return;
    }

    if (action === 'carry_forward') {
      record.carry_forward = true;
      return;
    }

    // keep -> no action
  }

  /**
   * Archive all entities (notes, todos, habits) that share the same drop_id.
   *
   * Memory repo implementation aligned with Supabase schema:
   * - notes: Set archived = true (soft delete)
   * - todos: Set completed_at (soft delete)
   * - habits: Set completed_at (soft delete)
   */
  async archiveItemsByDropId(
    dropId: string,
    archivedReason = 'user_deleted_drop',
  ): Promise<{ notesArchived: number; todosArchived: number; habitsArchived: number }> {
    const nowIso = new Date().toISOString();
    let notesArchived = 0;
    let todosArchived = 0;
    let habitsArchived = 0;

    this.data.forEach((record) => {
      if (record.owner_id === this.currentUserId && (record as any).drop_id === dropId) {
        if (record.type === 'todo') {
          // Todos: soft delete by setting completed_at + status (only if not already completed)
          if (!(record as any).completed_at) {
            (record as any).completed_at = nowIso;
            (record as any).status = 'archived'; // Set status if column exists
            todosArchived++;
          }
        } else if (record.type === 'habit') {
          // Habits: soft delete by setting completed_at (only if not already completed)
          if (!(record as any).completed_at) {
            (record as any).completed_at = nowIso;
            habitsArchived++;
          }
        } else if (record.type === 'note') {
          // Notes: soft delete by setting archived = true
          if (!(record as any).archived) {
            (record as any).archived = true;
            notesArchived++;
          }
        }
      }
    });

    return { notesArchived, todosArchived, habitsArchived };
  }

  async countActiveCommitments(): Promise<number> {
    return this.data.filter(
      (row) => row.owner_id === this.currentUserId && (row as any).commitment === true,
    ).length;
  }

  async listCommitments(): Promise<
    Array<{
      id: ID;
      type: 'habit' | 'todo';
      name: string;
      commitment_started_at?: string | null;
      commitment_note?: string | null;
    }>
  > {
    return this.data
      .filter(
        (row): row is Habit | Todo =>
          (row.type === 'habit' || row.type === 'todo') &&
          row.owner_id === this.currentUserId &&
          (row as any).commitment === true,
      )
      .map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        commitment_started_at: (row as any).commitment_started_at ?? null,
        commitment_note: (row as any).commitment_note ?? null,
      }));
  }

  async addCommitment(id: ID, type: 'habit' | 'todo', note?: string | null): Promise<void> {
    const idx = this.data.findIndex(
      (row) => row.id === id && row.type === type && row.owner_id === this.currentUserId,
    );
    if (idx < 0) throw new Error('Record not found for commitment');

    const record = this.data[idx] as Habit | Todo;
    if ((record as any).commitment === true) {
      if (note !== undefined && (record as any).commitment_note !== note) {
        const now = nowIso();
        const updated = {
          ...record,
          commitment_note: note ?? null,
          updated_at: now,
        } as AppRecord;
        this.commit(updated);
        this.data[idx] = updated;
      }
      return;
    }

    const current = await this.countActiveCommitments();
    if (current >= 3) {
      throw new Error('MAX_COMMITMENTS_REACHED');
    }

    const now = nowIso();
    const updated = {
      ...record,
      commitment: true,
      commitment_started_at: now,
      commitment_note: note ?? null,
      commitment_archived_at: null,
      updated_at: now,
    } as AppRecord;

    this.commit(updated);
    this.data[idx] = updated;
    console.log('[REPO_COMMITMENT_ADD]', { id, type });
  }

  async removeCommitment(id: ID, type: 'habit' | 'todo', reason?: string | null): Promise<void> {
    const idx = this.data.findIndex(
      (row) => row.id === id && row.type === type && row.owner_id === this.currentUserId,
    );
    if (idx < 0) throw new Error('Record not found for commitment removal');

    const record = this.data[idx] as Habit | Todo;
    if (!(record as any).commitment) return;

    const now = nowIso();
    const updated = {
      ...record,
      commitment: false,
      commitment_archived_at: now,
      commitment_note: reason ?? (record as any).commitment_note ?? null,
      updated_at: now,
    } as AppRecord;

    this.commit(updated);
    this.data[idx] = updated;
    console.log('[REPO_COMMITMENT_REMOVE]', { id, type, reason });
  }

  async addUnsorted(spaceId: ID | null, input: CreateRecordInput): Promise<AppRecord> {
    // Force ai_placed and origin while preserving provided fields
    return this.create({
      ...input,
      space_id: spaceId ?? null,
      ai_placed: true,
      origin: 'catchall',
    });
  }

  /**
   * Phase 1: Create unsorted Mind Drop note before AI classification.
   * Always creates a note with catchall subtype and ai_pending flag.
   */
  async createUnsortedDrop(
    text: string,
    opts?: {
      spaceId?: ID | null;
      dropId?: string | null;
      sourceMessageId?: string | null;
    },
  ): Promise<Note> {
    const trimmedText = text.trim();
    const firstLine = trimmedText.split('\n')[0] || 'Untitled';

    const record = await this.create({
      type: 'note',
      subtype: 'catchall',
      title: firstLine,
      body: trimmedText,
      labels: ['catchall', 'needs_review'],
      origin: 'catchall',
      ai_placed: true,
      space_id: opts?.spaceId ?? null,
      dropId: opts?.dropId ?? null,
      sourceMessageId: opts?.sourceMessageId ?? null,
      views: {
        ai_pending: true, // Will be set to false after AI classification completes
      },
    });

    if (record.type !== 'note') {
      throw new Error('Expected note record from createUnsortedDrop');
    }

    return record;
  }

  // ==========================
  // SPACE METHODS (Phase 5)
  // ==========================

  async listSpaces(): Promise<Space[]> {
    return this.spaces.filter((s) => s.owner_id === this.currentUserId);
  }

  async createSpace(input: SpaceInsert): Promise<Space> {
    const payload = spaceInsertSchema.parse(input);
    const now = nowIso();

    const space: Space = {
      id: genId('space'),
      owner_id: this.currentUserId,
      name: payload.name,
      icon: payload.icon ?? null,
      theme: payload.theme ?? 'deepTeal',
      created_at: now,
      updated_at: now,
    };

    this.spaces.unshift(space);
    return space;
  }

  async getSpaceById(spaceId: string): Promise<Space | null> {
    return this.spaces.find((s) => s.id === spaceId && s.owner_id === this.currentUserId) ?? null;
  }

  async updateSpace(spaceId: string, patch: Partial<SpaceInsert>): Promise<Space> {
    const idx = this.spaces.findIndex((s) => s.id === spaceId && s.owner_id === this.currentUserId);
    if (idx < 0) throw new Error('Space not found');

    const updated: Space = {
      ...this.spaces[idx],
      ...patch,
      updated_at: nowIso(),
    };

    this.spaces[idx] = updated;
    return updated;
  }

  async deleteSpace(spaceId: string): Promise<void> {
    this.spaces = this.spaces.filter(
      (s) => !(s.id === spaceId && s.owner_id === this.currentUserId),
    );
  }

  async listBySpaceGrouped(
    spaceId: string,
    opts?: { tagNames?: string[] },
  ): Promise<GroupedByType> {
    const items = await this.listBySpace(spaceId, opts);

    return {
      habits: items.filter((r) => r.type === 'habit'),
      todos: items.filter((r) => r.type === 'todo'),
      notes: items.filter((r) => r.type === 'note'),
    };
  }

  async getSpaceSummary(spaceId: string): Promise<string | null> {
    const space = await this.getSpaceById(spaceId);
    return space?.summary_cached ?? null;
  }

  // Phase 10.8: Space Insight stubs
  async getLatestSpaceInsight(spaceId: string): Promise<{
    summary: string;
    summary_at: string;
    tokens: number;
  } | null> {
    // Memory backend doesn't support insights yet
    return null;
  }

  async getSpaceInsightHistory(spaceId: string, limit?: number): Promise<any[]> {
    // Memory backend doesn't support insights yet
    return [];
  }

  // ==========================
  // TAG AND PEOPLE METHODS (Phase 7+ stubs)
  // ==========================

  async listTags(): Promise<Tag[]> {
    return this.tags.filter((t) => t.owner_id === this.currentUserId);
  }

  async listPeople(): Promise<Person[]> {
    return this.people.filter((p) => p.owner_id === this.currentUserId);
  }

  async createPerson(input: {
    display_name: string;
    email?: string | null;
    dates?: Array<{ date: string; label: string }> | null;
    notes?: string | null;
    notes_fmt?: 'bullets' | 'numbers' | 'checkboxes' | null;
    reminders?: any[] | null;
    space_id?: string | null;
    tags?: string[] | null;
  }): Promise<Person> {
    const now = new Date().toISOString();
    const person: Person = {
      id: `person-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      owner_id: this.currentUserId,
      display_name: input.display_name,
      name: input.display_name, // Deprecated field, mirror display_name
      email: input.email ?? null,
      avatar: null,
      dates: input.dates ?? null,
      notes: input.notes ?? null,
      notes_fmt: input.notes_fmt ?? null,
      reminders: input.reminders ?? null,
      space_id: input.space_id ?? null,
      tags: input.tags ?? null,
      created_at: now,
      updated_at: now,
    };
    this.people.push(person);
    return person;
  }

  async updatePerson(
    personId: string,
    patch: Partial<{
      display_name: string;
      email: string | null;
      dates: Array<{ date: string; label: string }> | null;
      notes: string | null;
      notes_fmt: 'bullets' | 'numbers' | 'checkboxes' | null;
      reminders: any[] | null;
      space_id: string | null;
      tags: string[] | null;
    }>,
  ): Promise<Person> {
    const person = this.people.find((p) => p.id === personId);
    if (!person) throw new Error('Person not found');

    Object.assign(person, {
      ...patch,
      updated_at: new Date().toISOString(),
    });

    // Update deprecated name field if display_name changed
    if (patch.display_name) {
      person.name = patch.display_name;
    }

    return person;
  }

  async deletePerson(personId: string): Promise<void> {
    const index = this.people.findIndex((p) => p.id === personId);
    if (index === -1) throw new Error('Person not found');
    this.people.splice(index, 1);
  }

  async listLinkedTags(_entity: { type: EntityType; id: ID }): Promise<Tag[]> {
    // Stub: return empty array until TagMap linking is implemented
    return [];
  }

  async listLinkedPeople(_entity: { type: EntityType; id: ID }): Promise<Person[]> {
    // Stub: return empty array until EntityPerson linking is implemented
    return [];
  }

  // ==========================
  // PHASE 8 - TAGS AND PEOPLE LINKING (stubs for MemoryRepo)
  // ==========================

  async upsertTag(name: string): Promise<import('./types').Tag> {
    const existing = this.tags.find((t: any) => t.name === name);
    if (existing) return existing as any;

    const tag: any = {
      id: genId('tag'),
      user_id: this.currentUserId,
      name,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    this.tags.push(tag);
    return tag;
  }

  async listItemTags(_itemId: string): Promise<import('./types').Tag[]> {
    // Stub: return empty array
    return [];
  }

  async linkTag(_params: {
    itemId: string;
    tagId: string;
    itemType: import('./types').ItemType;
  }): Promise<import('./types').TagMap> {
    // 10R: Stub uses owner_id, entity_id, entity_type (was user_id, item_id, item_type)
    return {
      id: genId('tagmap'),
      owner_id: this.currentUserId,
      entity_id: _params.itemId,
      tag_id: _params.tagId,
      entity_type: _params.itemType,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  }

  async unlinkTag(_params: { itemId: string; tagId: string }): Promise<void> {
    // Stub: no-op
  }

  async listLinkedPeopleByItem(_itemId: string): Promise<import('./types').EntityPerson[]> {
    // Stub: return empty array
    return [];
  }

  async linkPerson(params: {
    itemId: string;
    itemType: import('./types').ItemType;
    personName: string;
    personEmail?: string;
  }): Promise<import('./types').EntityPerson> {
    // 10R: Stub uses owner_id, entity_id, entity_type, person_id (was user_id, item_id, item_type)
    return {
      id: genId('entityperson'),
      owner_id: this.currentUserId,
      person_id: genId('person'), // 10R: FK to people table
      entity_id: params.itemId,
      entity_type: params.itemType,
      person_name: params.personName,
      person_email: params.personEmail || null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  }

  async unlinkPerson(_entityPersonId: string): Promise<void> {
    // Stub: no-op
  }

  // ==========================
  // BUDDY METHODS (Phase 5+ stubs)
  // ==========================

  // Buddy no-ops for Phase 4
  async inviteBuddy(): Promise<void> {
    /* no-op */
  }
  async acceptBuddy(): Promise<void> {
    /* no-op */
  }
  async nudgeBuddy(): Promise<void> {
    /* no-op */
  }
  async unlinkBuddy(): Promise<void> {
    /* no-op */
  }

  // ==========================
  // PHASE 10.2: CORTEX PRIMITIVES
  // ==========================

  /**
   * Get cortex preferences for a user.
   */
  async getCortexPrefs(userId: string): Promise<import('./types').CortexPreferences | null> {
    return this.cortexPreferences.get(userId) ?? null;
  }

  /**
   * Set/update cortex preferences (upsert with merge).
   */
  async setCortexPrefs(
    userId: string,
    partial: import('./types').CortexPreferencesUpdate,
  ): Promise<import('./types').CortexPreferences> {
    const existing = this.cortexPreferences.get(userId);
    const updated: import('./types').CortexPreferences = {
      owner_id: userId,
      ...existing,
      ...partial,
      updated_at: nowIso(),
    };
    this.cortexPreferences.set(userId, updated);
    return updated;
  }

  /**
   * Find a list by key (does not create).
   */
  async findListByKey(
    key: string,
    opts?: { userId?: string; spaceId?: string | null },
  ): Promise<import('./types').List | null> {
    const userId = opts?.userId ?? this.currentUserId;
    const allLists = Array.from(this.lists.values());

    const found = allLists.find((list) => {
      if (list.owner_id !== userId) return false;
      if (list.key !== key) return false;

      // Handle spaceId filter
      if (opts?.spaceId !== undefined) {
        if (opts.spaceId === null) {
          return list.space_id === null || list.space_id === undefined;
        } else {
          return list.space_id === opts.spaceId;
        }
      }

      return true;
    });

    return found ?? null;
  }

  /**
   * Get or create a list by key.
   */
  async getOrCreateList(
    key: string,
    opts?: { userId?: string; spaceId?: string | null; name?: string },
  ): Promise<import('./types').List> {
    const userId = opts?.userId ?? this.currentUserId;

    // Try to find existing
    const existing = await this.findListByKey(key, { userId, spaceId: opts?.spaceId });
    if (existing) return existing;

    // Create new - simple title case
    const name =
      opts?.name ??
      key
        .split(/[\s_-]+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

    const newList: import('./types').List = {
      id: genId('list'),
      owner_id: userId,
      key,
      name,
      space_id: opts?.spaceId ?? null,
      created_at: nowIso(),
    };

    this.lists.set(newList.id, newList);
    return newList;
  }

  /**
   * Add an item to a list.
   */
  async addListItem(
    listId: string,
    label: string,
    meta?: { qty?: number; unit?: string; meta_json?: any },
  ): Promise<import('./types').ListItem> {
    const newItem: import('./types').ListItem = {
      id: genId('list-item'),
      list_id: listId,
      label,
      qty: meta?.qty ?? null,
      unit: meta?.unit ?? null,
      meta_json: meta?.meta_json ?? null,
      created_at: nowIso(),
    };

    this.listItemsStore.set(newItem.id, newItem);
    return newItem;
  }

  /**
   * List all items in a list, ordered by created_at.
   */
  async listItems(listId: string): Promise<import('./types').ListItem[]> {
    const allItems = Array.from(this.listItemsStore.values());
    const filtered = allItems.filter((item) => item.list_id === listId);

    // Sort by created_at ascending
    filtered.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    });

    return filtered;
  }

  /**
   * Mark a list item complete/incomplete by setting/unsetting completed_at
   */
  async toggleListItemComplete(listItemId: string, done: boolean): Promise<void> {
    const item = this.listItemsStore.get(listItemId);
    if (!item) throw new Error(`List item not found: ${listItemId}`);

    item.completed_at = done ? nowIso() : null;
    this.listItemsStore.set(listItemId, item);
  }

  /**
   * Rename an item (quick edit in UI)
   */
  async renameListItem(listItemId: string, label: string): Promise<void> {
    const item = this.listItemsStore.get(listItemId);
    if (!item) throw new Error(`List item not found: ${listItemId}`);

    item.label = label;
    this.listItemsStore.set(listItemId, item);
  }

  /**
   * Write an event to the log.
   */
  async writeEvent(
    kind: string,
    payload: Record<string, any>,
    opts?: { userId?: string },
  ): Promise<void> {
    const userId = opts?.userId ?? this.currentUserId;

    const event: import('./types').EventLog = {
      id: genId('event'),
      owner_id: userId,
      kind,
      payload_json: payload,
      created_at: nowIso(),
    };

    this.events.push(event);
  }

  // Phase 10.4 - Space defaults for Cortex biasing

  /**
   * Get defaults_json for a space.
   * Returns null if not found.
   */
  async getSpaceDefaults(spaceId: string): Promise<any | null> {
    return this.spaceDefaults.get(spaceId) ?? null;
  }

  /**
   * Set/update defaults_json for a space (shallow merge).
   * Returns updated defaults_json.
   */
  async setSpaceDefaults(spaceId: string, patch: Record<string, any>): Promise<any> {
    const existing = this.spaceDefaults.get(spaceId) ?? {};
    const merged = { ...existing, ...patch };
    this.spaceDefaults.set(spaceId, merged);
    return merged;
  }

  // --------------------------------------------------------------------------
  // Notes methods (IRepo interface)
  // --------------------------------------------------------------------------
  async listNotes(spaceId: string, opts?: { query?: string }): Promise<any[]> {
    let filtered = this.data.filter(
      (r): r is Note =>
        r.type === 'note' && r.owner_id === this.currentUserId && r.space_id === spaceId,
    );

    if (opts?.query) {
      const q = opts.query.toLowerCase();
      filtered = filtered.filter(
        (n) => n.title?.toLowerCase().includes(q) || n.body?.toLowerCase().includes(q),
      );
    }

    // Sort by updated_at desc
    filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return filtered;
  }

  async createNote(input: {
    space_id: string;
    user_id: string;
    type: 'note' | 'journal';
    content: string;
    date?: string | null;
    title?: string;
  }): Promise<any> {
    const now = nowIso();
    const lines = input.content.trim().split('\n');
    const derivedTitle = lines[0]?.trim() || 'Untitled';

    const note: Note = {
      id: genId('note'),
      type: 'note',
      subtype: input.type === 'journal' ? 'journal' : 'catchall',
      title: input.title || derivedTitle,
      body: input.content,
      ai_placed: false,
      why_string: null,
      origin: null,
      created_at: now,
      updated_at: now,
      owner_id: input.user_id,
      space_id: input.space_id,
    };

    this.data.push(note);
    return note;
  }

  async updateNote(
    id: string,
    patch: Partial<{ content: string; title: string; date: string | null }>,
  ): Promise<void> {
    const idx = this.data.findIndex((r) => r.id === id && r.owner_id === this.currentUserId);
    if (idx < 0) throw new Error('Note not found');

    const note = this.data[idx] as Note;
    const updated: Note = { ...note, updated_at: nowIso() };

    if (patch.content !== undefined) {
      updated.body = patch.content;
      // Also update title from first line if no explicit title
      if (!patch.title) {
        const lines = patch.content.trim().split('\n');
        updated.title = lines[0]?.trim() || 'Untitled';
      }
    }

    if (patch.title !== undefined) {
      updated.title = patch.title;
    }

    this.data[idx] = updated;
  }

  async deleteNote(id: string): Promise<void> {
    const idx = this.data.findIndex((r) => r.id === id && r.owner_id === this.currentUserId);
    if (idx < 0) throw new Error('Note not found');

    this.data.splice(idx, 1);
  }

  // ============================================================================
  // Phase 10.10 - Log Photos (multi-photo journal logs)
  // ============================================================================

  async listLogPhotos(
    _noteId: string,
  ): Promise<Array<{ id: string; url: string; position: number }>> {
    // Memory backend stub - photos not persisted in memory
    return [];
  }

  async insertLogPhoto(_params: {
    noteId: string;
    url: string;
    position: number;
  }): Promise<{ id: string }> {
    // Memory backend stub - return fake ID
    return { id: `photo-${Date.now()}` };
  }

  async updateLogPhotoPosition(_photoId: string, _position: number): Promise<void> {
    // Memory backend stub - no-op
  }

  async deleteLogPhoto(_photoId: string): Promise<void> {
    // Memory backend stub - no-op
  }
}

/**
 * MemorySpaceChatRepo - In-memory space chat storage (Phase 8+ Spaces v2)
 */
export class MemorySpaceChatRepo {
  private chats: import('../types').SpaceChat[] = [];

  constructor(private currentUserId: string = 'memory-user') {}

  async list(
    spaceId: string,
    opts?: { includeArchived?: boolean },
  ): Promise<import('../types').SpaceChat[]> {
    let filtered = this.chats.filter(
      (c) => c.user_id === this.currentUserId && c.space_id === spaceId,
    );

    if (!opts?.includeArchived) {
      filtered = filtered.filter((c) => !c.archived_at);
    }

    // Sort by pinned first, then by updated_at desc
    return filtered.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }

  async create(
    spaceId: string,
    input: import('../types').SpaceChatCreateInput,
  ): Promise<import('../types').SpaceChat> {
    const now = nowIso();
    const chat: import('../types').SpaceChat = {
      id: genId('chat'),
      user_id: this.currentUserId,
      space_id: spaceId,
      title: input.title,
      pinned: false,
      archived_at: null,
      last_message_snippet: null,
      updated_at: now,
      metadata_json: null,
      created_at: now,
    };

    this.chats.push(chat);
    return chat;
  }

  async update(
    chatId: string,
    patch: import('../types').SpaceChatUpdateInput,
  ): Promise<import('../types').SpaceChat> {
    const idx = this.chats.findIndex((c) => c.id === chatId && c.user_id === this.currentUserId);
    if (idx < 0) throw new Error('Chat not found');

    const updated: import('../types').SpaceChat = {
      ...this.chats[idx],
      ...patch,
      updated_at: nowIso(),
    };

    this.chats[idx] = updated;
    return updated;
  }

  async delete(chatId: string): Promise<void> {
    const idx = this.chats.findIndex((c) => c.id === chatId && c.user_id === this.currentUserId);
    if (idx < 0) throw new Error('Chat not found');

    this.chats[idx] = {
      ...this.chats[idx],
      archived_at: nowIso(),
      updated_at: nowIso(),
    };
  }
}

// Default instance for dev
export const memoryRepo = new MemoryRepo();
