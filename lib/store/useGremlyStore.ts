/**
 * DEPRECATED LIFECYCLE COLUMNS — DO NOT ADD NEW REFERENCES
 *
 * The `is_training_mode` column was removed in Phase 5.1.
 * The `training_started_at` column was removed in Phase 5.2 (renamed to `trial_started_at`).
 *
 * All consumer code (screens, components, workers) should use the selectors
 * from `lib/store/lifecycleSelectors.ts`.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase/client';
import { fetchAllPaginated } from '../supabase/fetchAllPaginated';
import { getRitualDay } from '../date/ritualDay';
import { env } from '../env';
import { getSessionToken } from '../cortex/getSessionToken';
import type {
  Todo,
  Habit,
  Note,
  Space,
  SpaceSuggestion,
  Tag,
  SpaceChat,
  SpaceChatMessage,
  DailyBrief,
  DailyBriefInput,
  EntityChatData,
  EntityChatMessage,
  EntityChatNote,
  CalendarEvent as UserCalendarEvent,
  DbSyncedCalendarEvent,
  WeeklySummary,
  WeeklySummaryCleanupAction,
  DailyContextObject,
} from '../types';
import type { FeedingContribution, AIMode } from '../types/soulDocument';
import type { UserTrainingData } from '../training/trainingReadiness';
import { calculateTrainingReadiness, GRADUATION_THRESHOLD } from '../training/trainingReadiness';
import {
  getTierForAge,
  getDropValue,
  calculateSweepContribution,
  FED_THRESHOLD,
  FED_DAYS_PER_AGE_UP,
  GAUGE_WEIGHTS,
} from '../constants/soulDocument';
import type { Milestone } from '../schemas';
import type {
  World,
  Chapter,
  LifeContext,
  ChapterWorldLink,
  DropWorldLink,
  DropChapterLink,
  DropContextLink,
  WorldObservation,
} from '../supabase/types';
import type { QueuedDrop } from '../minddrop/dropQueue';
import { eventBus } from '../events';
import { parseHabitFrequency } from '../sweep/habitHelpers';
import { getDateService } from '../date';
import { nowTimestamp } from '../date/DateService';
import celebrationController from '../../app/features/celebration/CelebrationController';
import {
  calendarClient,
  type CalendarEvent,
  type CalendarConnectionStatus,
  type CalendarProvider,
} from '../calendar/CalendarClient';
import { DEFAULT_TIME_BLOCK_PREFERENCES, getTimeBlockBoundaries } from '../capacity';
import { getRandomFallback } from '../minddrop/confirmationFallbacks';
import { cancelAllItemReminders } from '../notifications/itemReminderService';
import type { TimeBlockPreferences } from '../capacity';

/**
 * DATE HANDLING CONVENTION
 *
 * This store uses TWO date functions for different purposes:
 *
 * 1. getRitualDay(dayBoundaryHour, timezone)
 *    Use for: anything touching daily_ritual_progress, feeding gauge,
 *    drop/sweep counts, fed status, age-up, feeding history, day rollover.
 *    Accounts for dayBoundaryHour (e.g., 3 AM boundary means 2 AM is still "yesterday").
 *
 * 2. getDateService().today()
 *    Use for: calendar display, due dates, scheduled dates, commitment dates,
 *    daily brief date, UI highlights, "what's on my plate today."
 *    Returns the actual calendar date in device local time.
 *
 * Rule of thumb: if the function reads/writes daily_ritual_progress or
 * cortex_preferences.fed_days_count, use getRitualDay. Everything else
 * uses today().
 *
 * NEVER use new Date() or Date.now() for day-level logic. Only for timestamps.
 */

// Source marker to identify events emitted by this store (to prevent self-handling)
const STORE_EVENT_SOURCE = 'gremly-store';

// Module-level unsubscribe function for cleanup
let eventBusUnsubscribe: (() => void) | null = null;

// ── Calendar fetch deduplication ──
// Prevents concurrent fetchCalendarEventsForRange calls from interleaving
// their set() calls, which causes duplicate events.
let calendarFetchInFlight: Promise<void> | null = null;

function mapDbRowToProviderCalendarEvent(row: DbSyncedCalendarEvent): CalendarEvent | null {
  if (!row.external_id || !row.start_at || !row.end_at) return null;
  if (row.provider !== 'google' && row.provider !== 'outlook' && row.provider !== 'ics')
    return null;

  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.external_id,
    title: row.title ?? 'Untitled event',
    startAt: row.start_at,
    endAt: row.end_at,
    isAllDay: row.is_all_day ?? false,
    location: row.location ?? null,
  };
}

