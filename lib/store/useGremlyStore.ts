import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase/client';
import { getRitualDay } from '../date/ritualDay';
import { env } from '../env';
import type {
  Todo,
  Habit,
  Note,
  Space,
  Tag,
  SpaceChat,
  SpaceChatMessage,
  DailyBrief,
  DailyBriefInput,
  EntityChatData,
  EntityChatMessage,
  EntityChatNote,
  CalendarEvent as UserCalendarEvent,
} from '../types';
import type { Milestone } from '../schemas';
import { eventBus } from '../events';
import { parseHabitFrequency } from '../sweep/habitHelpers';
import { getDateService } from '../date';
import celebrationController from '../../app/features/celebration/CelebrationController';
import {
  calendarClient,
  type CalendarEvent,
  type CalendarConnectionStatus,
  type CalendarProvider,
} from '../calendar/CalendarClient';
import { DEFAULT_TIME_BLOCK_PREFERENCES } from '../capacity';
import type { TimeBlockPreferences } from '../capacity';

// Source marker to identify events emitted by this store (to prevent self-handling)
const STORE_EVENT_SOURCE = 'gremly-store';

// Module-level unsubscribe function for cleanup
let eventBusUnsubscribe: (() => void) | null = null;

/**
 * Check if a habit is currently locked in based on commitment_until date.
 * A habit is locked in if commitment_until is set and >= today's date.
 */
export function isHabitLockedIn(habit: Habit): boolean {
  if (!habit.commitment_until) return false;
  const today = getDateService().getCurrentDate();
  return habit.commitment_until >= today;
}

// ═════════════════════════════════════════════════════════════════════════════
// HIDDEN EVENTS PERSISTENCE (AsyncStorage - local only, resets daily)
// ═════════════════════════════════════════════════════════════════════════════
const HIDDEN_EVENTS_STORAGE_KEY = 'gremly:hiddenCalendarEventsByDate';

async function loadHiddenEventsFromStorage(): Promise<Record<string, string[]>> {
  try {
    const stored = await AsyncStorage.getItem(HIDDEN_EVENTS_STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored) as Record<string, string[]>;

    // Clean up old dates (only keep today and future)
    const today = getDateService().getCurrentDate();
    const cleaned: Record<string, string[]> = {};
    for (const [date, ids] of Object.entries(parsed)) {
      if (date >= today) {
        cleaned[date] = ids;
      }
    }

    return cleaned;
  } catch (error) {
    console.error('[GremlyStore] Failed to load hidden events:', error);
    return {};
  }
}

