/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * UnifiedCreateOverlay - Phase 7 unified create/edit overlay
 * Single overlay for all entity types with type pills, subtypes, and AI freeform mode
 */
/**
 * LEGACY OVERLAY
 * Deprecated in favor of OverlayComponent (V2/V1 gateway).
 * Do not import this directly. Use `@/components/overlay`.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TextInput,
  Pressable,
  Animated,
  ToastAndroid,
  Alert,
  Switch,
  ActionSheetIOS,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../ui/Text';
import { Button } from '../../design-system/Button';
import Chip from '../ui/Chip';
import CommitmentToggleRow from '../CommitmentToggleRow';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { HabitFields, type HabitDetailsState, type BreakHabitState } from './fields/HabitFields';
import { TodoFields } from './fields/TodoFields';
import { JournalFields } from './fields/JournalFields';
import { NoteFields, type NoteDetailsState } from './fields/NoteFields';
import { PersonFields, type PersonDetailsState } from './fields/PersonFields';
import { TagsField } from './fields/TagsField';
import { TagEditor } from './fields/TagEditor';
import { PeopleLinker } from './fields/PeopleLinker';
import { useRepo } from '../../providers/RepoProvider';
import { useCortex } from '../../providers/CortexProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useAuth } from '../../providers/AuthProvider';
import type {
  AppRecord,
  CanonicalType,
  Frequency,
  HabitSubtype,
  LogSubtype,
  NoteSubtype,
} from '../../lib/types';
import type { CreateRecordInput, UpdateRecordInput } from '../../lib/repo/IRepo';
import type { FrequencyValue } from './fields/HabitFrequency';
import type { ReminderRow } from './fields/RemindersList';
import type { ItemType, Tag } from '../../lib/repo/types';
import {
  filterAndNormalizeTags,
  normalizeTags,
  getTagIdentifier,
  recordRemovedTags,
  deriveLogSubtypeFromTags,
} from '../../lib/tags/normalize';
import { deleteEntityOrDrop } from '../../lib/minddrop/deleteHelpers';
import { callClassify, type CallClassifyResult } from '../../lib/cortex/CortexClient';
import { parseDue } from '../../lib/cortex/entities/datetime';
import { usePhase8LinksState } from './hooks/usePhase8LinksState';
import {
  mapHabitToForm,
  mapTodoToForm,
  mapJournalToForm,
  mapNoteToForm,
  mapPersonToForm,
} from './mappers';
import { env, getOptimisticFlag, getMinThinkMs, getBgTimeoutMs, getEnv } from '../../lib/env';
import { emitChatEvent } from '../../app/lib/chat/events';
import { eventBus } from '../../lib/events';
import type { OverlaySavedPayload } from '../../lib/events/overlaySaved';
import { combineDueIso, normalizeTimeInput, splitDueParts } from './dueUtils';
import { canonicalToPersisted } from '../../lib/canonical';
import { kindToDisplayLabel } from '../../lib/ui/kindToDisplayLabel';
import { convertLogListToTodo, convertTodoToLogList, hasChecklist } from '../../lib/conversion';
import { shouldAutoCommit } from '../../lib/commitments/auto';

type EntityType = CanonicalType;
type HydrationState = 'idle' | 'loading' | 'ready' | 'error';

type TypeFamily = 'habit' | 'todo' | 'note';

const capitalize = (value: string): string => {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const CANONICAL_TYPES_ENABLED = env.feature.canonicalTypes;
const NOTE_LABEL = capitalize(kindToDisplayLabel('note', 'journal', CANONICAL_TYPES_ENABLED));
const ENTITY_FAMILY: Record<EntityType, TypeFamily> = {
  habit: 'habit',
  todo: 'todo',
  log: 'note',
  unsorted: 'note',
};

const FRIENDLY_TYPE_LABEL: Record<EntityType, string> = {
  habit: 'Habit',
  todo: 'To-Do',
  log: NOTE_LABEL,
  unsorted: 'Unsorted',
};

const tagListsEqual = (a: Tag[], b: Tag[]): boolean => {
  if (a.length !== b.length) return false;
  const leftIds = new Set(a.map((tag) => tag.id));
  if (leftIds.size !== b.length) return false;
  return b.every((tag) => leftIds.has(tag.id));
};

type AnalyticsClient = {
  track: (event: string, payload?: Record<string, unknown>) => void;
};

const TAG_ANALYTICS_FLAG =
  String(process.env.EXPO_PUBLIC_DEBUG_TAG_ANALYTICS ?? 'off').toLowerCase() === 'on';

const COMMITMENTS_FEATURE_ENABLED = (() => {
  const rawValue = (process.env.EXPO_PUBLIC_FEATURE_COMMITMENTS ?? 'on').toLowerCase();
  return rawValue === 'on' || rawValue === 'true' || rawValue === '1';
})();

const resolveTagType = (tag: string): '@' | '*' | '#' => {
  if (tag.startsWith('@')) return '@';
  if (tag.startsWith('*')) return '*';
  return '#';
};

const resolveAnalyticsClient = (): AnalyticsClient | null => {
  if (!TAG_ANALYTICS_FLAG) {
    return null;
  }

  const candidate = (globalThis as unknown as { analytics?: AnalyticsClient }).analytics;

  if (candidate && typeof candidate.track === 'function') {
    return candidate;
  }

  return null;
};

const COMMITMENT_NOTE_LIMIT = 140;

export type UnifiedCreateOverlayProps = {
  visible: boolean;
  mode: 'create' | 'edit';
  initialEntity?: {
    type: EntityType | 'journal' | 'note' | 'person' | null;
    id?: string;
    logSubtype?: LogSubtype | null;
  };
  initialSpaceId?: string | null; // from scope
  conversionMeta?: {
    origin?: string;
    ai_placed?: boolean;
    why_string?: string | null;
    source_message_id?: string | null;
    // Phase 10.7B: Initial values for prefill
    initialTitle?: string;
    initialNote?: string;
    // Optional: prefill todo due date (ISO yyyy-mm-dd or full ISO)
    initialDueDate?: string | null;
  };
  initialText?: string | null;
  initialLogPhotoUris?: string[]; // Photo Drop: initial photos for create-mode logs
  onClose: () => void;
  onSaved?: (result: OverlaySavedPayload) => void;
  onCommitmentsChanged?: () => void | Promise<void>;
};

type TypeOption = {
  value: EntityType;
  label: string;
  iconName: IconName;
  logSubtype?: LogSubtype;
};

const BASE_TYPE_OPTIONS: TypeOption[] = [
  { value: 'habit', label: 'Habit', iconName: 'Activity' },
  { value: 'todo', label: 'To-Do', iconName: 'CheckCircle2' },
  {
    value: 'log',
    label: NOTE_LABEL,
    iconName: CANONICAL_TYPES_ENABLED ? 'BookOpen' : 'FileText',
  },
  { value: 'unsorted', label: 'Unsorted', iconName: 'Archive' },
];

const TYPE_OPTIONS: TypeOption[] = CANONICAL_TYPES_ENABLED
  ? BASE_TYPE_OPTIONS
  : [
      BASE_TYPE_OPTIONS[0],
      BASE_TYPE_OPTIONS[1],
      BASE_TYPE_OPTIONS[2],
      { value: 'log', label: 'Person', iconName: 'User', logSubtype: 'reference' },
      BASE_TYPE_OPTIONS[3],
    ];

// Star tags now derive log subtype automatically (see deriveLogSubtypeFromTags).
const DEFAULT_LOG_SUBTYPE: LogSubtype | null = null; // plain

const normalizeInitialSelection = (
  initialEntity: UnifiedCreateOverlayProps['initialEntity'],
): { type: EntityType | null; logSubtype: LogSubtype | null } => {
  const fallbackSubtype = initialEntity?.logSubtype ?? DEFAULT_LOG_SUBTYPE;
  const incomingType = initialEntity?.type;

  if (!incomingType) {
    return { type: null, logSubtype: fallbackSubtype };
  }

  switch (incomingType) {
    case 'journal':
      return { type: 'log', logSubtype: 'journal' };
    case 'person':
      return { type: 'log', logSubtype: 'reference' }; // person → reference
    case 'note':
      return { type: 'log', logSubtype: fallbackSubtype };
    default:
      return { type: incomingType as EntityType, logSubtype: fallbackSubtype };
  }
};

const CATCHALL_LABEL = 'catchall';
const UNSORTED_LABEL = 'needs_review';
const ALLOW_TYPE_CHANGE =
  String(process.env.EXPO_PUBLIC_UNIFIED_OVERLAY_ALLOW_TYPE_CHANGE ?? 'on').toLowerCase() !== 'off';

const OVERLAY_DUE_STRIP =
  String(process.env.EXPO_PUBLIC_UNIFIED_OVERLAY_DUE_STRIP ?? 'on').toLowerCase() !== 'off';
const OVERLAY_DUE_CONFIDENCE =
  Number.parseFloat(String(process.env.EXPO_PUBLIC_UNIFIED_OVERLAY_DUE_CONFIDENCE ?? '0.84')) ||
  0.84;

export function UnifiedCreateOverlay({
  visible,
  mode,
  initialEntity,
  initialSpaceId,
  conversionMeta,
  onClose,
  onSaved,
  onCommitmentsChanged,
}: UnifiedCreateOverlayProps) {
  const canonicalConversionsEnabled = env.feature.canonicalConversions;
  const { type: normalizedInitialType, logSubtype: normalizedInitialSubtype } = useMemo(
    () => normalizeInitialSelection(initialEntity),
    [initialEntity],
  );
  const insets = useSafeAreaInsets();
  const repo = useRepo();
  const cortex = useCortex();
  const { theme } = useTheme();
  const { userId } = useAuth();
  const originalTypeRef = useRef<EntityType | null>(null);
  const originalEntityRef = useRef<AppRecord | null>(null);
  const lastLoadedIdRef = useRef<string | null>(null);
  const [persistedEntity, setPersistedEntity] = useState<{
    id: string;
    type: 'habit' | 'todo';
  } | null>(null);

  // Feature flag checks
  const unifiedOverlayFlag = process.env.EXPO_PUBLIC_UNIFIED_OVERLAY;
  const unifiedOverlayEnabled =
    CANONICAL_TYPES_ENABLED ||
    unifiedOverlayFlag === undefined ||
    (unifiedOverlayFlag ?? '').toLowerCase() === 'true' ||
    (unifiedOverlayFlag ?? '').toLowerCase() === 'on';
  const useUnifiedOverlay = unifiedOverlayEnabled || process.env.NODE_ENV === 'test';
  const usePhase8Features = process.env.EXPO_PUBLIC_FEATURE_BUDDY === 'true';

  const aiDisabled = useMemo(() => {
    const raw = (process.env.EXPO_PUBLIC_DISABLE_AI ?? '').toLowerCase();
    return raw === 'on' || raw === 'true';
  }, []);

  const shouldLogTransitions = __DEV__ || process.env.NODE_ENV === 'test';

  // Open-once guard: log only on first mount when visible
  const openedRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      openedRef.current = false;
    }
    if (openedRef.current) return;
    openedRef.current = true;

    // Phase 10.6: Emit overlay opened event
    emitChatEvent({
      type: 'overlay_opened',
      payload: { type: mode || 'unknown' },
    });

    if (__DEV__ || process.env.NODE_ENV === 'test') {
      console.log('[Overlay] open', { useUnifiedOverlay, aiDisabled, mode });
    }
  }, [visible, useUnifiedOverlay, aiDisabled, mode]);

  // State - with robust defaults
  // CRITICAL: Initialize selectedType from initialEntity to avoid null flash
  const [selectedType, setSelectedType] = useState<EntityType | null>(normalizedInitialType);
  const [selectedLogSubtype, setSelectedLogSubtype] = useState<LogSubtype | null>(
    normalizedInitialSubtype,
  );
  const hasSyncedInitialTypeRef = useRef(false);
  const lastHydratedSelectionRef = useRef<{
    id: string | null;
    type: EntityType | null;
    logSubtype: LogSubtype | null;
  } | null>(null);

  const normalizedInitialSelection = useMemo(
    () => ({
      type: normalizedInitialType,
      logSubtype: normalizedInitialType === 'log' ? normalizedInitialSubtype : null,
    }),
    [normalizedInitialSubtype, normalizedInitialType],
  );

  const initialEntityId = initialEntity?.id ?? null;

  const [aiMode, setAiMode] = useState(false); // Explicit AI mode flag
  const [spaceId, setSpaceId] = useState<string | null | undefined>(initialSpaceId);

  useEffect(() => {
    if (selectedType !== 'log' && selectedLogSubtype !== null) {
      setSelectedLogSubtype(null);
    }
  }, [selectedType, selectedLogSubtype]);

  useEffect(() => {
    if (mode === 'edit') {
      originalTypeRef.current = normalizedInitialType ?? null;
    } else {
      originalTypeRef.current = null;
    }
  }, [mode, normalizedInitialType]);

  // Update spaceId when initialSpaceId prop changes
  // CRITICAL: Overlay is persistent, so we need to update state when opened with new spaceId
  if (visible && initialSpaceId !== undefined && spaceId !== initialSpaceId) {
    setSpaceId(initialSpaceId);
  }

  // Helpers: normalize fields for repo insert schemas
  const normalizeSpaceId = useCallback((val: string | null | undefined): string | null => {
    if (typeof val === 'string' && val.trim().length > 0) return val;
    return null;
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false); // Single-flight submit guard
  const [thinking, setThinking] = useState(false); // Thinking state for 1s deliberate UX
  const [cortexInFlight, setCortexInFlight] = useState(false); // Track AI request in-flight
  const [cortexStatus, setCortexStatus] = useState<string | null>(null); // "thinking" | "timeout" | "busy" | null
  const [hydration, setHydration] = useState<HydrationState>('idle');
  const [aiReady, setAiReady] = useState<boolean>(false);
  const aiInitWarnedRef = useRef(false);
  const aiBannerMessage = aiDisabled
    ? 'AI disabled — you can still save.'
    : 'AI temporarily unavailable — you can still save.';
  const showAiBanner = !aiReady || aiDisabled;

  const prevHydrationRef = useRef<HydrationState>(hydration);
  useEffect(() => {
    if (prevHydrationRef.current !== hydration) {
      if (shouldLogTransitions) {
        console.log('[UnifiedOverlay] hydration change', {
          from: prevHydrationRef.current,
          to: hydration,
        });
      }
      prevHydrationRef.current = hydration;
    }
  }, [hydration, shouldLogTransitions]);

  const prevModeRef = useRef<typeof mode>(mode);
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      if (shouldLogTransitions) {
        console.log('[UnifiedOverlay] mode change', {
          from: prevModeRef.current,
          to: mode,
        });
      }
      prevModeRef.current = mode;
    }
  }, [mode, shouldLogTransitions]);

  const prevSelectedTypeRef = useRef<EntityType | null>(selectedType);
  useEffect(() => {
    if (prevSelectedTypeRef.current !== selectedType) {
      if (shouldLogTransitions) {
        console.log('[UnifiedOverlay] selectedType change', {
          from: prevSelectedTypeRef.current,
          to: selectedType,
        });
      }
      prevSelectedTypeRef.current = selectedType;
    }
  }, [selectedType, shouldLogTransitions]);

  const prevInitialEntityIdRef = useRef<string | null>(initialEntityId);
  useEffect(() => {
    if (prevInitialEntityIdRef.current !== initialEntityId) {
      if (shouldLogTransitions) {
        console.log('[UnifiedOverlay] initialEntity change', {
          from: prevInitialEntityIdRef.current,
          to: initialEntityId,
        });
      }
      prevInitialEntityIdRef.current = initialEntityId;
    }
  }, [initialEntityId, shouldLogTransitions]);

  // Animation for subtype chips and fields
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  // Freeform (AI mode)
  const [freeformText, setFreeformText] = useState('');

  // Habit fields
  const [habitName, setHabitName] = useState('');
  const [habitFrequency, setHabitFrequency] = useState<Frequency>('daily');
  const [habitSubtype, setHabitSubtype] = useState<HabitSubtype | null>(null);
  const [habitFrequencyValue, setHabitFrequencyValue] = useState<FrequencyValue>({ kind: 'daily' });
  const [habitReminders, setHabitReminders] = useState<ReminderRow[]>([]);
  const [habitDetails, setHabitDetails] = useState<HabitDetailsState>({});
  const [habitBreakState, setHabitBreakState] = useState<BreakHabitState>({});
  const habitNotes = habitDetails?.notes ?? '';

  // Todo fields
  const [todoName, setTodoName] = useState('');
  const [todoDueDate, setTodoDueDate] = useState<string | null>(null);
  const [todoDueTime, setTodoDueTime] = useState<string | null>(null);
  const [todoDetails, setTodoDetails] = useState<import('./fields/TodoFields').TodoDetailsState>(
    {},
  );
  const todoNotes = todoDetails?.notes ?? '';

  // Commitment state
  const [commitmentEnabled, setCommitmentEnabled] = useState(false);
  const [commitmentBusy, setCommitmentBusy] = useState(false);
  const [commitmentNote, setCommitmentNote] = useState('');
  const [commitmentNoteDraft, setCommitmentNoteDraft] = useState('');
  const [commitmentNoteEditing, setCommitmentNoteEditing] = useState(false);
  const [commitmentNoteBusy, setCommitmentNoteBusy] = useState(false);

  const runCommitmentsChangedCallback = useCallback(() => {
    if (!onCommitmentsChanged) {
      return;
    }

    try {
      const result = onCommitmentsChanged();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>).catch((error) => {
          if (__DEV__) {
            console.warn('[UnifiedCreateOverlay] onCommitmentsChanged rejected', error);
          }
        });
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[UnifiedCreateOverlay] onCommitmentsChanged threw', error);
      }
    }
  }, [onCommitmentsChanged]);

  const emitCommitmentsChanged = useCallback(() => {
    eventBus.emit('CommitmentsChanged', {});
    runCommitmentsChangedCallback();
  }, [runCommitmentsChangedCallback]);

  // Journal fields
  const [journalDate, setJournalDate] = useState(new Date().toISOString().split('T')[0]);
  const [journalEntry, setJournalEntry] = useState('');
  const [journalMood, setJournalMood] = useState<import('./fields/JournalFields').MoodType | null>(
    null,
  );
  const [journalDetails, setJournalDetails] = useState<
    import('./fields/JournalFields').JournalDetailsState
  >({});

  // Note fields
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteDetails, setNoteDetails] = useState<NoteDetailsState>({
    formatting: null,
    spaceId: null,
    tags: [],
  });

  // Person fields
  const [personName, setPersonName] = useState('');
  const [personDetails, setPersonDetails] = useState<PersonDetailsState>({
    email: '',
    dates: [],
    notes: '',
    notesFormatting: null,
    reminders: [],
    spaceId: null,
    tags: [],
  });

  const entityForCommitment = useMemo(() => {
    if (initialEntity?.id && (initialEntity.type === 'habit' || initialEntity.type === 'todo')) {
      return { id: initialEntity.id, type: initialEntity.type as 'habit' | 'todo' };
    }

    return persistedEntity;
  }, [initialEntity, persistedEntity]);

  const canConvertLogListToTodo = useMemo(() => {
    if (mode !== 'edit') return false;
    if (!initialEntity?.id) return false;
    if (selectedType !== 'log' && selectedType !== 'unsorted') return false;
    if (selectedType === 'log' && selectedLogSubtype === 'journal') return false;

    const entity = originalEntityRef.current;
    if (!entity || entity.type !== 'note') return false;

    const bodyFromState = noteBody && noteBody.trim().length > 0 ? noteBody : (entity.body ?? '');
    if (!bodyFromState) return false;

    return hasChecklist(bodyFromState);
  }, [mode, initialEntity?.id, selectedType, selectedLogSubtype, noteBody]);

  const canConvertTodoToLogList = useMemo(() => {
    if (mode !== 'edit') return false;
    if (!initialEntity?.id) return false;
    if (selectedType !== 'todo') return false;

    const entity = originalEntityRef.current;
    if (!entity || entity.type !== 'todo') return false;

    const candidateSource =
      todoNotes && todoNotes.trim().length > 0 ? todoNotes : (entity.body ?? entity.notes ?? '');

    if (!candidateSource) return false;

    return hasChecklist(candidateSource);
  }, [mode, initialEntity?.id, selectedType, todoNotes]);

  const hasOverflowActions =
    canonicalConversionsEnabled && (canConvertLogListToTodo || canConvertTodoToLogList);

  // Phase 8: Tags and People linking state
  const getItemType = (): ItemType | null => {
    if (!selectedType) return null;

    switch (selectedType) {
      case 'habit':
      case 'todo':
        return selectedType;
      case 'log':
        if ((selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE) === 'journal') {
          return 'journal';
        }
        if ((selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE) === 'person') {
          return null;
        }
        return 'note';
      case 'unsorted':
        return 'catchall';
      default:
        return 'note';
    }
  };

  const phase8Links = usePhase8LinksState(
    repo,
    userId || '',
    mode === 'edit' ? initialEntity?.id || null : null,
    getItemType(),
  );

  const removedTagsRef = useRef<Set<string>>(new Set());
  const [tagsState, setTagsState] = useState<string[]>([]);
  const latestTagsRef = useRef<string[]>([]);
  const [tagEditorTags, setTagEditorTags] = useState<Tag[]>([]);
  const tagEditorTagNames = useMemo(
    () => normalizeTags(tagEditorTags.map((tag) => tag?.name ?? '')),
    [tagEditorTags],
  );

  const analyticsClient = useMemo(() => resolveAnalyticsClient(), []);

  const trackTagAnalytics = useCallback(
    (previous: string[] | null | undefined, next: string[] | null | undefined) => {
      if (!analyticsClient) {
        return;
      }

      const previousNormalized = normalizeTags(previous ?? []);
      const nextNormalized = normalizeTags(next ?? []);

      const previousMap = new Map(previousNormalized.map((tag) => [getTagIdentifier(tag), tag]));
      const nextMap = new Map(nextNormalized.map((tag) => [getTagIdentifier(tag), tag]));

      let hasChanges = false;

      nextMap.forEach((tag, key) => {
        if (!previousMap.has(key)) {
          hasChanges = true;
          try {
            analyticsClient.track('tag_added', {
              origin: 'overlay',
              tag_type: resolveTagType(tag),
            });
          } catch {
            // No-op on analytics errors.
          }
        }
      });

      previousMap.forEach((tag, key) => {
        if (!nextMap.has(key)) {
          hasChanges = true;
          try {
            analyticsClient.track('tag_removed', {
              origin: 'overlay',
              tag_type: resolveTagType(tag),
            });
          } catch {
            // No-op on analytics errors.
          }
        }
      });

      // Avoid retaining pointless references when there is no diff.
      if (!hasChanges) {
        return;
      }
    },
    [analyticsClient],
  );

  const applyTagsChange = useCallback(
    (previous: string[] | null | undefined, incoming: string[]): string[] => {
      const next = recordRemovedTags(removedTagsRef.current, previous, incoming);
      trackTagAnalytics(previous, next);
      return next;
    },
    [trackTagAnalytics],
  );

  const syncDetailsWithTags = useCallback(
    (next: string[], typeOverride?: EntityType | null, logSubtypeOverride?: LogSubtype | null) => {
      const activeType = typeOverride ?? selectedType;

      switch (activeType) {
        case 'habit':
          setHabitDetails((prev) => ({ ...prev, tags: next }));
          break;
        case 'todo':
          setTodoDetails((prev) => ({ ...prev, tags: next }));
          break;
        case 'log': {
          const subtype = logSubtypeOverride ?? selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE;
          if (subtype === 'journal') {
            setJournalDetails((prev) => ({ ...prev, tags: next }));
          } else if (subtype === 'person') {
            setPersonDetails((prev) => ({ ...prev, tags: next }));
          } else {
            setNoteDetails((prev) => ({ ...prev, tags: next }));
          }
          break;
        }
        case 'unsorted':
          setNoteDetails((prev) => ({ ...prev, tags: next }));
          break;
        default:
          break;
      }
    },
    [selectedLogSubtype, selectedType],
  );

  const initializeTags = useCallback(
    (
      incoming: string[] | null | undefined,
      typeOverride?: EntityType | null,
      logSubtypeOverride?: LogSubtype | null,
    ) => {
      removedTagsRef.current.clear();
      const normalized = normalizeTags(incoming ?? []);
      setTagsState(normalized);
      syncDetailsWithTags(normalized, typeOverride, logSubtypeOverride);
    },
    [syncDetailsWithTags],
  );

  const handleTagsChange = useCallback(
    (incoming: string[]) => {
      setTagsState((prev) => {
        const next = applyTagsChange(prev, incoming);
        syncDetailsWithTags(next);
        return next;
      });
    },
    [applyTagsChange, syncDetailsWithTags],
  );

  const combineTags = useCallback((): string[] | null => {
    const combined = normalizeTags([...tagsState, ...tagEditorTagNames]);
    const filtered = combined.filter((tag) => !removedTagsRef.current.has(tag.toLowerCase()));
    return filtered.length > 0 ? filtered : null;
  }, [tagEditorTagNames, tagsState]);

  const derivedLogSubtype = selectedType === 'log' ? deriveLogSubtypeFromTags(tagsState) : null;
  const effectiveLogSubtype =
    derivedLogSubtype && derivedLogSubtype !== 'everything_else' ? derivedLogSubtype : null;

  useEffect(() => {
    latestTagsRef.current = tagsState;
  }, [tagsState]);

  useEffect(() => {
    if (!selectedType) {
      return;
    }

    syncDetailsWithTags(latestTagsRef.current);
  }, [selectedLogSubtype, selectedType, syncDetailsWithTags]);

  useEffect(() => {
    if (!usePhase8Features) return;
    if (tagListsEqual(tagEditorTags, phase8Links.currentTags)) return;
    setTagEditorTags(phase8Links.currentTags);
  }, [phase8Links.currentTags, tagEditorTags, usePhase8Features]);

  const isLogPerson =
    selectedType === 'log' && (selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE) === 'person';
  const allowPeopleLinking = usePhase8Features && !isLogPerson;
  const isEditingPerson =
    mode === 'edit' &&
    (initialEntity?.type === 'person' ||
      (initialEntity?.type === 'log' &&
        (initialEntity?.logSubtype ?? normalizedInitialSubtype ?? DEFAULT_LOG_SUBTYPE) ===
          'person'));

  useEffect(() => {
    if (!visible) return;
    if (mode !== 'edit') return;
    if (selectedType !== 'log') return;
    if ((selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE) === 'person') return;

    const entity = originalEntityRef.current;
    if (!entity || entity.type !== 'note') return;
    if (entity.subtype !== 'catchall') return;
    if (phase8Links.linkedPeople.length === 0) return;

    setSelectedLogSubtype('person');
  }, [visible, mode, selectedType, selectedLogSubtype, phase8Links.linkedPeople]);

  // Validation logic
  const getValidationState = (): { isValid: boolean; hint: string | null } => {
    // AI mode - just need some text
    if (aiMode) {
      if (!freeformText.trim()) {
        return { isValid: false, hint: null }; // No hint for freeform
      }
      return { isValid: true, hint: null };
    }

    // Type-specific validation
    switch (selectedType) {
      case 'habit': {
        const isStartHabit = habitSubtype === 'start_habit';

        if (!habitName.trim()) {
          return { isValid: false, hint: 'Name required' };
        }

        if (isStartHabit && !habitFrequency) {
          return { isValid: false, hint: 'Frequency required for Start Habit' };
        }

        return { isValid: true, hint: null };
      }
      case 'todo':
        if (!todoName.trim()) {
          return { isValid: false, hint: 'Name required' };
        }
        if (!todoDueDate) {
          return { isValid: false, hint: 'Due date required' };
        }
        return { isValid: true, hint: null };
      case 'log': {
        const subtype = selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE;

        if (subtype === 'journal') {
          if (!journalDate.trim()) {
            return { isValid: false, hint: 'Date required' };
          }
          if (!journalEntry.trim()) {
            return { isValid: false, hint: 'Entry required' };
          }
          if (!journalMood) {
            return { isValid: false, hint: 'Mood required' };
          }
          return { isValid: true, hint: null };
        }

        if (subtype === 'person') {
          if (!personName.trim()) {
            return { isValid: false, hint: 'Name required' };
          }
          return { isValid: true, hint: null };
        }

        if (!noteBody.trim()) {
          return { isValid: false, hint: 'Body required' };
        }
        return { isValid: true, hint: null };
      }
      case 'unsorted':
        if (!noteBody.trim()) {
          return { isValid: false, hint: 'Body required' };
        }
        return { isValid: true, hint: null };
      default:
        return { isValid: false, hint: null };
    }
  };

  const validation = getValidationState();
  const typePillsDisabled = mode === 'edit' ? !ALLOW_TYPE_CHANGE : false;

  // Helper to show success toast cross-platform
  const showToast = useCallback((message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      Alert.alert('Success', message);
    }
  }, []);

  const showErrorToast = useCallback((message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      Alert.alert('Heads up', message);
    }
  }, []);

  const loadEntity = React.useCallback(
    async (
      id: string,
      type: EntityType,
      logSubtype: LogSubtype | null,
      originalType?: NonNullable<UnifiedCreateOverlayProps['initialEntity']>['type'],
    ) => {
      try {
        setHydration('loading');

        const treatAsPerson =
          originalType === 'person' ||
          (type === 'log' && (logSubtype ?? DEFAULT_LOG_SUBTYPE) === 'person');

        if (treatAsPerson) {
          try {
            const people = await repo.listPeople();
            const person = people.find((p) => p.id === id);

            if (!person) {
              setHydration('error');
              return;
            }

            const formData = mapPersonToForm(person);
            setPersonName(formData.name);
            setPersonDetails(formData.details);
            setSelectedType('log');
            setSelectedLogSubtype('person');
            initializeTags(formData.details.tags ?? [], 'log', 'person');
            originalEntityRef.current = null;
            setCommitmentEnabled(false);
            setCommitmentBusy(false);
            setCommitmentNote('');
            setCommitmentNoteDraft('');
            setCommitmentNoteEditing(false);
            setCommitmentNoteBusy(false);
            setHydration('ready');
            return;
          } catch (error) {
            console.error('[UnifiedCreateOverlay] Failed to load person:', error);
            setHydration('error');
            return;
          }
        }

        const entity = await repo.getById(id);
        if (!entity) {
          setHydration('error');
          return;
        }
        originalEntityRef.current = entity;

        // Map based on entity type
        switch (entity.type) {
          case 'habit': {
            const formData = mapHabitToForm(entity);
            setHabitName(formData.name);
            setHabitFrequency(formData.frequency as Frequency);
            setHabitFrequencyValue(formData.frequencyValue);
            setHabitSubtype(formData.subtype);
            setHabitReminders(formData.reminders);
            setHabitDetails(formData.details);
            setHabitBreakState(formData.breakState);
            setSelectedType('habit');
            initializeTags(formData.details.tags ?? [], 'habit');
            if (COMMITMENTS_FEATURE_ENABLED) {
              setCommitmentEnabled(Boolean(entity.commitment && !entity.commitment_archived_at));
              setCommitmentNote(entity.commitment_note ?? '');
              setCommitmentNoteDraft(entity.commitment_note ?? '');
            } else {
              setCommitmentEnabled(false);
              setCommitmentNote('');
              setCommitmentNoteDraft('');
            }
            setCommitmentBusy(false);
            setCommitmentNoteEditing(false);
            setCommitmentNoteBusy(false);
            break;
          }
          case 'todo': {
            const formData = mapTodoToForm(entity);
            setTodoName(formData.name);
            setTodoDueDate(formData.dueDate);
            setTodoDueTime(formData.dueTime);
            setTodoDetails(formData.details);
            setSelectedType('todo');
            initializeTags(formData.details.tags ?? [], 'todo');
            if (COMMITMENTS_FEATURE_ENABLED) {
              setCommitmentEnabled(Boolean(entity.commitment && !entity.commitment_archived_at));
              setCommitmentNote(entity.commitment_note ?? '');
              setCommitmentNoteDraft(entity.commitment_note ?? '');
            } else {
              setCommitmentEnabled(false);
              setCommitmentNote('');
              setCommitmentNoteDraft('');
            }
            setCommitmentBusy(false);
            setCommitmentNoteEditing(false);
            setCommitmentNoteBusy(false);
            break;
          }
          case 'note': {
            const labels = Array.isArray(entity.labels) ? entity.labels : [];
            const isUnsorted = labels.includes(UNSORTED_LABEL);
            setCommitmentEnabled(false);
            setCommitmentBusy(false);
            setCommitmentNote('');
            setCommitmentNoteDraft('');
            setCommitmentNoteEditing(false);
            setCommitmentNoteBusy(false);
            if (entity.subtype === 'journal') {
              const formData = mapJournalToForm(entity);
              setJournalDate(formData.date);
              setJournalEntry(formData.entry);
              setJournalMood(formData.mood);
              setJournalDetails(formData.details);
              setSelectedType('log');
              setSelectedLogSubtype('journal');
              initializeTags(formData.details.tags ?? [], 'log', 'journal');
            } else {
              const formData = mapNoteToForm(entity);
              setNoteTitle(formData.title);
              setNoteBody(formData.body);
              setNoteDetails(formData.details);

              if (isUnsorted) {
                setSelectedType('unsorted');
                setSelectedLogSubtype(null);
                initializeTags(formData.details.tags ?? [], 'unsorted');
              } else {
                const inferredSubtype: LogSubtype = (() => {
                  switch (entity.subtype) {
                    case 'idea':
                      return 'idea';
                    case 'list':
                      return 'list';
                    default:
                      return 'everything_else';
                  }
                })();
                setSelectedType('log');
                setSelectedLogSubtype(inferredSubtype);
                initializeTags(formData.details.tags ?? [], 'log', inferredSubtype);
              }
            }
            break;
          }
        }

        setHydration('ready');
      } catch (error) {
        console.error('[UnifiedCreateOverlay] Failed to load entity:', error);
        setHydration('error');
      }
    },
    [initializeTags, repo],
  );

  // Initialize from initialEntity in edit mode
  useEffect(() => {
    if (!visible) {
      // Reset hydration when overlay closes
      setHydration('idle');
      originalEntityRef.current = null;
      lastLoadedIdRef.current = null;
      hasSyncedInitialTypeRef.current = false;
      lastHydratedSelectionRef.current = null;
      return;
    }

    if (mode === 'edit' && initialEntity && initialEntity.type) {
      // Only enforce the initial type while hydrating; once ready, respect user changes
      if (
        hydration !== 'ready' &&
        (selectedType !== normalizedInitialType ||
          (normalizedInitialSelection.type === 'log'
            ? selectedLogSubtype !== normalizedInitialSelection.logSubtype
            : selectedLogSubtype !== null))
      ) {
        setSelectedType(normalizedInitialType);
        if (normalizedInitialSelection.type === 'log') {
          setSelectedLogSubtype(normalizedInitialSelection.logSubtype ?? DEFAULT_LOG_SUBTYPE);
        } else {
          setSelectedLogSubtype(null);
        }
      }
      setAiMode(false); // No AI mode in edit

      // Load entity data
      if (initialEntity.id) {
        const needsLoad = initialEntity.id !== lastLoadedIdRef.current || hydration === 'idle';

        if (needsLoad && normalizedInitialType) {
          hasSyncedInitialTypeRef.current = false;
          lastLoadedIdRef.current = initialEntity.id;
          loadEntity(
            initialEntity.id,
            normalizedInitialType,
            normalizedInitialSubtype,
            initialEntity.type ?? undefined,
          );
        }
      } else {
        setHydration('ready'); // No ID means ready immediately
      }
    } else if (mode === 'create') {
      // Create mode - immediately ready
      setHydration('ready');
      // Type should already be set from useState initializer, but ensure it's set
      if (
        initialEntity?.type &&
        hydration !== 'ready' &&
        !hasSyncedInitialTypeRef.current &&
        normalizedInitialType !== null
      ) {
        hasSyncedInitialTypeRef.current = true;
        setSelectedType(normalizedInitialType);
        if (normalizedInitialSelection.type === 'log') {
          setSelectedLogSubtype(normalizedInitialSelection.logSubtype ?? DEFAULT_LOG_SUBTYPE);
        } else {
          setSelectedLogSubtype(null);
        }
      }
      // Animate fields in when type is auto-selected
      if (initialEntity?.type) {
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
    }
  }, [
    visible,
    mode,
    initialEntity,
    loadEntity,
    selectedType,
    selectedLogSubtype,
    fadeAnim,
    hydration,
    normalizedInitialSelection.logSubtype,
    normalizedInitialSelection.type,
    normalizedInitialSubtype,
    normalizedInitialType,
  ]);

  useEffect(() => {
    if (mode !== 'edit') return;
    if (hydration !== 'ready') return;
    if (!initialEntity?.id) return;

    const derivedType = normalizedInitialSelection.type;
    const derivedLogSubtype = normalizedInitialSelection.logSubtype;

    if (!derivedType) return;

    const lastSelection = lastHydratedSelectionRef.current;
    const hasSelectionChanged =
      !lastSelection ||
      lastSelection.id !== initialEntity.id ||
      lastSelection.type !== derivedType ||
      lastSelection.logSubtype !== (derivedLogSubtype ?? null);

    if (!hasSelectionChanged) {
      return;
    }

    lastHydratedSelectionRef.current = {
      id: initialEntity.id,
      type: derivedType,
      logSubtype: derivedLogSubtype ?? null,
    };

    if (selectedType !== derivedType) {
      setSelectedType(derivedType);
    }

    if (derivedType !== 'log') {
      if (selectedLogSubtype !== null) {
        setSelectedLogSubtype(null);
      }
      return;
    }

    const nextLogSubtype = derivedLogSubtype ?? DEFAULT_LOG_SUBTYPE;
    if (selectedLogSubtype !== nextLogSubtype) {
      setSelectedLogSubtype(nextLogSubtype);
    }
  }, [
    hydration,
    initialEntity?.id,
    mode,
    normalizedInitialSelection.logSubtype,
    normalizedInitialSelection.type,
    selectedLogSubtype,
    selectedType,
  ]);

  // Phase 10.7C: Prefill from conversionMeta
  useEffect(() => {
    if (!visible || !conversionMeta) return;

    const { initialTitle, initialNote, initialDueDate } = conversionMeta;
    const hasPrefill = !!initialTitle || !!initialNote || !!initialDueDate;

    if (selectedType === 'todo') {
      const metaDueParts = splitDueParts(initialDueDate ?? null, null);
      setTodoDueDate(metaDueParts.date);
      setTodoDueTime(metaDueParts.time);

      if (initialTitle) {
        const parsed = parseDue(initialTitle);
        const hasParsedDue = parsed && parsed.confidence >= OVERLAY_DUE_CONFIDENCE;

        if (hasParsedDue) {
          if (!metaDueParts.date) {
            setTodoDueDate(parsed.date);
          }
          if (!metaDueParts.time && parsed.time) {
            setTodoDueTime(parsed.time);
          }
        }

        const nextName =
          hasParsedDue && OVERLAY_DUE_STRIP
            ? parsed?.textWithoutWhen.trim() || initialTitle
            : initialTitle;
        setTodoName(nextName);
      }
    } else if (initialTitle) {
      if (selectedType === 'habit') {
        setHabitName(initialTitle);
      } else if (
        (selectedType === 'log' && (selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE) !== 'journal') ||
        selectedType === 'unsorted'
      ) {
        setNoteTitle(initialTitle);
      }
    }

    if (initialNote) {
      if (selectedType === 'log' && (selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE) === 'journal') {
        setJournalEntry(initialNote);
      } else {
        setNoteBody(initialNote);
      }
    }

    if ((__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') && hasPrefill) {
      console.log('[CORTEX][10.7C] overlay_prefill_applied:', {
        hasTitle: !!initialTitle,
        hasNote: !!initialNote,
        hasDue: !!initialDueDate,
        selectedType,
      });
    }
  }, [visible, conversionMeta, selectedType, selectedLogSubtype]);

  useEffect(() => {
    let cancelled = false;

    const initAi = async () => {
      try {
        if (!visible) {
          if (!cancelled) {
            setAiReady(false);
          }
          return;
        }

        if (aiDisabled) {
          if (!cancelled) {
            setAiReady(false);
            if (!aiInitWarnedRef.current) {
              console.warn(
                '[Overlay] AI disabled via EXPO_PUBLIC_DISABLE_AI; running in manual mode.',
              );
              aiInitWarnedRef.current = true;
            }
          }
          return;
        }

        if (!cortex || typeof cortex.classify !== 'function') {
          throw new Error('Cortex engine unavailable');
        }

        if (!cancelled) {
          setAiReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setAiReady(false);
          if (!aiInitWarnedRef.current) {
            console.warn('[Overlay] AI init failed; overlay operating offline.', error);
            aiInitWarnedRef.current = true;
          }
        }
      }
    };

    initAi();

    return () => {
      cancelled = true;
    };
  }, [cortex, visible, aiDisabled]);

  const resetForm = () => {
    phase8Links.clearPendingTags();
    phase8Links.clearPendingPeople();
    removedTagsRef.current.clear();
    setTagEditorTags([]);
    setTagsState([]);
    setSelectedType(null); // Reset to no type selected
    setAiMode(false);
    setHydration('idle');
    setPersistedEntity(null);
    setFreeformText('');
    setSelectedLogSubtype(null);
    setHabitName('');
    setHabitFrequency('daily');
    setHabitSubtype(null);
    setHabitFrequencyValue({ kind: 'daily' });
    setHabitReminders([]);
    setHabitDetails({});
    setHabitBreakState({});
    setTodoName('');
    setTodoDueDate(null);
    setTodoDueTime(null);
    setTodoDetails({});
    setJournalDate(new Date().toISOString().split('T')[0]);
    setJournalEntry('');
    setJournalMood(null);
    setJournalDetails({});
    setNoteTitle('');
    setNoteBody('');
    setNoteDetails({
      formatting: null,
      spaceId: null,
      tags: [],
    });
    setPersonName('');
    setPersonDetails({
      email: '',
      dates: [],
      notes: '',
      notesFormatting: null,
      reminders: [],
      spaceId: null,
      tags: [],
    });
    setCommitmentEnabled(false);
    setCommitmentBusy(false);
    setCommitmentNote('');
    setCommitmentNoteDraft('');
    setCommitmentNoteEditing(false);
    setCommitmentNoteBusy(false);
    originalEntityRef.current = null;
    originalTypeRef.current = null;
    lastLoadedIdRef.current = null;
  };

  const handleClose = () => {
    console.log('[UX] capture_closed');

    // Phase 10.6: Emit overlay cancel event
    emitChatEvent({
      type: 'overlay_cancel',
      payload: { type: selectedType || mode || 'unknown' },
    });

    resetForm();
    onClose();
  };

  // Phase 10.6: Helper to emit success event and call onSaved
  const handleSaved = (result: OverlaySavedPayload) => {
    emitChatEvent({
      type: 'overlay_success',
      payload: { type: result.type, created: result },
    });

    // Phase 10.9: Emit celebration event for item creation (limited types)
    const celebrationType: 'todo' | 'note' | 'habit' | null = (() => {
      switch (result.type) {
        case 'habit':
          return 'habit';
        case 'todo':
          return 'todo';
        case 'note':
        case 'journal':
        case 'unsorted':
          return 'note';
        default:
          return null;
      }
    })();

    if (celebrationType) {
      emitChatEvent({
        type: 'item_created',
        payload: {
          type: celebrationType,
          origin: mode === 'create' ? 'overlay' : 'edit',
        },
      });
    }

    onSaved?.(result);
  };

  const resolveOverlayPayloadType = (
    type: EntityType,
    subtype: LogSubtype | null,
  ): OverlaySavedPayload['type'] => {
    if (type === 'log') {
      if (subtype === 'person') {
        return 'person';
      }
      return subtype === 'journal' ? 'journal' : 'note';
    }
    return type === 'unsorted' ? 'unsorted' : type;
  };

  const handleTypeSelect = (type: EntityType, logSubtypeOverride?: LogSubtype) => {
    if (mode === 'edit' && !ALLOW_TYPE_CHANGE) {
      return;
    }
    const wasLog = selectedType === 'log';
    if (isEditingPerson) {
      const proposedSubtype =
        type === 'log'
          ? (logSubtypeOverride ??
            (wasLog ? (selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE) : DEFAULT_LOG_SUBTYPE))
          : null;
      if (type !== 'log' || (proposedSubtype ?? DEFAULT_LOG_SUBTYPE) !== 'person') {
        return;
      }
    }
    setSelectedType(type);
    if (type === 'log') {
      if (logSubtypeOverride) {
        setSelectedLogSubtype(logSubtypeOverride);
      } else if (!wasLog) {
        setSelectedLogSubtype(DEFAULT_LOG_SUBTYPE);
      }
    } else {
      setSelectedLogSubtype(null);
    }
    setAiMode(false); // Exit AI mode when selecting a type
    // Fade in fields
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleAiModeToggle = () => {
    if (mode === 'edit') return; // No AI mode in edit
    const nextAiMode = !aiMode;
    setAiMode(nextAiMode);

    // When entering AI mode, clear type selection
    if (nextAiMode) {
      setSelectedType(null);
      setSelectedLogSubtype(null);
    } else {
      // When exiting AI mode, restore default type via standard handler
      handleTypeSelect('todo');
      return;
    }

    // Fade in/out animation
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleCommitmentToggle = useCallback(
    async (nextValue: boolean) => {
      if (!COMMITMENTS_FEATURE_ENABLED) return;
      if (!initialEntityId) return;
      if (selectedType !== 'habit' && selectedType !== 'todo') return;
      if (nextValue === commitmentEnabled) return;
      if (commitmentBusy) return;

      setCommitmentBusy(true);
      try {
        if (nextValue) {
          const activeCount = await repo.countActiveCommitments();
          if (activeCount >= 3) {
            showErrorToast('Limit of 3 active commitments reached');
            return;
          }

          const noteSource =
            commitmentNote.trim().length > 0
              ? commitmentNote
              : selectedType === 'habit'
                ? habitNotes
                : todoNotes;
          const trimmedNote = noteSource.trim();
          await repo.addCommitment(
            initialEntityId,
            selectedType,
            trimmedNote.length > 0 ? trimmedNote : null,
          );
          setCommitmentEnabled(true);
          setCommitmentNote(trimmedNote);
          setCommitmentNoteDraft(trimmedNote);
          setCommitmentNoteEditing(false);
          emitCommitmentsChanged();
          return;
        }

        await repo.removeCommitment(initialEntityId, selectedType);
        setCommitmentEnabled(false);
        setCommitmentNote('');
        setCommitmentNoteDraft('');
        setCommitmentNoteEditing(false);
        setCommitmentNoteBusy(false);
        emitCommitmentsChanged();
      } catch (error) {
        console.error('[UnifiedCreateOverlay] Failed to toggle commitment', error);
        if (error instanceof Error && error.message === 'MAX_COMMITMENTS_REACHED') {
          showErrorToast('Limit of 3 active commitments reached');
        } else {
          showErrorToast('Unable to update commitment right now.');
        }
      } finally {
        setCommitmentBusy(false);
      }
    },
    [
      commitmentBusy,
      commitmentEnabled,
      habitNotes,
      initialEntityId,
      repo,
      selectedType,
      commitmentNote,
      showErrorToast,
      todoNotes,
      emitCommitmentsChanged,
    ],
  );

  const handleCommitmentNotePress = useCallback(() => {
    if (!COMMITMENTS_FEATURE_ENABLED) {
      return;
    }
    if (!commitmentEnabled) {
      showErrorToast('Enable commitment to add an intent.');
      return;
    }
    setCommitmentNoteDraft(commitmentNote);
    setCommitmentNoteEditing(true);
  }, [commitmentEnabled, commitmentNote, showErrorToast]);

  const handleCommitmentNoteCancel = useCallback(() => {
    if (!COMMITMENTS_FEATURE_ENABLED) {
      return;
    }
    setCommitmentNoteDraft(commitmentNote);
    setCommitmentNoteEditing(false);
  }, [commitmentNote]);

  const handleCommitmentNoteSave = useCallback(async () => {
    if (!COMMITMENTS_FEATURE_ENABLED) return;
    if (!initialEntityId) return;
    if (selectedType !== 'habit' && selectedType !== 'todo') return;
    if (!commitmentEnabled) {
      showErrorToast('Enable commitment to add an intent.');
      return;
    }

    const trimmed = commitmentNoteDraft.trim();
    if (trimmed.length > COMMITMENT_NOTE_LIMIT) {
      showErrorToast(`Intent must be ${COMMITMENT_NOTE_LIMIT} characters or fewer.`);
      return;
    }

    setCommitmentNoteBusy(true);
    try {
      const notePatch = {
        commitment_note: trimmed.length > 0 ? trimmed : null,
      } as any;
      await repo.update({
        id: initialEntityId,
        patch: notePatch,
      });
      setCommitmentNote(trimmed);
      setCommitmentNoteDraft(trimmed);
      setCommitmentNoteEditing(false);
      if (trimmed.length > 0) {
        showToast('Intent saved.');
      } else {
        showToast('Intent cleared.');
      }
      emitCommitmentsChanged();
    } catch (error) {
      console.error('[UnifiedCreateOverlay] Failed to save commitment note', error);
      showErrorToast('Unable to save intent right now.');
    } finally {
      setCommitmentNoteBusy(false);
    }
  }, [
    commitmentEnabled,
    commitmentNoteDraft,
    initialEntityId,
    emitCommitmentsChanged,
    repo,
    selectedType,
    showErrorToast,
    showToast,
  ]);

  const flushPendingAssociations = async (
    itemId: string,
    itemTypeOverride?: ItemType | null,
  ): Promise<void> => {
    const itemType = itemTypeOverride ?? getItemType();
    if (!itemId || !itemType) return;

    if (usePhase8Features && phase8Links.pendingTagIds.length > 0) {
      for (const tagId of phase8Links.pendingTagIds) {
        try {
          await repo.linkTag({ itemId, tagId, itemType });
        } catch (error) {
          console.error('[Phase8] Failed to link pending tag:', tagId, error);
        }
      }
      phase8Links.clearPendingTags();
    }

    if (allowPeopleLinking && phase8Links.pendingPeople.length > 0) {
      for (const person of phase8Links.pendingPeople) {
        try {
          await repo.linkPerson({
            itemId,
            itemType,
            personName: person.personName,
            personEmail: person.personEmail,
          });
        } catch (error) {
          console.error('[Phase8] Failed to link pending person:', person, error);
        }
      }

      try {
        await phase8Links.loadPeople();
      } catch (error) {
        console.error('[Phase8] Failed to refresh linked people after save:', error);
      }

      phase8Links.clearPendingPeople();
    }
  };

  const handleConvertLogListToTodo = async () => {
    if (!canonicalConversionsEnabled) return;
    if (submitting || mode !== 'edit' || !initialEntity?.id) return;
    if (!canConvertLogListToTodo) {
      Alert.alert('Conversion unavailable', 'This log does not include a checklist to convert.');
      return;
    }

    setSubmitting(true);
    try {
      const { todo } = await convertLogListToTodo(repo, initialEntity.id, { preserveState: true });
      handleSaved({ type: 'todo', id: todo.id });
      showToast('Converted to To-Do.');
      handleClose();
    } catch (error) {
      console.error('[UnifiedCreateOverlay] Failed to convert log list to todo', error);
      Alert.alert('Conversion failed', 'Unable to convert this log into a to-do right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvertTodoToLogList = async () => {
    if (!canonicalConversionsEnabled) return;
    if (submitting || mode !== 'edit' || !initialEntity?.id) return;
    if (!canConvertTodoToLogList) {
      Alert.alert('Conversion unavailable', 'This to-do does not include a checklist to convert.');
      return;
    }

    setSubmitting(true);
    try {
      const { note } = await convertTodoToLogList(repo, initialEntity.id, { preserveState: true });
      const payloadType = resolveOverlayPayloadType('log', 'list');
      handleSaved({ type: payloadType, id: note.id });
      showToast('Converted to log list.');
      handleClose();
    } catch (error) {
      console.error('[UnifiedCreateOverlay] Failed to convert todo to log list', error);
      Alert.alert('Conversion failed', 'Unable to convert this to-do into a log right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenOverflowMenu = () => {
    if (submitting) return;
    if (!canonicalConversionsEnabled) {
      Alert.alert('No extra actions', 'There are no additional options available right now.');
      return;
    }

    const actions: Array<{ label: string; handler: () => void }> = [];

    if (canConvertLogListToTodo) {
      actions.push({ label: 'Convert to To-Do', handler: () => void handleConvertLogListToTodo() });
    }

    if (canConvertTodoToLogList) {
      actions.push({
        label: 'Convert to log list',
        handler: () => void handleConvertTodoToLogList(),
      });
    }

    if (!actions.length) {
      Alert.alert('No extra actions', 'There are no additional options available right now.');
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...actions.map((a) => a.label), 'Cancel'],
          cancelButtonIndex: actions.length,
        },
        (index) => {
          if (typeof index === 'number' && index >= 0 && index < actions.length) {
            actions[index].handler();
          }
        },
      );
    } else {
      Alert.alert(
        'More actions',
        'Choose an option',
        [
          ...actions.map((a) => ({ text: a.label, onPress: a.handler })),
          { text: 'Cancel', style: 'cancel' },
        ],
        { cancelable: true },
      );
    }
  };

  const handleSave = async () => {
    // Single-flight guard
    if (submitting) {
      console.log('[Overlay] submit already in progress, ignoring');
      return;
    }

    setSubmitting(true);
    setIsLoading(true);
    setThinking(false);
    setCortexStatus(null); // Clear any previous status

    try {
      // AI mode - freeform catchall with optimistic UX
      if (aiMode && freeformText.trim()) {
        console.log('[UX] capture_submitted', { mode: 'ai' });
        const t0 = Date.now();

        // Check AI disable flag
        const aiDisabledFlag = (getEnv('EXPO_PUBLIC_DISABLE_AI') ?? '').toLowerCase() === 'on';
        if (aiDisabledFlag) {
          // AI disabled - save immediately without classification
          const trimmedText = freeformText.trim();
          const input: CreateRecordInput = {
            type: 'note',
            title: trimmedText || 'Quick note', // Database requires non-empty title
            body: trimmedText,
            subtype: 'catchall',
            space_id: spaceId !== undefined ? spaceId : null,
            ai_placed: false,
            why_string: 'Manual - AI disabled',
            origin: 'catchall',
          };
          const result = await repo.create(input);
          console.log('[UX] capture_saved', { path: 'catchall', aiStatus: 'disabled' });
          if (result.id) {
            await flushPendingAssociations(result.id, 'note');
          }
          handleSaved({ type: 'note', id: result.id });
          showToast('Added to Hub');
          handleClose();
          return;
        }

        // Optimistic UX flow
        const optimisticEnabled = getOptimisticFlag();
        const minThink = getMinThinkMs();
        const bgTimeout = getBgTimeoutMs();

        setThinking(true);
        setCortexStatus('thinking');
        setCortexInFlight(true);

        // Kick AI classification call (don't await yet)
        const noteText = freeformText.trim();
        const aiPromise = callClassify({ text: noteText });

        try {
          // Race AI vs min-think timer
          const thinkTimer = new Promise<void>((resolve) => setTimeout(resolve, minThink));
          let finishedEarly = false;
          let aiResult: CallClassifyResult | null = null;

          try {
            aiResult = await Promise.race([
              aiPromise.then((result) => {
                finishedEarly = true;
                return result;
              }),
              thinkTimer.then(() => null),
            ]);
          } catch (error) {
            aiResult = { ok: false, error: (error as Error)?.message || 'unknown' };
          }

          const elapsed = Date.now() - t0;

          // Case A: AI finished within ~1s and succeeded
          if (optimisticEnabled && finishedEarly && aiResult?.ok) {
            console.log('[Overlay] ai ms', elapsed);

            const classification = aiResult.classification;
            // Derive tags NOW (same normalization semantics as background finalize)
            const manualTagsSnapshot = normalizeTags(latestTagsRef.current);
            const removedTagsSnapshot = new Set<string>(removedTagsRef.current);
            const classificationTags = filterAndNormalizeTags(classification.tags ?? []);
            const filteredClassificationTags = classificationTags.filter(
              (tag) => !removedTagsSnapshot.has(tag.toLowerCase()),
            );
            const mergedTagState = normalizeTags([
              ...manualTagsSnapshot,
              ...filteredClassificationTags,
              ...tagEditorTagNames,
            ]);
            const filteredMerged = mergedTagState.filter(
              (tag) => !removedTagsSnapshot.has(tag.toLowerCase()),
            );
            const tagsForCreate =
              filteredMerged.length > 0
                ? filteredMerged
                : filteredClassificationTags.length > 0
                  ? filteredClassificationTags
                  : null;

            // Save immediately as catch-all note (fast path) BUT include tags
            const trimmedText = freeformText.trim();
            const input: CreateRecordInput = {
              type: 'note',
              title: trimmedText || 'Quick note',
              body: trimmedText,
              subtype: 'catchall',
              space_id: spaceId !== undefined ? spaceId : null,
              ai_placed: true,
              why_string: `AI classified (${Math.round(classification.confidence * 100)}% confidence)`,
              origin: 'catchall',
              tags: tagsForCreate,
            };

            const result = await repo.create(input);
            console.log('[UX] capture_saved', { path: 'catchall', aiStatus: 'classified' });

            if (result.id) {
              await flushPendingAssociations(result.id, 'note');
            }

            handleSaved({ type: 'note', id: result.id });
            showToast('Added to Hub');
            setThinking(false);
            setCortexStatus(null);
            handleClose();
            return;
          }

          // Case B: AI not done in ~1s or failed - save optimistically to Catch-All
          console.log('[Overlay] ai ms (optimistic)', elapsed);

          const trimmedText = freeformText.trim();
          const input: CreateRecordInput = {
            type: 'note',
            title: trimmedText || 'Quick note', // Database requires non-empty title
            body: trimmedText,
            subtype: 'catchall',
            space_id: spaceId !== undefined ? spaceId : null,
            ai_placed: false,
            why_string: 'Pending classification',
            origin: 'catchall',
          };

          const newItem = await repo.create(input);
          console.log('[UX] capture_saved', { path: 'catchall', aiStatus: 'pending' });

          if (newItem.id) {
            await flushPendingAssociations(newItem.id, 'note');
          }

          const manualTagsSnapshot = normalizeTags(latestTagsRef.current);
          const removedTagsSnapshot = new Set<string>(removedTagsRef.current);
          const tagEditorSnapshot = [...tagEditorTagNames];

          handleSaved({ type: 'note', id: newItem.id });
          showToast('Delivered to Hub — sorting in background');
          setThinking(false);
          setCortexStatus(null);
          handleClose();

          // Background finalize (non-blocking)
          if (optimisticEnabled) {
            setTimeout(async () => {
              try {
                const timeoutPromise = new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error('bg-timeout')), bgTimeout),
                );
                const finalResult = await Promise.race([aiPromise, timeoutPromise]);

                if (finalResult.ok) {
                  console.log('[Overlay] bg classification success', newItem.id);
                  console.log('[UX] capture_saved', { path: 'catchall', aiStatus: 'classified' });

                  // Extract classification info from AI response
                  const classification = finalResult.classification;
                  const originalNoteId = newItem.id;
                  const originalText = noteText;
                  const classificationTags = filterAndNormalizeTags(classification.tags ?? []);
                  const filteredClassificationTags = classificationTags.filter(
                    (tag) => !removedTagsSnapshot.has(tag.toLowerCase()),
                  );

                  const mergedTagState = normalizeTags([
                    ...manualTagsSnapshot,
                    ...filteredClassificationTags,
                  ]);
                  const combinedTagsForPayload = normalizeTags([
                    ...mergedTagState,
                    ...tagEditorSnapshot,
                  ]);
                  const filteredCombinedTags = combinedTagsForPayload.filter(
                    (tag) => !removedTagsSnapshot.has(tag.toLowerCase()),
                  );
                  const tagsPayload = filteredCombinedTags.length > 0 ? filteredCombinedTags : null;
                  const tags =
                    tagsPayload ??
                    (filteredClassificationTags.length > 0 ? filteredClassificationTags : null);

                  // Normalize category to lowercase for matching
                  const category = classification.category.toLowerCase();

                  try {
                    // Find or create space if spaceName is provided
                    let targetSpaceId: string | null = null;
                    const spaceName = classification.spaceName;
                    if (spaceName) {
                      const spaces = await repo.listSpaces();
                      let space = spaces.find(
                        (s) => s.name.toLowerCase() === spaceName.toLowerCase(),
                      );

                      if (!space) {
                        // Create the space if it doesn't exist
                        space = await repo.createSpace({
                          name: spaceName,
                        });
                        console.log('[Overlay] Created new space:', space.name, space.id);
                      }

                      targetSpaceId = space.id;
                    }

                    let newItemId: string | null = null;

                    // Create appropriate item type based on classification
                    switch (category) {
                      case 'habit': {
                        const habitInput: CreateRecordInput = {
                          type: 'habit',
                          name: originalText,
                          frequency: 'daily',
                          subtype: 'start_habit',
                          space_id: targetSpaceId,
                          ai_placed: true,
                          why_string: `AI classified (${Math.round(classification.confidence * 100)}% confidence)`,
                          tags,
                        };
                        const habit = await repo.create(habitInput);
                        newItemId = habit.id;
                        console.log('[CLASSIFIED_DEST]', {
                          from: originalNoteId,
                          to: newItemId,
                          category: 'habit',
                          spaceName,
                        });
                        break;
                      }

                      case 'to-do':
                      case 'todo': {
                        const todoInput: CreateRecordInput = {
                          type: 'todo',
                          name: originalText,
                          title: originalText,
                          due_date: null,
                          space_id: targetSpaceId,
                          ai_placed: true,
                          why_string: `AI classified (${Math.round(classification.confidence * 100)}% confidence)`,
                          tags,
                        };
                        const todo = await repo.create(todoInput);
                        newItemId = todo.id;
                        console.log('[CLASSIFIED_DEST]', {
                          from: originalNoteId,
                          to: newItemId,
                          category: 'todo',
                          spaceName,
                        });
                        break;
                      }

                      case 'note': {
                        const tagsForSubtype = tags ?? filteredClassificationTags;
                        const derivedSubtype = deriveLogSubtypeFromTags(tagsForSubtype);
                        const resolvedSubtype: NoteSubtype = (() => {
                          switch (derivedSubtype) {
                            case 'journal':
                              return 'journal';
                            case 'list':
                              return 'list';
                            case 'idea':
                              return 'idea';
                            default:
                              return 'idea';
                          }
                        })();

                        const noteInput: CreateRecordInput = {
                          type: 'note',
                          title: originalText.slice(0, 100),
                          body: originalText,
                          subtype: resolvedSubtype,
                          space_id: targetSpaceId,
                          ai_placed: true,
                          why_string: `AI classified (${Math.round(classification.confidence * 100)}% confidence)`,
                          tags,
                        };
                        const note = await repo.create(noteInput);
                        newItemId = note.id;
                        console.log('[CLASSIFIED_DEST]', {
                          from: originalNoteId,
                          to: newItemId,
                          category: 'note',
                          spaceName,
                        });
                        break;
                      }

                      case 'journal': {
                        const journalInput: CreateRecordInput = {
                          type: 'note',
                          title: originalText.slice(0, 100),
                          body: originalText,
                          subtype: 'journal',
                          space_id: targetSpaceId,
                          ai_placed: true,
                          why_string: `AI classified (${Math.round(classification.confidence * 100)}% confidence)`,
                          tags,
                        };
                        const journal = await repo.create(journalInput);
                        newItemId = journal.id;
                        console.log('[CLASSIFIED_DEST]', {
                          from: originalNoteId,
                          to: newItemId,
                          category: 'journal',
                          spaceName,
                        });
                        break;
                      }

                      default: {
                        // Unknown category - just mark as classified but keep as catchall
                        console.warn('[Overlay] Unknown category:', category);
                        await repo.update({
                          id: originalNoteId,
                          patch: {
                            ai_placed: true,
                            why_string: `AI: ${category} (${Math.round(classification.confidence * 100)}% confidence)`,
                          },
                        });
                        break;
                      }
                    }

                    // Archive the original catchall note if we created a new item
                    if (newItemId) {
                      await repo.update({
                        id: originalNoteId,
                        patch: {
                          archived: true,
                          why_string: `Processed → ${category}`,
                        },
                      });
                      console.log('[Overlay] Archived original catchall note:', originalNoteId);
                    }

                    // Show success toast
                    if (Platform.OS === 'android') {
                      ToastAndroid.show('Sorted — ready for review', ToastAndroid.SHORT);
                    } else {
                      console.log('[Toast] Sorted — ready for review');
                    }
                  } catch (createError) {
                    console.error('[Overlay] Failed to create classified item:', createError);
                    // Fall back to just marking the catchall as classified
                    await repo.update({
                      id: originalNoteId,
                      patch: {
                        ai_placed: true,
                        why_string: `AI: ${category} (${Math.round(classification.confidence * 100)}% confidence) - creation failed`,
                      },
                    });
                  }
                } else {
                  console.warn('[Overlay] bg classification failed', newItem.id);
                  console.log('[UX] capture_saved', { path: 'catchall', aiStatus: 'failed' });
                  await repo.update({
                    id: newItem.id,
                    patch: {
                      ai_placed: false,
                      why_string: 'Classification failed',
                    },
                  });
                  // Note: We could emit EventBus event here for UI toast
                  // EventBus.emit('cortex:failed', { itemId: newItem.id, error: 'classification failed' });
                }
              } catch (error) {
                console.warn('[Overlay] bg classification timeout', newItem.id, error);
                console.log('[UX] capture_saved', { path: 'catchall', aiStatus: 'failed' });
                await repo
                  .update({
                    id: newItem.id,
                    patch: {
                      ai_placed: false,
                      why_string: 'Classification timeout',
                    },
                  })
                  .catch(() => {
                    // Silently fail - item is already saved
                  });
                // Note: We could emit EventBus event here for UI toast
                // EventBus.emit('cortex:failed', { itemId: newItem.id, error: 'timeout' });
              }
            }, 0);
          }

          return;
        } finally {
          setCortexInFlight(false);
        }
      }

      // Edit mode
      if (mode === 'edit' && initialEntity?.id && selectedType) {
        const originalWasPerson = isEditingPerson;

        if (isLogPerson && originalWasPerson) {
          const personPatch = buildPersonPayload();
          const result = await repo.updatePerson(initialEntity.id, personPatch);
          handleSaved({ type: 'person', id: result.id });
          showToast('Updated in the Hub.');
          handleClose();
          return;
        }

        if (isLogPerson && !originalWasPerson) {
          const personInput = buildPersonPayload();
          const createdPerson = await repo.createPerson(personInput);

          try {
            // Phase 1A: Use deleteEntityOrDrop to handle drop_id cleanup
            // Fetch the full entity to get drop_id
            const fullEntity = await repo.getById(initialEntity.id);
            const entityType = (fullEntity?.type || 'note') as 'todo' | 'habit' | 'note' | 'log';
            await deleteEntityOrDrop(
              repo,
              initialEntity.id,
              entityType,
              (fullEntity as any)?.drop_id,
            );
          } catch (removeError) {
            console.warn(
              '[UnifiedCreateOverlay] Failed to remove original during conversion to person:',
              removeError,
            );
          }

          handleSaved({ type: 'person', id: createdPerson.id });
          showToast('Converted to Person.');
          handleClose();
          return;
        }

        const originalType = originalTypeRef.current ?? (initialEntity.type as EntityType | null);
        const originalFamily = originalType
          ? ENTITY_FAMILY[originalType]
          : ENTITY_FAMILY[selectedType];
        const targetFamily = ENTITY_FAMILY[selectedType];

        if (originalType && originalType !== selectedType && originalFamily !== targetFamily) {
          const existing = originalEntityRef.current ?? (await repo.getById(initialEntity.id));

          if (!existing) {
            throw new Error('Original entity not available for conversion');
          }

          const existingOrigin = existing.origin;
          const normalizedOrigin =
            existingOrigin === 'catchall' || existingOrigin === 'space_chat'
              ? existingOrigin
              : undefined;
          const defaultSpaceId = existing.space_id ?? null;

          const convertedInput = buildCreateInput(selectedType, {
            includeConversionMeta: false,
            whyString: `Converted from ${FRIENDLY_TYPE_LABEL[originalType]}`,
            origin: normalizedOrigin,
            defaultSpaceId,
          });

          const created = await repo.create(convertedInput);

          if (created && (created.type === 'habit' || created.type === 'todo')) {
            setPersistedEntity({ id: created.id, type: created.type as 'habit' | 'todo' });

            const textBlob =
              `${(created as any).name || (created as any).title || ''} ${((created as any).body as string | undefined) || ''}`.trim();
            if (__DEV__) {
              console.log('[AutoCommitment][candidate]', {
                textBlob,
                matched: shouldAutoCommit(textBlob),
              });
            }
            if (shouldAutoCommit(textBlob)) {
              try {
                const count = await repo.countActiveCommitments();
                if (count < 3) {
                  await repo.addCommitment(created.id, created.type as 'habit' | 'todo');
                  if (__DEV__) console.log('[AutoCommitment][applied]', created.id);
                  emitCommitmentsChanged();
                }
              } catch (e) {
                if (__DEV__) console.warn('[AutoCommitment] failed', e);
              }
            }
          } else {
            setPersistedEntity(null);
          }

          if (created.id) {
            await flushPendingAssociations(created.id);
          }

          try {
            // Phase 1A: Use deleteEntityOrDrop to handle drop_id cleanup
            // We already have 'existing' loaded above with the full entity data
            const entityType = (existing.type || 'note') as 'todo' | 'habit' | 'note' | 'log';
            await deleteEntityOrDrop(
              repo,
              initialEntity.id,
              entityType,
              (existing as any)?.drop_id,
            );
          } catch (removeError) {
            console.warn(
              '[UnifiedCreateOverlay] Failed to remove original during conversion:',
              removeError,
            );
          }

          const payloadType = resolveOverlayPayloadType(
            selectedType,
            selectedType === 'log'
              ? (effectiveLogSubtype ?? selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE)
              : null,
          );
          handleSaved({ type: payloadType, id: created.id });
          showToast(`Converted to ${FRIENDLY_TYPE_LABEL[selectedType]}.`);
          handleClose();
          return;
        }

        // Other types use standard update
        const patch = buildUpdatePatch(selectedType);
        const input: UpdateRecordInput = {
          id: initialEntity.id,
          patch,
        };

        const result = await repo.update(input);
        const payloadType = resolveOverlayPayloadType(
          selectedType,
          selectedType === 'log'
            ? (effectiveLogSubtype ?? selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE)
            : null,
        );
        handleSaved({ type: payloadType, id: result.id });
        showToast('Updated in the Hub.');
        handleClose();
        return;
      }

      // Create mode - structured
      if (selectedType) {
        if (selectedType === 'log' && (selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE) === 'person') {
          const personInput = buildPersonPayload();
          const result = await repo.createPerson(personInput);
          handleSaved({ type: 'person', id: result.id });
          showToast('Saved to the Hub.');
          handleClose();
          return;
        }

        const input = buildCreateInput(selectedType);
        const result = await repo.create(input);

        if (result && (result.type === 'todo' || result.type === 'habit')) {
          setPersistedEntity({ id: result.id, type: result.type as 'habit' | 'todo' });

          const textBlob =
            `${(result as any).name || (result as any).title || ''} ${((result as any).body as string | undefined) || ''}`.trim();
          if (__DEV__) {
            console.log('[AutoCommitment][candidate]', {
              textBlob,
              matched: shouldAutoCommit(textBlob),
            });
          }
          if (shouldAutoCommit(textBlob)) {
            try {
              const count = await repo.countActiveCommitments();
              if (count < 3) {
                await repo.addCommitment(result.id, result.type as 'habit' | 'todo');
                if (__DEV__) console.log('[AutoCommitment][applied]', result.id);
                emitCommitmentsChanged();
              }
            } catch (e) {
              if (__DEV__) console.warn('[AutoCommitment] failed', e);
            }
          }
        } else {
          setPersistedEntity(null);
        }

        // Phase 8: Flush pending tags and people after successful create
        if (result.id) {
          await flushPendingAssociations(result.id);
        }

        const payloadType = resolveOverlayPayloadType(
          selectedType,
          selectedType === 'log'
            ? (effectiveLogSubtype ?? selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE)
            : null,
        );
        handleSaved({ type: payloadType, id: result.id });
        showToast('Saved to the Hub.');
        handleClose();
      }
    } catch (error) {
      console.error('[UnifiedCreateOverlay] Save failed:', error);
    } finally {
      setIsLoading(false);
      setSubmitting(false);
    }
  };

  const buildCreateInput = (
    type: EntityType,
    options: {
      includeConversionMeta?: boolean;
      whyString?: string | null;
      origin?: 'catchall' | 'space_chat';
      defaultSpaceId?: string | null;
    } = {},
  ): CreateRecordInput => {
    const includeMeta = options.includeConversionMeta ?? true;
    const rawOrigin = includeMeta ? conversionMeta?.origin : undefined;
    const baseOrigin =
      options.origin ??
      (includeMeta && (rawOrigin === 'catchall' || rawOrigin === 'space_chat')
        ? rawOrigin
        : undefined);
    const baseSpaceId = normalizeSpaceId(options.defaultSpaceId ?? spaceId);
    const baseWhy =
      options.whyString !== undefined
        ? options.whyString
        : includeMeta
          ? (conversionMeta?.why_string ?? null)
          : 'Edited via Unified Overlay';
    const baseAiPlaced = includeMeta ? (conversionMeta?.ai_placed ?? false) : false;
    const baseSourceMessageId = includeMeta ? (conversionMeta?.source_message_id ?? null) : null;

    const baseInput: Partial<CreateRecordInput> & { origin?: 'catchall' | 'space_chat' } = {
      space_id: baseSpaceId,
      ai_placed: baseAiPlaced,
      why_string: baseWhy,
      sourceMessageId: baseSourceMessageId,
      ...(baseOrigin ? { origin: baseOrigin } : {}),
    };

    const resolveNoteTitle = (): string => {
      const trimmedTitle = (noteTitle || '').trim();
      if (trimmedTitle.length > 0) {
        return trimmedTitle;
      }

      const trimmedBody = (noteBody || '').trim();
      if (trimmedBody.length > 0) {
        const firstLine = trimmedBody.split(/\r?\n/)[0] ?? trimmedBody;
        return firstLine.slice(0, 120) || 'Untitled note';
      }

      return 'Untitled note';
    };

    const logSubtype =
      type === 'log' ? (effectiveLogSubtype ?? selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE) : null;
    const persisted = canonicalToPersisted(type, logSubtype);
    const tagsForCreate = tagsState.length > 0 ? tagsState : null;

    switch (persisted.recordType) {
      case 'habit': {
        const isStartHabit = habitSubtype === 'start_habit';
        const isBreakHabit = habitSubtype === 'break_habit';

        return {
          ...baseInput,
          type: 'habit',
          title: habitName,
          frequency: habitFrequency,
          reminders: habitReminders.length > 0 ? habitReminders : undefined,
          notes: habitDetails.notes || null,
          tags: tagsForCreate,
          buddy_id: habitDetails.buddyId || null,
          buddy_email: habitDetails.buddyEmail || null,
          space_id: normalizeSpaceId(
            habitDetails.spaceId !== undefined
              ? habitDetails.spaceId
              : spaceId !== undefined
                ? spaceId
                : null,
          ),
          start_date: habitDetails.startDate || null,
          end_date: habitDetails.endDate || null,
          ...(isStartHabit && {
            frequency_value: habitFrequencyValue,
            stack_with_id: habitDetails.stackHabitId || null,
            stack_position: habitDetails.stackPosition || null,
            stack_offset_minutes: habitDetails.stackOffsetMinutes || null,
          }),
          ...(isBreakHabit && {
            taper_plan: habitBreakState.taperPlan || null,
            triggers:
              habitBreakState.triggers && habitBreakState.triggers.length > 0
                ? habitBreakState.triggers
                : null,
            replacement_habit_id: habitBreakState.replacementHabitId || null,
            replacement_text: habitBreakState.replacementFreeText || null,
          }),
        };
      }
      case 'todo': {
        const normalizedDueTime = normalizeTimeInput(todoDueTime);
        return {
          ...baseInput,
          type: 'todo',
          name: todoName,
          title: todoName,
          due_date: combineDueIso(todoDueDate, normalizedDueTime),
          due_time: normalizedDueTime,
          reminders: todoDetails.reminders || undefined,
          notes: todoDetails.notes || null,
          tags: tagsForCreate,
          space_id: normalizeSpaceId(todoDetails.spaceId ?? baseInput.space_id ?? null),
        };
      }
      case 'note': {
        if (type === 'log' && logSubtype === 'journal') {
          return {
            ...baseInput,
            type: 'note',
            subtype: 'journal',
            title: journalEntry.trim() || 'Journal entry',
            body: journalEntry,
            date: journalDate || null,
            mood: journalMood || null,
            fmt: journalDetails.formatting || null,
            reminders: journalDetails.reminders || undefined,
            tags: tagsForCreate,
            space_id: normalizeSpaceId(journalDetails.spaceId ?? baseInput.space_id ?? null),
            journal_subtype: null,
          };
        }

        if (type === 'unsorted') {
          return {
            ...baseInput,
            type: 'note',
            subtype: 'catchall',
            title: resolveNoteTitle(),
            body: noteBody,
            fmt: noteDetails.formatting || null,
            tags: tagsForCreate,
            space_id: normalizeSpaceId(noteDetails.spaceId ?? baseInput.space_id ?? null),
            ai_placed: false,
            canonicalType: 'note',
            labels: [CATCHALL_LABEL, UNSORTED_LABEL],
            origin: 'catchall',
            views: { alsoShowIn: ['Hub:Catch-All'] },
          };
        }

        return {
          ...baseInput,
          type: 'note',
          subtype: (persisted.noteSubtype as NoteSubtype | null) ?? 'idea',
          title: resolveNoteTitle(),
          body: noteBody,
          fmt: noteDetails.formatting || null,
          tags: tagsForCreate,
          space_id: normalizeSpaceId(noteDetails.spaceId ?? baseInput.space_id ?? null),
          ai_placed: false,
        };
      }
      default:
        throw new Error(`Unsupported canonical type: ${type}`);
    }
  };

  const buildPersonPayload = () => {
    const trimmedName = personName.trim();
    const trimmedEmail = personDetails.email.trim();
    const trimmedNotes = personDetails.notes.trim();

    return {
      display_name: trimmedName,
      email: trimmedEmail.length > 0 ? trimmedEmail : null,
      dates:
        personDetails.dates.length > 0
          ? personDetails.dates.map((d) => ({
              date: d.date,
              label: d.label,
            }))
          : null,
      notes: trimmedNotes.length > 0 ? trimmedNotes : null,
      notes_fmt: personDetails.notesFormatting || null,
      reminders: personDetails.reminders.length > 0 ? personDetails.reminders : null,
      space_id: normalizeSpaceId(personDetails.spaceId),
      tags: combineTags(),
    };
  };

  const buildUpdatePatch = (type: EntityType): Partial<AppRecord> => {
    const logSubtype =
      type === 'log' ? (effectiveLogSubtype ?? selectedLogSubtype ?? DEFAULT_LOG_SUBTYPE) : null;
    const persisted = canonicalToPersisted(type, logSubtype);

    switch (persisted.recordType) {
      case 'habit': {
        const isStartHabit = habitSubtype === 'start_habit';
        const isBreakHabit = habitSubtype === 'break_habit';

        return {
          name: habitName,
          frequency: habitFrequency,
          reminders: habitReminders.length > 0 ? habitReminders : undefined,
          notes: habitDetails.notes || null,
          tags: combineTags(),
          buddy_id: habitDetails.buddyId || null,
          buddy_email: habitDetails.buddyEmail || null,
          space_id: habitDetails.spaceId !== undefined ? habitDetails.spaceId : undefined,
          start_date: habitDetails.startDate || null,
          end_date: habitDetails.endDate || null,
          ...(isStartHabit && {
            frequency_value: habitFrequencyValue,
            stack_with_id: habitDetails.stackHabitId || null,
            stack_position: habitDetails.stackPosition || null,
            stack_offset_minutes: habitDetails.stackOffsetMinutes || null,
          }),
          ...(isBreakHabit && {
            taper_plan: habitBreakState.taperPlan || null,
            triggers:
              habitBreakState.triggers && habitBreakState.triggers.length > 0
                ? habitBreakState.triggers
                : null,
            replacement_habit_id: habitBreakState.replacementHabitId || null,
            replacement_text: habitBreakState.replacementFreeText || null,
          }),
        } as Partial<AppRecord>;
      }
      case 'todo': {
        const normalizedDueTime = normalizeTimeInput(todoDueTime);
        const normalizedSpaceId =
          todoDetails.spaceId !== undefined ? normalizeSpaceId(todoDetails.spaceId) : undefined;

        return {
          title: todoName,
          due_date: combineDueIso(todoDueDate, normalizedDueTime),
          due_time: normalizedDueTime,
          reminders: todoDetails.reminders || undefined,
          notes: todoDetails.notes || null,
          tags: combineTags(),
          ...(normalizedSpaceId !== undefined ? { space_id: normalizedSpaceId } : {}),
        } as Partial<AppRecord>;
      }
      case 'note': {
        if (type === 'log' && logSubtype === 'journal') {
          return {
            body: journalEntry,
            subtype: 'journal',
            date: journalDate || null,
            mood: journalMood || null,
            fmt: journalDetails.formatting || null,
            reminders: journalDetails.reminders || undefined,
            tags: combineTags(),
            space_id: journalDetails.spaceId || null,
          } as Partial<AppRecord>;
        }

        if (type === 'unsorted') {
          return {
            title: noteTitle || undefined,
            body: noteBody,
            fmt: noteDetails.formatting || null,
            tags: combineTags(),
            space_id: noteDetails.spaceId || null,
            subtype: 'catchall',
            labels: [CATCHALL_LABEL, UNSORTED_LABEL],
            canonicalType: 'note',
            views: { alsoShowIn: ['Hub:Catch-All'] },
          } as Partial<AppRecord>;
        }

        return {
          title: noteTitle || undefined,
          body: noteBody,
          fmt: noteDetails.formatting || null,
          tags: combineTags(),
          space_id: noteDetails.spaceId || null,
          subtype: (persisted.noteSubtype as NoteSubtype | null) ?? null,
        } as Partial<AppRecord>;
      }
      default:
        return {};
    }
  };

  const isSaveDisabled = () => {
    // Use centralized validation
    return !validation.isValid || isLoading;
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }]}
      pointerEvents="box-none"
      testID={mode === 'edit' ? 'overlay-mode-edit' : 'unified-overlay'}
    >
      <View
        style={[
          styles.card,
          {
            paddingBottom: insets.bottom + 20,
            backgroundColor: theme.colors.cream,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text variant="title" style={{ color: theme.colors.text.primary }}>
            Add or Edit Item
          </Text>
          <View style={styles.headerActions}>
            {hasOverflowActions ? (
              <TouchableOpacity
                onPress={handleOpenOverflowMenu}
                disabled={submitting}
                testID="overlay-overflow-button"
                style={styles.headerIconButton}
              >
                <Icon name="MoreHorizontal" size="sm" color={theme.colors.text.secondary} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={handleClose}
              testID="close-button"
              style={[
                styles.headerIconButton,
                !hasOverflowActions && styles.headerIconButtonNoOffset,
              ]}
            >
              <Text style={[styles.closeButton, { color: theme.colors.text.tertiary }]}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {showAiBanner && (
            <View style={[styles.section, styles.aiBanner]} testID="ai-unavailable-banner">
              <Text style={[styles.aiBannerText, { color: theme.colors.text.secondary }]}>
                {aiBannerMessage}
              </Text>
            </View>
          )}

          {/* Type row */}
          <View style={styles.section}>
            <View style={styles.chipRow}>
              {TYPE_OPTIONS.map((opt) => {
                const isSelected =
                  selectedType === opt.value &&
                  (!opt.logSubtype || selectedLogSubtype === opt.logSubtype) &&
                  !aiMode;
                const chipStyle = isSelected
                  ? {
                      backgroundColor: theme.colors.mint,
                      borderColor: theme.colors.deepTeal.DEFAULT,
                    }
                  : {
                      backgroundColor: 'transparent',
                      borderColor: theme.colors.border.DEFAULT,
                    };
                const chipTextStyle = isSelected
                  ? { color: theme.colors.deepTeal.DEFAULT }
                  : { color: theme.colors.text.secondary };
                const iconColor = isSelected
                  ? theme.colors.deepTeal.DEFAULT
                  : theme.colors.text.secondary;
                const nextSubtypeForOpt =
                  opt.logSubtype ?? (opt.value === 'log' ? DEFAULT_LOG_SUBTYPE : null);
                const disabled =
                  typePillsDisabled ||
                  (isEditingPerson &&
                    (opt.value !== 'log' ||
                      (nextSubtypeForOpt ?? DEFAULT_LOG_SUBTYPE) !== 'person'));
                const chipKey = opt.logSubtype ? `${opt.value}-${opt.logSubtype}` : opt.value;
                const chipTestId = opt.logSubtype
                  ? `type-pill-${opt.logSubtype}`
                  : `type-pill-${opt.value}`;

                return (
                  <Chip
                    key={chipKey}
                    label={opt.label}
                    selected={isSelected}
                    onPress={() => handleTypeSelect(opt.value, opt.logSubtype)}
                    testID={chipTestId}
                    disabled={disabled}
                    style={{
                      ...styles.typeChip,
                      ...chipStyle,
                      ...(disabled ? styles.typeChipDisabled : {}),
                    }}
                    textStyle={{
                      ...chipTextStyle,
                      ...(disabled ? styles.typeChipTextDisabled : {}),
                    }}
                    leadingIcon={<Icon name={opt.iconName} size="xs" color={iconColor} />}
                  />
                );
              })}
            </View>
            {/* Log subtype chips intentionally removed (selectedLogSubtype state retained for compatibility) */}
          </View>

          {/* AI mode button */}
          {mode === 'create' && (
            <View style={styles.section}>
              <Pressable
                onPress={handleAiModeToggle}
                style={[
                  styles.aiButton,
                  aiMode && {
                    backgroundColor: theme.colors.mint,
                    borderColor: theme.colors.deepTeal.DEFAULT,
                  },
                ]}
                testID="ai-mode-button"
              >
                <Icon
                  name="Sparkles"
                  size="xs"
                  color={aiMode ? theme.colors.deepTeal.DEFAULT : theme.colors.text.primary}
                  strokeWidth={2}
                />
                <Text
                  style={[
                    styles.aiButtonText,
                    { color: theme.colors.text.primary },
                    aiMode && { color: theme.colors.deepTeal.DEFAULT },
                  ]}
                >
                  Not sure? Let Gremly decide
                </Text>
              </Pressable>
            </View>
          )}

          {/* AI freeform input - Robust guard: only show in AI mode */}
          {aiMode && (
            <Animated.View
              style={[
                styles.section,
                {
                  opacity: fadeAnim,
                  transform: [
                    {
                      translateY: fadeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ marginRight: 6 }}>
                  <Icon name="Sparkles" size="xs" color={theme.colors.text.secondary} />
                </View>
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.text.secondary,
                    lineHeight: 20,
                  }}
                >
                  Not sure? Let Gremly decide
                </Text>
              </View>
              <TextInput
                value={freeformText}
                onChangeText={setFreeformText}
                placeholder="Tell me what's on your mind…"
                placeholderTextColor={theme.colors.text.tertiary}
                multiline
                numberOfLines={8}
                testID="freeform-input"
                autoFocus
                style={[
                  styles.freeformInput,
                  {
                    backgroundColor: theme.colors.white,
                    borderColor: theme.colors.border.DEFAULT,
                    color: theme.colors.text.primary,
                  },
                ]}
              />
            </Animated.View>
          )}

          {/* Structured fields - Guard logic: show skeleton while loading, then fields when ready */}
          {!aiMode &&
            selectedType &&
            (() => {
              // Guard: If in edit mode and still loading, show skeleton
              if (mode === 'edit' && hydration === 'loading') {
                return (
                  <View style={styles.fieldsContainer} testID="loading-skeleton">
                    <View style={[styles.skeletonInput, { backgroundColor: '#F3F4F6' }]} />
                    <View
                      style={[styles.skeletonInput, { backgroundColor: '#F3F4F6', marginTop: 12 }]}
                    />
                    <View
                      style={[
                        styles.skeletonInput,
                        { backgroundColor: '#F3F4F6', marginTop: 12, height: 100 },
                      ]}
                    />
                    <Text
                      style={{
                        textAlign: 'center',
                        color: theme.colors.text.tertiary,
                        marginTop: 20,
                      }}
                    >
                      Loading...
                    </Text>
                  </View>
                );
              }

              // Guard: If in edit mode and errored, show error
              if (mode === 'edit' && hydration === 'error') {
                return (
                  <View style={styles.fieldsContainer} testID="error-state">
                    <Text
                      style={{
                        textAlign: 'center',
                        color: theme.colors.error,
                        marginTop: 20,
                      }}
                    >
                      Failed to load entity. Please try again.
                    </Text>
                  </View>
                );
              }

              // Render fields only when ready (or in create mode which is always ready)
              const canRenderFields =
                mode === 'create' || (mode === 'edit' && hydration === 'ready');

              if (!canRenderFields) {
                return null;
              }

              return (
                <Animated.View
                  style={[
                    styles.fieldsContainer,
                    {
                      opacity: fadeAnim,
                      transform: [
                        {
                          translateY: fadeAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [20, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                  testID={`fields-${selectedType}`}
                >
                  {selectedType === 'habit' && (
                    <>
                      <HabitFields
                        name={habitName}
                        onNameChange={setHabitName}
                        frequency={habitFrequency}
                        onFrequencyChange={setHabitFrequency}
                        subtype={habitSubtype as 'start_habit' | 'break_habit' | 'routine' | null}
                        onSubtypeChange={setHabitSubtype}
                        disabled={false}
                        frequencyValue={habitFrequencyValue}
                        onFrequencyValueChange={setHabitFrequencyValue}
                        reminders={habitReminders}
                        onRemindersChange={setHabitReminders}
                        details={habitDetails}
                        onDetailsChange={setHabitDetails}
                        breakHabitState={habitBreakState}
                        onBreakHabitStateChange={setHabitBreakState}
                      />
                      <TagsField
                        value={tagsState}
                        onChange={handleTagsChange}
                        disabled={submitting}
                        testID="overlay-tags-field"
                        removedRef={removedTagsRef}
                      />
                    </>
                  )}
                  {selectedType === 'todo' && (
                    <>
                      <TodoFields
                        name={todoName}
                        onNameChange={setTodoName}
                        dueDate={todoDueDate}
                        onDueDateChange={setTodoDueDate}
                        dueTime={todoDueTime}
                        onDueTimeChange={setTodoDueTime}
                        details={todoDetails}
                        onDetailsChange={setTodoDetails}
                        disabled={false}
                      />
                      <TagsField
                        value={tagsState}
                        onChange={handleTagsChange}
                        disabled={submitting}
                        testID="overlay-tags-field"
                        removedRef={removedTagsRef}
                      />
                    </>
                  )}
                  {selectedType === 'log' && selectedLogSubtype === 'journal' && (
                    <>
                      <JournalFields
                        date={journalDate}
                        onDateChange={setJournalDate}
                        entry={journalEntry}
                        onEntryChange={setJournalEntry}
                        mood={journalMood}
                        onMoodChange={setJournalMood}
                        details={journalDetails}
                        onDetailsChange={setJournalDetails}
                        disabled={false}
                      />
                      <TagsField
                        value={tagsState}
                        onChange={handleTagsChange}
                        disabled={submitting}
                        testID="overlay-tags-field"
                        removedRef={removedTagsRef}
                      />
                    </>
                  )}
                  {selectedType === 'log' && selectedLogSubtype === 'person' && (
                    <>
                      <PersonFields
                        name={personName}
                        onNameChange={setPersonName}
                        details={personDetails}
                        onDetailsChange={setPersonDetails}
                        disabled={false}
                      />
                      <TagsField
                        value={tagsState}
                        onChange={handleTagsChange}
                        disabled={submitting}
                        testID="overlay-tags-field"
                        removedRef={removedTagsRef}
                      />
                    </>
                  )}
                  {selectedType === 'log' &&
                    selectedLogSubtype !== 'journal' &&
                    selectedLogSubtype !== 'person' && (
                      <>
                        <NoteFields
                          title={noteTitle}
                          onTitleChange={setNoteTitle}
                          body={noteBody}
                          onBodyChange={setNoteBody}
                          details={noteDetails}
                          onDetailsChange={setNoteDetails}
                          disabled={false}
                        />
                        <TagsField
                          value={tagsState}
                          onChange={handleTagsChange}
                          disabled={submitting}
                          testID="overlay-tags-field"
                          removedRef={removedTagsRef}
                        />
                      </>
                    )}
                  {selectedType === 'unsorted' && (
                    <>
                      <NoteFields
                        title={noteTitle}
                        onTitleChange={setNoteTitle}
                        body={noteBody}
                        onBodyChange={setNoteBody}
                        details={noteDetails}
                        onDetailsChange={setNoteDetails}
                        disabled={false}
                      />
                      <TagsField
                        value={tagsState}
                        onChange={handleTagsChange}
                        disabled={submitting}
                        testID="overlay-tags-field"
                        removedRef={removedTagsRef}
                      />
                    </>
                  )}
                  {COMMITMENTS_FEATURE_ENABLED && hydration === 'ready' && entityForCommitment && (
                    <CommitmentToggleRow
                      entity={entityForCommitment}
                      onChanged={runCommitmentsChangedCallback}
                    />
                  )}
                  {COMMITMENTS_FEATURE_ENABLED &&
                    !entityForCommitment &&
                    mode === 'edit' &&
                    hydration === 'ready' &&
                    initialEntity?.id &&
                    (selectedType === 'habit' || selectedType === 'todo') && (
                      <View>
                        <View
                          style={[
                            styles.commitmentRow,
                            { borderColor: theme.colors.border.DEFAULT },
                          ]}
                          testID="commitment-toggle-row"
                        >
                          <View style={styles.commitmentLabelContainer}>
                            <Text
                              style={[styles.commitmentLabel, { color: theme.colors.text.primary }]}
                            >
                              Commitment
                            </Text>
                            <Pressable
                              onPress={handleCommitmentNotePress}
                              disabled={commitmentNoteBusy}
                              hitSlop={8}
                              testID="commitment-note-trigger"
                            >
                              <Text
                                style={[
                                  styles.commitmentLink,
                                  {
                                    color: commitmentEnabled
                                      ? theme.colors.deepTeal.DEFAULT
                                      : theme.colors.text.tertiary,
                                    opacity: commitmentNoteBusy ? 0.4 : 1,
                                  },
                                ]}
                              >
                                {commitmentNote?.length ? 'Edit intent' : 'Add intent'}
                              </Text>
                            </Pressable>
                          </View>
                          <Switch
                            value={commitmentEnabled}
                            onValueChange={handleCommitmentToggle}
                            disabled={commitmentBusy}
                            testID="commitment-toggle"
                            trackColor={{
                              false: theme.colors.border.DEFAULT,
                              true: theme.colors.deepTeal.DEFAULT,
                            }}
                            thumbColor={
                              Platform.OS === 'android'
                                ? commitmentEnabled
                                  ? theme.colors.deepTeal.DEFAULT
                                  : '#f4f3f4'
                                : undefined
                            }
                            ios_backgroundColor={theme.colors.border.DEFAULT}
                          />
                        </View>
                        {commitmentNoteEditing && commitmentEnabled && (
                          <View
                            style={[
                              styles.commitmentNoteEditor,
                              { borderColor: theme.colors.border.DEFAULT },
                            ]}
                            testID="commitment-note-editor"
                          >
                            <TextInput
                              value={commitmentNoteDraft}
                              onChangeText={setCommitmentNoteDraft}
                              placeholder="Why is this important?"
                              placeholderTextColor={theme.colors.text.tertiary}
                              style={[
                                styles.commitmentNoteInput,
                                { color: theme.colors.text.primary },
                              ]}
                              maxLength={COMMITMENT_NOTE_LIMIT}
                              multiline
                              editable={!commitmentNoteBusy}
                              testID="commitment-note-input"
                            />
                            <View style={styles.commitmentNoteMeta}>
                              <Text
                                style={[
                                  styles.commitmentNoteCount,
                                  { color: theme.colors.text.tertiary },
                                ]}
                              >
                                {commitmentNoteDraft.length}/{COMMITMENT_NOTE_LIMIT}
                              </Text>
                            </View>
                            <View style={styles.commitmentNoteActions}>
                              <TouchableOpacity
                                onPress={handleCommitmentNoteCancel}
                                disabled={commitmentNoteBusy}
                                style={styles.commitmentAction}
                                testID="commitment-note-cancel"
                              >
                                <Text
                                  style={[
                                    styles.commitmentActionButton,
                                    { color: theme.colors.text.secondary },
                                  ]}
                                >
                                  Cancel
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={handleCommitmentNoteSave}
                                disabled={commitmentNoteBusy}
                                style={[styles.commitmentAction, styles.commitmentActionPrimary]}
                                testID="commitment-note-save"
                              >
                                <Text
                                  style={[
                                    styles.commitmentActionButton,
                                    {
                                      color: commitmentNoteBusy
                                        ? theme.colors.text.tertiary
                                        : theme.colors.deepTeal.DEFAULT,
                                    },
                                  ]}
                                >
                                  Save
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                </Animated.View>
              );
            })()}

          {/* Phase 8: Tags & People linking */}
          {(() => {
            if (aiMode || !selectedType) return null;

            const itemType = getItemType();
            if (!itemType) return null;

            const showTagEditor = usePhase8Features;
            const showPeopleLinker = allowPeopleLinking;

            if (!showTagEditor && !showPeopleLinker) return null;

            return (
              <View style={styles.relationshipsSection}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>
                  Tags & People
                </Text>
                {showTagEditor && (
                  <TagEditor
                    userId={userId || ''}
                    itemId={mode === 'edit' ? initialEntity?.id || null : null}
                    itemType={itemType}
                    currentTags={tagEditorTags}
                    allTags={phase8Links.allTags}
                    onTagsChange={(tags) => {
                      setTagEditorTags(tags);
                    }}
                    onAddTag={phase8Links.addTag}
                    onLinkTag={phase8Links.linkTag}
                    onUnlinkTag={phase8Links.unlinkTag}
                  />
                )}
                {showPeopleLinker && (
                  <PeopleLinker
                    userId={userId || ''}
                    itemId={mode === 'edit' ? initialEntity?.id || null : null}
                    itemType={itemType}
                    linkedPeople={phase8Links.linkedPeople}
                    onPeopleChange={(_people) => {
                      // People are managed by the hook; this is just for UI sync if needed
                    }}
                    onLinkPerson={phase8Links.linkPerson}
                    onUnlinkPerson={phase8Links.unlinkPerson}
                  />
                )}
              </View>
            );
          })()}

          {/* Space selector placeholder */}
          {/* TODO: Add ScopeSelector integration */}
        </ScrollView>

        {/* Validation hint */}
        {validation.hint && (
          <View style={styles.validationHint}>
            <Text style={[styles.validationHintText, { color: theme.colors.text.secondary }]}>
              {validation.hint}
            </Text>
          </View>
        )}

        {/* Cortex status */}
        {cortexStatus && (
          <View style={styles.cortexStatusHint}>
            <Text style={[styles.cortexStatusText, { color: theme.colors.text.secondary }]}>
              {cortexStatus === 'thinking' && '✨ Thinking…'}
              {cortexStatus === 'timeout' && '⏱️ AI temporarily unavailable'}
              {cortexStatus === 'busy' && '⏳ AI temporarily unavailable'}
            </Text>
          </View>
        )}

        {/* CTA bar */}
        <View style={[styles.footer, { borderTopColor: theme.colors.border.DEFAULT }]}>
          <Button
            label={thinking ? 'Thinking…' : isLoading ? 'Saving...' : 'Save to Hub'}
            onPress={handleSave}
            disabled={isSaveDisabled() || cortexInFlight || submitting || thinking}
            fullWidth
            testID="save-to-hub"
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Darker backdrop for better contrast
  },
  card: {
    backgroundColor: '#FFF9F0', // cream - will be overridden by theme
    borderTopLeftRadius: 24, // Rounded top corners
    borderTopRightRadius: 24,
    height: '80%', // Fixed height instead of maxHeight
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10, // Higher elevation for better prominence
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginLeft: 12,
  },
  headerIconButtonNoOffset: {
    marginLeft: 0,
  },
  closeButton: {
    fontSize: 26,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    minHeight: 180, // Ensure minimum height to prevent collapse
    flexGrow: 1,
  },
  section: {
    marginBottom: 20,
  },
  aiBanner: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  aiBannerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeChip: {
    minWidth: 90,
  },
  subtypeSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  subtypeLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeChipDisabled: {
    opacity: 0.6,
  },
  typeChipTextDisabled: {
    opacity: 0.6,
  },
  aiButton: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 2,
    borderColor: '#E7E2D9',
  },
  aiButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  freeformInput: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    fontSize: 16,
    minHeight: 180,
    textAlignVertical: 'top',
  },
  fieldsContainer: {
    marginTop: 12,
  },
  relationshipsSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  commitmentRow: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commitmentLabelContainer: {
    flex: 1,
  },
  commitmentLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  commitmentLink: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  commitmentNoteEditor: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  commitmentNoteInput: {
    minHeight: 80,
    fontSize: 14,
    lineHeight: 20,
  },
  commitmentNoteMeta: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  commitmentNoteCount: {
    fontSize: 12,
  },
  commitmentNoteActions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  commitmentAction: {
    paddingHorizontal: 8,
  },
  commitmentActionPrimary: {
    marginLeft: 18,
  },
  commitmentActionButton: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  skeletonInput: {
    height: 48,
    borderRadius: 12,
    opacity: 0.3,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  validationHint: {
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  validationHintText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  cortexStatusHint: {
    paddingHorizontal: 24,
    paddingVertical: 6,
  },
  cortexStatusText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
