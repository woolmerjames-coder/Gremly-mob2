import type { AppRecord, Habit, Todo, Note, ID } from '../types';

export interface CreateRecordInput {
  type: AppRecord['type'];
  title: string;
  body?: string;
  subtype?: Note['subtype']; // required when type === 'note'
  spaceId?: ID | null;
  dueDate?: string | null;
  frequency?: Habit['frequency'] | null;
  aiPlaced?: boolean;
}

export interface UpdateRecordInput {
  id: ID;
  patch: Partial<Omit<AppRecord, 'id' | 'type' | 'createdAt'>>;
}

export interface IRepo {
  // basic CRUD
  create(input: CreateRecordInput): Promise<AppRecord>;
  update(input: UpdateRecordInput): Promise<AppRecord>;
  remove(id: ID): Promise<void>;

  // queries
  get(id: ID): Promise<AppRecord | null>;
  listAll(): Promise<AppRecord[]>;
  listByType(type: AppRecord['type']): Promise<AppRecord[]>;
  listBySpace(spaceId: ID): Promise<AppRecord[]>;
  search(text: string): Promise<AppRecord[]>;

  // today helpers
  listDueToday(todayIsoDate: string): Promise<AppRecord[]>;
  listUndefinedDue(): Promise<Todo[]>;

  // --- Buddy methods (no-op here; real in Supabase later) ---
  inviteBuddy(_habitId: ID, _email: string): Promise<void>;
  acceptBuddy(_inviteToken: string): Promise<void>;
  nudgeBuddy(_habitId: ID): Promise<void>;
  unlinkBuddy(_habitId: ID): Promise<void>;
}