async function saveHiddenEventsToStorage(data: Record<string, string[]>): Promise<void> {
  try {
    await AsyncStorage.setItem(HIDDEN_EVENTS_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[GremlyStore] Failed to save hidden events:', error);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HIDDEN TODAY ITEMS PERSISTENCE (AsyncStorage - local only, auto-resets daily)
// ═════════════════════════════════════════════════════════════════════════════
const HIDDEN_TODAY_STORAGE_KEY = 'gremly:hiddenToday';

interface HiddenTodayData {
  date: string;
  ids: string[];
}

async function loadHiddenTodayFromStorage(): Promise<HiddenTodayData | null> {
  try {
    const stored = await AsyncStorage.getItem(HIDDEN_TODAY_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as HiddenTodayData;
    const today = getDateService().getCurrentDate();

    // Only return if the date matches today (auto-reset for new day)
    if (parsed.date === today) {
      return parsed;
    }

    // Stale data - clear it
    await AsyncStorage.removeItem(HIDDEN_TODAY_STORAGE_KEY);
    return null;
  } catch (error) {
    console.error('[GremlyStore] Failed to load hidden today items:', error);
    return null;
  }
}

async function saveHiddenTodayToStorage(data: HiddenTodayData): Promise<void> {
  try {
    await AsyncStorage.setItem(HIDDEN_TODAY_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[GremlyStore] Failed to save hidden today items:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT TIME OVERRIDES PERSISTENCE (AsyncStorage - local only)
// ═══════════════════════════════════════════════════════════════════════════════
const EVENT_TIME_OVERRIDES_STORAGE_KEY = 'gremly:eventTimeOverrides';

async function loadEventTimeOverridesFromStorage(): Promise<
  Record<string, { startAt: string; endAt: string }>
> {
  try {
    const stored = await AsyncStorage.getItem(EVENT_TIME_OVERRIDES_STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as Record<string, { startAt: string; endAt: string }>;
  } catch (error) {
    console.error('[GremlyStore] Failed to load event time overrides:', error);
    return {};
  }
}

async function saveEventTimeOverridesToStorage(
  data: Record<string, { startAt: string; endAt: string }>,
): Promise<void> {
  try {
    await AsyncStorage.setItem(EVENT_TIME_OVERRIDES_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[GremlyStore] Failed to save event time overrides:', error);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TIME BLOCK PREFERENCES PERSISTENCE (AsyncStorage - local only)
// ═════════════════════════════════════════════════════════════════════════════
const TIME_BLOCK_PREFERENCES_STORAGE_KEY = 'gremly:timeBlockPreferences';

async function loadTimeBlockPreferencesFromStorage(): Promise<TimeBlockPreferences | null> {
  try {
    const stored = await AsyncStorage.getItem(TIME_BLOCK_PREFERENCES_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as TimeBlockPreferences;
  } catch (error) {
    console.error('[GremlyStore] Failed to load time block preferences:', error);
    return null;
  }
}

async function saveTimeBlockPreferencesToStorage(data: TimeBlockPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(TIME_BLOCK_PREFERENCES_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[GremlyStore] Failed to save time block preferences:', error);
  }
}

/**
 * Sanitize payload before sending to Supabase.
 * - Strips app-only fields that don't exist in DB
 * - Renames camelCase fields to snake_case DB columns
 */
function sanitizeForSupabase(
  payload: Record<string, unknown>,
  entityType: 'note' | 'todo' | 'habit',
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...payload };

  // Remove app-only fields (re-added on read)
  delete sanitized.type;

  // RENAME canonicalType → canonical_type (all entities)
  if ('canonicalType' in sanitized) {
    sanitized.canonical_type = sanitized.canonicalType;
    delete sanitized.canonicalType;
  }

  // RENAME dropId → drop_id (all entities - MindDrop linkage)
  if ('dropId' in sanitized) {
    sanitized.drop_id = sanitized.dropId;
    delete sanitized.dropId;
  }

  // RENAME details → body (for todos)
  if (entityType === 'todo' && 'details' in sanitized) {
    sanitized.body = sanitized.details;
    delete sanitized.details;
  }

  // RENAME content → body (for notes, if passed as content)
  if (entityType === 'note' && 'content' in sanitized) {
    sanitized.body = sanitized.content;
    delete sanitized.content;
  }

  // RENAME frequency_value → frequency_json (for habits)
  if (entityType === 'habit' && 'frequency_value' in sanitized) {
    sanitized.frequency_json = sanitized.frequency_value;
    delete sanitized.frequency_value;
  }

  // These don't exist in DB, safe to remove
  delete sanitized.due_at;
  delete sanitized.photo_uri;

  // For todos and habits: ensure 'name' is set (required NOT NULL column)
  if ((entityType === 'todo' || entityType === 'habit') && !sanitized.name && sanitized.title) {
    sanitized.name = sanitized.title;
  }

  // CRITICAL: Sync due_date and due_day for todos to satisfy DB constraint 'todos_due_day_matches'
  // When due_day is set/updated, due_date must match. When due_day is cleared, due_date must also be cleared.
  if (entityType === 'todo' && 'due_day' in sanitized) {
    const dueDay = sanitized.due_day as string | null | undefined;
    if (dueDay && /^\d{4}-\d{2}-\d{2}$/.test(dueDay)) {
      // due_day is a valid YYYY-MM-DD string - sync due_date
      sanitized.due_date = dueDay;
    } else if (dueDay === null) {
      // due_day is being cleared - also clear due_date
      sanitized.due_date = null;
    }
  }

  return sanitized;
}

// Habit progress row from Supabase
export interface HabitProgressRow {
  id: string;
  owner_id: string;
  habit_id: string;
  occurred_at: string; // ISO timestamp
  occurred_day: string; // YYYY-MM-DD
  count: number;
  occurrence_index: number | null;
}

// --- Pending Drop Types (for optimistic Mind Drop queue) ---

/** Segment info for multi-entity drops */
export interface PendingDropSegment {
  text: string;
  bucket: 'todo' | 'habit' | 'log';
  subtype?: 'journal' | 'idea' | 'general' | null;
  likelyBucket?: string; // From Phase 0 (before Phase 1 confirmation)
  likelySubtype?: string; // From Phase 0
  confirmed?: boolean; // True after Phase 1 confirms the bucket
  /** Smart title from Phase 1 (properly formatted title) */
  smartTitle?: string | null;
  /** Confirmation message from Phase 1 */
  confirmationMessage?: string | null;
}

export interface PendingDrop {
  localId: string;
  text: string;
  spaceId: string | null;
  createdAt: string;
  bucket?: 'todo' | 'habit' | 'log';
  subtype?: 'journal' | 'idea' | 'general' | null;
  smartTitle?: string;
  tags?: string[];
  confirmationMessage?: string | null;
  timeEstimateMinutes?: number | null;
  timeWindow?: 'morning' | 'day' | 'evening' | null;
  extractedDate?: string | null; // For todos: extracted due date
  extractedFrequency?: string | null; // For habits: "3x/week", "daily", etc.
  extractedDays?: number[] | null; // For habits: [1, 3, 5] = Mon, Wed, Fri
  people?: string[]; // Extracted people names for chip display
  mood?: string[] | null; // For journals: extracted mood tags
  status: 'pending' | 'classifying' | 'enriching' | 'enriched' | 'syncing' | 'synced';
  isMulti?: boolean;
  // Multi-drop fields (populated by Phase 0)
  multiSegments?: PendingDropSegment[];
  multiSummary?: string; // Summary title for the multi-card
  dominantBucket?: 'todo' | 'habit' | 'log';
  dominantSubtype?: 'journal' | 'idea' | 'general' | null;

  // ═══════════════════════════════════════════════════════════════════
  // Phase 1: Ambiguity Detection (triggers Phase 1.5 in background)
  // ═══════════════════════════════════════════════════════════════════

  /** True if AI returned is_ambiguous in Phase 1 - shows clarify badge immediately */
  needs_clarification?: boolean;

  /** Reason for ambiguity (passed to Phase 1.5 for question generation) */
  ambiguity_reason?: string | null;

  /** Set to true when user resolves the clarification */
  clarification_resolved?: boolean;

  /** Set to true while processing clarification (triggers card loading animation) */
  clarification_processing?: boolean;

  // ═══════════════════════════════════════════════════════════════════
  // Phase 1.5: Clarification Options (populated asynchronously)
  // ═══════════════════════════════════════════════════════════════════

  /** Type of clarification needed - 'bucket' blocks Phase 2 */
  clarification_type?:
    | 'bucket'
    | 'habit_or_todo'
    | 'date_type'
    | 'detail'
    | 'intent'
    | 'action'
    | null;

  /** Question to show user */
  clarification_question?: string | null;

  /** Options array with id, label, and action payload */
  clarification_options?: Array<{
    id: string;
    label: string;
    action: {
      bucket?: 'todo' | 'habit' | 'log';
      subtype?: string;
      target_date?: boolean;
      scheduled_date?: boolean;
    };
  }> | null;

  // ═══════════════════════════════════════════════════════════════════
  // Date Intelligence (Phase 2)
  // ═══════════════════════════════════════════════════════════════════

  /** External deadline date extracted by AI */
  target_date?: string | null;

  /** Scheduled work date extracted by AI */
  scheduled_date?: string | null;

  /** For notes classified as events - the event time */
  event_time?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORE INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

interface GremlyState {
  // ═══════════════════════════════════════════════════════════════════
  // RAW DATA (populated on app start)
  // ═══════════════════════════════════════════════════════════════════
  todos: Todo[];
  habits: Habit[];
  notes: Note[];
  spaces: Space[];
  tags: Tag[];
  habitProgress: HabitProgressRow[];
  spaceChats: SpaceChat[];
  spaceChatMessages: SpaceChatMessage[];
  milestones: Milestone[];
  pendingDrops: Map<string, PendingDrop>;

  // ═══════════════════════════════════════════════════════════════════
  // MORNING BRIEF STATE
  // ═══════════════════════════════════════════════════════════════════
  dailyBrief: DailyBrief | null;
  dailyBriefLoading: boolean;

  // Loading/sync state
  isLoading: boolean;
  isInitialized: boolean;
  lastSyncedAt: Date | null;
  userId: string | null;

  // User preferences
  userTimezone: string | null;
  setUserTimezone: (tz: string) => void;

  // Calendar view state
  calendarFocusDate: string | null;
  setCalendarFocusDate: (date: string | null) => void;

  // Sweep preferences (from cortex_preferences)
  lastSweepCompletedAt: string | null;
  sweepStreak: number;
  totalSweepCount: number;
  miniSweepLastCompletedAt: string | null;
  setSweepPreferences: (prefs: {
    lastSweepCompletedAt: string | null;
    sweepStreak: number;
    totalSweepCount: number;
  }) => void;
  markMiniSweepCompleted: () => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // GREMLY AGE & RITUAL PROGRESS
  // ═══════════════════════════════════════════════════════════════════
  gremlyAge: number;
  gremlyAgeLastIncrementedAt: string | null;
  dayBoundaryHour: number;
  onboardingCompletedAt: string | null;
  accountCreatedAt: string | null;
  firstDropCompletedAt: string | null;
  firstTodayVisitCompletedAt: string | null;
  todayRitualDay: string | null;
  todayDropsCount: number;
  todaySweepsCount: number;
  todayRitualCompletedAt: string | null;
  todayAgeCelebrationShownAt: string | null;

  // Ritual actions
  ensureCurrentRitualDay: () => string;
  incrementDropCount: () => Promise<{ dropsCount: number; didAgeUp: boolean; newAge: number }>;
  incrementSweepCount: () => Promise<{ sweepsCount: number; didAgeUp: boolean; newAge: number }>;
  checkAndIncrementAge: () => Promise<{ didAgeUp: boolean; newAge: number }>;
  markAgeCelebrationShown: () => void;
  setDayBoundaryHour: (hour: number) => Promise<void>;
  setOnboardingCompletedAt: (timestamp: string) => Promise<void>;
  markOnboardingComplete: () => Promise<void>;
  markFirstDropComplete: () => Promise<void>;
  markFirstTodayVisitComplete: () => Promise<void>;
  refreshRitualProgress: () => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════
  initialize: (userId: string) => Promise<void>;
  reset: () => void;

  // ═══════════════════════════════════════════════════════════════════
  // TODO MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createTodo: (todo: Partial<Todo>) => Promise<Todo>;
  updateTodo: (id: string, updates: Partial<Todo>) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  completeTodo: (id: string) => Promise<void>;
  uncompleteTodo: (id: string) => Promise<void>;
  archiveTodo: (id: string, reason?: string) => Promise<void>;
  restoreTodo: (id: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // HABIT MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createHabit: (habit: Partial<Habit>) => Promise<Habit>;
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  completeHabit: (id: string) => Promise<void>;
  uncompleteHabit: (id: string) => Promise<void>;
  /** Toggle habit completion for TODAY - complete if not done, uncomplete if done */
  toggleHabitToday: (id: string) => Promise<void>;
  /** Log habit completion for a specific date (for Habits This Week) */
  logHabitCompletionForDate: (habitId: string, dateIso: string) => Promise<void>;
  /** Remove habit completion for a specific date (for Habits This Week) */
  removeHabitCompletionForDate: (habitId: string, dateIso: string) => Promise<void>;
  /** Update last_checked_in_at for a habit (user reviewed it) */
  checkInHabit: (habitId: string) => Promise<void>;
  archiveHabit: (id: string, reason?: string) => Promise<void>;
  restoreHabit: (id: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // NOTE MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createNote: (note: Partial<Note> & { photoUris?: string[] }) => Promise<Note>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  archiveNote: (id: string, reason?: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // SPACE MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createSpace: (space: Partial<Space>) => Promise<Space>;
  updateSpace: (id: string, updates: Partial<Space>) => Promise<void>;
  deleteSpace: (id: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // SPACE CHAT MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createSpaceChat: (spaceId: string, title: string) => Promise<SpaceChat | null>;
  updateSpaceChat: (chatId: string, patch: Partial<SpaceChat>) => Promise<void>;
  syncSpaceChat: (chat: SpaceChat) => void; // Sync chat from external source (no Supabase write)
  archiveSpaceChat: (chatId: string) => Promise<void>;
  deleteSpaceChat: (chatId: string) => Promise<void>;
  addChatMessage: (
    message: Omit<SpaceChatMessage, 'id' | 'created_at'>,
  ) => Promise<SpaceChatMessage | null>;
  loadChatMessages: (chatId: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // MILESTONE MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createMilestone: (
    spaceId: string,
    data: { name: string; date?: string | null },
  ) => Promise<Milestone | null>;
  updateMilestone: (milestoneId: string, patch: Partial<Milestone>) => Promise<void>;
  deleteMilestone: (milestoneId: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // LOG PHOTO MUTATIONS (for Mind Drop attachments)
  // ═══════════════════════════════════════════════════════════════════
  uploadPhotosForNote: (noteId: string, userId: string, photoUris: string[]) => Promise<void>;
  insertLogPhoto: (params: {
    noteId: string;
    url: string;
    position: number;
  }) => Promise<{ id: string }>;
  deleteLogPhoto: (photoId: string) => Promise<void>;
  updateLogPhotoPosition: (photoId: string, position: number) => Promise<void>;
  listLogPhotos: (noteId: string) => Promise<Array<{ id: string; url: string; position: number }>>;

  // ═══════════════════════════════════════════════════════════════════
  // MORNING BRIEF MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  fetchTodayBrief: () => Promise<void>;
  saveBrief: (input: DailyBriefInput) => Promise<void>;
  clearBrief: () => Promise<void>;
  /** Dismiss a habit from Morning Brief for today only ("Not today" action) */
  dismissHabitForToday: (habitId: string) => Promise<void>;
  /** Undo dismissal - bring habit back to Morning Brief */
  undismissHabitForToday: (habitId: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // COMMITMENT MUTATIONS (with optimistic Zustand updates)
  // ═══════════════════════════════════════════════════════════════════
  addCommitment: (
    id: string,
    type: 'todo' | 'habit',
    note?: string | null,
    /** Duration in days for habit lock-in (1, 3, 7, or 14). Only used for habits. */
    commitmentDurationDays?: number,
  ) => Promise<void>;
  removeCommitment: (id: string, type: 'todo' | 'habit', reason?: string | null) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // ORGANIZE DAY (AI-powered task assignments)
  // ═══════════════════════════════════════════════════════════════════
  applyOrganizeAssignments: (
    assignments: Array<{ taskId: string; block: 'morning' | 'day' | 'evening' }>,
  ) => void;

  // ═══════════════════════════════════════════════════════════════════
  // BULK/UTILITY
  // ═══════════════════════════════════════════════════════════════════
  refreshFromServer: () => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // EVENT BUS SUBSCRIPTION
  // ═══════════════════════════════════════════════════════════════════
  subscribeToEvents: () => () => void; // Returns unsubscribe function

  // ═══════════════════════════════════════════════════════════════════
  // MINDDROP CRASH RECOVERY
  // ═══════════════════════════════════════════════════════════════════
  recoverStuckMindDrops: () => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // PENDING DROP ACTIONS (for optimistic Mind Drop queue)
  // ═══════════════════════════════════════════════════════════════════
  addPendingDrop: (drop: PendingDrop) => void;
  updatePendingDropClassification: (
    localId: string,
    classification: {
      bucket: 'todo' | 'habit' | 'log';
      subtype: 'journal' | 'idea' | 'general' | null;
    },
  ) => void;
  updatePendingDropEnrichment: (localId: string, enrichment: Partial<PendingDrop>) => void;
  /** Update clarification fields on a synced entity by its drop_id (for Phase 1.5 race condition) */
  updateEntityClarificationByDropId: (
    dropId: string,
    clarificationData: {
      question: string;
      options: Array<{ id: string; label: string; action: Record<string, unknown> }>;
    },
  ) => Promise<boolean>;
  promotePendingDropToEntity: (localId: string, supabaseId: string) => void;
  removePendingDrop: (localId: string) => void;
  resolvePendingDropClarification: (
    localId: string,
    optionId: string,
    isFreeText?: boolean,
  ) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // ENTITY CHAT MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  getEntityChat: (entityId: string, entityType: 'todo' | 'habit' | 'note') => EntityChatData | null;
  getEntityChatMessageCount: (entityId: string, entityType: 'todo' | 'habit' | 'note') => number;
  appendEntityChatMessage: (
    entityId: string,
    entityType: 'todo' | 'habit' | 'note',
    message: Omit<EntityChatMessage, 'id' | 'created_at'>,
  ) => Promise<EntityChatMessage>;
  // Streaming support for entity chat
  createEntityChatStreamingMessage: (
    entityId: string,
    entityType: 'todo' | 'habit' | 'note',
  ) => string; // Returns the message ID
  updateEntityChatStreamingContent: (
    entityId: string,
    entityType: 'todo' | 'habit' | 'note',
    messageId: string,
    content: string,
  ) => void;
  finalizeEntityChatStreamingMessage: (
    entityId: string,
    entityType: 'todo' | 'habit' | 'note',
    messageId: string,
    finalContent: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
  saveEntityChatNote: (
    entityId: string,
    entityType: 'todo' | 'habit' | 'note',
    note: Omit<EntityChatNote, 'id' | 'created_at'>,
  ) => Promise<EntityChatNote>;
  updateEntityChatNoteChecklist: (
    entityId: string,
    entityType: 'todo' | 'habit' | 'note',
    noteId: string,
    itemId: string,
    completed: boolean,
  ) => Promise<void>;
  updateEntityChatNote: (
    entityId: string,
    entityType: 'todo' | 'habit' | 'note',
    noteId: string,
    content: string,
  ) => Promise<void>;
  convertNoteToChecklist: (
    entityId: string,
    entityType: 'todo' | 'habit' | 'note',
    noteId: string,
    checklistData: {
      is_checklist: true;
      checklist_items: Array<{ id: string; label: string; completed: boolean }>;
      preamble?: string;
      postamble?: string;
    },
  ) => Promise<void>;
  deleteEntityChatNote: (
    entityId: string,
    entityType: 'todo' | 'habit' | 'note',
    noteId: string,
  ) => Promise<void>;
  clearEntityChat: (entityId: string, entityType: 'todo' | 'habit' | 'note') => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // CALENDAR INTEGRATION
  // ═══════════════════════════════════════════════════════════════════
  calendarConnections: CalendarConnectionStatus[];
  calendarEvents: Record<string, CalendarEvent[]>; // Key is YYYY-MM-DD (synced external events)
  userCalendarEvents: UserCalendarEvent[]; // User-created quick-add events
  calendarLoading: boolean;
  calendarLastFetched: string | null;
  /** Hidden calendar events keyed by date (YYYY-MM-DD) */
  hiddenCalendarEventsByDate: Record<string, string[]>;
  /** Local time overrides for calendar events (eventId → { startAt, endAt }) */
  eventTimeOverrides: Record<string, { startAt: string; endAt: string }>;
  /** User-customizable time block boundaries */
  timeBlockPreferences: TimeBlockPreferences;
  /** IDs of todos/habits hidden from Morning Brief for today only */
  hiddenTodayIds: string[];
  /** The date that hiddenTodayIds applies to (for auto-reset) */
  hiddenTodayDate: string | null;

  // Calendar actions
  refreshCalendarConnections: () => Promise<void>;
  fetchCalendarEventsForRange: (startDate: string, endDate: string) => Promise<void>;
  connectCalendar: (provider: CalendarProvider) => Promise<{ success: boolean; error?: string }>;
  connectIcsCalendar: (
    icsUrl: string,
    label?: string,
  ) => Promise<{ success: boolean; error?: string; calendarName?: string }>;
  disconnectCalendar: (provider: CalendarProvider) => Promise<void>;
  clearCalendarEvents: () => void;
  hideCalendarEvent: (date: string, eventId: string) => void;
  unhideCalendarEvent: (date: string, eventId: string) => void;
  unhideAllCalendarEventsForDate: (date: string) => void;

  // User Calendar Events (quick-add entries)
  setUserCalendarEvents: (events: UserCalendarEvent[]) => void;
  createUserCalendarEvent: (
    event: Omit<UserCalendarEvent, 'id' | 'type' | 'created_at' | 'updated_at' | 'owner_id'>,
  ) => Promise<UserCalendarEvent>;
  updateUserCalendarEvent: (id: string, patch: Partial<UserCalendarEvent>) => Promise<void>;
  deleteUserCalendarEvent: (id: string) => Promise<void>;
  setEventTimeOverride: (eventId: string, startAt: string, endAt: string) => void;
  clearEventTimeOverride: (eventId: string) => void;
  clearAllEventTimeOverrides: () => void;
  // Time block preferences actions
  setTimeBlockPreferences: (preferences: TimeBlockPreferences) => void;
  resetTimeBlockPreferences: () => void;
  // Hidden today (Not Today) actions
  hideForToday: (id: string) => void;
  unhideForToday: (id: string) => void;
  clearHiddenToday: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INITIAL STATE
// ═══════════════════════════════════════════════════════════════════════════════

const initialState = {
  todos: [] as Todo[],
  habits: [] as Habit[],
  notes: [] as Note[],
  spaces: [] as Space[],
  tags: [] as Tag[],
  habitProgress: [] as HabitProgressRow[],
  spaceChats: [] as SpaceChat[],
  spaceChatMessages: [] as SpaceChatMessage[],
  milestones: [] as Milestone[],
  dailyBrief: null as DailyBrief | null,
  dailyBriefLoading: false,
  isLoading: false,
  isInitialized: false,
  lastSyncedAt: null as Date | null,
  userId: null as string | null,
  userTimezone: null as string | null,
  calendarFocusDate: null as string | null,
  // Sweep preferences
  lastSweepCompletedAt: null as string | null,
  sweepStreak: 0,
  totalSweepCount: 0,
  miniSweepLastCompletedAt: null as string | null,
  // Gremly age & ritual progress
  gremlyAge: 0,
  gremlyAgeLastIncrementedAt: null as string | null,
  dayBoundaryHour: 0,
  onboardingCompletedAt: null as string | null,
  accountCreatedAt: null as string | null,
  firstDropCompletedAt: null as string | null,
  firstTodayVisitCompletedAt: null as string | null,
  todayRitualDay: null as string | null,
  todayDropsCount: 0,
  todaySweepsCount: 0,
  todayRitualCompletedAt: null as string | null,
  todayAgeCelebrationShownAt: null as string | null,
  pendingDrops: new Map<string, PendingDrop>(),
  // Calendar integration
  calendarConnections: [] as CalendarConnectionStatus[],
  calendarEvents: {} as Record<string, CalendarEvent[]>,
  userCalendarEvents: [] as UserCalendarEvent[],
  calendarLoading: false,
  calendarLastFetched: null as string | null,
  hiddenCalendarEventsByDate: {} as Record<string, string[]>,
  eventTimeOverrides: {} as Record<string, { startAt: string; endAt: string }>,
  timeBlockPreferences: DEFAULT_TIME_BLOCK_PREFERENCES,
  hiddenTodayIds: [] as string[],
  hiddenTodayDate: null as string | null,
};

// ═══════════════════════════════════════════════════════════════════════════════
// STORE IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

export const useGremlyStore = create<GremlyState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ═══════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════

    initialize: async (userId: string) => {
      // Don't re-initialize if already done for same user
      if (get().isInitialized && get().userId === userId) {
        return;
      }

      set({ isLoading: true, userId });

      try {
        // Calculate date range: last 60 days for monthly cadence + streak calculation
        const sinceDate = getDateService().daysAgo(60);

        // Fetch ALL user data in parallel
        const [
          todosRes,
          habitsRes,
          notesRes,
          spacesRes,
          tagsRes,
          progressRes,
          chatsRes,
          milestonesRes,
          dailyBriefRes,
          cortexPrefsRes,
          sweepEventsCountRes,
          notificationPrefsRes,
        ] = await Promise.all([
          supabase.from('todos').select('*').eq('owner_id', userId),
          supabase.from('habits').select('*').eq('owner_id', userId),
          supabase.from('notes').select('*, log_photos(id, url, position)').eq('owner_id', userId),
          supabase.from('spaces').select('*').eq('owner_id', userId),
          supabase.from('tags').select('*').eq('owner_id', userId),
          supabase
            .from('habit_progress')
            .select('*')
            .eq('owner_id', userId)
            .gte('occurred_day', sinceDate),
          supabase.from('space_chats').select('*').eq('user_id', userId),
          supabase.from('space_milestones').select('*').eq('owner_id', userId),
          supabase
            .from('daily_briefs')
            .select('*')
            .eq('owner_id', userId)
            .eq('date', getDateService().getCurrentDate())
            .maybeSingle(),
          // Sweep preferences + Gremly age from cortex_preferences
          supabase
            .from('cortex_preferences')
            .select(
              'created_at, last_sweep_completed_at, sweep_streak, gremly_age, gremly_age_last_incremented_at, day_boundary_hour, onboarding_completed_at, first_drop_completed_at, first_today_visit_completed_at, mini_sweep_last_completed_at',
            )
            .eq('owner_id', userId)
            .maybeSingle(),
          // Count total sweep_completed events
          supabase
            .from('events')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', userId)
            .eq('kind', 'sweep_completed'),
          // Notification preferences for timezone
          supabase
            .from('notification_preferences')
            .select('timezone')
            .eq('user_id', userId)
            .maybeSingle(),
        ]);

        // Check for errors (chats/milestones are optional - don't fail if tables don't exist)
        if (todosRes.error) throw todosRes.error;
        if (habitsRes.error) throw habitsRes.error;
        if (notesRes.error) throw notesRes.error;
        if (spacesRes.error) throw spacesRes.error;
        if (tagsRes.error) throw tagsRes.error;
        if (progressRes.error) throw progressRes.error;

        console.log('[GremlyStore] habit_progress query:', {
          sinceDate,
          count: progressRes.data?.length,
          sample: progressRes.data
            ?.slice(0, 5)
            .map((p) => ({ occurred_day: p.occurred_day, habit_id: p.habit_id })),
        });

        // Log but don't throw for chats/milestones/dailyBrief/sweep prefs
        if (chatsRes.error) console.warn('[GremlyStore] space_chats fetch error:', chatsRes.error);
        if (milestonesRes.error)
          console.warn('[GremlyStore] milestones fetch error:', milestonesRes.error);
        if (dailyBriefRes.error)
          console.warn('[GremlyStore] daily_briefs fetch error:', dailyBriefRes.error);
        if (cortexPrefsRes.error && cortexPrefsRes.error.code !== 'PGRST116')
          console.warn('[GremlyStore] cortex_preferences fetch error:', cortexPrefsRes.error);
        if (sweepEventsCountRes.error)
          console.warn('[GremlyStore] sweep events count error:', sweepEventsCountRes.error);

        // Extract sweep preferences (handle columns that may not exist in TypeScript types)
        const cortexPrefs = cortexPrefsRes.data as Record<string, unknown> | null;

        // Compute ritual day based on user's day boundary and timezone
        const dayBoundaryHour = (cortexPrefs?.day_boundary_hour as number) ?? 0;
        const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const timezone = (notificationPrefsRes.data?.timezone as string) ?? detectedTimezone;
        const ritualDay = getRitualDay(dayBoundaryHour, timezone);

        // Fetch today's ritual progress
        const { data: ritualProgress } = await supabase
          .from('daily_ritual_progress')
          .select('*')
          .eq('owner_id', userId)
          .eq('ritual_day', ritualDay)
          .maybeSingle();

        // Existing users who have activity should skip onboarding
        const hasExistingActivity =
          (todosRes.data?.length ?? 0) > 0 ||
          (habitsRes.data?.length ?? 0) > 0 ||
          (notesRes.data?.length ?? 0) > 0;

        const onboardingCompleted = (cortexPrefs?.onboarding_completed_at as string) ?? null;

        // If user has activity but no onboarding timestamp, they're an existing user - auto-complete onboarding
        let effectiveOnboardingCompleted = onboardingCompleted;
        if (hasExistingActivity && !onboardingCompleted) {
          effectiveOnboardingCompleted = new Date().toISOString();
          // Fire and forget - update DB in background
          supabase
            .from('cortex_preferences')
            .upsert(
              {
                owner_id: userId,
                onboarding_completed_at: effectiveOnboardingCompleted,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'owner_id' },
            )
            .then(() => console.log('[GremlyStore] Auto-completed onboarding for existing user'));
        }

        set({
          // Add type field since DB doesn't store it
          todos: (todosRes.data ?? []).map((t) => ({ ...t, type: 'todo' as const })),
          habits: (habitsRes.data ?? []).map((h) => ({ ...h, type: 'habit' as const })),
          notes: (notesRes.data ?? []).map((n) => ({ ...n, type: 'note' as const })),
          spaces: spacesRes.data ?? [],
          tags: tagsRes.data ?? [],
          habitProgress: progressRes.data ?? [],
          spaceChats: chatsRes.data ?? [],
          milestones: milestonesRes.data ?? [],
          dailyBrief: dailyBriefRes.data ?? null,
          spaceChatMessages: [], // Messages are loaded on-demand per chat
          // Sweep preferences
          lastSweepCompletedAt: (cortexPrefs?.last_sweep_completed_at as string) ?? null,
          sweepStreak: (cortexPrefs?.sweep_streak as number) ?? 0,
          totalSweepCount: sweepEventsCountRes.count ?? 0,
          miniSweepLastCompletedAt: (cortexPrefs?.mini_sweep_last_completed_at as string) ?? null,
          // Gremly age & ritual progress
          gremlyAge: (cortexPrefs?.gremly_age as number) ?? 0,
          gremlyAgeLastIncrementedAt:
            (cortexPrefs?.gremly_age_last_incremented_at as string) ?? null,
          dayBoundaryHour,
          onboardingCompletedAt: effectiveOnboardingCompleted,
          accountCreatedAt: (cortexPrefs?.created_at as string) ?? null,
          firstDropCompletedAt: (cortexPrefs?.first_drop_completed_at as string) ?? null,
          firstTodayVisitCompletedAt:
            (cortexPrefs?.first_today_visit_completed_at as string) ?? null,
          todayRitualDay: ritualDay,
          todayDropsCount: ritualProgress?.drops_count ?? 0,
          todaySweepsCount: ritualProgress?.sweeps_count ?? 0,
          todayRitualCompletedAt: ritualProgress?.ritual_completed_at ?? null,
          userTimezone: timezone,
          isLoading: false,
          isInitialized: true,
          lastSyncedAt: new Date(),
        });

        // Load hidden calendar events from AsyncStorage (local-only persistence)
        const hiddenEvents = await loadHiddenEventsFromStorage();
        if (Object.keys(hiddenEvents).length > 0) {
          set({ hiddenCalendarEventsByDate: hiddenEvents });
        }

        // Load event time overrides from AsyncStorage
        const timeOverrides = await loadEventTimeOverridesFromStorage();
        if (Object.keys(timeOverrides).length > 0) {
          set({ eventTimeOverrides: timeOverrides });
        }

        // Load time block preferences from AsyncStorage
        const timeBlockPrefs = await loadTimeBlockPreferencesFromStorage();
        if (timeBlockPrefs) {
          set({ timeBlockPreferences: timeBlockPrefs });
        }

        // Load hidden today items from AsyncStorage (auto-resets on new day)
        const hiddenToday = await loadHiddenTodayFromStorage();
        if (hiddenToday) {
          set({
            hiddenTodayIds: hiddenToday.ids,
            hiddenTodayDate: hiddenToday.date,
          });
        }

        // Clean up old duration-only storage key if it exists
        try {
          await AsyncStorage.removeItem('gremly:eventDurationOverrides');
        } catch {
          // Ignore cleanup errors
        }

        console.log('[GremlyStore] ✅ Initialized with', {
          todos: todosRes.data?.length ?? 0,
          habits: habitsRes.data?.length ?? 0,
          notes: notesRes.data?.length ?? 0,
          spaces: spacesRes.data?.length ?? 0,
          habitProgress: progressRes.data?.length ?? 0,
          spaceChats: chatsRes.data?.length ?? 0,
          milestones: milestonesRes.data?.length ?? 0,
          dailyBrief: dailyBriefRes.data?.id ?? 'none',
          sweepStreak: (cortexPrefs?.sweep_streak as number) ?? 0,
          totalSweepCount: sweepEventsCountRes.count ?? 0,
          gremlyAge: (cortexPrefs?.gremly_age as number) ?? 0,
          ritualDay,
          todayDropsCount: ritualProgress?.drops_count ?? 0,
          todaySweepsCount: ritualProgress?.sweeps_count ?? 0,
        });

        console.log('[GremlyStore] ✅ Timezone:', timezone);

        // Subscribe to EventBus for bidirectional sync
        if (eventBusUnsubscribe) {
          eventBusUnsubscribe(); // Clean up any existing subscription
        }
        eventBusUnsubscribe = get().subscribeToEvents();
        console.log('[GremlyStore] ✅ Subscribed to EventBus');

        // Recover any stuck MindDrop items from previous crashes
        get().recoverStuckMindDrops();
      } catch (error) {
        console.error('[GremlyStore] ❌ Failed to initialize:', error);
        set({ isLoading: false });
        throw error;
      }
    },

    reset: () => {
      // Unsubscribe from EventBus
      if (eventBusUnsubscribe) {
        eventBusUnsubscribe();
        eventBusUnsubscribe = null;
        console.log('[GremlyStore] Unsubscribed from EventBus');
      }

      set({
        todos: [],
        habits: [],
        notes: [],
        spaces: [],
        tags: [],
        habitProgress: [],
        spaceChats: [],
        spaceChatMessages: [],
        milestones: [],
        dailyBrief: null,
        dailyBriefLoading: false,
        isLoading: false,
        isInitialized: false,
        lastSyncedAt: null,
        userId: null,
        userTimezone: null,
        calendarFocusDate: null,
        lastSweepCompletedAt: null,
        sweepStreak: 0,
        totalSweepCount: 0,
        miniSweepLastCompletedAt: null,
        // Gremly age & ritual progress
        gremlyAge: 0,
        gremlyAgeLastIncrementedAt: null,
        dayBoundaryHour: 0,
        onboardingCompletedAt: null,
        accountCreatedAt: null,
        todayRitualDay: null,
        todayDropsCount: 0,
        todaySweepsCount: 0,
        todayRitualCompletedAt: null,
      });
    },

    // ═══════════════════════════════════════════════════════════════════
    // PREFERENCE SETTERS
    // ═══════════════════════════════════════════════════════════════════

    setUserTimezone: (tz: string) => set({ userTimezone: tz }),
    setCalendarFocusDate: (date: string | null) => set({ calendarFocusDate: date }),
    setSweepPreferences: (prefs) =>
      set({
        lastSweepCompletedAt: prefs.lastSweepCompletedAt,
        sweepStreak: prefs.sweepStreak,
        totalSweepCount: prefs.totalSweepCount,
      }),

    markMiniSweepCompleted: async () => {
      const userId = get().userId;
      if (!userId) return;

      const now = new Date().toISOString();

      // Update in Supabase
      const { error } = await supabase
        .from('cortex_preferences')
        .upsert(
          { owner_id: userId, mini_sweep_last_completed_at: now },
          { onConflict: 'owner_id' },
        );

      if (error) {
        console.error('[GremlyStore] Failed to mark mini sweep completed:', error);
        return;
      }

      // Update local state
      set({ miniSweepLastCompletedAt: now });
      console.log('[GremlyStore] Mini sweep marked completed at', now);
    },

    // ═══════════════════════════════════════════════════════════════════
    // GREMLY AGE & RITUAL PROGRESS ACTIONS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Ensures we're tracking the current ritual day.
     * If the day has rolled over, resets daily progress to allow fresh aging.
     * Also clears todo commitments (they reset daily, unlike habits which are date-based).
     * Returns the current ritual day string.
     */
    ensureCurrentRitualDay: () => {
      const { dayBoundaryHour, userTimezone, todayRitualDay } = get();
      const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const currentRitualDay = getRitualDay(dayBoundaryHour, timezone);

      // Check if we've crossed the day boundary
      if (todayRitualDay && currentRitualDay !== todayRitualDay) {
        console.log('[GremlyStore] Day boundary crossed, resetting ritual progress');
        set({
          todayRitualDay: currentRitualDay,
          todayDropsCount: 0,
          todaySweepsCount: 0,
          todayRitualCompletedAt: null, // CRITICAL: allows aging to happen again
          todayAgeCelebrationShownAt: null, // Reset celebration flag for new day
        });

        // Clear commitment on all todos - they need to re-decide each day
        // Note: Habits use commitment_until which is date-based and self-expiring
        const todos = get().todos;
        const todosToReset = todos.filter((t) => t.commitment === true && !t.archived);

        if (todosToReset.length > 0) {
          console.log(
            '[ensureCurrentRitualDay] Clearing commitment on',
            todosToReset.length,
            'todos',
          );

          // Optimistic update - clear commitment in local state immediately
          set((state) => ({
            todos: state.todos.map((t) =>
              t.commitment === true && !t.archived
                ? { ...t, commitment: false, commitment_started_at: null }
                : t,
            ),
          }));

          // Fire and forget - persist to database asynchronously
          // Don't block the UI waiting for this
          const userId = get().userId;
          if (userId) {
            supabase
              .from('todos')
              .update({ commitment: false, commitment_started_at: null })
              .eq('owner_id', userId)
              .in(
                'id',
                todosToReset.map((t) => t.id),
              )
              .then(({ error }) => {
                if (error) {
                  console.error(
                    '[ensureCurrentRitualDay] Failed to clear todo commitments:',
                    error,
                  );
                } else {
                  console.log('[ensureCurrentRitualDay] ✅ Cleared todo commitments in database');
                }
              });
          }
        }
      } else if (!todayRitualDay) {
        // First time - just set the day
        set({ todayRitualDay: currentRitualDay });
      }

      return currentRitualDay;
    },

    incrementDropCount: async () => {
      const { userId } = get();
      if (!userId) return { dropsCount: 0, didAgeUp: false, newAge: get().gremlyAge };

      // Ensure we're on the current ritual day (resets state if day changed)
      const currentRitualDay = get().ensureCurrentRitualDay();

      // Call Supabase RPC to increment
      const { data, error } = await supabase.rpc('increment_drop_count', {
        p_owner_id: userId,
        p_ritual_day: currentRitualDay,
      });

      if (error) {
        console.error('[GremlyStore] incrementDropCount failed:', error);
        return { dropsCount: get().todayDropsCount, didAgeUp: false, newAge: get().gremlyAge };
      }

      const newDropsCount = data?.drops_count ?? get().todayDropsCount + 1;
      set({ todayDropsCount: newDropsCount, todayRitualDay: currentRitualDay });

      // Check if this completes the ritual
      const ageResult = await get().checkAndIncrementAge();
      return { dropsCount: newDropsCount, ...ageResult };
    },

    incrementSweepCount: async () => {
      const { userId } = get();
      if (!userId) return { sweepsCount: 0, didAgeUp: false, newAge: get().gremlyAge };

      // Ensure we're on the current ritual day (resets state if day changed)
      const currentRitualDay = get().ensureCurrentRitualDay();

      const { data, error } = await supabase.rpc('increment_sweep_count', {
        p_owner_id: userId,
        p_ritual_day: currentRitualDay,
      });

      if (error) {
        console.error('[GremlyStore] incrementSweepCount failed:', error);
        return { sweepsCount: get().todaySweepsCount, didAgeUp: false, newAge: get().gremlyAge };
      }

      const newSweepsCount = data?.sweeps_count ?? get().todaySweepsCount + 1;
      set({ todaySweepsCount: newSweepsCount, todayRitualDay: currentRitualDay });

      // Check if this completes the ritual
      const ageResult = await get().checkAndIncrementAge();
      return { sweepsCount: newSweepsCount, ...ageResult };
    },

    checkAndIncrementAge: async () => {
      const { userId, dayBoundaryHour, userTimezone, todayRitualCompletedAt, todayRitualDay } =
        get();
      if (!userId) return { didAgeUp: false, newAge: get().gremlyAge };

      const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const currentRitualDay = getRitualDay(dayBoundaryHour, timezone);

      // Defensive check: if ritual was completed for a different day, it doesn't count for today
      if (todayRitualCompletedAt && todayRitualDay !== currentRitualDay) {
        console.log(
          '[GremlyStore] checkAndIncrementAge: Stale ritual completion detected, clearing',
        );
        set({ todayRitualCompletedAt: null });
        // Continue to check RPC - don't return early
      } else if (todayRitualCompletedAt) {
        // Already completed today (and day matches)
        return { didAgeUp: false, newAge: get().gremlyAge };
      }

      const { data, error } = await supabase.rpc('check_and_increment_gremly_age', {
        p_owner_id: userId,
        p_ritual_day: currentRitualDay,
      });

      if (error) {
        console.error('[GremlyStore] checkAndIncrementAge failed:', error);
        return { didAgeUp: false, newAge: get().gremlyAge };
      }

      const result = data?.[0] ?? { did_age_up: false, new_age: get().gremlyAge };

      if (result.did_age_up) {
        // Check if celebration should show (hasn't been shown today)
        const shouldShowCelebration = !get().todayAgeCelebrationShownAt;

        set({
          gremlyAge: result.new_age,
          gremlyAgeLastIncrementedAt: new Date().toISOString(),
          todayRitualCompletedAt: new Date().toISOString(),
          // Mark celebration as shown in the same atomic update
          ...(shouldShowCelebration && { todayAgeCelebrationShownAt: new Date().toISOString() }),
        });

        // Trigger celebration via controller (App.tsx will render the modal)
        if (shouldShowCelebration) {
          celebrationController.showAgeUpCelebration(result.new_age);
        }

        console.log('[GremlyStore] Gremly aged up to', result.new_age);
        return { didAgeUp: true, newAge: result.new_age };
      }

      return { didAgeUp: result.did_age_up, newAge: result.new_age };
    },

    markAgeCelebrationShown: () => {
      set({ todayAgeCelebrationShownAt: new Date().toISOString() });
    },

    setDayBoundaryHour: async (hour: number) => {
      const userId = get().userId;
      if (!userId) return;

      const { error } = await supabase
        .from('cortex_preferences')
        .upsert(
          { owner_id: userId, day_boundary_hour: hour, updated_at: new Date().toISOString() },
          { onConflict: 'owner_id' },
        );

      if (error) {
        console.error('[GremlyStore] setDayBoundaryHour failed:', error);
        return;
      }

      set({ dayBoundaryHour: hour });

      // Refresh ritual progress since the day boundary changed
      await get().refreshRitualProgress();
    },

    setOnboardingCompletedAt: async (timestamp: string) => {
      const userId = get().userId;
      if (!userId) return;

      const { error } = await supabase.from('cortex_preferences').upsert(
        {
          owner_id: userId,
          onboarding_completed_at: timestamp,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id' },
      );

      if (error) {
        console.error('[GremlyStore] setOnboardingCompletedAt failed:', error);
        return;
      }

      set({ onboardingCompletedAt: timestamp });
    },

    markOnboardingComplete: async () => {
      const userId = get().userId;
      if (!userId) return;

      const now = new Date().toISOString();

      const { error } = await supabase
        .from('cortex_preferences')
        .upsert(
          { owner_id: userId, onboarding_completed_at: now, updated_at: now },
          { onConflict: 'owner_id' },
        );

      if (error) {
        console.error('[GremlyStore] markOnboardingComplete failed:', error);
        return;
      }

      set({ onboardingCompletedAt: now });
      console.log('[GremlyStore] Onboarding marked complete');
    },

    markFirstDropComplete: async () => {
      const userId = get().userId;
      if (!userId) return;

      const now = new Date().toISOString();

      const { error } = await supabase
        .from('cortex_preferences')
        .upsert(
          { owner_id: userId, first_drop_completed_at: now, updated_at: now },
          { onConflict: 'owner_id' },
        );

      if (error) {
        console.error('[GremlyStore] markFirstDropComplete failed:', error);
        return;
      }

      set({ firstDropCompletedAt: now });
      console.log('[GremlyStore] First drop marked complete');
    },

    markFirstTodayVisitComplete: async () => {
      const userId = get().userId;
      if (!userId) return;

      // Don't overwrite if already set
      if (get().firstTodayVisitCompletedAt) return;

      const now = new Date().toISOString();

      const { error } = await supabase
        .from('cortex_preferences')
        .upsert(
          { owner_id: userId, first_today_visit_completed_at: now, updated_at: now },
          { onConflict: 'owner_id' },
        );

      if (error) {
        console.error('[GremlyStore] markFirstTodayVisitComplete failed:', error);
        return;
      }

      set({ firstTodayVisitCompletedAt: now });
      console.log('[GremlyStore] First Today visit marked complete');
    },

    refreshRitualProgress: async () => {
      const { userId, dayBoundaryHour, userTimezone } = get();
      if (!userId) return;

      const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const ritualDay = getRitualDay(dayBoundaryHour, timezone);

      const { data: ritualProgress } = await supabase
        .from('daily_ritual_progress')
        .select('*')
        .eq('owner_id', userId)
        .eq('ritual_day', ritualDay)
        .maybeSingle();

      set({
        todayRitualDay: ritualDay,
        todayDropsCount: ritualProgress?.drops_count ?? 0,
        todaySweepsCount: ritualProgress?.sweeps_count ?? 0,
        todayRitualCompletedAt: ritualProgress?.ritual_completed_at ?? null,
      });
    },

    // ═══════════════════════════════════════════════════════════════════
    // TODO MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createTodo: async (todo: Partial<Todo>) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const now = new Date().toISOString();
      const sanitized = sanitizeForSupabase(todo as Record<string, unknown>, 'todo');
      const payload = {
        ...sanitized,
        owner_id: userId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase.from('todos').insert(payload).select().single();

      if (error) {
        console.error('[GremlyStore] createTodo failed:', error);
        throw error;
      }

      // Add to store with type field (DB doesn't store it)
      const todoWithType = { ...data, type: 'todo' as const };
      set((state) => ({
        todos: [...state.todos, todoWithType],
      }));

      eventBus.emit('entity:created', {
        entity: todoWithType,
        type: 'todo',
        spaceId: data.space_id,
        source: STORE_EVENT_SOURCE,
      });
      return todoWithType;
    },

    updateTodo: async (id: string, updates: Partial<Todo>) => {
      const prevTodo = get().todos.find((t) => t.id === id);
      const now = new Date().toISOString();

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        todos: state.todos.map((t) => (t.id === id ? { ...t, ...updates, updated_at: now } : t)),
      }));

      // 2. SYNC TO SUPABASE
      const sanitized = sanitizeForSupabase(updates as Record<string, unknown>, 'todo');
      const supabaseUpdates = { ...sanitized, updated_at: now };

      const { error } = await supabase.from('todos').update(supabaseUpdates).eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] updateTodo failed:', error);
        if (prevTodo) {
          set((state) => ({
            todos: state.todos.map((t) => (t.id === id ? prevTodo : t)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
    },

    deleteTodo: async (id: string) => {
      const prevTodo = get().todos.find((t) => t.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        todos: state.todos.filter((t) => t.id !== id),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase.from('todos').delete().eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] deleteTodo failed:', error);
        if (prevTodo) {
          set((state) => ({
            todos: [...state.todos, prevTodo],
          }));
        }
        throw error;
      }

      eventBus.emit('entity:deleted', {
        id,
        type: 'todo',
        spaceId: prevTodo?.space_id,
        source: STORE_EVENT_SOURCE,
      });
    },

    completeTodo: async (id: string) => {
      const now = new Date().toISOString();
      const prevTodo = get().todos.find((t) => t.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        todos: state.todos.map((t) => (t.id === id ? { ...t, completed_at: now } : t)),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase.from('todos').update({ completed_at: now }).eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] completeTodo failed:', error);
        if (prevTodo) {
          set((state) => ({
            todos: state.todos.map((t) => (t.id === id ? prevTodo : t)),
          }));
        }
        throw error;
      }

      // EMIT EVENT for backward compatibility
      eventBus.emit('ItemCompleted', { id, type: 'todo', source: STORE_EVENT_SOURCE });
    },

    uncompleteTodo: async (id: string) => {
      const prevTodo = get().todos.find((t) => t.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        todos: state.todos.map((t) => (t.id === id ? { ...t, completed_at: null } : t)),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase.from('todos').update({ completed_at: null }).eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] uncompleteTodo failed:', error);
        if (prevTodo) {
          set((state) => ({
            todos: state.todos.map((t) => (t.id === id ? prevTodo : t)),
          }));
        }
        throw error;
      }
    },

    archiveTodo: async (id: string, reason?: string) => {
      const now = new Date().toISOString();
      const prevTodo = get().todos.find((t) => t.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        todos: state.todos.map((t) =>
          t.id === id
            ? { ...t, archived: true, archived_at: now, archived_reason: reason ?? null }
            : t,
        ),
      }));

      // Log after optimistic update
      console.log('[GremlyStore] archiveTodo optimistic update:', {
        id: id.slice(0, 8),
        archived: true,
        todosCount: get().todos.length,
        archivedTodosCount: get().todos.filter((t) => t.archived).length,
      });

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('todos')
        .update({ archived: true, archived_at: now, archived_reason: reason ?? null })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] archiveTodo failed:', error);
        if (prevTodo) {
          set((state) => ({
            todos: state.todos.map((t) => (t.id === id ? prevTodo : t)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
    },

    restoreTodo: async (id: string) => {
      const prevTodo = get().todos.find((t) => t.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        todos: state.todos.map((t) =>
          t.id === id ? { ...t, archived: false, archived_at: null, archived_reason: null } : t,
        ),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('todos')
        .update({ archived: false, archived_at: null, archived_reason: null })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] restoreTodo failed:', error);
        if (prevTodo) {
          set((state) => ({
            todos: state.todos.map((t) => (t.id === id ? prevTodo : t)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
    },

    // ═══════════════════════════════════════════════════════════════════
    // HABIT MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createHabit: async (habit: Partial<Habit>) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const now = new Date().toISOString();

      // Parse frequency into structured fields if not already set
      let habitData = habit;
      if (!habit.cadence || !habit.target_per_period) {
        const parsed = parseHabitFrequency(habit.frequency, habit.frequency_value as number | null);
        habitData = {
          ...habit,
          cadence: habit.cadence ?? parsed.cadence,
          target_per_period: habit.target_per_period ?? parsed.target_per_period,
        };
      }

      const sanitized = sanitizeForSupabase(habitData as Record<string, unknown>, 'habit');
      const payload = {
        ...sanitized,
        // NOT NULL field defaults (nullish coalescing so explicit values aren't overwritten)
        time_window: sanitized.time_window ?? 'any',
        subtype: sanitized.subtype ?? 'start_habit',
        cadence: sanitized.cadence ?? 'daily',
        frequency: sanitized.frequency ?? 'daily',
        period_unit: sanitized.period_unit ?? 'day',
        target_count: sanitized.target_count ?? 1,
        title: sanitized.title ?? sanitized.name,
        archived: false,
        has_list: sanitized.has_list ?? false,
        locked_in: sanitized.locked_in ?? false,
        ai_placed: sanitized.ai_placed ?? false,
        // Always set these
        owner_id: userId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase.from('habits').insert(payload).select().single();

      if (error) {
        console.error('[GremlyStore] createHabit failed:', error);
        throw error;
      }

      // Add to store with type field (DB doesn't store it)
      const habitWithType = { ...data, type: 'habit' as const };
      set((state) => ({
        habits: [...state.habits, habitWithType],
      }));

      eventBus.emit('entity:created', {
        entity: habitWithType,
        type: 'habit',
        spaceId: data.space_id,
        source: STORE_EVENT_SOURCE,
      });
      return habitWithType;
    },

    updateHabit: async (id: string, updates: Partial<Habit>) => {
      const prevHabit = get().habits.find((h) => h.id === id);
      const now = new Date().toISOString();

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        habits: state.habits.map((h) => (h.id === id ? { ...h, ...updates, updated_at: now } : h)),
      }));

      // 2. SYNC TO SUPABASE
      const sanitized = sanitizeForSupabase(updates as Record<string, unknown>, 'habit');
      const supabaseUpdates = { ...sanitized, updated_at: now };

      const { error } = await supabase.from('habits').update(supabaseUpdates).eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] updateHabit failed:', error);
        if (prevHabit) {
          set((state) => ({
            habits: state.habits.map((h) => (h.id === id ? prevHabit : h)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
    },

    deleteHabit: async (id: string) => {
      const prevHabit = get().habits.find((h) => h.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        habits: state.habits.filter((h) => h.id !== id),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase.from('habits').delete().eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] deleteHabit failed:', error);
        if (prevHabit) {
          set((state) => ({
            habits: [...state.habits, prevHabit],
          }));
        }
        throw error;
      }

      eventBus.emit('entity:deleted', {
        id,
        type: 'habit',
        spaceId: prevHabit?.space_id,
        source: STORE_EVENT_SOURCE,
      });
    },

    completeHabit: async (id: string) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      // Use DateService for consistent local date across the app
      const todayDate = getDateService().getCurrentDate();
      // CRITICAL: occurred_at must derive to same date as occurred_day
      // Use noon UTC on the local day to avoid timezone boundary issues
      const occurredAt = `${todayDate}T12:00:00.000Z`;
      // Keep nowIso for last_completed_at (actual timestamp of action)
      const nowIso = new Date().toISOString();
      const prevHabit = get().habits.find((h) => h.id === id);

      // 1. OPTIMISTIC UPDATE - update habit's last_completed_at
      set((state) => ({
        habits: state.habits.map((h) =>
          h.id === id ? { ...h, last_completed_at: nowIso, updated_at: nowIso } : h,
        ),
      }));

      try {
        // 2. INSERT into habit_progress (source of truth for completions)
        const { error: progressError } = await supabase.from('habit_progress').insert({
          habit_id: id,
          owner_id: userId,
          occurred_day: todayDate,
          occurred_at: occurredAt,
          count: 1,
        });

        if (progressError) {
          // Check if it's a duplicate (already completed today)
          if (progressError.code === '23505') {
            console.log('[GremlyStore] Habit already completed today:', id);
            // Update the existing record's count instead (for habits done multiple times/day)
            // For now, just return - habit is already marked complete
            return;
          }
          throw progressError;
        }

        // Add to local habitProgress array
        const newProgressRow: HabitProgressRow = {
          id: `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          habit_id: id,
          owner_id: userId,
          occurred_at: occurredAt,
          occurred_day: todayDate,
          count: 1,
          occurrence_index: null,
        };
        set((state) => ({
          habitProgress: [...state.habitProgress, newProgressRow],
        }));

        // 3. UPDATE habit's last_completed_at (denormalized field for fast reads)
        const { error: habitError } = await supabase
          .from('habits')
          .update({ last_completed_at: nowIso, updated_at: nowIso })
          .eq('id', id);

        if (habitError) {
          // Rollback progress insert
          await supabase
            .from('habit_progress')
            .delete()
            .eq('habit_id', id)
            .eq('owner_id', userId)
            .eq('occurred_day', todayDate);
          throw habitError;
        }

        // 4. EMIT EVENT for backward compatibility (strangler fig pattern)
        eventBus.emit('ItemCompleted', { id, type: 'habit', source: STORE_EVENT_SOURCE });

        // 5. Set start_date on FIRST completion if currently null
        // This ensures habits get a start_date when the user actually begins doing them
        const habit = get().habits.find((h) => h.id === id);
        if (habit && !habit.start_date) {
          console.log('[GremlyStore] First completion - setting start_date for habit:', id);

          // Update Supabase (fire-and-forget, non-blocking)
          supabase
            .from('habits')
            .update({ start_date: todayDate })
            .eq('id', id)
            .then(({ error }) => {
              if (error) console.error('[GremlyStore] Failed to set start_date:', error);
            });

          // Update local store immediately for UI
          set((state) => ({
            habits: state.habits.map((h) => (h.id === id ? { ...h, start_date: todayDate } : h)),
          }));
        }

        console.log('[GremlyStore] ✅ Habit completed:', id);
      } catch (error) {
        // ROLLBACK optimistic update
        console.error('[GremlyStore] completeHabit failed:', error);
        if (prevHabit) {
          set((state) => ({
            habits: state.habits.map((h) => (h.id === id ? prevHabit : h)),
          }));
        }
        throw error;
      }
    },

    uncompleteHabit: async (id: string) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      // Use DateService for consistent local date across the app
      const todayDate = getDateService().getCurrentDate();
      const prevHabit = get().habits.find((h) => h.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        habits: state.habits.map((h) => (h.id === id ? { ...h, last_completed_at: null } : h)),
      }));

      try {
        // 2. DELETE from habit_progress for today
        const { error: progressError } = await supabase
          .from('habit_progress')
          .delete()
          .eq('habit_id', id)
          .eq('owner_id', userId)
          .eq('occurred_day', todayDate);

        if (progressError) throw progressError;

        // Remove from local habitProgress array
        set((state) => ({
          habitProgress: state.habitProgress.filter(
            (p) => !(p.habit_id === id && p.occurred_day === todayDate),
          ),
        }));

        // 3. Recalculate last_completed_at from remaining progress records
        const { data: latestProgress, error: fetchError } = await supabase
          .from('habit_progress')
          .select('occurred_at')
          .eq('habit_id', id)
          .eq('owner_id', userId)
          .order('occurred_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fetchError) throw fetchError;

        const newLastCompleted = latestProgress?.occurred_at ?? null;

        // 4. UPDATE habit's last_completed_at
        const { error: habitError } = await supabase
          .from('habits')
          .update({ last_completed_at: newLastCompleted })
          .eq('id', id);

        if (habitError) throw habitError;

        // 5. Update store with correct recalculated value
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id ? { ...h, last_completed_at: newLastCompleted } : h,
          ),
        }));

        // 6. EMIT EVENT for backward compatibility
        eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });

        console.log('[GremlyStore] ✅ Habit uncompleted:', id);
      } catch (error) {
        console.error('[GremlyStore] uncompleteHabit failed:', error);
        if (prevHabit) {
          set((state) => ({
            habits: state.habits.map((h) => (h.id === id ? prevHabit : h)),
          }));
        }
        throw error;
      }
    },

    /**
     * Toggle a habit's completion status for TODAY.
     * If done today → uncomplete (remove today's progress)
     * If not done today → complete (add today's progress)
     *
     * This is the single action that should be called from UI toggle handlers.
     */
    toggleHabitToday: async (id: string) => {
      // Use DateService for consistent local date across the app
      const todayDate = getDateService().getCurrentDate();

      const isDoneToday = get().habitProgress.some(
        (p) => p.habit_id === id && p.occurred_day === todayDate,
      );

      console.log('[GremlyStore] toggleHabitToday:', id, 'isDoneToday:', isDoneToday);

      if (isDoneToday) {
        // Currently done → uncomplete it
        await get().uncompleteHabit(id);
      } else {
        // Not done → complete it
        await get().completeHabit(id);
      }
    },

    /**
     * Log habit completion for a specific date (used by Habits This Week sheet).
     * Updates habitProgress immediately so both Today's Focus and Habits sheet stay in sync.
     */
    logHabitCompletionForDate: async (habitId: string, dateIso: string) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const occurredDay = getDateService().extractDateFromIso(dateIso) ?? dateIso.split('T')[0];
      const occurredAt = `${occurredDay}T12:00:00.000Z`; // Use noon UTC on the target day
      const now = new Date().toISOString(); // For last_checked_in_at only

      // Check if already completed for this date
      const existing = get().habitProgress.find(
        (p) => p.habit_id === habitId && p.occurred_day === occurredDay,
      );
      if (existing) {
        console.log('[GremlyStore] Habit already completed for date:', { habitId, occurredDay });
        return;
      }

      // 1. OPTIMISTIC UPDATE - add to habitProgress immediately
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const newProgressRow: HabitProgressRow = {
        id: tempId,
        habit_id: habitId,
        owner_id: userId,
        occurred_at: occurredAt,
        occurred_day: occurredDay,
        count: 1,
        occurrence_index: null,
      };
      set((state) => ({
        habitProgress: [...state.habitProgress, newProgressRow],
        // Also update last_checked_in_at on the habit (use current time)
        habits: state.habits.map((h) => (h.id === habitId ? { ...h, last_checked_in_at: now } : h)),
      }));

      // 2. PERSIST TO SUPABASE (don't await, fire-and-forget with error handling)
      supabase
        .from('habit_progress')
        .insert({
          habit_id: habitId,
          owner_id: userId,
          occurred_day: occurredDay,
          occurred_at: occurredAt,
          count: 1,
        })
        .then(({ error }) => {
          if (error) {
            // Rollback on error
            if (error.code !== '23505') {
              // Ignore duplicate errors
              console.error('[GremlyStore] logHabitCompletionForDate failed:', error);
              set((state) => ({
                habitProgress: state.habitProgress.filter((p) => p.id !== tempId),
              }));
            }
          } else {
            console.log('[GremlyStore] ✅ Habit completion logged:', { habitId, occurredDay });
          }
        });
    },

    /**
     * Remove habit completion for a specific date (used by Habits This Week sheet).
     * Updates habitProgress immediately so both Today's Focus and Habits sheet stay in sync.
     */
    removeHabitCompletionForDate: async (habitId: string, dateIso: string) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const occurredDay = getDateService().extractDateFromIso(dateIso) ?? dateIso.split('T')[0];

      // Find the record to remove
      const toRemove = get().habitProgress.find(
        (p) => p.habit_id === habitId && p.occurred_day === occurredDay,
      );

      if (!toRemove) {
        console.log('[GremlyStore] No completion found to remove:', { habitId, occurredDay });
        return;
      }

      // 1. OPTIMISTIC UPDATE - remove from habitProgress immediately
      set((state) => ({
        habitProgress: state.habitProgress.filter(
          (p) => !(p.habit_id === habitId && p.occurred_day === occurredDay),
        ),
      }));

      // 2. PERSIST TO SUPABASE (don't await, fire-and-forget with error handling)
      supabase
        .from('habit_progress')
        .delete()
        .eq('habit_id', habitId)
        .eq('owner_id', userId)
        .eq('occurred_day', occurredDay)
        .then(({ error }) => {
          if (error) {
            // Rollback on error
            console.error('[GremlyStore] removeHabitCompletionForDate failed:', error);
            if (toRemove) {
              set((state) => ({
                habitProgress: [...state.habitProgress, toRemove],
              }));
            }
          } else {
            console.log('[GremlyStore] ✅ Habit completion removed:', { habitId, occurredDay });
          }
        });
    },

    /**
     * Update last_checked_in_at for a habit (user reviewed/checked in on it).
     * Used when opening habit details or manually checking in.
     */
    checkInHabit: async (habitId: string) => {
      const now = new Date().toISOString();

      // Update local state immediately
      set((state) => ({
        habits: state.habits.map((h) => (h.id === habitId ? { ...h, last_checked_in_at: now } : h)),
      }));

      // Persist to Supabase
      try {
        const { error } = await supabase
          .from('habits')
          .update({ last_checked_in_at: now })
          .eq('id', habitId);

        if (error) {
          console.error('[checkInHabit] Supabase error:', error);
        }
      } catch (err) {
        console.error('[checkInHabit] Failed:', err);
      }
    },

    archiveHabit: async (id: string, reason?: string) => {
      const now = new Date().toISOString();
      const prevHabit = get().habits.find((h) => h.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        habits: state.habits.map((h) =>
          h.id === id
            ? { ...h, archived: true, archived_at: now, archived_reason: reason ?? null }
            : h,
        ),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('habits')
        .update({ archived: true, archived_at: now, archived_reason: reason ?? null })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] archiveHabit failed:', error);
        if (prevHabit) {
          set((state) => ({
            habits: state.habits.map((h) => (h.id === id ? prevHabit : h)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
    },

    restoreHabit: async (id: string) => {
      const prevHabit = get().habits.find((h) => h.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        habits: state.habits.map((h) =>
          h.id === id ? { ...h, archived: false, archived_at: null, archived_reason: null } : h,
        ),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('habits')
        .update({ archived: false, archived_at: null, archived_reason: null })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] restoreHabit failed:', error);
        if (prevHabit) {
          set((state) => ({
            habits: state.habits.map((h) => (h.id === id ? prevHabit : h)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
    },

    // ═══════════════════════════════════════════════════════════════════
    // NOTE MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createNote: async (note: Partial<Note> & { photoUris?: string[] }) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      // Extract photoUris before sanitizing (not a DB field)
      const { photoUris, ...noteData } = note;

      const now = new Date().toISOString();
      const sanitized = sanitizeForSupabase(noteData as Record<string, unknown>, 'note');
      const payload = {
        ...sanitized,
        owner_id: userId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase.from('notes').insert(payload).select().single();

      if (error) {
        console.error('[GremlyStore] createNote failed:', error);
        throw error;
      }

      // Add to store with type field (DB doesn't store it)
      const noteWithType = { ...data, type: 'note' as const };
      set((state) => ({
        notes: [...state.notes, noteWithType],
      }));

      // Upload photos if provided (fire-and-forget, don't block note creation)
      if (photoUris && photoUris.length > 0) {
        console.log('[GremlyStore] Uploading photos for note:', data.id, photoUris.length);
        get()
          .uploadPhotosForNote(data.id, userId, photoUris)
          .catch((err) => {
            console.error('[GremlyStore] Photo upload failed for note:', data.id, err);
          });
      }

      eventBus.emit('entity:created', {
        entity: noteWithType,
        type: 'note',
        spaceId: data.space_id,
        source: STORE_EVENT_SOURCE,
      });
      return noteWithType;
    },

    updateNote: async (id: string, updates: Partial<Note>) => {
      const prevNote = get().notes.find((n) => n.id === id);
      const now = new Date().toISOString();

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? { ...n, ...updates, updated_at: now } : n)),
      }));

      // 2. SYNC TO SUPABASE
      const sanitized = sanitizeForSupabase(updates as Record<string, unknown>, 'note');
      const dbUpdates = { ...sanitized, updated_at: now };

      const { error } = await supabase.from('notes').update(dbUpdates).eq('id', id);

      // 4. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] updateNote failed:', error);
        if (prevNote) {
          set((state) => ({
            notes: state.notes.map((n) => (n.id === id ? prevNote : n)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
    },

    deleteNote: async (id: string) => {
      const prevNote = get().notes.find((n) => n.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        notes: state.notes.filter((n) => n.id !== id),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase.from('notes').delete().eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] deleteNote failed:', error);
        if (prevNote) {
          set((state) => ({
            notes: [...state.notes, prevNote],
          }));
        }
        throw error;
      }

      eventBus.emit('entity:deleted', {
        id,
        type: 'note',
        spaceId: prevNote?.space_id,
        source: STORE_EVENT_SOURCE,
      });
    },

    archiveNote: async (id: string, reason?: string) => {
      const now = new Date().toISOString();
      const prevNote = get().notes.find((n) => n.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        notes: state.notes.map((n) =>
          n.id === id
            ? { ...n, archived: true, archived_at: now, archived_reason: reason ?? null }
            : n,
        ),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('notes')
        .update({ archived: true, archived_at: now, archived_reason: reason ?? null })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] archiveNote failed:', error);
        if (prevNote) {
          set((state) => ({
            notes: state.notes.map((n) => (n.id === id ? prevNote : n)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
    },

    restoreNote: async (id: string) => {
      const prevNote = get().notes.find((n) => n.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        notes: state.notes.map((n) =>
          n.id === id ? { ...n, archived: false, archived_at: null, archived_reason: null } : n,
        ),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('notes')
        .update({ archived: false, archived_at: null, archived_reason: null })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] restoreNote failed:', error);
        if (prevNote) {
          set((state) => ({
            notes: state.notes.map((n) => (n.id === id ? prevNote : n)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
    },

    // ═══════════════════════════════════════════════════════════════════
    // SPACE MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createSpace: async (space: Partial<Space>) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const now = new Date().toISOString();
      const payload = {
        ...space,
        owner_id: userId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase.from('spaces').insert(payload).select().single();

      if (error) {
        console.error('[GremlyStore] createSpace failed:', error);
        throw error;
      }

      // Add to store
      set((state) => ({
        spaces: [...state.spaces, data],
      }));

      eventBus.emit('entity:created', { entity: data, type: 'space', source: STORE_EVENT_SOURCE });
      return data;
    },

    updateSpace: async (id: string, updates: Partial<Space>) => {
      const prevSpace = get().spaces.find((s) => s.id === id);
      const now = new Date().toISOString();

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        spaces: state.spaces.map((s) => (s.id === id ? { ...s, ...updates, updated_at: now } : s)),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase
        .from('spaces')
        .update({ ...updates, updated_at: now })
        .eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] updateSpace failed:', error);
        if (prevSpace) {
          set((state) => ({
            spaces: state.spaces.map((s) => (s.id === id ? prevSpace : s)),
          }));
        }
        throw error;
      }

      eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
    },

    deleteSpace: async (id: string) => {
      const prevSpace = get().spaces.find((s) => s.id === id);

      // 1. OPTIMISTIC UPDATE
      set((state) => ({
        spaces: state.spaces.filter((s) => s.id !== id),
      }));

      // 2. SYNC TO SUPABASE
      const { error } = await supabase.from('spaces').delete().eq('id', id);

      // 3. ROLLBACK ON ERROR
      if (error) {
        console.error('[GremlyStore] deleteSpace failed:', error);
        if (prevSpace) {
          set((state) => ({
            spaces: [...state.spaces, prevSpace],
          }));
        }
        throw error;
      }

      eventBus.emit('entity:deleted', { id, type: 'space', source: STORE_EVENT_SOURCE });
    },

    // ═══════════════════════════════════════════════════════════════════
    // SPACE CHAT MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createSpaceChat: async (spaceId: string, title: string) => {
      const userId = get().userId;
      if (!userId) return null;

      const now = new Date().toISOString();
      const newChat: Partial<SpaceChat> = {
        space_id: spaceId,
        user_id: userId,
        title,
        pinned: false,
        created_at: now,
        updated_at: now,
      };

      // Optimistic update with temp ID
      const tempId = `temp-${Date.now()}`;
      const optimisticChat = { ...newChat, id: tempId } as SpaceChat;
      set((state) => ({ spaceChats: [optimisticChat, ...state.spaceChats] }));

      try {
        const { data, error } = await supabase
          .from('space_chats')
          .insert(newChat)
          .select()
          .single();

        if (error) throw error;

        // Replace temp with real
        set((state) => ({
          spaceChats: state.spaceChats.map((c) => (c.id === tempId ? data : c)),
        }));

        eventBus.emit('entity:created', {
          type: 'space_chat',
          entity: data,
          source: STORE_EVENT_SOURCE,
        });
        return data;
      } catch (error) {
        // Rollback
        set((state) => ({
          spaceChats: state.spaceChats.filter((c) => c.id !== tempId),
        }));
        console.error('[GremlyStore] createSpaceChat failed:', error);
        throw error;
      }
    },

    // Sync a chat created externally (e.g., by useChatMessages) - no Supabase write
    syncSpaceChat: (chat: SpaceChat) => {
      set((state) => {
        // Don't add if already exists
        if (state.spaceChats.some((c) => c.id === chat.id)) {
          return state;
        }
        return {
          spaceChats: [chat, ...state.spaceChats],
        };
      });
    },

    updateSpaceChat: async (chatId: string, patch: Partial<SpaceChat>) => {
      const prev = get().spaceChats.find((c) => c.id === chatId);
      if (!prev) return;

      const now = new Date().toISOString();

      // Optimistic update
      set((state) => ({
        spaceChats: state.spaceChats.map((c) =>
          c.id === chatId ? { ...c, ...patch, updated_at: now } : c,
        ),
      }));

      try {
        const { error } = await supabase
          .from('space_chats')
          .update({ ...patch, updated_at: now })
          .eq('id', chatId);

        if (error) throw error;

        // Get the updated entity from store for the event
        const updated = get().spaceChats.find((c) => c.id === chatId);
        eventBus.emit('entity:updated', {
          type: 'space_chat',
          entity: updated,
          source: STORE_EVENT_SOURCE,
        });
      } catch (error) {
        // Rollback
        set((state) => ({
          spaceChats: state.spaceChats.map((c) => (c.id === chatId ? prev : c)),
        }));
        console.error('[GremlyStore] updateSpaceChat failed:', error);
        throw error;
      }
    },

    archiveSpaceChat: async (chatId: string) => {
      await get().updateSpaceChat(chatId, { archived_at: new Date().toISOString() });
    },

    deleteSpaceChat: async (chatId: string) => {
      const prev = get().spaceChats.find((c) => c.id === chatId);

      // Optimistic update - remove chat and its messages
      set((state) => ({
        spaceChats: state.spaceChats.filter((c) => c.id !== chatId),
        spaceChatMessages: state.spaceChatMessages.filter((m) => m.chat_id !== chatId),
      }));

      try {
        const { error } = await supabase.from('space_chats').delete().eq('id', chatId);
        if (error) throw error;
        eventBus.emit('entity:deleted', {
          type: 'space_chat',
          id: chatId,
          source: STORE_EVENT_SOURCE,
        });
      } catch (error) {
        // Rollback
        if (prev) {
          set((state) => ({ spaceChats: [...state.spaceChats, prev] }));
        }
        console.error('[GremlyStore] deleteSpaceChat failed:', error);
        throw error;
      }
    },

    addChatMessage: async (message: Omit<SpaceChatMessage, 'id' | 'created_at'>) => {
      const userId = get().userId;
      if (!userId) return null;

      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      const optimisticMessage = {
        ...message,
        id: tempId,
        user_id: userId,
        created_at: now,
      } as SpaceChatMessage;

      set((state) => ({
        spaceChatMessages: [...state.spaceChatMessages, optimisticMessage],
      }));

      try {
        const { data, error } = await supabase
          .from('space_chat_messages')
          .insert({ ...message, user_id: userId })
          .select()
          .single();

        if (error) throw error;

        set((state) => ({
          spaceChatMessages: state.spaceChatMessages.map((m) => (m.id === tempId ? data : m)),
        }));

        // Update chat's last_message_snippet
        const snippet = message.content.slice(0, 100);
        await get().updateSpaceChat(message.chat_id, {
          last_message_snippet: snippet,
        });

        return data;
      } catch (error) {
        set((state) => ({
          spaceChatMessages: state.spaceChatMessages.filter((m) => m.id !== tempId),
        }));
        console.error('[GremlyStore] addChatMessage failed:', error);
        throw error;
      }
    },

    loadChatMessages: async (chatId: string) => {
      try {
        const { data, error } = await supabase
          .from('space_chat_messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        // Merge with existing messages (avoid duplicates)
        set((state) => {
          const existingIds = new Set(
            state.spaceChatMessages.filter((m) => m.chat_id === chatId).map((m) => m.id),
          );
          const newMessages = (data ?? []).filter((m) => !existingIds.has(m.id));
          return {
            spaceChatMessages: [
              ...state.spaceChatMessages.filter((m) => m.chat_id !== chatId),
              ...(data ?? []),
            ],
          };
        });
      } catch (error) {
        console.error('[GremlyStore] loadChatMessages failed:', error);
        throw error;
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // MILESTONE MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    createMilestone: async (spaceId: string, data: { name: string; date?: string | null }) => {
      const userId = get().userId;
      if (!userId) return null;

      const now = new Date().toISOString();
      const newMilestone = {
        space_id: spaceId,
        owner_id: userId,
        name: data.name,
        title: data.name, // DB requires title column (NOT NULL)
        date: data.date ?? null,
        completed: false,
        completed_at: null,
        is_active: true,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      };

      const tempId = `temp-${Date.now()}`;
      set((state) => ({
        milestones: [...state.milestones, { ...newMilestone, id: tempId } as Milestone],
      }));

      try {
        const { data: result, error } = await supabase
          .from('space_milestones')
          .insert(newMilestone)
          .select()
          .single();

        if (error) throw error;

        set((state) => ({
          milestones: state.milestones.map((m) => (m.id === tempId ? result : m)),
        }));

        return result;
      } catch (error) {
        set((state) => ({
          milestones: state.milestones.filter((m) => m.id !== tempId),
        }));
        console.error('[GremlyStore] createMilestone failed:', error);
        throw error;
      }
    },

    updateMilestone: async (milestoneId: string, patch: Partial<Milestone>) => {
      const prev = get().milestones.find((m) => m.id === milestoneId);
      if (!prev) return;

      const now = new Date().toISOString();

      // Sync title with name if name is being updated
      const syncedPatch = patch.name ? { ...patch, title: patch.name } : patch;

      set((state) => ({
        milestones: state.milestones.map((m) =>
          m.id === milestoneId ? { ...m, ...syncedPatch, updated_at: now } : m,
        ),
      }));

      try {
        const { error } = await supabase
          .from('space_milestones')
          .update({ ...syncedPatch, updated_at: now })
          .eq('id', milestoneId);

        if (error) throw error;
      } catch (error) {
        set((state) => ({
          milestones: state.milestones.map((m) => (m.id === milestoneId ? prev : m)),
        }));
        console.error('[GremlyStore] updateMilestone failed:', error);
        throw error;
      }
    },

    deleteMilestone: async (milestoneId: string) => {
      const prev = get().milestones.find((m) => m.id === milestoneId);

      set((state) => ({
        milestones: state.milestones.filter((m) => m.id !== milestoneId),
      }));

      try {
        const { error } = await supabase.from('space_milestones').delete().eq('id', milestoneId);
        if (error) throw error;
      } catch (error) {
        if (prev) {
          set((state) => ({ milestones: [...state.milestones, prev] }));
        }
        console.error('[GremlyStore] deleteMilestone failed:', error);
        throw error;
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // LOG PHOTO MUTATIONS (for Mind Drop attachments)
    // ═══════════════════════════════════════════════════════════════════

    uploadPhotosForNote: async (noteId: string, userId: string, photoUris: string[]) => {
      const { insertLogPhoto } = get();

      for (let i = 0; i < photoUris.length; i++) {
        const photoUri = photoUris[i];

        try {
          // Skip non-local URIs
          if (!photoUri.startsWith('file://')) {
            console.warn('[GremlyStore] Skipping non-local URI:', photoUri.substring(0, 50));
            continue;
          }

          // 1. Fetch the local file
          const response = await fetch(photoUri);
          const arrayBuffer = await response.arrayBuffer();

          // 2. Generate unique storage path
          const fileExt = photoUri.split('.').pop() || 'jpg';
          const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const storagePath = `${userId}/${noteId}/${uniqueId}.${fileExt}`;

          // 3. Upload to Supabase storage
          const { error: uploadError } = await supabase.storage
            .from('log-photos')
            .upload(storagePath, arrayBuffer, {
              contentType: 'image/jpeg',
              upsert: false,
            });

          if (uploadError) {
            console.error('[GremlyStore] Storage upload failed:', uploadError);
            continue; // Try next photo
          }

          // 4. Get public URL
          const { data: urlData } = supabase.storage.from('log-photos').getPublicUrl(storagePath);

          const publicUrl = urlData.publicUrl;

          // 5. Insert record into log_photos table
          await insertLogPhoto({
            noteId,
            url: publicUrl,
            position: i,
          });

          console.log('[GremlyStore] Photo uploaded successfully:', { noteId, position: i });
        } catch (err) {
          console.error('[GremlyStore] Failed to upload photo:', photoUri, err);
          // Continue with other photos
        }
      }
    },

    insertLogPhoto: async (params: { noteId: string; url: string; position: number }) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('log_photos')
        .insert({
          note_id: params.noteId,
          owner_id: userId,
          url: params.url,
          position: params.position,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[GremlyStore] insertLogPhoto failed:', error);
        throw new Error(`Failed to insert log photo: ${error.message}`);
      }

      return { id: data.id };
    },

    deleteLogPhoto: async (photoId: string) => {
      const { error } = await supabase.from('log_photos').delete().eq('id', photoId);

      if (error) {
        console.error('[GremlyStore] deleteLogPhoto failed:', error);
        throw new Error(`Failed to delete log photo: ${error.message}`);
      }
    },

    updateLogPhotoPosition: async (photoId: string, position: number) => {
      const { error } = await supabase.from('log_photos').update({ position }).eq('id', photoId);

      if (error) {
        console.error('[GremlyStore] updateLogPhotoPosition failed:', error);
        throw new Error(`Failed to update log photo position: ${error.message}`);
      }
    },

    listLogPhotos: async (noteId: string) => {
      const { data, error } = await supabase
        .from('log_photos')
        .select('id, url, position')
        .eq('note_id', noteId)
        .order('position', { ascending: true });

      if (error) {
        console.error('[GremlyStore] listLogPhotos failed:', error);
        throw new Error(`Failed to list log photos: ${error.message}`);
      }

      return data ?? [];
    },

    // ═══════════════════════════════════════════════════════════════════
    // ORGANIZE DAY (AI-powered task assignments)
    // ═══════════════════════════════════════════════════════════════════

    applyOrganizeAssignments: (assignments) => {
      set((state) => {
        const updatedTodos = state.todos.map((todo) => {
          const assignment = assignments.find((a) => a.taskId === todo.id);
          if (assignment) {
            return { ...todo, time_window: assignment.block };
          }
          return todo;
        });

        const updatedHabits = state.habits.map((habit) => {
          const assignment = assignments.find((a) => a.taskId === habit.id);
          if (assignment) {
            return { ...habit, time_window: assignment.block };
          }
          return habit;
        });

        return { todos: updatedTodos, habits: updatedHabits };
      });

      // Persist to Supabase
      const { todos, habits } = get();
      assignments.forEach((assignment) => {
        const todo = todos.find((t) => t.id === assignment.taskId);
        if (todo) {
          get().updateTodo(todo.id, { time_window: assignment.block });
          return;
        }
        const habit = habits.find((h) => h.id === assignment.taskId);
        if (habit) {
          get().updateHabit(habit.id, { time_window: assignment.block });
        }
      });
    },

    // ═══════════════════════════════════════════════════════════════════
    // BULK/UTILITY
    // ═══════════════════════════════════════════════════════════════════

    refreshFromServer: async () => {
      const userId = get().userId;
      if (!userId) return;

      // Re-fetch all data (same as initialize but doesn't reset isInitialized)
      set({ isLoading: true });

      try {
        const sinceDate = getDateService().daysAgo(60);

        const [
          todosRes,
          habitsRes,
          notesRes,
          spacesRes,
          tagsRes,
          progressRes,
          chatsRes,
          milestonesRes,
        ] = await Promise.all([
          supabase.from('todos').select('*').eq('owner_id', userId),
          supabase.from('habits').select('*').eq('owner_id', userId),
          supabase.from('notes').select('*').eq('owner_id', userId),
          supabase.from('spaces').select('*').eq('owner_id', userId),
          supabase.from('tags').select('*').eq('owner_id', userId),
          supabase
            .from('habit_progress')
            .select('*')
            .eq('owner_id', userId)
            .gte('occurred_day', sinceDate),
          supabase.from('space_chats').select('*').eq('user_id', userId),
          supabase.from('space_milestones').select('*').eq('owner_id', userId),
        ]);

        set({
          // Add type field since DB doesn't store it
          todos: (todosRes.data ?? []).map((t) => ({ ...t, type: 'todo' as const })),
          habits: (habitsRes.data ?? []).map((h) => ({ ...h, type: 'habit' as const })),
          notes: (notesRes.data ?? []).map((n) => ({ ...n, type: 'note' as const })),
          spaces: spacesRes.data ?? [],
          tags: tagsRes.data ?? [],
          habitProgress: progressRes.data ?? [],
          spaceChats: chatsRes.data ?? [],
          milestones: milestonesRes.data ?? [],
          isLoading: false,
          lastSyncedAt: new Date(),
        });

        console.log('[GremlyStore] ✅ Refreshed from server');
      } catch (error) {
        console.error('[GremlyStore] refreshFromServer failed:', error);
        set({ isLoading: false });
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // MORNING BRIEF MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    fetchTodayBrief: async () => {
      const userId = get().userId;
      if (!userId) return;

      const todayDate = getDateService().getCurrentDate();

      set({ dailyBriefLoading: true });

      try {
        const { data, error } = await supabase
          .from('daily_briefs')
          .select('*')
          .eq('owner_id', userId)
          .eq('date', todayDate)
          .maybeSingle();

        if (error) throw error;

        set({
          dailyBrief: data ?? null,
          dailyBriefLoading: false,
        });

        console.log('[GremlyStore] ✅ Fetched daily brief:', data?.id ?? 'none');
      } catch (error) {
        console.error('[GremlyStore] ❌ fetchTodayBrief failed:', error);
        set({ dailyBriefLoading: false });
      }
    },

    saveBrief: async (input: DailyBriefInput) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const todayDate = getDateService().getCurrentDate();
      const now = new Date().toISOString();
      const existingBrief = get().dailyBrief;

      // Build the payload (one_thing_id/one_thing_type deprecated - locked items use locked_in field)
      const payload = {
        owner_id: userId,
        date: todayDate,
        one_thing_id: null, // Deprecated - kept for DB compatibility
        one_thing_type: null, // Deprecated - kept for DB compatibility
        morning_sequence: input.morning_sequence ?? [],
        day_sequence: input.day_sequence ?? [],
        evening_sequence: input.evening_sequence ?? [],
        dismissed_habit_ids: input.dismissed_habit_ids ?? existingBrief?.dismissed_habit_ids ?? [],
        completed_at: input.completed_at ?? now,
        updated_at: now,
      };

      // Optimistic update
      const optimisticBrief: DailyBrief = {
        id: existingBrief?.id ?? `temp_${Date.now()}`,
        ...payload,
        dismissed_habit_ids: payload.dismissed_habit_ids,
        created_at: existingBrief?.created_at ?? now,
      };
      set({ dailyBrief: optimisticBrief });

      try {
        if (existingBrief?.id && !existingBrief.id.startsWith('temp_')) {
          // Update existing brief
          const { error } = await supabase
            .from('daily_briefs')
            .update(payload)
            .eq('id', existingBrief.id);

          if (error) throw error;
          console.log('[GremlyStore] ✅ Updated daily brief:', existingBrief.id);
        } else {
          // Insert new brief (upsert pattern)
          const { data, error } = await supabase
            .from('daily_briefs')
            .upsert(payload, {
              onConflict: 'owner_id,date',
              ignoreDuplicates: false,
            })
            .select()
            .single();

          if (error) throw error;

          // Update with real ID from database
          set({ dailyBrief: data });
          console.log('[GremlyStore] ✅ Created daily brief:', data.id);
        }

        // Emit event for other components
        eventBus.emit('DailyBriefSaved', { date: todayDate });
      } catch (error) {
        console.error('[GremlyStore] ❌ saveBrief failed:', error);
        // Rollback optimistic update
        set({ dailyBrief: existingBrief });
        throw error;
      }
    },

    clearBrief: async () => {
      const userId = get().userId;
      if (!userId) return;

      const todayDate = getDateService().getCurrentDate();
      const existingBrief = get().dailyBrief;

      // Optimistic update
      set({ dailyBrief: null });

      try {
        const { error } = await supabase
          .from('daily_briefs')
          .delete()
          .eq('owner_id', userId)
          .eq('date', todayDate);

        if (error) throw error;

        console.log('[GremlyStore] ✅ Cleared daily brief');
        eventBus.emit('DailyBriefCleared', { date: todayDate });
      } catch (error) {
        console.error('[GremlyStore] ❌ clearBrief failed:', error);
        // Rollback
        set({ dailyBrief: existingBrief });
        throw error;
      }
    },

    dismissHabitForToday: async (habitId: string) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const today = getDateService().getCurrentDate();
      const brief = get().dailyBrief;

      // If no brief for today exists, create one first via saveBrief
      if (!brief || brief.date !== today) {
        await get().saveBrief({
          morning_sequence: [],
          day_sequence: [],
          evening_sequence: [],
          dismissed_habit_ids: [habitId],
        });
        return;
      }

      // Add habitId to dismissed_habit_ids if not already there
      const currentDismissed = brief.dismissed_habit_ids ?? [];
      if (currentDismissed.includes(habitId)) {
        return; // Already dismissed
      }

      const updatedDismissed = [...currentDismissed, habitId];

      // Optimistic update
      set({
        dailyBrief: {
          ...brief,
          dismissed_habit_ids: updatedDismissed,
        },
      });

      // Persist to Supabase
      try {
        const { error } = await supabase
          .from('daily_briefs')
          .update({ dismissed_habit_ids: updatedDismissed })
          .eq('id', brief.id);

        if (error) throw error;

        console.log('[GremlyStore] ✅ Dismissed habit for today:', habitId);
      } catch (error) {
        console.error('[GremlyStore] ❌ dismissHabitForToday failed:', error);
        // Rollback
        set({ dailyBrief: brief });
        throw error;
      }
    },

    undismissHabitForToday: async (habitId: string) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const brief = get().dailyBrief;
      if (!brief) return; // No brief = nothing to undo

      const currentDismissed = brief.dismissed_habit_ids ?? [];
      if (!currentDismissed.includes(habitId)) {
        return; // Not dismissed, nothing to do
      }

      const updatedDismissed = currentDismissed.filter((id) => id !== habitId);

      // Optimistic update
      set({
        dailyBrief: {
          ...brief,
          dismissed_habit_ids: updatedDismissed,
        },
      });

      // Persist to Supabase
      try {
        const { error } = await supabase
          .from('daily_briefs')
          .update({ dismissed_habit_ids: updatedDismissed })
          .eq('id', brief.id);

        if (error) throw error;

        console.log('[GremlyStore] ✅ Undismissed habit for today:', habitId);
      } catch (error) {
        console.error('[GremlyStore] ❌ undismissHabitForToday failed:', error);
        // Rollback
        set({ dailyBrief: brief });
        throw error;
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // COMMITMENT MUTATIONS (with optimistic Zustand updates)
    // ═══════════════════════════════════════════════════════════════════

    addCommitment: async (
      id: string,
      type: 'todo' | 'habit',
      note?: string | null,
      commitmentDurationDays?: number,
    ) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const startedAt = new Date().toISOString();
      const table = type === 'habit' ? 'habits' : 'todos';

      // 1. Optimistic update to Zustand
      if (type === 'todo') {
        set((state) => ({
          todos: state.todos.map((t) =>
            t.id === id
              ? {
                  ...t,
                  commitment: true,
                  commitment_started_at: startedAt,
                  commitment_note: note ?? null,
                }
              : t,
          ),
        }));
      } else {
        // Habit: calculate commitment_until date
        const ds = getDateService();
        const today = ds.getCurrentDate(); // YYYY-MM-DD
        const durationDays = commitmentDurationDays ?? 7; // Default to 7 days
        const commitmentUntil = ds.addDays(today, durationDays);

        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id
              ? {
                  ...h,
                  commitment_until: commitmentUntil,
                  commitment_started_at: startedAt,
                  commitment_note: note ?? null,
                }
              : h,
          ),
        }));
      }

      // 2. Persist to Supabase directly
      if (type === 'todo') {
        const { error } = await supabase
          .from(table)
          .update({
            commitment: true,
            commitment_started_at: startedAt,
            ...(note !== undefined ? { commitment_note: note } : {}),
          })
          .eq('id', id)
          .eq('owner_id', userId);

        if (error) {
          console.error('[GremlyStore] addCommitment failed:', error);
          throw new Error(`COMMITMENT_SET_FAILED: ${error.message}`);
        }
      } else {
        // Habit: persist commitment_until
        const ds = getDateService();
        const today = ds.getCurrentDate();
        const durationDays = commitmentDurationDays ?? 7;
        const commitmentUntil = ds.addDays(today, durationDays);

        const { error } = await supabase
          .from(table)
          .update({
            commitment_until: commitmentUntil,
            commitment_started_at: startedAt,
            ...(note !== undefined ? { commitment_note: note } : {}),
          })
          .eq('id', id)
          .eq('owner_id', userId);

        if (error) {
          console.error('[GremlyStore] addCommitment failed:', error);
          throw new Error(`COMMITMENT_SET_FAILED: ${error.message}`);
        }
      }
    },

    removeCommitment: async (id: string, type: 'todo' | 'habit', reason?: string | null) => {
      const userId = get().userId;
      if (!userId) throw new Error('Not authenticated');

      const archivedAt = new Date().toISOString();
      const table = type === 'habit' ? 'habits' : 'todos';

      // 1. Optimistic update to Zustand
      if (type === 'todo') {
        set((state) => ({
          todos: state.todos.map((t) =>
            t.id === id
              ? {
                  ...t,
                  commitment: false,
                  commitment_archived_at: archivedAt,
                  commitment_note: reason ?? t.commitment_note,
                }
              : t,
          ),
        }));
      } else {
        // Habit: set commitment_until to null
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id
              ? {
                  ...h,
                  commitment_until: null,
                  commitment_archived_at: archivedAt,
                  commitment_note: reason ?? h.commitment_note,
                }
              : h,
          ),
        }));
      }

      // 2. Persist to Supabase directly
      if (type === 'todo') {
        const { error } = await supabase
          .from(table)
          .update({
            commitment: false,
            commitment_archived_at: archivedAt,
            ...(reason ? { commitment_note: reason } : {}),
          })
          .eq('id', id)
          .eq('owner_id', userId);

        if (error) {
          console.error('[GremlyStore] removeCommitment failed:', error);
          throw new Error(`COMMITMENT_REMOVE_FAILED: ${error.message}`);
        }
      } else {
        // Habit: set commitment_until to null
        const { error } = await supabase
          .from(table)
          .update({
            commitment_until: null,
            commitment_archived_at: archivedAt,
            ...(reason ? { commitment_note: reason } : {}),
          })
          .eq('id', id)
          .eq('owner_id', userId);

        if (error) {
          console.error('[GremlyStore] removeCommitment failed:', error);
          throw new Error(`COMMITMENT_REMOVE_FAILED: ${error.message}`);
        }
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // CALENDAR INTEGRATION ACTIONS
    // ═══════════════════════════════════════════════════════════════════

    refreshCalendarConnections: async () => {
      try {
        const connections = await calendarClient.getConnectionStatus();
        set({ calendarConnections: connections });
      } catch (error) {
        console.error('[GremlyStore] refreshCalendarConnections failed:', error);
      }
    },

    fetchCalendarEventsForRange: async (startDate: string, endDate: string) => {
      console.log('[GremlyStore] fetchCalendarEventsForRange called:', startDate, 'to', endDate);
      set({ calendarLoading: true });

      try {
        const events = await calendarClient.getEvents(startDate, endDate);
        console.log('[GremlyStore] calendarClient.getEvents returned:', events.length, 'events');

        // Group events by date (YYYY-MM-DD from startAt)
        const eventsByDate: Record<string, CalendarEvent[]> = { ...get().calendarEvents };

        for (const event of events) {
          // Extract local date from UTC datetime
          // Worker returns ISO strings with Z suffix (UTC), new Date() converts to local
          const eventDate = new Date(event.startAt);
          const dateKey = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
          console.log(
            '[GremlyStore] Event:',
            event.title,
            'startAt:',
            event.startAt,
            '-> dateKey:',
            dateKey,
          );

          const existing = eventsByDate[dateKey] || [];
          // Avoid duplicates by checking event ID
          const alreadyExists = existing.some((e) => e.id === event.id);
          if (!alreadyExists) {
            eventsByDate[dateKey] = [...existing, event];
          }
        }

        console.log('[GremlyStore] eventsByDate keys:', Object.keys(eventsByDate));
        set({
          calendarEvents: eventsByDate,
          calendarLoading: false,
          calendarLastFetched: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[GremlyStore] fetchCalendarEventsForRange failed:', error);
        set({ calendarLoading: false });
      }
    },

    connectCalendar: async (provider: CalendarProvider) => {
      try {
        let result: { success: boolean; error?: string };

        if (provider === 'outlook') {
          result = await calendarClient.connectOutlook();
        } else {
          // Google not yet implemented
          result = { success: false, error: 'Google Calendar not yet supported' };
        }

        if (result.success) {
          // Refresh connections to get updated status
          await get().refreshCalendarConnections();
        }

        return result;
      } catch (error) {
        console.error('[GremlyStore] connectCalendar failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    },

    connectIcsCalendar: async (icsUrl: string, label?: string) => {
      try {
        const result = await calendarClient.connectIcs(icsUrl, label);

        if (result.success) {
          await get().refreshCalendarConnections();
        }

        return result;
      } catch (error) {
        console.error('[Store] connectIcsCalendar error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    disconnectCalendar: async (provider: CalendarProvider) => {
      try {
        const result = await calendarClient.disconnect(provider);

        if (result.success) {
          // Remove provider from connections
          set({
            calendarConnections: get().calendarConnections.filter((c) => c.provider !== provider),
          });

          // Clear events from that provider
          const eventsByDate: Record<string, CalendarEvent[]> = {};
          for (const [date, events] of Object.entries(get().calendarEvents)) {
            const filtered = events.filter((e) => e.provider !== provider);
            if (filtered.length > 0) {
              eventsByDate[date] = filtered;
            }
          }
          set({ calendarEvents: eventsByDate });
        }
      } catch (error) {
        console.error('[GremlyStore] disconnectCalendar failed:', error);
      }
    },

    clearCalendarEvents: () => {
      set({
        calendarEvents: {},
        calendarLastFetched: null,
      });
    },

    hideCalendarEvent: (date: string, eventId: string) => {
      set((state) => {
        const current = state.hiddenCalendarEventsByDate[date] ?? [];
        if (current.includes(eventId)) return state; // Already hidden
        const updated = {
          ...state.hiddenCalendarEventsByDate,
          [date]: [...current, eventId],
        };
        // Persist to AsyncStorage (fire and forget)
        saveHiddenEventsToStorage(updated);
        return { hiddenCalendarEventsByDate: updated };
      });
    },

    unhideCalendarEvent: (date: string, eventId: string) => {
      set((state) => {
        const current = state.hiddenCalendarEventsByDate[date] ?? [];
        const updated = {
          ...state.hiddenCalendarEventsByDate,
          [date]: current.filter((id) => id !== eventId),
        };
        // Persist to AsyncStorage (fire and forget)
        saveHiddenEventsToStorage(updated);
        return { hiddenCalendarEventsByDate: updated };
      });
    },

    unhideAllCalendarEventsForDate: (date: string) => {
      set((state) => {
        const { [date]: _, ...rest } = state.hiddenCalendarEventsByDate;
        // Persist to AsyncStorage (fire and forget)
        saveHiddenEventsToStorage(rest);
        return { hiddenCalendarEventsByDate: rest };
      });
    },

    // ═══════════════════════════════════════════════════════════════════
    // USER CALENDAR EVENTS (Quick-add entries)
    // ═══════════════════════════════════════════════════════════════════

    setUserCalendarEvents: (events) => set({ userCalendarEvents: events }),

    createUserCalendarEvent: async (eventData) => {
      const tempId = `temp_${Date.now()}`;
      const now = new Date().toISOString();
      const userId = get().userId;

      if (!userId) throw new Error('Not authenticated');

      const optimisticEvent: UserCalendarEvent = {
        ...eventData,
        id: tempId,
        type: 'calendar_event',
        owner_id: userId,
        source: 'user',
        created_at: now,
        updated_at: now,
      };

      // Optimistic update
      set((state) => ({
        userCalendarEvents: [...state.userCalendarEvents, optimisticEvent],
      }));

      // Persist to Supabase
      const { data, error } = await supabase
        .from('calendar_events')
        .insert({
          owner_id: userId,
          title: eventData.title,
          event_date: eventData.event_date,
          event_time: eventData.event_time,
          duration_minutes: eventData.duration_minutes,
          space_id: eventData.space_id,
          notes: eventData.notes,
          source: 'user',
        })
        .select()
        .single();

      if (error) {
        // Rollback on error
        set((state) => ({
          userCalendarEvents: state.userCalendarEvents.filter((e) => e.id !== tempId),
        }));
        console.error('[GremlyStore] createUserCalendarEvent failed:', error);
        throw error;
      }

      // Replace temp with real
      set((state) => ({
        userCalendarEvents: state.userCalendarEvents.map((e) =>
          e.id === tempId ? { ...data, type: 'calendar_event' as const } : e,
        ),
      }));

      return { ...data, type: 'calendar_event' as const };
    },

    updateUserCalendarEvent: async (id, patch) => {
      const prev = get().userCalendarEvents.find((e) => e.id === id);
      const now = new Date().toISOString();

      // Optimistic update
      set((state) => ({
        userCalendarEvents: state.userCalendarEvents.map((e) =>
          e.id === id ? { ...e, ...patch, updated_at: now } : e,
        ),
      }));

      const { error } = await supabase
        .from('calendar_events')
        .update({ ...patch, updated_at: now })
        .eq('id', id);

      if (error && prev) {
        // Rollback
        set((state) => ({
          userCalendarEvents: state.userCalendarEvents.map((e) => (e.id === id ? prev : e)),
        }));
        console.error('[GremlyStore] updateUserCalendarEvent failed:', error);
        throw error;
      }
    },

    deleteUserCalendarEvent: async (id) => {
      const prev = get().userCalendarEvents.find((e) => e.id === id);

      // Optimistic delete
      set((state) => ({
        userCalendarEvents: state.userCalendarEvents.filter((e) => e.id !== id),
      }));

      const { error } = await supabase.from('calendar_events').delete().eq('id', id);

      if (error && prev) {
        // Rollback
        set((state) => ({
          userCalendarEvents: [...state.userCalendarEvents, prev],
        }));
        console.error('[GremlyStore] deleteUserCalendarEvent failed:', error);
        throw error;
      }
    },

    setEventTimeOverride: (eventId: string, startAt: string, endAt: string) => {
      set((state) => {
        const updated = {
          ...state.eventTimeOverrides,
          [eventId]: { startAt, endAt },
        };
        // Persist to AsyncStorage
        saveEventTimeOverridesToStorage(updated);
        return { eventTimeOverrides: updated };
      });
    },

    clearEventTimeOverride: (eventId: string) => {
      set((state) => {
        const { [eventId]: _, ...rest } = state.eventTimeOverrides;
        // Persist to AsyncStorage
        saveEventTimeOverridesToStorage(rest);
        return { eventTimeOverrides: rest };
      });
    },

    clearAllEventTimeOverrides: () => {
      set({ eventTimeOverrides: {} });
      saveEventTimeOverridesToStorage({});
    },

    // ═══════════════════════════════════════════════════════════════════
    // TIME BLOCK PREFERENCES
    // ═══════════════════════════════════════════════════════════════════

    setTimeBlockPreferences: (preferences) => {
      set({ timeBlockPreferences: preferences });
      saveTimeBlockPreferencesToStorage(preferences);
    },

    resetTimeBlockPreferences: () => {
      set({ timeBlockPreferences: DEFAULT_TIME_BLOCK_PREFERENCES });
      saveTimeBlockPreferencesToStorage(DEFAULT_TIME_BLOCK_PREFERENCES);
    },

    // ═══════════════════════════════════════════════════════════════════
    // HIDDEN TODAY (NOT TODAY) ACTIONS
    // Hide todos/habits from Morning Brief for today only (auto-resets daily)
    // ═══════════════════════════════════════════════════════════════════

    hideForToday: (id: string) => {
      const today = getDateService().getCurrentDate();
      set((state) => {
        // If the stored date is not today, start fresh
        if (state.hiddenTodayDate !== today) {
          const newData = { date: today, ids: [id] };
          saveHiddenTodayToStorage(newData);
          return {
            hiddenTodayIds: [id],
            hiddenTodayDate: today,
          };
        }
        // Otherwise add to existing list (if not already there)
        if (state.hiddenTodayIds.includes(id)) {
          return state;
        }
        const newIds = [...state.hiddenTodayIds, id];
        saveHiddenTodayToStorage({ date: today, ids: newIds });
        return {
          hiddenTodayIds: newIds,
        };
      });
    },

    unhideForToday: (id: string) => {
      set((state) => {
        const newIds = state.hiddenTodayIds.filter((i) => i !== id);
        if (state.hiddenTodayDate) {
          saveHiddenTodayToStorage({ date: state.hiddenTodayDate, ids: newIds });
        }
        return {
          hiddenTodayIds: newIds,
        };
      });
    },

    clearHiddenToday: () => {
      set({ hiddenTodayIds: [], hiddenTodayDate: null });
      AsyncStorage.removeItem(HIDDEN_TODAY_STORAGE_KEY);
    },

    // ═══════════════════════════════════════════════════════════════════
    // EVENT BUS SUBSCRIPTION
    // Listens for entity events from other parts of the app (MindDrop, etc.)
    // This enables bidirectional sync during the migration period
    // ═══════════════════════════════════════════════════════════════════

    subscribeToEvents: () => {
      // Handler for entity:created events
      const handleEntityCreated = (payload: {
        entity: any;
        type: string;
        spaceId?: string | null;
        source?: string;
      }) => {
        console.log('[GremlyStore] entity:created received', {
          type: payload.type,
          entityId: payload.entity?.id,
          source: payload.source,
          hasEntity: !!payload.entity,
        });

        // Skip events emitted by this store to prevent duplicate handling
        if (payload.source === STORE_EVENT_SOURCE) {
          console.log('[GremlyStore] Skipping self-emitted event');
          return;
        }

        const state = get();
        const entity = payload.entity;

        if (!entity?.id) {
          console.warn('[GremlyStore] entity:created received without valid entity');
          return;
        }

        if (payload.type === 'todo') {
          // Only add if not already in store
          if (!state.todos.some((t) => t.id === entity.id)) {
            set({ todos: [...state.todos, entity as Todo] });
            console.log('[GremlyStore] ✅ Added todo from EventBus:', entity.id);
          } else {
            console.log('[GremlyStore] Todo already exists, skipping:', entity.id);
          }
        } else if (payload.type === 'habit') {
          if (!state.habits.some((h) => h.id === entity.id)) {
            set({ habits: [...state.habits, entity as Habit] });
            console.log('[GremlyStore] ✅ Added habit from EventBus:', entity.id);
          } else {
            console.log('[GremlyStore] Habit already exists, skipping:', entity.id);
          }
        } else if (payload.type === 'note') {
          if (!state.notes.some((n) => n.id === entity.id)) {
            set({ notes: [...state.notes, entity as Note] });
            console.log('[GremlyStore] ✅ Added note from EventBus:', entity.id);
          } else {
            console.log('[GremlyStore] Note already exists, skipping:', entity.id);
          }
        } else if (payload.type === 'space') {
          if (!state.spaces.some((s) => s.id === entity.id)) {
            set({ spaces: [...state.spaces, entity as Space] });
            console.log('[GremlyStore] ✅ Added space from EventBus:', entity.id);
          } else {
            console.log('[GremlyStore] Space already exists, skipping:', entity.id);
          }
        } else {
          console.log('[GremlyStore] Unknown entity type, ignoring:', payload.type);
        }
      };

      // Handler for entity:updated events
      const handleEntityUpdated = (payload: {
        entity: any;
        type: string;
        spaceId?: string | null;
        source?: string;
      }) => {
        // Skip events emitted by this store
        if (payload.source === STORE_EVENT_SOURCE) return;

        const state = get();
        const entity = payload.entity;

        if (!entity?.id) return;

        if (payload.type === 'todo') {
          set({
            todos: state.todos.map((t) => (t.id === entity.id ? { ...t, ...entity } : t)),
          });
          console.log('[GremlyStore] Updated todo from EventBus:', entity.id);
        } else if (payload.type === 'habit') {
          set({
            habits: state.habits.map((h) => (h.id === entity.id ? { ...h, ...entity } : h)),
          });
          console.log('[GremlyStore] Updated habit from EventBus:', entity.id);
        } else if (payload.type === 'note') {
          set({
            notes: state.notes.map((n) => (n.id === entity.id ? { ...n, ...entity } : n)),
          });
          console.log('[GremlyStore] Updated note from EventBus:', entity.id);
        } else if (payload.type === 'space') {
          set({
            spaces: state.spaces.map((s) => (s.id === entity.id ? { ...s, ...entity } : s)),
          });
          console.log('[GremlyStore] Updated space from EventBus:', entity.id);
        }
      };

      // Handler for entity:deleted events
      const handleEntityDeleted = (payload: {
        id: string;
        type?: string;
        spaceId?: string | null;
        source?: string;
      }) => {
        // Skip events emitted by this store
        if (payload.source === STORE_EVENT_SOURCE) return;

        const state = get();
        const { id, type } = payload;

        if (type === 'todo') {
          set({ todos: state.todos.filter((t) => t.id !== id) });
          console.log('[GremlyStore] Deleted todo from EventBus:', id);
        } else if (type === 'habit') {
          set({ habits: state.habits.filter((h) => h.id !== id) });
          console.log('[GremlyStore] Deleted habit from EventBus:', id);
        } else if (type === 'note') {
          set({ notes: state.notes.filter((n) => n.id !== id) });
          console.log('[GremlyStore] Deleted note from EventBus:', id);
        } else if (type === 'space') {
          set({ spaces: state.spaces.filter((s) => s.id !== id) });
          console.log('[GremlyStore] Deleted space from EventBus:', id);
        }
      };

      // Handler for legacy ItemUpdated events (from useTodayInteractions, etc.)
      const handleItemUpdated = (payload: { id: string; type?: string; source?: string }) => {
        if (payload.source === STORE_EVENT_SOURCE) return;

        // For ItemUpdated, we need to fetch the latest from Supabase
        // since the payload doesn't contain the full entity
        const fetchAndUpdate = async () => {
          const state = get();
          const userId = state.userId;
          if (!userId) return;

          // Try to find which type this ID belongs to
          const inTodos = state.todos.some((t) => t.id === payload.id);
          const inHabits = state.habits.some((h) => h.id === payload.id);
          const inNotes = state.notes.some((n) => n.id === payload.id);

          if (inTodos || payload.type === 'todo') {
            const { data } = await supabase.from('todos').select('*').eq('id', payload.id).single();
            if (data) {
              set({
                todos: state.todos.map((t) => (t.id === payload.id ? data : t)),
              });
              console.log('[GremlyStore] Synced todo from ItemUpdated:', payload.id);
            }
          } else if (inHabits || payload.type === 'habit') {
            const { data } = await supabase
              .from('habits')
              .select('*')
              .eq('id', payload.id)
              .single();
            if (data) {
              set({
                habits: state.habits.map((h) => (h.id === payload.id ? data : h)),
              });
              console.log('[GremlyStore] Synced habit from ItemUpdated:', payload.id);
            }
          } else if (inNotes || payload.type === 'note') {
            const { data } = await supabase.from('notes').select('*').eq('id', payload.id).single();
            if (data) {
              set({
                notes: state.notes.map((n) => (n.id === payload.id ? data : n)),
              });
              console.log('[GremlyStore] Synced note from ItemUpdated:', payload.id);
            }
          }
        };

        void fetchAndUpdate();
      };

      // Handler for entity:enriched events (Phase 2 enrichment updates)
      // First applies event payload for immediate UI update, then refetches for completeness
      const handleEntityEnriched = (payload: {
        entityId: string;
        smartTitle?: string;
        tags?: string[];
        timeEstimate?: number | null;
        time_window?: string | null;
        dueDate?: string | null;
        startDate?: string | null;
        frequency?: string | null;
        cadence?: string | null;
        target_per_period?: number | null;
        confirmationMessage?: string | null;
        space_id?: string | null;
      }) => {
        const {
          entityId,
          smartTitle,
          tags,
          timeEstimate,
          time_window,
          dueDate,
          startDate,
          frequency,
          cadence,
          target_per_period,
          confirmationMessage,
          space_id,
        } = payload;

        // Immediately apply known fields from event payload for responsive UI
        const state = get();
        const inTodos = state.todos.some((t) => t.id === entityId);
        const inHabits = state.habits.some((h) => h.id === entityId);
        const inNotes = state.notes.some((n) => n.id === entityId);

        if (inTodos) {
          set({
            todos: state.todos.map((t) => {
              if (t.id !== entityId) return t;
              return {
                ...t,
                ...(smartTitle !== undefined && { name: smartTitle, title: smartTitle }),
                ...(tags !== undefined && { tags }),
                ...(timeEstimate !== undefined && { time_estimate_minutes: timeEstimate }),
                ...(time_window !== undefined && {
                  time_window: time_window as Todo['time_window'],
                }),
                ...(dueDate !== undefined && { due_date: dueDate }),
                ...(space_id !== undefined && { space_id }),
              };
            }),
          });
        } else if (inHabits) {
          set({
            habits: state.habits.map((h) => {
              if (h.id !== entityId) return h;
              return {
                ...h,
                ...(smartTitle !== undefined && { name: smartTitle, title: smartTitle }),
                ...(tags !== undefined && { tags }),
                ...(timeEstimate !== undefined && { time_estimate_minutes: timeEstimate }),
                ...(time_window !== undefined && {
                  time_window: time_window as Habit['time_window'],
                }),
                ...(startDate !== undefined && { start_date: startDate }),
                ...(frequency !== undefined && frequency !== null && { frequency }),
                ...(cadence !== undefined &&
                  cadence !== null && { cadence: cadence as Habit['cadence'] }),
                ...(target_per_period !== undefined &&
                  target_per_period !== null && { target_per_period }),
                ...(space_id !== undefined && { space_id }),
              };
            }),
          });
        } else if (inNotes) {
          set({
            notes: state.notes.map((n) => {
              if (n.id !== entityId) return n;
              return {
                ...n,
                ...(smartTitle !== undefined && { title: smartTitle }),
                ...(tags !== undefined && { tags }),
                ...(space_id !== undefined && { space_id }),
              };
            }),
          });
        }

        // Then refetch from DB for any fields not in the event payload
        const fetchAndUpdate = async () => {
          const state = get();
          const userId = state.userId;
          if (!userId) return;

          if (inTodos) {
            const { data } = await supabase.from('todos').select('*').eq('id', entityId).single();
            if (data) {
              set({
                todos: state.todos.map((t) => (t.id === entityId ? { ...t, ...data } : t)),
              });
              console.log('[GremlyStore] ✅ Synced todo from entity:enriched:', entityId);
            }
          } else if (inHabits) {
            const { data } = await supabase.from('habits').select('*').eq('id', entityId).single();
            if (data) {
              set({
                habits: state.habits.map((h) => (h.id === entityId ? { ...h, ...data } : h)),
              });
              console.log('[GremlyStore] ✅ Synced habit from entity:enriched:', entityId);
            }
          } else if (inNotes) {
            const { data } = await supabase.from('notes').select('*').eq('id', entityId).single();
            if (data) {
              set({
                notes: state.notes.map((n) => (n.id === entityId ? { ...n, ...data } : n)),
              });
              console.log('[GremlyStore] ✅ Synced note from entity:enriched:', entityId);
            }
          } else {
            console.log('[GremlyStore] entity:enriched for unknown entity:', entityId);
          }
        };

        void fetchAndUpdate();
      };

      // Subscribe to entity lifecycle events
      const unsub1 = eventBus.on('entity:created', handleEntityCreated);
      const unsub2 = eventBus.on('entity:updated', handleEntityUpdated);
      const unsub3 = eventBus.on('entity:deleted', handleEntityDeleted);

      // Subscribe to enrichment events (Phase 2 updates)
      const unsub6 = eventBus.on('entity:enriched', handleEntityEnriched);

      // Subscribe to legacy events for backward compatibility
      const unsub4 = eventBus.on('ItemUpdated', handleItemUpdated);
      const unsub5 = eventBus.on('ItemCompleted', handleItemUpdated);

      // Return combined unsubscribe function
      return () => {
        unsub1();
        unsub2();
        unsub3();
        unsub4();
        unsub5();
        unsub6();
      };
    },

    // ═══════════════════════════════════════════════════════════════════
    // MINDDROP CRASH RECOVERY
    // Recovers items stuck in enrichment state from previous app crashes
    // ═══════════════════════════════════════════════════════════════════

    recoverStuckMindDrops: async () => {
      const userId = get().userId;
      if (!userId) return;

      const STUCK_THRESHOLD_MS = 30000; // 30 seconds
      const now = Date.now();
      const cutoffTime = new Date(now - STUCK_THRESHOLD_MS).toISOString();

      try {
        // Find todos stuck in enrichment (views->minddrop_stage is streaming, enriching, or pending)
        const { data: stuckTodos } = await supabase
          .from('todos')
          .select('id, views, updated_at')
          .eq('owner_id', userId)
          .or(
            'views->minddrop_stage.eq.streaming,views->minddrop_stage.eq.enriching,views->minddrop_stage.eq.pending',
          )
          .lt('updated_at', cutoffTime);

        // Find habits stuck in enrichment
        const { data: stuckHabits } = await supabase
          .from('habits')
          .select('id, views, updated_at')
          .eq('owner_id', userId)
          .or(
            'views->minddrop_stage.eq.streaming,views->minddrop_stage.eq.enriching,views->minddrop_stage.eq.pending',
          )
          .lt('updated_at', cutoffTime);

        // Find notes stuck in enrichment
        const { data: stuckNotes } = await supabase
          .from('notes')
          .select('id, views, updated_at')
          .eq('owner_id', userId)
          .or(
            'views->minddrop_stage.eq.streaming,views->minddrop_stage.eq.enriching,views->minddrop_stage.eq.pending',
          )
          .lt('updated_at', cutoffTime);

        const totalStuck =
          (stuckTodos?.length ?? 0) + (stuckHabits?.length ?? 0) + (stuckNotes?.length ?? 0);

        if (totalStuck === 0) {
          return; // Nothing stuck, no log needed
        }

        console.log(`[GremlyStore] 🔧 Found ${totalStuck} stuck MindDrop items, recovering...`, {
          todos: stuckTodos?.length ?? 0,
          habits: stuckHabits?.length ?? 0,
          notes: stuckNotes?.length ?? 0,
        });

        // Reset stuck todos - mark as classified (ready for manual editing)
        for (const todo of stuckTodos ?? []) {
          const updatedViews = {
            ...(todo.views as Record<string, unknown>),
            ai_pending: false,
            ai_failed: true,
            minddrop_stage: 'classified',
          };
          await supabase.from('todos').update({ views: updatedViews }).eq('id', todo.id);
        }

        // Reset stuck habits
        for (const habit of stuckHabits ?? []) {
          const updatedViews = {
            ...(habit.views as Record<string, unknown>),
            ai_pending: false,
            ai_failed: true,
            minddrop_stage: 'classified',
          };
          await supabase.from('habits').update({ views: updatedViews }).eq('id', habit.id);
        }

        // Reset stuck notes
        for (const note of stuckNotes ?? []) {
          const updatedViews = {
            ...(note.views as Record<string, unknown>),
            ai_pending: false,
            ai_failed: true,
            minddrop_stage: 'classified',
          };
          await supabase.from('notes').update({ views: updatedViews }).eq('id', note.id);
        }

        // Update local store state
        const state = get();
        set({
          todos: state.todos.map((t) => {
            const stuck = stuckTodos?.find((s) => s.id === t.id);
            if (stuck) {
              return {
                ...t,
                views: {
                  ...(t.views as Record<string, unknown>),
                  ai_pending: false,
                  ai_failed: true,
                  minddrop_stage: 'classified',
                },
              };
            }
            return t;
          }),
          habits: state.habits.map((h) => {
            const stuck = stuckHabits?.find((s) => s.id === h.id);
            if (stuck) {
              return {
                ...h,
                views: {
                  ...(h.views as Record<string, unknown>),
                  ai_pending: false,
                  ai_failed: true,
                  minddrop_stage: 'classified',
                },
              };
            }
            return h;
          }),
          notes: state.notes.map((n) => {
            const stuck = stuckNotes?.find((s) => s.id === n.id);
            if (stuck) {
              return {
                ...n,
                views: {
                  ...(n.views as Record<string, unknown>),
                  ai_pending: false,
                  ai_failed: true,
                  minddrop_stage: 'classified',
                },
              };
            }
            return n;
          }),
        });

        console.log(`[GremlyStore] ✅ Recovered ${totalStuck} stuck MindDrop items`);
      } catch (error) {
        console.error('[GremlyStore] ❌ Failed to recover stuck MindDrop items:', error);
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // PENDING DROP ACTIONS (for optimistic Mind Drop queue)
    // ═══════════════════════════════════════════════════════════════════

    addPendingDrop: (drop: PendingDrop) => {
      set((state) => {
        const newPending = new Map(state.pendingDrops);
        newPending.set(drop.localId, drop);
        return { pendingDrops: newPending };
      });
      console.log('[GremlyStore] Added pending drop', { localId: drop.localId });
    },

    updatePendingDropClassification: (
      localId: string,
      classification: {
        bucket: 'todo' | 'habit' | 'log';
        subtype: 'journal' | 'idea' | 'general' | null;
      },
    ) => {
      set((state) => {
        const drop = state.pendingDrops.get(localId);
        if (!drop) return state;

        const updated: PendingDrop = { ...drop, ...classification, status: 'enriching' as const };
        const newPending = new Map(state.pendingDrops);
        newPending.set(localId, updated);
        return { pendingDrops: newPending };
      });
      console.log('[GremlyStore] Updated pending drop classification', {
        localId,
        ...classification,
      });
    },

    updatePendingDropEnrichment: (localId: string, enrichment: Partial<PendingDrop>) => {
      set((state) => {
        const drop = state.pendingDrops.get(localId);
        if (!drop) {
          console.warn('[GremlyStore] updatePendingDropEnrichment: drop not found', { localId });
          return state;
        }

        const updated: PendingDrop = { ...drop, ...enrichment };
        const newPending = new Map(state.pendingDrops);
        newPending.set(localId, updated);

        return { pendingDrops: newPending };
      });
    },

    /**
     * Update clarification fields on a synced entity by its drop_id.
     * This handles the race condition where Phase 1.5 completes after the drop
     * has already been synced to Supabase and promoted to an entity.
     */
    updateEntityClarificationByDropId: async (
      dropId: string,
      clarificationData: {
        question: string;
        options: Array<{ id: string; label: string; action: Record<string, unknown> }>;
      },
    ): Promise<boolean> => {
      const state = get();

      // Find the entity by drop_id in all collections
      const note = state.notes.find((n) => (n as any).drop_id === dropId);
      const todo = state.todos.find((t) => (t as any).drop_id === dropId);
      const habit = state.habits.find((h) => (h as any).drop_id === dropId);

      const entity = note || todo || habit;
      const entityType = note ? 'note' : todo ? 'todo' : habit ? 'habit' : null;

      if (!entity || !entityType) {
        console.warn('[GremlyStore] updateEntityClarificationByDropId: entity not found', {
          dropId,
        });
        return false;
      }

      console.log('[GremlyStore] updateEntityClarificationByDropId: found entity', {
        dropId,
        entityId: entity.id,
        entityType,
      });

      // Update the views with clarification data
      const currentViews = (entity as any).views || {};
      const updatedViews = {
        ...currentViews,
        clarification_question: clarificationData.question,
        clarification_options: clarificationData.options,
      };

      // Update via the appropriate update function
      if (entityType === 'note') {
        await get().updateNote(entity.id, { views: updatedViews } as any);
      } else if (entityType === 'todo') {
        await get().updateTodo(entity.id, { views: updatedViews } as any);
      } else if (entityType === 'habit') {
        await get().updateHabit(entity.id, { views: updatedViews } as any);
      }

      console.log('[GremlyStore] updateEntityClarificationByDropId: updated', {
        dropId,
        entityId: entity.id,
        question: clarificationData.question.substring(0, 30),
        optionsCount: clarificationData.options.length,
      });

      return true;
    },

    promotePendingDropToEntity: (localId: string, supabaseId: string) => {
      set((state) => {
        const newPending = new Map(state.pendingDrops);
        newPending.delete(localId);
        return { pendingDrops: newPending };
      });
      console.log('[GremlyStore] Promoted pending drop to entity', { localId, supabaseId });
    },

    removePendingDrop: (localId: string) => {
      set((state) => {
        const newPending = new Map(state.pendingDrops);
        newPending.delete(localId);
        return { pendingDrops: newPending };
      });
      console.log('[GremlyStore] Removed pending drop', { localId });
    },

    resolvePendingDropClarification: async (localId, optionId, isFreeText = false) => {
      const state = get();

      // ─────────────────────────────────────────────────────────────────────
      // PENDING DROPS: Items still in Mind Drop queue (not yet synced)
      // For pending drops, we update the local state and let the processor
      // handle the actual entity creation with the correct bucket
      // ─────────────────────────────────────────────────────────────────────
      const pendingDrop = state.pendingDrops.get(localId);

      if (pendingDrop && (isFreeText || pendingDrop.clarification_options)) {
        // Determine the selected label based on whether it's free text or a predefined option
        let selectedLabel: string;
        if (isFreeText) {
          // User typed their own explanation - use it directly
          selectedLabel = optionId;
          console.log(
            '[GremlyStore] Using free text as selectedLabel:',
            selectedLabel.substring(0, 50),
          );
        } else {
          // User selected a predefined option - look up the label
          const selectedOption = pendingDrop.clarification_options?.find(
            (opt) => opt.id === optionId,
          );
          if (!selectedOption) {
            console.warn('[GremlyStore] Pending drop option not found:', { localId, optionId });
            return;
          }
          selectedLabel = selectedOption.label;
        }

        console.log('[GremlyStore] Resolving pending drop clarification', {
          localId,
          optionId: isFreeText ? '(free text)' : optionId,
          selectedLabel: selectedLabel.substring(0, 50),
        });

        // Set processing state BEFORE API calls to trigger card loading animation
        set((s) => {
          const pendingDrops = new Map(s.pendingDrops);
          const drop = pendingDrops.get(localId);
          if (drop) {
            pendingDrops.set(localId, {
              ...drop,
              clarification_processing: true,
            });
          }
          return { pendingDrops };
        });
        console.log('[GremlyStore] Set clarification_processing: true for pending drop:', localId);

        // Call reclassify endpoint to get bucket, dates, time estimate
        try {
          const cortexUrl = env.cortexUrl;
          if (cortexUrl) {
            const reclassifyResponse = await fetch(cortexUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'reclassify-after-clarification',
                text: pendingDrop.text || pendingDrop.smartTitle || '',
                selectedLabel: selectedLabel,
                currentDate: getDateService().getCurrentDate(),
                targetBucket: pendingDrop.bucket, // Hint for time estimation
              }),
            });

            if (reclassifyResponse.ok) {
              const result = await reclassifyResponse.json();
              console.log('[GremlyStore] Pending drop reclassify result', {
                localId,
                newBucket: result.bucket,
                newTitle: result.smart_title,
                targetDate: result.target_date,
                scheduledDate: result.scheduled_date,
                timeEstimate: result.time_estimate_minutes,
                latency_ms: result.latency_ms,
              });

              // Update the pending drop with reclassified data
              set((s) => {
                const pendingDrops = new Map(s.pendingDrops);
                const drop = pendingDrops.get(localId);
                if (!drop) return s;

                const updatedDrop: PendingDrop = {
                  ...drop,
                  bucket: result.bucket || drop.bucket,
                  subtype: result.subtype || drop.subtype,
                  smartTitle: result.smart_title || drop.smartTitle,
                  confirmationMessage: result.confirmation_message || drop.confirmationMessage,
                  timeEstimateMinutes: result.time_estimate_minutes ?? drop.timeEstimateMinutes,
                  // Date intelligence
                  target_date: result.target_date || null,
                  scheduled_date: result.scheduled_date || null,
                  // Mark clarification as resolved
                  clarification_resolved: true,
                  needs_clarification: false,
                };

                pendingDrops.set(localId, updatedDrop);
                return { pendingDrops };
              });
              return;
            }
          }
        } catch (error) {
          console.log('[GremlyStore] Pending drop reclassify failed:', error);
        }

        // Fallback: just mark as resolved without reclassifying
        set((s) => {
          const pendingDrops = new Map(s.pendingDrops);
          const drop = pendingDrops.get(localId);
          if (!drop) return s;

          const updatedDrop: PendingDrop = {
            ...drop,
            clarification_resolved: true,
            needs_clarification: false,
          };

          pendingDrops.set(localId, updatedDrop);
          console.log('[GremlyStore] Pending drop clarification resolved (fallback)', {
            localId,
          });

          return { pendingDrops };
        });
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // SYNCED ENTITIES: Items already in Supabase (todo, habit, or note)
      // ─────────────────────────────────────────────────────────────────────
      const entityId = localId;

      // Find the entity across all types
      let entity: Todo | Habit | Note | undefined;
      let entityType: 'todo' | 'habit' | 'note' | undefined;

      entity = state.todos.find((t) => t.id === entityId);
      if (entity) {
        entityType = 'todo';
      } else {
        entity = state.habits.find((h) => h.id === entityId);
        if (entity) {
          entityType = 'habit';
        } else {
          entity = state.notes.find((n) => n.id === entityId);
          if (entity) {
            entityType = 'note';
          }
        }
      }

      if (!entity || !entityType) {
        console.warn('[GremlyStore] resolvePendingDropClarification: Entity not found', {
          entityId,
        });
        return;
      }

      // Get clarification options from views (where they're stored)
      // Options now just have id and label (no action.bucket)
      const views = entity.views as Record<string, unknown> | undefined;
      const clarificationOptions = views?.clarification_options as
        | Array<{ id: string; label: string }>
        | undefined;

      // Determine the selected label based on whether it's free text or a predefined option
      let selectedLabel: string;
      if (isFreeText) {
        // User typed their own explanation - use it directly
        selectedLabel = optionId;
        console.log(
          '[GremlyStore] Using free text as selectedLabel for synced entity:',
          selectedLabel.substring(0, 50),
        );
      } else {
        // User selected a predefined option - look up the label
        if (!clarificationOptions) {
          console.warn('[GremlyStore] resolvePendingDropClarification: No clarification options', {
            entityId,
          });
          return;
        }

        const selectedOption = clarificationOptions.find((opt) => opt.id === optionId);
        if (!selectedOption) {
          console.warn('[GremlyStore] resolvePendingDropClarification: Option not found', {
            entityId,
            optionId,
          });
          return;
        }
        selectedLabel = selectedOption.label;
      }

      // Get original text for reclassification
      const originalTitle = (entity as Note).title || (entity as any).name || '';
      const originalBody = (entity as Note).body || '';
      const originalText = originalBody || originalTitle;
      const currentBucket =
        entityType === 'todo' ? 'todo' : entityType === 'habit' ? 'habit' : 'log';

      console.log('[GremlyStore] Resolving synced entity clarification', {
        entityId,
        entityType,
        currentBucket,
        selectedLabel: selectedLabel.substring(0, 50),
        originalTextPreview: originalText.substring(0, 50),
      });

      // Set processing state BEFORE API calls to trigger card loading animation
      // Update the entity's views.ai_pending flag to trigger shimmer in the card
      if (entityType === 'note') {
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === entityId
              ? { ...n, views: { ...(n.views as Record<string, unknown> || {}), ai_pending: true, clarification_processing: true } }
              : n
          ),
        }));
      } else if (entityType === 'todo') {
        set((s) => ({
          todos: s.todos.map((t) =>
            t.id === entityId
              ? { ...t, views: { ...(t.views as Record<string, unknown> || {}), ai_pending: true, clarification_processing: true } }
              : t
          ),
        }));
      } else if (entityType === 'habit') {
        set((s) => ({
          habits: s.habits.map((h) =>
            h.id === entityId
              ? { ...h, views: { ...(h.views as Record<string, unknown> || {}), ai_pending: true, clarification_processing: true } }
              : h
          ),
        }));
      }
      console.log('[GremlyStore] Set ai_pending: true for entity:', { entityId, entityType });

      // ─────────────────────────────────────────────────────────────────────
      // CALL RECLASSIFY ENDPOINT
      // This determines: bucket, subtype, dates, time estimate, title
      // ─────────────────────────────────────────────────────────────────────
      let reclassifyResult: {
        bucket?: 'todo' | 'habit' | 'log';
        subtype?: string | null;
        habit_subtype?: string | null;
        smart_title?: string;
        confirmation_message?: string;
        target_date?: string | null;
        scheduled_date?: string | null;
        time_estimate_minutes?: number | null;
        energy_type?: string | null;
        latency_ms?: number;
      } = {};

      try {
        const cortexUrl = env.cortexUrl;
        if (cortexUrl) {
          console.log('[GremlyStore] Calling reclassify endpoint...');
          const reclassifyResponse = await fetch(cortexUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'reclassify-after-clarification',
              text: originalText,
              selectedLabel: selectedLabel,
              currentDate: getDateService().getCurrentDate(),
              targetBucket: currentBucket, // Hint for time estimation
            }),
          });

          if (reclassifyResponse.ok) {
            reclassifyResult = await reclassifyResponse.json();
            console.log('[GremlyStore] Reclassify result', {
              entityId,
              newBucket: reclassifyResult.bucket,
              newTitle: reclassifyResult.smart_title,
              targetDate: reclassifyResult.target_date,
              scheduledDate: reclassifyResult.scheduled_date,
              timeEstimate: reclassifyResult.time_estimate_minutes,
              latency_ms: reclassifyResult.latency_ms,
            });
          } else {
            console.warn('[GremlyStore] Reclassify response not ok:', reclassifyResponse.status);
          }
        }
      } catch (reclassifyError) {
        console.log('[GremlyStore] Reclassify failed:', reclassifyError);
      }

      // Determine target bucket from reclassify result (fallback to current)
      const targetBucket = reclassifyResult.bucket || currentBucket;
      const bucketChanged = targetBucket !== currentBucket;

      // Extract values from reclassify result (with fallbacks)
      const newTitle =
        reclassifyResult.smart_title || originalTitle || originalText.substring(0, 50);
      const newConfirmation = reclassifyResult.confirmation_message || 'Updated.';
      const timeEstimate = reclassifyResult.time_estimate_minutes ?? null;
      const energyType = reclassifyResult.energy_type ?? null;
      const newSubtype = reclassifyResult.subtype ?? reclassifyResult.habit_subtype ?? null;

      // ─────────────────────────────────────────────────────────────────────
      // SAME BUCKET: Update the existing entity with reclassify data
      // ─────────────────────────────────────────────────────────────────────
      if (!bucketChanged) {
        console.log('[GremlyStore] Same bucket - updating with reclassify data', {
          entityId,
          newTitle,
          newConfirmation,
          targetDate: reclassifyResult.target_date,
          scheduledDate: reclassifyResult.scheduled_date,
        });

        // Build date updates from reclassify result
        const dateUpdate: Record<string, unknown> = {};
        if (reclassifyResult.target_date) {
          dateUpdate.due_day = reclassifyResult.target_date;
          dateUpdate.due_date = reclassifyResult.target_date;
          dateUpdate.target_date = reclassifyResult.target_date;
        }
        if (reclassifyResult.scheduled_date) {
          dateUpdate.scheduled_date = reclassifyResult.scheduled_date;
          dateUpdate.start_date = reclassifyResult.scheduled_date; // For habits
        }

        const updatedViews: Record<string, unknown> = {
          ...(views || {}),
          needs_clarification: false,
          clarification_resolved: true,
          confirmation_message: newConfirmation,
        };

        // Build updates object
        const updates: Record<string, unknown> = {
          views: updatedViews,
          needs_clarification: false,
          clarification_resolved: true,
          // Only include date fields for todos/habits - notes don't have due_date/due_day columns
          ...(entityType !== 'note' ? dateUpdate : {}),
        };

        // Set title/name and time estimate based on entity type
        if (entityType === 'note') {
          updates.title = newTitle;
        } else {
          updates.name = newTitle;
          if (timeEstimate !== null) {
            updates.time_estimate_minutes = timeEstimate;
          }
          if (energyType) {
            updates.energy_type = energyType;
          }
        }

        // Update subtype if specified
        if (newSubtype) {
          updates.subtype = newSubtype;
        }

        console.log('[GremlyStore] Same bucket updates:', {
          entityId,
          newTitle,
          newConfirmation,
          timeEstimate,
          hasDateUpdate: Object.keys(dateUpdate).length > 0,
        });

        if (entityType === 'todo') {
          await get().updateTodo(entityId, updates);
        } else if (entityType === 'habit') {
          await get().updateHabit(entityId, updates);
        } else {
          await get().updateNote(entityId, updates);
        }

        console.log('[GremlyStore] Same bucket clarification - reclassify applied:', { entityId });

        // ─────────────────────────────────────────────────────────────────────
        // PHASE 2 ENRICHMENT: Now call Phase 2 with the correct bucket
        // This extracts: tags, time_estimate, frequency, days, people, mood
        // The progressive update triggers chip animations in the card
        // ─────────────────────────────────────────────────────────────────────
        try {
          const cortexUrl = env.cortexUrl;
          if (cortexUrl) {
            // Combine original text with user's clarification so Phase 2 can extract frequency, dates, etc.
            const phase2Text = `${originalText} — ${selectedLabel}`;
            console.log('[GremlyStore] Phase 2 called with combined text:', {
              originalText: originalText.substring(0, 30),
              selectedLabel: selectedLabel.substring(0, 30),
              phase2Text: phase2Text.substring(0, 60),
            });
            
            const phase2Response = await fetch(cortexUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'enrich-phase2',
                text: phase2Text,
                bucket: targetBucket,
                subtype: newSubtype,
                currentDate: getDateService().getCurrentDate(),
              }),
            });

            if (phase2Response.ok) {
              const phase2Result = await phase2Response.json();
              console.log('[GremlyStore] Phase 2 enrichment result', {
                entityId,
                tags: phase2Result.tags,
                timeEstimate: phase2Result.time_estimate_minutes,
                people: phase2Result.people,
                frequency: phase2Result.frequency,
                latency_ms: phase2Result.latency_ms,
              });

              // Build Phase 2 updates
              const phase2Updates: Record<string, unknown> = {};

              if (phase2Result.tags && Array.isArray(phase2Result.tags) && phase2Result.tags.length > 0) {
                phase2Updates.tags = phase2Result.tags;
              }
              if (phase2Result.time_estimate_minutes != null) {
                phase2Updates.time_estimate_minutes = phase2Result.time_estimate_minutes;
              }
              if (phase2Result.energy_type) {
                phase2Updates.energy_type = phase2Result.energy_type;
              }
              if (phase2Result.people && Array.isArray(phase2Result.people) && phase2Result.people.length > 0) {
                phase2Updates.views = {
                  ...updatedViews,
                  people: phase2Result.people,
                };
              }
              // Habit-specific fields
              if (entityType === 'habit') {
                if (phase2Result.frequency) {
                  phase2Updates.frequency = phase2Result.frequency;
                  phase2Updates.cadence = phase2Result.frequency;
                }
                if (phase2Result.days && Array.isArray(phase2Result.days)) {
                  phase2Updates.days = phase2Result.days;
                }
              }

              // Apply Phase 2 updates if any
              if (Object.keys(phase2Updates).length > 0) {
                console.log('[GremlyStore] Applying Phase 2 updates:', {
                  entityId,
                  updateKeys: Object.keys(phase2Updates),
                });

                if (entityType === 'todo') {
                  await get().updateTodo(entityId, phase2Updates);
                } else if (entityType === 'habit') {
                  await get().updateHabit(entityId, phase2Updates);
                } else {
                  await get().updateNote(entityId, phase2Updates);
                }
              }
            } else {
              console.warn('[GremlyStore] Phase 2 response not ok:', phase2Response.status);
            }
          }
        } catch (phase2Error) {
          console.log('[GremlyStore] Phase 2 enrichment failed:', phase2Error);
          // Non-critical - entity already updated with reclassify data
        }

        // Clear processing state on the entity after Phase 2 (success or failure)
        if (entityType === 'note') {
          set((s) => ({
            notes: s.notes.map((n) =>
              n.id === entityId
                ? { ...n, views: { ...(n.views as Record<string, unknown> || {}), ai_pending: false, clarification_processing: false } }
                : n
            ),
          }));
        } else if (entityType === 'todo') {
          set((s) => ({
            todos: s.todos.map((t) =>
              t.id === entityId
                ? { ...t, views: { ...(t.views as Record<string, unknown> || {}), ai_pending: false, clarification_processing: false } }
                : t
            ),
          }));
        } else if (entityType === 'habit') {
          set((s) => ({
            habits: s.habits.map((h) =>
              h.id === entityId
                ? { ...h, views: { ...(h.views as Record<string, unknown> || {}), ai_pending: false, clarification_processing: false } }
                : h
            ),
          }));
        }
        console.log('[GremlyStore] Cleared processing state for entity:', { entityId, entityType });

        console.log('[GremlyStore] Same bucket clarification resolved:', { entityId });
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // BUCKET CHANGE: Create new entity and archive old one
      // ─────────────────────────────────────────────────────────────────────
      console.log('[GremlyStore] Bucket change required:', {
        from: currentBucket,
        to: targetBucket,
      });

      try {
        if (!supabase) {
          throw new Error('Supabase client not available');
        }

        const targetTable =
          targetBucket === 'todo' ? 'todos' : targetBucket === 'habit' ? 'habits' : 'notes';
        const sourceTable =
          entityType === 'note' ? 'notes' : entityType === 'todo' ? 'todos' : 'habits';

        // Get extracted date from views if available (fallback for dates if reclassify didn't return them)
        const extractedDate = (views?.extracted_date as string) || null;

        // Common fields for new entity
        const commonFields = {
          owner_id: entity.owner_id,
          tags: entity.tags || [],
          origin: (entity as any).origin || 'catchall',
          drop_id: (entity as any).drop_id,
          ai_placed: entity.ai_placed || false,
          space_id: entity.space_id || null,
          needs_clarification: false,
          clarification_resolved: true,
          views: {
            ...(views || {}),
            needs_clarification: false,
            clarification_resolved: true,
            converted_from: entityType,
            converted_at: new Date().toISOString(),
            confirmation_message: newConfirmation,
          },
        };

        let newEntityPayload: Record<string, unknown>;

        if (targetBucket === 'todo') {
          // Converting to TODO - use reclassify dates
          const body = originalBody;

          // Use target_date from reclassify result, or extracted date as fallback
          const dueDay = reclassifyResult.target_date
            ? reclassifyResult.target_date.split('T')[0]
            : extractedDate
              ? extractedDate.split('T')[0]
              : null;

          newEntityPayload = {
            ...commonFields,
            name: newTitle,
            title: newTitle,
            body: body !== newTitle ? body : null,
            subtype: newSubtype || null,
            status: 'active',
            undefined_due: !dueDay,
            due_day: dueDay,
            due_date: dueDay,
            target_date: dueDay,
            scheduled_date: reclassifyResult.scheduled_date
              ? reclassifyResult.scheduled_date.split('T')[0]
              : null,
            time_estimate_minutes: timeEstimate,
            energy_type: energyType || 'administrative',
            source_note_id: entityType === 'note' ? entityId : null,
          };
        } else if (targetBucket === 'habit') {
          // Converting to HABIT - use scheduled_date from reclassify
          const startDate = reclassifyResult.scheduled_date
            ? reclassifyResult.scheduled_date.split('T')[0]
            : extractedDate
              ? extractedDate.split('T')[0]
              : null;

          newEntityPayload = {
            ...commonFields,
            name: newTitle,
            title: newTitle,
            frequency: 'daily',
            cadence: 'daily',
            target_per_period: 1,
            time_window: 'day',
            time_estimate_minutes: timeEstimate,
            energy_type: energyType || 'physical',
            subtype: newSubtype || 'start_habit',
            start_date: startDate,
            start_date_confirmed: false,
          };
        } else {
          // Converting to NOTE (log)
          const body = originalBody || newTitle;

          newEntityPayload = {
            ...commonFields,
            title: newTitle,
            body: body,
            subtype: newSubtype || 'catchall',
            date: reclassifyResult.target_date
              ? reclassifyResult.target_date.split('T')[0]
              : extractedDate
                ? extractedDate.split('T')[0]
                : null,
          };
        }

        console.log('[GremlyStore] Creating new entity in', targetTable);
        console.log('[GremlyStore] newEntityPayload before insert:', {
          time_estimate_minutes: newEntityPayload.time_estimate_minutes,
          energy_type: newEntityPayload.energy_type,
          allKeys: Object.keys(newEntityPayload),
        });

        // Insert into new table
        const { data: insertedEntity, error: insertError } = await supabase
          .from(targetTable)
          .insert(newEntityPayload)
          .select()
          .single();

        if (insertError) {
          console.error('[GremlyStore] Failed to insert new entity:', insertError);
          throw insertError;
        }

        console.log('[GremlyStore] New entity created:', {
          id: insertedEntity.id,
          drop_id: insertedEntity.drop_id,
          originalDropId: (entity as any).drop_id,
        });
        console.log('[GremlyStore] Inserted entity time estimate:', {
          time_estimate_minutes: insertedEntity.time_estimate_minutes,
          energy_type: insertedEntity.energy_type,
        });

        // Verify drop_id was correctly set on the new entity
        // This maintains the link so RecentDrops can find the converted item
        if (!insertedEntity.drop_id && (entity as any).drop_id) {
          console.log('[GremlyStore] Updating drop_id on new entity...');
          await supabase
            .from(targetTable)
            .update({ drop_id: (entity as any).drop_id })
            .eq('id', insertedEntity.id);
        }

        // Archive the old entity (soft delete with reason)
        const archiveUpdates = {
          archived: true,
          archived_at: new Date().toISOString(),
          archived_reason: 'converted',
          views: {
            ...(views || {}),
            converted_to_type: targetBucket,
            converted_to_id: insertedEntity.id,
          },
        };

        const { error: archiveError } = await supabase
          .from(sourceTable)
          .update(archiveUpdates)
          .eq('id', entityId);

        if (archiveError) {
          console.error('[GremlyStore] Failed to archive old entity:', archiveError);
          // Don't throw - we've already created the new one
        }

        // Update Zustand state - remove from old collection
        if (entityType === 'note') {
          set({ notes: get().notes.filter((n) => n.id !== entityId) });
        } else if (entityType === 'todo') {
          set({ todos: get().todos.filter((t) => t.id !== entityId) });
        } else {
          set({ habits: get().habits.filter((h) => h.id !== entityId) });
        }

        // Add to new collection
        if (targetBucket === 'todo') {
          set({ todos: [...get().todos, { ...insertedEntity, type: 'todo' as const }] });
        } else if (targetBucket === 'habit') {
          set({ habits: [...get().habits, { ...insertedEntity, type: 'habit' as const }] });
        } else {
          set({ notes: [...get().notes, { ...insertedEntity, type: 'note' as const }] });
        }

        console.log('[GremlyStore] Bucket change complete:', {
          oldId: entityId,
          oldType: entityType,
          newId: insertedEntity.id,
          newType: targetBucket,
          drop_id: insertedEntity.drop_id,
        });

        // Emit events to update RecentDrops list without requiring reload
        console.log('[GremlyStore] Emitting entity:deleted for old entity', {
          id: entityId,
          type: entityType,
        });
        // 1. Delete event for old entity (removes archived note from list)
        eventBus.emit('entity:deleted', {
          id: entityId,
          type: entityType,
          source: 'clarification-bucket-change',
        });

        console.log('[GremlyStore] Emitting entity:created for new entity', {
          id: insertedEntity.id,
          type: targetBucket,
          drop_id: insertedEntity.drop_id,
          title: insertedEntity.title ?? insertedEntity.name,
        });
        // 2. Created event for new entity (adds todo/habit to list)
        eventBus.emit('entity:created', {
          entity: {
            ...insertedEntity,
            type: targetBucket,
          },
          type: targetBucket,
          source: 'clarification-bucket-change',
        });

        // ─────────────────────────────────────────────────────────────────────
        // PHASE 2 ENRICHMENT: Now call Phase 2 with the correct bucket
        // This extracts: tags, time_estimate, frequency, days, people, mood
        // The progressive update triggers chip animations in the card
        // ─────────────────────────────────────────────────────────────────────
        try {
          const cortexUrl = env.cortexUrl;
          if (cortexUrl) {
            // Combine original text with user's clarification so Phase 2 can extract frequency, dates, etc.
            const phase2Text = `${originalText} — ${selectedLabel}`;
            console.log('[GremlyStore] Phase 2 called with combined text (converted entity):', {
              originalText: originalText.substring(0, 30),
              selectedLabel: selectedLabel.substring(0, 30),
              phase2Text: phase2Text.substring(0, 60),
            });
            
            const phase2Response = await fetch(cortexUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'enrich-phase2',
                text: phase2Text,
                bucket: targetBucket,
                subtype: newSubtype,
                currentDate: getDateService().getCurrentDate(),
              }),
            });

            if (phase2Response.ok) {
              const phase2Result = await phase2Response.json();
              console.log('[GremlyStore] Phase 2 enrichment result for converted entity', {
                newEntityId: insertedEntity.id,
                tags: phase2Result.tags,
                timeEstimate: phase2Result.time_estimate_minutes,
                people: phase2Result.people,
                frequency: phase2Result.frequency,
                latency_ms: phase2Result.latency_ms,
              });

              // Build Phase 2 updates
              const phase2Updates: Record<string, unknown> = {};

              if (phase2Result.tags && Array.isArray(phase2Result.tags) && phase2Result.tags.length > 0) {
                phase2Updates.tags = phase2Result.tags;
              }
              if (phase2Result.time_estimate_minutes != null) {
                phase2Updates.time_estimate_minutes = phase2Result.time_estimate_minutes;
              }
              if (phase2Result.energy_type) {
                phase2Updates.energy_type = phase2Result.energy_type;
              }
              if (phase2Result.people && Array.isArray(phase2Result.people) && phase2Result.people.length > 0) {
                phase2Updates.views = {
                  ...(insertedEntity.views || {}),
                  people: phase2Result.people,
                };
              }
              // Habit-specific fields
              if (targetBucket === 'habit') {
                if (phase2Result.frequency) {
                  phase2Updates.frequency = phase2Result.frequency;
                  phase2Updates.cadence = phase2Result.frequency;
                }
                if (phase2Result.days && Array.isArray(phase2Result.days)) {
                  phase2Updates.days = phase2Result.days;
                }
              }

              // Apply Phase 2 updates if any
              if (Object.keys(phase2Updates).length > 0) {
                console.log('[GremlyStore] Applying Phase 2 updates to converted entity:', {
                  newEntityId: insertedEntity.id,
                  updateKeys: Object.keys(phase2Updates),
                });

                if (targetBucket === 'todo') {
                  await get().updateTodo(insertedEntity.id, phase2Updates);
                } else if (targetBucket === 'habit') {
                  await get().updateHabit(insertedEntity.id, phase2Updates);
                } else {
                  await get().updateNote(insertedEntity.id, phase2Updates);
                }
              }
            } else {
              console.warn('[GremlyStore] Phase 2 response not ok for converted entity:', phase2Response.status);
            }
          }
        } catch (phase2Error) {
          console.log('[GremlyStore] Phase 2 enrichment failed for converted entity:', phase2Error);
          // Non-critical - entity already created with reclassify data
        }

        // Clear processing state on the new entity after Phase 2 (success or failure)
        if (targetBucket === 'log') {
          set((s) => ({
            notes: s.notes.map((n) =>
              n.id === insertedEntity.id
                ? { ...n, views: { ...(n.views as Record<string, unknown> || {}), ai_pending: false, clarification_processing: false } }
                : n
            ),
          }));
        } else if (targetBucket === 'todo') {
          set((s) => ({
            todos: s.todos.map((t) =>
              t.id === insertedEntity.id
                ? { ...t, views: { ...(t.views as Record<string, unknown> || {}), ai_pending: false, clarification_processing: false } }
                : t
            ),
          }));
        } else if (targetBucket === 'habit') {
          set((s) => ({
            habits: s.habits.map((h) =>
              h.id === insertedEntity.id
                ? { ...h, views: { ...(h.views as Record<string, unknown> || {}), ai_pending: false, clarification_processing: false } }
                : h
            ),
          }));
        }
        console.log('[GremlyStore] Cleared processing state for converted entity:', { newEntityId: insertedEntity.id, targetBucket });
      } catch (error) {
        console.error('[GremlyStore] Bucket change failed:', error);
        // Fall back to just updating clarification status
        const updatedViews: Record<string, unknown> = {
          ...(views || {}),
          needs_clarification: false,
          clarification_resolved: true,
          bucket_change_failed: true,
        };

        const updates = { views: updatedViews };

        if (entityType === 'todo') {
          await get().updateTodo(entityId, updates);
        } else if (entityType === 'habit') {
          await get().updateHabit(entityId, updates);
        } else {
          await get().updateNote(entityId, updates);
        }
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // ENTITY CHAT MUTATIONS
    // ═══════════════════════════════════════════════════════════════════

    getEntityChat: (
      entityId: string,
      entityType: 'todo' | 'habit' | 'note',
    ): EntityChatData | null => {
      const state = get();
      let entity: Todo | Habit | Note | undefined;

      if (entityType === 'todo') {
        entity = state.todos.find((t) => t.id === entityId);
      } else if (entityType === 'habit') {
        entity = state.habits.find((h) => h.id === entityId);
      } else {
        entity = state.notes.find((n) => n.id === entityId);
      }

      if (!entity) return null;

      const views = entity.views as Record<string, unknown> | undefined;
      const chat = views?.chat as EntityChatData | undefined;
      return chat ?? null;
    },

    getEntityChatMessageCount: (
      entityId: string,
      entityType: 'todo' | 'habit' | 'note',
    ): number => {
      const chat = get().getEntityChat(entityId, entityType);
      return chat?.message_count ?? 0;
    },

    appendEntityChatMessage: async (
      entityId: string,
      entityType: 'todo' | 'habit' | 'note',
      message: Omit<EntityChatMessage, 'id' | 'created_at'>,
    ): Promise<EntityChatMessage> => {
      const now = new Date().toISOString();
      const messageId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

      const newMessage: EntityChatMessage = {
        ...message,
        id: messageId,
        created_at: now,
      };

      const state = get();
      const MAX_MESSAGES = 50;

      // Helper to update chat data
      const updateChatData = (
        currentViews: Record<string, unknown> | undefined,
      ): Record<string, unknown> => {
        const existingChat = (currentViews?.chat as EntityChatData) ?? {
          messages: [],
          message_count: 0,
          last_message_at: null,
          notes: [],
        };

        let messages = [...existingChat.messages, newMessage];
        // Cap at MAX_MESSAGES, remove oldest
        if (messages.length > MAX_MESSAGES) {
          messages = messages.slice(messages.length - MAX_MESSAGES);
        }

        return {
          ...currentViews,
          chat: {
            ...existingChat,
            messages,
            message_count: existingChat.message_count + 1,
            last_message_at: now,
          },
        };
      };

      // Optimistic update
      if (entityType === 'todo') {
        set({
          todos: state.todos.map((t) =>
            t.id === entityId
              ? { ...t, views: updateChatData(t.views as Record<string, unknown>), updated_at: now }
              : t,
          ),
        });
      } else if (entityType === 'habit') {
        set({
          habits: state.habits.map((h) =>
            h.id === entityId
              ? { ...h, views: updateChatData(h.views as Record<string, unknown>), updated_at: now }
              : h,
          ),
        });
      } else {
        set({
          notes: state.notes.map((n) =>
            n.id === entityId
              ? { ...n, views: updateChatData(n.views as Record<string, unknown>), updated_at: now }
              : n,
          ),
        });
      }

      // Persist to Supabase
      const table = entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
      const entity =
        entityType === 'todo'
          ? get().todos.find((t) => t.id === entityId)
          : entityType === 'habit'
            ? get().habits.find((h) => h.id === entityId)
            : get().notes.find((n) => n.id === entityId);

      if (entity) {
        const { error } = await supabase
          .from(table)
          .update({ views: entity.views, updated_at: now })
          .eq('id', entityId);

        if (error) {
          console.error(`[GremlyStore] appendEntityChatMessage failed:`, error);
        }
      }

      return newMessage;
    },

    // ─── Streaming Support ─────────────────────────────────────────────────────
    // Creates a placeholder streaming message in the messages array (synchronous)
    createEntityChatStreamingMessage: (
      entityId: string,
      entityType: 'todo' | 'habit' | 'note',
    ): string => {
      const now = new Date().toISOString();
      const messageId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

      const streamingMessage: EntityChatMessage = {
        id: messageId,
        role: 'assistant',
        content: '',
        created_at: now,
        metadata: { isStreaming: true },
      };

      const state = get();

      // Helper to add streaming message to chat data
      const addStreamingMessage = (
        currentViews: Record<string, unknown> | undefined,
      ): Record<string, unknown> => {
        const existingChat = (currentViews?.chat as EntityChatData) ?? {
          messages: [],
          message_count: 0,
          last_message_at: null,
          notes: [],
        };

        return {
          ...currentViews,
          chat: {
            ...existingChat,
            messages: [...existingChat.messages, streamingMessage],
          },
        };
      };

      // Optimistic update only (no persistence yet)
      if (entityType === 'todo') {
        set({
          todos: state.todos.map((t) =>
            t.id === entityId
              ? { ...t, views: addStreamingMessage(t.views as Record<string, unknown>) }
              : t,
          ),
        });
      } else if (entityType === 'habit') {
        set({
          habits: state.habits.map((h) =>
            h.id === entityId
              ? { ...h, views: addStreamingMessage(h.views as Record<string, unknown>) }
              : h,
          ),
        });
      } else {
        set({
          notes: state.notes.map((n) =>
            n.id === entityId
              ? { ...n, views: addStreamingMessage(n.views as Record<string, unknown>) }
              : n,
          ),
        });
      }

      return messageId;
    },

    // Updates streaming message content in place (synchronous, no persistence)
    updateEntityChatStreamingContent: (
      entityId: string,
      entityType: 'todo' | 'habit' | 'note',
      messageId: string,
      content: string,
    ): void => {
      const state = get();

      // Helper to update message content
      const updateMessageContent = (
        currentViews: Record<string, unknown> | undefined,
      ): Record<string, unknown> => {
        const existingChat = (currentViews?.chat as EntityChatData) ?? {
          messages: [],
          message_count: 0,
          last_message_at: null,
          notes: [],
        };

        return {
          ...currentViews,
          chat: {
            ...existingChat,
            messages: existingChat.messages.map((m) =>
              m.id === messageId ? { ...m, content } : m,
            ),
          },
        };
      };

      if (entityType === 'todo') {
        set({
          todos: state.todos.map((t) =>
            t.id === entityId
              ? { ...t, views: updateMessageContent(t.views as Record<string, unknown>) }
              : t,
          ),
        });
      } else if (entityType === 'habit') {
        set({
          habits: state.habits.map((h) =>
            h.id === entityId
              ? { ...h, views: updateMessageContent(h.views as Record<string, unknown>) }
              : h,
          ),
        });
      } else {
        set({
          notes: state.notes.map((n) =>
            n.id === entityId
              ? { ...n, views: updateMessageContent(n.views as Record<string, unknown>) }
              : n,
          ),
        });
      }
    },

    // Finalizes streaming message: removes streaming flag, updates count, persists to DB
    finalizeEntityChatStreamingMessage: async (
      entityId: string,
      entityType: 'todo' | 'habit' | 'note',
      messageId: string,
      finalContent: string,
      metadata?: Record<string, unknown>,
    ): Promise<void> => {
      const now = new Date().toISOString();
      const state = get();

      // Helper to finalize streaming message
      const finalizeMessage = (
        currentViews: Record<string, unknown> | undefined,
      ): Record<string, unknown> => {
        const existingChat = (currentViews?.chat as EntityChatData) ?? {
          messages: [],
          message_count: 0,
          last_message_at: null,
          notes: [],
        };

        return {
          ...currentViews,
          chat: {
            ...existingChat,
            messages: existingChat.messages.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    content: finalContent,
                    metadata: { ...metadata, isStreaming: false },
                  }
                : m,
            ),
            message_count: existingChat.message_count + 1,
            last_message_at: now,
          },
        };
      };

      // Update state
      if (entityType === 'todo') {
        set({
          todos: state.todos.map((t) =>
            t.id === entityId
              ? {
                  ...t,
                  views: finalizeMessage(t.views as Record<string, unknown>),
                  updated_at: now,
                }
              : t,
          ),
        });
      } else if (entityType === 'habit') {
        set({
          habits: state.habits.map((h) =>
            h.id === entityId
              ? {
                  ...h,
                  views: finalizeMessage(h.views as Record<string, unknown>),
                  updated_at: now,
                }
              : h,
          ),
        });
      } else {
        set({
          notes: state.notes.map((n) =>
            n.id === entityId
              ? {
                  ...n,
                  views: finalizeMessage(n.views as Record<string, unknown>),
                  updated_at: now,
                }
              : n,
          ),
        });
      }

      // Persist to Supabase
      const table = entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
      const entity =
        entityType === 'todo'
          ? get().todos.find((t) => t.id === entityId)
          : entityType === 'habit'
            ? get().habits.find((h) => h.id === entityId)
            : get().notes.find((n) => n.id === entityId);

      if (entity) {
        const { error } = await supabase
          .from(table)
          .update({ views: entity.views, updated_at: now })
          .eq('id', entityId);

        if (error) {
          console.error(`[GremlyStore] finalizeEntityChatStreamingMessage failed:`, error);
        }
      }
    },

    saveEntityChatNote: async (
      entityId: string,
      entityType: 'todo' | 'habit' | 'note',
      note: Omit<EntityChatNote, 'id' | 'created_at'>,
    ): Promise<EntityChatNote> => {
      const now = new Date().toISOString();
      const noteId = `cnote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

      const newNote: EntityChatNote = {
        ...note,
        id: noteId,
        created_at: now,
      };

      const state = get();

      // Helper to update chat data with new note
      const updateChatData = (
        currentViews: Record<string, unknown> | undefined,
      ): Record<string, unknown> => {
        const existingChat = (currentViews?.chat as EntityChatData) ?? {
          messages: [],
          message_count: 0,
          last_message_at: null,
          notes: [],
        };

        return {
          ...currentViews,
          chat: {
            ...existingChat,
            notes: [...existingChat.notes, newNote],
          },
        };
      };

      // Optimistic update
      if (entityType === 'todo') {
        set({
          todos: state.todos.map((t) =>
            t.id === entityId
              ? { ...t, views: updateChatData(t.views as Record<string, unknown>), updated_at: now }
              : t,
          ),
        });
      } else if (entityType === 'habit') {
        set({
          habits: state.habits.map((h) =>
            h.id === entityId
              ? { ...h, views: updateChatData(h.views as Record<string, unknown>), updated_at: now }
              : h,
          ),
        });
      } else {
        set({
          notes: state.notes.map((n) =>
            n.id === entityId
              ? { ...n, views: updateChatData(n.views as Record<string, unknown>), updated_at: now }
              : n,
          ),
        });
      }

      // Persist to Supabase
      const table = entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
      const entity =
        entityType === 'todo'
          ? get().todos.find((t) => t.id === entityId)
          : entityType === 'habit'
            ? get().habits.find((h) => h.id === entityId)
            : get().notes.find((n) => n.id === entityId);

      if (entity) {
        const { error } = await supabase
          .from(table)
          .update({ views: entity.views, updated_at: now })
          .eq('id', entityId);

        if (error) {
          console.error(`[GremlyStore] saveEntityChatNote failed:`, error);
        }
      }

      return newNote;
    },

    updateEntityChatNoteChecklist: async (
      entityId: string,
      entityType: 'todo' | 'habit' | 'note',
      noteId: string,
      itemId: string,
      completed: boolean,
    ): Promise<void> => {
      const now = new Date().toISOString();
      const state = get();

      // Helper to update checklist item
      const updateChatData = (
        currentViews: Record<string, unknown> | undefined,
      ): Record<string, unknown> => {
        const existingChat = currentViews?.chat as EntityChatData | undefined;
        if (!existingChat) return currentViews ?? {};

        const updatedNotes = existingChat.notes.map((n) => {
          if (n.id !== noteId) return n;
          return {
            ...n,
            checklist_items: n.checklist_items?.map((item) =>
              item.id === itemId ? { ...item, completed } : item,
            ),
          };
        });

        return {
          ...currentViews,
          chat: {
            ...existingChat,
            notes: updatedNotes,
          },
        };
      };

      // Optimistic update
      if (entityType === 'todo') {
        set({
          todos: state.todos.map((t) =>
            t.id === entityId
              ? { ...t, views: updateChatData(t.views as Record<string, unknown>), updated_at: now }
              : t,
          ),
        });
      } else if (entityType === 'habit') {
        set({
          habits: state.habits.map((h) =>
            h.id === entityId
              ? { ...h, views: updateChatData(h.views as Record<string, unknown>), updated_at: now }
              : h,
          ),
        });
      } else {
        set({
          notes: state.notes.map((n) =>
            n.id === entityId
              ? { ...n, views: updateChatData(n.views as Record<string, unknown>), updated_at: now }
              : n,
          ),
        });
      }

      // Persist to Supabase
      const table = entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
      const entity =
        entityType === 'todo'
          ? get().todos.find((t) => t.id === entityId)
          : entityType === 'habit'
            ? get().habits.find((h) => h.id === entityId)
            : get().notes.find((n) => n.id === entityId);

      if (entity) {
        const { error } = await supabase
          .from(table)
          .update({ views: entity.views, updated_at: now })
          .eq('id', entityId);

        if (error) {
          console.error(`[GremlyStore] updateEntityChatNoteChecklist failed:`, error);
        }
      }
    },

    updateEntityChatNote: async (
      entityId: string,
      entityType: 'todo' | 'habit' | 'note',
      noteId: string,
      content: string,
    ): Promise<void> => {
      const now = new Date().toISOString();
      const state = get();

      // Helper to update note content
      const updateChatData = (
        currentViews: Record<string, unknown> | undefined,
      ): Record<string, unknown> => {
        const existingChat = currentViews?.chat as EntityChatData | undefined;
        if (!existingChat) return currentViews ?? {};

        const updatedNotes = existingChat.notes.map((n) => {
          if (n.id !== noteId) return n;
          return { ...n, content };
        });

        return {
          ...currentViews,
          chat: {
            ...existingChat,
            notes: updatedNotes,
          },
        };
      };

      // Optimistic update
      if (entityType === 'todo') {
        set({
          todos: state.todos.map((t) =>
            t.id === entityId
              ? { ...t, views: updateChatData(t.views as Record<string, unknown>), updated_at: now }
              : t,
          ),
        });
      } else if (entityType === 'habit') {
        set({
          habits: state.habits.map((h) =>
            h.id === entityId
              ? { ...h, views: updateChatData(h.views as Record<string, unknown>), updated_at: now }
              : h,
          ),
        });
      } else {
        set({
          notes: state.notes.map((n) =>
            n.id === entityId
              ? { ...n, views: updateChatData(n.views as Record<string, unknown>), updated_at: now }
              : n,
          ),
        });
      }

      // Persist to Supabase
      const table = entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
      const entity =
        entityType === 'todo'
          ? get().todos.find((t) => t.id === entityId)
          : entityType === 'habit'
            ? get().habits.find((h) => h.id === entityId)
            : get().notes.find((n) => n.id === entityId);

      if (entity) {
        const { error } = await supabase
          .from(table)
          .update({ views: entity.views, updated_at: now })
          .eq('id', entityId);

        if (error) {
          console.error(`[GremlyStore] updateEntityChatNote failed:`, error);
        }
      }
    },

    convertNoteToChecklist: async (
      entityId: string,
      entityType: 'todo' | 'habit' | 'note',
      noteId: string,
      checklistData: {
        is_checklist: true;
        checklist_items: Array<{ id: string; label: string; completed: boolean }>;
        preamble?: string;
        postamble?: string;
      },
    ): Promise<void> => {
      const now = new Date().toISOString();
      const state = get();

      // Helper to convert note to checklist
      const updateChatData = (
        currentViews: Record<string, unknown> | undefined,
      ): Record<string, unknown> => {
        const existingChat = currentViews?.chat as EntityChatData | undefined;
        if (!existingChat) return currentViews ?? {};

        const updatedNotes = existingChat.notes.map((n) => {
          if (n.id !== noteId) return n;
          return {
            ...n,
            is_checklist: checklistData.is_checklist,
            checklist_items: checklistData.checklist_items,
            preamble: checklistData.preamble,
            postamble: checklistData.postamble,
          };
        });

        return {
          ...currentViews,
          chat: {
            ...existingChat,
            notes: updatedNotes,
          },
        };
      };

      // Optimistic update
      if (entityType === 'todo') {
        set({
          todos: state.todos.map((t) =>
            t.id === entityId
              ? { ...t, views: updateChatData(t.views as Record<string, unknown>), updated_at: now }
              : t,
          ),
        });
      } else if (entityType === 'habit') {
        set({
          habits: state.habits.map((h) =>
            h.id === entityId
              ? { ...h, views: updateChatData(h.views as Record<string, unknown>), updated_at: now }
              : h,
          ),
        });
      } else {
        set({
          notes: state.notes.map((n) =>
            n.id === entityId
              ? { ...n, views: updateChatData(n.views as Record<string, unknown>), updated_at: now }
              : n,
          ),
        });
      }

      // Persist to Supabase
      const table = entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
      const entity =
        entityType === 'todo'
          ? get().todos.find((t) => t.id === entityId)
          : entityType === 'habit'
            ? get().habits.find((h) => h.id === entityId)
            : get().notes.find((n) => n.id === entityId);

      if (entity) {
        const { error } = await supabase
          .from(table)
          .update({ views: entity.views, updated_at: now })
          .eq('id', entityId);

        if (error) {
          console.error(`[GremlyStore] convertNoteToChecklist failed:`, error);
        }
      }
    },

    deleteEntityChatNote: async (
      entityId: string,
      entityType: 'todo' | 'habit' | 'note',
      noteId: string,
    ): Promise<void> => {
      const now = new Date().toISOString();
      const state = get();

      // Helper to delete note from chat data
      const updateChatData = (
        currentViews: Record<string, unknown> | undefined,
      ): Record<string, unknown> => {
        const existingChat = currentViews?.chat as EntityChatData | undefined;
        if (!existingChat) return currentViews ?? {};

        const updatedNotes = existingChat.notes.filter((n) => n.id !== noteId);

        return {
          ...currentViews,
          chat: {
            ...existingChat,
            notes: updatedNotes,
          },
        };
      };

      // Optimistic update
      if (entityType === 'todo') {
        set({
          todos: state.todos.map((t) =>
            t.id === entityId
              ? { ...t, views: updateChatData(t.views as Record<string, unknown>), updated_at: now }
              : t,
          ),
        });
      } else if (entityType === 'habit') {
        set({
          habits: state.habits.map((h) =>
            h.id === entityId
              ? { ...h, views: updateChatData(h.views as Record<string, unknown>), updated_at: now }
              : h,
          ),
        });
      } else {
        set({
          notes: state.notes.map((n) =>
            n.id === entityId
              ? { ...n, views: updateChatData(n.views as Record<string, unknown>), updated_at: now }
              : n,
          ),
        });
      }

      // Persist to Supabase
      const table = entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
      const entity =
        entityType === 'todo'
          ? get().todos.find((t) => t.id === entityId)
          : entityType === 'habit'
            ? get().habits.find((h) => h.id === entityId)
            : get().notes.find((n) => n.id === entityId);

      if (entity) {
        const { error } = await supabase
          .from(table)
          .update({ views: entity.views, updated_at: now })
          .eq('id', entityId);

        if (error) {
          console.error(`[GremlyStore] deleteEntityChatNote failed:`, error);
        }
      }
    },

    clearEntityChat: async (
      entityId: string,
      entityType: 'todo' | 'habit' | 'note',
    ): Promise<void> => {
      const now = new Date().toISOString();
      const state = get();

      // Helper to remove chat from views
      const removeChatFromViews = (
        currentViews: Record<string, unknown> | undefined,
      ): Record<string, unknown> => {
        if (!currentViews) return {};
        const { chat: _chat, ...rest } = currentViews;
        return rest;
      };

      // Optimistic update
      if (entityType === 'todo') {
        set({
          todos: state.todos.map((t) =>
            t.id === entityId
              ? {
                  ...t,
                  views: removeChatFromViews(t.views as Record<string, unknown>),
                  updated_at: now,
                }
              : t,
          ),
        });
      } else if (entityType === 'habit') {
        set({
          habits: state.habits.map((h) =>
            h.id === entityId
              ? {
                  ...h,
                  views: removeChatFromViews(h.views as Record<string, unknown>),
                  updated_at: now,
                }
              : h,
          ),
        });
      } else {
        set({
          notes: state.notes.map((n) =>
            n.id === entityId
              ? {
                  ...n,
                  views: removeChatFromViews(n.views as Record<string, unknown>),
                  updated_at: now,
                }
              : n,
          ),
        });
      }

      // Persist to Supabase
      const table = entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
      const entity =
        entityType === 'todo'
          ? get().todos.find((t) => t.id === entityId)
          : entityType === 'habit'
            ? get().habits.find((h) => h.id === entityId)
            : get().notes.find((n) => n.id === entityId);

      if (entity) {
        const { error } = await supabase
          .from(table)
          .update({ views: entity.views, updated_at: now })
          .eq('id', entityId);

        if (error) {
          console.error(`[GremlyStore] clearEntityChat failed:`, error);
        }
      }
    },
  })),
);

// ─────────────────────────────────────────────────────────────────────────────
// SELECTORS
// ─────────────────────────────────────────────────────────────────────────────

/** Select todos that have a target_date but no scheduled_date (need scheduling) */
export const selectTodosNeedingScheduling = (state: GremlyState) =>
  state.todos.filter((t) => !t.archived && !t.completed_at && t.target_date && !t.scheduled_date);

/** Select notes that are events (have target_date) */
export const selectEventNotes = (state: GremlyState) =>
  state.notes.filter((n) => !n.archived && n.target_date);

/** Select items with pending clarifications */
export const selectItemsNeedingClarification = (state: GremlyState) => {
  const todos = state.todos.filter((t) => t.needs_clarification && !t.clarification_resolved);
  const habits = state.habits.filter((h) => h.needs_clarification && !h.clarification_resolved);
  const notes = state.notes.filter((n) => n.needs_clarification && !n.clarification_resolved);
  return { todos, habits, notes };
};

/** Select synced calendar events for a specific date */
export const selectCalendarEventsForDate = (date: string) => (state: GremlyState) =>
  state.calendarEvents[date] ?? [];

/** Select user-created calendar events for a specific date */
export const selectUserCalendarEventsForDate = (date: string) => (state: GremlyState) =>
  state.userCalendarEvents.filter((e) => e.event_date === date);

/** Select all items for Morning Brief on a given date */
export const selectMorningBriefItems = (date: string) => (state: GremlyState) => {
  const todos = state.todos.filter(
    (t) => !t.archived && !t.completed_at && t.scheduled_date === date,
  );
  const habits = state.habits.filter(
    (h) => !h.archived,
    // Note: Habits don't have completed_at - completion is tracked via habitProgress
    // Add days_active logic here if needed
  );
  const eventNotes = state.notes.filter((n) => !n.archived && n.target_date === date);
  const reminderNotes = state.notes.filter((n) => !n.archived && n.reminder_date === date);
  const calendarEvents = state.calendarEvents[date] ?? [];
  const userCalendarEvents = state.userCalendarEvents.filter((e) => e.event_date === date);

  return { todos, habits, eventNotes, reminderNotes, calendarEvents, userCalendarEvents };
};