function buildCalendarEventsByDateFromDbRows(
  rows: DbSyncedCalendarEvent[],
): Record<string, CalendarEvent[]> {
  const eventsByDate: Record<string, CalendarEvent[]> = {};
  const seen = new Set<string>();

  for (const row of rows) {
    const event = mapDbRowToProviderCalendarEvent(row);
    if (!event) continue;

    const dedupKey = `${event.provider}:${event.providerEventId}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const dateKey = getDateService().extractLocalDate(event.startAt);
    if (!dateKey) continue;
    const existing = eventsByDate[dateKey] || [];
    eventsByDate[dateKey] = [...existing, event];
  }

  return eventsByDate;
}

/**
 * Check if a habit is currently locked in based on commitment_until date.
 * A habit is locked in if commitment_until is set and >= today's date.
 */
export function isHabitLockedIn(habit: Habit): boolean {
  if (!habit.commitment_until) return false;
  const today = getDateService().today();
  return habit.commitment_until >= today;
}

// ═══════════════════════════════════════════════════════════════════
// MMKV Storage Engine (synchronous — hydrates before first render)
// ═══════════════════════════════════════════════════════════════════

const STORE_SCHEMA_VERSION = 2; // bump this any time persisted shape changes

const mmkv = createMMKV({ id: 'gremly-store' });

const mmkvStorage = {
  getItem: (name: string) => mmkv.getString(name) ?? null,
  setItem: (name: string, value: string) => mmkv.set(name, value),
  removeItem: (name: string) => mmkv.remove(name),
};

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
    const today = getDateService().today();
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
    const today = getDateService().today();

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

  // RENAME reminders → reminders_json (all entities)
  if ('reminders' in sanitized) {
    const reminders = sanitized.reminders as any[] | undefined;
    if (Array.isArray(reminders)) {
      sanitized.reminders_json = reminders.map((r: any) => {
        const { notificationId, ...rest } = r;
        return rest;
      });
    } else {
      sanitized.reminders_json = reminders ?? [];
    }
    delete sanitized.reminders;
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

  // Mark user-set dates with date_confidence: 'user_set' (unless already set by AI/dropSync)
  const dateFields = ['due_day', 'due_date', 'target_date', 'scheduled_date', 'start_date', 'date'];
  const hasDateField = dateFields.some((f) => f in sanitized && sanitized[f] != null);
  if (hasDateField && !('date_confidence' in sanitized)) {
    sanitized.date_confidence = 'user_set';
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

// @deprecated — PendingDrop is no longer used at runtime. Tests should migrate to QueuedDrop from dropQueue.ts.
export type PendingDrop = Record<string, any>;

// ═══════════════════════════════════════════════════════════════════════════════
// STORE INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

export interface GremlyState {
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
  generalChats: SpaceChat[];
  activeGeneralChatId: string | null;
  generalChatExtractions: any[];
  generalChatDismissals: string[];
  generalChatAutoTitle: string | null;
  generalChatRunningSummary: string | null;
  milestones: Milestone[];
  queueItems: QueuedDrop[];

  // ═══════════════════════════════════════════════════════════════════
  // WORLDS & CHAPTERS GRAPH (Phase 4)
  // ═══════════════════════════════════════════════════════════════════
  worlds: World[];
  chapters: Chapter[];
  lifeContexts: LifeContext[];
  chapterWorldLinks: ChapterWorldLink[];
  dropWorldLinks: DropWorldLink[];
  dropChapterLinks: DropChapterLink[];
  dropContextLinks: DropContextLink[];
  worldObservations: WorldObservation[];

  // ═══════════════════════════════════════════════════════════════════
  // SPACE SUGGESTIONS STATE
  // ═══════════════════════════════════════════════════════════════════
  spaceSuggestions: SpaceSuggestion[];
  spaceSuggestionsLoaded: boolean;

  // ═══════════════════════════════════════════════════════════════════
  // MORNING BRIEF STATE
  // ═══════════════════════════════════════════════════════════════════
  dailyBrief: DailyBrief | null;
  dailyBriefLoading: boolean;

  // ═══════════════════════════════════════════════════════════════════
  // WEEKLY SUMMARY STATE
  // ═══════════════════════════════════════════════════════════════════
  weeklySummaries: WeeklySummary[];
  weeklySummaryLoading: boolean;

  // ═══════════════════════════════════════════════════════════════════
  // DAILY CONTEXT OBJECT (DCO)
  // ═══════════════════════════════════════════════════════════════════
  dco: DailyContextObject | null;
  dcoLoading: boolean;

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
  demoSweepCompletedAt: string | null;
  firstTodayVisitCompletedAt: string | null;
  todayRitualDay: string | null;
  todayDropsCount: number;
  todaySweepsCount: number;
  todayRitualCompletedAt: string | null;
  todayAgeCelebrationShownAt: string | null;

  // ═══════════════════════════════════════════════════════════════════
  // FEEDING GAUGE (Soul Document v8)
  // ═══════════════════════════════════════════════════════════════════
  /** Current gauge value 0-1+, resets daily */
  feedingGaugeValue: number;
  /** Number of gauge previews awaiting server confirmation */
  pendingGaugePreviews: number;
  /** Whether gauge has crossed FED_THRESHOLD today */
  isFedToday: boolean;
  /** Contributions log for the current day */
  feedingContributions: FeedingContribution[];
  /** ISO timestamp of most recent gauge contribution */
  feedingGaugeLastUpdatedAt: string | null;
  /** 0, 1, or 2 - fed days accumulated toward next age-up, resets to 0 after age-up */
  fedDaysCount: number;
  /** Current tier name derived from gremlyAge */
  currentTierName: string;
  /** Consecutive unfed days, resets on any fed day */
  unfedStreakDays: number;
  /** ISO timestamp of most recent fed day */
  lastFedAt: string | null;
  /** Current sock balance */
  sockCount: number;
  /** AI personality mode: encouragement, insightful, or observant */
  aiMode: AIMode;
  /** ISO timestamp when user graduated, null until graduation */
  graduatedAt: string | null;
  /** Set when graduation triggers; consumed by graduation flow component */
  pendingGraduation: boolean;
  /** Whether the post-graduation speech has already fired */
  postGraduationMessageShown: boolean;
  /** Whether user is a tester (from cortex_preferences.is_tester) */
  isTester: boolean;
  /** ISO timestamp when trial period started */
  trialStartedAt: string | null;
  /** ISO timestamp when challenge started */
  challengeStartedAt: string | null;
  /** ISO timestamp when challenge was completed */
  challengeCompletedAt: string | null;
  /** Separate lifecycle cache — populated by initialize() after Supabase fetch */
  lifecycleCache: {
    onboardingCompletedAt: string | null;
    firstDropCompletedAt: string | null;
    trainingDropStep: number;
    graduatedAt: string | null;
    isTester: boolean;
    trialStartedAt: string | null;
    challengeStartedAt: string | null;
    challengeCompletedAt: string | null;
    hasSeenReadonlyIntro: boolean;
    cachedAt: string;
    cachedForUserId: string;
  } | null;
  /** Whether user has an active RevenueCat subscription */
  isSubscribed: boolean;
  /** Update subscription status */
  setIsSubscribed: (subscribed: boolean) => void;
  /** Active Lottie color palette id */
  gremlyColor: string;
  setGremlyColor: (colorId: string) => Promise<void>;
  /** ISO date string of last app-open day, used for first-open-of-day detection */
  lastActiveDate: string | null;
  setLastActiveDate: (date: string) => void;
  /** User profile (stored in cortex_preferences.identity JSONB) */
  userName: string | null;
  userPronouns: string | null;
  setUserProfile: (name: string | null, pronouns: string | null) => Promise<void>;
  /** Day 1 drop sequence: 0=not started, 1-5=in progress, 6=done */
  trainingDropStep: number;
  /** Data readiness score 0-100, drives graduation */
  trainingReadiness: number;
  /** One-time modal flags */
  hasSeenGaugeExplanation: boolean;
  hasSeenFirstFedModal: boolean;
  hasSeenSweepUnlockModal: boolean;
  hasSeenEntityChatHighlight: boolean;
  hasSeenTrainingMeterAutoOpen: boolean;
  hasSeenReadonlyIntro: boolean;
  /** Whether the fed celebration toast has been shown today (prevents duplicate) */
  todayFedCelebrationShownAt: string | null;
  /** Whether an age-up via feeding gauge has been celebrated today */
  todayFeedingAgeUpShownAt: string | null;
  /** Last 7 days of feeding history (ritual_day -> is_fed) */
  feedingHistory: Array<{ date: string; isFed: boolean }>;

  /** Unified dedup tracker for all Gremly speech — AI reactions and pool messages */
  recentSpeech: string[];

  // Ritual actions
  ensureCurrentRitualDay: () => string;
  /** Track a speech message for dedup across AI reactions and pool messages */
  pushRecentSpeech: (message: string) => void;
  incrementDropCount: () => Promise<{ dropsCount: number; didAgeUp: boolean; newAge: number }>;
  incrementSweepCount: () => Promise<{ sweepsCount: number; didAgeUp: boolean; newAge: number }>;
  markAgeCelebrationShown: () => void;
  setDayBoundaryHour: (hour: number) => Promise<void>;
  setOnboardingCompletedAt: (timestamp: string) => Promise<void>;
  markOnboardingComplete: () => Promise<void>;
  markFirstDropComplete: () => Promise<void>;
  markDemoSweepComplete: () => Promise<void>;
  markFirstTodayVisitComplete: () => Promise<void>;
  refreshRitualProgress: () => Promise<void>;
  /** Fetch last 7 days of feeding status from Supabase */
  fetchFeedingHistory: () => Promise<void>;
  /** Fetch lifetime stats for paywall display */
  fetchLifetimeStats: () => Promise<{ daysFed: number; thoughtsCount: number }>;

  // Training progress actions
  startTraining: () => Promise<void>;
  advanceTrainingDropStep: () => void;
  refreshTrainingReadiness: () => Promise<number>;
  finalizeGraduation: () => Promise<void>;
  markGaugeExplanationSeen: () => void;
  markFirstFedModalSeen: () => void;
  markSweepUnlockModalSeen: () => void;
  markEntityChatHighlightSeen: () => void;
  markTrainingMeterAutoOpenSeen: () => void;
  markReadonlyIntroSeen: () => Promise<void>;

  // Feeding gauge actions (Soul Document v8)
  addGaugeContribution: (
    source: string,
    value: number,
  ) => Promise<{ newValue: number; justFed: boolean }>;
  /** Check if user just hit 7 cumulative fed days since challenge start; if so, complete the challenge. */
  checkChallengeCompletionOnFedFlip: () => Promise<void>;
  completeSweepSession: (cardsProcessed: number, didJournal: boolean) => Promise<void>;
  completeMorningBrief: () => Promise<void>;
  commitLockInItems: (count: number) => Promise<void>;
  trackSpaceAssign: () => Promise<void>;
  trackSpaceChat: () => Promise<void>;
  trackSpaceCreate: () => Promise<void>;
  resetDailyGauge: () => void;
  /** Instantly preview a drop's gauge contribution locally. No RPC. Server reconciles later. */
  previewGaugeDrop: () => { justCrossedFed: boolean };
  /** Optimistically preview sweep gauge contribution. Returns projected value and fed status. */
  previewSweepGauge: (
    totalCards: number,
    didJournal: boolean,
  ) => { justCrossedFed: boolean; projectedValue: number };

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
  // CROSS-ENTITY MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  updateLinkedEventId: (
    entityId: string,
    entityType: 'todo' | 'note' | 'habit',
    linkedEventId: string | null,
  ) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // SPACE MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createSpace: (space: Partial<Space>) => Promise<Space>;
  updateSpace: (id: string, updates: Partial<Space>) => Promise<void>;
  deleteSpace: (id: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // SPACE SUGGESTIONS ACTIONS
  // ═══════════════════════════════════════════════════════════════════
  fetchSpaceSuggestions: () => Promise<void>;
  acceptSuggestion: (suggestionId: string) => Promise<void>;
  declineSuggestion: (suggestionId: string) => Promise<void>;
  assignDropsToSpace: (dropIds: string[], spaceId: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // SPACE CHAT MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createSpaceChat: (spaceId: string, title: string) => Promise<SpaceChat | null>;
  updateSpaceChat: (chatId: string, patch: Partial<SpaceChat>) => Promise<void>;
  syncSpaceChat: (chat: SpaceChat) => void; // Sync chat from external source (no Supabase write)
  archiveSpaceChat: (chatId: string) => Promise<void>;
  deleteSpaceChat: (chatId: string) => Promise<void>;
  createGeneralChat: (title?: string) => Promise<SpaceChat | null>;
  fetchGeneralChats: () => Promise<void>;
  setActiveGeneralChat: (chatId: string | null) => void;
  updateGeneralChatExtractions: (chatId: string) => Promise<void>;
  dismissExtraction: (chatId: string, extractionId: string) => Promise<void>;
  markExtractionsSaved: (chatId: string, extractionIds: string[]) => Promise<void>;
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
  // WEEKLY SUMMARY MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  fetchWeeklySummaries: () => Promise<void>;
  saveWeeklySummary: (
    summary: Omit<WeeklySummary, 'id' | 'created_at' | 'updated_at'>,
  ) => Promise<WeeklySummary>;
  markSummaryViewed: (summaryId: string) => Promise<void>;
  markSummaryFlowCompleted: (summaryId: string) => Promise<void>;
  dismissSummaryBanner: (summaryId: string) => Promise<void>;
  addCleanupAction: (summaryId: string, action: WeeklySummaryCleanupAction) => Promise<void>;
  bulkCleanupActions: (summaryId: string, actions: WeeklySummaryCleanupAction[]) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // DCO MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  fetchTodayDco: () => Promise<void>;
  patchDcoTodayFocus: (priorities: string[]) => Promise<void>;

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
  /** Wipe all ephemeral daily assignments (daily_block + scheduled_start_iso).
   *  Called when Morning Brief detects a new day. */
  resetDailyAssignments: () => void;
  /** Called by useDayRollover when the calendar day changes. Resets all daily ephemeral state. */
  handleDayRollover: (newDate: string) => void;
  applyOrganizeAssignments: (
    assignments: Array<{
      taskId: string;
      block: 'morning' | 'day' | 'evening';
      scheduledStartIso?: string | null;
    }>,
  ) => void;
  slotUnpositionedTasks: () => void;

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
  // MULTI-DROP + CLARIFICATION ACTIONS
  // ═══════════════════════════════════════════════════════════════════
  /** Split a multi-drop into separate pending drops for each selected segment */
  splitMultiDrop: (localId: string, items: import('../minddrop/types').MultiDropItem[]) => void;
  /** Resolve a multi-drop as a single entity (keep as-is) */
  resolveMultiDropAsSingle: (localId: string) => void;
  /** Update clarification fields on a synced entity by its drop_id (for Phase 1.5 race condition) */
  updateEntityClarificationByDropId: (
    dropId: string,
    clarificationData: {
      question: string;
      options: Array<{ id: string; label: string; action: Record<string, unknown> }>;
    },
  ) => Promise<boolean>;
  resolveEntityClarification: (
    localId: string,
    optionId: string,
    isFreeText?: boolean,
  ) => Promise<void>;
  resolveSkippedClarification: (entityId: string) => Promise<void>;

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
  updateEntityChatStreamingSearching: (
    entityId: string,
    entityType: 'todo' | 'habit' | 'note',
    messageId: string,
    isSearching: boolean,
    searchQuery: string | null,
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

  // Morning Brief capacity gate (ephemeral daily state)
  /** Task IDs the user selected for today in the Morning Brief prioritization flow */
  briefSelectedIds: string[];
  /** Task IDs locked as non-negotiable (max 3) */
  briefLockedIds: string[];
  /** The date these selections apply to (for daily reset detection) */
  briefSelectionDate: string | null;
  /** IDs of tasks explicitly deselected (parked for later) */
  parkedForDay: string[];
  /** Date the user last completed the brief (for re-entry detection) */
  briefCompletedToday: string | null;
  setBriefCompletedToday: (date: string | null) => void;
  /** Reactive current date — updated by useDayRollover hook. Components should read this instead of calling getDateService().today() */
  currentDate: string;

  // Calendar actions
  refreshCalendarConnections: () => Promise<void>;
  fetchCalendarEventsForRange: (startDate: string, endDate: string) => Promise<void>;
  syncCalendarEventsToNotes: () => Promise<{
    created: number;
    updated: number;
    softDeleted: number;
    unchanged: number;
  }>;
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

  // Event Popup State & Actions
  eventPopup: {
    isOpen: boolean;
    event: CalendarEvent | null;
    dateContext: string | null;
  };
  openEventPopup: (event: CalendarEvent, dateContext: string) => void;
  closeEventPopup: () => void;
  hideEventFromPopup: () => void;

  // Event Time Picker State & Actions
  eventTimePicker: {
    isOpen: boolean;
    event: CalendarEvent | null;
  };
  openEventTimePicker: (event: CalendarEvent) => void;
  closeEventTimePicker: () => void;

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
  hideForToday: (id: string, forDate?: string) => void;
  unhideForToday: (id: string) => void;
  clearHiddenToday: () => void;
  // Morning Brief capacity gate actions
  setBriefSelections: (selectedIds: string[], lockedIds: string[], date: string) => void;
  toggleBriefSelection: (taskId: string) => void;
  toggleBriefLock: (taskId: string) => void;
  clearBriefSelections: () => void;
  setBriefParked: (parkedIds: string[]) => void;
  // Gap slotting actions
  slotTaskIntoGap: (id: string, entityType: 'todo' | 'habit', startIso: string) => void;
  unslotTask: (id: string, entityType: 'todo' | 'habit') => void;

  // ═══════════════════════════════════════════════════════════════════
  // WORLDS & CHAPTERS ACTIONS
  // ═══════════════════════════════════════════════════════════════════
  refreshWorldsGraph: () => Promise<void>;
  dismissWorldObservation: (observationId: string) => Promise<void>;
  updateChapterDates: (input: {
    chapterId: string;
    startDate: string;
    endDate: string;
    reason: string | null;
  }) => Promise<void>;
  updateChapterTitle: (input: {
    chapterId: string;
    title: string;
    reason: string | null;
  }) => Promise<void>;
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
  generalChats: [] as SpaceChat[],
  activeGeneralChatId: null as string | null,
  generalChatExtractions: [] as any[],
  generalChatDismissals: [] as string[],
  generalChatAutoTitle: null as string | null,
  generalChatRunningSummary: null as string | null,
  milestones: [] as Milestone[],
  // Worlds & Chapters graph
  worlds: [] as World[],
  chapters: [] as Chapter[],
  lifeContexts: [] as LifeContext[],
  chapterWorldLinks: [] as ChapterWorldLink[],
  dropWorldLinks: [] as DropWorldLink[],
  dropChapterLinks: [] as DropChapterLink[],
  dropContextLinks: [] as DropContextLink[],
  worldObservations: [] as WorldObservation[],
  // Space suggestions
  spaceSuggestions: [] as SpaceSuggestion[],
  spaceSuggestionsLoaded: false,
  dailyBrief: null as DailyBrief | null,
  dailyBriefLoading: false,
  weeklySummaries: [] as WeeklySummary[],
  weeklySummaryLoading: false,
  // DCO
  dco: null as DailyContextObject | null,
  dcoLoading: false,
  isLoading: false,
  isInitialized: false,
  lastSyncedAt: null as Date | null,
  userId: null as string | null,
  userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
  demoSweepCompletedAt: null as string | null,
  firstTodayVisitCompletedAt: null as string | null,
  todayRitualDay: null as string | null,
  todayDropsCount: 0,
  todaySweepsCount: 0,
  todayRitualCompletedAt: null as string | null,
  todayAgeCelebrationShownAt: null as string | null,
  feedingGaugeValue: 0,
  pendingGaugePreviews: 0,
  isFedToday: false,
  feedingContributions: [] as FeedingContribution[],
  feedingGaugeLastUpdatedAt: null as string | null,
  fedDaysCount: 0,
  currentTierName: 'Hatchling',
  unfedStreakDays: 0,
  lastFedAt: null as string | null,
  sockCount: 0,
  aiMode: 'encouragement' as AIMode,
  graduatedAt: null as string | null,
  pendingGraduation: false,
  postGraduationMessageShown: false,
  isTester: false,
  trialStartedAt: null as string | null,
  challengeStartedAt: null as string | null,
  challengeCompletedAt: null as string | null,
  lifecycleCache: null as GremlyState['lifecycleCache'],
  isSubscribed: false,
  gremlyColor: 'forest',
  lastActiveDate: null as string | null,
  userName: null as string | null,
  userPronouns: null as string | null,
  trainingDropStep: 0,
  trainingReadiness: 0,
  hasSeenGaugeExplanation: false,
  hasSeenFirstFedModal: false,
  hasSeenSweepUnlockModal: false,
  hasSeenEntityChatHighlight: false,
  hasSeenTrainingMeterAutoOpen: false,
  hasSeenReadonlyIntro: false,
  todayFedCelebrationShownAt: null as string | null,
  todayFeedingAgeUpShownAt: null as string | null,
  feedingHistory: [] as Array<{ date: string; isFed: boolean }>,
  recentSpeech: [] as string[],
  queueItems: [] as QueuedDrop[],
  // Calendar integration
  calendarConnections: [] as CalendarConnectionStatus[],
  calendarEvents: {} as Record<string, CalendarEvent[]>,
  userCalendarEvents: [] as UserCalendarEvent[],
  calendarLoading: false,
  calendarLastFetched: null as string | null,
  hiddenCalendarEventsByDate: {} as Record<string, string[]>,
  eventTimeOverrides: {} as Record<string, { startAt: string; endAt: string }>,
  timeBlockPreferences: DEFAULT_TIME_BLOCK_PREFERENCES,
  // Event popup state (global popup for calendar events)
  eventPopup: {
    isOpen: false,
    event: null as CalendarEvent | null,
    dateContext: null as string | null,
  },
  // Event time picker state (global time editor for calendar events)
  eventTimePicker: {
    isOpen: false,
    event: null as CalendarEvent | null,
  },
  hiddenTodayIds: [] as string[],
  hiddenTodayDate: null as string | null,

  // Morning Brief capacity gate
  briefSelectedIds: [] as string[],
  briefLockedIds: [] as string[],
  briefSelectionDate: null as string | null,
  parkedForDay: [] as string[],
  briefCompletedToday: null as string | null,
  currentDate: getDateService().today(),
};

// ═══════════════════════════════════════════════════════════════════════════════
// STORE IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

export const useGremlyStore = create<GremlyState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...initialState,

        // ═══════════════════════════════════════════════════════════════════
        // INITIALIZATION
        // ═══════════════════════════════════════════════════════════════════

        initialize: async (userId: string) => {
          // Fast path: already initialized for this user, verify cache is fresh
          if (get().isInitialized && get().userId === userId) {
            const cache = get().lifecycleCache;
            const cacheAge = cache?.cachedAt
              ? getDateService().now().getTime() - new Date(cache.cachedAt).getTime()
              : Infinity;
            const cacheIsFresh = cache?.cachedForUserId === userId && cacheAge < 5 * 60 * 1000;

            if (cacheIsFresh) {
              // Non-blocking refresh
              get()
                .refreshFromServer()
                .catch((err) => {
                  console.warn('[GremlyStore] Background refresh failed:', err);
                });
              return;
            }
            // Cache stale or wrong user — fall through to full re-init
          }

          // If we have persisted data for this user, render immediately
          // and sync fresh data in background
          const hasPersistedData = get().userId === userId && get().todos.length > 0;
          const cache = get().lifecycleCache;
          const cacheMatchesUser = cache?.cachedForUserId === userId;

          if (hasPersistedData && cacheMatchesUser) {
            // Poison detection: if cache looks suspicious, force a full re-init from Supabase
            const cacheLooksSuspicious =
              cache !== null &&
              cache.graduatedAt === null &&
              cache.firstDropCompletedAt === null &&
              cache.onboardingCompletedAt !== null;

            if (cacheLooksSuspicious) {
              console.warn(
                '[GremlyStore] Suspicious lifecycle cache detected — forcing full re-init',
              );
              // Fall through to full blocking init below (do NOT take fast path)
            } else {
              console.log('[GremlyStore] ✅ Rendering from cached data, syncing in background');
              set({ isInitialized: true, userId });

              // Background sync — non-blocking, don't throw
              get()
                .refreshFromServer()
                .catch((err) => {
                  console.warn(
                    '[GremlyStore] Background sync failed (cached data still usable):',
                    err,
                  );
                });

              // Prefetch calendar events in parallel with server refresh
              const calTodayStr = getDateService().today();
              const calWeekEnd = getDateService().addDays(calTodayStr, 7);
              get()
                .fetchCalendarEventsForRange(calTodayStr, calWeekEnd)
                .catch((err) => {
                  console.warn('[GremlyStore] Background calendar prefetch failed:', err);
                });

              // Still subscribe to EventBus
              if (eventBusUnsubscribe) {
                eventBusUnsubscribe();
              }
              eventBusUnsubscribe = get().subscribeToEvents();

              // Recover any stuck drops
              get().recoverStuckMindDrops();
              return;
            }
          }

          // First time or different user — full blocking init
          set({ isLoading: true, userId });

          try {
            const eventWindowStart = getDateService().now();
            eventWindowStart.setDate(eventWindowStart.getDate() - 30);
            const eventWindowEnd = getDateService().now();
            eventWindowEnd.setDate(eventWindowEnd.getDate() + 90);
            const eventWindowStartIso = eventWindowStart.toISOString();
            const eventWindowEndIso = eventWindowEnd.toISOString();

            // Fetch ALL user data in parallel
            const [
              todosRows,
              habitsRows,
              notesRows,
              calendarEventRows,
              spacesRes,
              tagsRes,
              progressRes,
              chatsRes,
              milestonesRes,
              dailyBriefRes,
              cortexPrefsRes,
              sweepEventsCountRes,
              notificationPrefsRes,
              weeklySummariesRes,
              worldsRes,
              chaptersRes,
              lifeContextsRes,
              chapterWorldLinksRes,
              dropWorldLinksRes,
              dropChapterLinksRes,
              dropContextLinksRes,
              worldObservationsRes,
            ] = await Promise.all([
              fetchAllPaginated<Todo>(() =>
                supabase
                  .from('todos')
                  .select('*')
                  .eq('owner_id', userId)
                  .order('created_at', { ascending: false }),
              ),
              fetchAllPaginated<Habit>(() =>
                supabase
                  .from('habits')
                  .select('*')
                  .eq('owner_id', userId)
                  .order('created_at', { ascending: false }),
              ),
              // Calendar events are windowed to [-30d, +90d] by target_date to
              // prevent hydration bloat from long-tail synced events. Calendar
              // UIs (useEventNotesForDate, space event selectors,
              // syncCalendarEventsToNotes) still read from state.notes, so the
              // active window must stay hydrated. Long-term: migrate these
              // consumers to CalendarService-backed selectors and drop
              // subtype='event' from the notes store entirely.
              fetchAllPaginated<Note>(() =>
                supabase
                  .from('notes')
                  .select('*, log_photos(id, url, position)')
                  .eq('owner_id', userId)
                  .or(
                    `subtype.neq.event,` +
                      `external_source.is.null,` +
                      `and(target_date.gte.${eventWindowStartIso},target_date.lte.${eventWindowEndIso})`,
                  )
                  .order('created_at', { ascending: false }),
              ),
              fetchAllPaginated<DbSyncedCalendarEvent>(() =>
                supabase
                  .from('synced_calendar_events' as any)
                  .select('*')
                  .eq('owner_id', userId)
                  .eq('archived', false)
                  .order('start_at', { ascending: true }),
              ),
              supabase.from('spaces').select('*').eq('owner_id', userId),
              supabase.from('tags').select('*').eq('owner_id', userId),
              supabase.from('habit_progress').select('*').eq('owner_id', userId),
              supabase.from('scope_chats').select('*').eq('user_id', userId),
              supabase.from('space_milestones').select('*').eq('owner_id', userId),
              supabase
                .from('daily_briefs')
                .select('*')
                .eq('owner_id', userId)
                .eq('date', getDateService().today())
                .maybeSingle(),
              // Sweep preferences + Gremly age + training + feeding from cortex_preferences
              supabase
                .from('cortex_preferences')
                .select(
                  'created_at, last_sweep_completed_at, sweep_streak, gremly_age, gremly_age_last_incremented_at, day_boundary_hour, onboarding_completed_at, first_drop_completed_at, first_today_visit_completed_at, mini_sweep_last_completed_at, demo_sweep_completed_at, fed_days_count, current_tier, unfed_streak_days, last_fed_at, sock_count, ai_mode, graduated_at, training_drop_step, has_seen_gauge_explanation, has_seen_first_fed_modal, has_seen_sweep_unlock_modal, has_seen_entity_chat_highlight, has_seen_training_meter_auto_open, has_seen_readonly_intro, gremly_color, is_tester, trial_started_at, challenge_started_at, challenge_completed_at',
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
              supabase
                .from('weekly_summaries')
                .select('*')
                .eq('user_id', userId)
                .order('week_start_date', { ascending: false })
                .limit(12),
              supabase.from('worlds').select('*').eq('owner_id', userId),
              supabase.from('chapters').select('*').eq('owner_id', userId),
              supabase.from('life_contexts').select('*').eq('owner_id', userId),
              supabase.from('chapter_world_links').select('*').eq('owner_id', userId),
              supabase.from('drop_world_links').select('*').eq('owner_id', userId),
              supabase.from('drop_chapter_links').select('*').eq('owner_id', userId),
              supabase.from('drop_context_links').select('*').eq('owner_id', userId),
              supabase
                .from('world_observations')
                .select('*')
                .eq('owner_id', userId)
                .is('dismissed_at', null),
            ]);

            // Check for errors (chats/milestones are optional - don't fail if tables don't exist)
            if (spacesRes.error) throw spacesRes.error;
            if (tagsRes.error) throw tagsRes.error;
            if (progressRes.error) throw progressRes.error;

            console.log('[GremlyStore] habit_progress query:', {
              count: progressRes.data?.length,
              sample: progressRes.data
                ?.slice(0, 5)
                .map((p) => ({ occurred_day: p.occurred_day, habit_id: p.habit_id })),
            });

            // Log but don't throw for chats/milestones/dailyBrief/sweep prefs
            if (chatsRes.error)
              console.warn('[GremlyStore] space_chats fetch error:', chatsRes.error);
            if (milestonesRes.error)
              console.warn('[GremlyStore] milestones fetch error:', milestonesRes.error);
            if (dailyBriefRes.error)
              console.warn('[GremlyStore] daily_briefs fetch error:', dailyBriefRes.error);
            if (cortexPrefsRes.error && cortexPrefsRes.error.code !== 'PGRST116') {
              console.error(
                '[GremlyStore] initialize aborted — cortex_preferences fetch failed:',
                cortexPrefsRes.error,
              );
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const Sentry = require('@sentry/react-native');
                Sentry.captureException(new Error('initialize cortex_preferences fetch failed'), {
                  extra: { error: JSON.stringify(cortexPrefsRes.error) },
                });
              } catch {
                /* Sentry not available */
              }
              set({ isLoading: false, isInitialized: false });
              return;
            }
            if (sweepEventsCountRes.error)
              console.warn('[GremlyStore] sweep events count error:', sweepEventsCountRes.error);
            if (weeklySummariesRes.error)
              console.warn('[GremlyStore] weekly_summaries fetch error:', weeklySummariesRes.error);

            // Worlds & Chapters primary entities: throw on error
            if (worldsRes.error) throw worldsRes.error;
            if (chaptersRes.error) throw chaptersRes.error;
            if (lifeContextsRes.error) throw lifeContextsRes.error;

            // Worlds & Chapters link tables + observations: warn and degrade gracefully
            if (chapterWorldLinksRes.error)
              console.warn(
                '[GremlyStore] chapter_world_links fetch error:',
                chapterWorldLinksRes.error,
              );
            if (dropWorldLinksRes.error)
              console.warn('[GremlyStore] drop_world_links fetch error:', dropWorldLinksRes.error);
            if (dropChapterLinksRes.error)
              console.warn(
                '[GremlyStore] drop_chapter_links fetch error:',
                dropChapterLinksRes.error,
              );
            if (dropContextLinksRes.error)
              console.warn(
                '[GremlyStore] drop_context_links fetch error:',
                dropContextLinksRes.error,
              );
            if (worldObservationsRes.error)
              console.warn(
                '[GremlyStore] world_observations fetch error:',
                worldObservationsRes.error,
              );

            // Fetch identity from user_profiles
            const { data: userProfile, error: userProfileError } = await supabase
              .from('user_profiles')
              .select('identity')
              .eq('user_id', userId)
              .maybeSingle();
            if (userProfileError) {
              console.error(
                '[GremlyStore] user_profiles fetch failed (non-fatal):',
                userProfileError,
              );
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const Sentry = require('@sentry/react-native');
                Sentry.captureException(new Error('user_profiles identity fetch failed'), {
                  extra: { error: JSON.stringify(userProfileError), context: 'initialize' },
                });
              } catch {
                /* Sentry not available */
              }
            }
            const profileIdentity = (userProfile?.identity as Record<string, unknown>) ?? {};

            // Extract sweep preferences (handle columns that may not exist in TypeScript types)
            const cortexPrefs = cortexPrefsRes.data as Record<string, unknown> | null;

            // Compute ritual day based on user's day boundary and timezone
            const dayBoundaryHour = (cortexPrefs?.day_boundary_hour as number) ?? 0;
            const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const timezone = detectedTimezone;
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
              (todosRows.length ?? 0) > 0 ||
              (habitsRows.length ?? 0) > 0 ||
              (notesRows.length ?? 0) > 0;

            const onboardingCompleted = (cortexPrefs?.onboarding_completed_at as string) ?? null;

            // If user has activity but no onboarding timestamp, they're an existing user - auto-complete onboarding
            let effectiveOnboardingCompleted = onboardingCompleted;
            if (hasExistingActivity && !onboardingCompleted) {
              effectiveOnboardingCompleted = nowTimestamp();
              // Fire and forget - update DB in background
              supabase
                .from('cortex_preferences')
                .upsert(
                  {
                    owner_id: userId,
                    onboarding_completed_at: effectiveOnboardingCompleted,
                    updated_at: nowTimestamp(),
                  },
                  { onConflict: 'owner_id' },
                )
                .then(({ error: upsertError }) => {
                  if (upsertError) {
                    console.error(
                      '[GremlyStore] Auto-complete onboarding upsert failed:',
                      JSON.stringify(upsertError, null, 2),
                    );
                  } else {
                    console.log('[GremlyStore] Auto-completed onboarding for existing user');
                  }
                });
            }

            console.log('[DEBUG:Gauge] Hydrating gauge from Supabase', {
              feeding_gauge_value: ritualProgress?.feeding_gauge_value,
              is_fed: ritualProgress?.is_fed,
              ritualProgressKeys: ritualProgress ? Object.keys(ritualProgress) : 'null',
            });

            const hydratedCalendarEvents = buildCalendarEventsByDateFromDbRows(calendarEventRows);

            set({
              // Add type field since DB doesn't store it
              todos: todosRows.map((t) => ({
                ...t,
                type: 'todo' as const,
                reminders: (t as any).reminders_json ?? [],
              })),
              habits: habitsRows.map((h) => ({
                ...h,
                type: 'habit' as const,
                reminders: (h as any).reminders_json ?? [],
              })),
              notes: notesRows.map((n) => ({
                ...n,
                type: 'note' as const,
                reminders: (n as any).reminders_json ?? [],
              })),
              calendarEvents: hydratedCalendarEvents,
              calendarLastFetched:
                calendarEventRows.length > 0 ? nowTimestamp() : get().calendarLastFetched,
              spaces: spacesRes.data ?? [],
              tags: tagsRes.data ?? [],
              habitProgress: progressRes.data ?? [],
              spaceChats: chatsRes.data ?? [],
              milestones: milestonesRes.data ?? [],
              worlds: (worldsRes.data ?? []) as World[],
              chapters: (chaptersRes.data ?? []) as Chapter[],
              lifeContexts: (lifeContextsRes.data ?? []) as LifeContext[],
              chapterWorldLinks: (chapterWorldLinksRes.data ?? []) as ChapterWorldLink[],
              dropWorldLinks: (dropWorldLinksRes.data ?? []) as DropWorldLink[],
              dropChapterLinks: (dropChapterLinksRes.data ?? []) as DropChapterLink[],
              dropContextLinks: (dropContextLinksRes.data ?? []) as DropContextLink[],
              worldObservations: (worldObservationsRes.data ?? []) as WorldObservation[],
              dailyBrief: dailyBriefRes.data ?? null,
              weeklySummaries: (weeklySummariesRes.data ?? []) as WeeklySummary[],
              spaceChatMessages: [], // Messages are loaded on-demand per chat
              // Sweep preferences
              lastSweepCompletedAt: (cortexPrefs?.last_sweep_completed_at as string) ?? null,
              sweepStreak: (cortexPrefs?.sweep_streak as number) ?? 0,
              totalSweepCount: sweepEventsCountRes.count ?? 0,
              miniSweepLastCompletedAt:
                (cortexPrefs?.mini_sweep_last_completed_at as string) ?? null,
              // Gremly age & ritual progress
              gremlyAge: (cortexPrefs?.gremly_age as number) ?? 0,
              gremlyAgeLastIncrementedAt:
                (cortexPrefs?.gremly_age_last_incremented_at as string) ?? null,
              dayBoundaryHour,
              onboardingCompletedAt: effectiveOnboardingCompleted,
              accountCreatedAt: (cortexPrefs?.created_at as string) ?? null,
              firstDropCompletedAt: (cortexPrefs?.first_drop_completed_at as string) ?? null,
              demoSweepCompletedAt: (cortexPrefs?.demo_sweep_completed_at as string) ?? null,
              firstTodayVisitCompletedAt:
                (cortexPrefs?.first_today_visit_completed_at as string) ?? null,
              todayRitualDay: ritualDay,
              todayDropsCount: ritualProgress?.drops_count ?? 0,
              todaySweepsCount: ritualProgress?.sweeps_count ?? 0,
              todayRitualCompletedAt: ritualProgress?.ritual_completed_at ?? null,
              feedingGaugeValue: (ritualProgress?.feeding_gauge_value as number) ?? 0,
              isFedToday: (ritualProgress?.is_fed as boolean) ?? false,
              fedDaysCount: (cortexPrefs?.fed_days_count as number) ?? 0,
              currentTierName: (cortexPrefs?.current_tier as string) ?? 'Hatchling',
              unfedStreakDays: (cortexPrefs?.unfed_streak_days as number) ?? 0,
              lastFedAt: (cortexPrefs?.last_fed_at as string) ?? null,
              sockCount: (cortexPrefs?.sock_count as number) ?? 0,
              aiMode: ((cortexPrefs?.ai_mode as string) ?? 'encouragement') as AIMode,
              graduatedAt: (cortexPrefs?.graduated_at as string) ?? null,
              isTester: (cortexPrefs?.is_tester as boolean) ?? false,
              trialStartedAt: (cortexPrefs?.trial_started_at as string) ?? null,
              challengeStartedAt: (cortexPrefs?.challenge_started_at as string) ?? null,
              challengeCompletedAt: (cortexPrefs?.challenge_completed_at as string) ?? null,
              trainingDropStep: (cortexPrefs?.training_drop_step as number) ?? 0,
              hasSeenGaugeExplanation:
                (cortexPrefs?.has_seen_gauge_explanation as boolean) ?? false,
              hasSeenFirstFedModal: (cortexPrefs?.has_seen_first_fed_modal as boolean) ?? false,
              hasSeenSweepUnlockModal:
                (cortexPrefs?.has_seen_sweep_unlock_modal as boolean) ?? false,
              hasSeenEntityChatHighlight:
                (cortexPrefs?.has_seen_entity_chat_highlight as boolean) ?? false,
              hasSeenTrainingMeterAutoOpen:
                (cortexPrefs?.has_seen_training_meter_auto_open as boolean) ?? false,
              hasSeenReadonlyIntro: (cortexPrefs?.has_seen_readonly_intro as boolean) ?? false,
              gremlyColor: (cortexPrefs?.gremly_color as string) ?? 'forest',
              userName: (profileIdentity?.name as string) ?? null,
              userPronouns: (profileIdentity?.pronouns as string) ?? null,
              userTimezone: timezone,
              isLoading: false,
              isInitialized: true,
              lastSyncedAt: getDateService().now(),
            });

            // Snapshot lifecycle fields into separate cache for offline rehydration
            set((state) => ({
              lifecycleCache: {
                onboardingCompletedAt: state.onboardingCompletedAt,
                firstDropCompletedAt: state.firstDropCompletedAt,
                trainingDropStep: state.trainingDropStep,
                graduatedAt: state.graduatedAt,
                isTester: state.isTester,
                trialStartedAt: state.trialStartedAt,
                challengeStartedAt: state.challengeStartedAt,
                challengeCompletedAt: state.challengeCompletedAt,
                hasSeenReadonlyIntro: state.hasSeenReadonlyIntro,
                cachedAt: nowTimestamp(),
                cachedForUserId: userId,
              },
            }));

            // Populate training progress from cumulative data
            if (!get().graduatedAt) {
              get()
                .refreshTrainingReadiness()
                .catch((err) => {
                  console.warn('[GremlyStore] refreshTrainingReadiness on init failed:', err);
                });
            }

            // Sync timezone to database if device timezone differs (handles travel)
            const dbTimezone = notificationPrefsRes.data?.timezone as string | null;
            if (dbTimezone && dbTimezone !== detectedTimezone) {
              if (__DEV__) {
                console.log(
                  '[GremlyStore] Timezone changed: DB has',
                  dbTimezone,
                  'device has',
                  detectedTimezone,
                );
              }
              supabase
                .from('notification_preferences')
                .update({ timezone: detectedTimezone, updated_at: nowTimestamp() })
                .eq('user_id', userId)
                .then(({ error }) => {
                  if (error) {
                    console.error('[GremlyStore] Failed to update timezone in DB:', error);
                  }
                });
            }

            // Prefetch calendar events after cold init
            const calTodayStrCold = getDateService().today();
            const calWeekEndCold = getDateService().addDays(calTodayStrCold, 7);
            get()
              .fetchCalendarEventsForRange(calTodayStrCold, calWeekEndCold)
              .catch((err) => {
                console.warn('[GremlyStore] Calendar prefetch after cold init failed:', err);
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
              todos: todosRows.length,
              habits: habitsRows.length,
              notes: notesRows.length,
              spaces: spacesRes.data?.length ?? 0,
              habitProgress: progressRes.data?.length ?? 0,
              spaceChats: chatsRes.data?.length ?? 0,
              milestones: milestonesRes.data?.length ?? 0,
              dailyBrief: dailyBriefRes.data?.id ?? 'none',
              weeklySummaries: weeklySummariesRes.data?.length ?? 0,
              sweepStreak: (cortexPrefs?.sweep_streak as number) ?? 0,
              totalSweepCount: sweepEventsCountRes.count ?? 0,
              gremlyAge: (cortexPrefs?.gremly_age as number) ?? 0,
              ritualDay,
              todayDropsCount: ritualProgress?.drops_count ?? 0,
              todaySweepsCount: ritualProgress?.sweeps_count ?? 0,
              feedingGaugeValue: (ritualProgress?.feeding_gauge_value as number) ?? 0,
              isFedToday: (ritualProgress?.is_fed as boolean) ?? false,
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

            // Fetch today's DCO (fire-and-forget, non-blocking)
            get().fetchTodayDco();
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
            lifecycleCache: null,
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
            weeklySummaries: [],
            weeklySummaryLoading: false,
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
            accountCreatedAt: null,
            demoSweepCompletedAt: null,
            todayRitualDay: null,
            todayDropsCount: 0,
            todaySweepsCount: 0,
            todayRitualCompletedAt: null,
            feedingGaugeValue: 0,
            isFedToday: false,
            feedingContributions: [],
            feedingGaugeLastUpdatedAt: null,
            fedDaysCount: 0,
            currentTierName: 'Hatchling',
            unfedStreakDays: 0,
            lastFedAt: null,
            sockCount: 0,
            aiMode: 'encouragement' as AIMode,
            isSubscribed: false,
            gremlyColor: 'forest',
            userName: null,
            userPronouns: null,
            trainingReadiness: 0,
            hasSeenGaugeExplanation: false,
            hasSeenFirstFedModal: false,
            hasSeenSweepUnlockModal: false,
            hasSeenEntityChatHighlight: false,
            hasSeenTrainingMeterAutoOpen: false,
            hasSeenReadonlyIntro: false,
            todayFedCelebrationShownAt: null,
            todayFeedingAgeUpShownAt: null,
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

          const now = nowTimestamp();

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
        // SPEECH DEDUP
        // ═══════════════════════════════════════════════════════════════════

        pushRecentSpeech: (message: string) => {
          set((state) => {
            const updated = [...state.recentSpeech, message];
            if (updated.length > 5) updated.shift();
            return { recentSpeech: updated };
          });
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
          const { dayBoundaryHour, todayRitualDay } = get();
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const currentRitualDay = getRitualDay(dayBoundaryHour, timezone);

          if (todayRitualDay && currentRitualDay !== todayRitualDay) {
            console.log('[GremlyStore] Day boundary crossed, resetting ritual progress');

            // Capture fed state before resetting (Soul Document v8)
            const wasFedBeforeReset = get().isFedToday;

            set({
              todayRitualDay: currentRitualDay,
              todayDropsCount: 0,
              todaySweepsCount: 0,
              todayRitualCompletedAt: null, // CRITICAL: allows aging to happen again
              todayAgeCelebrationShownAt: null, // Reset celebration flag for new day
              // Feeding gauge reset (Soul Document v8)
              feedingGaugeValue: 0,
              isFedToday: false,
              feedingContributions: [],
              feedingGaugeLastUpdatedAt: null,
              todayFedCelebrationShownAt: null,
              todayFeedingAgeUpShownAt: null,
            });

            // Unfed streak tracking on day boundary cross (Soul Document v8)
            if (!wasFedBeforeReset) {
              const currentStreak = get().unfedStreakDays + 1;
              set({ unfedStreakDays: currentStreak });

              const { userId } = get();
              if (userId) {
                supabase
                  .from('cortex_preferences')
                  .update({
                    unfed_streak_days: currentStreak,
                    updated_at: nowTimestamp(),
                  })
                  .eq('owner_id', userId)
                  .then(({ error }) => {
                    if (error) {
                      console.error('[GremlyStore] Failed to update unfed streak:', error);
                    }
                  });
              }
            }

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
                      console.log(
                        '[ensureCurrentRitualDay] ✅ Cleared todo commitments in database',
                      );
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
          console.log('[GremlyStore] incrementDropCount called', {
            userId: get().userId,
          });

          const { userId } = get();
          if (!userId) {
            console.log('[GremlyStore] incrementDropCount: no userId, bailing');
            return { dropsCount: 0, didAgeUp: false, newAge: get().gremlyAge };
          }

          // Ensure we're on the current ritual day (resets state if day changed)
          const currentRitualDay = get().ensureCurrentRitualDay();
          console.log('[GremlyStore] incrementDropCount: ritualDay =', currentRitualDay);

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

          // Feed the gauge (Soul Document v8: drops contribute to feeding gauge)
          const dropGaugeValue = getDropValue(newDropsCount);
          console.log('[GremlyStore] incrementDropCount: calling addGaugeContribution', {
            dropNumber: newDropsCount,
            gaugeValue: dropGaugeValue,
          });
          get()
            .addGaugeContribution('drop', dropGaugeValue)
            .catch((err) => {
              console.warn('[GremlyStore] Drop gauge contribution failed:', err);
            });

          // Gauge contribution handles age-up via feeding system (Soul Document v8)
          // Track training progress
          if (!get().graduatedAt) {
            get()
              .refreshTrainingReadiness()
              .catch((err) => {
                console.warn('[GremlyStore] refreshTrainingReadiness after drop failed:', err);
              });
          }
          return { dropsCount: newDropsCount, didAgeUp: false, newAge: get().gremlyAge };
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
            return {
              sweepsCount: get().todaySweepsCount,
              didAgeUp: false,
              newAge: get().gremlyAge,
            };
          }

          const newSweepsCount = data?.sweeps_count ?? get().todaySweepsCount + 1;
          set({ todaySweepsCount: newSweepsCount, todayRitualDay: currentRitualDay });

          // Gauge contribution handles age-up via feeding system (Soul Document v8)
          // Track training progress
          if (!get().graduatedAt) {
            get()
              .refreshTrainingReadiness()
              .catch((err) => {
                console.warn('[GremlyStore] refreshTrainingReadiness after sweep failed:', err);
              });
          }
          return { sweepsCount: newSweepsCount, didAgeUp: false, newAge: get().gremlyAge };
        },

        markAgeCelebrationShown: () => {
          set({ todayAgeCelebrationShownAt: nowTimestamp() });
        },

        setIsSubscribed: (subscribed: boolean) => {
          set({ isSubscribed: subscribed });
        },

        setGremlyColor: async (colorId: string) => {
          const userId = get().userId;
          if (!userId) return;

          set({ gremlyColor: colorId });

          const { error } = await supabase
            .from('cortex_preferences')
            .upsert(
              { owner_id: userId, gremly_color: colorId, updated_at: nowTimestamp() },
              { onConflict: 'owner_id' },
            );

          if (error) {
            console.error('[GremlyStore] setGremlyColor failed:', error);
          }
        },

        setLastActiveDate: (date: string) => {
          set({ lastActiveDate: date });
        },

        setUserProfile: async (name, pronouns) => {
          set({ userName: name, userPronouns: pronouns });
          const userId = get().userId;
          if (!userId) return;
          const { data: existing, error: selectError } = await supabase
            .from('user_profiles')
            .select('identity')
            .eq('user_id', userId)
            .maybeSingle();
          if (selectError) {
            console.error(
              '[GremlyStore] setUserProfile aborted — identity fetch failed:',
              selectError,
            );
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const Sentry = require('@sentry/react-native');
              Sentry.captureException(new Error('setUserProfile identity fetch failed'), {
                extra: { error: JSON.stringify(selectError) },
              });
            } catch {
              /* Sentry not available */
            }
            return; // do NOT proceed to upsert — would wipe existing identity
          }
          const currentIdentity = (existing?.identity as Record<string, unknown>) ?? {};
          const merged = { ...currentIdentity, name, pronouns, source: 'onboarding' };
          const { error } = await supabase
            .from('user_profiles')
            .upsert({ user_id: userId, identity: merged }, { onConflict: 'user_id' });
          if (error) console.error('[GremlyStore] setUserProfile failed:', error);
        },

        setDayBoundaryHour: async (hour: number) => {
          const userId = get().userId;
          if (!userId) return;

          // Local-first: update DateService + Zustand before Supabase (offline-safe)
          getDateService().setDayBoundaryHour(hour);
          set({ dayBoundaryHour: hour });

          const { error } = await supabase
            .from('cortex_preferences')
            .upsert(
              { owner_id: userId, day_boundary_hour: hour, updated_at: nowTimestamp() },
              { onConflict: 'owner_id' },
            );

          if (error) {
            console.error('[GremlyStore] setDayBoundaryHour failed:', error);
          }

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
              updated_at: nowTimestamp(),
            },
            { onConflict: 'owner_id' },
          );

          if (error) {
            console.error(
              '[GremlyStore] setOnboardingCompletedAt failed:',
              JSON.stringify(error, null, 2),
            );
            return;
          }

          set({ onboardingCompletedAt: timestamp });
        },

        markOnboardingComplete: async () => {
          const userId = get().userId;
          if (!userId) return;

          const now = nowTimestamp();

          const { error } = await supabase
            .from('cortex_preferences')
            .upsert(
              { owner_id: userId, onboarding_completed_at: now, updated_at: now },
              { onConflict: 'owner_id' },
            );

          if (error) {
            console.error(
              '[GremlyStore] markOnboardingComplete failed:',
              JSON.stringify(error, null, 2),
            );
            return;
          }

          set({ onboardingCompletedAt: now });
          console.log('[GremlyStore] Onboarding marked complete');
        },

        startTraining: async () => {
          const userId = get().userId;
          if (!userId) return;

          const now = nowTimestamp();
          set({ trialStartedAt: now });

          const { error } = await supabase
            .from('cortex_preferences')
            .upsert(
              { owner_id: userId, trial_started_at: now, updated_at: now },
              { onConflict: 'owner_id' },
            );

          if (error) {
            console.error('[GremlyStore] startTraining failed:', JSON.stringify(error, null, 2));
          }
        },

        markFirstDropComplete: async () => {
          const userId = get().userId;
          if (!userId) return;

          const now = nowTimestamp();

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

        markDemoSweepComplete: async () => {
          const userId = get().userId;
          if (!userId) return;

          const now = nowTimestamp();

          // Set local state first — don't block UX on DB write
          set({ demoSweepCompletedAt: now });
          console.log('[GremlyStore] Demo sweep marked complete');

          // Best-effort persist to Supabase
          try {
            const { error } = await supabase
              .from('cortex_preferences')
              .upsert(
                { owner_id: userId, demo_sweep_completed_at: now, updated_at: now },
                { onConflict: 'owner_id' },
              );

            if (error) {
              console.warn(
                '[GremlyStore] markDemoSweepComplete DB write failed (non-blocking):',
                error.message,
              );
            }
          } catch (e) {
            console.warn('[GremlyStore] markDemoSweepComplete DB exception (non-blocking):', e);
          }
        },

        markFirstTodayVisitComplete: async () => {
          const userId = get().userId;
          if (!userId) return;

          // Don't overwrite if already set
          if (get().firstTodayVisitCompletedAt) return;

          const now = nowTimestamp();

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

        // ═══════════════════════════════════════════════════════════════════
        // FEEDING GAUGE ACTIONS (Soul Document v8)
        // ═══════════════════════════════════════════════════════════════════

        addGaugeContribution: async (source: string, value: number) => {
          const userId = get().userId;
          if (!userId) return { newValue: 0, justFed: false };

          const currentRitualDay = get().ensureCurrentRitualDay();

          // Pre-graduation: 1.25x gauge multiplier
          const multiplier = !get().graduatedAt ? 1.25 : 1.0;
          const adjustedValue = value * multiplier;

          if (__DEV__) {
            console.log('[GremlyStore] addGaugeContribution', {
              source,
              value,
              multiplier,
              adjustedValue,
              userId,
              currentRitualDay,
            });
          }

          try {
            // ONE atomic RPC: gauge update + fed detection + age-up
            // No client-side orchestration. No race conditions.
            const { data, error } = await supabase.rpc('update_gauge_atomic', {
              p_owner_id: userId,
              p_ritual_day: currentRitualDay,
              p_source: source,
              p_value: adjustedValue,
            });

            if (error) {
              console.error('[GremlyStore] update_gauge_atomic RPC failed:', error);
              return { newValue: get().feedingGaugeValue, justFed: false };
            }

            const row = data?.[0];
            if (!row) {
              console.error('[GremlyStore] update_gauge_atomic returned no data');
              return { newValue: get().feedingGaugeValue, justFed: false };
            }

            const newGaugeValue: number = row.new_gauge_value ?? get().feedingGaugeValue;
            const justFed: boolean = row.just_fed ?? false;
            const newFedDaysCount: number = row.new_fed_days_count ?? get().fedDaysCount;
            const didAgeUp: boolean = row.did_age_up ?? false;
            const newAge: number = row.new_age ?? get().gremlyAge;
            const newTier: string = row.new_tier ?? get().currentTierName;

            if (__DEV__) {
              console.log('[GremlyStore] update_gauge_atomic result', {
                source,
                newGaugeValue,
                justFed,
                newFedDaysCount,
                didAgeUp,
                newAge,
                newTier,
              });
            }

            const contribution: FeedingContribution = {
              source: source as FeedingContribution['source'],
              value: adjustedValue,
              timestamp: nowTimestamp(),
            };

            // Update store with ALL server-confirmed values at once
            set({
              feedingGaugeValue: newGaugeValue,
              isFedToday: row.is_fed ?? false,
              feedingContributions: [...get().feedingContributions, contribution],
              feedingGaugeLastUpdatedAt: nowTimestamp(),
              fedDaysCount: newFedDaysCount,
              ...(didAgeUp
                ? {
                    gremlyAge: newAge,
                    gremlyAgeLastIncrementedAt: nowTimestamp(),
                    currentTierName: newTier,
                  }
                : {}),
            });

            // Decrement pending preview counter
            const currentPending = get().pendingGaugePreviews;
            if (currentPending > 0) {
              set({ pendingGaugePreviews: currentPending - 1 });
            }

            // Check challenge completion on every fed flip
            if (justFed) {
              get()
                .checkChallengeCompletionOnFedFlip()
                .catch((err) =>
                  console.warn('[GremlyStore] checkChallengeCompletionOnFedFlip error:', err),
                );
            }

            // Fed celebration: only fire if the UI hasn't already shown one
            // (CatchAllNotepad and SweepFlowScreen fire from optimistic preview)
            if (justFed && !get().todayFedCelebrationShownAt) {
              set({ todayFedCelebrationShownAt: nowTimestamp() });
              celebrationController.showFedCelebration(newFedDaysCount);
            }

            // Age-up celebration: always fires from here (the store),
            // since only the server can confirm the age actually changed.
            if (didAgeUp && !get().todayFeedingAgeUpShownAt) {
              set({ todayFeedingAgeUpShownAt: nowTimestamp() });

              const previousAge = newAge - 1;
              const oldTier = getTierForAge(previousAge);
              const newTierObj = getTierForAge(newAge);
              const isTierTransition = oldTier.name !== newTierObj.name;

              celebrationController.showAgeUpCelebration(newAge, {
                tierName: newTierObj.name,
                isTierTransition,
                previousTierName: isTierTransition ? oldTier.name : undefined,
              });
            }

            return { newValue: newGaugeValue, justFed };
          } catch (error) {
            console.error('[GremlyStore] addGaugeContribution CAUGHT', error);
            const currentPendingOnError = get().pendingGaugePreviews;
            if (currentPendingOnError > 0) {
              set({ pendingGaugePreviews: currentPendingOnError - 1 });
            }
            return { newValue: get().feedingGaugeValue, justFed: false };
          }
        },

        completeSweepSession: async (cardsProcessed: number, didJournal: boolean) => {
          const baseSweepValue = calculateSweepContribution(cardsProcessed, false);
          if (baseSweepValue > 0) {
            await get().addGaugeContribution('sweep', baseSweepValue);
          }
          if (didJournal) {
            await get().addGaugeContribution('journal', GAUGE_WEIGHTS.JOURNAL_BONUS);
          }
        },

        completeMorningBrief: async () => {
          const alreadyCredited = get().feedingContributions.some((c) => c.source === 'brief');
          if (alreadyCredited) return;
          await get().addGaugeContribution('brief', GAUGE_WEIGHTS.BRIEF);
          // Track training progress
          if (!get().graduatedAt) {
            get()
              .refreshTrainingReadiness()
              .catch((err) => {
                console.warn('[GremlyStore] refreshTrainingReadiness after brief failed:', err);
              });
          }
        },

        commitLockInItems: async (count: number) => {
          const existingLockInCount = get().feedingContributions.filter(
            (c) => c.source === 'lock_in',
          ).length;
          const remaining = GAUGE_WEIGHTS.LOCK_IN_CAP - existingLockInCount;
          if (remaining <= 0) return;
          const itemsToCredit = Math.min(count, remaining);
          const value = itemsToCredit * GAUGE_WEIGHTS.LOCK_IN_ITEM;
          if (value > 0) {
            await get().addGaugeContribution('lock_in', value);
          }
          // Track training progress
          if (!get().graduatedAt) {
            get()
              .refreshTrainingReadiness()
              .catch((err) => {
                console.warn('[GremlyStore] refreshTrainingReadiness after lock-in failed:', err);
              });
          }
        },

        trackSpaceAssign: async () => {
          const count = get().feedingContributions.filter(
            (c) => c.source === 'space_assign',
          ).length;
          if (count >= GAUGE_WEIGHTS.SPACE_ASSIGN_CAP) return;
          await get().addGaugeContribution('space_assign', GAUGE_WEIGHTS.SPACE_ASSIGN);
        },

        trackSpaceChat: async () => {
          const count = get().feedingContributions.filter((c) => c.source === 'space_chat').length;
          if (count >= GAUGE_WEIGHTS.SPACE_CHAT_CAP) return;
          await get().addGaugeContribution('space_chat', GAUGE_WEIGHTS.SPACE_CHAT);
        },

        trackSpaceCreate: async () => {
          const exists = get().feedingContributions.some((c) => c.source === 'space_create');
          if (exists) return;
          await get().addGaugeContribution('space_create', GAUGE_WEIGHTS.SPACE_CREATE);
        },

        resetDailyGauge: () => {
          set({
            feedingGaugeValue: 0,
            pendingGaugePreviews: 0,
            isFedToday: false,
            feedingContributions: [],
            feedingGaugeLastUpdatedAt: null,
            todayFedCelebrationShownAt: null,
            todayFeedingAgeUpShownAt: null,
          });
        },

        previewGaugeDrop: () => {
          const { todayDropsCount, pendingGaugePreviews, feedingGaugeValue, isFedToday } = get();
          const dropNumber = todayDropsCount + pendingGaugePreviews + 1;
          const value = getDropValue(dropNumber);
          const multiplier = !get().graduatedAt ? 1.25 : 1.0;
          const adjustedValue = value * multiplier;
          const optimisticValue = feedingGaugeValue + adjustedValue;
          const justCrossedFed = !isFedToday && optimisticValue >= FED_THRESHOLD;

          set({
            feedingGaugeValue: optimisticValue,
            pendingGaugePreviews: pendingGaugePreviews + 1,
          });

          if (__DEV__) {
            console.log('[GremlyStore] Optimistic gauge preview', {
              dropNumber,
              value,
              newGaugeValue: optimisticValue,
              pendingPreviews: pendingGaugePreviews + 1,
              justCrossedFed,
            });
          }

          return { justCrossedFed };
        },

        previewSweepGauge: (totalCards: number, didJournal: boolean) => {
          const { feedingGaugeValue, isFedToday } = get();

          if (totalCards <= 0) return { justCrossedFed: false, projectedValue: feedingGaugeValue };

          // Calculate what completeSweepSession will add (mirrors its logic exactly)
          const baseSweep = calculateSweepContribution(totalCards, false);
          const journalBonus = didJournal ? GAUGE_WEIGHTS.JOURNAL_BONUS : 0;
          const totalContribution = baseSweep + journalBonus;
          const optimisticValue = feedingGaugeValue + totalContribution;
          const justCrossedFed = !isFedToday && optimisticValue >= FED_THRESHOLD;

          set({
            feedingGaugeValue: optimisticValue,
          });

          if (__DEV__) {
            console.log('[GremlyStore] Optimistic sweep gauge preview', {
              totalCards,
              didJournal,
              baseSweep,
              journalBonus,
              previousGauge: feedingGaugeValue,
              newGauge: optimisticValue,
              justCrossedFed,
            });
          }

          return { justCrossedFed, projectedValue: optimisticValue };
        },

        refreshRitualProgress: async () => {
          const { userId, dayBoundaryHour } = get();
          if (!userId) return;

          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
            feedingGaugeValue: (ritualProgress?.feeding_gauge_value as number) ?? 0,
            isFedToday: (ritualProgress?.is_fed as boolean) ?? false,
          });
        },

        fetchFeedingHistory: async () => {
          const { userId, dayBoundaryHour } = get();
          if (!userId) return;

          try {
            // Use device timezone (source of truth for ritual day, per timezone fix)
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const todayRitual = getRitualDay(dayBoundaryHour, timezone);

            // Build 7-day window by subtracting days from today's ritual day
            // Parse the ritual day string and subtract using date arithmetic
            // Use noon to avoid DST edge cases when subtracting days
            const todayDate = new Date(todayRitual + 'T12:00:00');
            const days: string[] = [];
            for (let i = 6; i >= 0; i--) {
              const d = new Date(todayDate);
              d.setDate(d.getDate() - i);
              // Format as YYYY-MM-DD (same format as ritual_day in DB)
              const yyyy = d.getFullYear();
              const mm = String(d.getMonth() + 1).padStart(2, '0');
              const dd = String(d.getDate()).padStart(2, '0');
              days.push(`${yyyy}-${mm}-${dd}`);
            }

            const fromDate = days[0];

            const { data, error } = await supabase
              .from('daily_ritual_progress')
              .select('ritual_day, is_fed')
              .eq('owner_id', userId)
              .gte('ritual_day', fromDate)
              .order('ritual_day', { ascending: true });

            if (error) {
              console.error('[GremlyStore] fetchFeedingHistory failed:', error);
              return;
            }

            const fedMap = new Map<string, boolean>();
            (data ?? []).forEach((row: any) => {
              fedMap.set(row.ritual_day, row.is_fed === true);
            });

            const history: Array<{ date: string; isFed: boolean }> = days.map((date) => ({
              date,
              isFed: fedMap.get(date) ?? false,
            }));

            set({ feedingHistory: history });

            if (__DEV__) {
              console.log('[GremlyStore] Feeding history loaded', {
                todayRitual,
                timezone,
                days,
                fedCount: history.filter((d) => d.isFed).length,
              });
            }
          } catch (err) {
            console.error('[GremlyStore] fetchFeedingHistory failed:', err);
          }
        },

        fetchLifetimeStats: async (): Promise<{ daysFed: number; thoughtsCount: number }> => {
          const { userId } = get();
          if (!userId) return { daysFed: 0, thoughtsCount: 0 };

          try {
            const [fedDaysRes, todosRes, notesRes, habitsRes] = await Promise.all([
              supabase
                .from('daily_ritual_progress')
                .select('*', { count: 'exact', head: true })
                .eq('owner_id', userId)
                .eq('is_fed', true),
              supabase
                .from('todos')
                .select('*', { count: 'exact', head: true })
                .eq('owner_id', userId),
              supabase
                .from('notes')
                .select('*', { count: 'exact', head: true })
                .eq('owner_id', userId)
                .is('external_source', null),
              supabase
                .from('habits')
                .select('*', { count: 'exact', head: true })
                .eq('owner_id', userId),
            ]);

            const daysFed = fedDaysRes.count ?? 0;
            const thoughtsCount =
              (todosRes.count ?? 0) + (notesRes.count ?? 0) + (habitsRes.count ?? 0);

            return { daysFed, thoughtsCount };
          } catch (err) {
            console.error('[GremlyStore] fetchLifetimeStats failed:', err);
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const Sentry = require('@sentry/react-native');
              Sentry.captureException(err);
            } catch {
              /* Sentry not available */
            }
            return { daysFed: 0, thoughtsCount: 0 };
          }
        },

        // ═══════════════════════════════════════════════════════════════════
        // TRAINING PROGRESS ACTIONS
        // ═══════════════════════════════════════════════════════════════════

        advanceTrainingDropStep: () => {
          const { trainingDropStep, graduatedAt } = get();
          if (graduatedAt) return;
          if (trainingDropStep >= 6) return; // already done

          const nextStep = trainingDropStep === 0 ? 1 : trainingDropStep + 1;
          const isDone = nextStep >= 6;

          set({ trainingDropStep: isDone ? 6 : nextStep });

          // Persist to Supabase (best-effort)
          const userId = get().userId;
          if (userId) {
            supabase
              .from('cortex_preferences')
              .update({ training_drop_step: isDone ? 6 : nextStep })
              .eq('owner_id', userId)
              .then(({ error }) => {
                if (error)
                  console.warn('[GremlyStore] Failed to persist training_drop_step:', error);
              });
          }
        },

        refreshTrainingReadiness: async () => {
          const { userId, trialStartedAt, graduatedAt } = get();
          if (!userId || graduatedAt || !trialStartedAt) return 0;

          try {
            const { data, error } = await supabase.rpc('get_training_readiness', {
              p_owner_id: userId,
              p_since: trialStartedAt,
            });

            if (error) {
              console.error('[GremlyStore] get_training_readiness RPC failed:', error);
              return get().trainingReadiness;
            }

            // data is a jsonb object with the readiness metrics
            const metrics = data as Record<string, number>;

            const trainingData: UserTrainingData = {
              totalDrops: metrics.total_drops ?? 0,
              daysWithDrops: metrics.days_with_drops ?? 0,
              totalSweeps: metrics.total_sweeps ?? 0,
              entityTypeCount: metrics.entity_types ?? 0,
              journalCount: metrics.journal_count ?? 0,
              entityChatCount: metrics.entity_chat_count ?? 0,
              briefCount: metrics.brief_count ?? 0,
              todosCount: metrics.todos_count ?? 0,
              calendarConnected: false, // checked at runtime, not stored in DB
            };

            const score = calculateTrainingReadiness(trainingData);

            set({ trainingReadiness: score });

            // Check for graduation
            if (score >= GRADUATION_THRESHOLD && !get().pendingGraduation) {
              set({ pendingGraduation: true });
            }

            if (__DEV__) {
              console.log('[GremlyStore] Training readiness refreshed:', { score, trainingData });
            }

            return score;
          } catch (err) {
            console.error('[GremlyStore] refreshTrainingReadiness failed:', err);
            return get().trainingReadiness;
          }
        },

        markGaugeExplanationSeen: () => {
          set({ hasSeenGaugeExplanation: true });
          const userId = get().userId;
          if (userId) {
            supabase
              .from('cortex_preferences')
              .update({ has_seen_gauge_explanation: true })
              .eq('owner_id', userId)
              .then(({ error }) => {
                if (error)
                  console.warn(
                    '[GremlyStore] Failed to persist has_seen_gauge_explanation:',
                    error,
                  );
              });
          }
        },

        markFirstFedModalSeen: () => {
          set({ hasSeenFirstFedModal: true });
          const userId = get().userId;
          if (userId) {
            supabase
              .from('cortex_preferences')
              .update({ has_seen_first_fed_modal: true })
              .eq('owner_id', userId)
              .then(({ error }) => {
                if (error)
                  console.warn('[GremlyStore] Failed to persist has_seen_first_fed_modal:', error);
              });
          }
        },

        markSweepUnlockModalSeen: () => {
          set({ hasSeenSweepUnlockModal: true });
          const userId = get().userId;
          if (userId) {
            supabase
              .from('cortex_preferences')
              .update({ has_seen_sweep_unlock_modal: true })
              .eq('owner_id', userId)
              .then(({ error }) => {
                if (error)
                  console.warn(
                    '[GremlyStore] Failed to persist has_seen_sweep_unlock_modal:',
                    error,
                  );
              });
          }
        },

        markEntityChatHighlightSeen: () => {
          set({ hasSeenEntityChatHighlight: true });
          const userId = get().userId;
          if (userId) {
            supabase
              .from('cortex_preferences')
              .update({ has_seen_entity_chat_highlight: true })
              .eq('owner_id', userId)
              .then(({ error }) => {
                if (error)
                  console.warn(
                    '[GremlyStore] Failed to persist has_seen_entity_chat_highlight:',
                    error,
                  );
              });
          }
        },

        markTrainingMeterAutoOpenSeen: () => {
          set({ hasSeenTrainingMeterAutoOpen: true });
          const userId = get().userId;
          if (userId) {
            supabase
              .from('cortex_preferences')
              .update({ has_seen_training_meter_auto_open: true })
              .eq('owner_id', userId)
              .then(({ error }) => {
                if (error)
                  console.warn(
                    '[GremlyStore] Failed to persist has_seen_training_meter_auto_open:',
                    error,
                  );
              });
          }
        },

        markReadonlyIntroSeen: async () => {
          const { userId } = get();
          if (!userId) return;

          set({ hasSeenReadonlyIntro: true });

          const { error } = await supabase
            .from('cortex_preferences')
            .update({ has_seen_readonly_intro: true })
            .eq('owner_id', userId);

          if (error) {
            console.error('[GremlyStore] Failed to persist has_seen_readonly_intro:', error);
            try {
              const SentryMod = await import('@sentry/react-native');
              SentryMod.captureException(new Error('Failed to persist has_seen_readonly_intro'), {
                extra: { error: JSON.stringify(error) },
              });
            } catch {
              /* Sentry not available */
            }
            return;
          }

          set((state) => ({
            lifecycleCache: state.lifecycleCache
              ? {
                  ...state.lifecycleCache,
                  hasSeenReadonlyIntro: true,
                  cachedAt: nowTimestamp(),
                }
              : null,
          }));
        },

        finalizeGraduation: async () => {
          const { userId, sockCount, graduatedAt } = get();

          // Idempotency: don't re-run if already graduated
          if (graduatedAt) {
            if (__DEV__)
              console.log(
                '[GremlyStore] finalizeGraduation called but already graduated, skipping',
              );
            return;
          }

          const now = nowTimestamp();
          const newSockCount = sockCount + 1;

          set({
            graduatedAt: now,
            challengeStartedAt: now,
            pendingGraduation: false,
            postGraduationMessageShown: false,
            sockCount: newSockCount,
          });

          if (userId) {
            supabase
              .from('cortex_preferences')
              .update({
                graduated_at: now,
                challenge_started_at: now,
                pending_graduation: false,
                sock_count: newSockCount,
              })
              .eq('owner_id', userId)
              .then(({ error }) => {
                if (error)
                  console.warn('[GremlyStore] Failed to persist finalizeGraduation:', error);
              });
          }

          // Keep lifecycleCache in sync so next cold-start doesn't use stale data
          set((state) => ({
            lifecycleCache: state.lifecycleCache
              ? {
                  ...state.lifecycleCache,
                  graduatedAt: now,
                  challengeStartedAt: now,
                  cachedAt: nowTimestamp(),
                }
              : null,
          }));

          if (__DEV__) {
            console.log('[GremlyStore] Graduation finalized, sock_count:', newSockCount);
          }
        },

        checkChallengeCompletionOnFedFlip: async () => {
          const { userId, challengeStartedAt, challengeCompletedAt } = get();

          if (!userId) return;
          if (!challengeStartedAt) return; // User hasn't graduated tutorial
          if (challengeCompletedAt) return; // Already complete, no-op

          // Count cumulative fed days since challenge started
          const { count, error } = await supabase
            .from('daily_ritual_progress')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', userId)
            .eq('is_fed', true)
            .gte('ritual_day', challengeStartedAt.split('T')[0]);

          if (error) {
            console.error(
              '[GremlyStore] Failed to check fed day count for challenge completion:',
              error,
            );
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const Sentry = require('@sentry/react-native');
              Sentry.captureException(new Error('checkChallengeCompletionOnFedFlip count failed'), {
                extra: { error: JSON.stringify(error) },
              });
            } catch {
              /* Sentry not available */
            }
            return;
          }

          if ((count ?? 0) < 7) return; // Not yet at 7 fed days

          // User just hit their 7th fed day. Complete the challenge.
          const now = nowTimestamp();

          // Optimistic local update
          set({ challengeCompletedAt: now });

          // Update lifecycleCache
          set((state) => ({
            lifecycleCache: state.lifecycleCache
              ? {
                  ...state.lifecycleCache,
                  challengeCompletedAt: now,
                  cachedAt: nowTimestamp(),
                }
              : null,
          }));

          // Persist to Supabase
          const { error: updateError } = await supabase
            .from('cortex_preferences')
            .update({ challenge_completed_at: now })
            .eq('owner_id', userId);

          if (updateError) {
            console.error('[GremlyStore] Failed to persist challenge_completed_at:', updateError);
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const Sentry = require('@sentry/react-native');
              Sentry.captureException(new Error('Failed to persist challenge_completed_at'), {
                extra: { error: JSON.stringify(updateError) },
              });
            } catch {
              /* Sentry not available */
            }
            // Local state already updated — server will eventually sync via initialize
            // Do not emit event if server persist failed
            return;
          }

          // Fire challenge-completed event via the Cloudflare Worker
          try {
            const workerUrl = env.cortexUrl;
            if (!workerUrl) {
              console.warn(
                '[GremlyStore] No cortexUrl configured, skipping challenge.completed event',
              );
              return;
            }

            const response = await fetch(`${workerUrl}/api/challenge-completed`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: userId,
                completed_at: now,
                timezone:
                  get().userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
              }),
            });

            if (!response.ok) {
              throw new Error(`challenge-completed POST failed: ${response.status}`);
            }

            if (__DEV__) console.log('[GremlyStore] \u2705 challenge.completed event emitted');
          } catch (err) {
            console.error('[GremlyStore] Failed to emit challenge.completed event:', err);
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const Sentry = require('@sentry/react-native');
              Sentry.captureException(err);
            } catch {
              /* Sentry not available */
            }
            // Local + server state are consistent — just the orchestration didn't fire.
          }
        },

        // ═══════════════════════════════════════════════════════════════════
        // TODO MUTATIONS
        // ═══════════════════════════════════════════════════════════════════

        createTodo: async (todo: Partial<Todo>) => {
          const userId = get().userId;
          if (!userId) throw new Error('Not authenticated');

          const now = nowTimestamp();
          const sanitized = sanitizeForSupabase(todo as Record<string, unknown>, 'todo');
          const payload = {
            ...sanitized,
            owner_id: userId,
            updated_at: now,
          };

          const { data, error } = await supabase.from('todos').insert(payload).select().single();

          if (error) {
            console.error('[GremlyStore] createTodo failed:', error);
            throw error;
          }

          // Add to store with type field (DB doesn't store it)
          const todoWithType = {
            ...data,
            type: 'todo' as const,
            reminders: data.reminders_json ?? [],
          };
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
          const now = nowTimestamp();

          // 1. OPTIMISTIC UPDATE
          set((state) => ({
            todos: state.todos.map((t) =>
              t.id === id ? { ...t, ...updates, updated_at: now } : t,
            ),
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

          // Cancel any scheduled reminders (fire and forget)
          if (prevTodo?.reminders?.length) {
            cancelAllItemReminders(prevTodo.reminders);
          }

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
          const now = nowTimestamp();
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

          // Cancel any scheduled reminders (fire and forget)
          if (prevTodo?.reminders?.length) {
            cancelAllItemReminders(prevTodo.reminders);
          }
        },

        uncompleteTodo: async (id: string) => {
          const prevTodo = get().todos.find((t) => t.id === id);

          // 1. OPTIMISTIC UPDATE
          set((state) => ({
            todos: state.todos.map((t) => (t.id === id ? { ...t, completed_at: null } : t)),
          }));

          // 2. SYNC TO SUPABASE
          const { error } = await supabase
            .from('todos')
            .update({ completed_at: null })
            .eq('id', id);

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
          const now = nowTimestamp();
          const prevTodo = get().todos.find((t) => t.id === id);

          // Cancel any scheduled reminders (fire and forget)
          if (prevTodo?.reminders?.length) {
            cancelAllItemReminders(prevTodo.reminders);
          }

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

          const now = nowTimestamp();

          // Parse frequency into structured fields if not already set
          let habitData = habit;
          if (!habit.cadence || !habit.target_per_period) {
            const parsed = parseHabitFrequency(
              habit.frequency,
              habit.frequency_value as number | null,
            );
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
            updated_at: now,
          };

          const { data, error } = await supabase.from('habits').insert(payload).select().single();

          if (error) {
            console.error('[GremlyStore] createHabit failed:', error);
            throw error;
          }

          // Add to store with type field (DB doesn't store it)
          const habitWithType = {
            ...data,
            type: 'habit' as const,
            reminders: data.reminders_json ?? [],
          };
          set((state) => ({
            habits: [...state.habits, habitWithType],
          }));

          eventBus.emit('entity:created', {
            entity: habitWithType,
            type: 'habit',
            spaceId: data.space_id,
            source: STORE_EVENT_SOURCE,
          });
          // Track training progress
          if (!get().graduatedAt) {
            get()
              .refreshTrainingReadiness()
              .catch((err) => {
                console.warn('[GremlyStore] refreshTrainingReadiness after habit failed:', err);
              });
          }
          return habitWithType;
        },

        updateHabit: async (id: string, updates: Partial<Habit>) => {
          const prevHabit = get().habits.find((h) => h.id === id);
          const now = nowTimestamp();

          // 1. OPTIMISTIC UPDATE
          set((state) => ({
            habits: state.habits.map((h) =>
              h.id === id ? { ...h, ...updates, updated_at: now } : h,
            ),
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

          // Cancel any scheduled reminders (fire and forget)
          if (prevHabit?.reminders?.length) {
            cancelAllItemReminders(prevHabit.reminders);
          }

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
          const todayDate = getDateService().today();
          // CRITICAL: occurred_at must derive to same date as occurred_day
          // Use noon UTC on the local day to avoid timezone boundary issues
          const occurredAt = `${todayDate}T12:00:00.000Z`;
          // Keep nowIso for last_completed_at (actual timestamp of action)
          const nowIso = nowTimestamp();
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
              id: `temp_${getDateService().now().getTime()}_${Math.random().toString(36).slice(2)}`,
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

            // Cancel 'once' frequency reminders (daily reminders persist since habit recurs)
            if (prevHabit?.reminders?.length) {
              const onceReminders = prevHabit.reminders.filter((r: any) => r.frequency === 'once');
              if (onceReminders.length) cancelAllItemReminders(onceReminders);
            }

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
                habits: state.habits.map((h) =>
                  h.id === id ? { ...h, start_date: todayDate } : h,
                ),
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
          const todayDate = getDateService().today();
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
          const todayDate = getDateService().today();

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

          const occurredDay = getDateService().extractLocalDate(dateIso) ?? dateIso.split('T')[0];
          const occurredAt = `${occurredDay}T12:00:00.000Z`; // Use noon UTC on the target day
          const now = nowTimestamp(); // For last_checked_in_at only

          // Check if already completed for this date
          const existing = get().habitProgress.find(
            (p) => p.habit_id === habitId && p.occurred_day === occurredDay,
          );
          if (existing) {
            console.log('[GremlyStore] Habit already completed for date:', {
              habitId,
              occurredDay,
            });
            return;
          }

          // 1. OPTIMISTIC UPDATE - add to habitProgress immediately
          const tempId = `temp_${getDateService().now().getTime()}_${Math.random().toString(36).slice(2)}`;
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
            habits: state.habits.map((h) =>
              h.id === habitId ? { ...h, last_checked_in_at: now } : h,
            ),
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

          const occurredDay = getDateService().extractLocalDate(dateIso) ?? dateIso.split('T')[0];

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
          const now = nowTimestamp();

          // Update local state immediately
          set((state) => ({
            habits: state.habits.map((h) =>
              h.id === habitId ? { ...h, last_checked_in_at: now } : h,
            ),
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
          const now = nowTimestamp();
          const prevHabit = get().habits.find((h) => h.id === id);

          // Cancel any scheduled reminders (fire and forget)
          if (prevHabit?.reminders?.length) {
            cancelAllItemReminders(prevHabit.reminders);
          }

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

          const now = nowTimestamp();
          const sanitized = sanitizeForSupabase(noteData as Record<string, unknown>, 'note');
          const payload = {
            ...sanitized,
            owner_id: userId,
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
          // Track training progress for journal entries
          if (!get().graduatedAt && data.subtype === 'journal') {
            get()
              .refreshTrainingReadiness()
              .catch((err) => {
                console.warn('[GremlyStore] refreshTrainingReadiness after journal failed:', err);
              });
          }
          return noteWithType;
        },

        updateNote: async (id: string, updates: Partial<Note>) => {
          const prevNote = get().notes.find((n) => n.id === id);
          const now = nowTimestamp();

          // 1. OPTIMISTIC UPDATE
          set((state) => ({
            notes: state.notes.map((n) =>
              n.id === id ? { ...n, ...updates, updated_at: now } : n,
            ),
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

        updateLinkedEventId: async (
          entityId: string,
          entityType: 'todo' | 'note' | 'habit',
          linkedEventId: string | null,
        ) => {
          const now = nowTimestamp();
          const state = get();

          // Optimistic update
          if (entityType === 'todo') {
            set({
              todos: state.todos.map((t) =>
                t.id === entityId ? { ...t, linked_event_id: linkedEventId, updated_at: now } : t,
              ),
            });
          } else if (entityType === 'habit') {
            set({
              habits: state.habits.map((h) =>
                h.id === entityId ? { ...h, linked_event_id: linkedEventId, updated_at: now } : h,
              ),
            });
          } else {
            set({
              notes: state.notes.map((n) =>
                n.id === entityId ? { ...n, linked_event_id: linkedEventId, updated_at: now } : n,
              ),
            });
          }

          // Persist to Supabase
          const table =
            entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
          const { error } = await supabase
            .from(table)
            .update({ linked_event_id: linkedEventId, updated_at: now })
            .eq('id', entityId);

          if (error) {
            console.error(`[GremlyStore] updateLinkedEventId failed:`, error);
            // Revert on error - refetch would be better but this is simpler
          }
        },

        archiveNote: async (id: string, reason?: string) => {
          const now = nowTimestamp();
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

          const now = nowTimestamp();
          const payload = {
            ...space,
            owner_id: userId,
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

          eventBus.emit('entity:created', {
            entity: data,
            type: 'space',
            source: STORE_EVENT_SOURCE,
          });
          // Track training progress
          if (!get().graduatedAt) {
            get()
              .refreshTrainingReadiness()
              .catch((err) => {
                console.warn('[GremlyStore] refreshTrainingReadiness after space failed:', err);
              });
          }
          return data;
        },

        updateSpace: async (id: string, updates: Partial<Space>) => {
          const prevSpace = get().spaces.find((s) => s.id === id);
          const now = nowTimestamp();

          // 1. OPTIMISTIC UPDATE
          set((state) => ({
            spaces: state.spaces.map((s) =>
              s.id === id ? { ...s, ...updates, updated_at: now } : s,
            ),
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
        // SPACE SUGGESTIONS ACTIONS
        // ═══════════════════════════════════════════════════════════════════

        fetchSpaceSuggestions: async () => {
          const userId = get().userId;
          if (!userId) {
            console.log('[GremlyStore] fetchSpaceSuggestions: No userId, skipping');
            return;
          }

          // Avoid refetching if already loaded
          if (get().spaceSuggestionsLoaded) {
            console.log('[GremlyStore] fetchSpaceSuggestions: Already loaded, skipping');
            return;
          }

          console.log('[GremlyStore] Fetching space suggestions for user:', userId);

          try {
            const { data, error } = await supabase
              .from('space_suggestions')
              .select('*')
              .eq('user_id', userId)
              .eq('status', 'pending')
              .order('confidence', { ascending: false });

            if (error) {
              console.error('[GremlyStore] fetchSpaceSuggestions failed:', error);
              return;
            }

            console.log('[GremlyStore] Fetched suggestions:', data?.length || 0);
            set({ spaceSuggestions: data || [], spaceSuggestionsLoaded: true });
          } catch (err) {
            console.error('[GremlyStore] fetchSpaceSuggestions error:', err);
          }
        },

        acceptSuggestion: async (suggestionId: string) => {
          const suggestion = get().spaceSuggestions.find((s) => s.id === suggestionId);
          if (!suggestion) return;

          const now = nowTimestamp();

          // 1. OPTIMISTIC UPDATE - remove from local state
          set((state) => ({
            spaceSuggestions: state.spaceSuggestions.filter((s) => s.id !== suggestionId),
          }));

          // 2. SYNC TO SUPABASE
          const { error } = await supabase
            .from('space_suggestions')
            .update({ status: 'accepted', updated_at: now })
            .eq('id', suggestionId);

          if (error) {
            console.error('[GremlyStore] acceptSuggestion failed:', error);
            // Rollback on error
            set((state) => ({
              spaceSuggestions: [...state.spaceSuggestions, suggestion],
            }));
            throw error;
          }
        },

        declineSuggestion: async (suggestionId: string) => {
          const suggestion = get().spaceSuggestions.find((s) => s.id === suggestionId);
          if (!suggestion) return;

          const now = nowTimestamp();

          // 1. OPTIMISTIC UPDATE - remove from local state
          set((state) => ({
            spaceSuggestions: state.spaceSuggestions.filter((s) => s.id !== suggestionId),
          }));

          // 2. SYNC TO SUPABASE
          const { error } = await supabase
            .from('space_suggestions')
            .update({ status: 'dismissed', updated_at: now })
            .eq('id', suggestionId);

          if (error) {
            console.error('[GremlyStore] declineSuggestion failed:', error);
            // Rollback on error
            set((state) => ({
              spaceSuggestions: [...state.spaceSuggestions, suggestion],
            }));
            throw error;
          }
        },

        assignDropsToSpace: async (dropIds: string[], spaceId: string) => {
          const now = nowTimestamp();
          const state = get();

          // Build previous state for rollback
          const prevTodos = state.todos.filter((t) => dropIds.includes(t.id));
          const prevNotes = state.notes.filter((n) => dropIds.includes(n.id));
          const prevHabits = state.habits.filter((h) => dropIds.includes(h.id));

          // 1. OPTIMISTIC UPDATE - update space_id on all matched entities
          set((state) => ({
            todos: state.todos.map((t) =>
              dropIds.includes(t.id) ? { ...t, space_id: spaceId, updated_at: now } : t,
            ),
            notes: state.notes.map((n) =>
              dropIds.includes(n.id) ? { ...n, space_id: spaceId, updated_at: now } : n,
            ),
            habits: state.habits.map((h) =>
              dropIds.includes(h.id) ? { ...h, space_id: spaceId, updated_at: now } : h,
            ),
          }));

          // 2. SYNC TO SUPABASE - update each table in sequence
          // (Using sequential updates for better error handling)
          const errors: any[] = [];

          // Todos
          const todoIds = prevTodos.map((t) => t.id);
          if (todoIds.length > 0) {
            const { error } = await supabase
              .from('todos')
              .update({ space_id: spaceId, updated_at: now })
              .in('id', todoIds);
            if (error) errors.push(error);
          }

          // Notes
          const noteIds = prevNotes.map((n) => n.id);
          if (noteIds.length > 0) {
            const { error } = await supabase
              .from('notes')
              .update({ space_id: spaceId, updated_at: now })
              .in('id', noteIds);
            if (error) errors.push(error);
          }

          // Habits
          const habitIds = prevHabits.map((h) => h.id);
          if (habitIds.length > 0) {
            const { error } = await supabase
              .from('habits')
              .update({ space_id: spaceId, updated_at: now })
              .in('id', habitIds);
            if (error) errors.push(error);
          }

          if (errors.length > 0) {
            console.error('[GremlyStore] assignDropsToSpace failed:', errors);
            // 3. ROLLBACK ON ERROR
            set((state) => ({
              todos: state.todos.map((t) => prevTodos.find((pt) => pt.id === t.id) || t),
              notes: state.notes.map((n) => prevNotes.find((pn) => pn.id === n.id) || n),
              habits: state.habits.map((h) => prevHabits.find((ph) => ph.id === h.id) || h),
            }));
            throw new Error('Failed to assign drops to space');
          }

          // Emit events for updated entities
          dropIds.forEach((id) => {
            eventBus.emit('ItemUpdated', { id, source: STORE_EVENT_SOURCE });
          });
        },

        // ═══════════════════════════════════════════════════════════════════
        // SPACE CHAT MUTATIONS
        // ═══════════════════════════════════════════════════════════════════

        createGeneralChat: async (title?: string) => {
          const userId = get().userId;
          if (!userId) return null;
          const now = nowTimestamp();
          const newChat: any = {
            user_id: userId,
            scope_id: null,
            chat_type: 'general',
            title: title || 'New conversation',
            pinned: false,
            created_at: now,
            updated_at: now,
          };
          const tempId = `temp-${getDateService().now().getTime()}`;
          const optimistic = { ...newChat, id: tempId } as SpaceChat;
          set((s) => ({
            generalChats: [optimistic, ...s.generalChats],
            activeGeneralChatId: tempId,
          }));
          try {
            const { created_at: _ca, ...insertPayload } = newChat;
            const { data, error } = await supabase
              .from('scope_chats')
              .insert(insertPayload)
              .select()
              .single();
            if (error) throw error;
            set((s) => ({
              generalChats: s.generalChats.map((c) => (c.id === tempId ? data : c)),
              activeGeneralChatId: data.id,
            }));
            return data;
          } catch (error) {
            set((s) => ({
              generalChats: s.generalChats.filter((c) => c.id !== tempId),
              activeGeneralChatId: null,
            }));
            console.error('[GremlyStore] createGeneralChat failed:', error);
            throw error;
          }
        },

        setActiveGeneralChat: (chatId: string | null) => {
          set({
            activeGeneralChatId: chatId,
            generalChatExtractions: [],
            generalChatDismissals: [],
            generalChatAutoTitle: null,
            generalChatRunningSummary: null,
          });
        },

        fetchGeneralChats: async () => {
          const userId = get().userId;
          if (!userId) return;
          const { data, error } = await supabase
            .from('scope_chats')
            .select('*')
            .eq('user_id', userId)
            .eq('chat_type', 'general')
            .is('archived_at', null)
            .order('updated_at', { ascending: false })
            .limit(50);
          if (!error) set({ generalChats: data ?? [] });
        },

        updateGeneralChatExtractions: async (chatId: string) => {
          const { data } = await supabase
            .from('scope_chats')
            .select(
              'extracted_items, dismissed_extractions, saved_extraction_ids, auto_title, running_summary',
            )
            .eq('id', chatId)
            .single();
          if (!data) return;
          const exclude = new Set([
            ...((data as any).dismissed_extractions || []),
            ...((data as any).saved_extraction_ids || []),
          ]);
          set({
            generalChatExtractions: ((data as any).extracted_items || []).filter(
              (e: any) => !exclude.has(e.id),
            ),
            generalChatDismissals: (data as any).dismissed_extractions || [],
            generalChatAutoTitle: (data as any).auto_title || null,
            generalChatRunningSummary: (data as any).running_summary || null,
          });
        },

        dismissExtraction: async (chatId: string, extractionId: string) => {
          set((s) => ({
            generalChatExtractions: s.generalChatExtractions.filter(
              (e: any) => e.id !== extractionId,
            ),
            generalChatDismissals: [...s.generalChatDismissals, extractionId],
          }));
          await supabase
            .from('scope_chats')
            .update({ dismissed_extractions: get().generalChatDismissals } as any)
            .eq('id', chatId);
        },

        markExtractionsSaved: async (chatId: string, extractionIds: string[]) => {
          set((s) => ({
            generalChatExtractions: s.generalChatExtractions.filter(
              (e: any) => !extractionIds.includes(e.id),
            ),
          }));
          const chat = get().generalChats.find((c) => c.id === chatId) as any;
          const merged = [...new Set([...(chat?.saved_extraction_ids || []), ...extractionIds])];
          await supabase
            .from('scope_chats')
            .update({ saved_extraction_ids: merged } as any)
            .eq('id', chatId);
        },

        createSpaceChat: async (spaceId: string, title: string) => {
          const userId = get().userId;
          if (!userId) return null;

          const now = nowTimestamp();
          const newChat: Partial<SpaceChat> = {
            scope_id: spaceId,
            user_id: userId,
            title,
            pinned: false,
            created_at: now,
            updated_at: now,
          };

          // Optimistic update with temp ID
          const tempId = `temp-${getDateService().now().getTime()}`;
          const optimisticChat = { ...newChat, id: tempId } as SpaceChat;
          set((state) => ({ spaceChats: [optimisticChat, ...state.spaceChats] }));

          try {
            const { created_at: _ca, ...insertPayload } = newChat;
            const { data, error } = await supabase
              .from('scope_chats')
              .insert(insertPayload)
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

          const now = nowTimestamp();

          // Optimistic update
          set((state) => ({
            spaceChats: state.spaceChats.map((c) =>
              c.id === chatId ? { ...c, ...patch, updated_at: now } : c,
            ),
          }));

          try {
            const { error } = await supabase
              .from('scope_chats')
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
          await get().updateSpaceChat(chatId, { archived_at: nowTimestamp() });
        },

        deleteSpaceChat: async (chatId: string) => {
          const prev = get().spaceChats.find((c) => c.id === chatId);

          // Optimistic update - remove chat and its messages
          set((state) => ({
            spaceChats: state.spaceChats.filter((c) => c.id !== chatId),
            spaceChatMessages: state.spaceChatMessages.filter((m) => m.chat_id !== chatId),
          }));

          try {
            const { error } = await supabase.from('scope_chats').delete().eq('id', chatId);
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

          const tempId = `temp-${getDateService().now().getTime()}`;
          const now = nowTimestamp();
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
              .from('scope_chat_messages')
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
              .from('scope_chat_messages')
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

          const now = nowTimestamp();
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

          const tempId = `temp-${getDateService().now().getTime()}`;
          set((state) => ({
            milestones: [...state.milestones, { ...newMilestone, id: tempId } as Milestone],
          }));

          try {
            const { created_at: _ca, ...insertPayload } = newMilestone;
            const { data: result, error } = await supabase
              .from('space_milestones')
              .insert(insertPayload)
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

          const now = nowTimestamp();

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
            const { error } = await supabase
              .from('space_milestones')
              .delete()
              .eq('id', milestoneId);
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
              const uniqueId = `${getDateService().now().getTime()}-${Math.random().toString(36).substring(7)}`;
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
              const { data: urlData } = supabase.storage
                .from('log-photos')
                .getPublicUrl(storagePath);

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
          const { error } = await supabase
            .from('log_photos')
            .update({ position })
            .eq('id', photoId);

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

        resetDailyAssignments: () => {
          const todosToReset = get().todos.filter(
            (t) => t.daily_block != null || t.scheduled_start_iso != null,
          );
          const habitsToReset = get().habits.filter(
            (h) => h.daily_block != null || h.scheduled_start_iso != null,
          );

          if (todosToReset.length === 0 && habitsToReset.length === 0) return;

          console.log('[Store] resetDailyAssignments', {
            todos: todosToReset.length,
            habits: habitsToReset.length,
          });

          // Batch update Zustand state
          set((state) => ({
            todos: state.todos.map((t) =>
              t.daily_block != null || t.scheduled_start_iso != null
                ? { ...t, daily_block: null, scheduled_start_iso: null }
                : t,
            ),
            habits: state.habits.map((h) =>
              h.daily_block != null || h.scheduled_start_iso != null
                ? { ...h, daily_block: null, scheduled_start_iso: null }
                : h,
            ),
          }));

          // Persist to Supabase (non-blocking)
          for (const t of todosToReset) {
            get().updateTodo(t.id, { daily_block: null, scheduled_start_iso: null });
          }
          for (const h of habitsToReset) {
            get().updateHabit(h.id, { daily_block: null, scheduled_start_iso: null });
          }
        },

        handleDayRollover: (newDate: string) => {
          const prev = get().currentDate;
          if (newDate === prev) return; // No-op if already current

          console.log(`[Store] Day rollover: ${prev} → ${newDate}`);

          // Capture previous day's fed state before resetting
          const wasFedPreviousDay = get().isFedToday;

          set({
            currentDate: newDate,
            // Reset brief state
            briefCompletedToday: null,
            briefSelectedIds: [],
            briefLockedIds: [],
            briefSelectionDate: null,
            parkedForDay: [],
            // Reset daily counters
            todayDropsCount: 0,
            todaySweepsCount: 0,
            todayRitualCompletedAt: null,
            // Reset hidden-today (Not Today feature)
            hiddenTodayIds: [],
            hiddenTodayDate: null,
            // Feeding gauge daily reset (Soul Document v8)
            feedingGaugeValue: 0,
            isFedToday: false,
            feedingContributions: [],
            feedingGaugeLastUpdatedAt: null,
            todayFedCelebrationShownAt: null,
            todayFeedingAgeUpShownAt: null,
          });

          // Unfed streak tracking (Soul Document v8)
          if (!wasFedPreviousDay) {
            const currentStreak = get().unfedStreakDays + 1;
            set({ unfedStreakDays: currentStreak });

            const { userId } = get();
            if (userId) {
              supabase
                .from('cortex_preferences')
                .update({ unfed_streak_days: currentStreak, updated_at: nowTimestamp() })
                .eq('owner_id', userId)
                .then(({ error }) => {
                  if (error) {
                    console.error('[GremlyStore] Failed to update unfed streak:', error);
                  }
                });
            }

            if (__DEV__) {
              console.log('[GremlyStore] Unfed streak incremented to', currentStreak);
            }
          } else {
            if (__DEV__) {
              console.log(
                '[GremlyStore] Previous day was fed, unfed streak stays at',
                get().unfedStreakDays,
              );
            }
          }

          // Re-fetch remote data for the new day
          const state = get();
          if (state.userId) {
            state.refreshFromServer();
            // Refresh calendar for new date range
            state.fetchCalendarEventsForRange(newDate, getDateService().addDays(newDate, 7));
          }

          // Emit event so other systems can react (e.g. useDailyAppOpen can reset)
          eventBus.emit('day:rollover', { date: newDate });
        },

        applyOrganizeAssignments: (assignments) => {
          const boundaries = getTimeBlockBoundaries(get().timeBlockPreferences);
          const today = getDateService().today();
          const [year, month, day] = today.split('-').map(Number);
          const now = getDateService().now();
          const fiveMinAgo = new Date(getDateService().now().getTime() - 5 * 60 * 1000);

          // === PHASE 1: Validate all scheduledStartIso values ===
          const validatedAssignments = assignments.map((a) => {
            if (!a.scheduledStartIso) return { ...a, scheduledStartIso: null as string | null };
            const startTime = new Date(a.scheduledStartIso);
            if (isNaN(startTime.getTime()))
              return { ...a, scheduledStartIso: null as string | null };
            if (startTime < fiveMinAgo) return { ...a, scheduledStartIso: null as string | null };
            const bound = boundaries[a.block];
            if (bound) {
              const hour = startTime.getHours();
              if (hour < bound.startHour || hour >= bound.endHour) {
                return { ...a, scheduledStartIso: null as string | null };
              }
            }
            return a;
          });

          // === PHASE 2: Build occupied ranges (calendar + non-reassigned tasks) ===
          const assignedTaskIds = new Set(validatedAssignments.map((a) => a.taskId));
          const occupiedRanges: Record<string, Array<{ start: number; end: number }>> = {
            morning: [],
            day: [],
            evening: [],
          };

          // Calendar events
          const calendarEvents = get().calendarEvents[today] || [];
          for (const event of calendarEvents) {
            if (event.isAllDay) continue;
            const eStart = new Date(event.startAt);
            const eEnd = new Date(event.endAt);
            const startMin = eStart.getHours() * 60 + eStart.getMinutes();
            const endMin = eEnd.getHours() * 60 + eEnd.getMinutes();
            for (const [block, bound] of Object.entries(boundaries)) {
              const bStart = bound.startHour * 60;
              const bEnd = bound.endHour * 60;
              if (startMin < bEnd && endMin > bStart) {
                occupiedRanges[block].push({
                  start: Math.max(startMin, bStart),
                  end: Math.min(endMin, bEnd),
                });
              }
            }
          }

          // Existing slotted tasks NOT being reassigned
          for (const item of [...get().todos, ...get().habits]) {
            if (assignedTaskIds.has(item.id)) continue;
            if (!item.scheduled_start_iso) continue;
            const s = new Date(item.scheduled_start_iso);
            const sMin = s.getHours() * 60 + s.getMinutes();
            const duration = item.time_estimate_minutes || 15;
            for (const [block, bound] of Object.entries(boundaries)) {
              if (sMin >= bound.startHour * 60 && sMin < bound.endHour * 60) {
                occupiedRanges[block].push({ start: sMin, end: sMin + duration });
              }
            }
          }

          // Sort ranges
          for (const block of Object.keys(occupiedRanges)) {
            occupiedRanges[block].sort((a, b) => a.start - b.start);
          }

          // === PHASE 3: Resolve times for ALL assignments ===
          const finalAssignments: Record<
            string,
            { block: string; scheduledStartIso: string | null }
          > = {};
          const allTodos = get().todos;
          const allHabits = get().habits;

          for (const assignment of validatedAssignments) {
            const taskId = assignment.taskId;
            let finalBlock: string = assignment.block;
            let finalIso: string | null = assignment.scheduledStartIso || null;

            if (finalIso) {
              // AI provided valid time — use it, register in occupied
              const s = new Date(finalIso);
              const sMin = s.getHours() * 60 + s.getMinutes();
              const todo = allTodos.find((t) => t.id === taskId);
              const habit = allHabits.find((h) => h.id === taskId);
              const duration = todo?.time_estimate_minutes || habit?.time_estimate_minutes || 15;
              occupiedRanges[finalBlock].push({ start: sMin, end: sMin + duration });
              occupiedRanges[finalBlock].sort((a, b) => a.start - b.start);
            } else {
              // Need fallback slotting
              const todo = allTodos.find((t) => t.id === taskId);
              const habit = allHabits.find((h) => h.id === taskId);
              const taskDuration =
                todo?.time_estimate_minutes || habit?.time_estimate_minutes || 15;

              // Try assigned block first, then others
              const blockOrder = [
                finalBlock,
                ...['day', 'evening', 'morning'].filter((b) => b !== finalBlock),
              ];

              for (const tryBlock of blockOrder) {
                const bound = boundaries[tryBlock as keyof typeof boundaries];
                if (!bound) continue;

                const bStartMin = Math.max(
                  bound.startHour * 60,
                  now.getHours() * 60 + now.getMinutes(),
                );
                const bEndMin = bound.endHour * 60;
                if (bStartMin >= bEndMin) continue;

                const ranges = occupiedRanges[tryBlock];
                let cursor = bStartMin;
                let found = false;

                for (const range of ranges) {
                  if (range.start - cursor >= taskDuration) {
                    const h = Math.floor(cursor / 60);
                    const m = cursor % 60;
                    finalIso = new Date(year, month - 1, day, h, m).toISOString();
                    finalBlock = tryBlock;
                    ranges.push({ start: cursor, end: cursor + taskDuration });
                    ranges.sort((a, b) => a.start - b.start);
                    found = true;
                    break;
                  }
                  cursor = Math.max(cursor, range.end);
                }

                if (!found && bEndMin - cursor >= taskDuration) {
                  const h = Math.floor(cursor / 60);
                  const m = cursor % 60;
                  finalIso = new Date(year, month - 1, day, h, m).toISOString();
                  finalBlock = tryBlock;
                  ranges.push({ start: cursor, end: cursor + taskDuration });
                  ranges.sort((a, b) => a.start - b.start);
                  found = true;
                }

                if (found) break;
              }

              if (!finalIso) {
                console.warn('[Organize] No slot found in any block for:', taskId);
              }
            }

            finalAssignments[taskId] = { block: finalBlock, scheduledStartIso: finalIso };
          }

          // === PHASE 4: ONE set() call with everything resolved ===
          set((state) => ({
            todos: state.todos.map((todo) => {
              const fa = finalAssignments[todo.id];
              if (!fa) return todo;
              return {
                ...todo,
                daily_block: fa.block as Todo['daily_block'],
                scheduled_start_iso: fa.scheduledStartIso,
              };
            }),
            habits: state.habits.map((habit) => {
              const fa = finalAssignments[habit.id];
              if (!fa) return habit;
              return {
                ...habit,
                daily_block: fa.block as Habit['daily_block'],
                scheduled_start_iso: fa.scheduledStartIso,
              };
            }),
          }));

          // === PHASE 5: Persist to Supabase (non-blocking, no UI impact) ===
          const { todos: finalTodos, habits: finalHabits } = get();
          for (const [taskId, fa] of Object.entries(finalAssignments)) {
            const payload: Record<string, any> = { daily_block: fa.block };
            if (fa.scheduledStartIso) {
              payload.scheduled_start_iso = fa.scheduledStartIso;
            }
            const matchedTodo = finalTodos.find((t) => t.id === taskId);
            if (matchedTodo) {
              get().updateTodo(taskId, payload);
              continue;
            }
            const matchedHabit = finalHabits.find((h) => h.id === taskId);
            if (matchedHabit) {
              get().updateHabit(taskId, payload);
            }
          }
        },

        slotUnpositionedTasks: () => {
          const today = getDateService().today();
          const [year, month, day] = today.split('-').map(Number);
          const now = getDateService().now();
          const boundaries = getTimeBlockBoundaries(get().timeBlockPreferences);

          // Build occupied ranges from calendar + all currently slotted tasks
          const occupiedRanges: Record<string, Array<{ start: number; end: number }>> = {
            morning: [],
            day: [],
            evening: [],
          };

          const calendarEvents = get().calendarEvents[today] || [];
          for (const event of calendarEvents) {
            if (event.isAllDay) continue;
            const eStart = new Date(event.startAt);
            const eEnd = new Date(event.endAt);
            const startMin = eStart.getHours() * 60 + eStart.getMinutes();
            const endMin = eEnd.getHours() * 60 + eEnd.getMinutes();
            for (const [block, bound] of Object.entries(boundaries)) {
              const bStart = bound.startHour * 60;
              const bEnd = bound.endHour * 60;
              if (startMin < bEnd && endMin > bStart) {
                occupiedRanges[block].push({
                  start: Math.max(startMin, bStart),
                  end: Math.min(endMin, bEnd),
                });
              }
            }
          }

          // All currently slotted tasks
          for (const item of [...get().todos, ...get().habits]) {
            if (!item.scheduled_start_iso) continue;
            const s = new Date(item.scheduled_start_iso);
            const sMin = s.getHours() * 60 + s.getMinutes();
            const duration = item.time_estimate_minutes || 15;
            for (const [block, bound] of Object.entries(boundaries)) {
              if (sMin >= bound.startHour * 60 && sMin < bound.endHour * 60) {
                occupiedRanges[block].push({ start: sMin, end: sMin + duration });
              }
            }
          }

          for (const block of Object.keys(occupiedRanges)) {
            occupiedRanges[block].sort((a, b) => a.start - b.start);
          }

          // Find unpositioned tasks: has time_window but no scheduled_start_iso
          const unpositioned: Array<{
            id: string;
            type: 'todo' | 'habit';
            block: string;
            duration: number;
          }> = [];

          for (const todo of get().todos) {
            if (todo.archived || todo.completed_at) continue;
            if (todo.due_day !== today) continue;
            const eb = todo.daily_block ?? todo.time_window;
            if (eb && eb !== 'any' && !todo.scheduled_start_iso) {
              unpositioned.push({
                id: todo.id,
                type: 'todo',
                block: eb,
                duration: todo.time_estimate_minutes || 15,
              });
            }
          }

          for (const habit of get().habits) {
            if (habit.archived) continue;
            const eb = habit.daily_block ?? habit.time_window;
            if (eb && eb !== 'any' && !habit.scheduled_start_iso) {
              unpositioned.push({
                id: habit.id,
                type: 'habit',
                block: eb,
                duration: habit.time_estimate_minutes || 15,
              });
            }
          }

          if (unpositioned.length === 0) return;

          console.log('[SlotUnpositioned] Found', unpositioned.length, 'tasks needing slots');

          // Slot each one using same logic as organize fallback
          const updates: Record<string, { block: string; scheduledStartIso: string | null }> = {};

          for (const task of unpositioned) {
            const blockOrder = [
              task.block,
              ...['day', 'evening', 'morning'].filter((b) => b !== task.block),
            ];

            let finalIso: string | null = null;
            let finalBlock = task.block;

            for (const tryBlock of blockOrder) {
              const bound = boundaries[tryBlock as keyof typeof boundaries];
              if (!bound) continue;

              const bStartMin = Math.max(
                bound.startHour * 60,
                now.getHours() * 60 + now.getMinutes(),
              );
              const bEndMin = bound.endHour * 60;
              if (bStartMin >= bEndMin) continue;

              const ranges = occupiedRanges[tryBlock];
              let cursor = bStartMin;
              let found = false;

              for (const range of ranges) {
                if (range.start - cursor >= task.duration) {
                  const h = Math.floor(cursor / 60);
                  const m = cursor % 60;
                  finalIso = new Date(year, month - 1, day, h, m).toISOString();
                  finalBlock = tryBlock;
                  ranges.push({ start: cursor, end: cursor + task.duration });
                  ranges.sort((a, b) => a.start - b.start);
                  found = true;
                  break;
                }
                cursor = Math.max(cursor, range.end);
              }

              if (!found && bEndMin - cursor >= task.duration) {
                const h = Math.floor(cursor / 60);
                const m = cursor % 60;
                finalIso = new Date(year, month - 1, day, h, m).toISOString();
                finalBlock = tryBlock;
                ranges.push({ start: cursor, end: cursor + task.duration });
                ranges.sort((a, b) => a.start - b.start);
                found = true;
              }

              if (found) break;
            }

            if (finalIso) {
              updates[task.id] = { block: finalBlock, scheduledStartIso: finalIso };
              console.log('[SlotUnpositioned] Slotted', task.id, 'at', finalIso, 'in', finalBlock);
            } else {
              console.warn('[SlotUnpositioned] No slot found for', task.id);
            }
          }

          if (Object.keys(updates).length === 0) return;

          // Single set() call
          set((state) => ({
            todos: state.todos.map((t) => {
              const u = updates[t.id];
              if (!u) return t;
              return {
                ...t,
                daily_block: u.block as Todo['daily_block'],
                scheduled_start_iso: u.scheduledStartIso,
              };
            }),
            habits: state.habits.map((h) => {
              const u = updates[h.id];
              if (!u) return h;
              return {
                ...h,
                daily_block: u.block as Habit['daily_block'],
                scheduled_start_iso: u.scheduledStartIso,
              };
            }),
          }));

          // Persist
          for (const [id, u] of Object.entries(updates)) {
            const payload = {
              daily_block: u.block as Todo['daily_block'],
              scheduled_start_iso: u.scheduledStartIso,
            };
            const todo = get().todos.find((t) => t.id === id);
            if (todo) {
              get().updateTodo(id, payload);
              continue;
            }
            get().updateHabit(id, payload as Partial<Habit>);
          }
        },

        // ═══════════════════════════════════════════════════════════════════
        // BULK/UTILITY
        // ═══════════════════════════════════════════════════════════════════

        refreshFromServer: async () => {
          const userId = get().userId;
          if (!userId) return;

          // Kick off Worlds graph refresh in parallel with the main sync.
          // Isolated failure — main sync path is unaffected if the Worlds fetch fails.
          // This covers both initialize fast-paths which delegate to refreshFromServer
          // for returning users with persisted data (Worlds arrays are not in partialize).
          const worldsGraphPromise = get()
            .refreshWorldsGraph()
            .catch((err) => {
              console.warn('[GremlyStore] refreshFromServer — refreshWorldsGraph failed:', err);
            });

          // Background sync — never set isLoading since user already has cached data.
          // Loading indicators should only show during cold init (no cached data).

          try {
            const eventWindowStart = getDateService().now();
            eventWindowStart.setDate(eventWindowStart.getDate() - 30);
            const eventWindowEnd = getDateService().now();
            eventWindowEnd.setDate(eventWindowEnd.getDate() + 90);
            const eventWindowStartIso = eventWindowStart.toISOString();
            const eventWindowEndIso = eventWindowEnd.toISOString();

            const [
              todosRows,
              habitsRows,
              notesRows,
              calendarEventRows,
              spacesRes,
              tagsRes,
              progressRes,
              chatsRes,
              milestonesRes,
              weeklySummariesRes,
              cortexPrefsRes,
            ] = await Promise.all([
              fetchAllPaginated<Todo>(() =>
                supabase
                  .from('todos')
                  .select('*')
                  .eq('owner_id', userId)
                  .order('created_at', { ascending: false }),
              ),
              fetchAllPaginated<Habit>(() =>
                supabase
                  .from('habits')
                  .select('*')
                  .eq('owner_id', userId)
                  .order('created_at', { ascending: false }),
              ),
              fetchAllPaginated<Note>(() =>
                supabase
                  .from('notes')
                  .select('*')
                  .eq('owner_id', userId)
                  .or(
                    `subtype.neq.event,` +
                      `external_source.is.null,` +
                      `and(target_date.gte.${eventWindowStartIso},target_date.lte.${eventWindowEndIso})`,
                  )
                  .order('created_at', { ascending: false }),
              ),
              fetchAllPaginated<DbSyncedCalendarEvent>(() =>
                supabase
                  .from('synced_calendar_events' as any)
                  .select('*')
                  .eq('owner_id', userId)
                  .eq('archived', false)
                  .order('start_at', { ascending: true }),
              ),
              supabase.from('spaces').select('*').eq('owner_id', userId),
              supabase.from('tags').select('*').eq('owner_id', userId),
              supabase.from('habit_progress').select('*').eq('owner_id', userId),
              supabase.from('scope_chats').select('*').eq('user_id', userId),
              supabase.from('space_milestones').select('*').eq('owner_id', userId),
              supabase
                .from('weekly_summaries')
                .select('*')
                .eq('user_id', userId)
                .order('week_start_date', { ascending: false })
                .limit(12),
              supabase
                .from('cortex_preferences')
                .select(
                  'gremly_age, gremly_age_last_incremented_at, fed_days_count, current_tier, unfed_streak_days, last_fed_at, sock_count, ai_mode, graduated_at, last_sweep_completed_at, sweep_streak, mini_sweep_last_completed_at, day_boundary_hour, training_drop_step, has_seen_gauge_explanation, has_seen_first_fed_modal, has_seen_sweep_unlock_modal, has_seen_entity_chat_highlight, has_seen_training_meter_auto_open, has_seen_readonly_intro, gremly_color, is_tester, trial_started_at, challenge_started_at, challenge_completed_at, onboarding_completed_at, first_drop_completed_at, first_today_visit_completed_at, demo_sweep_completed_at, created_at',
                )
                .eq('owner_id', userId)
                .maybeSingle(),
            ]);

            // Check cortex_preferences error — skip prefs reconciliation but continue entity updates
            let skipCortexPrefs = false;
            if (cortexPrefsRes.error) {
              console.error(
                '[GremlyStore] refreshFromServer — cortex_preferences fetch failed, skipping prefs reconciliation:',
                cortexPrefsRes.error,
              );
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const Sentry = require('@sentry/react-native');
                Sentry.captureException(
                  new Error('refreshFromServer cortex_preferences fetch failed'),
                  {
                    extra: { error: JSON.stringify(cortexPrefsRes.error) },
                  },
                );
              } catch {
                /* Sentry not available */
              }
              skipCortexPrefs = true;
            }

            const hydratedCalendarEvents = buildCalendarEventsByDateFromDbRows(calendarEventRows);

            set({
              // Add type field since DB doesn't store it
              todos: todosRows.map((t) => ({
                ...t,
                type: 'todo' as const,
                reminders: (t as any).reminders_json ?? [],
              })),
              habits: habitsRows.map((h) => ({
                ...h,
                type: 'habit' as const,
                reminders: (h as any).reminders_json ?? [],
              })),
              notes: notesRows.map((n) => ({
                ...n,
                type: 'note' as const,
                reminders: (n as any).reminders_json ?? [],
              })),
              calendarEvents: hydratedCalendarEvents,
              calendarLastFetched:
                calendarEventRows.length > 0 ? nowTimestamp() : get().calendarLastFetched,
              spaces: spacesRes.data ?? [],
              tags: tagsRes.data ?? [],
              habitProgress: progressRes.data ?? [],
              spaceChats: chatsRes.data ?? [],
              milestones: milestonesRes.data ?? [],
              weeklySummaries: (weeklySummariesRes.data ?? []) as WeeklySummary[],
              lastSyncedAt: getDateService().now(),
            });

            console.log('[GremlyStore] ✅ Refreshed from server');

            // Reconcile cortex_preferences (gremly age, fed days, tier, etc.)
            // These aren't fetched by refreshRitualProgress, so they need
            // explicit reconciliation from the server.
            if (!skipCortexPrefs && cortexPrefsRes.data) {
              const cp = cortexPrefsRes.data as Record<string, unknown>;
              set({
                gremlyAge: (cp.gremly_age as number) ?? get().gremlyAge,
                gremlyAgeLastIncrementedAt:
                  (cp.gremly_age_last_incremented_at as string) ?? get().gremlyAgeLastIncrementedAt,
                fedDaysCount: (cp.fed_days_count as number) ?? get().fedDaysCount,
                currentTierName: (cp.current_tier as string) ?? get().currentTierName,
                unfedStreakDays: (cp.unfed_streak_days as number) ?? get().unfedStreakDays,
                lastFedAt: (cp.last_fed_at as string) ?? get().lastFedAt,
                sockCount: (cp.sock_count as number) ?? get().sockCount,
                aiMode: ((cp.ai_mode as string) ?? get().aiMode) as any,
                graduatedAt: (cp.graduated_at as string) ?? get().graduatedAt,
                lastSweepCompletedAt:
                  (cp.last_sweep_completed_at as string) ?? get().lastSweepCompletedAt,
                sweepStreak: (cp.sweep_streak as number) ?? get().sweepStreak,
                miniSweepLastCompletedAt:
                  (cp.mini_sweep_last_completed_at as string) ?? get().miniSweepLastCompletedAt,
                dayBoundaryHour: (cp.day_boundary_hour as number) ?? get().dayBoundaryHour,
                trainingDropStep: (cp.training_drop_step as number) ?? get().trainingDropStep,
                hasSeenGaugeExplanation:
                  (cp.has_seen_gauge_explanation as boolean) ?? get().hasSeenGaugeExplanation,
                hasSeenFirstFedModal:
                  (cp.has_seen_first_fed_modal as boolean) ?? get().hasSeenFirstFedModal,
                hasSeenSweepUnlockModal:
                  (cp.has_seen_sweep_unlock_modal as boolean) ?? get().hasSeenSweepUnlockModal,
                hasSeenEntityChatHighlight:
                  (cp.has_seen_entity_chat_highlight as boolean) ??
                  get().hasSeenEntityChatHighlight,
                hasSeenTrainingMeterAutoOpen:
                  (cp.has_seen_training_meter_auto_open as boolean) ??
                  get().hasSeenTrainingMeterAutoOpen,
                hasSeenReadonlyIntro:
                  (cp.has_seen_readonly_intro as boolean) ?? get().hasSeenReadonlyIntro,
                gremlyColor: (cp.gremly_color as string) ?? get().gremlyColor,
                isTester: (cp.is_tester as boolean) ?? get().isTester,
                trialStartedAt: (cp.trial_started_at as string) ?? get().trialStartedAt,
                challengeStartedAt: (cp.challenge_started_at as string) ?? get().challengeStartedAt,
                challengeCompletedAt:
                  (cp.challenge_completed_at as string) ?? get().challengeCompletedAt,
                onboardingCompletedAt:
                  (cp.onboarding_completed_at as string) ?? get().onboardingCompletedAt,
                firstDropCompletedAt:
                  (cp.first_drop_completed_at as string) ?? get().firstDropCompletedAt,
                firstTodayVisitCompletedAt:
                  (cp.first_today_visit_completed_at as string) ?? get().firstTodayVisitCompletedAt,
                demoSweepCompletedAt:
                  (cp.demo_sweep_completed_at as string) ?? get().demoSweepCompletedAt,
                accountCreatedAt: (cp.created_at as string) ?? get().accountCreatedAt,
              });

              // Fetch identity from user_profiles
              const { data: userProfileData, error: userProfileRefreshError } = await supabase
                .from('user_profiles')
                .select('identity')
                .eq('user_id', userId)
                .maybeSingle();
              if (userProfileRefreshError) {
                console.error(
                  '[GremlyStore] user_profiles fetch failed (non-fatal):',
                  userProfileRefreshError,
                );
                try {
                  // eslint-disable-next-line @typescript-eslint/no-var-requires
                  const Sentry = require('@sentry/react-native');
                  Sentry.captureException(new Error('user_profiles identity fetch failed'), {
                    extra: {
                      error: JSON.stringify(userProfileRefreshError),
                      context: 'refreshFromServer',
                    },
                  });
                } catch {
                  /* Sentry not available */
                }
              }
              if (userProfileData?.identity) {
                const ident = userProfileData.identity as Record<string, unknown>;
                set({
                  userName: (ident.name as string) ?? get().userName,
                  userPronouns: (ident.pronouns as string) ?? get().userPronouns,
                });
              }

              // Update lifecycleCache so it stays in sync with Supabase
              set((state) => ({
                lifecycleCache: {
                  onboardingCompletedAt: state.onboardingCompletedAt,
                  firstDropCompletedAt: state.firstDropCompletedAt,
                  trainingDropStep: state.trainingDropStep,
                  graduatedAt: state.graduatedAt,
                  isTester: state.isTester,
                  trialStartedAt: state.trialStartedAt,
                  challengeStartedAt: state.challengeStartedAt,
                  challengeCompletedAt: state.challengeCompletedAt,
                  hasSeenReadonlyIntro: state.hasSeenReadonlyIntro,
                  cachedAt: nowTimestamp(),
                  cachedForUserId: state.userId ?? 'unknown',
                },
              }));

              if (__DEV__) {
                console.log('[GremlyStore] Cortex preferences reconciled from server', {
                  gremlyAge: cp.gremly_age,
                  fedDaysCount: cp.fed_days_count,
                  currentTier: cp.current_tier,
                });
              }
            }

            // Fetch DCO after server refresh (cached hydration path skips cold init)
            get().fetchTodayDco();

            // Refresh ritual progress including gauge state (Soul Document v8)
            get().refreshRitualProgress();

            // Ensure Worlds graph refresh has settled before returning.
            // Failures are already swallowed by the .catch() above, so this is safe to await.
            await worldsGraphPromise;
          } catch (error) {
            console.error('[GremlyStore] refreshFromServer failed:', error);
            // No isLoading to reset — background sync never sets it
          }
        },

        // ═══════════════════════════════════════════════════════════════════
        // MORNING BRIEF MUTATIONS
        // ═══════════════════════════════════════════════════════════════════

        fetchTodayBrief: async () => {
          const userId = get().userId;
          if (!userId) return;

          const todayDate = getDateService().today();

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

          const todayDate = input.date ?? getDateService().today();
          const isToday = todayDate === getDateService().today();
          const now = nowTimestamp();
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
            dismissed_habit_ids:
              input.dismissed_habit_ids ?? existingBrief?.dismissed_habit_ids ?? [],
            completed_at: input.completed_at ?? now,
            updated_at: now,
          };

          // Optimistic update
          const optimisticBrief: DailyBrief = {
            id: existingBrief?.id ?? `temp_${getDateService().now().getTime()}`,
            ...payload,
            dismissed_habit_ids: payload.dismissed_habit_ids,
            created_at: existingBrief?.created_at ?? now,
          };
          if (isToday) {
            set({ dailyBrief: optimisticBrief });
          }

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
              if (isToday) {
                set({ dailyBrief: data });
              }
              console.log('[GremlyStore] ✅ Created daily brief:', data.id);
            }

            // Emit event for other components
            eventBus.emit('DailyBriefSaved', { date: todayDate });
          } catch (error) {
            console.error('[GremlyStore] ❌ saveBrief failed:', error);
            // Rollback optimistic update
            if (isToday) {
              set({ dailyBrief: existingBrief });
            }
            throw error;
          }
        },

        clearBrief: async () => {
          const userId = get().userId;
          if (!userId) return;

          const todayDate = getDateService().today();
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

          const today = getDateService().today();
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
        // WEEKLY SUMMARY MUTATIONS
        // ═══════════════════════════════════════════════════════════════════

        fetchWeeklySummaries: async () => {
          const userId = get().userId;
          if (!userId) return;

          set({ weeklySummaryLoading: true });

          try {
            const { data, error } = await supabase
              .from('weekly_summaries')
              .select('*')
              .eq('user_id', userId)
              .order('week_start_date', { ascending: false })
              .limit(12);

            if (error) throw error;

            set({
              weeklySummaries: (data ?? []) as WeeklySummary[],
              weeklySummaryLoading: false,
            });

            console.log('[GremlyStore] ✅ Fetched weekly summaries:', data?.length ?? 0);
          } catch (error) {
            console.error('[GremlyStore] ❌ fetchWeeklySummaries failed:', error);
            set({ weeklySummaryLoading: false });
          }
        },

        saveWeeklySummary: async (
          summary: Omit<WeeklySummary, 'id' | 'created_at' | 'updated_at'>,
        ) => {
          const userId = get().userId;
          if (!userId) throw new Error('Not authenticated');

          const now = nowTimestamp();

          const momentDates =
            (summary.content as any)?.cards
              ?.filter((c: { type: string }) => c.type === 'moments')
              ?.flatMap(
                (c: { moments?: { date?: string }[] }) =>
                  c.moments?.map((m) => m.date).filter(Boolean) || [],
              ) || [];

          try {
            const { data, error } = await supabase
              .from('weekly_summaries')
              .upsert(
                {
                  ...summary,
                  user_id: userId,
                  moment_dates: momentDates,
                  created_at: now,
                  updated_at: now,
                },
                { onConflict: 'user_id,week_start_date' },
              )
              .select()
              .single();

            if (error) throw error;

            // Replace if same week exists, otherwise prepend
            const existing = get().weeklySummaries;
            const filtered = existing.filter((s) => s.week_start_date !== summary.week_start_date);
            set({ weeklySummaries: [data as WeeklySummary, ...filtered] });

            console.log('[GremlyStore] ✅ Saved weekly summary:', data.id);
            return data as WeeklySummary;
          } catch (error) {
            console.error('[GremlyStore] ❌ saveWeeklySummary failed:', error);
            throw error;
          }
        },

        markSummaryViewed: async (summaryId: string) => {
          const now = nowTimestamp();

          // Optimistic update
          set({
            weeklySummaries: get().weeklySummaries.map((s) =>
              s.id === summaryId ? { ...s, viewed: true, viewed_at: now } : s,
            ),
          });

          try {
            const { error } = await supabase
              .from('weekly_summaries')
              .update({ viewed: true, viewed_at: now, updated_at: now })
              .eq('id', summaryId);

            if (error) console.warn('[GremlyStore] markSummaryViewed sync error:', error);
          } catch (error) {
            console.warn('[GremlyStore] markSummaryViewed failed:', error);
          }
        },

        markSummaryFlowCompleted: async (summaryId: string) => {
          const now = nowTimestamp();

          // Optimistic update
          set({
            weeklySummaries: get().weeklySummaries.map((s) =>
              s.id === summaryId ? { ...s, completed_flow: true, updated_at: now } : s,
            ),
          });

          try {
            const { error } = await supabase
              .from('weekly_summaries')
              .update({ completed_flow: true, updated_at: now })
              .eq('id', summaryId);

            if (error) console.warn('[GremlyStore] markSummaryFlowCompleted sync error:', error);
          } catch (error) {
            console.warn('[GremlyStore] markSummaryFlowCompleted failed:', error);
          }
        },

        dismissSummaryBanner: async (summaryId: string) => {
          const now = nowTimestamp();

          // Optimistic update
          set({
            weeklySummaries: get().weeklySummaries.map((s) =>
              s.id === summaryId ? { ...s, banner_dismissed: true, updated_at: now } : s,
            ),
          });

          try {
            const { error } = await supabase
              .from('weekly_summaries')
              .update({ banner_dismissed: true, updated_at: now })
              .eq('id', summaryId);

            if (error) console.warn('[GremlyStore] dismissSummaryBanner sync error:', error);
          } catch (error) {
            console.warn('[GremlyStore] dismissSummaryBanner failed:', error);
          }
        },

        addCleanupAction: async (summaryId: string, action: WeeklySummaryCleanupAction) => {
          const summary = get().weeklySummaries.find((s) => s.id === summaryId);
          if (!summary) return;

          const updatedActions = [...summary.cleanup_actions, action];
          const now = nowTimestamp();

          // Optimistic update
          set({
            weeklySummaries: get().weeklySummaries.map((s) =>
              s.id === summaryId ? { ...s, cleanup_actions: updatedActions, updated_at: now } : s,
            ),
          });

          try {
            const { error } = await supabase
              .from('weekly_summaries')
              .update({ cleanup_actions: updatedActions, updated_at: now })
              .eq('id', summaryId);

            if (error) console.warn('[GremlyStore] addCleanupAction sync error:', error);
          } catch (error) {
            console.warn('[GremlyStore] addCleanupAction failed:', error);
          }
        },

        bulkCleanupActions: async (summaryId: string, actions: WeeklySummaryCleanupAction[]) => {
          const summary = get().weeklySummaries.find((s) => s.id === summaryId);
          if (!summary) return;

          const updatedActions = [...summary.cleanup_actions, ...actions];
          const now = nowTimestamp();

          // Optimistic update
          set({
            weeklySummaries: get().weeklySummaries.map((s) =>
              s.id === summaryId ? { ...s, cleanup_actions: updatedActions, updated_at: now } : s,
            ),
          });

          try {
            const { error } = await supabase
              .from('weekly_summaries')
              .update({ cleanup_actions: updatedActions, updated_at: now })
              .eq('id', summaryId);

            if (error) console.warn('[GremlyStore] bulkCleanupActions sync error:', error);
          } catch (error) {
            console.warn('[GremlyStore] bulkCleanupActions failed:', error);
          }
        },

        // ═══════════════════════════════════════════════════════════════════
        // DCO ACTIONS
        // ═══════════════════════════════════════════════════════════════════

        fetchTodayDco: async () => {
          console.log(
            '[GremlyStore] fetchTodayDco called, userId:',
            get().userId?.slice(0, 8) || 'NULL',
          );
          const userId = get().userId;
          if (!userId) return;

          set({ dcoLoading: true });
          try {
            const today = getDateService().today(); // YYYY-MM-DD
            const { data, error } = await supabase
              .from('user_daily_state')
              .select('dco')
              .eq('user_id', userId)
              .eq('date', today)
              .maybeSingle();

            if (error) {
              console.warn('[GremlyStore] DCO fetch error:', error);
              set({ dcoLoading: false });
              return;
            }

            if (data?.dco) {
              console.log('[GremlyStore] ✅ DCO loaded:', {
                tone: data.dco.tone,
                life_moment: data.dco.life_moment,
                has_headline: !!data.dco.brief_headline,
              });
              set({ dco: data.dco as DailyContextObject, dcoLoading: false });
            } else {
              console.log('[GremlyStore] No DCO for today');
              set({ dco: null, dcoLoading: false });
            }
          } catch (err) {
            console.error('[GremlyStore] DCO fetch failed:', err);
            set({ dcoLoading: false });
          }
        },

        patchDcoTodayFocus: async (priorities: string[]) => {
          const userId = get().userId;
          const dco = get().dco;
          if (!userId || !dco) return;

          try {
            const today = getDateService().today();
            const updatedDco = { ...dco, today_focus: priorities };

            const { error } = await supabase
              .from('user_daily_state')
              .update({
                dco: updatedDco,
                updated_at: nowTimestamp(),
              })
              .eq('user_id', userId)
              .eq('date', today);

            if (error) {
              console.warn('[GremlyStore] DCO today_focus patch failed:', error);
              return;
            }

            set({ dco: updatedDco });
            console.log('[GremlyStore] ✅ DCO today_focus patched:', priorities);
          } catch (err) {
            console.error('[GremlyStore] DCO patch failed:', err);
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

          const startedAt = nowTimestamp();
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
            const today = ds.today(); // YYYY-MM-DD
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
            const today = ds.today();
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

          const archivedAt = nowTimestamp();
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
          // ── Single-flight: if a fetch is in progress, await it instead of duplicating ──
          if (calendarFetchInFlight) {
            console.log('[GremlyStore] Calendar fetch already in flight, awaiting existing');
            try {
              await calendarFetchInFlight;
            } catch {
              // Original caller handles its own errors
            }
            return;
          }

          const fetchPromise = (async () => {
            console.log('[GremlyStore] fetchCalendarEventsForRange:', startDate, 'to', endDate);
            set({ calendarLoading: true });

            try {
              const events = await calendarClient.getEvents(startDate, endDate);
              console.log(
                '[GremlyStore] calendarClient.getEvents returned:',
                events.length,
                'events',
              );

              // ── Build date-keyed map with proper dedup ──
              const eventsByDate: Record<string, CalendarEvent[]> = {};
              const dateService = getDateService();

              // Keep events outside the fetched range from previous state
              const prev = get().calendarEvents;
              for (const [dateKey, dateEvents] of Object.entries(prev)) {
                if (dateKey < startDate || dateKey > endDate) {
                  eventsByDate[dateKey] = dateEvents;
                }
              }

              // Global dedup by providerEventId — prevents the same event
              // from being added multiple times across date slots
              const seenProviderIds = new Set<string>();

              for (const event of events) {
                // Skip if we've already processed this provider event
                if (seenProviderIds.has(event.providerEventId)) continue;
                seenProviderIds.add(event.providerEventId);

                if (event.isAllDay) {
                  // All-day events: span across dates using string math
                  // (avoids DST issues from Date object mutation)
                  const startStr = event.startAt.split('T')[0]; // "YYYY-MM-DD"
                  const endStr = event.endAt.split('T')[0]; // "YYYY-MM-DD" (exclusive)

                  // Add the event to every date from start to end (exclusive)
                  let cursor = startStr;
                  while (cursor < endStr) {
                    const existing = eventsByDate[cursor] || [];
                    eventsByDate[cursor] = [...existing, event];
                    cursor = dateService.addDays(cursor, 1);
                  }
                } else {
                  // Timed events: use DateService for consistent local date extraction
                  const dateKey = dateService.extractLocalDate(event.startAt);
                  if (!dateKey) {
                    console.warn(
                      '[GremlyStore] Could not extract date from event:',
                      event.title,
                      event.startAt,
                    );
                    continue;
                  }

                  console.log(
                    '[GremlyStore] Event:',
                    event.title,
                    'startAt:',
                    event.startAt,
                    '-> dateKey:',
                    dateKey,
                  );

                  const existing = eventsByDate[dateKey] || [];
                  eventsByDate[dateKey] = [...existing, event];
                }
              }

              console.log('[GremlyStore] eventsByDate keys:', Object.keys(eventsByDate));

              // ── Atomic state update ──
              set({
                calendarEvents: eventsByDate,
                calendarLoading: false,
                calendarLastFetched: nowTimestamp(),
              });

              // Auto-normalize external events into Note entities
              try {
                const syncResult = await get().syncCalendarEventsToNotes();
                console.log('[GremlyStore] Calendar sync result:', syncResult);
              } catch (syncError) {
                console.error('[GremlyStore] Calendar sync-to-notes failed:', syncError);
              }
            } catch (error) {
              console.error('[GremlyStore] fetchCalendarEventsForRange failed:', error);
              set({ calendarLoading: false });
            }
          })();

          // Register the in-flight promise so concurrent calls coalesce
          calendarFetchInFlight = fetchPromise;
          try {
            await fetchPromise;
          } finally {
            calendarFetchInFlight = null;
          }
        },

        syncCalendarEventsToNotes: async () => {
          const { calendarEvents, userId } = get();
          const zero = { created: 0, updated: 0, softDeleted: 0, unchanged: 0 };
          if (!userId) return zero;

          try {
            /**
             * Sync contract (PR 1):
             *
             * 1. UNIQUE constraint (owner_id, external_id, provider)
             *    prevents DB-level duplicates.
             * 2. Flatten step dedupes in-memory by `${provider}:${externalId}`
             *    before writing.
             * 3. Upsert (not insert) makes the sync idempotent — re-running
             *    produces no changes if provider data is unchanged.
             * 4. Archive-on-age-out keeps the table bounded.
             * 5. Hydration reads archived=false only, so archived events
             *    don't pollute the cache.
             */

            // 1. Flatten calendarEvents (cache) into a deduped list by composite key.
            const seen = new Set<string>();
            const flatEvents: CalendarEvent[] = [];
            for (const dayEvents of Object.values(calendarEvents)) {
              for (const event of dayEvents) {
                const dedupKey = `${event.provider}:${event.providerEventId}`;
                if (!seen.has(dedupKey)) {
                  seen.add(dedupKey);
                  flatEvents.push(event);
                }
              }
            }

            if (flatEvents.length === 0) return zero;

            // 2. Transform to DbSyncedCalendarEvent payload shape.
            const nowIso = nowTimestamp();
            const payloads = flatEvents.map((event) => ({
              owner_id: userId,
              external_id: event.providerEventId,
              provider: event.provider,
              calendar_id: (event as any).calendarId ?? null,
              etag: (event as any).etag ?? null,
              title: event.title ?? null,
              description: (event as any).description ?? null,
              location: event.location ?? null,
              start_at: event.startAt ?? null,
              end_at: event.endAt ?? null,
              is_all_day: event.isAllDay ?? false,
              last_synced_at: nowIso,
              raw: event as unknown as Record<string, unknown>,
              updated_at: nowIso,
            }));

            // 3. Upsert in batches of 500.
            const BATCH_SIZE = 500;
            let upserted = 0;
            for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
              const batch = payloads.slice(i, i + BATCH_SIZE);
              const { error } = await supabase.from('synced_calendar_events' as any).upsert(batch, {
                onConflict: 'owner_id,external_id,provider',
                ignoreDuplicates: false,
              });

              if (error) {
                console.error(
                  '[GremlyStore] synced_calendar_events upsert batch error:',
                  error,
                  'batch',
                  i / BATCH_SIZE,
                );
                // Continue with next batch rather than aborting sync.
                continue;
              }

              upserted += batch.length;
            }

            console.log(
              '[GremlyStore] Calendar sync upserted',
              upserted,
              'events to synced_calendar_events table',
            );

            // 4. Archive old events (end_at older than 30 days).
            const archiveCutoff = getDateService().now();
            archiveCutoff.setDate(archiveCutoff.getDate() - 30);
            const archiveCutoffIso = archiveCutoff.toISOString();

            const { error: archiveError, count: archiveCount } = await supabase
              .from('synced_calendar_events' as any)
              .update({ archived: true, archived_at: nowIso }, { count: 'exact' })
              .eq('owner_id', userId)
              .eq('archived', false)
              .not('end_at', 'is', null)
              .lt('end_at', archiveCutoffIso);

            if (archiveError) {
              console.error('[GremlyStore] synced_calendar_events archive error:', archiveError);
            } else if (archiveCount) {
              console.log(
                '[GremlyStore] Archived',
                archiveCount,
                'old calendar events (end_at < 30d ago)',
              );
            }

            return {
              created: 0,
              updated: upserted,
              softDeleted: 0,
              unchanged: 0,
            };
          } catch (error) {
            console.error('[GremlyStore] syncCalendarEventsToNotes failed:', error);
            return zero;
          }
        },

        connectCalendar: async (provider: CalendarProvider) => {
          try {
            let result: { success: boolean; error?: string };

            if (provider === 'outlook') {
              result = await calendarClient.connectOutlook();
            } else if (provider === 'google') {
              result = await calendarClient.connectGoogle();
            } else {
              result = { success: false, error: 'Unsupported calendar provider' };
            }

            if (result.success) {
              // Refresh connections to get updated status
              await get().refreshCalendarConnections();
            }

            return result;
          } catch (error) {
            console.error('[GremlyStore] connectCalendar failed:', error);
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
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
                calendarConnections: get().calendarConnections.filter(
                  (c) => c.provider !== provider,
                ),
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

        // Event Popup Actions (global popup for calendar events)
        openEventPopup: (event, dateContext) => {
          set({
            eventPopup: { isOpen: true, event, dateContext },
          });
        },

        closeEventPopup: () => {
          set({
            eventPopup: { isOpen: false, event: null, dateContext: null },
          });
        },

        hideEventFromPopup: () => {
          const { eventPopup, hideCalendarEvent } = get();
          if (eventPopup.event && eventPopup.dateContext) {
            const eventId = `${eventPopup.event.provider}-${eventPopup.event.providerEventId}`;
            hideCalendarEvent(eventPopup.dateContext, eventId);
          }
          set({
            eventPopup: { isOpen: false, event: null, dateContext: null },
          });
        },

        // Event Time Picker Actions (global time editor for calendar events)
        openEventTimePicker: (event) => {
          set({
            eventTimePicker: { isOpen: true, event },
          });
        },

        closeEventTimePicker: () => {
          set({
            eventTimePicker: { isOpen: false, event: null },
          });
        },

        // ═══════════════════════════════════════════════════════════════════
        // USER CALENDAR EVENTS (Quick-add entries)
        // ═══════════════════════════════════════════════════════════════════

        setUserCalendarEvents: (events) => set({ userCalendarEvents: events }),

        createUserCalendarEvent: async (eventData) => {
          const tempId = `temp_${getDateService().now().getTime()}`;
          const now = nowTimestamp();
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
          const now = nowTimestamp();

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
        // Gap slotting: schedule tasks into specific time gaps
        // ═══════════════════════════════════════════════════════════════════

        slotTaskIntoGap: (id: string, entityType: 'todo' | 'habit', startIso: string) => {
          set((state) => {
            if (entityType === 'todo') {
              const todos = state.todos.map((t) =>
                t.id === id
                  ? { ...t, scheduled_start_iso: startIso, updated_at: nowTimestamp() }
                  : t,
              );
              return { todos };
            } else {
              const habits = state.habits.map((h) =>
                h.id === id
                  ? { ...h, scheduled_start_iso: startIso, updated_at: nowTimestamp() }
                  : h,
              );
              return { habits };
            }
          });

          // Persist to Supabase
          const table = entityType === 'todo' ? 'todos' : 'habits';
          supabase
            .from(table)
            .update({ scheduled_start_iso: startIso })
            .eq('id', id)
            .then(({ error }) => {
              if (error)
                console.error(`[GremlyStore] slotTaskIntoGap: Supabase error for ${table}`, error);
              else
                console.log(
                  `[GremlyStore] slotTaskIntoGap: Saved ${entityType} ${id} at ${startIso}`,
                );
            });
        },

        unslotTask: (id: string, entityType: 'todo' | 'habit') => {
          set((state) => {
            if (entityType === 'todo') {
              const todos = state.todos.map((t) =>
                t.id === id ? { ...t, scheduled_start_iso: null, updated_at: nowTimestamp() } : t,
              );
              return { todos };
            } else {
              const habits = state.habits.map((h) =>
                h.id === id ? { ...h, scheduled_start_iso: null, updated_at: nowTimestamp() } : h,
              );
              return { habits };
            }
          });

          const table = entityType === 'todo' ? 'todos' : 'habits';
          supabase
            .from(table)
            .update({ scheduled_start_iso: null })
            .eq('id', id)
            .then(({ error }) => {
              if (error)
                console.error(`[GremlyStore] unslotTask: Supabase error for ${table}`, error);
              else console.log(`[GremlyStore] unslotTask: Cleared ${entityType} ${id}`);
            });
        },

        // ═══════════════════════════════════════════════════════════════════
        // HIDDEN TODAY (NOT TODAY) ACTIONS
        // Hide todos/habits from Morning Brief for today only (auto-resets daily)
        // ═══════════════════════════════════════════════════════════════════

        hideForToday: (id: string, forDate?: string) => {
          const targetDate = forDate ?? getDateService().today();
          set((state) => {
            // If the stored date doesn't match the target date, start fresh
            if (state.hiddenTodayDate !== targetDate) {
              const newData = { date: targetDate, ids: [id] };
              saveHiddenTodayToStorage(newData);
              return {
                hiddenTodayIds: [id],
                hiddenTodayDate: targetDate,
              };
            }
            // Otherwise add to existing list (if not already there)
            if (state.hiddenTodayIds.includes(id)) {
              return state;
            }
            const newIds = [...state.hiddenTodayIds, id];
            saveHiddenTodayToStorage({ date: targetDate, ids: newIds });
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
        // MORNING BRIEF CAPACITY GATE
        // Ephemeral daily state for task prioritization flow
        // ═══════════════════════════════════════════════════════════════════

        setBriefSelections: (selectedIds: string[], lockedIds: string[], date: string) => {
          set({
            briefSelectedIds: selectedIds,
            briefLockedIds: lockedIds.slice(0, 3),
            briefSelectionDate: date,
          });
        },

        toggleBriefSelection: (taskId: string) => {
          set((state) => {
            const selected = [...state.briefSelectedIds];
            const idx = selected.indexOf(taskId);
            if (idx >= 0) {
              // Removing from selected — also remove from locked
              selected.splice(idx, 1);
              return {
                briefSelectedIds: selected,
                briefLockedIds: state.briefLockedIds.filter((id) => id !== taskId),
              };
            }
            return { briefSelectedIds: [...selected, taskId] };
          });
        },

        toggleBriefLock: (taskId: string) => {
          set((state) => {
            // Allow locking for selected tasks OR tasks already scheduled into a time slot
            const isSelected = state.briefSelectedIds.includes(taskId);
            const isSlotted = [...state.todos, ...state.habits].some(
              (item) => item.id === taskId && item.scheduled_start_iso,
            );
            if (!isSelected && !isSlotted) return state;
            const locked = [...state.briefLockedIds];
            const idx = locked.indexOf(taskId);
            if (idx >= 0) {
              // Unlock
              locked.splice(idx, 1);
              return { briefLockedIds: locked };
            }
            // Lock — max 3
            if (locked.length >= 3) return state;
            return { briefLockedIds: [...locked, taskId] };
          });
        },

        clearBriefSelections: () => {
          set({
            briefSelectedIds: [],
            briefLockedIds: [],
            briefSelectionDate: null,
            parkedForDay: [],
          });
        },

        setBriefParked: (parkedIds: string[]) => {
          set({ parkedForDay: parkedIds });
        },

        setBriefCompletedToday: (date: string | null) => {
          set({ briefCompletedToday: date });
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
                const { data } = await supabase
                  .from('todos')
                  .select('*')
                  .eq('id', payload.id)
                  .single();
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
                const { data } = await supabase
                  .from('notes')
                  .select('*')
                  .eq('id', payload.id)
                  .single();
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
                const { data } = await supabase
                  .from('todos')
                  .select('*')
                  .eq('id', entityId)
                  .single();
                if (data) {
                  set({
                    todos: state.todos.map((t) => (t.id === entityId ? { ...t, ...data } : t)),
                  });
                  console.log('[GremlyStore] ✅ Synced todo from entity:enriched:', entityId);
                }
              } else if (inHabits) {
                const { data } = await supabase
                  .from('habits')
                  .select('*')
                  .eq('id', entityId)
                  .single();
                if (data) {
                  set({
                    habits: state.habits.map((h) => (h.id === entityId ? { ...h, ...data } : h)),
                  });
                  console.log('[GremlyStore] ✅ Synced habit from entity:enriched:', entityId);
                }
              } else if (inNotes) {
                const { data } = await supabase
                  .from('notes')
                  .select('*')
                  .eq('id', entityId)
                  .single();
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
          const now = getDateService().now().getTime();
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

            console.log(
              `[GremlyStore] 🔧 Found ${totalStuck} stuck MindDrop items, recovering...`,
              {
                todos: stuckTodos?.length ?? 0,
                habits: stuckHabits?.length ?? 0,
                notes: stuckNotes?.length ?? 0,
              },
            );

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

        /**
         * Split a multi-drop note into separate entities for each selected segment.
         * The original multi-drop note is archived and individual entities are created.
         * Works with notes that have views.is_multi=true (already synced to Supabase).
         */
        splitMultiDrop: (noteId: string, items: import('../minddrop/types').MultiDropItem[]) => {
          set((state) => {
            // Find the note by ID
            const note = state.notes.find((n) => n.id === noteId);
            if (!note) {
              console.warn('[GremlyStore] splitMultiDrop: note not found', { noteId });
              return state;
            }

            // Archive the original multi-drop note
            const now = nowTimestamp();
            const updatedNotes = state.notes.map((n) =>
              n.id === noteId
                ? {
                    ...n,
                    archived: true,
                    archived_at: now,
                    archived_reason: 'split' as const,
                    views: { ...n.views, minddrop_stage: 'enriched' as const },
                    updated_at: now,
                  }
                : n,
            );

            // Create new notes for each selected item
            const newNotes: typeof state.notes = [];
            items.forEach((item, index) => {
              const newNote = {
                id: `${noteId}-split-${index}-${getDateService().now().getTime()}`,
                type: 'note' as const,
                owner_id: note.owner_id,
                title: item.smart_title ?? item.preview_title ?? item.text.substring(0, 50),
                body: item.text,
                subtype: 'catchall' as const,
                space_id: note.space_id,
                ai_placed: true,
                origin: note.origin,
                views: {
                  minddrop_stage: 'enriched',
                  ai_pending: false,
                  bucket: item.bucket,
                  subtype: item.subtype,
                },
                created_at: now,
                updated_at: now,
              };
              newNotes.push(newNote as any);
            });

            console.log('[GremlyStore] splitMultiDrop: split into', items.length, 'notes');

            // Also update Supabase asynchronously
            (async () => {
              try {
                // Archive the original note
                await supabase
                  .from('notes')
                  .update({
                    archived: true,
                    archived_at: now,
                    archived_reason: 'split',
                    views: { ...note.views, minddrop_stage: 'resolved' },
                    updated_at: now,
                  })
                  .eq('id', noteId);

                // Insert new notes
                for (const newNote of newNotes) {
                  await supabase.from('notes').insert({
                    owner_id: newNote.owner_id,
                    title: newNote.title,
                    body: newNote.body,
                    subtype: newNote.subtype,
                    space_id: newNote.space_id,
                    ai_placed: newNote.ai_placed,
                    origin: newNote.origin,
                    views: newNote.views,
                    updated_at: newNote.updated_at,
                  });
                }
                console.log('[GremlyStore] splitMultiDrop: Supabase updated');
              } catch (error) {
                console.error('[GremlyStore] splitMultiDrop: Supabase error', error);
              }
            })();

            return {
              notes: [...updatedNotes.filter((n) => n.id !== noteId || n.archived), ...newNotes],
            };
          });
        },

        /**
         * Resolve a multi-drop note as a single entity (keep as-is).
         * Updates the minddrop_stage to 'resolved' so it won't show in the multi-split step again.
         */
        resolveMultiDropAsSingle: (noteId: string) => {
          set((state) => {
            const note = state.notes.find((n) => n.id === noteId);
            if (!note) {
              console.warn('[GremlyStore] resolveMultiDropAsSingle: note not found', { noteId });
              return state;
            }

            const now = nowTimestamp();
            const updatedNotes = state.notes.map((n) =>
              n.id === noteId
                ? {
                    ...n,
                    views: {
                      ...n.views,
                      minddrop_stage: 'enriched' as const,
                      is_multi: false, // Clear the multi flag
                    },
                    updated_at: now,
                  }
                : n,
            );

            console.log('[GremlyStore] resolveMultiDropAsSingle: kept as single', { noteId });

            // Also update Supabase asynchronously
            (async () => {
              try {
                await supabase
                  .from('notes')
                  .update({
                    views: {
                      ...note.views,
                      minddrop_stage: 'resolved',
                      is_multi: false,
                    },
                    updated_at: now,
                  })
                  .eq('id', noteId);
                console.log('[GremlyStore] resolveMultiDropAsSingle: Supabase updated');
              } catch (error) {
                console.error('[GremlyStore] resolveMultiDropAsSingle: Supabase error', error);
              }
            })();

            return { notes: updatedNotes };
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

        resolveEntityClarification: async (localId, optionId, isFreeText = false) => {
          const state = get();

          // ─────────────────────────────────────────────────────────────────────
          // SYNCED ENTITIES: Items already in Supabase (todo, habit, or note)
          // ─────────────────────────────────────────────────────────────────────
          let entityId = localId;

          // Find the entity across all types
          let entity: Todo | Habit | Note | undefined;
          let entityType: 'todo' | 'habit' | 'note' | undefined;

          entity = state.todos.find((t) => t.id === entityId || t.drop_id === entityId);
          if (entity) {
            entityType = 'todo';
          } else {
            entity = state.habits.find((h) => h.id === entityId || h.drop_id === entityId);
            if (entity) {
              entityType = 'habit';
            } else {
              entity = state.notes.find((n) => n.id === entityId || n.drop_id === entityId);
              if (entity) {
                entityType = 'note';
              }
            }
          }

          if (!entity || !entityType) {
            console.warn('[GremlyStore] resolveEntityClarification: Entity not found', {
              entityId,
            });
            return;
          }

          // Use the actual entity ID for all subsequent operations
          // (entityId may be a drop_id/localId that differs from entity.id)
          entityId = entity.id;

          // Get views from entity for use throughout this function
          const views = entity.views as Record<string, unknown> | undefined;

          // Get clarification options - check both direct property and views
          const clarificationOptions =
            ((entity as unknown as Record<string, unknown>).clarification_options as
              | Array<{ id: string; label: string; action?: any }>
              | undefined) ||
            ((entity.views as Record<string, unknown> | undefined)?.clarification_options as
              | Array<{ id: string; label: string; action?: any }>
              | undefined);

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
              console.warn('[GremlyStore] resolveEntityClarification: No clarification options', {
                entityId,
              });
              return;
            }

            const selectedOption = clarificationOptions.find((opt) => opt.id === optionId);
            if (!selectedOption) {
              console.warn('[GremlyStore] resolveEntityClarification: Option not found', {
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
                  ? {
                      ...n,
                      views: {
                        ...((n.views as Record<string, unknown>) || {}),
                        ai_pending: true,
                        clarification_processing: true,
                      },
                    }
                  : n,
              ),
            }));
          } else if (entityType === 'todo') {
            set((s) => ({
              todos: s.todos.map((t) =>
                t.id === entityId
                  ? {
                      ...t,
                      views: {
                        ...((t.views as Record<string, unknown>) || {}),
                        ai_pending: true,
                        clarification_processing: true,
                      },
                    }
                  : t,
              ),
            }));
          } else if (entityType === 'habit') {
            set((s) => ({
              habits: s.habits.map((h) =>
                h.id === entityId
                  ? {
                      ...h,
                      views: {
                        ...((h.views as Record<string, unknown>) || {}),
                        ai_pending: true,
                        clarification_processing: true,
                      },
                    }
                  : h,
              ),
            }));
          }
          console.log('[GremlyStore] Set ai_pending: true for entity:', { entityId, entityType });

          // CRITICAL: Emit ItemUpdated so RecentDrops picks up the ai_pending change
          // This triggers the card to show shimmer immediately
          eventBus.emit('ItemUpdated', { id: entityId, source: STORE_EVENT_SOURCE });

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
            event_time?: string | null;
            time_estimate_minutes?: number | null;
            energy_type?: string | null;
            date_type_ambiguous?: boolean;
            latency_ms?: number;
          } = {};

          // Get bucket/subtype from the selected option (if not free text)
          const selectedOption = isFreeText
            ? null
            : clarificationOptions?.find((opt) => opt.id === optionId);
          const selectedBucket =
            (selectedOption as { action?: { bucket?: string } } | null)?.action?.bucket || null;
          const selectedSubtype =
            (selectedOption as { action?: { subtype?: string } } | null)?.action?.subtype || null;
          const selectedHabitSubtype =
            (selectedOption as { action?: { habitSubtype?: string } } | null)?.action
              ?.habitSubtype || null;

          try {
            const cortexUrl = env.cortexUrl;
            if (cortexUrl) {
              console.log('[GremlyStore] Calling reclassify endpoint...');
              const sessionToken = await getSessionToken();
              const reclassifyResponse = await fetch(cortexUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${sessionToken}`,
                },
                body: JSON.stringify({
                  type: 'reclassify-after-clarification',
                  text: originalText,
                  selectedLabel: selectedLabel,
                  selectedBucket: selectedBucket,
                  selectedSubtype: selectedSubtype,
                  selectedHabitSubtype: selectedHabitSubtype,
                  currentDate: getDateService().today(),
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
                  dateTypeAmbiguous: reclassifyResult.date_type_ambiguous,
                  latency_ms: reclassifyResult.latency_ms,
                });

                // Check if date type is ambiguous
                // For MVP, we default ambiguous dates to target_date (deadline/event)
                // The Sweep can then prompt "When do you want to work on this?" to resolve
                if (reclassifyResult.date_type_ambiguous && reclassifyResult.target_date) {
                  console.log(
                    '[GremlyStore] Date type ambiguous, defaulting to target_date:',
                    reclassifyResult.target_date,
                  );
                  // Future: Could show a follow-up popup asking:
                  // "Is [date] when [the thing] is, or when you'll do it?"
                  // Options:
                  // 1. "That's when it is" → target_date stays, scheduled_date = null
                  // 2. "That's when I'll do it" → scheduled_date = date, target_date = null
                }
              } else {
                console.warn(
                  '[GremlyStore] Reclassify response not ok:',
                  reclassifyResponse.status,
                );
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
          const newSubtype = reclassifyResult.subtype ?? reclassifyResult.habit_subtype ?? null;
          const newConfirmation =
            reclassifyResult.confirmation_message || getRandomFallback(targetBucket, newSubtype);
          const timeEstimate = reclassifyResult.time_estimate_minutes ?? null;
          const energyType = reclassifyResult.energy_type ?? null;

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
              // For notes, store date intelligence in views (notes don't have date columns)
              ...(entityType === 'note' && reclassifyResult.target_date
                ? { target_date: reclassifyResult.target_date }
                : {}),
              ...(entityType === 'note' && reclassifyResult.scheduled_date
                ? { scheduled_date: reclassifyResult.scheduled_date }
                : {}),
              ...(entityType === 'note' && reclassifyResult.event_time
                ? { event_time: reclassifyResult.event_time }
                : {}),
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

            console.log('[GremlyStore] Same bucket clarification - reclassify applied:', {
              entityId,
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
                console.log('[GremlyStore] Phase 2 called with combined text:', {
                  originalText: originalText.substring(0, 30),
                  selectedLabel: selectedLabel.substring(0, 30),
                  phase2Text: phase2Text.substring(0, 60),
                });

                const sessionToken2 = await getSessionToken();
                const phase2Response = await fetch(cortexUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionToken2}`,
                  },
                  body: JSON.stringify({
                    type: 'enrich-phase2',
                    text: phase2Text,
                    bucket: targetBucket,
                    subtype: newSubtype,
                    currentDate: getDateService().today(),
                  }),
                });

                if (phase2Response.ok) {
                  const phase2Result = await phase2Response.json();
                  console.log('[GremlyStore] Phase 2 enrichment result', {
                    entityId,
                    tags: phase2Result.tags,
                    timeEstimate: phase2Result.time_estimate_minutes,
                    people: phase2Result.people,
                    extractedFrequency: phase2Result.extracted_frequency,
                    extractedDays: phase2Result.extracted_days,
                    latency_ms: phase2Result.latency_ms,
                  });

                  // Build Phase 2 updates
                  const phase2Updates: Record<string, unknown> = {};

                  if (
                    phase2Result.tags &&
                    Array.isArray(phase2Result.tags) &&
                    phase2Result.tags.length > 0
                  ) {
                    phase2Updates.tags = phase2Result.tags;
                  }
                  if (phase2Result.time_estimate_minutes != null) {
                    phase2Updates.time_estimate_minutes = phase2Result.time_estimate_minutes;
                  }
                  if (phase2Result.energy_type) {
                    phase2Updates.energy_type = phase2Result.energy_type;
                  }
                  if (
                    phase2Result.people &&
                    Array.isArray(phase2Result.people) &&
                    phase2Result.people.length > 0
                  ) {
                    phase2Updates.views = {
                      ...updatedViews,
                      people: phase2Result.people,
                    };
                  }
                  // Habit-specific fields
                  if (entityType === 'habit') {
                    if (phase2Result.extracted_frequency) {
                      // Parse frequency string into canonical fields
                      const parsed = parseHabitFrequency(phase2Result.extracted_frequency);
                      phase2Updates.frequency = parsed.frequency;
                      phase2Updates.cadence = parsed.cadence;
                      phase2Updates.target_per_period = parsed.target_per_period;
                    }
                    if (phase2Result.extracted_days && Array.isArray(phase2Result.extracted_days)) {
                      phase2Updates.days_active = phase2Result.extracted_days;
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
                    ? {
                        ...n,
                        views: {
                          ...((n.views as Record<string, unknown>) || {}),
                          ai_pending: false,
                          clarification_processing: false,
                        },
                      }
                    : n,
                ),
              }));
            } else if (entityType === 'todo') {
              set((s) => ({
                todos: s.todos.map((t) =>
                  t.id === entityId
                    ? {
                        ...t,
                        views: {
                          ...((t.views as Record<string, unknown>) || {}),
                          ai_pending: false,
                          clarification_processing: false,
                        },
                      }
                    : t,
                ),
              }));
            } else if (entityType === 'habit') {
              set((s) => ({
                habits: s.habits.map((h) =>
                  h.id === entityId
                    ? {
                        ...h,
                        views: {
                          ...((h.views as Record<string, unknown>) || {}),
                          ai_pending: false,
                          clarification_processing: false,
                        },
                      }
                    : h,
                ),
              }));
            }
            console.log('[GremlyStore] Cleared processing state for entity:', {
              entityId,
              entityType,
            });

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
            // CRITICAL: Set ai_pending: true so the card shows shimmer animation while Phase 2 runs
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
                converted_at: nowTimestamp(),
                confirmation_message: newConfirmation,
                // Set processing state so card shows shimmer while Phase 2 runs
                ai_pending: true,
                minddrop_stage: 'classified',
              },
            };

            let newEntityPayload: Record<string, unknown>;

            if (targetBucket === 'todo') {
              // Converting to TODO - use reclassify dates
              const body = originalBody;

              // Date Intelligence fields
              // target_date = when something IS/DUE (event/deadline) - external, immovable
              // scheduled_date = when user will DO the work - internal, movable
              const targetDate = reclassifyResult.target_date
                ? reclassifyResult.target_date.split('T')[0]
                : null;
              const scheduledDate = reclassifyResult.scheduled_date
                ? reclassifyResult.scheduled_date.split('T')[0]
                : null;

              // Legacy fields (due_day, due_date) should match scheduled_date, NOT target_date
              // This is because due_day was historically "when to do it", not "when it's due"
              // If no scheduled_date, fall back to extracted date for backwards compat
              const legacyDueDate =
                scheduledDate || (extractedDate ? extractedDate.split('T')[0] : null);

              newEntityPayload = {
                ...commonFields,
                name: newTitle,
                title: newTitle,
                body: body !== newTitle ? body : null,
                subtype: newSubtype || null,
                status: 'active',
                undefined_due: !legacyDueDate && !targetDate,
                // Legacy fields - match scheduled_date for backwards compat
                due_day: legacyDueDate,
                due_date: legacyDueDate,
                // Date Intelligence fields
                target_date: targetDate,
                scheduled_date: scheduledDate,
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
                frequency: 'pending', // Placeholder until Phase 2 sets real frequency
                cadence: 'daily', // DB requires valid cadence; Phase 2 will update
                target_per_period: 1, // Default; Phase 2 will update
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
              archived_at: nowTimestamp(),
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
              set({
                todos: [
                  ...get().todos,
                  {
                    ...insertedEntity,
                    type: 'todo' as const,
                    reminders: (insertedEntity as any).reminders_json ?? [],
                  },
                ],
              });
            } else if (targetBucket === 'habit') {
              set({
                habits: [
                  ...get().habits,
                  {
                    ...insertedEntity,
                    type: 'habit' as const,
                    reminders: (insertedEntity as any).reminders_json ?? [],
                  },
                ],
              });
            } else {
              set({
                notes: [
                  ...get().notes,
                  {
                    ...insertedEntity,
                    type: 'note' as const,
                    reminders: (insertedEntity as any).reminders_json ?? [],
                  },
                ],
              });
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

                const sessionToken2 = await getSessionToken();
                const phase2Response = await fetch(cortexUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionToken2}`,
                  },
                  body: JSON.stringify({
                    type: 'enrich-phase2',
                    text: phase2Text,
                    bucket: targetBucket,
                    subtype: newSubtype,
                    currentDate: getDateService().today(),
                  }),
                });

                if (phase2Response.ok) {
                  const phase2Result = await phase2Response.json();
                  console.log('[GremlyStore] Phase 2 enrichment result for converted entity', {
                    newEntityId: insertedEntity.id,
                    tags: phase2Result.tags,
                    timeEstimate: phase2Result.time_estimate_minutes,
                    people: phase2Result.people,
                    extractedFrequency: phase2Result.extracted_frequency,
                    extractedDays: phase2Result.extracted_days,
                    latency_ms: phase2Result.latency_ms,
                  });

                  // Build Phase 2 updates
                  // CRITICAL: Include minddrop_stage: 'enriched' so all chips animate together
                  const phase2Updates: Record<string, unknown> = {
                    views: {
                      ...(insertedEntity.views || {}),
                      ai_pending: false,
                      clarification_processing: false,
                      minddrop_stage: 'enriched',
                    },
                  };

                  if (
                    phase2Result.tags &&
                    Array.isArray(phase2Result.tags) &&
                    phase2Result.tags.length > 0
                  ) {
                    phase2Updates.tags = phase2Result.tags;
                  }
                  if (phase2Result.time_estimate_minutes != null) {
                    phase2Updates.time_estimate_minutes = phase2Result.time_estimate_minutes;
                  }
                  if (phase2Result.energy_type) {
                    phase2Updates.energy_type = phase2Result.energy_type;
                  }
                  if (
                    phase2Result.people &&
                    Array.isArray(phase2Result.people) &&
                    phase2Result.people.length > 0
                  ) {
                    (phase2Updates.views as Record<string, unknown>).people = phase2Result.people;
                  }
                  // Habit-specific fields
                  if (targetBucket === 'habit') {
                    if (phase2Result.extracted_frequency) {
                      // Parse frequency string into canonical fields
                      const parsed = parseHabitFrequency(phase2Result.extracted_frequency);
                      phase2Updates.frequency = parsed.frequency;
                      phase2Updates.cadence = parsed.cadence;
                      phase2Updates.target_per_period = parsed.target_per_period;
                    }
                    if (phase2Result.extracted_days && Array.isArray(phase2Result.extracted_days)) {
                      phase2Updates.days_active = phase2Result.extracted_days;
                    }
                  }

                  // Apply Phase 2 updates - always has views with enriched stage
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
                } else {
                  console.warn(
                    '[GremlyStore] Phase 2 response not ok for converted entity:',
                    phase2Response.status,
                  );
                }
              }
            } catch (phase2Error) {
              console.log(
                '[GremlyStore] Phase 2 enrichment failed for converted entity:',
                phase2Error,
              );
              // Non-critical - entity already created with reclassify data
            }

            // Clear processing state on the new entity after Phase 2 (success or failure)
            // CRITICAL: Set minddrop_stage to 'enriched' so chips animate together
            if (targetBucket === 'log') {
              set((s) => ({
                notes: s.notes.map((n) =>
                  n.id === insertedEntity.id
                    ? {
                        ...n,
                        views: {
                          ...((n.views as Record<string, unknown>) || {}),
                          ai_pending: false,
                          clarification_processing: false,
                          minddrop_stage: 'enriched',
                        },
                      }
                    : n,
                ),
              }));
            } else if (targetBucket === 'todo') {
              set((s) => ({
                todos: s.todos.map((t) =>
                  t.id === insertedEntity.id
                    ? {
                        ...t,
                        views: {
                          ...((t.views as Record<string, unknown>) || {}),
                          ai_pending: false,
                          clarification_processing: false,
                          minddrop_stage: 'enriched',
                        },
                      }
                    : t,
                ),
              }));
            } else if (targetBucket === 'habit') {
              set((s) => ({
                habits: s.habits.map((h) =>
                  h.id === insertedEntity.id
                    ? {
                        ...h,
                        views: {
                          ...((h.views as Record<string, unknown>) || {}),
                          ai_pending: false,
                          clarification_processing: false,
                          minddrop_stage: 'enriched',
                        },
                      }
                    : h,
                ),
              }));
            }
            console.log('[GremlyStore] Cleared processing state for converted entity:', {
              newEntityId: insertedEntity.id,
              targetBucket,
            });
          } catch (error) {
            console.error('[GremlyStore] Bucket change failed:', error);
            // Fall back to just updating clarification status
            const updatedViews: Record<string, unknown> = {
              ...((entity.views as Record<string, unknown>) || {}),
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
        // SKIP CLARIFICATION (User presses "Skip for now")
        // Resolves clarification as skipped, keeps entity as LOG/general,
        // and runs Phase 2 for tag extraction
        // ═══════════════════════════════════════════════════════════════════
        resolveSkippedClarification: async (entityId: string) => {
          console.log('[GremlyStore] Resolving skipped clarification:', { entityId });

          const state = get();

          // Find the entity across all types (could be todo, habit, or note)
          let entity: Todo | Habit | Note | undefined;
          let entityType: 'todo' | 'habit' | 'note' | undefined;

          entity = state.notes.find((n) => n.id === entityId);
          if (entity) {
            entityType = 'note';
          } else {
            entity = state.todos.find((t) => t.id === entityId);
            if (entity) {
              entityType = 'todo';
            } else {
              entity = state.habits.find((h) => h.id === entityId);
              if (entity) {
                entityType = 'habit';
              }
            }
          }

          if (!entity || !entityType) {
            console.error('[GremlyStore] Entity not found for skip:', entityId);
            return;
          }

          const originalText =
            (entity as Note).body || (entity as Note).title || (entity as any).name || '';
          const views = (entity.views as Record<string, unknown>) || {};

          console.log('[GremlyStore] Skipping clarification for entity:', {
            entityId,
            entityType,
            originalTextPreview: originalText.substring(0, 50),
          });

          // Step 1: Mark clarification as skipped and set ai_pending for shimmer animation
          // Also set a normal confirmation message to replace the "tap me" style message
          // Skipped items stay as LOG/general, so use general fallbacks
          const skippedConfirmation = getRandomFallback('log', null);
          const skippedViews: Record<string, unknown> = {
            ...views,
            needs_clarification: false,
            clarification_resolved: true,
            clarification_skipped: true,
            confirmation_message: skippedConfirmation,
            ai_pending: true,
            minddrop_stage: 'classified',
          };

          if (entityType === 'note') {
            set((s) => ({
              notes: s.notes.map((n) =>
                n.id === entityId
                  ? {
                      ...n,
                      needs_clarification: false,
                      clarification_resolved: true,
                      confirmation_message: skippedConfirmation,
                      views: skippedViews,
                    }
                  : n,
              ),
            }));
          } else if (entityType === 'todo') {
            set((s) => ({
              todos: s.todos.map((t) =>
                t.id === entityId
                  ? {
                      ...t,
                      needs_clarification: false,
                      clarification_resolved: true,
                      confirmation_message: skippedConfirmation,
                      views: skippedViews,
                    }
                  : t,
              ),
            }));
          } else if (entityType === 'habit') {
            set((s) => ({
              habits: s.habits.map((h) =>
                h.id === entityId
                  ? {
                      ...h,
                      needs_clarification: false,
                      clarification_resolved: true,
                      confirmation_message: skippedConfirmation,
                      views: skippedViews,
                    }
                  : h,
              ),
            }));
          }

          // Emit ItemUpdated so card shows shimmer immediately
          eventBus.emit('ItemUpdated', { id: entityId, source: STORE_EVENT_SOURCE });

          console.log('[GremlyStore] Marked clarification as skipped, running Phase 2');

          // Step 2: Run Phase 2 with original text only (no clarification context)
          // Entity stays as current type with general subtype
          try {
            const cortexUrl = env.cortexUrl;
            if (cortexUrl) {
              const sessionToken = await getSessionToken();
              const phase2Response = await fetch(cortexUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${sessionToken}`,
                },
                body: JSON.stringify({
                  type: 'enrich-phase2',
                  text: originalText,
                  bucket: entityType === 'note' ? 'log' : entityType,
                  subtype: 'general',
                  currentDate: getDateService().today(),
                }),
              });

              if (phase2Response.ok) {
                const phase2Result = await phase2Response.json();
                console.log('[GremlyStore] Phase 2 result for skipped clarification:', {
                  entityId,
                  tags: phase2Result.tags,
                  timeEstimate: phase2Result.time_estimate_minutes,
                  latency_ms: phase2Result.latency_ms,
                });

                // Build Phase 2 updates
                const phase2Updates: Record<string, unknown> = {
                  views: {
                    ...skippedViews,
                    ai_pending: false,
                    minddrop_stage: 'enriched',
                  },
                };

                if (
                  phase2Result.tags &&
                  Array.isArray(phase2Result.tags) &&
                  phase2Result.tags.length > 0
                ) {
                  phase2Updates.tags = phase2Result.tags;
                }
                if (phase2Result.time_estimate_minutes != null && entityType !== 'note') {
                  phase2Updates.time_estimate_minutes = phase2Result.time_estimate_minutes;
                }
                if (phase2Result.energy_type && entityType !== 'note') {
                  phase2Updates.energy_type = phase2Result.energy_type;
                }

                // Apply Phase 2 updates
                if (entityType === 'todo') {
                  await get().updateTodo(entityId, phase2Updates);
                } else if (entityType === 'habit') {
                  await get().updateHabit(entityId, phase2Updates);
                } else {
                  await get().updateNote(entityId, phase2Updates);
                }

                console.log('[GremlyStore] Skipped clarification Phase 2 complete:', { entityId });
              } else {
                console.warn('[GremlyStore] Phase 2 response not ok:', phase2Response.status);
                // Still mark as enriched to clear loading state
                await get().updateNote(entityId, {
                  views: { ...skippedViews, ai_pending: false, minddrop_stage: 'enriched' },
                });
              }
            }
          } catch (error) {
            console.error('[GremlyStore] Phase 2 failed for skipped clarification:', error);

            // Clear loading state even on error
            if (entityType === 'note') {
              set((s) => ({
                notes: s.notes.map((n) =>
                  n.id === entityId
                    ? {
                        ...n,
                        views: {
                          ...((n.views as Record<string, unknown>) || {}),
                          ai_pending: false,
                          minddrop_stage: 'enriched',
                        },
                      }
                    : n,
                ),
              }));
            } else if (entityType === 'todo') {
              set((s) => ({
                todos: s.todos.map((t) =>
                  t.id === entityId
                    ? {
                        ...t,
                        views: {
                          ...((t.views as Record<string, unknown>) || {}),
                          ai_pending: false,
                          minddrop_stage: 'enriched',
                        },
                      }
                    : t,
                ),
              }));
            } else if (entityType === 'habit') {
              set((s) => ({
                habits: s.habits.map((h) =>
                  h.id === entityId
                    ? {
                        ...h,
                        views: {
                          ...((h.views as Record<string, unknown>) || {}),
                          ai_pending: false,
                          minddrop_stage: 'enriched',
                        },
                      }
                    : h,
                ),
              }));
            }
          }

          // Emit ItemUpdated to trigger card refresh
          eventBus.emit('ItemUpdated', { id: entityId, source: STORE_EVENT_SOURCE });
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
          const now = nowTimestamp();
          const messageId = `msg_${getDateService().now().getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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
                  ? {
                      ...t,
                      views: updateChatData(t.views as Record<string, unknown>),
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
                      views: updateChatData(h.views as Record<string, unknown>),
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
                      views: updateChatData(n.views as Record<string, unknown>),
                      updated_at: now,
                    }
                  : n,
              ),
            });
          }

          // Persist to Supabase
          const table =
            entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
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
          const now = nowTimestamp();
          const messageId = `msg_${getDateService().now().getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

        // Updates streaming message searching state (synchronous, no persistence)
        updateEntityChatStreamingSearching: (
          entityId: string,
          entityType: 'todo' | 'habit' | 'note',
          messageId: string,
          isSearching: boolean,
          searchQuery: string | null,
        ): void => {
          const state = get();

          // Helper to update message searching state
          const updateMessageSearching = (
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
                    ? { ...m, metadata: { ...m.metadata, isSearching, searchQuery } }
                    : m,
                ),
              },
            };
          };

          if (entityType === 'todo') {
            set({
              todos: state.todos.map((t) =>
                t.id === entityId
                  ? { ...t, views: updateMessageSearching(t.views as Record<string, unknown>) }
                  : t,
              ),
            });
          } else if (entityType === 'habit') {
            set({
              habits: state.habits.map((h) =>
                h.id === entityId
                  ? { ...h, views: updateMessageSearching(h.views as Record<string, unknown>) }
                  : h,
              ),
            });
          } else {
            set({
              notes: state.notes.map((n) =>
                n.id === entityId
                  ? { ...n, views: updateMessageSearching(n.views as Record<string, unknown>) }
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
          const now = nowTimestamp();
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
          const table =
            entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
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
          const now = nowTimestamp();
          const noteId = `cnote_${getDateService().now().getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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
                  ? {
                      ...t,
                      views: updateChatData(t.views as Record<string, unknown>),
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
                      views: updateChatData(h.views as Record<string, unknown>),
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
                      views: updateChatData(n.views as Record<string, unknown>),
                      updated_at: now,
                    }
                  : n,
              ),
            });
          }

          // Persist to Supabase
          const table =
            entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
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
          const now = nowTimestamp();
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
                  ? {
                      ...t,
                      views: updateChatData(t.views as Record<string, unknown>),
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
                      views: updateChatData(h.views as Record<string, unknown>),
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
                      views: updateChatData(n.views as Record<string, unknown>),
                      updated_at: now,
                    }
                  : n,
              ),
            });
          }

          // Persist to Supabase
          const table =
            entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
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
          const now = nowTimestamp();
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
                  ? {
                      ...t,
                      views: updateChatData(t.views as Record<string, unknown>),
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
                      views: updateChatData(h.views as Record<string, unknown>),
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
                      views: updateChatData(n.views as Record<string, unknown>),
                      updated_at: now,
                    }
                  : n,
              ),
            });
          }

          // Persist to Supabase
          const table =
            entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
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
          const now = nowTimestamp();
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
                  ? {
                      ...t,
                      views: updateChatData(t.views as Record<string, unknown>),
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
                      views: updateChatData(h.views as Record<string, unknown>),
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
                      views: updateChatData(n.views as Record<string, unknown>),
                      updated_at: now,
                    }
                  : n,
              ),
            });
          }

          // Persist to Supabase
          const table =
            entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
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
          const now = nowTimestamp();
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
                  ? {
                      ...t,
                      views: updateChatData(t.views as Record<string, unknown>),
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
                      views: updateChatData(h.views as Record<string, unknown>),
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
                      views: updateChatData(n.views as Record<string, unknown>),
                      updated_at: now,
                    }
                  : n,
              ),
            });
          }

          // Persist to Supabase
          const table =
            entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
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
          const now = nowTimestamp();
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
          const table =
            entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
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

        refreshWorldsGraph: async () => {
          const userId = get().userId;
          if (!userId) return;
          try {
            const [
              worldsRes,
              chaptersRes,
              lifeContextsRes,
              chapterWorldLinksRes,
              dropWorldLinksRes,
              dropChapterLinksRes,
              dropContextLinksRes,
              worldObservationsRes,
            ] = await Promise.all([
              supabase.from('worlds').select('*').eq('owner_id', userId),
              supabase.from('chapters').select('*').eq('owner_id', userId),
              supabase.from('life_contexts').select('*').eq('owner_id', userId),
              supabase.from('chapter_world_links').select('*').eq('owner_id', userId),
              supabase.from('drop_world_links').select('*').eq('owner_id', userId),
              supabase.from('drop_chapter_links').select('*').eq('owner_id', userId),
              supabase.from('drop_context_links').select('*').eq('owner_id', userId),
              supabase
                .from('world_observations')
                .select('*')
                .eq('owner_id', userId)
                .is('dismissed_at', null),
            ]);
            set({
              worlds: (worldsRes.data ?? []) as World[],
              chapters: (chaptersRes.data ?? []) as Chapter[],
              lifeContexts: (lifeContextsRes.data ?? []) as LifeContext[],
              chapterWorldLinks: (chapterWorldLinksRes.data ?? []) as ChapterWorldLink[],
              dropWorldLinks: (dropWorldLinksRes.data ?? []) as DropWorldLink[],
              dropChapterLinks: (dropChapterLinksRes.data ?? []) as DropChapterLink[],
              dropContextLinks: (dropContextLinksRes.data ?? []) as DropContextLink[],
              worldObservations: (worldObservationsRes.data ?? []) as WorldObservation[],
            });
          } catch (err) {
            console.warn('[GremlyStore] refreshWorldsGraph failed:', err);
          }
        },

        dismissWorldObservation: async (observationId: string) => {
          // Optimistic remove.
          const prev = get().worldObservations;
          set({ worldObservations: prev.filter((o) => o.id !== observationId) });
          try {
            const { error } = await supabase
              .from('world_observations')
              .update({ dismissed_at: getDateService().now().toISOString() })
              .eq('id', observationId);
            if (error) throw error;
          } catch (err) {
            // Roll back on failure.
            console.warn('[GremlyStore] dismissWorldObservation failed:', err);
            set({ worldObservations: prev });
          }
        },

        updateChapterDates: async (input: {
          chapterId: string;
          startDate: string;
          endDate: string;
          reason: string | null;
        }) => {
          const userId = get().userId;
          if (!userId) throw new Error('Not authenticated');

          const chapter = get().chapters.find((c) => c.id === input.chapterId);
          if (!chapter) throw new Error('Chapter not found');

          const oldStart = chapter.start_date;
          const oldEnd = chapter.end_date;
          const startChanged = input.startDate !== oldStart;
          const endChanged = input.endDate !== oldEnd;

          if (!startChanged && !endChanged) return;

          const now = nowTimestamp();
          const patch: Record<string, unknown> = { updated_at: now };
          if (startChanged) {
            patch.start_date = input.startDate;
            patch.start_date_source = 'user';
            patch.start_date_updated_at = now;
          }
          if (endChanged) {
            patch.end_date = input.endDate;
            patch.end_date_source = 'user';
            patch.end_date_updated_at = now;
          }

          const { error } = await supabase
            .from('chapters')
            .update(patch)
            .eq('id', input.chapterId)
            .eq('owner_id', userId);
          if (error) throw error;

          set((state) => ({
            chapters: state.chapters.map((c) =>
              c.id === input.chapterId
                ? {
                    ...c,
                    ...(startChanged
                      ? {
                          start_date: input.startDate,
                          start_date_source: 'user' as const,
                          start_date_updated_at: now,
                        }
                      : {}),
                    ...(endChanged
                      ? {
                          end_date: input.endDate,
                          end_date_source: 'user' as const,
                          end_date_updated_at: now,
                        }
                      : {}),
                    updated_at: now,
                  }
                : c,
            ),
          }));

          // Best-effort edit log — silent warn on failure
          const logRows: Array<Record<string, unknown>> = [];
          if (startChanged) {
            logRows.push({
              chapter_id: input.chapterId,
              field: 'start_date',
              old_value: oldStart ?? null,
              new_value: input.startDate,
              reason: input.reason ?? null,
            });
          }
          if (endChanged) {
            logRows.push({
              chapter_id: input.chapterId,
              field: 'end_date',
              old_value: oldEnd ?? null,
              new_value: input.endDate,
              reason: input.reason ?? null,
            });
          }
          if (logRows.length > 0) {
            const { error: logError } = await supabase.from('chapter_edit_log').insert(logRows);
            if (logError) {
              console.warn('[GremlyStore] updateChapterDates — edit log insert failed:', logError);
            }
          }
        },

        updateChapterTitle: async (input: {
          chapterId: string;
          title: string;
          reason: string | null;
        }) => {
          const userId = get().userId;
          if (!userId) throw new Error('Not authenticated');

          const chapter = get().chapters.find((c) => c.id === input.chapterId);
          if (!chapter) throw new Error('Chapter not found');

          const oldTitle = chapter.title ?? '';
          const newTitle = input.title.trim();
          if (newTitle === oldTitle) return;
          if (newTitle.length === 0) throw new Error('Title cannot be empty');

          const now = nowTimestamp();

          const { error: updateErr } = await supabase
            .from('chapters')
            .update({
              title: newTitle,
              title_source: 'user',
              title_updated_at: now,
            })
            .eq('id', input.chapterId)
            .eq('owner_id', userId);
          if (updateErr) throw new Error(updateErr.message);

          set((state) => ({
            chapters: state.chapters.map((c) =>
              c.id === input.chapterId
                ? {
                    ...c,
                    title: newTitle,
                    title_source: 'user' as const,
                    title_updated_at: now,
                  }
                : c,
            ),
          }));

          // Best-effort edit log — do not throw on failure.
          // NOTE: column is `field`, not `field_name`. No `owner_id` on chapter_edit_log.
          // NOTE: plain values only — supabase-js encodes jsonb; do NOT call JSON.stringify.
          const { error: logErr } = await supabase.from('chapter_edit_log').insert({
            chapter_id: input.chapterId,
            field: 'title',
            old_value: oldTitle.length > 0 ? oldTitle : null,
            new_value: newTitle,
            reason: input.reason,
          });
          if (logErr) {
            console.warn('[GremlyStore] updateChapterTitle — edit log insert failed:', logErr);
          }
        },
      }),
      {
        name: 'gremly-store-v1',
        storage: createJSONStorage(() => mmkvStorage, {
          replacer: (key: string, value: unknown) => {
            // Convert Map → Array of entries for JSON serialization
            if (value instanceof Map) {
              return { __type: 'Map', entries: Array.from(value.entries()) };
            }
            return value;
          },
          reviver: (key: string, value: unknown) => {
            // Convert Array of entries → Map on deserialization
            if (
              value &&
              typeof value === 'object' &&
              (value as any).__type === 'Map' &&
              Array.isArray((value as any).entries)
            ) {
              return new Map((value as any).entries);
            }
            return value;
          },
        }),

        version: STORE_SCHEMA_VERSION,

        migrate: (persistedState: any, version: number) => {
          if (!persistedState) return persistedState;

          // Migration from v0/v1 (no version or version 1) to v2:
          // Phase 2 moved lifecycle state out of the main partialize.
          // Strip stale lifecycle fields so they don't override fresh Supabase data.
          if (version < 2) {
            console.log('[GremlyStore] Migrating persisted state from v' + version + ' to v2');
            const {
              onboardingCompletedAt,
              firstDropCompletedAt,
              trainingStartedAt,
              graduatedAt,
              trainingDropStep,
              pendingGraduation,
              postGraduationMessageShown,
              ...rest
            } = persistedState;
            return {
              ...rest,
              lifecycleCache: null, // force fresh fetch from Supabase on next init
            };
          }

          return persistedState;
        },

        // Only persist data, not transient UI state
        partialize: (state: GremlyState) => ({
          todos: state.todos,
          habits: state.habits,
          notes: state.notes,
          spaces: state.spaces,
          tags: state.tags,
          habitProgress: state.habitProgress,
          milestones: state.milestones,
          userId: state.userId,
          lastSweepCompletedAt: state.lastSweepCompletedAt,
          sweepStreak: state.sweepStreak,
          totalSweepCount: state.totalSweepCount,
          miniSweepLastCompletedAt: state.miniSweepLastCompletedAt,
          gremlyAge: state.gremlyAge,
          gremlyAgeLastIncrementedAt: state.gremlyAgeLastIncrementedAt,
          dayBoundaryHour: state.dayBoundaryHour,
          accountCreatedAt: state.accountCreatedAt,
          demoSweepCompletedAt: state.demoSweepCompletedAt,
          firstTodayVisitCompletedAt: state.firstTodayVisitCompletedAt,
          todayRitualDay: state.todayRitualDay,
          todayDropsCount: state.todayDropsCount,
          todaySweepsCount: state.todaySweepsCount,
          todayRitualCompletedAt: state.todayRitualCompletedAt,
          dailyBrief: state.dailyBrief,
          feedingGaugeValue: state.feedingGaugeValue,
          isFedToday: state.isFedToday,
          feedingContributions: state.feedingContributions,
          feedingGaugeLastUpdatedAt: state.feedingGaugeLastUpdatedAt,
          todayFedCelebrationShownAt: state.todayFedCelebrationShownAt,
          todayFeedingAgeUpShownAt: state.todayFeedingAgeUpShownAt,
          fedDaysCount: state.fedDaysCount,
          currentTierName: state.currentTierName,
          unfedStreakDays: state.unfedStreakDays,
          lastFedAt: state.lastFedAt,
          sockCount: state.sockCount,
          aiMode: state.aiMode,
          hasSeenGaugeExplanation: state.hasSeenGaugeExplanation,
          hasSeenFirstFedModal: state.hasSeenFirstFedModal,
          hasSeenSweepUnlockModal: state.hasSeenSweepUnlockModal,
          hasSeenEntityChatHighlight: state.hasSeenEntityChatHighlight,
          hasSeenTrainingMeterAutoOpen: state.hasSeenTrainingMeterAutoOpen,
          hasSeenReadonlyIntro: state.hasSeenReadonlyIntro,
          gremlyColor: state.gremlyColor,
          lastActiveDate: state.lastActiveDate,
          userName: state.userName,
          userPronouns: state.userPronouns,
          // Calendar cache — survives app restart for instant display
          calendarEvents: state.calendarEvents,
          calendarLastFetched: state.calendarLastFetched,
          lifecycleCache: state.lifecycleCache,
        }),

        // Merge persisted state with fresh initial state
        merge: (persistedState: any, currentState: GremlyState) => {
          if (__DEV__)
            console.log(
              '[MMKV merge] onboardingCompletedAt from persisted:',
              persistedState?.onboardingCompletedAt,
            );
          if (!persistedState) return currentState;

          // Day-aware hydration: keep cached gauge values on same-day
          // re-opens, only reset on day boundaries (Soul Document v8)
          const dayBoundaryHour = persistedState.dayBoundaryHour ?? 4;
          const currentRitualDay = getRitualDay(dayBoundaryHour);
          const isSameRitualDay =
            persistedState.todayRitualDay != null &&
            persistedState.todayRitualDay === currentRitualDay;

          return {
            ...currentState,
            ...persistedState,
            // Always reset transient flags on hydration
            isLoading: false,
            isInitialized: false,
            lastSyncedAt: null,
            // Always use fresh date on app start
            currentDate: getDateService().today(),
            // Day-aware gauge state: preserve on same-day, reset on day boundary.
            // On day boundary, initialize() will re-populate from Supabase.
            feedingGaugeValue: isSameRitualDay ? persistedState.feedingGaugeValue : 0,
            isFedToday: isSameRitualDay ? persistedState.isFedToday : false,
            feedingContributions: isSameRitualDay ? persistedState.feedingContributions : [],
            feedingGaugeLastUpdatedAt: isSameRitualDay
              ? persistedState.feedingGaugeLastUpdatedAt
              : null,
            todayFedCelebrationShownAt: isSameRitualDay
              ? persistedState.todayFedCelebrationShownAt
              : null,
            todayFeedingAgeUpShownAt: isSameRitualDay
              ? persistedState.todayFeedingAgeUpShownAt
              : null,
            // Day-aware daily counters
            todayDropsCount: isSameRitualDay ? persistedState.todayDropsCount : 0,
            todaySweepsCount: isSameRitualDay ? persistedState.todaySweepsCount : 0,
            todayRitualCompletedAt: isSameRitualDay ? persistedState.todayRitualCompletedAt : null,
            // Calendar: keep cached events if same day, clear if new day
            calendarEvents: isSameRitualDay ? (persistedState.calendarEvents ?? {}) : {},
            calendarLastFetched: isSameRitualDay ? persistedState.calendarLastFetched : null,
            // Always reset transient state
            pendingGaugePreviews: 0,
            trainingReadiness: 0,
            pendingGraduation: false,
            // Lifecycle rehydration from separate cache (only if cache belongs to expected user)
            ...(() => {
              const cache = persistedState?.lifecycleCache;
              if (cache && cache.cachedForUserId === persistedState?.userId) {
                return {
                  onboardingCompletedAt: cache.onboardingCompletedAt,
                  firstDropCompletedAt: cache.firstDropCompletedAt,
                  trainingDropStep: cache.trainingDropStep,
                  graduatedAt: cache.graduatedAt,
                  isTester: cache.isTester,
                  trialStartedAt: cache.trialStartedAt,
                  challengeStartedAt: cache.challengeStartedAt,
                  challengeCompletedAt: cache.challengeCompletedAt,
                  hasSeenReadonlyIntro: cache.hasSeenReadonlyIntro,
                };
              }
              return {};
            })(),
          };
        },
      },
    ),
  ),
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
  // Notes with target_date (excluding event subtype - those are handled separately as keyDateEvents)
  const eventNotes = state.notes.filter(
    (n) => !n.archived && n.target_date === date && n.subtype !== 'event',
  );
  const reminderNotes = state.notes.filter((n) => !n.archived && n.reminder_date === date);

  const calendarEvents = state.calendarEvents[date] ?? [];
  const userCalendarEvents = state.userCalendarEvents.filter((e) => e.event_date === date);

  // Key Date events (subtype='event') - includes single-day and multi-day events spanning this date
  const keyDateEvents = state.notes.filter((n) => {
    if (n.subtype !== 'event' || n.archived) return false;
    // Single day event: target_date matches
    if (n.target_date === date) return true;
    // Multi-day event: date falls within range
    if (n.target_date && n.end_date) {
      return date >= n.target_date && date <= n.end_date;
    }
    return false;
  });

  return {
    todos,
    habits,
    eventNotes,
    reminderNotes,
    calendarEvents,
    userCalendarEvents,
    keyDateEvents,
  };
};
