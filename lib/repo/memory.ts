import { isToday, parseISO } from 'date-fns';
import type { AppRecord, Habit, Todo, Note, ID, Space } from '../types';
import { genId, nowIso } from '../types';
import { recordZ, spaceInsertSchema, type SpaceInsert } from '../schemas';
import type { IRepo, CreateRecordInput, UpdateRecordInput, GroupedByType } from './IRepo';

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
    title: 'Drink water',
    frequency: 'daily',
    ai_placed: false,
    why_string: null,
    created_at: createdAt,
    updated_at: updatedAt,
    owner_id: ownerId,
  };

  const t1: Todo = {
    id: genId('todo'),
    type: 'todo',
    title: 'Call the dentist',
    due_date: null,
    undefined_due: true,
    ai_placed: false,
    why_string: null,
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
    created_at: createdAt,
    updated_at: updatedAt,
    owner_id: ownerId,
  };

  return [h1, t1, n1];
};

export class MemoryRepo implements IRepo {
  private data: AppRecord[] = [];
  private spaces: Space[] = [];
  private currentUserId: string = 'memory-user';

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
      rec = {
        id: genId('habit'),
        type: 'habit',
        title: input.title,
        frequency: input.frequency,
        space_id: input.space_id ?? null,
        ai_placed: !!input.ai_placed,
        created_at: now,
        updated_at: now,
        owner_id: ownerId,
        why_string: input.why_string ?? null,
      };
    } else if (input.type === 'todo') {
      rec = {
        id: genId('todo'),
        type: 'todo',
        title: input.title,
        body: input.body,
        space_id: input.space_id ?? null,
        due_date: input.due_date ?? null,
        undefined_due: input.undefined_due ?? true,
        ai_placed: !!input.ai_placed,
        why_string: input.why_string ?? null,
        created_at: now,
        updated_at: now,
        owner_id: ownerId,
      };
    } else {
      // note
      if (!input.subtype) throw new Error('Note requires subtype');
      rec = {
        id: genId('note'),
        type: 'note',
        title: input.title,
        body: input.body,
        subtype: input.subtype,
        space_id: input.space_id ?? null,
        ai_placed: !!input.ai_placed,
        why_string: input.why_string ?? null,
        created_at: now,
        updated_at: now,
        owner_id: ownerId,
      };
    }

    this.commit(rec);
    this.data.unshift(rec);
    return rec;
  }

  async update({ id, patch }: UpdateRecordInput): Promise<AppRecord> {
    const idx = this.data.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error('Record not found');
    const merged = { ...this.data[idx], ...patch, updated_at: nowIso() } as AppRecord;
    this.commit(merged);
    this.data[idx] = merged;
    return merged;
  }

  async remove(id: ID): Promise<void> {
    this.data = this.data.filter((r) => r.id !== id);
  }

  async getById(id: ID): Promise<AppRecord | null> {
    return this.data.find((r) => r.id === id) ?? null;
  }

  async listByType(type: AppRecord['type']): Promise<AppRecord[]> {
    return this.data.filter((r) => r.type === type && r.owner_id === this.currentUserId);
  }

  async listBySpace(spaceId: ID): Promise<AppRecord[]> {
    return this.data.filter((r) => r.space_id === spaceId && r.owner_id === this.currentUserId);
  }

  async search(text: string): Promise<AppRecord[]> {
    const q = text.toLowerCase();
    return this.data.filter((r) => {
      if (r.owner_id !== this.currentUserId) return false;
      const titleMatch = r.title?.toLowerCase().includes(q);
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
}

// Default instance for dev
export const memoryRepo = new MemoryRepo();
