import { isToday, parseISO } from 'date-fns';
import type { AppRecord, Habit, Todo, Note, ID } from '../types';
import { genId, nowIso } from '../types';
import { recordZ } from '../schemas';
import type { IRepo, CreateRecordInput, UpdateRecordInput } from './IRepo';

const seed = (): AppRecord[] => {
  const createdAt = nowIso();
  const updatedAt = createdAt;

  const h1: Habit = {
    id: genId('habit'),
    type: 'habit',
    title: 'Drink water',
    frequency: 'daily',
    aiPlaced: false,
    createdAt,
    updatedAt,
  };

  const t1: Todo = {
    id: genId('todo'),
    type: 'todo',
    title: 'Call the dentist',
    dueDate: null,
    aiPlaced: false,
    createdAt,
    updatedAt,
  };

  const n1: Note = {
    id: genId('note'),
    type: 'note',
    subtype: 'journal',
    title: 'First entry',
    body: 'Kicking off Gremly.',
    aiPlaced: false,
    createdAt,
    updatedAt,
  };

  return [h1, t1, n1];
};

export class MemoryRepo implements IRepo {
  private data: AppRecord[] = seed();

  private commit(r: AppRecord) {
    // ensure shape stays valid
    recordZ.parse(r);
  }

  async create(input: CreateRecordInput): Promise<AppRecord> {
    const now = nowIso();
    let rec: AppRecord;

    if (input.type === 'habit') {
      if (!input.frequency) throw new Error('Habit requires frequency');
      rec = {
        id: genId('habit'),
        type: 'habit',
        title: input.title,
        body: input.body,
        frequency: input.frequency!,
        spaceId: input.spaceId ?? null,
        dueDate: input.dueDate ?? null,
        aiPlaced: !!input.aiPlaced,
        createdAt: now,
        updatedAt: now,
      };
    } else if (input.type === 'todo') {
      rec = {
        id: genId('todo'),
        type: 'todo',
        title: input.title,
        body: input.body,
        spaceId: input.spaceId ?? null,
        dueDate: input.dueDate ?? null,
        aiPlaced: !!input.aiPlaced,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      // note
      if (!input.subtype) throw new Error('Note requires subtype');
      rec = {
        id: genId('note'),
        type: 'note',
        title: input.title,
        body: input.body ?? '',
        subtype: input.subtype!,
        spaceId: input.spaceId ?? null,
        dueDate: input.dueDate ?? null,
        aiPlaced: !!input.aiPlaced,
        createdAt: now,
        updatedAt: now,
      };
    }

    this.commit(rec);
    this.data.unshift(rec);
    return rec;
  }

  async update({ id, patch }: UpdateRecordInput): Promise<AppRecord> {
    const idx = this.data.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error('Record not found');
    const merged = { ...this.data[idx], ...patch, updatedAt: nowIso() } as AppRecord;
    this.commit(merged);
    this.data[idx] = merged;
    return merged;
  }

  async remove(id: ID): Promise<void> {
    this.data = this.data.filter((r) => r.id !== id);
  }

  async get(id: ID): Promise<AppRecord | null> {
    return this.data.find((r) => r.id === id) ?? null;
  }

  async listAll(): Promise<AppRecord[]> {
    return [...this.data];
  }

  async listByType(type: AppRecord['type']): Promise<AppRecord[]> {
    return this.data.filter((r) => r.type === type);
  }

  async listBySpace(spaceId: ID): Promise<AppRecord[]> {
    return this.data.filter((r) => r.spaceId === spaceId);
  }

  async search(text: string): Promise<AppRecord[]> {
    const q = text.toLowerCase();
    return this.data.filter(
      (r) => r.title.toLowerCase().includes(q) || (r.body ?? '').toLowerCase().includes(q),
    );
  }

  async listDueToday(_todayIsoDate: string): Promise<AppRecord[]> {
    return this.data.filter((r) => {
      if (!r.dueDate) return false;
      try {
        return isToday(parseISO(r.dueDate));
      } catch {
        return false;
      }
    });
  }

  async listUndefinedDue(): Promise<Todo[]> {
    return this.data.filter(
      (r): r is Todo => r.type === 'todo' && (!r.dueDate || r.dueDate === null),
    );
  }

  // --- Buddy no-ops for Phase 3 ---
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

// default instance for dev
export const memoryRepo = new MemoryRepo();
