/**
 * useOverlayDraft — Single source of truth for overlay state
 *
 * Replaces:
 * - ~20 entity-related useStates (reminders, moods, photos, etc.)
 * - fullEntity live Zustand subscription
 * - HYDRATE_EDIT effects
 * - localScheduleSnapshot ref hack
 *
 * Principles:
 * - Draft is a SNAPSHOT taken on open(), not a live subscription
 * - All field updates are direct immer mutations, no dispatch ceremony
 * - Schedule/reminder updates are atomic (one immer pass, no cascade)
 * - open() does one-shot hydration, no effects needed
 * - commit() calls draftToPayload() → Zustand mutations → Supabase
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Mood } from '../../lib/shared/moods';
import type { ItemReminder, AppRecord } from '../../lib/types';
import type { ListItem } from '../../lib/lists';
import { getDateService } from '../../lib/date';
import { classifyLogKind } from './overlayV2.state';
import type {
  BaseType,
  TagKey,
  LogKind,
  LogState,
  TodoState,
  HabitState,
  FormatKind,
  PersonLink,
  SentimentValue,
  LogSubtypeOverride,
} from './overlayV2.state';
import { initialV2State } from './overlayV2.state';

// ─── Photo type (matches existing LogPhoto) ───────────────────────────────
export interface DraftPhoto {
  id?: string;
  url: string;
  position: number;
  isNew: boolean;
  isDeleted: boolean;
}

// ─── The draft shape ──────────────────────────────────────────────────────
// This is V2State + all the entity-related useStates that previously lived
// outside the reducer. Consolidating them here eliminates the sync bugs.
export interface OverlayDraft {
  // ── Core entity state (was in V2State / useReducer) ──
  baseType: BaseType;
  tags: TagKey[];
  stickyTags: TagKey[];
  tagTombstones: TagKey[];
  mood: SentimentValue | null;
  list: { items: { id: string; text: string; checked: boolean }[] } | null | undefined;
  detected: { mentions: string[]; dates: string[] };
  spaceId: string | null | undefined;
  person: PersonLink;
  format: FormatKind;
  reminderAt: string | null;
  commitment: boolean;
  commitmentNote: string;
  commitmentStartedAt: string | null;
  compactTitle: string;
  compactTitleSource: string;
  userEditedTitle: boolean;
  log: LogState;
  todo: TodoState;
  habit: HabitState;
  logSubtypeOverride: LogSubtypeOverride;
  logIsPrivate: boolean;
  isChecklistMode: boolean;
  linkedEventId: string | null;

  // ── Entity data that was in separate useStates ──
  itemReminders: ItemReminder[];
  moods: Mood[]; // multi-select for journals
  photos: DraftPhoto[];
  photoUri: string | null; // legacy single photo
  isFavorite: boolean;
  checklistItems: ListItem[] | null;
  chatNotes: any[]; // saved notes from entity chat

  // ── Tracking flags ──
  tagsDirty: boolean;
  userClearedChecklist: boolean;

  // ── Snapshot of the original entity (for cross-table conversion detection) ──
  originalEntity: AppRecord | null;
  originalEntityType: string | null;
  originalSpaceId: string | null;
}

// ─── UI-only state (modal visibility, transient flags) ────────────────────
export interface OverlayUI {
  saving: boolean;
  saveError: string | null;

  // Modal visibility
  showDateModal: boolean;
  showTimeEstimateModal: boolean;
  showTimeWindowModal: boolean;
  showHabitStartDatePicker: boolean;
  showHabitEndDatePicker: boolean;
  showSpaceModal: boolean;
  showWorldsModal: boolean;
  showRemindersModal: boolean;
  showScheduleModal: boolean;
  showEntityChat: boolean;
  showNotesModal: boolean;
  showTodoPreview: boolean;
  showImageModal: boolean;
  showClarificationPopup: boolean;

  // Date modal internals (will move into DatePickerModal in Phase 3)
  dateModalTarget:
    | 'todo_deadline'
    | 'todo_dodate'
    | 'note_event'
    | 'note_end_date'
    | 'reminder'
    | 'todo_time'
    | 'event_time'
    | null;
  selectedDate: Date;
  selectedTime: Date;
  showTimePicker: boolean;
  clearDateFlag: boolean;
  selectedTimePreset: string | null;
  showCustomTimePicker: boolean;

  // Other transient UI
  timeEstimateValue: number;
  displayMode: 'view' | 'edit';
  isExpandedEditor: boolean;
  isPreviewMode: boolean;
  moodPickerExpanded: boolean;
  bodyFocused: boolean;
  commitmentFocused: boolean;
  showSaveToast: boolean;
  dueToastMessage: string | null;
  showUndoToast: boolean;
  clarificationLoading: boolean;
  clarificationSuccess: string | null;
  isResuggestingTags: boolean;
  isResummarizingTitle: boolean;
  isCreatingTodos: boolean;
  keyboardHeight: number;
}

// ─── Initial values ───────────────────────────────────────────────────────

const INITIAL_DRAFT: OverlayDraft = {
  ...initialV2State,
  list: initialV2State.list ?? null,
  mood: null,
  itemReminders: [],
  moods: [],
  photos: [],
  photoUri: null,
  isFavorite: false,
  checklistItems: null,
  chatNotes: [],
  tagsDirty: false,
  userClearedChecklist: false,
  originalEntity: null,
  originalEntityType: null,
  originalSpaceId: null,
};

const INITIAL_UI: OverlayUI = {
  saving: false,
  saveError: null,
  showDateModal: false,
  showTimeEstimateModal: false,
  showTimeWindowModal: false,
  showHabitStartDatePicker: false,
  showHabitEndDatePicker: false,
  showSpaceModal: false,
  showWorldsModal: false,
  showRemindersModal: false,
  showScheduleModal: false,
  showEntityChat: false,
  showNotesModal: false,
  showTodoPreview: false,
  showImageModal: false,
  showClarificationPopup: false,
  dateModalTarget: null,
  selectedDate: getDateService().now(),
  selectedTime: getDateService().now(),
  showTimePicker: false,
  clearDateFlag: false,
  selectedTimePreset: null,
  showCustomTimePicker: false,
  timeEstimateValue: 30,
  displayMode: 'edit',
  isExpandedEditor: false,
  isPreviewMode: false,
  moodPickerExpanded: false,
  bodyFocused: false,
  commitmentFocused: false,
  showSaveToast: false,
  dueToastMessage: null,
  showUndoToast: false,
  clarificationLoading: false,
  clarificationSuccess: null,
  isResuggestingTags: false,
  isResummarizingTitle: false,
  isCreatingTodos: false,
  keyboardHeight: 0,
};

// ─── Store interface ──────────────────────────────────────────────────────

interface OverlayDraftStore {
  draft: OverlayDraft | null;
  ui: OverlayUI;
  mode: 'closed' | 'create' | 'edit' | 'view';

  // ── Lifecycle ──
  open: (params: {
    entity: AppRecord | null;
    mode: 'create' | 'edit' | 'view';
    initialSpaceId?: string | null;
    hydrate: (entity: AppRecord | null) => Partial<OverlayDraft>;
  }) => void;
  discard: () => void;

  // ── Draft field setters (immer mutations) ──
  setBaseType: (type: BaseType) => void;
  setTitle: (title: string) => void;
  setBody: (text: string) => void;
  setTags: (tags: TagKey[]) => void;
  addTag: (tag: TagKey) => void;
  removeTag: (tag: TagKey) => void;
  setTagsDirty: () => void;
  setSpaceId: (id: string | null) => void;
  setMood: (mood: SentimentValue | null) => void;
  setMoods: (moods: Mood[]) => void;
  setFormat: (fmt: FormatKind) => void;
  setReminderAt: (when: string | null) => void;
  setItemReminders: (reminders: ItemReminder[]) => void;
  setCommitment: (on: boolean) => void;
  setCommitmentNote: (note: string) => void;
  setLogSubtypeOverride: (value: LogSubtypeOverride) => void;
  setLogIsPrivate: (value: boolean) => void;
  setChecklistMode: (enabled: boolean) => void;
  setLinkedEventId: (id: string | null) => void;
  setPerson: (person: PersonLink) => void;
  setCompactTitle: (title: string) => void;
  setPhotos: (photos: DraftPhoto[]) => void;
  setPhotoUri: (uri: string | null) => void;
  setFavorite: (fav: boolean) => void;
  setChecklistItems: (items: OverlayDraft['checklistItems']) => void;
  setUserClearedChecklist: (cleared: boolean) => void;

  // ── Todo-specific setters ──
  setTodoDue: (fields: Partial<Pick<TodoState, 'due_at' | 'due_day' | 'due_time'>>) => void;
  setTodoTimeEstimate: (minutes: number | null) => void;
  setTodoTimeWindow: (window: TodoState['time_window']) => void;
  setTodoTargetDate: (date: string | null) => void;
  setTodoScheduledDate: (date: string | null) => void;

  // ── Habit-specific setters ──
  setHabitFrequency: (json: any) => void;
  setHabitSubtype: (subtype: HabitState['subtype']) => void;
  setHabitStartDate: (date: string | null) => void;
  setHabitEndDate: (date: string | null) => void;
  setHabitTimeWindow: (window: HabitState['time_window']) => void;
  setHabitTimeEstimate: (minutes: number | null) => void;

  // ── Log-specific setters ──
  setLogTargetDate: (date: string | null) => void;
  setLogEndDate: (date: string | null) => void;
  setLogEventTime: (time: string | null) => void;

  // ── Atomic schedule update (fixes Bug #3) ──
  applySchedule: (changes: {
    // Todo fields
    scheduledDate?: string | null;
    targetDate?: string | null;
    dueDay?: string | null;
    dueTime?: string | null;
    timeWindow?: TodoState['time_window'];
    timeEstimateMinutes?: number | null;
    // Habit fields
    frequencyJson?: any;
    schedule?: HabitState['schedule'];
    startDate?: string | null;
    endDate?: string | null;
  }) => void;

  // ── UI setters ──
  setUI: (patch: Partial<OverlayUI>) => void;
  toggleUI: (key: keyof OverlayUI) => void;
  resetUI: () => void;

  // ── Generic patch (for undo restore) ──
  patchDraft: (partial: Partial<OverlayDraft>) => void;
}

// ─── Store implementation ─────────────────────────────────────────────────

export const useOverlayDraft = create<OverlayDraftStore>()(
  immer((set, get) => ({
    draft: null,
    ui: { ...INITIAL_UI },
    mode: 'closed' as const,

    // ── Lifecycle ──────────────────────────────────────────────────────

    open: ({ entity, mode, initialSpaceId, hydrate }) => {
      set((s) => {
        const hydrated = hydrate(entity);
        s.draft = {
          ...INITIAL_DRAFT,
          ...hydrated,
          originalEntity: entity,
          originalEntityType: entity?.type ?? null,
          originalSpaceId: initialSpaceId ?? (entity as any)?.space_id ?? null,
        };
        s.mode = mode;
        s.ui = {
          ...INITIAL_UI,
          displayMode: mode === 'view' ? 'view' : 'edit',
        };
      });
    },

    discard: () => {
      set((s) => {
        s.draft = null;
        s.mode = 'closed';
        s.ui = { ...INITIAL_UI };
      });
    },

    // ── Draft field setters ────────────────────────────────────────────

    setBaseType: (type) =>
      set((s) => {
        if (!s.draft || s.draft.baseType === type) return;
        const prev = s.draft.baseType;
        const currentText =
          prev === 'log'
            ? s.draft.log.body
            : prev === 'todo'
              ? s.draft.todo.details
              : s.draft.habit.notes;

        s.draft.baseType = type;

        // Copy text to new type if target field is empty
        if (type === 'log' && !s.draft.log.body) {
          s.draft.log.body = currentText;
          s.draft.log.kind = classifyLogKind(currentText);
        } else if (type === 'todo' && !s.draft.todo.details) {
          s.draft.todo.details = currentText;
        } else if (type === 'habit' && !s.draft.habit.notes) {
          s.draft.habit.notes = currentText;
        }

        // Copy user-edited title to new type
        if (s.draft.userEditedTitle && s.draft.compactTitle) {
          if (type === 'todo') s.draft.todo.title = s.draft.compactTitle;
          else if (type === 'habit') s.draft.habit.title = s.draft.compactTitle;
          else if (type === 'log') s.draft.log.title = s.draft.compactTitle;
        }
      }),

    setTitle: (title) =>
      set((s) => {
        if (!s.draft) return;
        s.draft.compactTitle = title;
        s.draft.userEditedTitle = true;
        // Sync to entity-specific title
        if (s.draft.baseType === 'todo') s.draft.todo.title = title;
        else if (s.draft.baseType === 'habit') s.draft.habit.title = title;
        else s.draft.log.title = title;
      }),

    setBody: (text) =>
      set((s) => {
        if (!s.draft) return;
        if (s.draft.baseType === 'log') {
          s.draft.log.body = text;
          s.draft.log.kind = classifyLogKind(text);
        } else if (s.draft.baseType === 'todo') {
          s.draft.todo.details = text;
        } else {
          s.draft.habit.notes = text;
        }
      }),

    setTags: (tags) =>
      set((s) => {
        if (!s.draft) return;
        s.draft.tags = Array.from(new Set(tags));
        s.draft.tagsDirty = true;
      }),

    addTag: (tag) =>
      set((s) => {
        if (!s.draft || s.draft.tags.includes(tag)) return;
        s.draft.tags.push(tag);
        s.draft.tagsDirty = true;
      }),

    removeTag: (tag) =>
      set((s) => {
        if (!s.draft) return;
        s.draft.tags = s.draft.tags.filter((t) => t !== tag);
        s.draft.tagsDirty = true;
      }),

    setTagsDirty: () =>
      set((s) => {
        if (s.draft) s.draft.tagsDirty = true;
      }),

    setSpaceId: (id) =>
      set((s) => {
        if (s.draft) s.draft.spaceId = id;
      }),
    setMood: (mood) =>
      set((s) => {
        if (s.draft) s.draft.mood = mood;
      }),
    setMoods: (moods) =>
      set((s) => {
        if (s.draft) s.draft.moods = moods;
      }),
    setFormat: (fmt) =>
      set((s) => {
        if (s.draft) s.draft.format = fmt;
      }),
    setReminderAt: (when) =>
      set((s) => {
        if (s.draft) s.draft.reminderAt = when;
      }),
    setItemReminders: (reminders) =>
      set((s) => {
        if (s.draft) s.draft.itemReminders = reminders;
      }),

    setCommitment: (on) =>
      set((s) => {
        if (!s.draft) return;
        s.draft.commitment = on;
        if (on && !s.draft.commitmentStartedAt) {
          s.draft.commitmentStartedAt = getDateService().now().toISOString();
        }
      }),

    setCommitmentNote: (note) =>
      set((s) => {
        if (s.draft) s.draft.commitmentNote = note;
      }),
    setLogSubtypeOverride: (value) =>
      set((s) => {
        if (s.draft) s.draft.logSubtypeOverride = value;
      }),
    setLogIsPrivate: (value) =>
      set((s) => {
        if (s.draft) s.draft.logIsPrivate = value;
      }),
    setChecklistMode: (enabled) =>
      set((s) => {
        if (s.draft) s.draft.isChecklistMode = enabled;
      }),
    setLinkedEventId: (id) =>
      set((s) => {
        if (s.draft) s.draft.linkedEventId = id;
      }),
    setPerson: (person) =>
      set((s) => {
        if (s.draft) s.draft.person = person;
      }),

    setCompactTitle: (title) =>
      set((s) => {
        if (!s.draft) return;
        s.draft.compactTitle = title;
        s.draft.compactTitleSource = title;
        s.draft.userEditedTitle = true;
        // Sync to entity-specific title field
        if (s.draft.baseType === 'todo') s.draft.todo.title = title;
        else if (s.draft.baseType === 'habit') s.draft.habit.title = title;
        else if (s.draft.baseType === 'log') s.draft.log.title = title;
      }),

    setPhotos: (photos) =>
      set((s) => {
        if (s.draft) s.draft.photos = photos;
      }),
    setPhotoUri: (uri) =>
      set((s) => {
        if (s.draft) s.draft.photoUri = uri;
      }),
    setFavorite: (fav) =>
      set((s) => {
        if (s.draft) s.draft.isFavorite = fav;
      }),
    setChecklistItems: (items) =>
      set((s) => {
        if (s.draft) s.draft.checklistItems = items;
      }),
    setUserClearedChecklist: (cleared) =>
      set((s) => {
        if (s.draft) s.draft.userClearedChecklist = cleared;
      }),

    // ── Todo-specific ─────────────────────────────────────────────────

    setTodoDue: (fields) =>
      set((s) => {
        if (!s.draft) return;
        // Only update provided fields — undefined means "don't touch"
        if (fields.due_at !== undefined) s.draft.todo.due_at = fields.due_at;
        if (fields.due_day !== undefined) s.draft.todo.due_day = fields.due_day;
        if (fields.due_time !== undefined) s.draft.todo.due_time = fields.due_time;
      }),

    setTodoTimeEstimate: (minutes) =>
      set((s) => {
        if (s.draft) s.draft.todo.time_estimate_minutes = minutes;
      }),

    setTodoTimeWindow: (window) =>
      set((s) => {
        if (s.draft) s.draft.todo.time_window = window;
      }),

    setTodoTargetDate: (date) =>
      set((s) => {
        if (s.draft) s.draft.todo.target_date = date;
      }),

    setTodoScheduledDate: (date) =>
      set((s) => {
        if (s.draft) s.draft.todo.scheduled_date = date;
      }),

    // ── Habit-specific ────────────────────────────────────────────────

    setHabitFrequency: (json) =>
      set((s) => {
        if (!s.draft) return;
        s.draft.habit.frequency_json = json;
        // Derive schedule from frequency_json
        if (json?.type === 'simple') {
          const val = json.value;
          s.draft.habit.schedule =
            val === 'daily' ? 'daily' : val === 'weekly' ? 'weekly' : 'custom';
        } else {
          s.draft.habit.schedule = 'custom';
        }
      }),

    setHabitSubtype: (subtype) =>
      set((s) => {
        if (s.draft) s.draft.habit.subtype = subtype;
      }),

    setHabitStartDate: (date) =>
      set((s) => {
        if (s.draft) s.draft.habit.start_date = date;
      }),

    setHabitEndDate: (date) =>
      set((s) => {
        if (s.draft) s.draft.habit.end_date = date;
      }),

    setHabitTimeWindow: (window) =>
      set((s) => {
        if (s.draft) s.draft.habit.time_window = window;
      }),

    setHabitTimeEstimate: (minutes) =>
      set((s) => {
        if (s.draft) s.draft.habit.time_estimate_minutes = minutes;
      }),

    // ── Log-specific ──────────────────────────────────────────────────

    setLogTargetDate: (date) =>
      set((s) => {
        if (s.draft) s.draft.log.target_date = date;
      }),

    setLogEndDate: (date) =>
      set((s) => {
        if (s.draft) s.draft.log.end_date = date;
      }),

    setLogEventTime: (time) =>
      set((s) => {
        if (s.draft) s.draft.log.event_time = time;
      }),

    // ── Atomic schedule update (fixes Bug #3) ─────────────────────────

    applySchedule: (changes) =>
      set((s) => {
        if (!s.draft) return;

        if (s.draft.baseType === 'todo') {
          if (changes.scheduledDate !== undefined)
            s.draft.todo.scheduled_date = changes.scheduledDate;
          if (changes.targetDate !== undefined) s.draft.todo.target_date = changes.targetDate;
          if (changes.dueDay !== undefined) s.draft.todo.due_day = changes.dueDay;
          if (changes.dueTime !== undefined) s.draft.todo.due_time = changes.dueTime;
          if (changes.timeWindow !== undefined) s.draft.todo.time_window = changes.timeWindow;
          if (changes.timeEstimateMinutes !== undefined)
            s.draft.todo.time_estimate_minutes = changes.timeEstimateMinutes;
          // Sync due_day to scheduled_date for backwards compat
          if (changes.dueDay !== undefined) s.draft.todo.due_at = null;
        }

        if (s.draft.baseType === 'habit') {
          if (changes.frequencyJson !== undefined) {
            s.draft.habit.frequency_json = changes.frequencyJson;
            // Derive schedule
            const fj = changes.frequencyJson;
            if (fj?.type === 'simple') {
              s.draft.habit.schedule =
                fj.value === 'daily' ? 'daily' : fj.value === 'weekly' ? 'weekly' : 'custom';
            } else {
              s.draft.habit.schedule = changes.schedule ?? 'custom';
            }
          }
          if (changes.startDate !== undefined) s.draft.habit.start_date = changes.startDate;
          if (changes.endDate !== undefined) s.draft.habit.end_date = changes.endDate;
          if (changes.timeWindow !== undefined) s.draft.habit.time_window = changes.timeWindow;
          if (changes.timeEstimateMinutes !== undefined)
            s.draft.habit.time_estimate_minutes = changes.timeEstimateMinutes;
        }
      }),

    // ── UI setters ────────────────────────────────────────────────────

    setUI: (patch) =>
      set((s) => {
        Object.assign(s.ui, patch);
      }),

    toggleUI: (key) =>
      set((s) => {
        const current = s.ui[key];
        if (typeof current === 'boolean') {
          (s.ui as any)[key] = !current;
        }
      }),

    resetUI: () =>
      set((s) => {
        s.ui = { ...INITIAL_UI };
      }),

    patchDraft: (partial) =>
      set((s) => {
        if (s.draft) Object.assign(s.draft, partial);
      }),
  })),
);

// ─── Selectors (for component reads) ──────────────────────────────────────

export const selectDraft = (s: OverlayDraftStore) => s.draft;
export const selectUI = (s: OverlayDraftStore) => s.ui;
export const selectMode = (s: OverlayDraftStore) => s.mode;
export const selectBaseType = (s: OverlayDraftStore) => s.draft?.baseType ?? 'log';
export const selectIsOpen = (s: OverlayDraftStore) => s.mode !== 'closed';
