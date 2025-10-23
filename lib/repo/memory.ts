import { isToday, parseISO } from 'date-fns';
import type { AppRecord, Habit, Todo, Note, ID, Space, Tag, Person, EntityType } from '../types';
import { genId, nowIso } from '../types';
import { recordZ, spaceInsertSchema, type SpaceInsert } from '../schemas';
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
    created_at: createdAt,
    updated_at: updatedAt,
    owner_id: ownerId,
  };

  return [h1, t1, n1];
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
        // Extended habit fields (Phase 7+)
        frequency_value: input.frequency_value,
        reminders: input.reminders,
        notes: input.notes ?? null,
        tags: input.tags ?? null,
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
        ai_placed: !!input.ai_placed,
        why_string: input.why_string ?? null,
        created_at: now,
        updated_at: now,
        owner_id: ownerId,
        origin: input.origin ?? null,
        canonicalType: input.canonicalType,
        labels: input.labels,
        views: input.views,
      };
    } else {
      // note
      if (!input.subtype) throw new Error('Note requires subtype');
      rec = {
        id: genId('note'),
        type: 'note',
        title: input.title,
        body: input.body,
        subtype: input.subtype as import('../types').NoteSubtype,
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
        journal_subtype: input.journal_subtype ?? null,
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

    return rec;
  }

  async update({ id, patch }: UpdateRecordInput): Promise<AppRecord> {
    const idx = this.data.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error('Record not found');

    const original = this.data[idx];
    const merged = { ...original, ...patch, updated_at: nowIso() } as AppRecord;
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

    // TODO: Apply tag filter when tagIds is provided
    // For now, tagIds is ignored (stub for future implementation)

    return results;
  }

  async countUnsorted(): Promise<number> {
    return this.data.filter((r) => r.owner_id === this.currentUserId && r.ai_placed === true)
      .length;
  }

  async listBySpace(spaceId: ID): Promise<AppRecord[]> {
    return this.data.filter((r) => r.space_id === spaceId && r.owner_id === this.currentUserId);
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
    const { eventBus } = await import('../events');
    eventBus.emit('ItemCompleted', { id, type: 'habit' });
  }

  async completeTodo(id: ID, atIso: string): Promise<void> {
    const item = this.data.find((r) => r.id === id && r.owner_id === this.currentUserId);
    if (!item || item.type !== 'todo') throw new Error('Todo not found');
    (item as any).completed_at = atIso;

    // Emit event for UI sync
    const { eventBus } = await import('../events');
    eventBus.emit('ItemCompleted', { id, type: 'todo' });
  }

  async undoCompletion(id: ID): Promise<void> {
    const item = this.data.find((r) => r.id === id && r.owner_id === this.currentUserId);
    if (!item) throw new Error('Item not found');
    (item as any).completed_at = null;

    // Emit event for UI sync
    const { eventBus } = await import('../events');
    eventBus.emit('ItemUpdated', { id });
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

  async listBySpaceGrouped(spaceId: string): Promise<GroupedByType> {
    const items = await this.listBySpace(spaceId);

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
